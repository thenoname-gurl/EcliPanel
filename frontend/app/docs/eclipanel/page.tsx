"use client"
import { Md } from "../_components/md";

const content = `
![EcliPanel](https://github.com/thenoname-gurl/EcliPanel/blob/main/eclipanel.png?raw=true)

# EcliPanel — Full Setup & Configuration

Everything you need to get EcliPanel running for real: the panel itself,
Wings nodes, the halo proxy, tunnels, and mailcow if you want mailboxes.
EcliAegis (the DDoS filter) is closed source, so it's not in here.

---

## 1. What you're running

| Piece | What it is | Where it runs |
|---|---|---|
| Backend | Bun + Elysia API | panel host |
| Frontend | Astro + React dashboard | panel host |
| Wings | the patched wings-rs node agent | every node |
| EcliHalo | the reverse proxy (drops nginx) | panel host |
| EcliTunnel | public tunnel endpoints for servers | nodes + clients |
| Mailcow | dockerised mail server | mail host |
| AntiAbuse | baked into Wings, nothing to install | every node |

You'll want Debian 13+ everywhere, Bun 1.1+, MariaDB, Redis, a domain
with DNS — and **Docker on every node**. Wings uses Docker to run and
isolate game server containers, so it must be installed and running on
the host (and on the panel host if you run Mailcow there). Podman is
not a validated substitute — treat Docker as mandatory.

---

## 2. Build Wings first

EcliPanel uses a **patched wings-rs** that ships in this repo under
\`/wings\` with the antiabuse daemon compiled in. The stock upstream
build won't work, and wings-go definitely won't.

\`\`\`bash
cd wings
./manage.sh build
# binary lands in wings/target/release/wings-rs
\`\`\`

\`manage.sh\` regenerates the patch from \`patched/\` vs \`source/\`,
applies it into \`output/\`, and runs \`cargo build --release\`. You need
a Rust toolchain on the build box.

Once the backend is up (next section), you can skip copying binaries
around entirely — the panel serves wings itself:

\`\`\`bash
curl -fSL "https://backend.ecli.app/api/wings/download?arch=$(uname -m)" -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
\`\`\`

Wings runs with an explicit config path:

\`\`\`bash
wings --config /etc/wings/config.yml
\`\`\`

The node's Wings port (8080 by default) has to be reachable from the
panel — directly or through a halo route.

---

## 3. Backend

\`\`\`bash
cd backend
bun install
sudo apt install -y ffmpeg espeak    # only if you use the audio captcha
\`\`\`

Secrets first. Don't reuse them, don't commit them:

\`\`\`bash
bun run gen:jwt-secret      # fills JWT_SECRET etc into .env
bun run gen:pq-jwt-seed     # PQ_JWT_SEED, for ML-DSA-65 signed tokens
bun -e "console.log((await import('crypto')).randomBytes(64).toString('base64'))"   # NODE_PQ_ENCRYPTION_SEED
bun -e "console.log((await import('crypto')).randomBytes(32).toString('base64'))"   # NODE_ENCRYPTION_KEY
\`\`\`

Copy \`.env.example\` to \`.env\` and fill it in. Create the MariaDB
database first — the backend won't do it for you. The variables that
will actually bite you if wrong:

- \`DB_HOST\` / \`DB_PORT\` / \`DB_USER\` / \`DB_PASS\` / \`DB_NAME\` — MariaDB
- \`PORT\` — backend port. Default 3000; production usually 4000 so halo
  can route \`backend.ecli.app\` → \`127.0.0.1:4000\`
- \`JWT_SECRET\`, \`PQ_JWT_SEED\`, \`NODE_PQ_ENCRYPTION_SEED\`, \`NODE_ENCRYPTION_KEY\` — auth + node encryption
- \`FRONTEND_URL\`, \`BACKEND_URL\`, \`PANEL_URL\` — public URLs, no trailing slash. Use https in production (halo terminates TLS)
- \`ORIGIN\` + \`RP_ID\` — CORS origin and WebAuthn relying-party id. RP_ID must match the panel's public domain, or passkeys fail silently
- \`SMTP_HOST\` / \`SMTP_PORT\` / \`SMTP_USER\` / \`SMTP_PASS\` / \`MAIL_FROM\` — transactional mail, or point it at Mailcow
- \`REDIS_URL\` — default \`redis://localhost:6379\`. Not optional: the backend connects on boot and reconnects forever if it's down

Only relevant if you use the feature:

- \`MAILCOW_API_URL\` / \`MAILCOW_API_KEY\` + \`MAILBOX_DOMAIN\` / \`MAIL_DOMAIN\` — mailboxes (section 6)
- \`DOVECOT_MASTER_USER\` / \`DOVECOT_MASTER_PASS\` — panel reading any mailbox over IMAP
- \`TUNNEL_PUBLIC_HOST\` (default \`n2.ecli.app\`) / \`TUNNEL_PORT_RANGE\` (e.g. \`20000-29999\`) — tunnels
- \`CLOUDFLARE_API_TOKEN\` / \`CLOUDFLARE_BASE_ZONE\` / \`CLOUDFLARE_ACCOUNT_ID\` — panel-managed DNS subzones
- \`CAPTCHA_SECRET\` / \`CAPTCHA_INVISIBLE_SECRET\` — audio captcha (\`openssl rand -hex 32\`)
- \`COMPANY_NAME\` + the \`INVOICE_*\` block — invoice branding
- \`ANTIABUSE_AI_ENABLED\` / \`ABUSE_REPORT_EMAIL\` — antiabuse AI + where abuse reports go

Then:

\`\`\`bash
bun run gen:default-role   # rootAdmin role with full permissions
bun src/index.ts           # dev
./start.sh                 # prod
\`\`\`

---

## 4. Frontend

\`\`\`bash
cd frontend
pnpm install
cp .env.example .env
\`\`\`

The frontend is Astro + React. \`lib/panel-config.ts\` holds the branding
(\`BRAND.name\`, logo, repo url), the sidebar (\`NAVIGATION\` /
\`ADMIN_NAVIGATION\`), portal tiers and prices — that's the file you'll
actually edit.

Env:

- \`BACKEND_URL\` — where server-side fetches go. Default \`https://backend.ecli.app\`
- \`NEXT_PUBLIC_API_BASE\` — where the browser sends API calls. Set it to
  \`https://backend.ecli.app\` for a split-domain setup, or leave it empty
  and proxy \`/api/*\` to the backend on the same domain

Run:

\`\`\`bash
./dev.sh --port 3000        # dev (default port is 3001)
./start.sh                  # prod — PORT comes from .env, default 3001
\`\`\`

---

## 5. EcliHalo

The reverse proxy. Full guide: [EcliHalo docs](/docs/eclihalo). The repo
ships a working example at \`halo/config.example.yml\` — that's the
production layout (frontend on 3000, backend on 4000, CDN static files),
so steal it:

\`\`\`yaml
http:
  port: 80
https:
  port: 443

tls:
  mode: provided
  cert_path: /etc/ssl/certs/ecli.app/fullchain.pem
  key_path: /etc/ssl/private/ecli.app/privkey.pem

routes:
  - domain: ecli.app                    # frontend
    strategy: least_connections
    websocket: true
    upstreams:
      - 127.0.0.1:3000
    header_rules:
      set_request:
        x-forwarded-proto: "https"
      set_response:
        alt-svc: 'h3=":443"; ma=86400'
        strict-transport-security: "max-age=31536000; includeSubDomains; preload"
        x-content-type-options: "nosniff"
        x-frame-options: "SAMEORIGIN"
      remove_response:
        - server
        - x-powered-by
    proxy_redirect:
      "http://127.0.0.1:3000": "https://ecli.app"

  - domain: backend.ecli.app            # backend
    strategy: least_connections
    websocket: true
    upstreams:
      - 127.0.0.1:4000
    header_rules:
      set_response:
        access-control-allow-origin: "https://ecli.app"
        access-control-allow-methods: "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        access-control-allow-headers: "Authorization, Content-Type, X-Requested-With"
        access-control-allow-credentials: "true"
        cache-control: "no-store"
      remove_response: [server, x-powered-by]

\`\`\`

(The \`config.example.yml\` in the repo has a \`cdn.ecli.app\` route for
static files — you don't need it unless you actually serve a CDN.)

Build the binary (\`cargo build --release\` in \`/halo\`), drop it in, and
reload with \`kill -HUP\`. It does HTTP/1.1, HTTP/2, HTTP/3, TLS, WS
tunnelling, load balancing — all of it.

Two gotchas: with \`mode: provided\`, the halo user needs read access to
the key in \`/etc/ssl/private\`; and HTTP/3 only works with valid certs —
self-signed kills H3.

---

## 6. Mailcow

The panel manages mailboxes through the Mailcow API. Mailcow itself
runs in Docker.

\`\`\`bash
git clone https://github.com/mailcow/mailcow-dockerized /opt/mailcow
cd /opt/mailcow
./generate_config.sh    # MAILCOW_HOSTNAME=mail.example.com
docker compose pull && docker compose up -d
\`\`\`

Log into the Mailcow UI as admin, then **Settings → Access → Create API
key** with read/write. Wire it into the backend \`.env\`:

\`\`\`bash
MAILCOW_API_URL=https://mail.example.com   # must be https — mailcow rejects http API calls
MAILCOW_API_KEY=<key>
MAILBOX_DOMAIN=example.com
MAIL_DOMAIN=example.com
MAILBOX_INBOUND_SECRET=$(openssl rand -hex 32)

SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=noreply@example.com
\`\`\`

If you want the panel's inbox feature to read any user's mailbox, set up
a Dovecot master user:

\`\`\`bash
docker exec -it dovecot-mailcow doveadm pw -s SHA512-CRYPT -p 'your-password'
# put the hash in /opt/mailcow/data/conf/dovecot/extra.conf:
#   master_users = { <master-user> = { password = <hash> } }
docker compose restart dovecot-mailcow
\`\`\`

Restart the backend after changing \`.env\` — the mailbox sync job picks
it up.

---

## 7. Nodes

Add nodes in the panel: **Infrastructure → Nodes → Add Node**, give it a
name and the Wings URL (\`https://node.example.com:8080\`), pick a type.
The panel hands you a node token — put it in the node's Wings config.
The heartbeat service keeps an eye on it from then on.

---

## 8. EcliTunnel

Two agents: a **client** (forwards traffic from a public endpoint to
your local service) and a **server** (accepts inbound on allocated
ports, relays to clients). Backend needs \`TUNNEL_PUBLIC_HOST\` and
\`TUNNEL_PORT_RANGE\` set.

**Tunnel server** (needs ports 20000-29999 open):

\`\`\`bash
ecli-tunnel-server enroll --backend https://backend.ecli.app
ecli-tunnel-server run --token <token> --backend https://backend.ecli.app
# the agent connects to the backend WS, listens for bind events,
# and binds 0.0.0.0:<port> for each allocation
\`\`\`

**Client — expose a local service, one-liner:**

\`\`\`bash
curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- open --port 8080
\`\`\`

**Or a persistent client agent:**

\`\`\`bash
curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- run --port 8080
\`\`\`

**Enroll a client with the panel:**

\`\`\`bash
ecli-tunnel-client enroll --backend https://backend.ecli.app
# code → approve in the panel admin UI, token saved to ~/.ecli-tunnel-client.json
\`\`\`

Per-server tunnels live under **Dashboard → Server → Tunnels**.

---

## 9. systemd

The repo ships example units in \`/systemd\` — they're dev-oriented
(\`bun --watch\`, NODE_ENV=development), so use these instead for
production. Adjust the \`WorkingDirectory\` paths.

**Backend** (\`/etc/systemd/system/eclipanel-backend.service\`):

\`\`\`ini
[Unit]
Description=EcliPanel Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/EcliPanel/backend
ExecStart=/root/.bun/bin/bun src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
\`\`\`

**Frontend** (\`/etc/systemd/system/eclipanel-frontend.service\`):

\`\`\`ini
[Unit]
Description=EcliPanel Frontend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/EcliPanel/frontend
ExecStart=/usr/bin/bun ./dist/server/entry.mjs
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
\`\`\`

(PORT and the URLs come from \`.env\` — \`start.sh\` just sources it and
execs the entry.mjs above.)

**Wings** — wings-rs ships its own unit; or use:

\`\`\`ini
[Unit]
Description=Wings
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/wings --config /etc/wings/config.yml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
\`\`\`

**EcliHalo** — the binary prints a unit file itself:

\`\`\`bash
eclihalo systemd > /etc/systemd/system/eclihalo.service
\`\`\`

Then the usual \`systemctl daemon-reload && systemctl enable --now <unit>\`.
Wings needs Docker up first (After/Requires docker.service), which is
why that one's there.

---

## 10. Check it actually works

- Frontend loads at \`https://panel.example.com\`
- \`curl https://backend.ecli.app/health\`
- \`curl https://backend.ecli.app/openapi\` — API docs
- Node shows **online** in Infrastructure → Nodes
- Create a server, install an egg, start it, open the console
- If mailcow: create a mailbox from the panel, send something, receive it
- Tunnel: \`open --port 8080\` on a service and hit the public URL

---

## 11. Before you call it done

- Secrets generated and unique (JWT, PQ seed, encryption seeds)
- \`WINGS_ALLOW_INVALID_CERT=false\`
- MariaDB bound to localhost or a private network
- Only 80/443 exposed; backend port not reachable publicly
- HTTPS everywhere (halo TLS)
- Mailcow restricted to the mail host, API key least-privilege
- Backend, frontend, wings, halo all under systemd (section 9)
- Backups of MariaDB and \`.env\`

---

## 12. Commands you'll actually run

\`\`\`bash
# backend
cd backend && bun src/index.ts          # dev
cd backend && ./start.sh                # prod

# frontend
cd frontend && ./dev.sh --port 3000     # dev (default 3001)
cd frontend && ./start.sh               # prod (PORT from .env)

# halo
kill -HUP $(pgrep eclihalo)             # reload config

# wings
sudo systemctl status wings

# systemd reload after editing units
sudo systemctl daemon-reload
\`\`\`
`;

export default function Page() {
  return <Md>{content}</Md>;
}
