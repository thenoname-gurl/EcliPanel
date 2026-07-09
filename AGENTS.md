# AGENTS.md — EcliPanel v3

> **Auto-generated reference for AI agents.** This file maps the entire codebase so any LLM can understand structure, patterns, and conventions at a glance. Regenerate after major architecture changes.

---

## 1. What Is This?

EcliPanel v3 is an **enterprise-grade server management platform** — a complete rewrite of v1 (which was built on Jexactyl). It lets users provision, manage, monitor, and secure game servers and applications across a distributed node network from a single panel.

**Three core user groups:**
- Game server owners/managers
- Developers deploying apps
- Hosting providers/teams

**Key subsystems:**
| System | Language | Role |
|--------|----------|------|
| `backend/` | TypeScript (Bun) | REST API, auth, business logic, node orchestration |
| `frontend/` | TypeScript (Next.js 16) | Web UI, dashboard, user-facing pages |
| `antiabuse/` | Rust | Node-level abuse detection (DDoS, port scanning) |
| `tunnel/` | Rust | EcliTunnel — expose local services via public endpoints |
| `app/` | Electron/Capacitor | Desktop & mobile app wrappers |
| `systemd/` | systemd units | Production service definitions |

---

## 2. Repository Map

```
v3/
├── backend/                    # Bun + ElysiaJS API server
│   ├── src/
│   │   ├── index.ts            # Entry point — starts server on PORT (default 3000)
│   │   ├── app.ts              # Elysia app setup: CORS, JWT, helmet, OpenAPI, routes, jobs, error handling
│   │   ├── config/             # DB (TypeORM), Redis, app bootstrap (setupConfig)
│   │   ├── routes/index.ts     # Central route registration + feature toggle gates
│   │   ├── handlers/           # Route handlers (one file per domain, ~39 files)
│   │   ├── services/           # Business logic services (~35 files)
│   │   ├── models/             # TypeORM entities (~80 entities)
│   │   ├── middleware/         # auth, authorize (RBAC), CSRF, featureToggle, KYC, validation
│   │   ├── types/              # TypeScript type definitions
│   │   ├── jobs/               # Scheduled cron-like jobs (~17 jobs)
│   │   ├── workers/            # Bun worker threads (crypto, image, PDF, SFTP)
│   │   ├── utils/              # Utility functions (~30 files)
│   │   ├── mcp/                # Model Context Protocol server
│   │   ├── slack/              # Slack bot integration (Bolt SDK)
│   │   ├── i18n/               # Internationalization (en/ru)
│   │   ├── emails/             # React Email templates (15 templates)
│   │   ├── repositories/       # Custom TypeORM repositories
│   │   ├── data/               # Static data / seed data
│   │   └── migrations/         # DB migrations
│   ├── scripts/                # CLI scripts (promote, seed, jwt secrets, etc.)
│   └── tests/                  # Bun test files
│
├── frontend/                   # Next.js 16 App Router
│   ├── app/                    # Pages (App Router)
│   │   ├── layout.tsx          # Root layout: fonts, theme injection, AuthProvider, global guards
│   │   ├── dashboard/          # Protected dashboard routes
│   │   │   ├── servers/        # Server list + [id] detail (V1/V2 provider-aware)
│   │   │   ├── admin/          # Admin panel (tabs/)
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
│   │   ├── ui/                 # shadcn/ui components (~55 components)
│   │   ├── panel/              # Panel-specific components (sidebar, header, guards, banners)
│   │   └── activity/           # Activity feed components
│   ├── hooks/                  # React hooks (useAuth, useDebounce, useMobile, etc.)
│   ├── lib/                    # Core libraries
│   │   ├── panel-config.ts     # CENTRAL CONFIG: API endpoints, nav, branding, portals, feature flags
│   │   ├── api-client.ts       # apiFetch() with CSRF, retry, caching
│   │   ├── themes.ts           # 14 theme definitions (CSS variable maps)
│   │   ├── utils.ts            # cn() utility (clsx + tailwind-merge)
│   │   └── ...                 # Other lib files
│   ├── i18n/                   # next-intl config
│   ├── messages/               # Translation files (en.json, ru.json)
│   ├── types/                  # Frontend TypeScript types
│   ├── public/                 # Static assets (images, fonts, spark analyzer configs)
│   ├── middleware.ts            # Next.js middleware: auth guard, SEO bot verify, short URLs
│   ├── next.config.mjs         # Rewrites (/api→backend, /wings→wings, /uploads→backend)
│   └── components.json         # shadcn/ui config (new-york, neutral, CSS vars)
│
├── antiabuse/                  # Rust anti-abuse daemon
│   ├── Cargo.toml
│   ├── src/                    # Rust source
│   ├── signatures/             # Abuse detection signatures
│   └── .env.example
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
├── systemd/                    # Production systemd units
│   ├── eclipanel-backend.service
│   ├── eclipanel-frontend.service
│   └── eclipanel-antiabuse.service
│
├── wings/                      # wings-rs backups (ZIP)
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
12. Scheduled jobs (17 cron jobs)
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
- `authorize(...permissions)` — RBAC check using permission strings like `"servers:read"`, `"admin:access"`
- `requireProvider("wings"|"proxmox")` — validates node provider type
- `csrfProtection()` — checks `x-csrf-token` header on mutating requests

**Permission format:** `resource:action` (e.g., `servers:create`, `admin:users`). Wildcards: `*` (superadmin), `servers:*`.

### 3.5 Route Registration Pattern

Every handler exports a function following this pattern:

```typescript
// backend/src/handlers/xxxHandler.ts
export function xxxRoutes(app: ServerApp, prefix = '') {
  // Group routes under prefix
  app.get(`${prefix}/xxx`, handlerFn, { beforeHandle: [authenticate, authorize('xxx:read')] })
  app.post(`${prefix}/xxx`, handlerFn, { beforeHandle: [authenticate, authorize('xxx:create')] })
  // ...
}
```

All routes are registered in `backend/src/routes/index.ts` via `registerRoutes(app)`. Feature toggles are checked here before delegating to handlers.

### 3.6 Handler Context

The `AuthenticatedHandlerContext` extends Elysia's context with:
- `ctx.user` — the authenticated User entity
- `ctx.apiKey` — API key if used
- `ctx.jwtPayload` / `ctx.pqJwtPayload` — decoded token payloads
- `ctx.t` — i18n translation function
- `ctx.log` — logger
- `ctx.clientIP` — resolved client IP
- `ctx.store` — mutable request-scoped store

### 3.7 Major Handler Files

| File | Lines | Purpose |
|------|-------|---------|
| `adminHandler.ts` | 9,815 | Admin panel: users, servers, nodes, stats, fraud, anti-abuse, export jobs, settings |
| `serverHandler.ts` | 7,893 | Server CRUD, power, files (SFTP + Wings), backups, databases, plugins, players, WebSocket proxy, v1/v2 Proxmox routes |
| `userHandler.ts` | 2,413 | User profile, registration, settings, avatars, favorites |
| `authHandler.ts` | 2,392 | Login, logout, 2FA, passkeys, password reset, email verify, OAuth, student verification |
| `nodeHandler.ts` | 1,214 | Node CRUD, heartbeats, allocations, Proxmox storage/templates |
| `tunnelHandler.ts` | — | Tunnel device enrollment, allocation, WebSocket |
| `organisationHandler.ts` | — | Org CRUD, members, invites, DNS zones |
| `chatHandler.ts` | — | Chat channels, messages, WebSocket |
| `eloHandler.ts` | — | ELO projects, voting, leaderboard, devlogs |

### 3.8 Service Layer

Services encapsulate business logic and external API calls:

| Service | Purpose |
|---------|---------|
| `nodeService.ts` | Node → ProviderService routing (WingsApiService or ProxmoxApiService), caching |
| `wingsApiService.ts` | HTTP client for wings-rs daemon API |
| `proxmoxApiService.ts` | HTTP client for Proxmox VE API (token auth) |
| `wingsSocketService.ts` | WebSocket listener for wings node events |
| `nodeHeartbeatService.ts` | Periodic node health checks |
| `mailService.ts` / `mailcowService.ts` | Email sending via nodemailer + Mailcow API |
| `sftpClientService.ts` / `sftpProxyService.ts` | SFTP file operations |
| `serverDesiredStateService.ts` | Restore power states after node reconnect |
| `cloudflareService.ts` | DNS zone/record management via CF API |
| `retentionService.ts` | Data retention policy enforcement |
| `fraudService.ts` | Fraud detection (TensorFlow face-api) |
| `metricsCollector.ts` / `metricsService.ts` | Resource usage metrics |
| `tunnel.service.ts` | Tunnel allocation and device management |
| `visualEditorService.ts` | Visual infrastructure editor |
| `passkeyService.ts` | WebAuthn/passkey operations |
| `aiSocketService.ts` / `chatSocketService.ts` / `socSocketService.ts` | WebSocket management |
| `outboundEmailService.ts` | Outbound email queue processing |
| `rolloutService.ts` | Feature rollout management |
| `exportJobService.ts` | Data export job processing |
| `githubContributorsService.ts` | GitHub contributor data sync |

### 3.9 Node Provider Architecture

Wings and Proxmox nodes are abstracted behind the `NodeProvider` interface (`types/nodeProvider.ts`):

```typescript
interface NodeProvider {
  getSystemInfo(): Promise<SystemInfo>;
  getServers(): Promise<{ data: ServerInfo[] }>;
  getServer(id: string): Promise<{ data: ServerInfo }>;
  createServer(payload: CreateServerPayload): Promise<any>;
  deleteServer(id: string): Promise<void>;
  powerServer(id, action): Promise<any>;
  getStats(id: string): Promise<ServerStats>;
}
```

**Provider selection:** `nodeService.getServiceForNode(nodeId)` checks `node.provider` field — returns `WingsApiService` or `ProxmoxApiService`. Cached per node.

**Route versioning:**
- `/api/servers/v1/:id/*` — Wings-only endpoints (files, backups, SFTP, console, schedules, etc.)
- `/api/servers/v2/:id/*` — Proxmox-only endpoints (configuration, power, stats)
- `/api/servers/:id` — Common endpoints (power, stats, delete, detail) for both providers

### 3.10 Database

- **ORM:** TypeORM with `reflect-metadata`
- **Databases:** MariaDB (primary), MySQL, PostgreSQL
- **Entities:** ~80 entity files in `models/`
- **Config:** `config/typeorm.ts` — `AppDataSource`
- **Key entities:** User, ServerConfig, ServerMapping, Node, Organisation, Order, Plan, Ticket, etc.
- **Redis:** Used for caching (`withRedisCache`), session storage, rate limiting

### 3.11 Scheduled Jobs

All scheduled in `initApp()`:

| Job | Purpose |
|-----|---------|
| `studentReverifyJob` | Periodically reverify student status |
| `metricsCollectionJob` | Collect server resource metrics |
| `exportJobRunner` | Process data export jobs |
| `deletionExecutionJob` | Execute scheduled account deletions |
| `mailboxSyncJob` | Sync IMAP mailboxes |
| `outboundEmailRunner` | Process outbound email queue |
| `adminBroadcastJobRunner` | Send admin broadcasts |
| `sunsetPolicyJob` / `serverSunsetPolicyJob` | Enforce sunset policies |
| `githubContributorsJob` | Sync GitHub contributor stats |
| `tunnelCleanupJob` | Clean stale tunnel allocations |
| `renewalJob` | Process subscription renewals |
| `lifetimeInactivityJob` | Handle inactive accounts |
| `eloDecayJob` | ELO score decay |
| `tempEmailBlacklistSyncJob` | Sync temp email blacklist |
| `wingsSyncJob` | Sync with wings nodes |
| `calendarNotificationJob` | Send calendar event reminders |

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
- **Markdown:** react-markdown + remark-gfm + rehype-slug + shiki (syntax highlighting)

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

**This is the single source of truth for:**
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
- **SEO bot verification:** Verifies crawler IPs against official ranges (Google, Bing, Yandex, etc.)
- **Short URL resolution:** `/a/:code` and `/:code` → backend lookup → 302 redirect
- **Chat bypass:** `/dashboard/chat` is explicitly public (no auth required)

### 4.6 Key Frontend Components

**Global (in root layout):**
- `AuthProvider` — provides `user`, `login`, `logout`, `refreshUser` via React Context
- `GlobalLinkGuard` — intercepts external link clicks, shows warning modal
- `GlobalImageProxy` — proxies external images through backend for security
- `Guide` — onboarding/walkthrough overlay
- `GlobalQueryBanner` — shows banners based on URL query params

**Dashboard shell:**
- `sidebar.tsx` — collapsible sidebar with nav sections, org switcher, user menu
- `header.tsx` — top bar with breadcrumbs, search, notifications
- `feature-guard.tsx` — conditionally renders children based on feature flags
- `rollout-guard.tsx` — conditionally renders based on rollout status
- `enforcement-banner.tsx` — shows KYC/suspension/sunset notices
- `feedback-dialog.tsx` — feedback collection modal

**Server detail:**
- `ServerViewV1.tsx` — Wings server detail (files, console, backups, etc.)
- `ServerViewV2.tsx` — Proxmox server detail (dark theme, resource grid, config panel)

---

## 5. Anti-Abuse System (Rust)

```
antiabuse/
├── Cargo.toml          # Rust project config
├── src/                 # Main source (lib.rs or main.rs)
├── signatures/          # Abuse detection rule signatures
├── .env.example         # BACKEND_URL, API keys
└── antiabuse.png        # Architecture diagram
```

**How it works:**
1. Runs as a systemd daemon on every node alongside wings
2. Watches outbound TCP SYN traffic
3. Detects suspicious patterns (port scanning, DDoS-like bursts)
4. On detection: suspends the offending server via backend API, reports incident
5. Backend sends email notifications, exposes incidents in admin panel
6. Signatures are obfuscated to prevent reverse-engineering

**Build:** `cargo build --release`
**Deploy:** systemd unit → `/etc/systemd/system/eclipanel-antiabuse.service`

---

## 6. EcliTunnel (Rust)

```
tunnel/
├── client/             # Client agent (runs on user's machine)
├── server/             # Server agent (runs on publicly-accessible host)
├── deploy.sh           # One-command install + run script
└── README.md           # Full usage docs
```

**Data path:** `internet → server agent (port 20000-29999) → client agent → local service`

**Control plane:** WebSocket at `/api/tunnel/ws` (backend)

**Flow:**
1. Client enrolls → gets code → admin approves in panel
2. Client opens tunnel → backend allocates port → server agent binds port
3. Client connects to server with one-time direct token
4. Traffic flows directly between agents (no backend passthrough)

**Quick start:**
```bash
curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- open --port 8080
```

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
/* ✅ Good */
color: var(--primary);
background: var(--background);

