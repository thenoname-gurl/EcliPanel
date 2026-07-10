use compact_str::ToCompactString;
use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use utoipa::ToSchema;

#[derive(ToSchema, Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[schema(rename_all = "lowercase")]
#[repr(u8)]
pub enum ServerState {
    #[default]
    Offline,
    Starting,
    Stopping,
    Running,
}

impl ServerState {
    #[inline]
    pub fn to_str(self) -> &'static str {
        match self {
            ServerState::Offline => "offline",
            ServerState::Starting => "starting",
            ServerState::Stopping => "stopping",
            ServerState::Running => "running",
        }
    }
}

pub struct ServerStateLock {
    state: tokio::sync::watch::Sender<ServerState>,
    locked: tokio::sync::Mutex<()>,
    pending_restart: AtomicBool,
    sender: tokio::sync::broadcast::Sender<super::websocket::WebsocketMessage>,
    schedule_manager: Arc<super::schedule::manager::ScheduleManager>,
}

impl ServerStateLock {
    pub fn new(
        sender: tokio::sync::broadcast::Sender<super::websocket::WebsocketMessage>,
        schedule_manager: Arc<super::schedule::manager::ScheduleManager>,
    ) -> Self {
        Self {
            state: tokio::sync::watch::Sender::new(ServerState::default()),
            locked: tokio::sync::Mutex::new(()),
            pending_restart: AtomicBool::new(false),
            sender,
            schedule_manager,
        }
    }

    #[inline]
    pub async fn set_state(&self, state: ServerState) {
        if self.get_state() == state {
            return;
        }

        self.state.send_replace(state);
        self.schedule_manager
            .execute_server_state_trigger(state)
            .await;

        self.sender
            .send(
                super::websocket::WebsocketMessage::builder(
                    super::websocket::WebsocketEvent::ServerStatus,
                )
                .arg(state.to_str())
                .build(),
            )
            .unwrap_or_default();
        if (state == ServerState::Offline || state == ServerState::Starting)
            && self.get_pending_restart()
        {
            self.set_pending_restart(false);
        }
    }

    pub fn set_pending_restart(&self, pending: bool) {
        if pending && (self.get_pending_restart() || self.get_state() == ServerState::Offline) {
            return;
        }

        self.pending_restart.store(pending, Ordering::Relaxed);
        self.sender
            .send(
                super::websocket::WebsocketMessage::builder(
                    super::websocket::WebsocketEvent::ServerPendingRestart,
                )
                .arg(pending.to_compact_string())
                .build(),
            )
            .ok();
    }

    #[inline]
    pub fn get_state(&self) -> ServerState {
        *self.state.borrow()
    }

    /// Subscribes to state transitions. A fresh receiver treats the current
    /// state as already seen, so `changed()` resolves on the next transition;
    /// call `borrow_and_update()` first if the current value must be acted on.
    #[inline]
    pub fn subscribe(&self) -> tokio::sync::watch::Receiver<ServerState> {
        self.state.subscribe()
    }

    /// Waits until the server state equals `target`, or until `timeout` elapses.
    /// Returns `true` if the target state was reached, `false` on timeout.
    pub async fn wait_for_state(&self, target: ServerState, timeout: std::time::Duration) -> bool {
        self.wait_until(|s| s == target, timeout).await
    }

    /// Waits until the server state differs from `target`, or until `timeout` elapses.
    /// Returns `true` if the state moved away from `target`, `false` on timeout.
    pub async fn wait_while_state(
        &self,
        target: ServerState,
        timeout: std::time::Duration,
    ) -> bool {
        self.wait_until(|s| s != target, timeout).await
    }

    async fn wait_until<F>(&self, predicate: F, timeout: std::time::Duration) -> bool
    where
        F: Fn(ServerState) -> bool,
    {
        let mut rx = self.subscribe();
        if predicate(*rx.borrow_and_update()) {
            return true;
        }
        let fut = async {
            loop {
                if rx.changed().await.is_err() {
                    return false;
                }
                if predicate(*rx.borrow_and_update()) {
                    return true;
                }
            }
        };
        tokio::time::timeout(timeout, fut).await.is_ok()
    }

    #[inline]
    pub fn get_pending_restart(&self) -> bool {
        self.pending_restart.load(Ordering::Relaxed)
    }

