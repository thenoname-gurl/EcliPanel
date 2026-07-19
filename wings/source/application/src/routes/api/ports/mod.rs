use super::State;
use utoipa_axum::router::OpenApiRouter;

mod used;

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/used", used::router(state))
        .with_state(state.clone())
}
