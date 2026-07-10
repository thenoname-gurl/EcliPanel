# AGENTS.md — EcliPanel v3

> **Full AI agent reference.** Maps the entire codebase so any LLM can understand structure, patterns, and conventions at a glance. Regenerate after major architecture changes.

---

## 1. What Is This?

EcliPanel v3 is a **game server hosting panel** — provision, manage, monitor, and secure game servers across a distributed node network.

**Key subsystems:**
| System | Language | Role |
|--------|----------|------|
| `backend/` | TypeScript (Bun + ElysiaJS) | REST API, auth, business logic |
| `frontend/` | TypeScript (Next.js 16) | Web UI, dashboard |
| `wings/` | Rust (calagopus/wings fork) | Node daemon with embedded security & anti-abuse |
| `tunnel/` | Rust | EcliTunnel — expose local services publicly |
| `app/` | Electron/Capacitor | Desktop & mobile wrappers |
| `systemd/` | systemd units | Production service definitions |

---

## 2. Repository Map

```
v3/
├── backend/                    # Bun + ElysiaJS API server
│   ├── src/
│   │   ├── index.ts            # Entry point — starts server on PORT (default 3000)
│   │   ├── app.ts              # Elysia app: CORS, JWT, helmet, OpenAPI, routes, jobs, error handling
│   │   ├── config/             # DB (TypeORM), Redis, app bootstrap (setupConfig)
│   │   ├── routes/index.ts     # Central route registration + feature toggle gates
│   │   ├── handlers/           # Route handlers (~42 files)
│   │   ├── services/           # Business logic (~40 files)
│   │   ├── models/             # TypeORM entities (~82 entities)
│   │   ├── middleware/         # auth, authorize (RBAC), CSRF, featureToggle, KYC
│   │   ├── types/              # TypeScript type definitions
│   │   ├── jobs/               # Cron jobs (~18 jobs)
│   │   ├── workers/            # Bun workers (crypto, image, PDF, SFTP)
│   │   ├── utils/              # Utilities (~30 files)
│   │   ├── mcp/                # Model Context Protocol server
│   │   ├── slack/              # Slack bot (Bolt SDK)
│   │   ├── i18n/               # en/ru translations
│   │   ├── emails/             # React Email templates (15)
│   │   ├── repositories/       # Custom TypeORM repositories
│   │   ├── data/               # Static/seed data
│   │   └── migrations/         # DB migrations
│   ├── scripts/                # CLI scripts (promote, seed, jwt secrets, etc.)
│   └── tests/                  # Bun test files
│
├── frontend/                   # Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx          # Root layout: fonts, theme injection, AuthProvider, guards
│   │   ├── dashboard/
│   │   │   ├── page.tsx        # SOC Dashboard (security findings + resource summary)
│   │   │   ├── servers/        # Server list + [id] detail (V1/V2 provider-aware)
│   │   │   ├── admin/          # Admin panel (tabs/ — includes SocTab, AntiAbuseTab)
│   │   │   ├── billing/        # Billing & checkout
│   │   │   ├── tickets/        # Support tickets
│   │   │   ├── organisations/  # Org management
│   │   │   ├── elo/            # ELO game server ranking
│   │   │   ├── chat/           # Real-time chat
│   │   │   ├── calendar/       # Calendar & booking
│   │   │   ├── paint/          # Collaborative canvas (Konva)
│   │   │   ├── ai-studio/      # AI model management
│   │   │   ├── ai-chat/        # AI chat interface
│   │   │   ├── mailbox/        # Email client
│   │   │   ├── tunnels/        # Tunnel management
│   │   │   ├── infrastructure/ # Nodes, visual editor
│   │   │   ├── applications/   # Application forms
│   │   │   ├── family/         # Family/student plans
│   │   │   ├── subusers/       # Server subuser invites
│   │   │   ├── identity/       # ID verification
│   │   │   ├── settings/       # User settings
│   │   │   └── activity/       # Activity log
│   │   ├── landing/            # Marketing/landing pages
│   │   ├── docs/               # Documentation pages
│   │   ├── legal/              # Legal pages (ToS, privacy, etc.)
│   │   ├── login/              # Login page
│   │   ├── register/           # Registration page
│   │   ├── forms/[slug]/       # Public application forms
│   │   ├── share/[token]/      # Shared file links
│   │   ├── tunnel/verify/      # Tunnel device verification
│   │   └── ...                 # Other public pages
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (~55)
│   │   ├── panel/              # Panel-specific (sidebar, header, guards, banners)
│   │   └── activity/           # Activity feed components
│   ├── hooks/                  # React hooks (useAuth, useDebounce, useMobile, etc.)
│   ├── lib/
│   │   ├── panel-config.ts     # CENTRAL CONFIG: API endpoints, nav, branding, portals, feature flags
│   │   ├── api-client.ts       # apiFetch() with CSRF, retry, caching
│   │   ├── themes.ts           # 14 theme definitions (CSS variable maps)
│   │   ├── utils.ts            # cn() utility (clsx + tailwind-merge)
│   │   └── ...                 # Other lib files
│   ├── i18n/                   # next-intl config
│   ├── messages/               # Translation files (en.json, ru.json)
│   ├── types/                  # Frontend TypeScript types
│   ├── public/                 # Static assets (images, fonts, spark analyzer configs)
│   ├── middleware.ts           # Next.js middleware: auth guard, SEO bot verify, short URLs
│   ├── next.config.mjs         # Rewrites (/api→backend, /wings→wings, /uploads→backend)
│   └── components.json         # shadcn/ui config (new-york, neutral, CSS vars)
│
├── wings/                      # Patched Wings daemon
│   ├── source/                 # Clean upstream Wings (no .git — just source)
│   ├── patched/                # Working copy with security patches (edit code here)
│   ├── output/                 # Build target (source + patches applied, cargo here)
│   ├── patches/                # .patch files (diff between patched/ and source/)
│   ├── target/                 # Built binary → target/release/wings-rs
│   ├── manage.sh               # Patch & build manager (pull/regen/patch/build/status)
│   └── README.md               # Wings documentation
│
├── tunnel/                     # EcliTunnel (Rust)
│   ├── client/                 # Tunnel client agent
│   ├── server/                 # Tunnel server agent
│   └── deploy.sh               # One-command deployment script
│
├── app/                        # Electron + Capacitor wrappers
│   ├── electron/               # Electron main process
│   ├── package.json            # electron-builder config
│   └── scripts/
│
├── antiabuse/                  # DEPRECATED — detection now embedded in Wings
├── systemd/                    # Production systemd units
├── eggs/                       # Pterodactyl egg configs
├── showcase/                   # Screenshots for SHOWCASE.md
├── .agents/                    # Agent skill definitions (UI/animation/design)
├── .better-web-ui.md           # Full Design Context (brand, themes, UI principles)
├── AGENTS.md                   # ← This file
├── README.md
├── TODO.md
├── SHOWCASE.md
└── SECURITY.md
```

