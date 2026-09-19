use crate::config::{CacheStrategy, StaticFiles};
use crate::proto::Method;
use bytes::Bytes;
use moka::future::Cache;
use std::io::Write;
use std::os::unix::io::AsRawFd as _;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

pub type RespCache = Arc<Cache<String, Arc<RawResponse>>>;

const SMALL_FILE: u64 = 65_536;
const CACHE_MAX: u64 = 50_000;
const TTL_BODY: u64 = 120;

pub enum Served {
    Full(Bytes),
    Sendfile { headers: Bytes, path: PathBuf, size: u64 },
}

impl Served {
    pub fn into_bytes(self) -> Bytes {
        match self {
            Served::Full(b) => b,
            Served::Sendfile { headers, path, .. } => {
                let body = std::fs::read(&path).unwrap_or_default();
                let mut buf = headers.to_vec();
                buf.extend_from_slice(&body);
                Bytes::from(buf)
            }
        }
    }
}

#[derive(Clone)]
pub struct RawResponse {
    pub get_bytes: Bytes,
    pub head_bytes: Bytes,
    pub mtime: u64,
}

pub fn build_resp_cache() -> RespCache {
    Arc::new(
        Cache::builder()
            .max_capacity(CACHE_MAX)
            .time_to_live(Duration::from_secs(TTL_BODY))
            .build(),
    )
}

pub async fn serve_raw(
    path: &str,
    cfg: &StaticFiles,
    method: Method,
    resp: &RespCache,
) -> anyhow::Result<Option<Served>> {
    let (key, real) = match resolve(path, cfg) {
        Some(v) => v,
        None => return Ok(None),
    };

    match cfg.cache_strategy {
        CacheStrategy::None => serve_direct(real, method, cfg).await,
        CacheStrategy::Ttl => serve_ttl(key, real, method, cfg, resp).await,
        CacheStrategy::Mtime => serve_mtime(key, real, method, cfg, resp).await,
        CacheStrategy::Smart => serve_smart(key, real, method, cfg, resp).await,
    }
}

async fn serve_ttl(
    key: String,
    real: PathBuf,
    m: Method,
    cfg: &StaticFiles,
    resp: &RespCache,
) -> anyhow::Result<Option<Served>> {
    if let Some(entry) = resp.get(&key).await {
        return Ok(Some(Served::Full(pick(&entry, m))));
    }
    let entry = build_response(&real, cfg).await?;
    let b = pick(&entry, m);
    resp.insert(key, Arc::new(entry)).await;
    Ok(Some(Served::Full(b)))
}

async fn serve_mtime(
    key: String,
    real: PathBuf,
    m: Method,
    cfg: &StaticFiles,
    resp: &RespCache,
) -> anyhow::Result<Option<Served>> {
    let cur_mtime = file_mtime(&real)?;

    if let Some(entry) = resp.get(&key).await {
        if entry.mtime == cur_mtime {
            return Ok(Some(Served::Full(pick(&entry, m))));
        }
        resp.invalidate(&key).await;
    }

    let entry = build_response(&real, cfg).await?;
    let b = pick(&entry, m);
    resp.insert(key.clone(), Arc::new(entry)).await;
    Ok(Some(Served::Full(b)))
}

async fn serve_smart(
    key: String,
    real: PathBuf,
    m: Method,
    cfg: &StaticFiles,
    resp: &RespCache,
) -> anyhow::Result<Option<Served>> {
    let size = file_size(&real)?;
    if size > SMALL_FILE {
        return serve_direct(real, m, cfg).await;
    }
    serve_ttl(key, real, m, cfg, resp).await
}

async fn serve_direct(
    real: PathBuf,
    m: Method,
    cfg: &StaticFiles,
) -> anyhow::Result<Option<Served>> {
    let meta = match std::fs::metadata(&real) {
        Ok(m) if m.is_file() => m,
        _ => return Ok(None),
    };
    let size = meta.len();
    let mtime = mtime_secs(&meta);
    let etag = make_etag(size, mtime);
    let mime = mime_for(&real);
    let cc = format!("public, max-age={}", cfg.max_age);

    if m == Method::Head {
        let h = build_head_bytes(200, size, &etag, &mime, &cc);
        return Ok(Some(Served::Full(h)));
    }

    if size > SMALL_FILE {
        let headers = build_head_bytes(200, size, &etag, &mime, &cc);
        Ok(Some(Served::Sendfile { headers, path: real, size }))
    } else {
        let body = tokio::fs::read(&real).await?;
        Ok(Some(Served::Full(build_get_bytes(size, &etag, &mime, &cc, &body))))
    }
}

