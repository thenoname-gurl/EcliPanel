# Design Context

The full canonical Design Context lives in `.better-web-ui.md` at the project root. This file mirrors the Design Context section for discoverability.

For the complete context — including Implementation Defaults, shadcn Customizations, and Design Principles — refer to `.better-web-ui.md` in the project root.

Below is an abbreviated summary:

## Users

EcliPanel serves a **mixed audience**: game server owners/managers, developers deploying apps, and hosting providers/teams.

**Job to be done**: Provision, manage, monitor, and secure game servers and applications across a distributed node network — from a single panel.

## Brand Personality

Modern, Clean, Professional — with a youth/developer-focused edge. Balanced middle ground: professional but with personality.

## Aesthetic Direction

- Dark-first with light theme options (14 themes in `frontend/lib/themes.ts`)
- Purple primary (`#8b5cf6`), deep backgrounds (`#0a0a12`), subtle glow effects
- Gently rounded corners (`0.75rem`), Geist/Geist Mono/Didact Gothic fonts
- framer-motion for micro-interactions, custom view-transitions for theme switching

## Design Principles

1. Establish hierarchy with spacing, weight, and typography before adding color or glow.
2. Use glow and animation sparingly as emphasis, not decoration.
3. Prioritize speed and clarity in every interaction.
4. Keep one obvious primary action per context.
5. Honor the theme system — always use CSS variables, never hardcode colors.
6. Design for a mixed audience without alienating any group.

> **See `.better-web-ui.md` for the full Design Context.**

# Progress Tracking — Proxmox VE Integration

## Goal
Complete Proxmox VE integration with v1/v2 API route separation and provider-aware frontend rendering.

## Constraints & Preferences
- Provider abstraction via `NodeProvider` interface with runtime `instanceof` checking
- Proxmox nodes use PVE API token auth directly (no wings-rs daemon)
- Route versioning: `/api/servers/v1/:id` for Wings, `/api/servers/v2/:id` for Proxmox
- Frontend delegates to `ServerViewV1` or `ServerViewV2` based on `server.provider` field
- V2 pages follow landing/docs design language (dark `#0a0a0f`, `border-white/20` cards, framer-motion)
- Common routes (power, stats, location) stay at `/api/servers/:id` for both providers
- `requireProvider()` middleware factory validates provider type per route

## Done
- Backend typecheck fixed: 0 errors (Wings-compatible method stubs in `ProxmoxApiService`, fixed type casts, power action narrowing, param types)
- `requireProvider()` middleware factory + `provider` field on `ServerInfo`
- Backend v2 Proxmox routes: `GET /api/servers/v2/:id`, `POST /api/servers/v2/:id/power`, `GET /api/servers/v2/:id/stats`, `GET /api/servers/v2/:id/configuration`
- `ServerViewV2.tsx` created — Proxmox server detail page (landing/docs design: dark `#0a0a0f`, purple accent, power buttons, resource grid, config panel, Quick Actions with Proxmox Web UI link)
- Server detail shell provider-aware: detects `server.provider === "proxmox"` → renders `ServerViewV2`
- `panel-config.ts` updated with `serverV2*` endpoints
- `ServerViewV2` calls v2 API endpoints with fallback to common endpoints
- All Wings-only routes migrated to `/api/servers/v1/:id` prefix (68 routes total: files, backups, sftp, commands, logs, reinstall, transfer, version, console, configurations, ipv6, suspend, unsuspend, kvm, schedules, sync, allocations, ip-request, network, startup, mounts, script, ws, websocket, install/abort, egg config, etc.)

## Blocked
- (none)

## Key Decisions
- **Route versioning instead of mixed guards**: `/api/servers/v1/:id` for Wings, `/api/servers/v2/:id` for Proxmox. Common ops (power, stats, delete) stay at `/api/servers/:id`. Frontend uses `server.provider` to choose renderer.
- **`requireProvider()` as middleware factory**: Same pattern as existing `authorize()` — returns async middleware that short-circuits with 400 on wrong provider type.
- **ProxmoxApiService stubs for Wings methods**: ~30 method stubs that throw "Not supported" (400) — safety net for Wings-only endpoints called on Proxmox servers.
- **`ServerViewV2` follows landing/docs design**: Same dark `#0a0a0f` background, purple accents, white border cards, framer-motion animations as the marketing pages.
- **v2 API calls with fallback**: `ServerViewV2` tries v2 endpoints first, falls back to common endpoints for backward compatibility.

## Next Steps
- User testing
- Frontend lint/typecheck verification

## Relevant Files
- `backend/src/handlers/serverHandler.ts`: All routes — v2 endpoints added, v1 prefix for Wings-only routes
- `backend/src/services/proxmoxApiService.ts`: Wings-compatible stubs + Proxmox-specific methods
- `backend/src/services/nodeService.ts`: Provider routing (`ProviderService` union type)
- `backend/src/types/nodeProvider.ts`: `ServerInfo` now includes `provider` field
- `frontend/app/dashboard/servers/[id]/page.tsx`: Provider-aware shell (delegates V1/V2)
- `frontend/app/dashboard/servers/[id]/ServerViewV2.tsx`: Proxmox server detail page
- `frontend/lib/panel-config.ts`: `serverV2*` endpoint constants