use serde::Serialize;
use utoipa::ToSchema;

pub mod manager;
pub mod storage;

#[derive(ToSchema, Debug, Clone, Serialize)]
pub struct RevisionInfo {
    pub id: i64,
    pub size: u64,
    pub stored_size: u64,
    pub user: Option<uuid::Uuid>,
    pub is_snapshot: bool,
    pub created: chrono::DateTime<chrono::Utc>,
}

impl From<storage::RevisionRow> for RevisionInfo {
    fn from(r: storage::RevisionRow) -> Self {
        Self {
            id: r.id,
            created: chrono::DateTime::from_timestamp_millis(r.created_ms)
                .unwrap_or_else(chrono::Utc::now),
            size: r.size,
            stored_size: r.stored_size,
            user: r.user,
            is_snapshot: r.base_id.is_none(),
        }
    }
}
