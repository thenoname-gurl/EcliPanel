"use client"
import { Md } from "../_components/md";

const content = `
# Tundra Tunnels

Tundra gives every game server a **private address on an encrypted mesh**. Once your server is on the mesh, other enrolled servers can reach it directly — no public IPs, no port forwarding, no extra firewall rules — using the peer's private address on the port it hosts.

---

## Who Can Use Tunnels

| Role | What they can do |
|------|------------------|
| **Server owner** | Full control: create, edit ports, connect, delete |
| **Subuser with "Tunnel" permission** | Same control as the owner, from the same Tunnels tab |
| **Subuser without the permission** | The Tunnels tab stays hidden |

**Granting a subuser access:** open the server's **Subusers** tab → edit a subuser → tick **Tunnel** (under your server's permission list) → **Save**. The subuser then sees the **Tunnels** tab on the server.

---

## Step-by-Step: Create a Tunnel

### 1. Open the Tunnels Tab

1. Go to **Dashboard → Servers**
2. Click a server → **Tunnels** tab (between Network and Firewall)

### 2. Create the Tunnel

If the server isn't on the mesh yet you'll see a "No tunnel configured" box with a name field:

- **Name** — optional. Leave blank and a name is generated from your server's name.
- Click **Create Tunnel**.

> **Name rules:** 1–63 chars, lowercase letters, digits and dashes only. A name that is *exactly* eight hex characters (e.g. \`a1b2c3d4\`) is reserved — pick something else or leave blank.

The status box now shows your tunnel's **Tunnel Name**, **Private address** (a \`127.0.1.x\` address auto-assigned from the mesh) and the creation time.

### 3. Expose Ports

Click **Edit ports**. Add a row for each service you want reachable:

| Field | What to Enter |
|-------|---------------|
| **Destination port** | The port your server listens on (e.g. \`25565\` for Minecraft) |
| **Protocol** | \`TCP\` or \`UDP\` — match your service |

Add more rows as needed (or click **×** to remove) and press **Save**.

> Keep the port list to services you actually want peers to reach. Every exposed port is reachable by any peer you are connected to, on your private address.

### 4. Connect to Another Server

1. In the **Connections** section, click **Connect**
2. Search for the target server by name
3. Click **Connect** on the target's row

**Direction matters, and is controlled per server:**

- **Outgoing** (this server → target): *this* server may reach the target. Use on the client that initiates (e.g. the proxy reaching backends).
- **Incoming** (target → this server): *this* server may be reached by the target. Comes from the connection created on the target's side.

Each peer you're connected to appears under **Outgoing** (servers you can reach) or **Incoming** (servers that can reach you), showing the peer's name and mesh alias/address with a trash button to disconnect.

### 5. Test the Tunnel

From the *source* server, reach the peer on its **private address + exposed port**:

\`\`\`bash
# Example: proxy connecting to a backend on 127.0.1.6 port 25565
nc -zv 127.0.1.6 25565
# → Connection to 127.0.1.6 25565 port [tcp/*] succeeded!
\`\`\`

In proxy configs (Velocity, BungeeCord, etc.) use the backend's **private address** and the backend's **exposed port** as the target — e.g. \`127.0.1.6:25565\`.

---

## Managing Existing Tunnels

### Rename

In the status box, click **Rename** and type the new name (same rules as above).

### Add / Remove Ports

Click **Edit ports** → add rows or click **×** to remove → **Save**.

### Disconnect

In **Outgoing / Incoming**, click the trash button on a connection → confirm.

### Delete the Tunnel

Click **Delete Tunnel** → confirm. This removes your server from the mesh and disconnects all peer connections.

---

## Common Use Cases

### Minecraft Proxy → Backend Servers

| Server | Role | Exposed Port |
|--------|------|--------------|
| Proxy (Velocity) | Not exposed — it initiates | — |
| Backend 1 | Exposed to proxy | TCP 25565 |
| Backend 2 | Exposed to proxy | TCP 25565 |

**Setup:**
1. Create tunnels on all three servers
2. On each backend: Edit ports → expose TCP 25565
3. On the proxy: Connect → each backend (they appear under **Outgoing**)
4. In Velocity config, point to each backend's private address on 25565

### Database → App Server

| Server | Role | Exposed Port |
|--------|------|--------------|
| App | Initiates (Outgoing) | — |
| Database | Exposed to app | TCP 3306 (MySQL) |

### Cross-Datacenter Backup

| Server | Role | Exposed Port |
|--------|------|--------------|
| Primary | Initiates (Outgoing) | — |
| Backup | Exposed to primary | TCP 22 (rsync/ssh) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Tunnel is not supported on this server's node" | The node must run **Wings v1.2.3+** and be enabled for the mesh. Ask your admin to upgrade / enable it. |
| Create fails — "already on the private network" | The server is already enrolled. Use **Rename** instead of creating again. |
| Connect row is disabled | The target isn't on the mesh yet. Ask the target's owner to create a tunnel first. |
| "port X is already used by this server's own allocations" | Your own allocation ports can't double as peer ports. Expose a different port on the target, or connect over a port you don't host. |
| Connection shows but traffic fails | 1. Both servers on the mesh? 2. Wings v1.2.3+ on both nodes? 3. Port actually exposed on the target? 4. Check Wings logs on both nodes. |
| Can't find a server in Connect | Target must be on the mesh. Admin: enable "Show servers from other tenants". |
| Name rejected | Must be 1–63 chars, lowercase letters/digits/dashes, not eight hex chars. |

---

## See Also

- [Server Management](/docs/server-management) — console, files, databases
`;

export default function Page() {
  return <Md>{content}</Md>;
}