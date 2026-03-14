---
name: EcliPanel Copilot
description: System Architecture Summary for EcliPanel. Use this as a reference for understanding the overall structure and components of the project when generating code or documentation.
---

### **1. `backend` - Bun + Elysia.js API Server**

- TypeScript backend running on **Bun**.  
- HTTP/WS server powered by **Elysia.js**.
- Core responsibilities:
  - Authentication & sessions  
  - User + organization management  
  - Billing  
  - AI endpoints  
  - DNS management  
  - Ticketing  
  - Proxying all communication to **Wings** nodes  
- Exposes a REST API consumed by the frontend.

---

### **2. `frontend` - Next.js 16 Application**

- Built with **Next.js 16 (App Router)**.  
- UI stack: **shadcn/ui** + **Tailwind CSS**.  
- All API calls must go through:
  - `frontend/lib/api-client.ts` (`apiFetch`)
- The frontend is a standalone application and does **not** run inside the backend.

---

### **3. `wings` - Rust Node Daemon**
Source: https://github.com/calagopus/wings

- Rust‑based agent (read‑only in this repository).  
- Backend communicates with Wings via:
  - `WingsApiService` (HTTP + WebSocket)

## **Runtime & Tooling Notes**

- **Backend:** Bun
- **Frontend:** pnpm + Node.js
- **Wings:** Rust (external project)
- Backend and frontend run as separate processes.  
- Backend is the authoritative API and orchestration layer for the entire platform.
- Wings are deployed on servers and are responsible for managing game server processes, but they do not handle any user management, billing, or other platform features.