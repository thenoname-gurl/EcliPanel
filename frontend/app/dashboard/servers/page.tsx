"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PanelHeader } from "@/components/panel/header"
import { StatusBadge, UsageBar } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import {
  Play,
  Square,
  RotateCcw,
  Terminal,
  MoreVertical,
  Plus,
  Search,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react"

function NewServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [eggId, setEggId] = useState<string>("")
  const [eggs, setEggs] = useState<{ id: number; name: string; description?: string }[]>([])
  const [eggsLoading, setEggsLoading] = useState(true)
  const [nodeId, setNodeId] = useState<number | null>(null)
  const [nodes, setNodes] = useState<{ id: number; name: string; nodeType?: string }[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resource limits from the user's plan / account
  const [limits, setLimits] = useState<{ memory?: number; disk?: number; cpu?: number; serverLimit?: number } | null>(null)
  const { user } = useAuth()
  const [memory, setMemory] = useState<number>(1024)
  const [disk, setDisk] = useState<number>(10240)
  const [cpu, setCpu] = useState<number>(100)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.session)
      .then((data: any) => {
        const l = data?.user?.limits || data?.limits || null
        setLimits(l)
        if (l?.memory) setMemory(l.memory)
        if (l?.disk) setDisk(l.disk)
        if (l?.cpu) setCpu(l.cpu)
      })
      .catch(() => {})

    apiFetch(API_ENDPOINTS.eggs)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        const allowedEggs = list.filter((egg: any) => {
          if (!egg || !egg.allowedPortals || !Array.isArray(egg.allowedPortals) || egg.allowedPortals.length === 0) {
            return true
          }
          const effectiveUserPortal = ['educational', 'edu'].includes(String(rawPlanName).toLowerCase()) ? 'educational' : String(rawPlanName).toLowerCase()
          if (effectiveUserPortal === 'educational') {
            return egg.allowedPortals.includes('educational') || egg.allowedPortals.includes('paid')
          }
          return egg.allowedPortals.includes(effectiveUserPortal)
        })
        setEggs(allowedEggs)
        if (allowedEggs.length > 0) setEggId(String(allowedEggs[0].id))
      })
      .catch(() => {})
      .finally(() => setEggsLoading(false))

    apiFetch(API_ENDPOINTS.nodesAvailable)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setNodes(list)
        if (list.length > 0) setNodeId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setNodesLoading(false))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError("Server name is required."); return }
    if (!eggId) { setError("Please select a server type."); return }
    setCreating(true)
    setError(null)
    try {
      await apiFetch(API_ENDPOINTS.servers, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), eggId: Number(eggId), memory, disk, cpu, nodeId }),
      })
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create server. Ensure nodes are configured.")
      setCreating(false)
    }
  }

  const maxMemory = limits?.memory ?? null
  const maxDisk = limits?.disk ?? null
  const maxCpu = limits?.cpu ?? null
  const hasLimits = limits ? Object.keys(limits).length > 0 : false
  const rawPlanName = (user as any)?.portalType || user?.tier || 'free'
  const planTier = ['educational', 'edu'].includes(String(rawPlanName).toLowerCase()) ? 'paid' : String(rawPlanName).toLowerCase()
  const planName = ['educational', 'edu'].includes(String(rawPlanName).toLowerCase()) ? 'educational' : String(rawPlanName).toLowerCase()

  useEffect(() => {
    if (maxMemory !== null) setMemory(maxMemory)
    if (maxDisk !== null) setDisk(maxDisk)
    if (maxCpu !== null) setCpu(maxCpu)
  }, [maxMemory, maxDisk, maxCpu])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">New Server</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">{error}</p>
          )}
          {user && !user.emailVerified && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
              You must verify your email before creating a server.
            </p>
          )}
          {user && user.passkeyCount === 0 && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
              Please register a passkey under Identity &gt; Security before creating a server.
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Minecraft Server"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Server Type</label>
            {eggsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading templates…
              </div>
            ) : eggs.length === 0 ? (
              <p className="text-xs text-destructive">No server types available. Ask an admin to configure eggs.</p>
            ) : (
              <select
                value={eggId}
                onChange={(e) => setEggId(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              >
                {eggs.map((egg) => (
                  <option key={egg.id} value={String(egg.id)}>{egg.name}{egg.description ? ` — ${egg.description}` : ""}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Node</label>
            {nodesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading nodes…
              </div>
            ) : nodes.length === 0 ? (
              <p className="text-xs text-destructive">No nodes available for your plan. Contact an admin.</p>
            ) : (
              <select
                value={nodeId ?? ""}
                onChange={(e) => setNodeId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} {n.nodeType ? `(${n.nodeType})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          {/* Resource sliders */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">Resources</p>
            {!hasLimits ? (
              <p className="text-xs text-muted-foreground">
                {planName !== 'free' ? (
                  <>
                    Your account is on the <span className="font-medium">{planName}</span> plan, but no resource limits are configured.
                    Resources will use server defaults. Contact an admin to configure your plan.
                  </>
                ) : (
                  <>No plan is assigned to your account. Resources will use server defaults. Contact an admin to assign a plan.</>
                )}
              </p>
            ) : (
              <>
                {/* Memory */}
                {maxMemory !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Memory</span>
                      <span className="font-medium text-foreground">{memory} MB</span>
                    </div>
                    <input type="range" min={128} max={maxMemory} step={128} value={memory}
                      onChange={(e) => setMemory(Number(e.target.value))}
                      className="w-full accent-primary" />
                    <p className="text-[10px] text-muted-foreground text-right">Max: {maxMemory} MB</p>
                  </div>
                )}
                {/* Disk */}
                {maxDisk !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Disk</span>
                      <span className="font-medium text-foreground">{disk >= 1024 ? `${(disk / 1024).toFixed(1)} GB` : `${disk} MB`}</span>
                    </div>
                    <input type="range" min={1024} max={maxDisk} step={1024} value={disk}
                      onChange={(e) => setDisk(Number(e.target.value))}
                      className="w-full accent-primary" />
                    <p className="text-[10px] text-muted-foreground text-right">Max: {maxDisk >= 1024 ? `${(maxDisk / 1024).toFixed(0)} GB` : `${maxDisk} MB`}</p>
                  </div>
                )}
                {/* CPU */}
                {maxCpu !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">CPU</span>
                      <span className="font-medium text-foreground">{cpu}%</span>
                    </div>
                    <input type="range" min={10} max={maxCpu} step={10} value={cpu}
                      onChange={(e) => setCpu(Number(e.target.value))}
                      className="w-full accent-primary" />
                    <p className="text-[10px] text-muted-foreground text-right">Max: {maxCpu}%</p>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            A port will be auto-assigned from the node&apos;s allocation pool.
          </p>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-foreground hover:bg-secondary/80 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={
              creating || eggsLoading || eggs.length === 0 || nodesLoading || nodes.length === 0 ||
              (user && (!user.emailVerified || (user.passkeyCount ?? 0) === 0))
            }
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {creating ? "Creating..." : "Create Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatUptime(ms: number) {
  if (!ms || ms <= 0) return "—"
  const seconds = Math.floor(ms / 1000)
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function ServersPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [servers, setServers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [powerLoading, setPowerLoading] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)

  const loadServers = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.servers)
      const list = Array.isArray(data) ? data : []

      const seen = new Set<string>()
      const deduped: any[] = []
      for (const s of list) {
        const raw = s.uuid || s.id || ''
        const norm = String(raw).replace(/-/g, '').toLowerCase()
        const key = `${norm}::${s.nodeId ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(s)
      }

      setServers(deduped)
    } catch (err) {
      console.error("failed to load servers", err)
    } finally {
      setLoading(false)
    }
  }

  const sendPower = async (serverId: string, action: string) => {
    setPowerLoading(serverId)
    try {
      await apiFetch(API_ENDPOINTS.serverPower.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ action }),
      })
      setTimeout(loadServers, 1500)
    } catch (e: any) {
      alert("Power action failed: " + e.message)
    } finally {
      setPowerLoading(null)
    }
  }

  useEffect(() => { loadServers() }, [])

  const filtered = servers.filter(
    (s: any) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.game?.toLowerCase().includes(search.toLowerCase())
  )

  const myServers = filtered.filter((s: any) => user ? s.userId === user.id : true)
  const otherServers = filtered.filter((s: any) => user ? s.userId && s.userId !== user.id : false)

  const renderServerCard = (server: any) => {
    const sid = server.uuid || server.id
    const reactKey = `${sid}-${server.nodeId ?? ''}`
    return (
      <div
        key={reactKey}
        className="group rounded-xl border border-border bg-card p-4 sm:p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)] w-full max-w-full overflow-x-auto"
      >
        {/* Header - clickable */}
        <Link href={`/dashboard/servers/${sid}`} className="block">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                {server.name}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={server.status} />
              </div>
            </div>
            <button
              onClick={(e) => e.preventDefault()}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </Link>

        {/* Stats */}
        <div className="mt-4 flex flex-col gap-2">
          <div>
            <UsageBar label="CPU" value={Math.round(server.resources?.cpu_absolute ?? 0)} />
          </div>
          <div>
            <UsageBar label="RAM" value={server.build?.memory_limit ? Math.round(((server.resources?.memory_bytes ?? 0) / (server.build.memory_limit * 1024 * 1024)) * 100) : 0} />
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(server.resources?.memory_bytes ?? 0)} / {formatBytes((server.build?.memory_limit ?? 0) * 1024 * 1024)}</p>
          </div>
          <div>
            <UsageBar label="Disk" value={server.build?.disk_space ? Math.round(((server.resources?.disk_bytes ?? 0) / (server.build.disk_space * 1024 * 1024)) * 100) : 0} />
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(server.resources?.disk_bytes ?? 0)} / {formatBytes((server.build?.disk_space ?? 0) * 1024 * 1024)}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{server.nodeName || server.node || "\u2014"}</span>
          <span>{server.resources?.uptime != null ? formatUptime(server.resources.uptime) : "\u2014"}</span>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          {server.status === "online" || server.status === "running" ? (
            <button
              onClick={() => sendPower(sid, "stop")}
              disabled={powerLoading === sid}
              className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => sendPower(sid, "start")}
              disabled={powerLoading === sid}
              className="flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-1.5 text-xs text-success transition-colors hover:bg-success/20 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
          )}
          <button
            onClick={() => sendPower(sid, "restart")}
            disabled={powerLoading === sid}
            className="flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-1.5 text-xs text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Restart
          </button>
          <Link
            href={`/dashboard/servers/${sid}`}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <Terminal className="h-3 w-3" />
            Console
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {showNewModal && (
        <NewServerModal
          onClose={() => setShowNewModal(false)}
          onCreated={loadServers}
        />
      )}
      <PanelHeader title="Servers" description="Manage your game servers" />
      <ScrollArea className="flex-1 overflow-x-hidden">
          <div className="flex flex-col gap-4 p-2 sm:p-4 md:p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 w-full max-w-full">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search servers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full sm:w-48"
                />
              </div>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                New Server
              </button>
            </div>
          </div>

          {/* Servers Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
                Loading servers...
              </div>
            ) : (
              <>
                {/* My Servers */}
                {myServers.length > 0 && (
                  <div className="col-span-full">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Your Servers</h3>
                      <span className="text-xs text-muted-foreground">{myServers.length} total</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 mt-3">
                      {myServers.map((server: any) => renderServerCard(server))}
                    </div>
                  </div>
                )}

                {/* Other Servers */}
                {otherServers.length > 0 && (
                  <div className="col-span-full">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Other Servers</h3>
                      <span className="text-xs text-muted-foreground">{otherServers.length} total</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 mt-3">
                      {otherServers.map((server: any) => renderServerCard(server))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">No servers found matching your search.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}