---

## 3. Backend Architecture (Bun + ElysiaJS)

### 3.1 Framework & Runtime

- **Runtime:** Bun (≥1.0) — runs TypeScript directly, no compile step
- **Framework:** ElysiaJS (migrated from Fastify — some code still shows Fastify patterns)
- **Port:** `process.env.PORT` (default 3000), host `0.0.0.0`

### 3.2 App Bootstrap Order (`app.ts` → `initApp()`)

1. OpenAPI documentation plugin registered
2. Elysia models defined (User, Server, Node, Plan, etc.)
3. CORS configured (origin-aware, credentials, multiple allowed headers)
4. Helmet security headers
5. JWT plugin + Post-Quantum JWT (ML-DSA-65) keypair init
6. `onRequest` hooks: IP resolution (CF-Connecting-IP → X-Forwarded-For → X-Real-IP → remoteAddr), rate limiting (500 req/min per IP), token decode
7. `onBeforeHandle`: CSRF protection
8. `onAfterHandle`: Cache-Control headers per route pattern, gzip compression
9. `onError`: Structured error responses (404, 500, etc.) + activity logging
10. Route registration (`registerRoutes`)
11. MCP endpoints (`/api/mcp/messages`, `/api/mcp/sse`)
12. Scheduled jobs (18 cron jobs including `securityScanJob`)
13. Slack bot init
14. Static file routes (`/uploads/*`, `/uploads/id-docs/*`, `/uploads/mailbox/*`)
15. Health check endpoint (`/health`)