/* ❌ Bad */
color: #8b5cf6;
background: #0a0a12;
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
2. Import in `config/typeorm.ts` if needed (most use auto-discovery)
3. Use `AppDataSource.getRepository(Entity)` in handlers/services
4. Create migration if schema change needed

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
| `EXIT_ON_UNCAUGHT` | Set to `1` to exit on uncaught exceptions |

### Frontend (`frontend/.env`)
| Variable | Purpose |
|----------|---------|
| `BACKEND_URL` | Backend API base URL (for SSR + rewrites) |
| `NEXT_PUBLIC_API_BASE` | Client-side API base URL |
| `NEXT_PUBLIC_WINGS_BASE` | Wings node base URL for direct /wings rewrites |
| `NEXT_PUBLIC_COMMIT_SHA` | Display version in UI |

---

## 10. Quick File Finder

| What | Where |
|------|-------|
| App bootstrap | `backend/src/app.ts` |
| Entry point | `backend/src/index.ts` |
| All routes registered | `backend/src/routes/index.ts` |
| Auth middleware | `backend/src/middleware/auth.ts` |
| RBAC middleware | `backend/src/middleware/authorize.ts` |
| Node provider interface | `backend/src/types/nodeProvider.ts` |
| Server handler (largest) | `backend/src/handlers/serverHandler.ts` |
| Admin handler | `backend/src/handlers/adminHandler.ts` |
| Frontend config | `frontend/lib/panel-config.ts` |
| API client | `frontend/lib/api-client.ts` |
| Theme definitions | `frontend/lib/themes.ts` |
| Root layout | `frontend/app/layout.tsx` |
| Auth provider | `frontend/hooks/useAuth.tsx` |
| Middleware (auth guard) | `frontend/middleware.ts` |
| Next.js config | `frontend/next.config.mjs` |
| shadcn config | `frontend/components.json` |
| Design context | `.better-web-ui.md` |
| Anti-abuse (Rust) | `antiabuse/src/` |
| Tunnel (Rust) | `tunnel/client/`, `tunnel/server/` |
| Systemd units | `systemd/` |
| Electron app | `app/electron/` |