async fn build_response(real: &PathBuf, cfg: &StaticFiles) -> anyhow::Result<RawResponse> {
    let meta = std::fs::metadata(real)?;
    if !meta.is_file() {
        return Err(anyhow::anyhow!("not a file"));
    }
    let size = meta.len();
    let mtime = mtime_secs(&meta);
    let etag = make_etag(size, mtime);
    let mime = mime_for(real);
    let cc = format!("public, max-age={}", cfg.max_age);

    let body = if size <= SMALL_FILE {
        tokio::fs::read(real).await?
    } else {
        tokio::task::spawn_blocking({
            let r = real.clone();
            move || std::fs::read(&r)
        })
        .await??
    };

    let get_bytes = build_get_bytes(size, &etag, &mime, &cc, &body);
    let head_bytes = build_head_bytes(200, size, &etag, &mime, &cc);

    Ok(RawResponse {
        get_bytes,
        head_bytes,
        mtime,
    })
}

fn build_get_bytes(size: u64, etag: &str, mime: &str, cc: &str, body: &[u8]) -> Bytes {
    let mut buf = Vec::with_capacity(256 + body.len());
    let _ = write!(buf, "\
         HTTP/1.1 200 OK\r\n\
         content-type: {mime}\r\n\
         content-length: {size}\r\n\
         etag: {etag}\r\n\
         cache-control: {cc}\r\n\
         accept-ranges: bytes\r\n\
         alt-svc: h3=\":443\"; ma=86400\r\n\
         \r\n");
    buf.extend_from_slice(body);
    Bytes::from(buf)
}

fn build_head_bytes(status: u16, size: u64, etag: &str, mime: &str, cc: &str) -> Bytes {
    let mut buf = Vec::with_capacity(256);
    let _ = write!(buf, "\
         HTTP/1.1 {status} OK\r\n\
         content-type: {mime}\r\n\
         content-length: {size}\r\n\
         etag: {etag}\r\n\
         cache-control: {cc}\r\n\
         alt-svc: h3=\":443\"; ma=86400\r\n\
         \r\n");
    Bytes::from(buf)
}

fn pick(entry: &RawResponse, m: Method) -> Bytes {
    match m {
        Method::Head => entry.head_bytes.clone(),
        _ => entry.get_bytes.clone(),
    }
}

fn resolve(path: &str, cfg: &StaticFiles) -> Option<(String, PathBuf)> {
    let no_query = path.split('?').next().unwrap_or(path);
    let decoded = percent_decode(no_query);
    if decoded.contains("..") {
        return None;
    }

    let mut fs_path = PathBuf::from(&cfg.root);
    let rel = decoded.trim_start_matches('/');
    if rel.is_empty() || rel.ends_with('/') {
        fs_path.push(rel);
        fs_path.push(&cfg.index);
    } else {
        fs_path.push(rel);
    }

    let root = std::fs::canonicalize(&cfg.root).unwrap_or_else(|_| PathBuf::from(&cfg.root));
    let real = std::fs::canonicalize(&fs_path).ok()?;
    if !real.starts_with(&root) {
        return None;
    }

    Some((real.to_string_lossy().into_owned(), real))
}

fn file_mtime(p: &PathBuf) -> anyhow::Result<u64> {
    Ok(mtime_secs(&std::fs::metadata(p)?))
}

fn file_size(p: &PathBuf) -> anyhow::Result<u64> {
    Ok(std::fs::metadata(p)?.len())
}

fn mtime_secs(m: &std::fs::Metadata) -> u64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn make_etag(size: u64, mtime: u64) -> String {
    format!("\"{size:x}-{mtime:x}\"")
}

fn mime_for(p: &PathBuf) -> String {
    mime_guess::from_path(p)
        .first_or_octet_stream()
        .essence_str()
        .to_owned()
}

