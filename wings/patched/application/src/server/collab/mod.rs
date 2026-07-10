use serde::Serialize;

pub mod manager;

pub enum CollabError {
    User(&'static str),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for CollabError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err)
    }
}

#[derive(Serialize)]
pub struct CollabParticipant {
    pub user: uuid::Uuid,
    pub name: compact_str::CompactString,
    pub avatar: Option<String>,
}

#[derive(Serialize)]
pub struct CollabSyncMeta {
    pub dirty: bool,
}

#[derive(Serialize)]
pub struct CollabSaved {
    pub user: uuid::Uuid,
    pub revision_id: Option<i64>,
}
