<p align="center">
  <img src="./eclipanel.png" alt="EcliPanel" width="640" />
</p>

EcliPanel v3 is a complete rewrite of the original EcliPanel v1, which itself was built on top of the Jexactyl panel.

The goal of this iteration is to provide a fully in‑house backend and modernized frontend while keeping the codebase open source for non commercial use.


⚠️ This is still in-dev project bugs might happen, tho it was tested and should be save to use in production!

Interested on how this project looks? Check out showcase [by clicking here](/SHOWCASE.md)


> ⚠️ **Open Source (Non‑Commercial Only)**  
> This project is open source under a **non‑commercial license**. 
> The source code is fully available, but commercial use is restricted to  
> **EclipseSystems (Misiu LLC)** and **Maksym Huzun**.
> Overview: https://ecli.app/license and [LICENSE](/LICENSE)
>
> **AI Usage Transparency:**  
> We maintain a strict *0% AI‑generated backend policy*.
> All backend logic is hand‑crafted.
> AI assistance is limited to:
> – error explanation
> – debugging guidance
> – non‑creative code completion
> – documentation clarity
> – vulnerability fixes
>
> For community expectations, see:  
> – [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)  
> – [`SECURITY.md`](./SECURITY.md)

This repository contains two folders:

- `/backend` – Elysia/TypeScript panel API interacting with Wings nodes and
  MariaDB.
- `/frontend` – Next.js (React) application. Pages communicate with the
  backend (and optionally directly with Wings) via the helper and etc.

## Running the stack

1. **Start Wings**
We use wings-rs (https://github.com/calagopus/wings) and develop around them,
You may use wings-go (pterodactyl stock) but it is untested and some features will not work!

2. **Start backend**
   ```powershell
   cd backend
   # Bun is recommended since it runs the TypeScript directly, but..
   # the old Node build path still works if Bun isn't installed
   bun install      # or `pnpm install`/`npm install` if you prefer
   sudo apt install ffmpeg #if using captcha
   sudo apt install espeak #if using captcha
   bun run gen:jwt-secret # generate JWT Secret (set in .env as JWT_SECRET=generated-string)
   bun run gen:jwt-secret # generate Encryption Key just like JWT Secret (set in .env as NODE_ENCRYPTION_KEY=generated-string)
   nano .env        # edit .env (see .env.example)
   bun run gen:default-role # create default role
   # for development you can simply run:
   bun src/index.ts
   # or use the helper scripts which choose Bun when available:
   ./build.sh      # compiles TS for Node if needed (Skip if using bun)
   ./start.sh      # launches the server (Do this directly if using bun)
   ```
   Backend listens on specified port (see `.env`).
   It will serve the REST API, handle multi node mapping, and proxy websocket connections to Wings servers, etc..

3. **Start frontend**
   ```bash
   cd frontend
   pnpm install
   nano .env # edit .env (see .env.example)
   nano lib/panel-config.ts # edit panel config branding etc
   ./dev.sh --port 3000 # start in dev mode (--port is optional)
   ./start.sh --port 3000 # start in production mode (--port is optional)
   ```
   Frontend will run on http://localhost:3000 and automatically proxy
   `/api/*` requests to the backend and `/wings/*` to the Wings node(s)
   via the `next.config.mjs` rewrites. Set environment variables to function properly!!

> ⚠️ Remember to set `.env` variables for production (database, auth secrets, API base URL, etc.).
>     For production deployments use reverse proxy like Nginx.

### Backend scripts

The backend includes a couple of helper scripts used during setup.

- **Seed default permissions** - creates the `rootAdmin` role and grants full permissions (including `*`).

  ```bash
  cd backend
  bun run seed
  ```

- **Promote a user** - set an existing user to `rootAdmin` (or another role).

  ```bash
  cd backend
  bun run promote -- <email> [role]
  ```

  Examples:

  ```bash
  bun run promote -- admin@example.com
  bun run promote -- admin@example.com rootAdmin
  bun run promote -- admin@example.com admin
  ```

### Useful commands

```bash
# run backend locally
cd backend && ./start.sh # bun recommended!

# run frontend locally (dev)
cd frontend && pnpm run dev

# run frontend locally (prod)
cd frontend && pnpm run build # build
pnpm run start # start
```

### Optional: process managers

For stable long-running services in production, use a process manager such as `pm2`, `systemd`, or `docker` to keep services alive and restart on failure.

### Optional & Advanced: Deploys with Docker

If you want a container setup, you can wrap each service in a Dockerfile and use docker-compose to orchestrate the frontend, backend, and Wings.

### Notes

- The backend uses the `.env` file in `backend/`.
- The frontend uses `.env` in `frontend/`.

### Troubleshooting

If the frontend cannot reach the backend, check:
- `NEXT_PUBLIC_API_BASE` is set correctly (just in case)
- backend is running & reachable
- reverse proxy is passing through `/api/*` and `/wings/*` correctly

### Wings sockets

The panel will only open a background socket listener for Wings if at least
one node record exists in the database.
You must add a node via the `/nodes` API before any socket activity will start.
This avoids any attempt to reach an absent Wings endpoint when the system is fresh.

## Notes

- The API routes are documented in `example.com/openapi` and should be used by the
  frontend code.

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

## Optimization Results (observed)
- Repeated dashboard refresh calls for mostly-read endpoints now hit the JS cache and skip server round trips for the 60s window which improves UX.
- Stats tab no longer recomputes chart data on unrelated state changes, CPU usage and React render churn go down! (YAY)
- Page load intial rendering is faster in cold loads because Monaco and charting engine only download when needed..

### Optimization visual comparison
Before and after optimization showed performance improvement on most pages avg at 10-20 points per page!

<p float="left">
  <img src="./showcase/Before-Optimisation.png" alt="Before optimization" width="45%" />
  <img src="./showcase/After-Optimisation.png" alt="After optimization" width="45%" />
</p>


Happy exploring!
>Side note: 
> [This project](https://flavortown.hackclub.com/projects/15802?ref=eclipsesystems) took part in [flavortown](https://flavortown.hack.club/?ref=eclipsesystems)!
> I do not get paid for developing this and entire hosting is not profitable enough to cover development costs, 
> if you really liked panel atleast star the repo or go order something from us https://ecli.app/