"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
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
  Check,
  ChevronDown,
} from "lucide-react"

const GAMBLING_THEME_NAMES = new Set(["gambling mode dark", "gambling mode white"])

function resolveActiveThemeName(fallback?: string): string {
  if (typeof document !== "undefined") {
    const fromAttr = document.documentElement.getAttribute("data-eclipse-theme")
    if (fromAttr) return String(fromAttr)
  }

  if (typeof window !== "undefined") {
    try {
      const fromStorage = window.localStorage.getItem("eclipseTheme")
      if (fromStorage) return String(fromStorage)
    } catch {
      // skip
    }
  }

  return String(fallback || "")
}

function isGamblingThemeName(name: string): boolean {
  return GAMBLING_THEME_NAMES.has(String(name || "").trim().toLowerCase())
}

function formatBlackjackCard(card: number): string {
  if (card === 11) return "A"
  if (card === 10) return "10"
  return String(card)
}

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
    case "dmca":
      return "bg-destructive"
    default:
      return "bg-zinc-500"
  }
}

function statusLabel(status: string, t?: (key: string) => string) {
  switch (status) {
    case "online":
    case "running":
      return t ? t("status.online") : "Online"
    case "starting":
      return t ? t("status.starting") : "Starting"
    case "stopping":
      return t ? t("status.stopping") : "Stopping"
    case "offline":
    case "stopped":
      return t ? t("status.offline") : "Offline"
    case "dmca":
      return t ? t("status.dmca") : "DMCA"
    default:
      return status || (t ? t("status.unknown") : "Unknown")
  }
}

