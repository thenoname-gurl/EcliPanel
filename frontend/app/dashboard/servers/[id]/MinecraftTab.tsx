"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { cn } from "@/lib/utils"
import {
  Users,
  UserPlus,
  UserMinus,
  Ban,
  Undo2,
  LogOut,
  Search,
  Loader2,
  AlertCircle,
  Check,
  RefreshCw,
  Shield,
  ShieldOff,
  UserCheck,
  Crown,
  Settings,
  GitBranch,
  Info,
  Package,
  Download,
  Trash2,
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from "next-intl"
import { LoadingState } from "./serverTabShared"

function readableKey(k: string) {
  const acronyms = new Set(["motd", "pvp", "rcon", "ram", "cpu", "tps", "ip", "dns", "gui", "id", "ui", "api", "url", "json", "yml", "yaml", "xml", "html", "css", "js", "ts", "md"])
  return k.split(/[-.]+/).map(w => {
    const lower = w.toLowerCase()
    return acronyms.has(lower) ? lower.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join(" ")
}

function mcAvatar(p: { name: string; uuid?: string }, size = 32) {
  const id = p.uuid || p.name
  return `https://minotar.net/avatar/${encodeURIComponent(id)}/${size}`
}

interface Player { name: string; uuid?: string }

type McTabView = "online" | "whitelist" | "bans" | "ops" | "versions" | "plugins" | "playerdat" | "settings"

interface MinecraftTabProps {
  serverId: string
  server?: any
  subuserEntry?: any
}

// ─── Plugins ──────────────────────────────────────────────────────────────────

interface PluginResult {
  name: string
  slug: string
  description: string
  author: string
  downloads: number
  version: string
  iconUrl: string | null
  source: "modrinth"
  downloadUrl: string
  projectId: string | null
}

interface InstalledPlugin {
  name: string
  filename: string
  size: number
  lastModified: string | null
  slug: string | null
  version: string | null
  versionId: string | null
  installedAt: string | null
}

// ─── Colapsible ───────────────────────────────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, defaultOpen = false, children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-secondary/20 active:bg-secondary/30 transition-colors min-w-0" aria-expanded={open}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {Icon && <Icon className="h-4 w-4 text-primary flex-shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate min-w-0">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && <div className="p-3.5 sm:p-4 pt-0 border-t border-border overflow-hidden">{children}</div>}
    </div>
  )
}

export function MinecraftTab({ serverId, server, subuserEntry }: MinecraftTabProps) {
  const t = useTranslations("serverMinecraftTab")
  const [tab, setTab] = useState<McTabView>("online")
  const [players, setPlayers] = useState<Player[]>([])
  const [online, setOnline] = useState(0)
  const [max, setMax] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reachable, setReachable] = useState(true)
  const [whitelistNames, setWhitelistNames] = useState<Set<string>>(new Set())
  const [banNames, setBanNames] = useState<Set<string>>(new Set())
  const [opNames, setOpNames] = useState<Set<string>>(new Set())
  const [whitelistEnabled, setWhitelistEnabled] = useState(false)
  const [togglingWhitelist, setTogglingWhitelist] = useState(false)
  const [settings, setSettings] = useState<{ key: string; value: string }[]>([])
  const [savingSettings, setSavingSettings] = useState(false)
  const [startupCommand, setStartupCommand] = useState("")
  const [startupLoading, setStartupLoading] = useState(false)
  const [savingStartup, setSavingStartup] = useState(false)

  const [actionTarget, setActionTarget] = useState("")
  const [actionReason, setActionReason] = useState("")
  const [actionDialog, setActionDialog] = useState<{
    type: "whitelist" | "unwhitelist" | "ban" | "pardon" | "kick" | "op" | "deop" | "delete-plugin"
    extra?: string
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState("")

  // ─── Versions state ─────────────────────────────────────────────────────────

  type ServerType = "paper" | "vanilla"
  const detectedType: ServerType = server?.environment?.BUILD_NUMBER ? "paper" : "vanilla"
  const [serverType, setServerType] = useState<ServerType>(detectedType)
  const [applying, setApplying] = useState(false)
  const [showReinstall, setShowReinstall] = useState(false)
  const [reinstallWipe, setReinstallWipe] = useState(false)
  const [reinstalling, setReinstalling] = useState(false)

  const [paperVersions, setPaperVersions] = useState<string[]>([])
  const [paperBuilds, setPaperBuilds] = useState<any[]>([])
  const [paperSelectedVersion, setPaperSelectedVersion] = useState("")
  const [paperSelectedBuild, setPaperSelectedBuild] = useState<number | null>(null)
  const [paperCurrentVersion, setPaperCurrentVersion] = useState("")
  const [paperCurrentBuild, setPaperCurrentBuild] = useState("")
  const [paperLoading, setPaperLoading] = useState(true)
  const [paperBuildsLoading, setPaperBuildsLoading] = useState(false)
  const [expandedBuild, setExpandedBuild] = useState<number | null>(null)

  const [vanillaVersions, setVanillaVersions] = useState<any[]>([])
  const [vanillaSelectedVersion, setVanillaSelectedVersion] = useState("")
  const [vanillaCurrentVersion, setVanillaCurrentVersion] = useState("")
  const [vanillaLoading, setVanillaLoading] = useState(false)

  const isInstalling = server?.installing
  const serverStatus = server?.status || ""

  // ─── Plugins state ──────────────────────────────────────────────────────────

  const [pluginSearch, setPluginSearch] = useState("")
  const [pluginResults, setPluginResults] = useState<PluginResult[]>([])
  const [pluginSearching, setPluginSearching] = useState(false)
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null)
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([])
  const [loadingInstalled, setLoadingInstalled] = useState(false)

  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState("")

  // ─── Player data state ────────────────────────────────────────────────────────

  const [knownPlayers, setKnownPlayers] = useState<Player[]>([])
  const [knownPlayersTotal, setKnownPlayersTotal] = useState(0)
  const [knownPlayersLoading, setKnownPlayersLoading] = useState(false)

  // ─── Load players ───────────────────────────────────────────────────────────

  const loadPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === "online") {
        const [data, wlData, banData, opData] = await Promise.all([
          apiFetch(API_ENDPOINTS.serverPlayers.replace(":id", serverId)),
          apiFetch(API_ENDPOINTS.serverPlayersWhitelist.replace(":id", serverId)).catch(() => ({ players: [] })),
          apiFetch(API_ENDPOINTS.serverPlayers.replace(":id", serverId) + "/bans").catch(() => ({ players: [] })),
          apiFetch(API_ENDPOINTS.serverPlayersOps.replace(":id", serverId)).catch(() => ({ players: [] })),
        ])
        setPlayers(data.players || [])
        setOnline(data.online ?? 0)
        setMax(data.max ?? 0)
        setReachable(data.reachable !== false)
        setWhitelistNames(new Set((wlData.players || []).map((p: Player) => p.name)))
        setBanNames(new Set((banData.players || []).map((p: Player) => p.name)))
        setOpNames(new Set((opData.players || []).map((p: Player) => p.name)))
      } else if (tab === "whitelist") {
        const [data, statusData] = await Promise.all([
          apiFetch(API_ENDPOINTS.serverPlayersWhitelist.replace(":id", serverId)),
          apiFetch(API_ENDPOINTS.serverPlayersWhitelistStatus.replace(":id", serverId)).catch(() => ({ enabled: false })),
        ])
        setPlayers(data.players || [])
        setWhitelistEnabled(statusData.enabled === true)
      } else if (tab === "bans") {
        const data = await apiFetch(API_ENDPOINTS.serverPlayers.replace(":id", serverId) + "/bans")
        setPlayers(data.players || [])
      } else if (tab === "ops") {
        const data = await apiFetch(API_ENDPOINTS.serverPlayersOps.replace(":id", serverId))
        setPlayers(data.players || [])
      } else if (tab === "settings") {
        const [data, startupData] = await Promise.all([
          apiFetch(API_ENDPOINTS.serverPlayersSettings.replace(":id", serverId)),
          apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId)).catch(() => ({ startup: "" })),
        ])
        setSettings(data.entries || [])
        setStartupCommand(startupData.startup || "")
      }
    } catch (e: any) {
      setError(e?.message || t("errors.loadPlayers"))
      setPlayers([])
    }
    setLoading(false)
  }, [serverId, tab])

  useEffect(() => {
    if (tab === "online" || tab === "whitelist" || tab === "bans" || tab === "ops" || tab === "settings") {
      loadPlayers()
    }
  }, [loadPlayers, tab])

  // ─── Plugin effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "plugins") return
    setLoadingInstalled(true)
    apiFetch(API_ENDPOINTS.serverPlugins.replace(":id", serverId))
      .then((data: any) => setInstalledPlugins(data?.plugins || []))
      .catch(() => {})
      .finally(() => setLoadingInstalled(false))
  }, [serverId, tab])

  // ─── Paper effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "versions" || serverType !== "paper") return
    setPaperLoading(true)
    apiFetch(API_ENDPOINTS.serverPaperVersions.replace(":id", serverId))
      .then((data: any) => {
        const list: string[] = data.versions || []
        setPaperVersions(list)
        setPaperCurrentVersion(data.currentVersion || "")
        setPaperCurrentBuild(data.currentBuild || "")
        const cv = data.currentVersion || ""
        if (cv === "latest") {
          setPaperSelectedVersion("latest")
        } else if (cv && /^\d/.test(cv) && list.includes(cv)) {
          setPaperSelectedVersion(cv)
        } else if (list.length > 0) {
          setPaperSelectedVersion(list[list.length - 1])
        }
      })
      .catch(() => setError(t("errors.loadPaperVersions")))
      .finally(() => setPaperLoading(false))
  }, [serverId, serverType, tab])

  useEffect(() => {
    if (tab !== "versions" || serverType !== "paper") return
    if (!paperSelectedVersion) return
    if (paperSelectedVersion === "latest") {
      setPaperBuilds([])
      setPaperSelectedBuild(null)
      return
    }
    if (!/^\d/.test(paperSelectedVersion)) return
    setPaperBuildsLoading(true)
    setPaperBuilds([])
    setPaperSelectedBuild(null)
    const params = new URLSearchParams({ version: paperSelectedVersion })
    apiFetch(`${API_ENDPOINTS.serverPaperVersions.replace(":id", serverId)}?${params.toString()}`)
      .then((data: any) => {
        const raw = data.builds || []
        if (!Array.isArray(raw)) { setError("Unexpected response format from PaperMC API"); return }
        const mapped = raw.map((b: any) => (typeof b === "number" ? { build: b, channel: "default", downloads: null, changes: [] } : b)).filter((b: any) => b && typeof b.build === "number")
        const sorted = [...mapped].sort((a: any, b: any) => b.build - a.build)
        setPaperBuilds(sorted)
        const current = Number(paperCurrentBuild)
        if (current && sorted.some((b: any) => b.build === current)) {
          setPaperSelectedBuild(current)
        } else if (sorted.length > 0) {
          setPaperSelectedBuild(sorted[0].build)
        }
      })
      .catch((err: any) => setError(err?.message || t("errors.loadBuilds")))
      .finally(() => setPaperBuildsLoading(false))
  }, [paperSelectedVersion, serverId, paperCurrentBuild, serverType, tab])

  // ─── Vanilla effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "versions" || serverType !== "vanilla") return
    setVanillaLoading(true)
    apiFetch(API_ENDPOINTS.serverVanillaVersions.replace(":id", serverId))
      .then((data: any) => {
        setVanillaVersions(data.versions || [])
        setVanillaCurrentVersion(data.currentVersion || "")
        const cv = data.currentVersion || ""
        if (cv && cv !== "latest") setVanillaSelectedVersion(cv)
      })
      .catch(() => setError(t("errors.loadVanillaVersions")))
      .finally(() => setVanillaLoading(false))
  }, [serverId, serverType, tab])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleAction = async () => {
    if (!actionTarget) return
    setActionLoading(true)
    const body: Record<string, string> = { player: actionTarget }
    if (actionReason) body.reason = actionReason
    const type = actionDialog?.type || ""
    let ep = ""
    let method = "POST"
    if (type === "whitelist") { ep = API_ENDPOINTS.serverPlayersWhitelist.replace(":id", serverId) }
    else if (type === "unwhitelist") { ep = API_ENDPOINTS.serverPlayersWhitelist.replace(":id", serverId) + "/" + encodeURIComponent(actionTarget); method = "DELETE" }
    else if (type === "ban") { ep = API_ENDPOINTS.serverPlayersBan.replace(":id", serverId) }
    else if (type === "pardon") { ep = API_ENDPOINTS.serverPlayersPardon.replace(":id", serverId) }
    else if (type === "kick") { ep = API_ENDPOINTS.serverPlayersKick.replace(":id", serverId) }
    else if (type === "op") { ep = API_ENDPOINTS.serverPlayersOp.replace(":id", serverId) }
    else if (type === "deop") { ep = API_ENDPOINTS.serverPlayersDeop.replace(":id", serverId) }
    else if (type === "delete-plugin") { ep = API_ENDPOINTS.serverPlugins.replace(":id", serverId) + "/" + encodeURIComponent(actionTarget); method = "DELETE" }
    if (!ep) return
    try {
      await apiFetch(ep, { method, ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}) })
      setActionDialog(null)
      setActionTarget("")
      setActionReason("")
      loadPlayers()
      if (type === "delete-plugin") {
        const data = await apiFetch(API_ENDPOINTS.serverPlugins.replace(":id", serverId))
        setInstalledPlugins(data?.plugins || [])
      }
    } catch (e: any) {
      setError(e?.message || t("errors.actionFailed"))
    }
    setActionLoading(false)
  }

  const handleApply = async () => {
    setApplying(true)
    setError("")
    try {
      if (serverType === "paper") {
        if (!paperSelectedVersion) return
        if (paperSelectedVersion !== "latest" && paperSelectedBuild === null) return
        await apiFetch(API_ENDPOINTS.serverPaperApply.replace(":id", serverId), {
          method: "POST",
          body: JSON.stringify({ version: paperSelectedVersion, build: paperSelectedVersion === "latest" ? "latest" : paperSelectedBuild }),
        })
      } else if (serverType === "vanilla") {
        if (!vanillaSelectedVersion) return
        await apiFetch(API_ENDPOINTS.serverVanillaApply.replace(":id", serverId), {
          method: "POST",
          body: JSON.stringify({ version: vanillaSelectedVersion }),
        })
      }
      setShowReinstall(true)
    } catch (e: any) {
      setError(e.message || t("errors.applyFailed"))
    } finally {
      setApplying(false)
    }
  }

  const handleReinstallAction = async (wipe: boolean) => {
    setReinstalling(true)
    try {
      await apiFetch(API_ENDPOINTS.serverReinstall.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ truncate_directory: wipe }),
      })
      alert(t("errors.reinstallInitiated"))
      setShowReinstall(false)
    } catch (e: any) {
      alert(t("errors.reinstallFailed", { message: e.message || t("errors.unknownError") }))
    } finally {
      setReinstalling(false)
    }
  }

  const handlePluginSearch = async () => {
    if (!pluginSearch || pluginSearch.length < 2) return
    setPluginSearching(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: pluginSearch })
      const data = await apiFetch(`${API_ENDPOINTS.serverPluginsSearch.replace(":id", serverId)}?${params.toString()}`)
      setPluginResults(data?.plugins || [])
    } catch (e: any) {
      setError(e?.message || t("errors.searchPlugins"))
      setPluginResults([])
    }
    setPluginSearching(false)
  }

  const openPreview = async (slug: string) => {
    setPreviewSlug(slug)
    setPreviewLoading(true)
    setError(null)
    setPreviewData({ _notFound: false })
    try {
      const data = await apiFetch(API_ENDPOINTS.serverPluginsPreview.replace(":id", serverId) + `/${encodeURIComponent(slug)}`)
      if (!data || !data.slug) {
        setPreviewData({ _notFound: true, name: slug })
        return
      }
      setPreviewData(data)
      const versions = data?.versions ?? []
      setSelectedVersionId(versions[0]?.id ?? "")
    } catch {
      setPreviewData({ _notFound: true, name: slug })
    }
    setPreviewLoading(false)
  }

  const handleInstallPlugin = async (slug: string, versionId?: string) => {
    setInstallingPlugin(slug)
    setError(null)
    try {
      const filename = `${slug}.jar`
      await apiFetch(API_ENDPOINTS.serverPluginsInstall.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ slug, filename, ...(versionId ? { versionId } : {}) }),
      })
      const data = await apiFetch(API_ENDPOINTS.serverPlugins.replace(":id", serverId))
      setInstalledPlugins(data?.plugins || [])
    } catch (e: any) {
      setError(e?.message || t("errors.installPlugin"))
    }
    setInstallingPlugin(null)
  }

  // ─── Load known players ───────────────────────────────────────────────────────

  const loadKnownPlayers = useCallback(async () => {
    setKnownPlayersLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.serverPlayerData.replace(":id", serverId))
      setKnownPlayers(data?.players || [])
      setKnownPlayersTotal(data?.total ?? 0)
    } catch { setKnownPlayers([]) }
    setKnownPlayersLoading(false)
  }, [serverId])

  useEffect(() => {
    if (tab === "playerdat") loadKnownPlayers()
  }, [tab, loadKnownPlayers])

  // ─── Derived ────────────────────────────────────────────────────────────────

  const filteredPlayers = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  const isPlayerView = tab === "online" || tab === "whitelist" || tab === "bans" || tab === "ops"
  const canEditStartup = !subuserEntry || subuserEntry.accepted === false || Array.isArray(subuserEntry?.permissions) && subuserEntry.permissions.includes("startup")

  const tabs: { id: McTabView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "online", label: t("tabs.online"), icon: Users },
    { id: "whitelist", label: t("tabs.whitelist"), icon: Shield },
    { id: "bans", label: t("tabs.bans"), icon: Ban },
    { id: "ops", label: t("tabs.ops"), icon: Crown },
    { id: "versions", label: t("tabs.versions"), icon: GitBranch },
    { id: "plugins", label: t("tabs.plugins"), icon: Package },
    { id: "playerdat", label: "Players", icon: Users },
    { id: "settings", label: t("tabs.settings"), icon: Settings },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 min-w-0 p-3 sm:p-4 md:p-6">
      {/* ─── Sub-tab bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border border-border bg-card p-1 overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Online indicator ────────────────────────────────────────────── */}
      {tab === "online" && !loading && (
        <p className="text-xs text-muted-foreground">
          {reachable ? t.rich("players.onlineCount", { online, max }) : t("players.offline")}
        </p>
      )}

      {/* ─── Search + refresh (player tabs) ───────────────────────────────── */}
      {isPlayerView && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("players.searchPlaceholder")} className="pl-8 h-9 text-xs" />
          </div>
          <Button variant="outline" size="sm" onClick={loadPlayers} disabled={loading} className="h-9 w-9 p-0 flex-shrink-0" data-telemetry="servers:loadplayers">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PLAYERS VIEWS
         ══════════════════════════════════════════════════════════════════════ */}

      {tab === "whitelist" && (
        <div className="flex items-center justify-between px-3 py-2 border border-border bg-card">
          <span className="text-xs text-muted-foreground">{t("players.whitelistLabel")}</span>
          <button
            onClick={async () => {
              setTogglingWhitelist(true)
              try {
                await apiFetch(API_ENDPOINTS.serverPlayersWhitelistToggle.replace(":id", serverId), {
                  method: "POST",
                  body: JSON.stringify({ enabled: !whitelistEnabled }),
                })
                setWhitelistEnabled(!whitelistEnabled)
              } catch (e: any) {
                setError(e?.message || t("errors.toggleWhitelist"))
              }
              setTogglingWhitelist(false)
            }}
            disabled={togglingWhitelist}
            className={`relative h-5 w-9 rounded-full transition-colors ${whitelistEnabled ? "bg-primary" : "bg-secondary"} ${togglingWhitelist ? "opacity-50" : ""}`}
           data-telemetry="servers:async">
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${whitelistEnabled ? "translate-x-4" : ""}`} />
          </button>
        </div>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-6">
          {/* Server Properties */}
          <div className="border border-border bg-card">
            <div className="p-3.5 sm:p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">server.properties</h3>
            </div>
            <div className="p-3.5 sm:p-4 space-y-3">
              {settings.map((s) => (
                <div key={s.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{readableKey(s.key)}</label>
                  <Input value={settings.find(e => e.key === s.key)?.value ?? s.value}
                    onChange={(e) => setSettings(prev => prev.map(p => p.key === s.key ? { ...p, value: e.target.value } : p))}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              ))}
              <Button size="sm" onClick={async () => {
                setSavingSettings(true)
                try {
                  await apiFetch(API_ENDPOINTS.serverPlayersSettings.replace(":id", serverId), {
                    method: "POST",
                    body: JSON.stringify({ entries: settings }),
                  })
                  setError(null)
                } catch (e: any) {
                  setError(e?.message || t("errors.saveSettings"))
                }
                setSavingSettings(false)
              }} disabled={savingSettings} className="self-start h-9" data-telemetry="servers:async">
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
                {t("players.save")}
              </Button>
            </div>
          </div>

          {/* Startup Command */}
          {canEditStartup && (
            <div className="border border-border bg-card">
              <div className="p-3.5 sm:p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">{t("startup.startupCommand")}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t("startup.startupDesc")}</p>
              </div>
              <div className="p-3.5 sm:p-4 space-y-4">
                {startupLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("startup.startupLoading")}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">{t("startup.presets")}</label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setStartupCommand(
                          'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}'
                        )} className="px-3 py-1.5 text-xs border transition-colors hover:bg-primary/10 hover:border-primary/30 bg-secondary/20 border-border text-foreground">
                          {t("startup.defaultPreset")}
                        </button>
                        <button type="button" onClick={() => setStartupCommand(
                          'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true -jar {{SERVER_JARFILE}}'
                        )} className="px-3 py-1.5 text-xs border transition-colors hover:bg-purple-500/10 hover:border-purple-500/30 bg-secondary/20 border-border text-foreground">
                          {t("startup.aikarFlags")}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">{t("startup.custom")}</label>
                      <textarea
                        value={startupCommand}
                        onChange={(e) => setStartupCommand(e.target.value)}
                        className="w-full h-24 px-3 py-2 text-xs font-mono bg-background border border-border text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
                        spellCheck={false}
                      />
                    </div>
                    <Button size="sm" onClick={async () => {
                      setSavingStartup(true)
                      try {
                        await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId), {
                          method: "PUT",
                          body: JSON.stringify({ startup: startupCommand }),
                        })
                        alert(t("startup.startupSaved"))
                      } catch (e: any) {
                        alert(t("startup.startupSaveFailed", { message: e?.message || t("errors.unknownError") }))
                      }
                      setSavingStartup(false)
                    }} disabled={savingStartup || !startupCommand} className="self-start h-9" data-telemetry="servers:async">
                      {savingStartup ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
                      {t("startup.saveStartup")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isPlayerView && (loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="rounded-full bg-secondary/50 p-3 mb-3">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === "online" ? t("players.empty.online") : tab === "whitelist" ? t("players.empty.whitelist") : tab === "bans" ? t("players.empty.bans") : t("players.empty.ops")}
          </p>
        </div>
      ) : (
        <div className="border border-border divide-y divide-border min-w-0">
          <AnimatePresence initial={false}>
            {filteredPlayers.map((player) => {
              const isWhitelisted = whitelistNames.has(player.name)
              const isBanned = banNames.has(player.name)
              const isOpped = opNames.has(player.name)
              return (
                <motion.div key={player.name} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-between px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="relative h-7 w-7 flex-shrink-0 bg-primary/10 flex items-center justify-center overflow-hidden">
                      <span className="text-xs font-semibold text-primary">{player.name.charAt(0).toUpperCase()}</span>
                      <img src={mcAvatar(player)} alt={player.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                    </div>
                    <span className="text-sm text-foreground truncate font-medium">{player.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {tab === "online" && (
                      <>
                        {isWhitelisted ? (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "unwhitelist" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.removeFromWhitelist")} data-telemetry="servers:removefromwhitelist"><UserMinus className="h-3.5 w-3.5" /></button>
                        ) : (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "whitelist" }) }} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title={t("dialogs.addToWhitelist")} data-telemetry="servers:addtowhitelist"><UserCheck className="h-3.5 w-3.5" /></button>
                        )}
                        {isBanned ? (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "pardon" }) }} className="p-1.5 text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors" title={t("dialogs.pardon")} data-telemetry="servers:pardon"><Undo2 className="h-3.5 w-3.5" /></button>
                        ) : (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "ban" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.ban")} data-telemetry="servers:ban"><Ban className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "kick" }) }} className="p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors" title={t("dialogs.kick")} data-telemetry="servers:kick"><LogOut className="h-3.5 w-3.5" /></button>
                        {isOpped ? (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "deop" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.deop")} data-telemetry="servers:deop"><ShieldOff className="h-3.5 w-3.5" /></button>
                        ) : (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "op" }) }} className="p-1.5 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" title={t("dialogs.op")} data-telemetry="servers:op"><Crown className="h-3.5 w-3.5" /></button>
                        )}
                      </>
                    )}
                    {tab === "whitelist" && (
                      <>
                        {isOpped ? (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "deop" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.deop")} data-telemetry="servers:deop"><ShieldOff className="h-3.5 w-3.5" /></button>
                        ) : (
                          <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "op" }) }} className="p-1.5 text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" title={t("dialogs.op")} data-telemetry="servers:op"><Crown className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "unwhitelist" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.removeFromWhitelist")} data-telemetry="servers:removefromwhitelist"><UserMinus className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                    {tab === "bans" && (
                      <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "pardon" }) }} className="p-1.5 text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors" title={t("dialogs.pardon")} data-telemetry="servers:pardon"><Undo2 className="h-3.5 w-3.5" /></button>
                    )}
                    {tab === "ops" && (
                      <button onClick={() => { setActionTarget(player.name); setActionDialog({ type: "deop" }) }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("dialogs.deop")} data-telemetry="servers:deop"><ShieldOff className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      ))}

      {(tab === "whitelist" || tab === "ops") && (
        <div className="flex items-center gap-2">
          <Input value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} placeholder={tab === "whitelist" ? t("players.addPlayerPlaceholder") : t("players.opPlayerPlaceholder")}
            className="h-9 text-xs flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && actionTarget) setActionDialog({ type: tab === "whitelist" ? "whitelist" : "op" }) }}
          />
          <Button size="sm" variant="default" disabled={!actionTarget || actionLoading} onClick={() => setActionDialog({ type: tab === "whitelist" ? "whitelist" : "op" })} className="h-9">
            {tab === "whitelist" ? <UserPlus className="h-3.5 w-3.5 mr-1.5" /> : <Crown className="h-3.5 w-3.5 mr-1.5" />}
            {tab === "whitelist" ? t("players.add") : t("players.op")}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VERSIONS VIEW
         ══════════════════════════════════════════════════════════════════════ */}

      {tab === "versions" && (
        <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
          {isInstalling && (
            <div className="border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="flex items-start gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("versions.serverInstalling")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("versions.serverInstallingDesc")}</p>
                </div>
              </div>
            </div>
          )}

          {!isInstalling && (serverStatus === "suspended" || serverStatus === "dmca") && (
            <div className="border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-sm font-semibold text-destructive">{t("versions.serverSuspended", { status: serverStatus })}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("versions.serverSuspendedDesc", { status: serverStatus })}</p>
            </div>
          )}

          <div className="flex gap-0.5 border-b border-border pb-px">
            {(["paper", "vanilla"] as ServerType[]).map((st) => (
              <button key={st} type="button" onClick={() => setServerType(st)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors rounded-t-sm border border-b-0 -mb-px",
                  serverType === st ? "bg-card border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                >{st === "paper" ? t("versions.paper") : t("versions.vanilla")}</button>
            ))}
          </div>

          {serverType === "paper" && (paperLoading ? (
            <LoadingState message={t("versions.loadingPaper")} />
          ) : (
            <>
              <CollapsibleSection title={t("versions.currentConfig")} icon={Info} defaultOpen>
                <div className="space-y-3 min-w-0 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="border border-border bg-secondary/20 p-3 min-w-0">
                      <p className="text-[11px] text-muted-foreground mb-0.5 truncate">{t("versions.minecraftVersion")}</p>
                      <p className="text-sm text-foreground truncate">{paperCurrentVersion && /^\d/.test(paperCurrentVersion) ? paperCurrentVersion : "—"}</p>
                    </div>
                    <div className="border border-border bg-secondary/20 p-3 min-w-0">
                      <p className="text-[11px] text-muted-foreground mb-0.5 truncate">{t("versions.buildNumber")}</p>
                      <p className="text-sm text-foreground truncate">{paperCurrentBuild && /^\d/.test(paperCurrentBuild) ? `#${paperCurrentBuild}` : "—"}</p>
                    </div>
                  </div>
                  {(!paperCurrentVersion || !/^\d/.test(paperCurrentVersion)) && (
                    <div className="border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                      {t.rich("versions.serverUsingChannel", { channel: paperCurrentVersion || "default", strong: (chunks) => <span className="font-semibold">{chunks}</span> })}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("versions.minecraftVersion")}</label>
                  <Select value={paperSelectedVersion} onValueChange={setPaperSelectedVersion}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={t("versions.version")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">
                        <div className="flex items-center gap-2"><span>{t("versions.latest")}</span><Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("versions.autoUpdate")}</Badge></div>
                      </SelectItem>
                      {paperVersions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {paperSelectedVersion && paperSelectedVersion !== "latest" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("versions.build")}</label>
                    {paperBuildsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" />{t("versions.loadingBuilds")}</div>
                    ) : paperBuilds.length > 0 ? (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto border border-border divide-y divide-border">
                        {paperBuilds.map((b: any) => (
                          <div key={b.build} className="min-w-0">
                            <button type="button" onClick={() => setPaperSelectedBuild(b.build)}
                              className={cn(
                                "w-full text-left px-3 py-2.5 text-sm transition-colors",
                                paperSelectedBuild === b.build ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-secondary/20"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-foreground">{t("versions.build")} #{b.build}</span>
                                  {b.channel && b.channel !== "default" && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase">{b.channel}</Badge>}
                                  {String(paperCurrentBuild) === String(b.build) && /^\d/.test(paperCurrentBuild) && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">{t("versions.current")}</Badge>}
                                </div>
                                {b.changes && b.changes.length > 0 && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedBuild(expandedBuild === b.build ? null : b.build) }}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                  >{expandedBuild === b.build ? t("versions.hideNotes") : t(b.changes.length === 1 ? "versions.changes" : "versions.changes_plural", { count: b.changes.length })}</button>
                                )}
                              </div>
                            </button>
                            {expandedBuild === b.build && b.changes && b.changes.length > 0 && (
                              <div className="px-3 py-2 bg-secondary/10 border-t border-border space-y-2">
                                {b.changes.map((change: any, idx: number) => (
                                  <div key={idx} className="text-xs space-y-1">
                                    {change.summary && <p className="font-medium text-foreground">{change.summary}</p>}
                                    {change.message && change.message !== change.summary && <p className="text-muted-foreground whitespace-pre-wrap break-words">{change.message}</p>}
                                    {change.commit && <p className="text-[10px] text-muted-foreground/70 font-mono">{change.commit.slice(0, 8)}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-3">{t("versions.noBuilds", { version: paperSelectedVersion })}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ))}

          {serverType === "vanilla" && (vanillaLoading ? (
            <LoadingState message={t("versions.loadingVanilla")} />
          ) : (
            <>
              <CollapsibleSection title={t("versions.currentConfig")} icon={Info} defaultOpen>
                <div className="space-y-3 min-w-0 pt-3">
                  <div className="border border-border bg-secondary/20 p-3 min-w-0">
                    <p className="text-[11px] text-muted-foreground mb-0.5 truncate">{t("versions.minecraftVersion")}</p>
                    <p className="text-sm text-foreground truncate">{vanillaCurrentVersion || "—"}</p>
                  </div>
                </div>
              </CollapsibleSection>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("versions.minecraftVersion")}</label>
                  <Select value={vanillaSelectedVersion} onValueChange={setVanillaSelectedVersion}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={t("versions.version")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">
                        <div className="flex items-center gap-2"><span>{t("versions.latestRelease")}</span><Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("versions.auto")}</Badge></div>
                      </SelectItem>
                      {vanillaVersions.filter((v: any) => v.type === "release" || v.id === vanillaCurrentVersion).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {vanillaSelectedVersion === "latest" && <p className="text-xs text-muted-foreground mt-1">{t("versions.vanillaLatestDesc")}</p>}
                  {vanillaSelectedVersion && vanillaSelectedVersion !== "latest" && <p className="text-xs text-muted-foreground mt-1">{t("versions.vanillaSpecificDesc")}</p>}
                </div>
              </div>
            </>
          ))}

          {tab === "versions" && (serverType === "paper" && !paperLoading || serverType === "vanilla" && !vanillaLoading) && (
            <div className="flex items-center gap-3">
              <Button onClick={handleApply}
                disabled={applying || isInstalling || serverStatus === "suspended" || serverStatus === "dmca" ||
                  (serverType === "paper" && (!paperSelectedVersion || (paperSelectedVersion !== "latest" && paperSelectedBuild === null))) ||
                  (serverType === "vanilla" && !vanillaSelectedVersion)}
               data-telemetry="servers:apply">
                {applying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isInstalling ? t("versions.cannotModify") : t("versions.apply", { type: serverType === "paper" ? t("versions.paper") : t("versions.vanilla") })}
              </Button>
            </div>
          )}

          <Dialog open={showReinstall} onOpenChange={setShowReinstall}>
            <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md overflow-hidden">
              <DialogHeader>
                <DialogTitle className="text-foreground">{t("versions.versionApplied")}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {serverType === "paper" && t("versions.versionAppliedDescPaper", { version: paperSelectedVersion === "latest" ? `(${t("versions.latest")})` : `${paperSelectedVersion} (${t("versions.build")} #${paperSelectedBuild})` })}
                  {serverType === "vanilla" && t("versions.versionAppliedDescVanilla", { version: vanillaSelectedVersion === "latest" ? `(${t("versions.latestRelease").toLowerCase()})` : vanillaSelectedVersion })}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="flex flex-col gap-3">
                  <button type="button" onClick={() => setReinstallWipe(false)}
                    className={cn("border p-3 text-left transition-colors", !reinstallWipe ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/20 hover:bg-secondary/30")}
                  >
                    <p className="text-sm font-medium text-foreground">{t("versions.reinstallKeep")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("versions.reinstallKeepDesc")}</p>
                  </button>
                  <button type="button" onClick={() => setReinstallWipe(true)}
                    className={cn("border p-3 text-left transition-colors", reinstallWipe ? "border-red-500/40 bg-red-500/10" : "border-border bg-secondary/20 hover:bg-secondary/30")}
                  >
                    <p className="text-sm font-medium text-foreground">{t("versions.reinstallWipe")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("versions.reinstallWipeDesc")}</p>
                  </button>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowReinstall(false)} disabled={reinstalling} className="w-full sm:w-auto">{t("versions.later")}</Button>
                <Button variant={reinstallWipe ? "destructive" : "default"} onClick={() => handleReinstallAction(reinstallWipe)} disabled={reinstalling} className="w-full sm:w-auto">
                  {reinstalling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("versions.reinstallNow")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PLUGINS VIEW
         ══════════════════════════════════════════════════════════════════════ */}

      {tab === "plugins" && (
        <div className="space-y-4 min-w-0">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={pluginSearch} onChange={(e) => setPluginSearch(e.target.value)}
              placeholder={t("plugins.searchPlaceholder")}
              className="pl-8 h-9 text-xs pr-20"
              onKeyDown={(e) => { if (e.key === "Enter") handlePluginSearch() }}
            />
            <Button size="sm" onClick={handlePluginSearch} disabled={pluginSearching || pluginSearch.length < 2}
              className="absolute right-0.5 top-0.5 h-8 text-xs px-3" data-telemetry="servers:pluginsearch">
              {pluginSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("plugins.search")}
            </Button>
          </div>

          {/* Installed plugins */}
          <CollapsibleSection title={t("plugins.installed", { count: installedPlugins.length })} icon={Package} defaultOpen>
            <div className="space-y-2 pt-3">
              {loadingInstalled ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : installedPlugins.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("plugins.noPlugins")}</p>
              ) : (
                installedPlugins.map((p) => {
                  const hasSlug = !!p.slug
                  return (
                  <div key={p.filename} className="flex items-center justify-between px-3 py-2 bg-secondary/10 border border-border">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        {p.version && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">v{p.version}</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t("players.size", { size: (p.size / 1024).toFixed(1) })}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasSlug && (
                        <button onClick={() => openPreview(p.slug!)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0" title={t("plugins.viewDetails")} data-telemetry="servers:viewdetails">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => { setActionTarget(p.filename); setActionDialog({ type: "delete-plugin" }) }}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0" title={t("plugins.delete")} data-telemetry="servers:delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )})
              )}
            </div>
          </CollapsibleSection>

          {/* Search results */}
          {pluginResults.length > 0 && (
            <div className="border border-border divide-y divide-border">
              {pluginResults.map((p) => {
                const installed = installedPlugins.some((ip) => ip.name === p.slug || ip.filename === `${p.slug}.jar`)
                return (
                  <button key={p.slug} onClick={() => openPreview(p.slug)}
                    className="w-full text-left px-3 py-3 flex items-start gap-3 min-w-0 hover:bg-secondary/10 transition-colors">
                    {p.iconUrl ? (
                      <img src={p.iconUrl} alt="" className="h-8 w-8 rounded-sm object-cover flex-shrink-0 mt-0.5" loading="lazy" />
                    ) : (
                      <div className="h-8 w-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        {installed && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-400 border-green-400/30">{t("plugins.installedBadge")}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-muted-foreground/70">{p.author}</span>
                        <span className="text-[11px] text-muted-foreground/70">v{p.version}</span>
                        <span className="text-[11px] text-muted-foreground/70">{t("plugins.downloads", { count: p.downloads?.toLocaleString() ?? 0 })}</span>
                      </div>
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-2" />
                  </button>
                )
              })}
            </div>
          )}

          {pluginSearch && pluginResults.length === 0 && !pluginSearching && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-secondary/50 p-3 mb-3">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t("plugins.noResults", { query: pluginSearch })}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("plugins.noResultsHint")}</p>
            </div>
          )}
        </div>
      )}

      {tab === "playerdat" && (
        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {knownPlayersTotal} total player{knownPlayersTotal !== 1 ? 's' : ''}
            </p>
            <Button variant="outline" size="sm" onClick={loadKnownPlayers} disabled={knownPlayersLoading} className="h-8 text-xs" data-telemetry="servers:loadknownplayers">
              <RefreshCw className={`h-3 w-3 mr-1.5 ${knownPlayersLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {knownPlayersLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : knownPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No player data found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Players need to join the server at least once</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {knownPlayers.map((p) => {
                const isWhitelisted = whitelistNames.has(p.name);
                const isBanned = banNames.has(p.name);
                const isOpped = opNames.has(p.name);
                return (
                  <div key={p.uuid} className="flex items-center gap-3 border border-border bg-card p-3 min-w-0">
                    <div className="h-8 w-8 bg-muted/30 flex-shrink-0 overflow-hidden">
                      <img src={mcAvatar(p, 32)} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {isWhitelisted && <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-600 dark:text-green-400 border-green-500/30">Whitelisted</Badge>}
                        {isBanned && <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-600 dark:text-red-400 border-red-500/30">Banned</Badge>}
                        {isOpped && <Badge variant="outline" className="text-[9px] px-1 py-0 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">OP</Badge>}
                        {!isWhitelisted && !isBanned && !isOpped && (
                          <span className="text-[10px] text-muted-foreground/50">No status</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isWhitelisted && !isBanned && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "whitelist" }) }}
                          className="p-1.5 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors" title="Whitelist">
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isWhitelisted && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "unwhitelist" }) }}
                          className="p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors" title="Un-whitelist">
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isBanned && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "ban" }) }}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Ban">
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isBanned && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "pardon" }) }}
                          className="p-1.5 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors" title="Pardon">
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isOpped && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "op" }) }}
                          className="p-1.5 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 transition-colors" title="Op">
                          <Crown className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isOpped && (
                        <button onClick={() => { setActionTarget(p.name); setActionDialog({ type: "deop" }) }}
                          className="p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors" title="Deop">
                          <ShieldOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PLUGIN PREVIEW DIALOG
         ══════════════════════════════════════════════════════════════════════ */}

      <Dialog open={previewSlug !== null} onOpenChange={(o) => { if (!o) { setPreviewSlug(null); setPreviewData(null) } }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-lg max-h-[85vh] overflow-hidden">
          {previewLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : previewData?._notFound ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-secondary/50 p-3 mb-3">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("plugins.notFound")}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">{t("plugins.notFoundDesc", { name: previewData.name })}</p>
              <Button variant="outline" size="sm" onClick={() => { setPreviewSlug(null); setPreviewData(null) }} className="mt-4 h-9">{t("plugins.close")}</Button>
            </div>
          ) : previewData ? (
            <div className="flex flex-col max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <div className="flex items-start gap-3">
                  {previewData.iconUrl ? (
                    <img src={previewData.iconUrl} alt="" className="h-10 w-10 rounded-sm object-cover flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-foreground text-base">{previewData.name}</DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("plugins.byAuthor", { author: previewData.author })} · {t("plugins.downloads", { count: previewData.downloads?.toLocaleString() ?? 0 })}</p>
                  </div>
                  <a href={`https://modrinth.com/plugin/${previewSlug}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 flex-shrink-0 mt-1">
                    <Globe className="h-3 w-3" /> {t("plugins.onModrinth")}
                  </a>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 overflow-y-auto px-6 py-3">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {previewData.description}
                </p>
                {previewData.body && (
                  <div className="mt-4 text-sm text-muted-foreground leading-relaxed break-words">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80" data-telemetry="link:external">{children}</a>
                        ),
                        code: ({ children, ...props }) => (
                          <code className="bg-secondary/30 px-1 py-0.5 text-xs font-mono rounded" {...props}>{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-secondary/20 border border-border p-3 overflow-x-auto text-xs font-mono my-3">{children}</pre>
                        ),
                        h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-3 mb-1.5">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-semibold text-foreground mt-3 mb-1">{children}</h3>,
                        ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm text-muted-foreground">{children}</li>,
                        p: ({ children }) => <p className="text-sm text-muted-foreground mb-2 leading-relaxed">{children}</p>,
                        hr: () => <hr className="border-border my-4" />,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-primary/30 pl-4 my-3 italic text-sm text-muted-foreground">{children}</blockquote>
                        ),
                        img: ({ src, alt }) => (
                          <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-sm my-3" loading="lazy" />
                        ),
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                      }}
                    >{previewData.body}</ReactMarkdown>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("plugins.versions")}</p>
                  {previewData.versions?.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto border border-border">
                      {previewData.versions.map((v: any) => (
                        <button key={v.id} type="button" onClick={() => setSelectedVersionId(v.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm transition-colors",
                            selectedVersionId === v.id ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-secondary/20"
                          )}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-foreground">v{v.versionNumber}</span>
                              {v.name !== v.versionNumber && <span className="text-muted-foreground truncate">{v.name}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {v.loaders?.map((l: string) => <Badge key={l} variant="outline" className="text-[10px] px-1.5 py-0">{l}</Badge>)}
                            </div>
                          </div>
                          {v.gameVersions?.length > 0 && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{v.gameVersions.join(", ")}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">{t("plugins.noVersions")}</p>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t border-border pt-4 px-6 pb-6 flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => { setPreviewSlug(null); setPreviewData(null) }} className="w-full sm:w-auto">{t("plugins.close")}</Button>
                <Button onClick={() => handleInstallPlugin(previewData.slug, selectedVersionId || undefined)}
                  disabled={installingPlugin === previewData.slug || !selectedVersionId}
                  className="w-full sm:w-auto">
                  {installingPlugin === previewData.slug ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
                  {installingPlugin === previewData.slug ? t("plugins.installing") : t("plugins.installSelected")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          CONFIRMATION DIALOG
         ══════════════════════════════════════════════════════════════════════ */}

      <Dialog open={actionDialog !== null} onOpenChange={(open) => { if (!open) { setActionDialog(null); setActionTarget(""); setActionReason("") } }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground capitalize">
              {actionDialog?.type === "delete-plugin" ? t("plugins.deleteTitle")
                : actionDialog?.type === "unwhitelist" ? t("dialogs.removeFromWhitelist")
                : actionDialog?.type === "deop" ? t("dialogs.deop") : actionDialog?.type}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {actionDialog?.type === "delete-plugin" && t("plugins.deleteConfirm", { name: actionTarget })}
              {actionDialog?.type === "whitelist" && t("dialogs.whitelistConfirm", { player: actionTarget })}
              {actionDialog?.type === "unwhitelist" && t("dialogs.unwhitelistConfirm", { player: actionTarget })}
              {actionDialog?.type === "ban" && t("dialogs.banConfirm", { player: actionTarget })}
              {actionDialog?.type === "pardon" && t("dialogs.pardonConfirm", { player: actionTarget })}
              {actionDialog?.type === "kick" && t("dialogs.kickConfirm", { player: actionTarget })}
              {actionDialog?.type === "op" && t("dialogs.opConfirm", { player: actionTarget })}
              {actionDialog?.type === "deop" && t("dialogs.deopConfirm", { player: actionTarget })}
            </DialogDescription>
          </DialogHeader>
          {(actionDialog?.type === "ban" || actionDialog?.type === "kick") && (
            <div className="px-6 pb-2">
              <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder={t("dialogs.reasonPlaceholder")} className="h-9 text-xs" />
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setActionDialog(null); setActionTarget(""); setActionReason("") }} className="w-full sm:w-auto" disabled={actionLoading}>{t("dialogs.cancel")}</Button>
            <Button variant={actionDialog?.type === "ban" || actionDialog?.type === "delete-plugin" ? "destructive" : "default"} onClick={handleAction} disabled={actionLoading} className="w-full sm:w-auto" data-telemetry="servers:action">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              {t("dialogs.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}