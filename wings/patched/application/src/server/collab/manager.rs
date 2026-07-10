use super::{CollabError, CollabParticipant, CollabSaved, CollabSyncMeta};
use crate::server::{
    activity::{Activity, ActivityEvent},
    filesystem::virtualfs::VirtualWritableFilesystem,
    websocket::{ServerWebsocketHandler, WebsocketEvent, WebsocketMessage},
};
use base64::Engine;
use compact_str::{CompactString, ToCompactString};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use yrs::{
    Doc, GetString, ReadTxn, StateVector, Text, TextRef, Transact, Update, updates::decoder::Decode,
};

const BASE64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

struct Participant {
    user_uuid: uuid::Uuid,
    user_name: CompactString,
    user_avatar: Option<String>,
    handler: Arc<ServerWebsocketHandler>,
}

struct CollabDoc {
    doc: Doc,
    text: TextRef,
    applied_update_bytes: u64,
    disk_hash: blake3::Hash,
}

impl CollabDoc {
    fn new(content: &str) -> Self {
        let doc = Doc::new();
        let text = doc.get_or_insert_text("content");

        {
            let mut txn = doc.transact_mut();
            text.insert(&mut txn, 0, content);
        }

        Self {
            doc,
            text,
            applied_update_bytes: 0,
            disk_hash: blake3::hash(content.as_bytes()),
        }
    }

    fn encode_full_state(&self) -> Vec<u8> {
        self.doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
    }

    fn content(&self) -> String {
        self.text.get_string(&self.doc.transact())
    }
}

pub struct CollabSession {
    path: CompactString,
    doc: std::sync::Mutex<CollabDoc>,
    dirty: AtomicBool,
    participants: Mutex<HashMap<uuid::Uuid, Participant>>,
    save_lock: Mutex<()>,
}

impl CollabSession {
    async fn broadcast(&self, except: Option<uuid::Uuid>, message: WebsocketMessage) {
        let handlers: Vec<Arc<ServerWebsocketHandler>> = {
            let participants = self.participants.lock().await;
            participants
                .iter()
                .filter(|(connection, _)| Some(**connection) != except)
                .map(|(_, p)| Arc::clone(&p.handler))
                .collect()
        };

        for handler in handlers {
            handler.send_message(message.clone()).await;
        }
    }

    async fn participants_message(&self) -> WebsocketMessage {
        let participants: Vec<CollabParticipant> = {
            let participants = self.participants.lock().await;
            let mut seen = HashSet::new();
            participants
                .values()
                .filter(|p| seen.insert(p.user_uuid))
                .map(|p| CollabParticipant {
                    user: p.user_uuid,
                    name: p.user_name.clone(),
                    avatar: p.user_avatar.clone(),
                })
                .collect()
        };

        WebsocketMessage::builder(WebsocketEvent::FileCollabParticipants)
            .arg(self.path.clone())
            .structured_arg(participants)
            .build()
    }
}

pub struct CollabManager {
    server: uuid::Uuid,
    config: Arc<crate::config::Config>,
    sessions: Arc<Mutex<HashMap<CompactString, Arc<CollabSession>>>>,
    connections: Mutex<HashMap<uuid::Uuid, HashSet<CompactString>>>,
    pending_updates: Mutex<HashMap<(uuid::Uuid, CompactString), Vec<u8>>>,
    pending_teardowns: Arc<Mutex<HashMap<CompactString, tokio::task::AbortHandle>>>,
}

