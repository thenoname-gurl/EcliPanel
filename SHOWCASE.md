<p align="center">
  <img src="./eclipanel.png" alt="EcliPanel" width="640" />
</p>

# EcliPanel - Showcase

This is a concise showcase and overview of the EcliPanel project. This document highlights the platform's features, architecture, and provides a gallery of UI screenshots.

## What is EcliPanel

EcliPanel is a full-featured game server control panel and orchestration platform. It provides teams and organizations a secure, multi-tenant interface to manage game servers, users, billing, DNS, AI endpoints, and integrations to remote Wings nodes (the agent daemon).

## Key Features

- Multi-tenant organizations & roles: user, admin, organisation management
- Authentication & sessions, email verification, API keys
- Server lifecycle management: create, start/stop, install, backup
- Wings integration: HTTP + WebSocket proxying to remote agents
- Billing, plans, and order management
- Ticketing and audit/logs
- DNS management and domain provisioning
- SSH key management and subuser support
- AI endpoints and request/usage tracking
- Uploads, document verification, and admin tools
- And much more

## Architecture Summary

- Backend: Bun + Elysia.js (TypeScript) — REST and WebSocket APIs
- Frontend: Next.js 16 (App Router) with shadcn/ui and Tailwind CSS
- Wings: Rust-based agent (external project) — manages game servers on host nodes
- Database: MariaDB and Redis for sessions/caching
- Communication: backend proxies API and WS traffic to Wings nodes; frontend talks to backend via `api-client`

## Quick Start (for developers)

1. Backend: run `backend/start.sh` (dev) or `backend/build.sh` (build).
2. Frontend: run `frontend/dev.sh` (dev) or `frontend/start.sh` (prod).
3. Wings: located in `wings/wings-main` (Rust/Compose), runs separately.

Refer to the repository README for detailed environment setup and secrets.

## Screenshots / Visual Showcase

All screenshots are stored in the `showcase/` folder. Below is a gallery of every file currently present in that folder.

> **Tip:** If you want the images rendered in a GitHub preview, keep the `showcase/` folder at the repo root.

### Account

![Account — Activity](showcase/Account%20%20Activity.png)
![Account — API](showcase/Account%20API.png)
![Account — Editor](showcase/Account%20Editor.png)
![Account — Notifications](showcase/Account%20Notifications.png)
![Account — Security](showcase/Account%20Security.png)
![Account — Settings](showcase/Account%20Settings.png)
![Account — Theme](showcase/Account%20Theme.png)

### Admin

![Admin — Orders](showcase/Admin%20%20Orders.png)
![Admin — AI Models](showcase/Admin%20AI%20Models.png)
![Admin — Audit](showcase/Admin%20Audit.png)
![Admin — DBs](showcase/Admin%20DBs.png)
![Admin — Deletions](showcase/Admin%20Deletions.png)
![Admin — Fraud](showcase/Admin%20Fraud.png)
![Admin — Nodes / Stats History](showcase/Admin%20Nodes%20%20Stats%20History.png)
![Admin — Nodes](showcase/Admin%20Nodes.png)
![Admin — OAuth](showcase/Admin%20OAuth.png)
![Admin — Orgs](showcase/Admin%20Orgs.png)
![Admin — Plans](showcase/Admin%20Plans.png)
![Admin — Roles](showcase/Admin%20Roles.png)
![Admin — Servers](showcase/Admin%20Servers.png)
![Admin — Settings](showcase/Admin%20Settings.png)
![Admin — Tickets](showcase/Admin%20Tickets.png)
![Admin — Users](showcase/Admin%20Users.png)
![Admin — Wings](showcase/Admin%20Wings.png)

### Core Panel

![AI Chat](showcase/AI%20Chat.png)
![AI Studio](showcase/AI%20Studio.png)
![Backups](showcase/Backups.png)
![Billing](showcase/Billing.png)
![Console](showcase/Console.png)
![DNS](showcase/DNS.png)
![Databases](showcase/Databases.png)
![Files](showcase/Files.png)
![Identity](showcase/Identity.png)
![Mounts](showcase/Mounts.png)
![Network](showcase/Network.png)
![Nodes](showcase/Nodes.png)
![SOC Dashboard](showcase/SOC%20Dashboard.png)
![Schedules](showcase/Schedules.png)
![Server Templates](showcase/Server%20Templates.png)
![Settings](showcase/Settings.png)
![Startup](showcase/Startup.png)
![Stats](showcase/Stats.png)
![Subusers](showcase/Subusers.png)
![Tickets](showcase/Tickets.png)

> Notes for images:
> - All images in this document are located in `showcase/`.
> - Certain images are modified to hide sensetive data.