### 3.3 Request Lifecycle

```
onRequest (IP resolve, rate limit, JWT decode)
  → onBeforeHandle (CSRF check)
    → beforeHandle (authenticate middleware — if route has it)
      → handler function
    → onAfterHandle (cache headers, gzip)
  → onError (if thrown)
```

### 3.4 Authentication & Authorization

**Three auth methods (checked in order):**
1. `Authorization: Bearer <token>` header
2. `x-api-key` header → treated as `ApiKey <key>`
3. Cookie (`token` cookie, name configurable via `JWT_COOKIE_NAME`)

**Token types:**
- Classic JWT (HMAC-SHA256, secret from `JWT_SECRET`)
- Post-Quantum JWT (ML-DSA-65 signed, seed from `PQ_JWT_SEED`)

**Middleware chain:**
- `authenticate()` — resolves user/apiKey/oauthToken, attaches to context
- `authorize(...permissions)` — RBAC check using permission strings like `"servers:read"`, `"admin:access"`, `"soc:read"`
- `requireProvider("wings"|"proxmox")` — validates node provider type
- `csrfProtection()` — checks `x-csrf-token` header on mutating requests

**Permission format:** `resource:action` (e.g., `servers:create`, `admin:users`). Wildcards: `*` (superadmin), `servers:*`.
**Superadmin bypass:** `user.role === '*' || user.role === 'rootAdmin'` skips all permission checks.

### 3.5 Route Registration Pattern

```typescript
// backend/src/handlers/xxxHandler.ts
export function xxxRoutes(app: ServerApp, prefix = '') {
  app.get(`${prefix}/xxx`, handlerFn, {
    beforeHandle: [authenticate, authorize('xxx:read')]
  })
  app.post(`${prefix}/xxx`, handlerFn, {
    beforeHandle: [authenticate, authorize('xxx:create')]
  })
}
```
All routes registered in `routes/index.ts` via `registerRoutes(app)`. Feature toggles check here before delegating.

### 3.6 Handler Context

The handler context extends Elysia's context with:
- `ctx.user` — authenticated User entity
- `ctx.apiKey` — API key if used
- `ctx.jwtPayload` / `ctx.pqJwtPayload` — decoded token payloads
- `ctx.t` — i18n translation function
- `ctx.log` — logger
- `ctx.clientIP` — resolved client IP
- `ctx.store` — mutable request-scoped store

### 3.7 Major Handler Files

| File | Lines | Purpose |
|------|-------|---------|
| `adminHandler.ts` | 9,815 | Admin: users, servers, nodes, stats, fraud, anti-abuse, export, settings |
| `serverHandler.ts` | 7,893 | Server CRUD, power, files (SFTP + Wings), backups, databases, plugins |
| `userHandler.ts` | 2,413 | User profile, registration, settings, avatars, favorites |
| `authHandler.ts` | 2,392 | Login, logout, 2FA, passkeys, password reset, email verify, OAuth |
| `nodeHandler.ts` | 1,214 | Node CRUD, heartbeats, allocations, Proxmox storage/templates |
| `socHandler.ts` | ~600 | SOC: security findings CRUD, scan trigger, escalation→ticket, detection rules, admin settings, Wings download |

### 3.8 Service Layer

