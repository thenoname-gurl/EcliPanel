<p align="center">
  <img src="./eclipanel.png" alt="EcliPanel" width="640" />
</p>

# What is EcliPanel?
EcliPanel is an enterprise grade server management platform with built in DNS management for organisations,
team control, Docker support, and KVM (QEMU) virtualization.

It also includes integrated applications for staff workflows, feedback collection, and abuse reporting.
On top of that, EcliPanel offers AI assisted features and a powerful anti-abuse detection system.

# Why was EcliPanel v3 made?
EcliPanel v3 is a complete rewrite of the original EcliPanel v1, which itself was built on top of the Jexactyl panel. Maintenance of EcliPanel v1 was not possible due of its size and architecture.

# What is our goal?
The goal of this iteration is to provide a fully in‑house backend and modernized frontend while keeping the codebase open source for non commercial use.

# You're already interested?
Want to see more than code? Check out [hosting that uses EcliPanel v3 in production](https://ecli.app/).

# Structure
This repository contains seven folders:

- `/backend` – Elysia/Bun panel API interacting with Wings nodes and MariaDB.
- `/eggs` - Contains Debian 13 VM Egg used in [ecli.app](https://ecli.app).
- `/frontend` – Astro + React application. Pages communicate with the backend (and optionally directly with Wings) via the helper and etc.
- `/halo` - Lightweight reverse proxy for EcliPanel and its systems.
- `/systemd` – Systemd unit files.
- `/tunnel` - Expose local services via public tunnel endpoints managed by EcliPanel.
- `/wings` - Our custom modified wings-rs with embedded security & anti-abuse.

## Documentation

**Full setup & configuration documentation lives on the website:**

👉 **https://ecli.app/docs/eclipanel**

It covers a complete production install of EcliPanel and every component:
Wings (wings-rs), backend & frontend configuration with the full
`.env` reference, EcliHalo reverse proxy, dockerised Mailcow (API key,
Dovecot master user, SMTP relay), EcliTunnels, and production
hardening.

Side Note: EcliAegis (DDoS protection) is closed source as of now and therefore is not covered there.

More docs:
- [EcliHalo (reverse proxy)](https://ecli.app/docs/eclihalo)

## Quick start

1. **Install Wings** — EcliPanel is built around [wings-rs](https://github.com/calagopus/wings). You may **NOT** use wings-go (Pterodactyl stock); most features will not work. AntiAbuse ships inside Wings — nothing extra to install. View build instructions [here](https://ecli.app/docs/eclipanel#2-build-wings-first).

2. **Backend**
   ```bash
   cd backend
   bun install
   bun run gen:jwt-secret      # set secrets in .env (see .env.example)
   bun run gen:pq-jwt-seed
   bun run gen:default-role
   ./start.sh                  # or: bun src/index.ts (dev)
   ```

3. **Frontend (Astro + React)**
   ```bash
   cd frontend
   pnpm install
   cp .env.example .env        # set BACKEND_URL, branding in lib/panel-config.ts
   ./start.sh --port 3000      # or: ./dev.sh --port 3000 (dev)
   ```

4. **Reverse proxy** — EcliHalo (see [docs](https://ecli.app/docs/eclihalo) or any
   proxy. Point it at the frontend (3000) and backend.

5. **Mailcow (optional)** — dockerised mail server for mailboxes:
   deploy Mailcow, create an API key, set the `MAILCOW_*`,
   `MAILBOX_*`, `DOVECOT_*` and SMTP variables in backend `.env`.
   Full steps in the [setup guide](https://ecli.app/docs/eclipanel).

> ⚠️ Remember to set `.env` variables for production (database, auth
> secrets, API base URL, etc.). For production deployments use a
> reverse proxy like EcliHalo or Nginx.

## Notes
- The backend uses the `.env` file in `backend/`.
- The frontend uses `.env` in `frontend/`.
- The API routes are documented in `example.com/openapi` and should be used by the
  frontend code.
- You might need to run `npm rebuild @tensorflow/tfjs-node --build-from-source` on backend to make selfie verification work!

> You may view API routes without deploying at https://backend.ecli.app/openapi for production or https://backend.canary.ecli.app/openapi for canary.
> Canary version of EcliPanel are offline during non developmet periods.

## Optimization
Here is some small overview about optimisation we have done!
- `frontend/lib/api-client.ts`
  - We have implemented in memory GET caching with `API_CACHE_TTL = 60s`.
  - Cache hit avoid repeated REST downloads for frequent read operations.
- `frontend/app/dashboard/servers/[id]/page.tsx`
  - Added `useMemo` around stats history data (`chartData`) to avoid recomputing on every render..
  - Already existing lazy loading of heavy dependencies (`@monaco-editor/react`, `recharts`) is now leveraged more aggressively in tab use patterns, so the app initial bundle reduces first paint cost.

Happy exploring!
>Side note: 
> This project took part in [Flavortown](https://flavortown.hackclub.com/projects/15802?ref=eclipsesystems), [Macondo](https://macondo.hackclub.com/projects/506?ref=HHDFS) and in [Beest](https://beest.hackclub.com/?ref=eclipsesystems)!
> I do not get paid for developing this and entire hosting is not profitable enough to cover development costs,
> if you really liked panel atleast star the repo or go order something from us https://ecli.app/


Official Mirror is avaliable at [EclipseSystems Git Instance](https://git.ecli.app/ecli.app/EcliPanel)!