impl CollabManager {
    pub fn new(server: uuid::Uuid, config: &Arc<crate::config::Config>) -> Self {
        Self {
            server,
            config: Arc::clone(config),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            connections: Mutex::new(HashMap::new()),
            pending_updates: Mutex::new(HashMap::new()),
            pending_teardowns: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn resolve(
        &self,
        server: &crate::server::Server,
        raw_path: &str,
    ) -> Result<(PathBuf, CompactString, Arc<dyn VirtualWritableFilesystem>), CollabError> {
        if !self.config.load().system.file_collaboration.enabled {
            return Err(CollabError::User("collaborative editing is disabled"));
        }

        let parent = Path::new(raw_path)
            .parent()
            .ok_or(CollabError::User("file has no parent"))?;
        let file_name = Path::new(raw_path)
            .file_name()
            .ok_or(CollabError::User("invalid file name"))?;

        let (root, filesystem) = server.filesystem.resolve_writable_fs(server, parent).await;
        if !filesystem.is_primary_server_fs() {
            return Err(CollabError::User(
                "collaborative editing is only available on the primary filesystem",
            ));
        }

        let path = root.join(file_name);
        if server.filesystem.is_ignored(&path, false) {
            return Err(CollabError::User("file not found"));
        }

        let key = match server.filesystem.async_canonicalize(&path).await {
            Ok(key) => key,
            Err(_) => server.filesystem.relative_path(&path),
        };

        Ok((path, key.to_string_lossy().to_compact_string(), filesystem))
    }

    async fn read_content(
        &self,
        filesystem: &Arc<dyn VirtualWritableFilesystem>,
        path: &Path,
        size_cap: u64,
    ) -> Result<String, CollabError> {
        let metadata = filesystem
            .async_metadata(&path)
            .await
            .map_err(|_| CollabError::User("file not found"))?;
        if !metadata.file_type.is_file() {
            return Err(CollabError::User("file is not a file"));
        }
        if metadata.size > size_cap {
            return Err(CollabError::User(
                "file is too large for collaborative editing",
            ));
        }

        let mut handle = filesystem
            .async_read_file(&path, None)
            .await
            .map_err(|_| CollabError::User("file not found"))?;
        if handle.size > size_cap {
            return Err(CollabError::User(
                "file is too large for collaborative editing",
            ));
        }

        let mut buf = Vec::with_capacity(handle.size as usize);
        handle
            .reader
            .read_to_end(&mut buf)
            .await
            .map_err(|err| CollabError::Internal(err.into()))?;
        if buf.len() as u64 > size_cap {
            return Err(CollabError::User(
                "file is too large for collaborative editing",
            ));
        }

        String::from_utf8(buf).map_err(|_| CollabError::User("file is not editable as text"))
    }

    pub async fn subscribe(
        &self,
        server: &crate::server::Server,
        handler: &Arc<ServerWebsocketHandler>,
        user_uuid: uuid::Uuid,
        user_name: CompactString,
        user_avatar: Option<String>,
        raw_path: &str,
    ) -> Result<(), CollabError> {
        let (path, key, filesystem) = self.resolve(server, raw_path).await?;

        let config = self.config.load();
        let size_cap = config.system.file_collaboration.file_size_cap;
        let max_sessions = config.system.file_collaboration.max_sessions_per_server as usize;
        let max_subscriptions =
            config.system.file_collaboration.max_sessions_per_connection as usize;
        drop(config);

        {
            let connections = self.connections.lock().await;
            if let Some(subscribed) = connections.get(&handler.connection_id)
                && !subscribed.contains(&key)
                && subscribed.len() >= max_subscriptions
            {
                return Err(CollabError::User(
                    "too many collaborative sessions open on this connection",
                ));
            }
        }

        if let Some(abort) = self.pending_teardowns.lock().await.remove(&key) {
            abort.abort();
        }

        let session = {
            let mut sessions = self.sessions.lock().await;

            match sessions.get(&key) {
                Some(session) => {
                    let session = Arc::clone(session);

                    if !session.dirty.load(Ordering::Relaxed) {
                        let content = self.read_content(&filesystem, &path, size_cap).await?;
                        let mut doc = session.doc.lock().expect("collab doc lock poisoned");
                        if doc.disk_hash != blake3::hash(content.as_bytes()) {
                            *doc = CollabDoc::new(&content);
                        }
                    }

                    session
                }
                None => {
                    if sessions.len() >= max_sessions {
                        return Err(CollabError::User(
                            "too many collaborative sessions open on this server",
                        ));
                    }

                    let content = self.read_content(&filesystem, &path, size_cap).await?;
                    let session = Arc::new(CollabSession {
                        path: key.clone(),
                        doc: std::sync::Mutex::new(CollabDoc::new(&content)),
                        dirty: AtomicBool::new(false),
                        participants: Mutex::new(HashMap::new()),
                        save_lock: Mutex::new(()),
                    });

                    sessions.insert(key.clone(), Arc::clone(&session));
                    tracing::debug!(
                        server = %self.server,
                        path = %key,
                        "opened collaborative editing session"
                    );

                    session
                }
            }
        };

        session.participants.lock().await.insert(
            handler.connection_id,
            Participant {
                user_uuid,
                user_name,
                user_avatar,
                handler: Arc::clone(handler),
            },
        );
        self.connections
            .lock()
            .await
            .entry(handler.connection_id)
            .or_default()
            .insert(key.clone());

        let (state, dirty) = {
            let doc = session.doc.lock().expect("collab doc lock poisoned");
            (
                doc.encode_full_state(),
                session.dirty.load(Ordering::Relaxed),
            )
        };

        handler
            .send_message(
                WebsocketMessage::builder(WebsocketEvent::FileCollabSync)
                    .arg(key)
                    .arg(BASE64.encode(state))
                    .structured_arg(CollabSyncMeta { dirty })
                    .build(),
            )
            .await;

        let participants = session.participants_message().await;
        session.broadcast(None, participants).await;

        Ok(())
    }

    async fn subscribed_session(
        &self,
        server: &crate::server::Server,
        connection_id: uuid::Uuid,
        raw_path: &str,
    ) -> Result<(CompactString, Arc<CollabSession>), CollabError> {
        let (_, key, _) = self.resolve(server, raw_path).await?;

        if !self
            .connections
            .lock()
            .await
            .get(&connection_id)
            .is_some_and(|subscribed| subscribed.contains(&key))
        {
            return Err(CollabError::User("not subscribed to this file"));
        }

        let session = self
            .sessions
            .lock()
            .await
            .get(&key)
            .map(Arc::clone)
            .ok_or(CollabError::User("not subscribed to this file"))?;

        Ok((key, session))
    }

    pub async fn apply_update(
        &self,
        server: &crate::server::Server,
        connection_id: uuid::Uuid,
        raw_path: &str,
        finished: bool,
        chunk: &str,
    ) -> Result<(), CollabError> {
        let (key, session) = self
            .subscribed_session(server, connection_id, raw_path)
            .await?;

        let size_cap = self.config.load().system.file_collaboration.file_size_cap;

        let chunk = BASE64
            .decode(chunk)
            .map_err(|_| CollabError::User("invalid update encoding"))?;

        let update = {
            let mut pending = self.pending_updates.lock().await;
            let pending_key = (connection_id, key.clone());

            match pending.get_mut(&pending_key) {
                Some(buffer) => {
                    if buffer.len() + chunk.len() > size_cap as usize {
                        pending.remove(&pending_key);
                        return Err(CollabError::User("update is too large"));
                    }
                    buffer.extend_from_slice(&chunk);

                    if !finished {
                        return Ok(());
                    }
                    pending.remove(&pending_key).unwrap_or_default()
                }
                None => {
                    if chunk.len() > size_cap as usize {
                        return Err(CollabError::User("update is too large"));
                    }
                    if !finished {
                        pending.insert(pending_key, chunk);
                        return Ok(());
                    }
                    chunk
                }
            }
        };

        let decoded =
            Update::decode_v1(&update).map_err(|_| CollabError::User("invalid update encoding"))?;

        let needs_resync = {
            let mut guard = session.doc.lock().expect("collab doc lock poisoned");

            let overflow = {
                let doc = &mut *guard;
                let mut txn = doc.doc.transact_mut();
                txn.apply_update(decoded)
                    .map_err(|_| CollabError::User("invalid update"))?;

                doc.text.len(&txn) as u64 > size_cap
            };
            session.dirty.store(true, Ordering::Relaxed);

            if overflow {
                let mut content = guard.content();
                content.truncate(size_cap as usize);
                while !content.is_char_boundary(content.len()) {
                    content.pop();
                }
                *guard = CollabDoc::new(&content);

                true
            } else {
                guard.applied_update_bytes += update.len() as u64;

                if guard.applied_update_bytes > size_cap.saturating_mul(8) {
                    let content = guard.content();
                    *guard = CollabDoc::new(&content);
                    true
                } else {
                    false
                }
            }
        };

        if needs_resync {
            session
                .broadcast(
                    None,
                    WebsocketMessage::builder(WebsocketEvent::FileCollabError)
                        .arg(key)
                        .arg("resync")
                        .build(),
                )
                .await;

            return Ok(());
        }

        session
            .broadcast(
                Some(connection_id),
                WebsocketMessage::builder(WebsocketEvent::FileCollabUpdate)
                    .arg(key)
                    .arg(BASE64.encode(&update))
                    .build(),
            )
            .await;

        Ok(())
    }

    pub async fn relay_awareness(
        &self,
        server: &crate::server::Server,
        connection_id: uuid::Uuid,
        raw_path: &str,
        payload: &str,
    ) -> Result<(), CollabError> {
        let (key, session) = self
            .subscribed_session(server, connection_id, raw_path)
            .await?;

        session
            .broadcast(
                Some(connection_id),
                WebsocketMessage::builder(WebsocketEvent::FileCollabAwareness)
                    .arg(key)
                    .arg(payload)
                    .build(),
            )
            .await;

        Ok(())
    }

    pub async fn save(
        &self,
        server: &crate::server::Server,
        connection_id: uuid::Uuid,
        user_uuid: uuid::Uuid,
        user_ip: Option<std::net::IpAddr>,
        raw_path: &str,
    ) -> Result<(), CollabError> {
        let (key, session) = self
            .subscribed_session(server, connection_id, raw_path)
            .await?;
        let (path, _, filesystem) = self.resolve(server, raw_path).await?;
        let parent = Path::new(raw_path)
            .parent()
            .ok_or(CollabError::User("file has no parent"))?;

        let _save_guard = session.save_lock.lock().await;

        let content = {
            let doc = session.doc.lock().expect("collab doc lock poisoned");
            doc.content()
        };

        let config = self.config.load();
        let history = &config.system.file_history;
        let history_enabled = history.enabled;
        let history_size_cap = history.file_size_cap;
        drop(config);

        let old_content_size = match filesystem.async_metadata(&path).await {
            Ok(metadata) if metadata.file_type.is_file() => metadata.size as i64,
            Ok(_) => return Err(CollabError::User("file is not a file")),
            Err(_) => 0,
        };

        if !server
            .filesystem
            .async_allocate_in_path(parent, content.len() as i64 - old_content_size, false)
            .await
        {
            return Err(CollabError::User("failed to allocate space"));
        }

        let captured_before: Option<Vec<u8>> = if history_enabled
            && old_content_size > 0
            && old_content_size as u64 <= history_size_cap
        {
            match filesystem.async_read_file(&path, None).await {
                Ok(mut handle) if handle.size <= history_size_cap => {
                    let mut buf = Vec::with_capacity(handle.size as usize);
                    match handle.reader.read_to_end(&mut buf).await {
                        Ok(_) if buf.len() as u64 <= history_size_cap => Some(buf),
                        _ => None,
                    }
                }
                _ => None,
            }
        } else {
            None
        };

        let mut file = filesystem.async_create_file(&path).await?;
        file.write_all(content.as_bytes())
            .await
            .map_err(|err| CollabError::Internal(anyhow::anyhow!("failed to write file: {err}")))?;
        file.shutdown()
            .await
            .map_err(|err| CollabError::Internal(anyhow::anyhow!("failed to write file: {err}")))?;

        let mut revision_id = None;
        if history_enabled && content.len() as u64 <= history_size_cap {
            match server
                .diff
                .record_edit(
                    &key,
                    captured_before,
                    content.clone().into_bytes(),
                    Some(user_uuid),
                )
                .await
            {
                Ok(id) => {
                    if id != 0 {
                        revision_id = Some(id);
                    }
                }
                Err(err) => {
                    tracing::warn!(
                        server = %self.server,
                        path = %key,
                        "collab: record_edit failed: {err:#}"
                    );
                }
            }
        }

        {
            let mut doc = session.doc.lock().expect("collab doc lock poisoned");
            doc.disk_hash = blake3::hash(content.as_bytes());
            session
                .dirty
                .store(doc.content() != content, Ordering::Relaxed);
        }

        server.activity.log_activity(Activity {
            event: ActivityEvent::FileWrite,
            user: Some(user_uuid),
            ip: user_ip,
            metadata: Some(serde_json::json!({
                "file": key,
                "revision_id": revision_id,
            })),
            schedule: None,
            timestamp: chrono::Utc::now(),
        });

        session
            .broadcast(
                None,
                WebsocketMessage::builder(WebsocketEvent::FileCollabSaved)
                    .arg(key)
                    .structured_arg(CollabSaved {
                        user: user_uuid,
                        revision_id,
                    })
                    .build(),
            )
            .await;

        Ok(())
    }

    pub async fn unsubscribe(
        &self,
        server: &crate::server::Server,
        connection_id: uuid::Uuid,
        raw_path: &str,
    ) -> Result<(), CollabError> {
        let (_, key, _) = self.resolve(server, raw_path).await?;
        self.leave(connection_id, &key).await;

        Ok(())
    }

    pub async fn disconnect(&self, connection_id: uuid::Uuid) {
        let subscribed = self.connections.lock().await.remove(&connection_id);
        self.pending_updates
            .lock()
            .await
            .retain(|(connection, _), _| *connection != connection_id);

        if let Some(subscribed) = subscribed {
            for key in subscribed {
                self.leave_session(connection_id, &key).await;
            }
        }
    }

    async fn leave(&self, connection_id: uuid::Uuid, key: &CompactString) {
        if let Some(subscribed) = self.connections.lock().await.get_mut(&connection_id) {
            subscribed.remove(key);
        }
        self.pending_updates
            .lock()
            .await
            .remove(&(connection_id, key.clone()));

        self.leave_session(connection_id, key).await;
    }

    async fn leave_session(&self, connection_id: uuid::Uuid, key: &CompactString) {
        let session = match self.sessions.lock().await.get(key) {
            Some(session) => Arc::clone(session),
            None => return,
        };

        let empty = {
            let mut participants = session.participants.lock().await;
            participants.remove(&connection_id);
            participants.is_empty()
        };

        if empty {
            self.schedule_teardown(key.clone()).await;
        } else {
            let participants = session.participants_message().await;
            session.broadcast(None, participants).await;
        }
    }

    async fn schedule_teardown(&self, key: CompactString) {
        let grace = std::time::Duration::from_secs(
            self.config
                .load()
                .system
                .file_collaboration
                .session_grace_period,
        );

        let task = tokio::spawn({
            let key = key.clone();
            let server = self.server;
            let sessions = Arc::clone(&self.sessions);
            let pending_teardowns = Arc::clone(&self.pending_teardowns);

            async move {
                tokio::time::sleep(grace).await;

                let mut sessions = sessions.lock().await;
                if let Some(session) = sessions.get(&key)
                    && session.participants.lock().await.is_empty()
                {
                    if session.dirty.load(Ordering::Relaxed) {
                        tracing::debug!(
                            server = %server,
                            path = %key,
                            "discarding unsaved collaborative editing session"
                        );
                    }
                    sessions.remove(&key);
                }

                pending_teardowns.lock().await.remove(&key);
            }
        });

        let mut pending_teardowns = self.pending_teardowns.lock().await;
        if let Some(old) = pending_teardowns.insert(key, task.abort_handle()) {
            old.abort();
        }
    }
}