| Service | Purpose |
|---------|---------|
| `securityScanner.ts` | 16 checks: login anomalies, server posture, access control, resource abuse (CPU % of allocation), nodes, threat intel, custom rules, Wings-based |
| `threatIntel.ts` | IP reputation (AbuseIPDB + blocklists + CIDR, Redis-cached 1-24h), Docker image checking, private IP filter |
| `alertDispatcher.ts` | Per-user alerts (checks `settings.socAlerts`), email + in-app notification, admin webhook (Discord/Slack embed), admin email fallback |
| `ruleEngine.ts` | Wazuh-style rule evaluation: nested AND/OR conditions, regex/contains/gt/lt operators, frequency windows, correlation across sources |
| `wingsApiService.ts` | HTTP client for Wings API (all endpoints + security: `getServerProcesses`, `getServerConnections`, `scanServerFiles`) |
| `wingsSocketService.ts` | WebSocket listener for Wings stats events, auto-imports unknown servers |
| `nodeService.ts` | Node → ProviderService routing (WingsApiService or ProxmoxApiService), caching |
| `fraudService.ts` | AI-powered billing fraud detection |
| `nodeHeartbeatService.ts` | Periodic node health checks |
| `mailService.ts` / `mailcowService.ts` | Email via nodemailer + Mailcow API |
| `socSocketService.ts` | EventEmitter for real-time SOC updates |

### 3.9 Key Entities (SOC)

| Entity | Purpose |
|--------|---------|
| `SecurityFinding` | Scan results: source/internal/external, category, severity, serverId/nodeId/userId, metadata (JSON), checkFingerprint (dedup), status (open/acknowledged/resolved/false_positive) |
| `DetectionRule` | Custom rules: name, conditions (Wazuh-style JSON), frequency, correlation, sources, scope (global/server/user), triggerCount |
| `PanelSetting` | Key-value admin settings. SOC config uses `soc.*` prefix (soc.abuseipdb_key, soc.alert_email, soc.alert_webhook_url, etc.) |

### 3.10 Database

- **ORM:** TypeORM with `reflect-metadata`, `synchronize: true` (auto-creates tables)
- **Databases:** MariaDB (primary), MySQL, PostgreSQL
- **Entities:** ~82 entity files in `models/`
- **Config:** `config/typeorm.ts` — `AppDataSource` with entity list
- **Redis:** Caching (`withRedisCache`), session storage, rate limiting

### 3.11 Scheduled Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| `securityScanJob` | 30min | Run security scanner + custom rules + threat intel |
| `metricsCollectionJob` | 5s | Collect server resource metrics from Wings |
| `wingsSyncJob` | 5min | Sync server configs with Wings nodes |
| (15 other jobs) | varies | Exports, deletions, mail sync, renewals, sunset policies, etc. |

### 3.12 Node Provider Architecture

Wings and Proxmox nodes are abstracted behind the `NodeProvider` interface:
```typescript
interface NodeProvider {
  getSystemInfo(): Promise<SystemInfo>;
  getServers(): Promise<{ data: ServerInfo[] }>;
  getServer(id: string): Promise<{ data: ServerInfo }>;
  createServer(payload): Promise<any>;
  deleteServer(id: string): Promise<void>;
  powerServer(id, action): Promise<any>;
  getStats(id: string): Promise<ServerStats>;
}
```
Provider selection: `nodeService.getServiceForNode(nodeId)` checks `node.provider` field — returns `WingsApiService` or `ProxmoxApiService`. Cached per node.

---

## 4. Frontend Architecture (Next.js 16)

### 4.1 Tech Stack