    /// Executes an action with the server state locked.
    /// If the action fails, the state is reverted to the previous state.
    /// Returns `Ok(true)` if the action was executed successfully, `Ok(false)` if the lock was not acquired,
    /// and `Err` if an error occurred during the action execution.
    /// If `aquire_timeout` is `Some`, it will wait for the specified duration to acquire the lock.
    /// If the lock is not acquired within the timeout, it returns `Ok(false)`.
    pub async fn execute_action<
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<(), anyhow::Error>>,
    >(
        &self,
        state: ServerState,
        action: F,
        aquire_timeout: Option<std::time::Duration>,
    ) -> Result<bool, anyhow::Error> {
        let old_state = self.get_state();

        let _guard = if let Some(timeout) = aquire_timeout {
            match tokio::time::timeout(timeout, self.locked.lock()).await {
                Ok(guard) => guard,
                Err(_) => return Ok(false),
            }
        } else {
            match self.locked.try_lock() {
                Ok(guard) => guard,
                Err(_) => return Ok(false),
            }
        };

        self.set_state(state).await;
        match action().await {
            Ok(()) => Ok(true),
            Err(err) => {
                tracing::error!("failed to execute power action: {:?}", err);
                self.set_state(old_state).await;
                Err(err)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::sync::Notify;

    fn lock() -> ServerStateLock {
        let state = crate::routes::AppState::mock();
        let schedule_manager = Arc::new(super::super::schedule::manager::ScheduleManager::new(
            state.config.clone(),
        ));
        let (sender, _rx) = tokio::sync::broadcast::channel(16);

        ServerStateLock::new(sender, schedule_manager)
    }

    // ServerStateLock

    #[test]
    fn state_round_trips() {
        tokio_test::block_on(async {
            let lock = lock();
            for state in [
                ServerState::Offline,
                ServerState::Starting,
                ServerState::Stopping,
                ServerState::Running,
            ] {
                lock.set_state(state).await;
                assert_eq!(lock.get_state(), state);
            }
        });
    }

    #[test]
    fn subscriber_observes_latest_state() {
        tokio_test::block_on(async {
            let lock = lock();
            let mut rx = lock.subscribe();

            lock.set_state(ServerState::Starting).await;
            lock.set_state(ServerState::Running).await;

            rx.changed().await.unwrap();
            assert_eq!(*rx.borrow_and_update(), ServerState::Running);
        });
    }

    #[test]
    fn wait_for_state_resolves_when_target_reached() {
        tokio_test::block_on(async {
            let lock = std::sync::Arc::new(lock());
            let l2 = lock.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(50)).await;
                l2.set_state(ServerState::Running).await;
            });
            assert!(
                lock.wait_for_state(ServerState::Running, Duration::from_secs(1))
                    .await
            );
            assert_eq!(lock.get_state(), ServerState::Running);
        });
    }

    #[test]
    fn wait_for_state_times_out() {
        tokio_test::block_on(async {
            let lock = lock();
            assert!(
                !lock
                    .wait_for_state(ServerState::Running, Duration::from_millis(50))
                    .await
            );
        });
    }

