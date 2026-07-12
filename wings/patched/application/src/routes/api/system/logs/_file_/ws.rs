use super::State;
use crate::{io::SafeSliceMutExt, routes::GetState};
use axum::{
    body::Bytes,
    extract::{Path, Query, WebSocketUpgrade, ws::Message},
    response::Response,
    routing::any,
};
use serde::Deserialize;
use std::{io::SeekFrom, pin::Pin, sync::Arc};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use utoipa_axum::router::OpenApiRouter;

#[derive(Deserialize)]
pub struct Params {
    lines: Option<usize>,
}

pub async fn handle_ws(
    ws: WebSocketUpgrade,
    state: GetState,
    Path(file_path): Path<compact_str::CompactString>,
    Query(params): Query<Params>,
) -> Response {
    ws.on_upgrade(move |socket| async move {
        if file_path.contains("..") {
            return;
        }

        let mut file = match tokio::fs::File::open(
            std::path::Path::new(&state.config.load().system.log_directory).join(&file_path),
        )
        .await
        {
            Ok(file) => file,
            Err(_) => return,
        };

        let mut pos = match params.lines {
            Some(lines) => match crate::io::tail::async_tail(file, lines).await {
                Ok(tailed) => {
                    file = tailed;
                    match file.stream_position().await {
                        Ok(pos) => pos,
                        Err(_) => return,
                    }
                }
                Err(_) => return,
            },
            None => 0,
        };

        let socket = Arc::new(tokio::sync::Mutex::new(socket));

        type ReturnType = dyn Future<Output = Result<(), anyhow::Error>> + Send;
        let futures: [Pin<Box<ReturnType>>; 2] = [
            // Log Line Follower
            Box::pin({
                let socket = Arc::clone(&socket);

                async move {
                    const MAX_LINE_SIZE: usize = 1024;

                    let mut buf = vec![0; crate::BUFFER_SIZE];
                    let mut pending = Vec::new();

                    loop {
                        let len = file.seek(SeekFrom::End(0)).await?;
                        if len < pos {
                            pos = 0;
                            pending.clear();
                        }

                        while pos < len {
                            let to_read =
                                std::cmp::min(len - pos, crate::BUFFER_SIZE as u64) as usize;
                            file.seek(SeekFrom::Start(pos)).await?;

                            let chunk = buf.get_slice_mut(..to_read)?;
                            file.read_exact(chunk).await?;
                            pos += to_read as u64;
                            pending.extend_from_slice(chunk);

                            loop {
                                let take = match pending.iter().position(|&b| b == b'\n') {
                                    Some(idx) => idx + 1,
                                    None if pending.len() >= MAX_LINE_SIZE => MAX_LINE_SIZE,
                                    None => break,
                                };

                                let line: Vec<_> = pending.drain(..take).collect();
                                let text = String::from_utf8_lossy(&line)
                                    .trim_end_matches(['\n', '\r'])
                                    .to_string();

                                socket.lock().await.send(Message::Text(text.into())).await?;
                            }
                        }

                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }),
            // Pinger
            Box::pin(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;

                    socket
                        .lock()
                        .await
                        .send(Message::Ping(Bytes::from_static(&[1, 2, 3])))
                        .await?;
                }
            }),
        ];

        if let Err(err) = futures::future::try_join_all(futures).await {
            tracing::debug!("error while serving log websocket: {:?}", err);
        }
    })
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .route("/", any(handle_ws))
        .with_state(state.clone())
}