- **Framework:** Next.js 16 (App Router, RSC enabled)
- **Language:** TypeScript 6.0
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`), CSS custom properties
- **Components:** shadcn/ui (new-york style, neutral base) + Radix UI primitives
- **Forms:** react-hook-form + zod + shadcn Form wrapper
- **Icons:** lucide-react
- **Toasts:** sonner
- **Charts:** recharts
- **Animation:** framer-motion
- **i18n:** next-intl (en/ru)
- **Auth:** Custom AuthProvider (React Context + backend session API)
- **Terminal:** @xterm/xterm + addons
- **Editor:** @monaco-editor/react (lazy-loaded)
- **Canvas:** react-konva (for Paint feature)
- **Markdown:** react-markdown + remark-gfm + rehype-slug + shiki

### 4.2 Request Flow

```
Browser → Next.js server (middleware.ts auth guard)
  → next.config.mjs rewrites (/api/* → backend)
    → Backend API (Bun/Elysia)
```
API calls from client components use `apiFetch()` from `lib/api-client.ts`:
- Auto-attaches Bearer token + CSRF token
- Retry on network/timeout errors (2 retries, 500ms backoff)
- CSRF token auto-refresh on 403
- FormData support
- Rate limit message formatting

### 4.3 Theming System

14 themes defined in `frontend/lib/themes.ts`. Each theme is a map of CSS custom properties:
```
primary, bg, card, secondary, sidebar, accent, accentFg, glow, border, foreground, cardForeground
```
**How themes work:**
1. `layout.tsx` reads user's theme from session API (SSR)
2. Injects inline `<script>` that sets CSS variables on `:root` before paint
3. `globals.css` has default (Eclipse Purple) as fallback
4. Theme switcher in settings updates both CSS vars + user preference via API

### 4.4 Central Configuration (`lib/panel-config.ts`)

**Single source of truth for:**
- `BRAND` — name, tagline, logo, version
- `API_ENDPOINTS` — every API endpoint path (~350+ endpoints)
- `PORTALS` — portal tiers (free/paid/enterprise/educational) with features
- `NAVIGATION` — sidebar navigation structure with tier gating and feature flags
- `FeatureFlag` — feature flag union type

**When adding a new API route, add it here first.**

### 4.5 Middleware (`middleware.ts`)

Next.js edge middleware handles:
- **Auth guard:** Redirects unauthenticated users from `/dashboard/*` to `/login`
- **Admin guard:** Redirects non-admin users from `/dashboard/admin/*`
- **Auth page guard:** Redirects logged-in users away from `/login`, `/register`
- **SEO bot verification:** Verifies crawler IPs against official ranges
- **Short URL resolution:** `/a/:code` and `/:code` → backend lookup → 302 redirect

### 4.6 SOC Dashboard (`/dashboard` — page.tsx)

Layout:
```
Stats Row (4 cards)
  ↓
Security Findings (full width — primary SOC content)
  - Severity summary bar (colored badges with counts)
  - Findings list: colored left border, severity badge, category badge, IP reputation badge, server link, timestamp, action buttons
  - Actions: Acknowledge, Resolve, False Positive, Escalate to staff
  - Run Scan button with loading state
  - Expand/collapse for findings >5
  ↓
Resource Summary + Recent Activity (2-column sidebar)
```

### 4.7 Admin SOC Tab (`/dashboard/admin` → SOC tab)

Four sub-tabs:
- **Findings** — Full table with pagination, status/severity filters, quick actions
- **Event Log** — Chronological SOC event timeline
- **Rules** — CRUD for custom detection rules (JSON-based conditions, frequency, correlation)
- **Settings** — Editable: AbuseIPDB key, IP/CIDR/image blocklists, admin email, webhook URL, alert severities, scan schedule

---

## 5. SOC System — Full Architecture

### Detection Layer
```
┌──────────────────────────────────────────────────────┐
│ Internal Scanner (16 checks, 30min)                   │
│  - Login anomalies (brute force, new IP)              │
│  - Server posture (abandoned, OOM, KVM, DMCA)        │
│  - Access control (wildcard subusers, orphaned)       │
│  - Resource anomalies (CPU % of ALLOCATION)           │
│  - Node security (no SSL, unhealthy)                  │
│  - Threat intel (AbuseIPDB + blocklists)             │
│  - Custom rules (Wazuh-style JSON engine)             │
│  - Wings-based (process scan, port audit, file scan) │
├──────────────────────────────────────────────────────┤
│ Wings Embedded Anti-Abuse                             │
│  - CPU mining detection (% of allocated CPU)          │
│  - DDoS detection (network rate >100 MB/s)           │
│  - Rule polling from panel every 5min                 │
│  - Auto-reports to /api/admin/antiabuse/events        │
├──────────────────────────────────────────────────────┤
│ External Agent API (Wazuh/Fail2ban/CrowdSec)          │
│  - POST /api/soc/security-findings                   │
└──────────────────────────────────────────────────────┘
```

### Alerting
- **Per-user**: checks `settings.socAlerts` preferences → email + in-app notification
- **Admin webhook**: Discord/Slack-compatible embeds (configurable in Admin → SOC → Settings)
- **Admin fallback email**: for orphaned findings (no user)

### User/Org Scoping
- Admins (`soc:read` or `role === '*'`): see all findings
- Regular users: only findings where `userId = their ID` OR `serverId` is a server they own/have subuser access to

### Escalation
`POST /api/soc/security-findings/:id/escalate` → creates a real support ticket in the Technical department, notifies server owner with ticket link

---

## 6. Wings (Patched Game Server Daemon)

### Structure
```
wings/
├── source/       Clean upstream (no .git — just source code)
├── patched/      Working copy — edit code here
├── output/       Build target (source + patches applied, cargo here)
├── patches/      .patch files (diff between patched/ and source/)
├── manage.sh     Patch & build manager
└── target/       Built binary → target/release/wings-rs
```

### Workflow
```bash
# 1. Edit code in patched/
vim patched/application/src/server/antiabuse.rs

# 2. Regenerate patches
./manage.sh regen        # Diff patched/ vs source/ → patches/

# 3. Apply patches to output + build
./manage.sh patch        # Apply patches to clean output/
./manage.sh build        # cargo build --release
```

### Commands
| Command | Does |
|---------|------|
| `./manage.sh regen` | Generate .patch files from patched/ |
| `./manage.sh patch` | Apply patches to fresh output/ |
| `./manage.sh build` | Compile |
| `./manage.sh status` | Show state of all directories |

### Security Endpoints (added by patches)
- `GET /api/servers/:id/security/processes` — Docker `top_processes()` listing
- `GET /api/servers/:id/security/connections` — port bindings + Docker network info
- `GET /api/servers/:id/security/scan-files` — suspicious file scanner (miners, webshells, backdoors)

### Embedded Anti-Abuse (`server/antiabuse.rs`)
- CPU + network monitoring every 5s per container
- Reports to panel `/api/admin/antiabuse/events`
- Heartbeat every 30s (registers as `wings@hostname`)
- Fetches detection rules from panel every 5min via `GET /api/soc/detection-rules?mode=wings`

### One-Line Install
```bash
curl -fsSL https://ecli.app/api/wings/download -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
systemctl restart wings
```
Binary served from panel at `GET /api/wings/download`. Also: `curl -fsSL https://ecli.app/api/wings/install.sh | bash`

---

## 7. Key Patterns & Conventions

### 7.1 Backend Patterns

**Handler function signature:**
```typescript
export function xxxRoutes(app: ServerApp, prefix = '') { ... }
```

**Middleware composition:**
```typescript
app.get('/api/xxx', handler, {
  beforeHandle: [authenticate, authorize('xxx:read')]
})
```

**Error handling:** Throw errors with `.status` property or use `ctx.set.status = 400; return { error: 'message' }`.

**Database access:** `AppDataSource.getRepository(Entity)`, then standard TypeORM methods.

**Service instantiation:** Most services are singletons instantiated at module level or via `NodeService` caching.

**Logging:** Use `ctx.log` or `app.log` (maps to console).

### 7.2 Frontend Patterns

**API calls:** Always use `apiFetch()` from `lib/api-client.ts`:
```typescript
import { apiFetch } from '@/lib/api-client';
const data = await apiFetch(API_ENDPOINTS.servers);
```

**Styling:** Use `cn()` utility for conditional classes:
```typescript
import { cn } from '@/lib/utils';
<div className={cn("base-class", isActive && "active-class")} />
```

**Theme colors:** Never hardcode — use CSS variables:
```css
/* ✅ Good */  color: var(--primary);
/* ❌ Bad */   color: #8b5cf6;
```

**i18n:** Use `useTranslations` hook or `getTranslations` for server components.

**Feature flags:** Wrap with `<FeatureGuard feature="elo">...</FeatureGuard>` or check `isFeatureEnabled()` in backend.

### 7.3 General Conventions

- **Package managers:** pnpm (frontend), bun (backend)
- **No root package.json** — each sub-project is independent
- **Environment variables:** `.env` in each project directory
- **Secrets:** Never commit `.env` files; `.env.example` shows required vars
- **TypeScript:** Strict-ish but `ignoreBuildErrors: true` in frontend next.config
- **Formatting:** Prettier (backend), ESLint (both)
- **Git:** Main branch, Co-Authored-By: Claude in commits
- **Wings no-git:** `source/`, `patched/`, `output/` have no `.git` — manage patches with `manage.sh`

---

## 8. Development Workflows

### 8.1 Start Backend
```bash
cd backend
cp .env.example .env    # edit with real values
bun run gen:jwt-secret
bun run gen:pq-jwt-seed
bun run gen:default-role
bun src/index.ts         # dev mode
```

### 8.2 Start Frontend
```bash
cd frontend
cp .env.example .env     # edit with real values
pnpm install
pnpm dev                 # → http://localhost:3000
```

### 8.3 Run Tests
```bash
cd backend && bun test
```

### 8.4 Type Checking
```bash
cd backend && bun tsc --noEmit
cd frontend && npx tsc --noEmit
```

### 8.5 Adding a New API Endpoint
1. Add endpoint constant to `frontend/lib/panel-config.ts` → `API_ENDPOINTS`
2. Create/add route in appropriate `backend/src/handlers/xxxHandler.ts`
3. Register route in `backend/src/routes/index.ts` (with feature toggle if needed)
4. Add permission check with `authorize()` middleware
5. Add OpenAPI detail/tags for documentation

### 8.6 Adding a New Database Entity
1. Create entity file in `backend/src/models/`
2. Add to `config/typeorm.ts` entities array
3. Use `AppDataSource.getRepository(Entity)` in handlers/services
4. Table auto-created via `synchronize: true`

---

## 9. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default 3000) |
| `HOST` | Bind address (default 0.0.0.0) |
| `JWT_SECRET` | HMAC-SHA256 signing key (≥32 chars) |
| `JWT_COOKIE_NAME` | Cookie name for JWT (default: token) |
| `PQ_JWT_SEED` | ML-DSA-65 deterministic seed |
| `FRONTEND_URL` | CORS origin (comma-separated, `*` for all) |
| `PANEL_URL` | Additional CORS origin |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | MariaDB/MySQL connection |
| `DB_TYPE` | `mariadb`, `mysql`, or `postgres` |
| `REDIS_URL` | Redis connection string |
| `MAIL_*` | SMTP settings for nodemailer |
| `CF_API_TOKEN` | Cloudflare API token for DNS |
| `ANTIABUSE_AI_ENABLED` | Enable AI pipeline for abuse incidents |
| `ABUSE_REPORT_EMAIL` | Fallback abuse report recipient |

### Frontend (`frontend/.env`)
| Variable | Purpose |
|----------|---------|
| `BACKEND_URL` | Backend API base URL (for SSR + rewrites) |
| `NEXT_PUBLIC_API_BASE` | Client-side API base URL |
| `NEXT_PUBLIC_WINGS_BASE` | Wings node base URL for direct /wings rewrites |

---

## 10. Quick File Finder

| What | Where |
|------|-------|
| App bootstrap | `backend/src/app.ts` |
| Entry point | `backend/src/index.ts` |
| All routes registered | `backend/src/routes/index.ts` |
| Auth middleware | `backend/src/middleware/auth.ts` |
| RBAC middleware | `backend/src/middleware/authorize.ts` |
| Server handler (largest) | `backend/src/handlers/serverHandler.ts` |
| Admin handler | `backend/src/handlers/adminHandler.ts` |
| SOC handler | `backend/src/handlers/socHandler.ts` |
| Security scanner | `backend/src/services/securityScanner.ts` |
| Threat intel | `backend/src/services/threatIntel.ts` |
| Alert dispatcher | `backend/src/services/alertDispatcher.ts` |
| Rule engine | `backend/src/services/ruleEngine.ts` |
| Wings API client | `backend/src/services/wingsApiService.ts` |
| SecurityFinding entity | `backend/src/models/securityFinding.entity.ts` |
| DetectionRule entity | `backend/src/models/detectionRule.entity.ts` |
| Frontend config | `frontend/lib/panel-config.ts` |
| API client | `frontend/lib/api-client.ts` |
| Theme definitions | `frontend/lib/themes.ts` |
| Root layout | `frontend/app/layout.tsx` |
| Auth provider | `frontend/hooks/useAuth.tsx` |
| Middleware (auth guard) | `frontend/middleware.ts` |
| SOC dashboard | `frontend/app/dashboard/page.tsx` |
| Admin SOC tab | `frontend/app/dashboard/admin/tabs/SocTab.tsx` |
| Wings anti-abuse | `wings/patched/application/src/server/antiabuse.rs` |
| Wings security routes | `wings/patched/application/src/routes/api/servers/_server_/security/` |
| Wings manage script | `wings/manage.sh` |
| Next.js config | `frontend/next.config.mjs` |
| Design context | `.better-web-ui.md` |
| Tunnel (Rust) | `tunnel/client/`, `tunnel/server/` |
| Systemd units | `systemd/` |

---

## 11. Gotchas & Important Notes

1. **Migrated from Fastify:** The backend was originally Fastify, migrated to Elysia. Some code patterns (esp. in `app.ts`) reflect this.

2. **Frontend `ignoreBuildErrors: true`:** The next.config skips type errors during build. Use `npx tsc --noEmit` separately for type checking.

3. **wings-rs, not wings-go:** This project uses [wings-rs](https://github.com/calagopus/wings) (Rust). Stock Pterodactyl wings-go will NOT work.

4. **Proxmox stub methods:** `ProxmoxApiService` has ~30 method stubs that throw "Not supported" — safety net for Wings-only endpoints.

5. **Feature toggles are synchronous at route registration:** Features checked via `isFeatureEnabled()` in `routes/index.ts` gate entire route groups.

6. **CSRF token lifecycle:** Frontend auto-refreshes on 403. Token from `/api/auth/csrf-token`, stored in localStorage.

7. **Theme injection is SSR-critical:** Inline script in `layout.tsx` must run before first paint to avoid flash.

8. **Post-Quantum JWT:** Uses ML-DSA-65 (FIPS 204). Without `PQ_JWT_SEED`, random keypair each startup (invalidates all tokens).

9. **No root package.json:** Each sub-project has its own `package.json` with independent dependencies.

10. **CPU detection uses % of allocation:** Both scanner and Wings normalize CPU against `ServerConfig.cpu` limit. 95% raw on 6-vCPU server = ~16% of allocation, won't trigger false positive.

11. **Wings route conflict fix:** Security routes must use distinct paths (`/processes`, `/connections`, `/scan-files`). Identical `path = "/"` causes utoipa-axum panic on startup.

12. **SOC config stored in PanelSetting:** All SOC admin settings use `soc.*` prefix in `PanelSetting` table. Editable in Admin → SOC → Settings. Env vars are fallbacks only.

13. **Wings no-git:** `source/`, `patched/`, `output/` have no `.git` directories (removed to prevent nesting issues with `/v3` repo). Use `manage.sh` to manage patches, not `git commit` in subdirs.

14. **antiabuse/ folder is deprecated:** Detection now embedded in Wings (`antiabuse.rs`). The admin AntiAbuseTab processes incidents reported by Wings. The old `antiabuse/` Rust binary is no longer needed.

15. **The `.agents/` directory** contains agent skill definitions for UI/animation/design tasks — separate from this AGENTS.md.

---

*Last regenerated: 2026-07-10. Full SOC system + Wings security integration complete.*