    #[test]
    fn wait_while_state_resolves_on_transition() {
        tokio_test::block_on(async {
            let lock = std::sync::Arc::new(lock());
            lock.set_state(ServerState::Stopping).await;
            let l2 = lock.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(50)).await;
                l2.set_state(ServerState::Offline).await;
            });
            assert!(
                lock.wait_while_state(ServerState::Stopping, Duration::from_secs(1))
                    .await
            );
            assert_eq!(lock.get_state(), ServerState::Offline);
        });
    }

    #[test]
    fn pending_restart_blocked_while_offline() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.set_pending_restart(true);
            assert!(!lock.get_pending_restart());
        });
    }

    #[test]
    fn pending_restart_set_and_cleared_while_active() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.set_state(ServerState::Running).await;
            lock.set_pending_restart(true);
            assert!(lock.get_pending_restart());
            lock.set_pending_restart(false);
            assert!(!lock.get_pending_restart());
        });
    }

    #[test]
    fn entering_offline_clears_pending_restart() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.set_state(ServerState::Running).await;
            lock.set_pending_restart(true);
            lock.set_state(ServerState::Offline).await;
            assert!(!lock.get_pending_restart());
        });
    }

    #[test]
    fn entering_starting_clears_pending_restart() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.set_state(ServerState::Running).await;
            lock.set_pending_restart(true);
            lock.set_state(ServerState::Starting).await;
            assert!(!lock.get_pending_restart());
        });
    }

    #[test]
    fn entering_stopping_keeps_pending_restart() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.set_state(ServerState::Running).await;
            lock.set_pending_restart(true);
            lock.set_state(ServerState::Stopping).await;
            assert!(lock.get_pending_restart());
        });
    }

    #[test]
    fn execute_action_runs_and_sets_state() {
        tokio_test::block_on(async {
            let lock = lock();
            let ran = Arc::new(AtomicBool::new(false));
            let out = {
                let ran = ran.clone();
                lock.execute_action(
                    ServerState::Running,
                    async || {
                        ran.store(true, Ordering::SeqCst);
                        anyhow::Ok(())
                    },
                    None,
                )
                .await
            };
            assert!(out.unwrap());
            assert!(ran.load(Ordering::SeqCst));
            assert_eq!(lock.get_state(), ServerState::Running);
        });
    }

    #[test]
    fn execute_action_reverts_state_on_error() {
        tokio_test::block_on(async {
            let lock = lock();
            let out = lock
                .execute_action(ServerState::Starting, async || anyhow::bail!("boom"), None)
                .await;
            assert!(out.is_err());
            assert_eq!(lock.get_state(), ServerState::Offline);
        });
    }

    #[test]
    fn execute_action_releases_lock_after_success() {
        tokio_test::block_on(async {
            let lock = lock();
            lock.execute_action(ServerState::Running, async || anyhow::Ok(()), None)
                .await
                .unwrap();
            let out = lock
                .execute_action(ServerState::Stopping, async || anyhow::Ok(()), None)
                .await;
            assert!(out.unwrap());
            assert_eq!(lock.get_state(), ServerState::Stopping);
        });
    }

    #[test]
    fn execute_action_releases_lock_after_error() {
        tokio_test::block_on(async {
            let lock = lock();
            let _ = lock
                .execute_action(ServerState::Starting, async || anyhow::bail!("x"), None)
                .await;
            let out = lock
                .execute_action(ServerState::Running, async || anyhow::Ok(()), None)
                .await;
            assert!(out.unwrap());
        });
    }

    #[test]
    fn execute_action_without_timeout_refuses_when_locked() {
        tokio_test::block_on(async {
            let lock = lock();
            let started = Arc::new(Notify::new());
            let release = Arc::new(Notify::new());

            let holder = {
                let started = started.clone();
                let release = release.clone();
                lock.execute_action(
                    ServerState::Running,
                    async move || {
                        started.notify_one();
                        release.notified().await;
                        anyhow::Ok(())
                    },
                    None,
                )
            };
            let contender = {
                let lock = &lock;
                let started = started.clone();
                let release = release.clone();
                async move {
                    started.notified().await;
                    let r = lock
                        .execute_action(ServerState::Stopping, async || anyhow::Ok(()), None)
                        .await;
                    release.notify_one();
                    r
                }
            };

            let (held, contended) = tokio::join!(holder, contender);
            assert!(held.unwrap());
            assert!(!contended.unwrap());
        });
    }

    #[test]
    fn execute_action_with_timeout_refuses_when_lock_stays_held() {
        tokio_test::block_on(async {
            let lock = lock();
            let started = Arc::new(Notify::new());
            let release = Arc::new(Notify::new());
            let ran = Arc::new(AtomicBool::new(false));

            let holder = {
                let started = started.clone();
                let release = release.clone();
                lock.execute_action(
                    ServerState::Running,
                    async move || {
                        started.notify_one();
                        release.notified().await;
                        anyhow::Ok(())
                    },
                    None,
                )
            };
            let contender = {
                let l = &lock;
                let started = started.clone();
                let release = release.clone();
                let ran = ran.clone();
                async move {
                    started.notified().await;
                    let r = l
                        .execute_action(
                            ServerState::Stopping,
                            async || {
                                ran.store(true, Ordering::SeqCst);
                                anyhow::Ok(())
                            },
                            Some(Duration::from_millis(150)),
                        )
                        .await;
                    release.notify_one();
                    r
                }
            };

            let (held, contended) = tokio::join!(holder, contender);
            assert!(held.unwrap());
            assert_eq!(contended.unwrap(), false);
            assert!(!ran.load(Ordering::SeqCst));
        });
    }
}
