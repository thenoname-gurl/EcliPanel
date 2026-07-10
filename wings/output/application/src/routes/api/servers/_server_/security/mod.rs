use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod connections;
mod processes;
mod scan_files;

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(processes::get::route))
        .routes(routes!(connections::get::route))
        .routes(routes!(scan_files::get::route))
        .with_state(state.clone())
}
