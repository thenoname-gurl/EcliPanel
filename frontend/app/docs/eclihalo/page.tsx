"use client"
import { Md } from "../_components/md";

const content = `
![EcliHalo](https://github.com/thenoname-gurl/EcliPanel/blob/main/halo/eclihalo.png?raw=true)

# EcliHalo - Reverse Proxy

EcliHalo is EcliPanels purpose built reverse proxy. It replaces nginx with a
single static binary that handles HTTP/1.1, HTTP/2, HTTP/3, TLS termination,
static file serving, load balancing, WebSocket tunnelling, and gRPC proxying
all with hot-reload via SIGHUP. 

It is designed for high performance and low latency, with a focus on simplicity and ease of use.

## Benchmark
This benchmark compares EcliHalo to Nginx.

You can view how benchmark works here: https://github.com/thenoname-gurl/EcliPanel/blob/main/halo/bench.sh

Anyways here are results, we can see up to 106% improvement in some fields comparing to nginx, higher rps = better.

![Benchmark Results](https://github.com/thenoname-gurl/EcliPanel/blob/main/halo/chart.png?raw=true)


## Quick Start

\`\`\`bash
cp target/release/eclihalo /usr/local/bin/
mkdir -p /etc/eclihalo
eclihalo systemd > /etc/systemd/system/eclihalo.service
systemctl enable --now eclihalo
\`\`\`

## Binary Commands

| Command | What it does |
|---|---|
| \`eclihalo start --config /etc/eclihalo/config.yml\` | Start the proxy |
| \`eclihalo reload\` | Hot reload config |
| \`eclihalo version\` | Print version |
| \`eclihalo systemd\` | Print systemd unit file |

## Config File

EcliHalo is configured via a single YAML file. Every nginx-equivalent directive
is represented. The full reference config lives at
\`/etc/eclihalo/config.example.yml\`.

### Minimal Config

\`\`\`yaml
http:
  port: 80
https:
  port: 443
tls:
  mode: self_signed
  hostname: localhost
routes:
  - domain: localhost
    upstreams:
      - 127.0.0.1:3000
\`\`\`

### Performance Tuning

\`\`\`yaml
performance:
  worker_threads: 8        # Default: all CPU cores
  accept_backlog: 65536    # TCP backlog per listener
  accept_batch: 256        # Multi-accept burst size
  cpu_affinity: true       # Pin workers to cores
  event_interval: 10       # Tokio poll interval (ms)
  global_queue_interval: 61
  thread_stack_size: 2097152
\`\`\`

| Setting | nginx equivalent | Notes |
|---|---|---|
| \`worker_threads\` | \`worker_processes auto\` | Number of tokio worker threads |
| \`accept_backlog\` | \`worker_connections\` + \`somaxconn\` | TCP listen backlog |
| \`accept_batch\` | \`multi_accept on\` | Connections drained per epoll wake |
| \`cpu_affinity\` | \`worker_cpu_affinity auto\` | Pin worker to CPU core |
| \`event_interval\` | N/A | Tokio poll interval, lower = less latency |
| \`global_queue_interval\` | N/A | High values disable work-stealing |

### TLS Modes

Three TLS modes are supported:

| Mode | Use case |
|---|---|
| \`provided\` | You supply cert + key PEM files |
| \`lets_encrypt\` | Auto-issue via ACME (Lets Encrypt) |
| \`self_signed\` | Dev/internal, auto-generated |

\`\`\`yaml
# Production with Let's Encrypt
tls:
  mode: lets_encrypt
  acme_email: admin@ecli.app
  acme_domains:
    - ecli.app
    - backend.ecli.app
  acme_cache_dir: /var/lib/eclihalo/acme
\`\`\`

### Per-Domain TLS (SNI)

Each route can override the global TLS cert. The proxy selects the right cert
based on the SNI hostname in the TLS ClientHello.

\`\`\`yaml
routes:
  - domain: cdn.ecli.app
    tls:
      cert_path: /etc/ssl/certs/cdn.ecli.app/fullchain.pem
      key_path: /etc/ssl/private/cdn.ecli.app/privkey.pem
    upstreams: []
    static_files:
      root: /var/www/cdn
\`\`\`

### Load Balancing

Four strategies available per route:

| Strategy | Best for |
|---|---|
| \`round_robin\` | Stateless APIs with similar capacity backends |
| \`least_connections\` | Long-lived connections, gRPC, mixed workloads |
| \`ip_hash\` | Sticky sessions, WebSocket |
| \`random\` | Uniform distribution at very high concurrency |

### Header Manipulation

\`\`\`yaml
header_rules:
  set_request:           # Inject into upstream request
    x-api-version: "v2"
  remove_request:        # Strip from upstream request
    - cookie
  set_response:          # Inject into client response
    strict-transport-security: "max-age=31536000"
    x-content-type-options: "nosniff"
  remove_response:       # Strip from client response
    - server
    - x-powered-by
\`\`\`

### Path Rewrites

Regex-based path rewriting, applied before proxying. Equivalent to nginx's
\`rewrite\` directive.

\`\`\`yaml
rewrites:
  "^/api/v1/(.*)": "/api/v2/$1"
  "^/old-blog/(.*)": "/blog/$1"
\`\`\`

### Response Caching (proxy_cache)

Caches GET and HEAD responses from upstream. Cache key is \`method:path\`.
Uses an in-memory cache per worker with configurable TTL.

\`\`\`yaml
proxy_cache:
  enabled: true
  ttl_secs: 30
  # max_size_bytes: 104857600   # default 100 MiB
\`\`\`

### Static Files

Static file serving with four cache strategies, sendfile zero-copy for files
over 64 KiB, and optional precompressed (.gz/.br) serving.

\`\`\`yaml
static_files:
  root: /var/www/cdn
  index: index.html
  max_age: 31536000
  cache_strategy: smart   # smart | ttl | mtime | none
  cache_enabled: true
  precompressed: true
\`\`\`

| Strategy | Behaviour |
|---|---|
| \`smart\` | Cache small files (≤64 KiB), sendfile large files |
| \`ttl\` | Cache with time-to-live (default 120s) |
| \`mtime\` | Cache until file modification time changes |
| \`none\` | Never cache, always read from disk |

### Custom Error Pages

nginx \`error_page\` equivalent. Map HTTP status codes to local HTML files.

\`\`\`yaml
error_pages:
  404: /var/www/errors/404.html
  502: /var/www/errors/502.html
  503: /var/www/errors/503.html
\`\`\`

### Response Rewriting

\`\`\`yaml
# Rewrite Location headers from upstream
proxy_redirect:
  "http://127.0.0.1:3000": "https://ecli.app"

# Text substitution in response bodies
sub_filter:
  "http://127.0.0.1:3000": "https://ecli.app"
\`\`\`

### WebSocket & gRPC

\`\`\`yaml
# WebSocket tunnelling
routes:
  - domain: ws.ecli.app
    websocket: true
    strategy: ip_hash       # sticky sessions
    upstream_timeout_secs: 300
    upstreams:
      - 127.0.0.1:8080

# gRPC (HTTP/2 upstream, trailer forwarding)
  - domain: grpc.ecli.app
    grpc: true
    strategy: least_connections
    upstream_timeout_secs: 120
    upstreams:
      - 127.0.0.1:50051
\`\`\`

### WebRTC Signalling

CORS headers are auto-injected when \`webrtc.cors: true\` is set, no manual
header configuration needed.

\`\`\`yaml
routes:
  - domain: rtc.ecli.app
    webrtc:
      cors: true
      signalling_paths: [/offer, /answer, /ice]
    upstreams:
      - 127.0.0.1:9090
\`\`\`

### Retry Policies

\`\`\`yaml
retry:
  tries: 2
  timeout_secs: 5
\`\`\`

## Architecture

EcliHalo uses a **shared-nothing, thread-per-core** architecture. Each CPU core
runs its own independent proxy loop with zero cross-core synchronisation. No shared connection pools, no shared caches, no lock contention.

\`\`\`
  Core 0          Core 1          ...          Core N
  ┌─────────┐    ┌─────────┐                  ┌─────────┐
  │ SO_REUSE│    │ SO_REUSE│                  │ SO_REUSE│
  │  PORT   │    │  PORT   │                  │  PORT   │
  ├─────────┤    ├─────────┤                  ├─────────┤
  │ Upstream│    │ Upstream│                  │ Upstream│
  │  Pool   │    │  Pool   │                  │  Pool   │
  ├─────────┤    ├─────────┤                  ├─────────┤
  │ Static  │    │ Static  │                  │ Static  │
  │  Cache  │    │  Cache  │                  │  Cache  │
  └─────────┘    └─────────┘                  └─────────┘
\`\`\`

**Per-core ownership** means that every core has its own TCP listener (via
\`SO_REUSEPORT\`), its own lock-free upstream connection pool
(\`crossbeam::SegQueue\`), and its own in-memory static file cache. No
\`Arc<Mutex<...>>\` across cores. This is nginx's worker model but without
the \`accept_mutex\` because \`SO_REUSEPORT\` distributes connections at the
kernel level.

**Lock-free connection pool** meaning that upstream connections are stored per backend
address in a \`SegQueue\` a true lock-free MPSC queue. \`try_get()\` pops
without any atomic compare-and-swap loop. This matters at 100k+ RPS where even
sharded \`DashMap\` contention becomes visible.

**kTLS (Kernel TLS)** means that after the TLS handshake, encryption keys are pushed
into the Linux kernel via \`TCP_ULP tls\`. From that point, every
\`read()\`/\`write()\`/\`sendfile()\` on the raw socket is transparently
encrypted or decrypted by the kernel with **zero userspace crypto per request**.
nginx can do this too with \`ssl_conf_command Options KTLS;\` but it's off by
default and rarely configured.

## Why EcliHalo Is Faster Than nginx

The benchmark on an 8-core VM running with AMD EPYC 7763 shows EcliHalo beating nginx by
**74% to 106% at high concurrency** (c=200) and by **6% to 13% on static files**.

### 1. No accept mutex bottleneck

nginx's \`accept_mutex\` serialises connection acceptance across workers. Even
with \`accept_mutex off\`, the epoll-based model wakes one worker per
readiness edge. EcliHalo uses \`SO_REUSEPORT\`, which lets the kernel distribute
connections to cores at the TCP handshake level. Each core drains up to 256
connections per wakeup. At c=200, nginx's workers contend for accepts while
EcliHalo's don't.

### 2. Async runtime tuned for I/O

nginx uses a custom event loop (\`epoll\` + non-blocking I/O). This is
extremely efficient but single-threaded per worker, meaning one connection blocks the
loop. EcliHalo uses tokio's multi-threaded runtime with per-connection
\`tokio::spawn\`, meaning slow clients never block fast ones. The
\`try_write\`/\`try_read_buf\` fast paths skip the async scheduler entirely
when data is already buffered, matching nginx's non-blocking efficiency
without the head-of-line blocking risk.

### 3. Per-core connection pools

nginx shares upstream keepalive connections across all workers (or uses
per-worker pools with limited reuse). EcliHalo gives each core its own
connection pool with zero cross-core atomics. Under high concurrency, this
eliminates the contention that slows nginx's shared pool.

### 4. kTLS eliminates TLS overhead

nginx does TLS in userspace by default. EcliHalo offloads it to the kernel
after the handshake. For static files over HTTPS, \`sendfile()\` works through
kTLS, where the kernel reads from disk, encrypts, and sends in one operation. No
userspace copies at all.

### 5. SIMD + zero-copy parsing

EcliHalo's HTTP parser uses \`memchr::memmem::find\` (AVX2/NEON) for header
boundary detection, which is 5 to 10 times faster than nginx's byte-at-a-time scanner. The
response path writes headers + body in a single \`write_all\` call with buffer
reuse across keep-alive requests.

### Summary of gains

| Area | EcliHalo advantage | Impact |
|---|---|---|
| Concurrency ramp (c=200) | SO_REUSEPORT + per-core pools | **+74% to 106% RPS** |
| Static files | sendfile + kTLS + in-memory cache | **+6% to 13% RPS** |
| TLS overhead | Kernel offload (kTLS) | Near zero userspace crypto |
| Connection pool | Lock-free \`SegQueue\` per core | Zero contention |
| Header parsing | SIMD \`memchr\` | 5 to 10 times faster |
| Response path | Single \`write_all\` + buffer reuse | 1 alloc per connection |

## Cloudflare Tunnel (cloudflared)

EcliHalo works with cloudflared out of the box. The proxy preserves incoming
\`X-Forwarded-For\` headers sent by cloudflared so your backend sees the real
client IP, not 127.0.0.1. No special configuration needed.

## Prometheus Metrics

Opt-in Prometheus endpoint. Enable in config:

\`\`\`yaml
metrics: true   # default: false
\`\`\`

When enabled, \`/__eclihalo/metrics\` returns Prometheus-format data.

## Hot Reload

Edit \`/etc/eclihalo/config.yml\`, then:

\`\`\`bash
eclihalo reload
# or: systemctl reload eclihalo
# or: kill -SIGHUP $(pgrep eclihalo)
\`\`\`

Routes swap atomically. Existing connections finish on the old config.

## Rate Limiting

Per-IP token bucket throttling, with whitelist support.

\`\`\`yaml
rate_limit:
  enabled: true
  requests_per_sec: 500
  burst: 1000
  whitelist:
    - 10.0.0.
    - 172.16.
\`\`\`
`;

export default function EcliHaloDocs() {
  return <Md>{content}</Md>;
}