function getNodeTypeLabel(nodeType: string, t: (key: string, values?: any) => string, useFieldsPath: boolean = false) {
  const normalized = String(nodeType).trim().toLowerCase()
  const normalizedCompact = normalized.replace(/[_\-\s]+/g, "")

  const resolve = (key: string) => {
    const path = useFieldsPath ? `fields.${key}` : key
    const translated = t(path)
    return translated === path ? nodeType : translated
  }

  if (/free.*paid|paid.*free/.test(normalizedCompact)) {
    return resolve("nodeTypes.freeAndPaid")
  }

  if (normalizedCompact.includes("enterprise")) {
    return resolve("nodeTypes.enterprise")
  }

  if (normalizedCompact.includes("paid")) {
    return resolve("nodeTypes.paid")
  }

  if (normalizedCompact.includes("free")) {
    return resolve("nodeTypes.free")
  }

  return resolve("nodeTypes.unknown")
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
/*  Enhanced Template Selector                                         */
/* ------------------------------------------------------------------ */

function TemplateSelector({
  eggs,
  value,
  onChange,
  loading,
}: {
  eggs: { id: number; name: string; description?: string; icon?: string }[]
  value: string
  onChange: (id: string) => void
  loading?: boolean
}) {
  const t = useTranslations("serversPage.newServerModal")
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const selected = eggs.find((e) => String(e.id) === String(value))
  const filtered = eggs.filter(
    (egg) =>
      egg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      egg.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
    setSearchTerm("")
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 px-4 rounded-xl border border-border/50 bg-muted/30">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("states.loading")}
      </div>
    )
  }

  if (eggs.length === 0) {
    return <p className="text-xs text-destructive py-3 px-4 rounded-xl border border-destructive/20 bg-destructive/5">{t("states.noTemplates")}</p>
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-guide-id="new-server-template"
        className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all flex items-center justify-between gap-2 hover:bg-muted/40"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selected?.icon && <span className="text-lg flex-shrink-0">{selected.icon}</span>}
          <div className="text-left min-w-0 flex-1">
            <p className="font-medium truncate">{selected?.name || t("fields.template")}</p>
            {selected?.description && <p className="text-xs text-muted-foreground truncate">{selected.description}</p>}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] sm:hidden" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="fixed sm:absolute inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 z-50 w-full sm:w-full sm:max-w-md max-h-[70vh] sm:max-h-[400px] flex flex-col rounded-t-3xl sm:rounded-2xl border border-border/50 bg-card shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-top-2 duration-300">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Search */}
            <div className="p-3 border-b border-border/50 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("fields.searchTemplates")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-border/50 bg-muted/30 pl-10 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                  autoFocus
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Server className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("states.noTemplatesMatch")}</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filtered.map((egg) => {
                    const isSelected = String(egg.id) === String(value)
                    return (
                      <button
                        key={egg.id}
                        type="button"
                        onClick={() => handleSelect(String(egg.id))}
                        className={`w-full rounded-xl px-3 py-3 text-left transition-all flex items-center gap-3 ${
                          isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
                        }`}
                      >
                        {egg.icon && <span className="text-2xl flex-shrink-0">{egg.icon}</span>}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{egg.name}</p>
                          {egg.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{egg.description}</p>}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NodeSelector({
  nodes,
  value,
  onChange,
  loading,
}: {
  nodes: { id: number; name: string; nodeType?: string; memory?: number; disk?: number; cpu?: number }[]
  value: string
  onChange: (id: string) => void
  loading?: boolean
}) {
  const t = useTranslations("serversPage.newServerModal")
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const selected = nodes.find((n) => String(n.id) === String(value))
  const filtered = nodes.filter(
    (node) =>
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.nodeType?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
    setSearchTerm("")
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 px-4 rounded-xl border border-border/50 bg-muted/30">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("states.loading")}
      </div>
    )
  }

  if (nodes.length === 0) {
    return <p className="text-xs text-destructive py-3 px-4 rounded-xl border border-destructive/20 bg-destructive/5">{t("states.noNodes")}</p>
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-guide-id="new-server-node"
        className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all flex items-center justify-between gap-2 hover:bg-muted/40"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="text-left min-w-0 flex-1">
            <p className="font-medium truncate">{selected?.name || t("fields.node")}</p>
            {selected?.nodeType && (
              <p className="text-xs text-muted-foreground truncate">{getNodeTypeLabel(selected.nodeType, t, true)}</p>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] sm:hidden" onClick={() => setOpen(false)} />
          <div className="fixed sm:absolute inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 z-50 w-full sm:w-full sm:max-w-md max-h-[70vh] sm:max-h-[400px] flex flex-col rounded-t-3xl sm:rounded-2xl border border-border/50 bg-card shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-top-2 duration-300">
            <div className="flex justify-center pt-3 pb-2 sm:hidden">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="p-3 border-b border-border/50 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("fields.searchNodes")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-border/50 bg-muted/30 pl-10 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                  autoFocus
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Server className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("states.noNodesMatch")}</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filtered.map((node) => {
                    const isSelected = String(node.id) === String(value)
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => handleSelect(String(node.id))}
                        className={`w-full rounded-xl px-3 py-3 text-left transition-all flex items-center gap-3 ${
                          isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{node.name}</p>
                          {node.nodeType && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{getNodeTypeLabel(node.nodeType, t, true)}</p>
                          )}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  NewServerModal                                                     */
/* ------------------------------------------------------------------ */

function NewServerModal({ onClose, onCreated, gamblingModeEnabled }: { onClose: () => void; onCreated: () => void; gamblingModeEnabled: boolean }) {
  const t = useTranslations("serversPage.newServerModal")
  const [name, setName] = useState("")
  const [eggId, setEggId] = useState<string>("")
  const [eggs, setEggs] = useState<{ id: number; name: string; description?: string; icon?: string }[]>([])
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
  const [requestIpv6, setRequestIpv6] = useState<boolean>(false)
  const [startup, setStartup] = useState<string>("")
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([])
  const [blackjackStandAt, setBlackjackStandAt] = useState<number>(17)
  const [createResult, setCreateResult] = useState<{
    createdUuid?: string
    genericMessage?: string
    rolled?: { memory?: number; disk?: number; cpu?: number }
    luckyRoll?: boolean
    blackjack?: {
      player?: { cards?: number[]; score?: number }
      dealer?: { cards?: number[]; score?: number }
      playerStandAt?: number
      outcome?: "player" | "dealer" | "push"
    }
    bonusAppliedToLimits?: boolean
    bonusActivated?: boolean
    bonusPercent?: number
    bonusExpiresAt?: string | null
  } | null>(null)

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
    if (!name.trim()) { setError(t("errors.serverNameRequired")); return }
    if (!eggId) { setError(t("errors.selectServerType")); return }
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

      const createPayload: Record<string, any> = {
        name: name.trim(),
        eggId: Number(eggId),
        nodeId,
        kvmPassthroughEnabled: finalKvm,
        startup: finalStartup,
        environment: envObject,
      }

      if (!gamblingModeEnabled) {
        createPayload.memory = memory
        createPayload.disk = disk
        createPayload.cpu = cpu
      } else {
        createPayload.playerStandAt = blackjackStandAt
      }
      if (requestIpv6) {
        createPayload.requestIpv6 = true
      }

      const createRes = await apiFetch(API_ENDPOINTS.servers, {
        method: "POST",
        body: JSON.stringify(createPayload),
      })

      const gamblingRes = createRes?.gambling
      onCreated()
      if (gamblingRes?.enabled && gamblingRes?.rolled) {
        setCreateResult({ createdUuid: createRes?.uuid, ...gamblingRes })
      } else {
        setCreateResult({
          createdUuid: createRes?.uuid,
          genericMessage: t("messages.serverCreated"),
        })
      }
      setCreating(false)
    } catch (err: any) {
      setError(err.message || t("errors.failedCreate"))
      setCreating(false)
    }
  }

  const selectedNode = nodes.find((n) => n.id === nodeId)
  const isEnterpriseNode = selectedNode?.nodeType?.toLowerCase().includes("enterprise") ?? false
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
    (user ? (user.emailVerified && (((user.passkeyCount ?? 0) > 0) || !!user.twoFactorEnabled)) : true)

  const selectedEgg = eggs.find((e) => String(e.id) === String(eggId)) as any

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full sm:max-w-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-card border border-border/50 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-2 sm:zoom-in-95 duration-300 overflow-hidden">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50 flex-shrink-0 bg-card/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{t("header.title")}</h2>
              <p className="text-xs text-muted-foreground hidden sm:block">{t("header.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6 space-y-5">
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
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">{t("alerts.verifyEmail")}</p>
              </div>
            )}
            {user && (user.passkeyCount ?? 0) === 0 && !user.twoFactorEnabled && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <KeyRound className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">{t("alerts.securityRequirement")}</p>
              </div>
            )}

            {/* Server Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fields.serverName.label")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("fields.serverName.placeholder")}
                data-guide-id="new-server-name"
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:bg-muted/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fields.template")}</label>
              <TemplateSelector eggs={eggs} value={eggId} onChange={setEggId} loading={eggsLoading} />
            </div>

            {/* Node Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fields.node")}</label>
              <NodeSelector nodes={nodes} value={nodeId ? String(nodeId) : ""} onChange={(id) => setNodeId(Number(id))} loading={nodesLoading} />
            </div>

            {/* Startup */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fields.startup.label")}</label>
              <textarea
                value={startup}
                readOnly
                rows={1}
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:bg-muted/50 focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                placeholder={t("fields.startup.placeholder")}
              />
              <p className="text-[10px] text-muted-foreground/80">{t("fields.startup.hint")}</p>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("fields.env.title")}</label>
                <button
                  type="button"
                  onClick={() => setEnvVars((prev) => [...prev, { key: "", value: "" }])}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border/50 bg-muted/30 text-foreground hover:bg-muted/50 active:scale-95 transition-all"
                >
                  {t("fields.env.add")}
                </button>
              </div>
              {envVars.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t("fields.env.empty")}</p>
              ) : (
                <div className="space-y-2">
                  {envVars.map((row, idx) => (
                    <div key={`env-${idx}`} className="grid grid-cols-12 gap-2">
                      <input
                        value={row.key}
                        onChange={(e) => setEnvVars((prev) => prev.map((item, i) => i === idx ? { ...item, key: e.target.value } : item))}
                        placeholder={t("fields.env.keyPlaceholder")}
                        className="col-span-5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                      <input
                        value={row.value}
                        onChange={(e) => setEnvVars((prev) => prev.map((item, i) => i === idx ? { ...item, value: e.target.value } : item))}
                        placeholder={t("fields.env.valuePlaceholder")}
                        className="col-span-6 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                      <button
                        type="button"
                        onClick={() => setEnvVars((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 rounded-xl border border-border/50 text-xs text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
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
                <p className="text-sm font-semibold text-foreground">{t("resources.title")}</p>
              </div>

              {!isEnterpriseNode && (
                <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                  {t("resources.notice")}
                </div>
              )}

              {gamblingModeEnabled && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {t("resources.gamblingActive")}
                </div>
              )}

              {gamblingModeEnabled && (
                <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("resources.blackjackTable")}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/50 bg-background/70 px-2 py-2">
                      <p className="text-muted-foreground">{t("resources.dealer")}</p>
                      <p className="mt-1 font-medium text-foreground">? + ?</p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/70 px-2 py-2">
                      <p className="text-muted-foreground">{t("resources.you")}</p>
                      <p className="mt-1 font-medium text-foreground">{t("resources.autoDraw")}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("resources.higherHands")}</p>
                </div>
              )}

              {gamblingModeEnabled && (
                <div className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("resources.standTarget")}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      value={String(blackjackStandAt)}
                      onChange={(e) => setBlackjackStandAt(Number(e.target.value))}
                      className="rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50"
                    >
                      <option value="15">{t("resources.standAt", { value: 15 })}</option>
                      <option value="16">{t("resources.standAt", { value: 16 })}</option>
                      <option value="17">{t("resources.standAt", { value: 17 })}</option>
                      <option value="18">{t("resources.standAt", { value: 18 })}</option>
                      <option value="19">{t("resources.standAt", { value: 19 })}</option>
                      <option value="20">{t("resources.standAt", { value: 20 })}</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">{t("resources.standHint")}</p>
                  </div>
                </div>
              )}

              {/* Source toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: t("resources.memory"), source: memorySource, setSource: setMemorySource, planVal: limits?.memory, nodeVal: nodeMemory, unit: "MB", icon: MemoryStick },
                  { label: t("resources.disk"), source: diskSource, setSource: setDiskSource, planVal: limits?.disk, nodeVal: nodeDisk, unit: "MB", icon: HardDrive },
                  { label: t("resources.cpu"), source: cpuSource, setSource: setCpuSource, planVal: limits?.cpu, nodeVal: nodeCpu, unit: "%", icon: Cpu },
                ].map(({ label, source, setSource, planVal, nodeVal, unit, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl border border-border/30 bg-background/60 px-3 py-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <select
                      className="flex-1 bg-transparent text-xs text-foreground outline-none cursor-pointer min-w-0"
                      value={source}
                      onChange={(e) => setSource(e.target.value as "plan" | "node")}
                      disabled={gamblingModeEnabled}
                    >
                      {planVal != null && <option value="plan">{t("resources.planOption", { value: planVal, unit })}</option>}
                      {nodeVal != null && <option value="node">{t("resources.nodeOption", { value: nodeVal, unit })}</option>}
                    </select>
                  </div>
                ))}
              </div>

              {!hasLimits ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {planName !== "free"
                    ? <>{t.rich("resources.noLimitsPlan", { planName, strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</>
                    : <>{t("resources.noPlanAssigned")}</>
                  }
                </p>
              ) : (
                <div className="space-y-5">
                  {maxMemory !== null && (
                    <ResourceSlider
                      label={t("resources.memory")}
                      icon={MemoryStick}
                      value={memory}
                      min={128}
                      max={maxMemory}
                      step={128}
                      onChange={setMemory}
                      format={(v) => `${v} MB`}
                      color="text-blue-500"
                      disabled={gamblingModeEnabled}
                    />
                  )}
                  {maxDisk !== null && (
                    <ResourceSlider
                      label={t("resources.disk")}
                      icon={HardDrive}
                      value={disk}
                      min={1024}
                      max={maxDisk}
                      step={1024}
                      onChange={setDisk}
                      format={(v) => v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`}
                      formatMax={(v) => v >= 1024 ? `${(v / 1024).toFixed(0)} GB` : `${v} MB`}
                      color="text-emerald-500"
                      disabled={gamblingModeEnabled}
                    />
                  )}
                  {maxCpu !== null && (
                    <ResourceSlider
                      label={t("resources.cpu")}
                      icon={Cpu}
                      value={cpu}
                      min={10}
                      max={maxCpu}
                      step={10}
                      onChange={setCpu}
                      format={(v) => `${v}%`}
                      color="text-amber-500"
                      disabled={gamblingModeEnabled}
                    />
                  )}
                </div>
              )}
            </div>

            {selectedEgg && (selectedEgg.requiresKvm || selectedEgg.requires_kvm) ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <input id="new-server-kvm" type="checkbox" checked={true} disabled className="h-4 w-4 rounded border-border bg-secondary/50 text-primary" />
                <label htmlFor="new-server-kvm">{t("kvm.required")}</label>
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
                <label htmlFor="new-server-kvm">{t("kvm.enable")}</label>
              </div>
            ) : null}
            <div className="flex items-center justify-center gap-2 text-sm text-foreground">
              <input
                id="new-server-request-ipv6"
                type="checkbox"
                checked={requestIpv6}
                onChange={(e) => setRequestIpv6(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-secondary/50 text-primary focus:ring-primary"
              />
              <label htmlFor="new-server-request-ipv6">Request IPv6</label>
            </div>
            <p className="text-[11px] text-muted-foreground/70 text-center">
              {t("kvm.portHint")}
            </p>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 border-t border-border/50 bg-card/95 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 safe-area-inset-bottom">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border/50 bg-muted/30 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all text-center"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              data-guide-id="new-server-deploy"
              disabled={creating || !canCreate}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all min-h-[44px]"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {creating ? t("actions.deploying") : t("actions.deploy")}
            </button>
          </div>
        </form>

        {createResult && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-md rounded-2xl border border-primary/40 bg-card p-5 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300 overflow-hidden">
              <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/20 blur-2xl animate-pulse" />
              <div className="absolute -left-10 -bottom-10 h-28 w-28 rounded-full bg-accent/40 blur-2xl animate-pulse" />

              <div className="relative flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {createResult.rolled ? t("result.blackjackTitle") : t("result.createdTitle")}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative space-y-3 text-xs">
                {createResult.genericMessage && !createResult.rolled && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="font-medium text-foreground">{createResult.genericMessage}</p>
                    {createResult.createdUuid && (
                      <p className="text-muted-foreground mt-1 break-all">{t("result.serverId", { id: createResult.createdUuid })}</p>
                    )}
                  </div>
                )}

                {createResult.rolled && createResult.blackjack && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                  <p className="font-semibold text-foreground">{t("result.creationNotice")}</p>
                  <p className="mt-1 text-foreground/90">
                    {t("result.handVsDealer", {
                      player: Number(createResult.blackjack.player?.score || 0),
                      dealer: Number(createResult.blackjack.dealer?.score || 0),
                      outcome:
                        createResult.blackjack.outcome === "player"
                          ? t("result.outcomes.won")
                          : createResult.blackjack.outcome === "dealer"
                            ? t("result.outcomes.lost")
                            : t("result.outcomes.pushed"),
                    })}
                  </p>
                  <p className="text-foreground/90">
                    {t("result.serverGot", {
                      memory: Number(createResult.rolled?.memory || 0),
                      disk: Number(createResult.rolled?.disk || 0),
                      cpu: Number(createResult.rolled?.cpu || 0),
                    })}
                  </p>
                </div>
                )}

                {createResult.rolled && (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-muted-foreground mb-1">{t("result.assignedResources")}</p>
                  <p className="font-medium text-foreground tabular-nums">
                    {t("result.serverGot", {
                      memory: Number(createResult.rolled?.memory || 0),
                      disk: Number(createResult.rolled?.disk || 0),
                      cpu: Number(createResult.rolled?.cpu || 0),
                    })}
                  </p>
                </div>
                )}

                {createResult.rolled && (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-muted-foreground mb-1">{t("result.luckyRoll")}</p>
                  <p className={`font-semibold ${createResult.luckyRoll ? "text-emerald-500 animate-pulse" : "text-amber-500"}`}>
                    {createResult.luckyRoll ? t("result.luckyTriggered") : t("result.luckyMissed")}
                  </p>
                </div>
                )}

                {createResult.rolled && createResult.blackjack && (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-muted-foreground mb-1">{t("result.blackjackRound")}</p>
                  <p className="font-medium text-foreground tabular-nums">
                    {t("result.roundSummary", {
                      playerScore: Number(createResult.blackjack.player?.score || 0),
                      playerCards: (createResult.blackjack.player?.cards || []).map((card) => formatBlackjackCard(Number(card))).join(" + ") || "-",
                      dealerScore: Number(createResult.blackjack.dealer?.score || 0),
                      dealerCards: (createResult.blackjack.dealer?.cards || []).map((card) => formatBlackjackCard(Number(card))).join(" + ") || "-",
                    })}
                  </p>
                  <p className="text-muted-foreground mt-1">{t("result.standTarget", { value: Number(createResult.blackjack.playerStandAt || 17) })}</p>
                  <p className={`mt-1 font-semibold ${createResult.blackjack.outcome === "player" ? "text-emerald-500" : createResult.blackjack.outcome === "dealer" ? "text-amber-500" : "text-blue-500"}`}>
                    {createResult.blackjack.outcome === "player"
                      ? t("result.outcomeMessage.player")
                      : createResult.blackjack.outcome === "dealer"
                        ? t("result.outcomeMessage.dealer")
                        : t("result.outcomeMessage.push")}
                  </p>
                </div>
                )}

                {createResult.rolled && (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-muted-foreground mb-1">{t("result.bonusTitle", { percent: ((Number(createResult.bonusPercent || 0)) * 100).toFixed(2) })}</p>
                  <p className="font-medium text-foreground">
                    {createResult.bonusActivated
                      ? t("result.bonusActivated", { until: createResult.bonusExpiresAt ? new Date(createResult.bonusExpiresAt).toLocaleString() : t("result.untilTomorrow") })
                      : createResult.bonusAppliedToLimits
                        ? t("result.bonusAlreadyActive", { until: createResult.bonusExpiresAt ? new Date(createResult.bonusExpiresAt).toLocaleString() : t("result.untilSoon") })
                        : t("result.notActive")}
                  </p>
                </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all"
                >
                  {t("actions.close")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ResourceSlider                                                     */
/* ------------------------------------------------------------------ */

function ResourceSlider({
  label, icon: Icon, value, min, max, step, onChange, format, formatMax, color, disabled,
}: {
  label: string; icon: any; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format: (v: number) => string; formatMax?: (v: number) => string; color: string
  disabled?: boolean
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
          disabled={disabled}
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
  const t = useTranslations("serversPage")
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
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors text-sm sm:text-[15px]">
                {server.name}
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="capitalize">{statusLabel(server.status, t)}</span>
              {server.resources?.uptime != null && server.resources.uptime > 0 && (
                <>
                  <span className="text-border hidden sm:inline">·</span>
                  <span className="hidden sm:flex items-center gap-1 tabular-nums">
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
              aria-label={isFavorite ? t("serverCard.unfavorite") : t("serverCard.favorite")}
              className={`rounded-lg p-2 transition-all active:scale-90 ${isFavorite ? 'text-yellow-400 hover:text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 stroke-yellow-400' : ''}`} />
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors hidden sm:block" />
          </div>
        </div>
      </Link>

      {/* Stats rings */}
      <div className="px-4 sm:px-5 pb-1">
        <div className="flex items-center justify-between gap-2 py-3 border-t border-border/30">
          {/* CPU */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={cpuVal} size={36} stroke={3} color={cpuVal > 80 ? "#ef4444" : cpuVal > 50 ? "#f59e0b" : "#3b82f6"} />
              <Cpu className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{t("resources.cpu")}</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{cpuVal}%</p>
            </div>
          </div>

          {/* RAM */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={ramPct} size={36} stroke={3} color={ramPct > 80 ? "#ef4444" : ramPct > 50 ? "#f59e0b" : "#10b981"} />
              <MemoryStick className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{t("resources.ram")}</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatBytes(server.resources?.memory_bytes ?? 0)}</p>
            </div>
          </div>

          {/* Disk */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <UsageRing value={diskPct} size={36} stroke={3} color={diskPct > 80 ? "#ef4444" : diskPct > 50 ? "#f59e0b" : "#8b5cf6"} />
              <HardDrive className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{t("resources.disk")}</p>
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
            className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-3 sm:px-3.5 py-2.5 sm:py-1.5 text-xs font-medium text-red-500 transition-all hover:bg-red-500/15 active:scale-95 disabled:opacity-50 min-h-[40px] sm:min-h-0 flex-1 sm:flex-initial"
          >
            <Square className="h-3 w-3" />
            <span>{t("actions.stop")}</span>
          </button>
        ) : (
          <button
            onClick={() => onPower(sid, "start")}
            disabled={powerLoading === sid}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 sm:px-3.5 py-2.5 sm:py-1.5 text-xs font-medium text-emerald-500 transition-all hover:bg-emerald-500/15 active:scale-95 disabled:opacity-50 min-h-[40px] sm:min-h-0 flex-1 sm:flex-initial"
          >
            <Play className="h-3 w-3" />
            <span>{t("actions.start")}</span>
          </button>
        )}
        <button
          onClick={() => onPower(sid, "restart")}
          disabled={powerLoading === sid}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 px-3 sm:px-3.5 py-2.5 sm:py-1.5 text-xs font-medium text-amber-500 transition-all hover:bg-amber-500/15 active:scale-95 disabled:opacity-50 min-h-[40px] sm:min-h-0 flex-1 sm:flex-initial"
        >
          <RotateCcw className="h-3 w-3" />
          <span>{t("actions.restart")}</span>
        </button>
        <Link
          href={`/dashboard/servers/${sid}`}
          className="hidden sm:flex ml-auto items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/15 active:scale-95"
        >
          <Terminal className="h-3 w-3" />
          {t("actions.console")}
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ServersPage                                                        */
/* ------------------------------------------------------------------ */

export default function ServersPage() {
  const t = useTranslations("serversPage")
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
  const [powerLoading, setPowerLoading] = useState<string | null>(null)
  const [powerToast, setPowerToast] = useState<{ type: "success" | "warning" | "error"; title: string; message: string } | null>(null)
  const [gamblingFeatureEnabled, setGamblingFeatureEnabled] = useState(true)
  const [activeThemeName, setActiveThemeName] = useState<string>(() => resolveActiveThemeName(String(user?.settings?.theme?.name || "")))
  const gamblingModeEnabled = gamblingFeatureEnabled && isGamblingThemeName(activeThemeName)
  const RANDOM_SHUTDOWN_INTERVAL_MS = 10 * 60 * 1000
  const RANDOM_SHUTDOWN_CHANCE = 0.0025

  useEffect(() => {
    const syncTheme = () => setActiveThemeName(resolveActiveThemeName(String(user?.settings?.theme?.name || "")))
    syncTheme()
    if (typeof window === "undefined") return

    window.addEventListener("eclipse-theme-changed", syncTheme as EventListener)
    window.addEventListener("storage", syncTheme)
    return () => {
      window.removeEventListener("eclipse-theme-changed", syncTheme as EventListener)
      window.removeEventListener("storage", syncTheme)
    }
  }, [user?.settings?.theme?.name])

  useEffect(() => {
    if (!powerToast) return
    const timer = window.setTimeout(() => setPowerToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [powerToast])

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
      const res = await apiFetch(API_ENDPOINTS.serverPower.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ action }),
      })

      if (res && typeof res === "object" && res.success === false) {
        setPowerToast({
          type: "warning",
          title: t("toasts.diceDeniedTitle"),
          message: res.message || res.error || t("toasts.powerDenied"),
        })
        return
      }

      setPowerToast({
        type: "success",
        title: t("toasts.actionSentTitle"),
        message: t("toasts.actionRequested", { action: action.toUpperCase() }),
      })
      setTimeout(loadServers, 1500)
    } catch (e: any) {
      setPowerToast({
        type: "error",
        title: t("toasts.powerFailedTitle"),
        message: e?.message || t("toasts.unknownError"),
      })
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
      alert(t("errors.favoriteSaveFailed", { reason: e?.message || t("toasts.unknownError") }))
    }
  }

  useEffect(() => { loadServers() }, [loadServers])

  useEffect(() => {
    if (!gamblingModeEnabled) return

    const randomShutdownTick = async () => {
      if (!user?.id) return

      const shouldTrigger = Math.random() < RANDOM_SHUTDOWN_CHANCE
      if (!shouldTrigger) return

      const candidates = servers.filter((s) => {
        const sid = String(s.uuid || s.id || "")
        if (!sid) return false
        const owned = Number(s.userId) === Number(user.id)
        const running = s.status === "online" || s.status === "running"
        return owned && running
      })

      if (candidates.length === 0) return

      const picked = candidates[Math.floor(Math.random() * candidates.length)]
      const targetId = String(picked.uuid || picked.id)
      if (!targetId) return

      setPowerToast({
        type: "warning",
        title: t("toasts.diceEventTitle"),
        message: t("toasts.diceShutdown"),
      })

      try {
        const res = await apiFetch(API_ENDPOINTS.serverPower.replace(":id", targetId), {
          method: "POST",
          body: JSON.stringify({ action: "stop" }),
        })

        if (res && typeof res === "object" && res.success === false) {
          setPowerToast({
            type: "warning",
            title: t("toasts.diceEventTitle"),
            message: res.message || t("toasts.diceBlocked"),
          })
          return
        }

        setTimeout(loadServers, 1500)
      } catch {
        setPowerToast({
          type: "error",
          title: t("toasts.diceEventTitle"),
          message: t("toasts.diceFailed"),
        })
      }
    }

    const interval = window.setInterval(() => {
      randomShutdownTick().catch(() => {})
    }, RANDOM_SHUTDOWN_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [gamblingModeEnabled, servers, user, loadServers])

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
      {powerToast && (
        <div className="fixed inset-x-0 bottom-0 sm:bottom-4 z-[9999] px-3 sm:px-4 pointer-events-none pb-safe">
          <div
            className={`mx-auto w-full max-w-sm sm:max-w-md rounded-t-2xl sm:rounded-2xl border p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto ${
              powerToast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : powerToast.type === "warning"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-destructive/30 bg-destructive/10"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                powerToast.type === "success"
                  ? "bg-emerald-500"
                  : powerToast.type === "warning"
                    ? "bg-amber-500"
                    : "bg-destructive"
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-tight">{powerToast.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug break-words">{powerToast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setPowerToast(null)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewModal && <NewServerModal onClose={() => setShowNewModal(false)} onCreated={loadServers} gamblingModeEnabled={gamblingModeEnabled} />}

      <PanelHeader title={t("header.title")} description={t("header.description")} />

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-4 sm:gap-5 p-3 sm:p-5 md:p-6 max-w-[100vw] w-full min-w-0 box-border pb-safe">

          {/* Quick stats */}
          {!loading && servers.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.total")}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground tabular-nums mt-0.5">{servers.length}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.online")}</p>
                <p className="text-lg sm:text-2xl font-bold text-emerald-500 tabular-nums mt-0.5">{onlineCount}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t("stats.offline")}</p>
                <p className="text-lg sm:text-2xl font-bold text-muted-foreground tabular-nums mt-0.5">{servers.length - onlineCount}</p>
              </div>
            </div>
          )}

          {/* Favorites */}
          {favoriteServers.length > 0 && (
            <section className="sticky top-0 z-20 rounded-2xl border border-border/50 bg-card p-3 sm:p-4 shadow-sm shadow-black/5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{t("sections.favorites")}</h3>
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
                placeholder={t("search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-card pl-10 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5 active:scale-90 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <button
                data-guide-id="servers-new"
                onClick={() => setShowNewModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all flex-1 sm:flex-initial"
              >
                <Plus className="h-4 w-4" />
                {t("actions.newServer")}
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
              <p className="text-sm text-muted-foreground">{t("states.loadingServers")}</p>
            </div>
          )}

          {/* Server sections */}
          {!loading && (
            <div className="flex flex-col gap-6 sm:gap-8">
              {myServers.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("sections.yourServers")}</h3>
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
                    <h3 className="text-sm font-semibold text-foreground">{t("sections.sharedWithYou")}</h3>
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
                {search ? t("states.noServersFound") : t("states.noServersYet")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                {search
                  ? t("states.tryDifferentSearch")
                  : t("states.deployFirst")}
              </p>
              {!search && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  {t("actions.deployServer")}
                </button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}