---

## 11. Gotchas & Important Notes

1. **Migrated from Fastify:** The backend was originally Fastify, migrated to Elysia. Some code patterns (esp. in `app.ts`) reflect this — the code comments acknowledge the mess.

2. **TypeScript `ignoreBuildErrors: true`:** The frontend next.config skips type errors during build. Use `tsc --noEmit` separately for type checking.

3. **wings-rs, not wings-go:** This project uses [wings-rs](https://github.com/calagopus/wings) — Pterodactyl's stock wings-go will NOT work with most features.

4. **Proxmox stub methods:** `ProxmoxApiService` has ~30 method stubs that throw "Not supported" (400) — safety net for Wings-only endpoints called on Proxmox servers.

5. **Feature toggles are synchronous at route registration:** Features are checked via `isFeatureEnabled()` in `routes/index.ts` — they gate entire route groups, not individual endpoints.

6. **CSRF token lifecycle:** Frontend auto-refreshes CSRF token on 403. The token comes from `/api/auth/csrf-token` and is stored in localStorage.

7. **Theme injection is SSR-critical:** The inline script in `layout.tsx` must run before first paint to avoid flash of wrong theme.

8. **Anti-abuse signatures are obfuscated:** The `antiabuse/signatures/` folder is deliberately modified to prevent abusers from understanding detection patterns.

9. **Tunnel ports:** Server agent uses ports `20000-29999` — ensure firewall allows inbound TCP on this range.

10. **Post-Quantum JWT:** Uses ML-DSA-65 (FIPS 204). Without `PQ_JWT_SEED` env var, a random keypair is generated each startup (invalidating all existing tokens).

11. **No root package.json:** Each sub-project (`backend/`, `frontend/`, `app/`) has its own `package.json` with independent dependencies.

12. **The `.agents/` directory** contains agent skill definitions for UI/animation/design tasks — these are separate from this AGENTS.md and define how agents should handle frontend design work.

---

*Last regenerated: 2026-07-09. To update after architecture changes, ask an AI agent to re-scan the repo and regenerate this file.*
