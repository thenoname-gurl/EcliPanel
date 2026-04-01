"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { PanelHeader } from "@/components/panel/header"
import { StatusBadge, UsageBar } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import {
  Play,
  Square,
  RotateCcw,
  Terminal,
  Plus,
  Search,
  X,
  Loader2,
  ChevronRight,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  MapPin,
  Zap,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  Star,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toBool(value: any): boolean {
  if (value === false || value === "false" || value === 0 || value === "0") return false
  return value === true || value === "true" || value === 1 || value === "1" || Boolean(value)
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

function statusColor(status: string) {
  switch (status) {
    case "online":
    case "running":
      return "bg-emerald-500"
    case "starting":
      return "bg-amber-500 animate-pulse"
    case "stopping":
      return "bg-orange-500 animate-pulse"
    case "offline":
    case "stopped":
      return "bg-zinc-500"
    default:
      return "bg-zinc-500"
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "online":
    case "running":
      return "Online"
    case "starting":
      return "Starting"
    case "stopping":
      return "Stopping"
    case "offline":
    case "stopped":
      return "Offline"
    default:
      return status || "Unknown"
  }
}

/* ------------------------------------------------------------------ */
/*  Animated Usage Ring                                                 */
/* ------------------------------------------------------------------ */

function UsageRing({ value, size = 40, stroke = 3.5, color }: { value: number; size?: number; stroke?: number; color: string }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-border" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  NewServerModal                                                     */
/* ------------------------------------------------------------------ */

function NewServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [eggId, setEggId] = useState<string>("")
  const [eggs, setEggs] = useState<{ id: number; name: string; description?: string }[]>([])
  const [eggsLoading, setEggsLoading] = useState(true)
  const [nodeId, setNodeId] = useState<number | null>(null)
  const [nodes, setNodes] = useState<{ id: number; name: string; nodeType?: string; memory?: number; disk?: number; cpu?: number }[]>([])
  const [nodesLoading, setNodesLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limits, setLimits] = useState<{ memory?: number; disk?: number; cpu?: number; serverLimit?: number } | null>(null)
  const { user } = useAuth()
  const [memory, setMemory] = useState<number>(1024)
  const [disk, setDisk] = useState<number>(10240)
  const [cpu, setCpu] = useState<number>(100)
  const [kvmPassthroughEnabled, setKvmPassthroughEnabled] = useState<boolean>(false)
  const [startup, setStartup] = useState<string>("")
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([])

  const rawPlanName = (user as any)?.portalType || user?.tier || "free"
  const planName = ["educational", "edu"].includes(String(rawPlanName).toLowerCase()) ? "educational" : String(rawPlanName).toLowerCase()
  const isAdmin = user && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')

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

    apiFetch(isAdmin ? API_ENDPOINTS.adminEggs : API_ENDPOINTS.eggs)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        const allowedEggs = list.filter((egg: any) => {
          if (!egg?.allowedPortals || !Array.isArray(egg.allowedPortals) || egg.allowedPortals.length === 0) return true
          const effectiveUserPortal = ["educational", "edu"].includes(String(rawPlanName).toLowerCase()) ? "educational" : String(rawPlanName).toLowerCase()
          if (effectiveUserPortal === "educational") return egg.allowedPortals.includes("educational") || egg.allowedPortals.includes("paid")
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

  useEffect(() => {
    try {
      const sel = eggs.find((e) => String(e.id) === String(eggId)) as any
      if (sel) {
        if (sel.requiresKvm || sel.requires_kvm) {
          setKvmPassthroughEnabled(true)
        }
        setStartup(sel.startup || "")

        const defaults = Array.isArray(sel.envVars) ? sel.envVars : []
        const parsedEnv = defaults.map((entry: any) => {
          if (typeof entry === "string") {
            const [key, ...rest] = entry.split("=")
            return { key: (key || "").trim(), value: rest.join("=").trim() }
          }
          const key = entry?.env_variable || entry?.key || entry?.name || ""
          const value = entry?.default_value ?? entry?.defaultValue ?? entry?.value ?? ""
          return { key: String(key), value: String(value) }
        })
        setEnvVars(parsedEnv)
      }
    } catch {
      // skip
    }
  }, [eggId, eggs])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError("Server name is required."); return }
    if (!eggId) { setError("Please select a server type."); return }
    setCreating(true)
    setError(null)
    try {
      const sel = eggs.find((e) => String(e.id) === String(eggId)) as any
      const defaultStartup = sel ? sel.startup || "" : ""
      const finalStartup = defaultStartup
      const finalKvm = (sel && (sel.requiresKvm || sel.requires_kvm)) ? true : (isAdmin ? kvmPassthroughEnabled : undefined)

      const envObject: Record<string, string> = {}

      const eggVars = Array.isArray(sel?.envVars) ? sel.envVars : []
      for (const entry of eggVars as any[]) {
        if (typeof entry === "string") {
          const [key, ...rest] = entry.split("=")
          if (key) envObject[key.trim()] = rest.join("=").trim()
          continue
        }
        const key = entry?.env_variable || entry?.key || entry?.name
        const value = entry?.default_value ?? entry?.defaultValue ?? entry?.value ?? ""
        if (key) envObject[String(key)] = String(value)
      }

      for (const row of envVars) {
        if (row.key.trim()) {
          envObject[row.key.trim()] = row.value
        }
      }

      await apiFetch(API_ENDPOINTS.servers, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          eggId: Number(eggId),
          memory,
          disk,
          cpu,
          nodeId,
          kvmPassthroughEnabled: finalKvm,
          startup: finalStartup,
          environment: envObject,
        }),
      })
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create server.")
      setCreating(false)
    }
  }

  const selectedNode = nodes.find((n) => n.id === nodeId)
  const nodeMemory = selectedNode?.memory ?? null
  const nodeDisk = selectedNode?.disk ?? null
  const nodeCpu = selectedNode?.cpu ?? null

  const [memorySource, setMemorySource] = useState<"plan" | "node">("plan")
  const [diskSource, setDiskSource] = useState<"plan" | "node">("plan")
  const [cpuSource, setCpuSource] = useState<"plan" | "node">("plan")

  useEffect(() => {
    if (!limits?.memory && nodeMemory != null) setMemorySource("node")
    if (!limits?.disk && nodeDisk != null) setDiskSource("node")
    if (!limits?.cpu && nodeCpu != null) setCpuSource("node")
  }, [limits, nodeMemory, nodeDisk, nodeCpu])

  const maxMemory = memorySource === "node" ? nodeMemory : (limits?.memory ?? nodeMemory)
  const maxDisk = diskSource === "node" ? nodeDisk : (limits?.disk ?? nodeDisk)
  const maxCpu = cpuSource === "node" ? nodeCpu : (limits?.cpu ?? nodeCpu)
  const hasLimits = maxMemory != null || maxDisk != null || maxCpu != null

  useEffect(() => {
    if (maxMemory !== null) setMemory((prev) => Math.min(prev, maxMemory))
    if (maxDisk !== null) setDisk((prev) => Math.min(prev, maxDisk))
    if (maxCpu !== null) setCpu((prev) => Math.min(prev, maxCpu))
  }, [maxMemory, maxDisk, maxCpu])

  const canCreate = name.trim() && eggId && !eggsLoading && eggs.length > 0 && !nodesLoading && nodes.length > 0 &&
    (user ? (user.emailVerified && (user.passkeyCount ?? 0) > 0) : true)

  const selectedEgg = eggs.find((e) => String(e.id) === String(eggId)) as any

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-card border border-border/50 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-2 sm:zoom-in-95 duration-300 overflow-hidden">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">New Server</h2>
              <p className="text-xs text-muted-foreground">Configure and deploy</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 sm:p-6 space-y-5">
            {/* Alerts */}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive leading-relaxed">{error}</p>
              </div>
            )}
            {user && !user.emailVerified && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <ShieldCheck className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">Verify your email before creating a server.</p>
              </div>
            )}
            {user && user.passkeyCount === 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <KeyRound className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">Register a passkey under Identity &gt; Security first.</p>
              </div>
            )}

            {/* Server Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Server Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Minecraft Server"
                data-guide-id="new-server-name"
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:bg-muted/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Server Type & Node - 2-col on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Template</label>
                {eggsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 px-4 rounded-xl border border-border/50 bg-muted/30">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : eggs.length === 0 ? (
                  <p className="text-xs text-destructive py-3 px-4 rounded-xl border border-destructive/20 bg-destructive/5">No templates available.</p>
                ) : (
                  <select
                    value={eggId}
                    onChange={(e) => setEggId(e.target.value)}
                    data-guide-id="new-server-template"
                    className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all appearance-none cursor-pointer"
                  >
                    {eggs.map((egg) => (
                      <option key={egg.id} value={String(egg.id)}>
                        {egg.name}{egg.description ? ` — ${egg.description}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node</label>
                {nodesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 px-4 rounded-xl border border-border/50 bg-muted/30">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : nodes.length === 0 ? (
                  <p className="text-xs text-destructive py-3 px-4 rounded-xl border border-destructive/20 bg-destructive/5">No nodes available.</p>
                ) : (
                  <select
                    value={nodeId ?? ""}
                    onChange={(e) => setNodeId(Number(e.target.value))}
                    data-guide-id="new-server-node"
                    className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all appearance-none cursor-pointer"
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} {n.nodeType ? `(${n.nodeType})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Startup */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Startup Command</label>
              <textarea
                value={startup}
                readOnly
                rows={1}
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:bg-muted/50 focus:ring-2 focus:ring-primary/10 transition-all"
                placeholder="Using egg default startup command"
              />
              <p className="text-[10px] text-muted-foreground/80">This is default startup command for the selected egg.</p>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Environment Variables</label>
                <button
                  type="button"
                  onClick={() => setEnvVars((prev) => [...prev, { key: "", value: "" }])}
                  className="px-2 py-1 text-xs rounded-lg border border-border/50 bg-muted/30 text-foreground hover:bg-muted/50"
                >
                  Add variable
                </button>
              </div>
              {envVars.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No environment variables configured. Add one to override defaults or define new values.</p>
              ) : (
                <div className="space-y-2">
                  {envVars.map((row, idx) => (
                    <div key={`env-${idx}`} className="grid grid-cols-12 gap-2">
                      <input
                        value={row.key}
                        onChange={(e) => setEnvVars((prev) => prev.map((item, i) => i === idx ? { ...item, key: e.target.value } : item))}
                        placeholder="KEY"
                        className="col-span-5 rounded-xl border border-border/50 bg-muted/30 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                      <input
                        value={row.value}
                        onChange={(e) => setEnvVars((prev) => prev.map((item, i) => i === idx ? { ...item, value: e.target.value } : item))}
                        placeholder="value"
                        className="col-span-6 rounded-xl border border-border/50 bg-muted/30 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                      <button
                        type="button"
                        onClick={() => setEnvVars((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 rounded-xl border border-border/50 text-xs text-destructive hover:bg-destructive/10"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resources */}
            <div data-guide-id="new-server-resources" className="space-y-4 rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-muted/20 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Resources</p>
              </div>

              {/* Source toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: "Memory", source: memorySource, setSource: setMemorySource, planVal: limits?.memory, nodeVal: nodeMemory, unit: "MB", icon: MemoryStick },
                  { label: "Disk", source: diskSource, setSource: setDiskSource, planVal: limits?.disk, nodeVal: nodeDisk, unit: "MB", icon: HardDrive },
                  { label: "CPU", source: cpuSource, setSource: setCpuSource, planVal: limits?.cpu, nodeVal: nodeCpu, unit: "%", icon: Cpu },
                ].map(({ label, source, setSource, planVal, nodeVal, unit, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl border border-border/30 bg-background/60 px-3 py-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <select
                      className="flex-1 bg-transparent text-xs text-foreground outline-none cursor-pointer min-w-0"
                      value={source}
                      onChange={(e) => setSource(e.target.value as "plan" | "node")}
                    >
                      {planVal != null && <option value="plan">Plan · {planVal}{unit}</option>}
                      {nodeVal != null && <option value="node">Node · {nodeVal}{unit}</option>}
                    </select>
                  </div>
                ))}
              </div>

              {!hasLimits ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {planName !== "free"
                    ? <>Your <span className="font-medium text-foreground">{planName}</span> plan has no configured limits. Contact an admin.</>
                    : <>No plan assigned. Resources use defaults.</>
                  }
                </p>
              ) : (
                <div className="space-y-5">
                  {maxMemory !== null && (
                    <ResourceSlider
                      label="Memory"
                      icon={MemoryStick}
                      value={memory}
                      min={128}
                      max={maxMemory}
                      step={128}
                      onChange={setMemory}
                      format={(v) => `${v} MB`}
                      color="text-blue-500"
                    />
                  )}
                  {maxDisk !== null && (
                    <ResourceSlider
                      label="Disk"
                      icon={HardDrive}
                      value={disk}
                      min={1024}
                      max={maxDisk}
                      step={1024}
                      onChange={setDisk}
                      format={(v) => v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`}
                      formatMax={(v) => v >= 1024 ? `${(v / 1024).toFixed(0)} GB` : `${v} MB`}
                      color="text-emerald-500"
                    />
                  )}
                  {maxCpu !== null && (
                    <ResourceSlider
                      label="CPU"
                      icon={Cpu}
                      value={cpu}
                      min={10}
                      max={maxCpu}
                      step={10}
                      onChange={setCpu}
                      format={(v) => `${v}%`}
                      color="text-amber-500"
                    />
                  )}
                </div>
              )}
            </div>

            {selectedEgg && (selectedEgg.requiresKvm || selectedEgg.requires_kvm) ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <input id="new-server-kvm" type="checkbox" checked={true} disabled className="h-4 w-4 rounded border-border bg-secondary/50 text-primary" />
                <label htmlFor="new-server-kvm">KVM Virtualization (required)</label>
              </div>
            ) : isAdmin ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <input
                  id="new-server-kvm"
                  type="checkbox"
                  checked={kvmPassthroughEnabled}
                  onChange={(e) => setKvmPassthroughEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-secondary/50 text-primary focus:ring-primary"
                />
                <label htmlFor="new-server-kvm">Enable KVM Virtualization</label>
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground/70 text-center">
              A port will be auto-assigned from the node&apos;s allocation pool.
            </p>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 border-t border-border/50 bg-card/95 backdrop-blur-sm px-5 sm:px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border/50 bg-muted/30 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-guide-id="new-server-deploy"
              disabled={creating || !canCreate}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {creating ? "Deploying…" : "Deploy Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ResourceSlider                                                     */
/* ------------------------------------------------------------------ */

function ResourceSlider({
  label, icon: Icon, value, min, max, step, onChange, format, formatMax, color,
}: {
  label: string; icon: any; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format: (v: number) => string; formatMax?: (v: number) => string; color: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  const clampedPct = Math.max(0, Math.min(100, pct))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        <span className="text-xs font-semibold text-foreground tabular-nums">{format(value)}</span>
      </div>
      <div className="relative">
        <div className="h-2 rounded-full bg-border/60 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-150 ${color.replace("text-", "bg-")}/60`} style={{ width: `${clampedPct}%` }} />
        </div>
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white bg-white dark:border-slate-800 dark:bg-slate-200 shadow-md pointer-events-none"
          style={{ left: `calc(${clampedPct}% - 0.375rem)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-pan-x"
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 text-right">
        Max: {formatMax ? formatMax(max) : format(max)}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ServerCard                                                         */
/* ------------------------------------------------------------------ */

function ServerCard({
  server,
  powerLoading,
  onPower,
  isFavorite,
  onToggleFavorite,
}: {
  server: any
  powerLoading: string | null
  onPower: (id: string, action: string) => void
  isFavorite: boolean
  onToggleFavorite: (serverId: string) => void
}) {
  const sid = server.uuid || server.id
  const isOnline = server.status === "online" || server.status === "running"

  const cpuVal = Math.round(server.resources?.cpu_absolute ?? 0)
  const ramPct = server.build?.memory_limit
    ? Math.round(((server.resources?.memory_bytes ?? 0) / (server.build.memory_limit * 1024 * 1024)) * 100)
    : 0
  const diskPct = server.build?.disk_space
    ? Math.round(((server.resources?.disk_bytes ?? 0) / (server.build.disk_space * 1024 * 1024)) * 100)
    : 0

  return (
    <div data-guide-id="server-card" className="group relative rounded-2xl border border-border/50 bg-card overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${isOnline ? "bg-gradient-to-r from-emerald-500/80 via-emerald-400/50 to-transparent" : "bg-gradient-to-r from-zinc-500/40 to-transparent"}`} />

      {/* Header */}
      <Link href={`/dashboard/servers/${sid}`} className="block p-4 sm:p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${statusColor(server.status)}`} />
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors text-[15px]">
                {server.name}
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="capitalize">{statusLabel(server.status)}</span>
              {server.resources?.uptime != null && server.resources.uptime > 0 && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="h-3 w-3" />
                    {formatUptime(server.resources.uptime)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const sid = server.uuid || server.id
                if (sid) onToggleFavorite(String(sid))
              }}
              aria-label={isFavorite ? "Unfavorite server" : "Favorite server"}
              className={`rounded-lg p-1 transition-colors ${isFavorite ? 'text-yellow-400 hover:text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 stroke-yellow-400' : ''}`} />
            </button>
            {/* Mobile console shortcut */}
            <Link
              href={`/dashboard/servers/${sid}`}
              className="sm:hidden flex items-center justify-center rounded-xl bg-muted/50 p-2.5 text-muted-foreground active:bg-muted transition-colors"
              aria-label="Console"
            >
              <Terminal className="h-4 w-4" />
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors hidden sm:block" />
          </div>
        </div>
      </Link>

      {/* Stats rings */}
      <div className="px-4 sm:px-5 pb-1">
        <div className="flex items-center justify-between gap-2 py-3 border-t border-border/30">
          {/* CPU */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={cpuVal} size={38} color={cpuVal > 80 ? "#ef4444" : cpuVal > 50 ? "#f59e0b" : "#3b82f6"} />
              <Cpu className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">CPU</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{cpuVal}%</p>
            </div>
          </div>

          {/* RAM */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={ramPct} size={38} color={ramPct > 80 ? "#ef4444" : ramPct > 50 ? "#f59e0b" : "#10b981"} />
              <MemoryStick className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">RAM</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatBytes(server.resources?.memory_bytes ?? 0)}</p>
            </div>
          </div>

          {/* Disk */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={diskPct} size={38} color={diskPct > 80 ? "#ef4444" : diskPct > 50 ? "#f59e0b" : "#8b5cf6"} />
              <HardDrive className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Disk</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatBytes(server.resources?.disk_bytes ?? 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Node info */}
      {(server.nodeName || server.node) && (
        <div className="mx-4 sm:mx-5 mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <MapPin className="h-3 w-3" />
          <span className="truncate">{server.nodeName || server.node}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border/30 p-3 sm:p-4 bg-muted/10">
        {isOnline ? (
          <button
            onClick={() => onPower(sid, "stop")}
            disabled={powerLoading === sid}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2 sm:py-1.5 text-xs font-medium text-red-500 transition-all hover:bg-red-500/15 active:scale-[0.97] disabled:opacity-50 min-h-[36px] sm:min-h-0"
          >
            <Square className="h-3 w-3" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={() => onPower(sid, "start")}
            disabled={powerLoading === sid}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3.5 py-2 sm:py-1.5 text-xs font-medium text-emerald-500 transition-all hover:bg-emerald-500/15 active:scale-[0.97] disabled:opacity-50 min-h-[36px] sm:min-h-0"
          >
            <Play className="h-3 w-3" />
            <span>Start</span>
          </button>
        )}
        <button
          onClick={() => onPower(sid, "restart")}
          disabled={powerLoading === sid}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 px-3.5 py-2 sm:py-1.5 text-xs font-medium text-amber-500 transition-all hover:bg-amber-500/15 active:scale-[0.97] disabled:opacity-50 min-h-[36px] sm:min-h-0"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Restart</span>
        </button>
        <Link
          href={`/dashboard/servers/${sid}`}
          className="ml-auto hidden sm:flex items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/15"
        >
          <Terminal className="h-3 w-3" />
          Console
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  CodeInstancesModal                                                 */
/* ------------------------------------------------------------------ */

function CodeInstancesModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.infraCodeInstances)
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stopInstance = async (id: string) => {
    if (!confirm("Stop and delete this Code Instance?")) return
    setStopping(id)
    try {
      await apiFetch(API_ENDPOINTS.infraCodeInstanceStop.replace(":id", id), { method: "POST" })
      await load()
    } catch (e: any) {
      alert("Failed: " + (e?.message || e))
    } finally {
      setStopping(null)
    }
  }

  const minutesLeft = (lastActivity?: string | null) => {
    if (!lastActivity) return "Expires soon"
    const remaining = Math.max(0, 30 * 60 * 1000 - (Date.now() - new Date(lastActivity).getTime()))
    return `${Math.ceil(remaining / 60000)}m left`
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-2xl max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-card border border-border/50 shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <h3 className="text-base font-semibold">Code Instances</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">
          <p className="text-xs text-muted-foreground">Auto-deleted after 30 min of inactivity.</p>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12">
              <Terminal className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No active instances.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {list.map((ci) => (
                <div key={ci.uuid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/50 p-4 bg-muted/5 hover:bg-muted/10 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{ci.name || ci.uuid}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{minutesLeft(ci.lastActivityAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/dashboard/servers/${ci.uuid}`} className="rounded-xl px-4 py-2 bg-primary/10 text-xs font-medium text-primary flex-1 sm:flex-none text-center">
                      Open
                    </Link>
                    <button onClick={() => stopInstance(ci.uuid)} disabled={stopping === ci.uuid}
                      className="rounded-xl px-4 py-2 bg-red-500/10 text-xs font-medium text-red-500 flex-1 sm:flex-none text-center disabled:opacity-50">
                      {stopping === ci.uuid ? "Stopping…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ServersPage                                                        */
/* ------------------------------------------------------------------ */

export default function ServersPage() {
  const { user, refreshUser } = useAuth()
  const [search, setSearch] = useState("")
  const [servers, setServers] = useState<any[]>([])
  const [favoriteServerIds, setFavoriteServerIds] = useState<string[]>([])

  useEffect(() => {
    if (user?.settings?.serverFavorites && Array.isArray(user.settings.serverFavorites)) {
      setFavoriteServerIds(user.settings.serverFavorites.map((id: any) => String(id)))
    } else {
      setFavoriteServerIds([])
    }
  }, [user])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [powerLoading, setPowerLoading] = useState<string | null>(null)
  const [codeInstancesEnabled, setCodeInstancesEnabled] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadFeatureToggles = async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.panelSettings)
        if (!mounted) return

        const value =
          data?.featureToggles?.codeInstances ??
          data?.codeInstancesEnabled ??
          false

        setCodeInstancesEnabled(toBool(value))
      } catch {
        setCodeInstancesEnabled(false)
      }
    }

    const onSettingsUpdate = (e: any) => {
      try {
        const incoming = e?.detail?.featureToggles ?? e?.detail ?? null
        if (!incoming || typeof incoming !== "object") return
        if (incoming.codeInstances !== undefined) {
          setCodeInstancesEnabled(toBool(incoming.codeInstances))
        }
      } catch {
        // skip
      }
    }

    loadFeatureToggles()
    window.addEventListener("panelSettingsUpdated", onSettingsUpdate)
    const interval = window.setInterval(loadFeatureToggles, 15000)

    return () => {
      mounted = false
      window.removeEventListener("panelSettingsUpdated", onSettingsUpdate)
      clearInterval(interval)
    }
  }, [])

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.servers)
      const list = Array.isArray(data) ? data : []
      const seen = new Set<string>()
      const deduped: any[] = []
      for (const s of list) {
        const norm = String(s.uuid || s.id || "").replace(/-/g, "").toLowerCase()
        const key = `${norm}::${s.nodeId ?? ""}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(s)
      }
      setServers(deduped)
    } catch {
      console.error("failed to load servers")
    } finally {
      setLoading(false)
    }
  }, [])

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

  const toggleFavorite = async (serverId: string) => {
    if (!user?.id) return

    const current = new Set(favoriteServerIds)
    const next = new Set(current)
    if (current.has(serverId)) {
      next.delete(serverId)
    } else {
      next.add(serverId)
    }

    const nextArray = Array.from(next)
    setFavoriteServerIds(nextArray)

    try {
      await apiFetch(API_ENDPOINTS.userFavorites, {
        method: "PATCH",
        body: JSON.stringify({
          favorites: nextArray,
        }),
      })
      await refreshUser()
    } catch (e: any) {
      setFavoriteServerIds(Array.from(current))
      alert("Failed to save favorite state: " + (e?.message || "Unknown error"))
    }
  }

  useEffect(() => { loadServers() }, [loadServers])

  const filtered = servers.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.game?.toLowerCase().includes(search.toLowerCase())
  )

  const favoriteServers = filtered.filter((s) => {
    const sid = String(s.uuid || s.id)
    return favoriteServerIds.includes(sid)
  })

  const nonFavoriteServers = filtered.filter((s) => {
    const sid = String(s.uuid || s.id)
    return !favoriteServerIds.includes(sid)
  })

  const myServers = nonFavoriteServers.filter((s) => (user ? s.userId === user.id : true))
  const otherServers = nonFavoriteServers.filter((s) => (user ? s.userId && s.userId !== user.id : false))
  const onlineCount = servers.filter((s) => s.status === "online" || s.status === "running").length

  return (
    <>
      {showCodeModal && <CodeInstancesModal onClose={() => setShowCodeModal(false)} />}
      {showNewModal && <NewServerModal onClose={() => setShowNewModal(false)} onCreated={loadServers} />}

      <PanelHeader title="Servers" description="Manage your game servers" />

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-4 sm:gap-5 p-3 sm:p-5 md:p-6 max-w-[100vw] w-full min-w-0 box-border">

          {/* Quick stats */}
          {!loading && servers.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[11px] sm:text-xs text-muted-foreground">Total</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums mt-0.5">{servers.length}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[11px] sm:text-xs text-muted-foreground">Online</p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-500 tabular-nums mt-0.5">{onlineCount}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[11px] sm:text-xs text-muted-foreground">Offline</p>
                <p className="text-xl sm:text-2xl font-bold text-muted-foreground tabular-nums mt-0.5">{servers.length - onlineCount}</p>
              </div>
            </div>
          )}

          {/* Favorites */}
          {favoriteServers.length > 0 && (
            <section className="sticky top-0 z-20 rounded-2xl border border-border/50 bg-card p-3 sm:p-4 shadow-sm shadow-black/5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Favorites</h3>
                <span className="text-xs text-muted-foreground tabular-nums px-2 py-0.5 rounded-full bg-muted/50">{favoriteServers.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteServers.map((server) => (
                  <ServerCard
                    key={`${server.uuid || server.id}-${server.nodeId ?? ""}`}
                    server={server}
                    powerLoading={powerLoading}
                    onPower={sendPower}
                    isFavorite={true}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
              <input
                type="text"
                placeholder="Search servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-card pl-10 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {codeInstancesEnabled && (
                <button
                  onClick={() => setShowCodeModal(true)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/10 transition-all"
                >
                  <Server className="h-4 w-4" />
                  Code Instances
                </button>
              )}
              <button
                data-guide-id="servers-new"
                onClick={() => setShowNewModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] transition-all w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New Server
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Loading servers…</p>
            </div>
          )}

          {/* Server sections */}
          {!loading && (
            <div className="flex flex-col gap-6 sm:gap-8">
              {myServers.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Your Servers</h3>
                    <span className="text-xs text-muted-foreground tabular-nums px-2 py-0.5 rounded-full bg-muted/50">{myServers.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {myServers.map((server) => {
                      const sid = String(server.uuid || server.id)
                      return (
                        <ServerCard
                          key={`${sid}-${server.nodeId ?? ""}`}
                          server={server}
                          powerLoading={powerLoading}
                          onPower={sendPower}
                          isFavorite={favoriteServerIds.includes(sid)}
                          onToggleFavorite={toggleFavorite}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {otherServers.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Shared With You</h3>
                    <span className="text-xs text-muted-foreground tabular-nums px-2 py-0.5 rounded-full bg-muted/50">{otherServers.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {otherServers.map((server) => {
                      const sid = String(server.uuid || server.id)
                      return (
                        <ServerCard
                          key={`${sid}-${server.nodeId ?? ""}`}
                          server={server}
                          powerLoading={powerLoading}
                          onPower={sendPower}
                          isFavorite={favoriteServerIds.includes(sid)}
                          onToggleFavorite={toggleFavorite}
                        />
                      )
                    })}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-5">
                <Server className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                {search ? "No servers found" : "No servers yet"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                {search
                  ? "Try a different search term or clear the filter."
                  : "Deploy your first server and start building something awesome."}
              </p>
              {!search && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Deploy Server
                </button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}