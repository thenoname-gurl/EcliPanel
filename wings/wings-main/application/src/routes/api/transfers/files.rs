use super::State;
use axum::extract::DefaultBodyLimit;
use utoipa_axum::{
    router::{OpenApiRouter, UtoipaMethodRouterExt},
    routes,
};

mod post {
    use crate::{
        io::{
            compression::{CompressionType, reader::CompressionReader},
            counting_writer::CountingWriter,
            hash_reader::HashReader,
            limited_reader::LimitedReader,
        },
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
        server::transfer::TransferArchiveFormat,
    };
    use axum::{
        extract::Multipart,
        http::{HeaderMap, StatusCode},
    };
    use cap_std::fs::{Permissions, PermissionsExt};
    use futures::TryStreamExt;
    use serde::{Deserialize, Serialize};
    use sha1::Digest;
    use std::{
        io::Write,
        path::{Path, PathBuf},
        str::FromStr,
        sync::{Arc, atomic::AtomicU64},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[derive(Deserialize)]
    pub struct FileTransferJwtPayload {
        #[serde(flatten)]
        pub base: crate::remote::jwt::BasePayload,

        pub server: uuid::Uuid,
        pub root: compact_str::CompactString,

        pub destination_path: compact_str::CompactString,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = CONFLICT, body = ApiError),
    ))]
    pub async fn route(
        state: GetState,
        headers: HeaderMap,
        mut multipart: Multipart,
    ) -> ApiResponseResult {
        let key = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let (r#type, token) = match key.split_once(' ') {
            Some((t, tok)) => (t, tok),
            None => {
                return ApiResponse::error("invalid authorization header")
                    .with_status(StatusCode::UNAUTHORIZED)
                    .with_header("WWW-Authenticate", "Bearer")
                    .ok();
            }
        };

        if r#type != "Bearer" {
            return ApiResponse::error("invalid authorization header")
                .with_status(StatusCode::UNAUTHORIZED)
                .ok();
        }

        let payload: FileTransferJwtPayload = match state.config.jwt.verify(token) {
            Ok(payload) => payload,
            Err(_) => {
                return ApiResponse::error("invalid token")
                    .with_status(StatusCode::UNAUTHORIZED)
                    .ok();
            }
        };

        if !payload.base.validate(&state.config.jwt).await {
            return ApiResponse::error("invalid token")
                .with_status(StatusCode::UNAUTHORIZED)
                .ok();
        }

        let subject: uuid::Uuid = match payload.base.subject {
            Some(subject) => match subject.parse() {
                Ok(subject) => subject,
                Err(_) => {
                    return ApiResponse::error("invalid token")
                        .with_status(StatusCode::UNAUTHORIZED)
                        .ok();
                }
            },
            None => {
                return ApiResponse::error("invalid token")
                    .with_status(StatusCode::UNAUTHORIZED)
                    .ok();
            }
        };

        let server = match state.server_manager.get_server(subject).await {
            Some(server) => server,
            None => {
                return ApiResponse::error("server not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }
        };

        let total_bytes: u64 = headers
            .get("Total-Bytes")
            .map_or(Ok(0), |v| v.to_str().unwrap_or_default().parse())?;
        let root_files: Vec<compact_str::CompactString> = serde_json::from_str(
            headers
                .get("Root-Files")
                .map_or("[]", |v| v.to_str().unwrap_or("[]")),
        )?;

        let progress = Arc::new(AtomicU64::new(0));
        let total = Arc::new(AtomicU64::new(total_bytes));

        let (root, filesystem) = server
            .filesystem
            .resolve_writable_fs(&server, &payload.destination_path)
            .await;

        filesystem.async_create_dir_all(&root).await?;

        let (_, task) = server
            .filesystem
            .operations
            .add_operation(
                crate::server::filesystem::operations::FilesystemOperation::CopyRemote {
                    server: payload.server,
                    path: PathBuf::from(&payload.root),
                    files: root_files.into_iter().map(PathBuf::from).collect(),
                    destination_server: server.uuid,
                    destination_path: PathBuf::from(&payload.destination_path),
                    start_time: chrono::Utc::now(),
                    progress: progress.clone(),
                    total: total.clone(),
                },
                {
                    let runtime = tokio::runtime::Handle::current();
                    let server = server.clone();
                    let filesystem = filesystem.clone();
                    let state = state.clone();

                    async move {
                        tokio::task::spawn_blocking(move || {
                            let mut archive_checksum = None;

                            while let Some(field) = runtime.block_on(multipart.next_field())? {
                                match field.name() {
                                    Some("archive") => {
                                        let file_name = field.file_name().unwrap_or("archive.tar.gz").to_string();
                                        let reader =
                                            tokio_util::io::StreamReader::new(field.into_stream().map_err(|err| {
                                                std::io::Error::other(format!("failed to read multipart field: {err}"))
                                            }));
                                        let reader = tokio_util::io::SyncIoBridge::new(reader);
                                        let reader = LimitedReader::new_with_bytes_per_second(
                                            reader,
                                            state.config.system.transfers.download_limit.as_bytes(),
                                        );
                                        let reader = HashReader::new_with_hasher(reader, sha2::Sha256::new());
                                        let reader = CompressionReader::new(
                                            reader,
                                            TransferArchiveFormat::from_str(&file_name)
                                                .map_or(CompressionType::Gz, |f| f.compression_format()),
                                        )?;

                                        let mut archive = tar::Archive::new(reader);
                                        archive.set_ignore_zeros(true);
                                        let mut entries = archive.entries()?;

                                        let mut read_buffer = vec![0; crate::BUFFER_SIZE];
                                        while let Some(Ok(mut entry)) = entries.next() {
                                            let path = entry.path()?;

                                            if path.is_absolute() {
                                                continue;
                                            }

                                            let destination_path = Path::new(&payload.destination_path).join(&path);
                                            let header = entry.header();

                                            if filesystem.is_primary_server_fs() && server.filesystem.is_ignored_sync(&destination_path, header.entry_type() == tar::EntryType::Directory) {
                                                continue;
                                            }

                                            match header.entry_type() {
                                                tar::EntryType::Directory => {
                                                    filesystem.create_dir_all(&destination_path)?;
                                                    if let Ok(permissions) =
                                                        header.mode().map(Permissions::from_mode)
                                                    {
                                                        filesystem.set_permissions(
                                                            &destination_path,
                                                            permissions,
                                                        )?;
                                                    }
                                                }
                                                tar::EntryType::Regular => {
                                                    if let Some(parent) = destination_path.parent() {
                                                        filesystem.create_dir_all(&parent)?;
                                                    }

                                                    let writer = filesystem.create_file(&destination_path)?;
                                                    let mut writer = CountingWriter::new_with_bytes_written(
                                                        writer,
                                                        progress.clone()
                                                    );

                                                    crate::io::copy_shared(
                                                        &mut read_buffer,
                                                        &mut entry,
                                                        &mut writer,
                                                    )?;
                                                    writer.flush()?;
                                                }
                                                tar::EntryType::Symlink => {
                                                    let link = entry
                                                        .link_name()
                                                        .unwrap_or_default()
                                                        .unwrap_or_default();

                                                    if let Err(err) =
                                                        filesystem.create_symlink(&link, &destination_path)
                                                    {
                                                        tracing::debug!(
                                                            path = %destination_path.display(),
                                                            "failed to create symlink from archive: {:#?}",
                                                            err
                                                        );
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }

                                        let mut inner = archive.into_inner().into_inner();
                                        crate::io::copy_shared(
                                            &mut read_buffer,
                                            &mut inner,
                                            &mut std::io::sink(),
                                        )?;
                                        archive_checksum = Some(inner.finish());
                                    }
                                    Some("checksum") => {
                                        let archive_checksum = match archive_checksum.take() {
                                            Some(checksum) => format!("{:x}", checksum),
                                            None => {
                                                return Err(anyhow::anyhow!(
                                                    "archive checksum does not match multipart checksum, None to be found"
                                                ));
                                            }
                                        };

                                        let checksum = runtime.block_on(field.text())?;

                                        if archive_checksum != checksum {
                                            return Err(anyhow::anyhow!(
                                                "archive checksum does not match multipart checksum, {checksum} != {archive_checksum}"
                                            ));
                                        }
                                    }
                                    _ => {}
                                }
                            }

                            Ok(())
                        }).await?
                    }
                },
            )
            .await;

        match task.await {
            Ok(Some(Ok(()))) => {}
            Ok(None) => {
                return ApiResponse::error("file transfer aborted")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
            Ok(Some(Err(err))) => {
                tracing::error!(
                    server = %server.uuid,
                    "server file transfer failed: {:#?}",
                    err,
                );

                return ApiResponse::error("file transfer failed")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
            Err(err) => {
                tracing::error!(
                    server = %server.uuid,
                    "server file transfer failed: {:#?}",
                    err,
                );

                return ApiResponse::error("file transfer failed")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
        }

        ApiResponse::new_serialized(Response {}).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route).layer(DefaultBodyLimit::disable()))
        .with_state(state.clone())
}