#[cfg(target_os = "linux")]
pub fn spawn_sendfile(
    out_fd: std::os::unix::io::RawFd,
    path: std::path::PathBuf,
    size: u64,
) -> tokio::task::JoinHandle<std::io::Result<()>> {
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&path)?;
        let in_fd = file.as_raw_fd();
        let mut offset: i64 = 0;
        let mut remaining = size as usize;

        while remaining > 0 {
            let n = unsafe {
                libc::sendfile64(
                    out_fd,
                    in_fd,
                    &mut offset as *mut i64,
                    remaining,
                )
            };
            if n < 0 {
                return Err(std::io::Error::last_os_error());
            }
            if n == 0 {
                break;
            }
            remaining -= n as usize;
        }
        Ok(())
    })
}

fn percent_decode(s: &str) -> String {
    percent_encoding::percent_decode_str(s)
        .decode_utf8_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_cfg() -> (tempfile::TempDir, StaticFiles) {
        let dir = tempfile::Builder::new()
            .prefix(&format!("halo-sf-{}", COUNTER.fetch_add(1, Ordering::Relaxed)))
            .tempdir()
            .unwrap();
        fs::write(dir.path().join("index.html"), b"<h1>home</h1>").unwrap();
        fs::create_dir(dir.path().join("blog")).unwrap();
        fs::write(dir.path().join("blog/post.html"), b"<h1>post</h1>").unwrap();
        let cfg = StaticFiles {
            root: dir.path().to_string_lossy().into_owned(),
            index: "index.html".to_owned(),
            precompressed: false,
            max_age: 3600,
            cache_enabled: true,
            cache_strategy: CacheStrategy::None,
        };
        (dir, cfg)
    }

    #[test]
    fn query_string_resolves_to_same_file() {
        let (_d, cfg) = temp_cfg();
        let plain = resolve("/", &cfg).unwrap();
        let with_query = resolve("/?utm=test", &cfg).unwrap();
        assert_eq!(plain, with_query, "query string must not change resolution");

        let post = resolve("/blog/post.html", &cfg).unwrap();
        let post_query = resolve("/blog/post.html?utm=test&ref=fb", &cfg).unwrap();
        assert_eq!(post, post_query);
    }

    #[test]
    fn percent_encoded_query_still_strips() {
        let (_d, cfg) = temp_cfg();
        let with_encoded = resolve("/?utm%3Dtest", &cfg).unwrap();
        assert_eq!(with_encoded.1.file_name().unwrap().to_str().unwrap(), "index.html");
    }

    #[test]
    fn traversal_in_query_ignored() {
        let (_d, cfg) = temp_cfg();
        let raw = resolve("/?../../etc/passwd", &cfg).unwrap();
        assert_eq!(raw.1.file_name().unwrap().to_str().unwrap(), "index.html");
        let post = resolve("/blog/post.html?..%2f..%2fetc%2fpasswd", &cfg).unwrap();
        assert_eq!(post.1.file_name().unwrap().to_str().unwrap(), "post.html");
    }

    #[test]
    fn missing_file_still_returns_none() {
        let (_d, cfg) = temp_cfg();
        assert!(resolve("/nope", &cfg).is_none());
        assert!(resolve("/nope?utm=test", &cfg).is_none());
    }
}

pub fn spawn_prewarm(cfg: StaticFiles, cache: RespCache) {
    tokio::spawn(async move {
        let root = match std::fs::canonicalize(&cfg.root) {
            Ok(r) => r,
            Err(_) => return,
        };
        let mut n = 0u64;
        if let Err(e) = prewarm_dir(&root, &root, &cfg, &cache, &mut n).await {
            tracing::warn!("prewarm: {e}");
        }
        tracing::info!(files = n, root = %cfg.root, "cache pre-warmed");
    });
}

fn prewarm_dir<'a>(
    root: &'a std::path::Path,
    dir: &'a std::path::Path,
    cfg: &'a StaticFiles,
    cache: &'a RespCache,
    n: &'a mut u64,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + 'a>> {
    Box::pin(async move {
        let mut rd = tokio::fs::read_dir(dir).await?;
        while let Some(e) = rd.next_entry().await? {
            let p = e.path();
            if p.is_dir() {
                prewarm_dir(root, &p, cfg, cache, n).await?;
            } else if p.is_file() {
                let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(u64::MAX);
                if size > SMALL_FILE {
                    continue;
                }
                let key = p.to_string_lossy().into_owned();
                if let Ok(entry) = build_response(&p, cfg).await {
                    cache.insert(key, Arc::new(entry)).await;
                    *n += 1;
                }
            }
        }
        Ok(())
    })
}