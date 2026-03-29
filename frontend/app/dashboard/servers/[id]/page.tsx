"use client"

import { use, useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { formatBytes } from "./serverTabHelpers"
import { StatCard, LoadingState, MiniStat, CardGrid } from "./serverTabShared"
import {
  Play,
  Square,
  RotateCcw,
  Power,
  Terminal,
  Folder,
  FileText,
  Database,
  Clock,
  Network,
  HardDrive,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Plus,
  ArrowLeft,
  RefreshCw,
  Repeat,
  Loader2,
  AlertTriangle,
  Settings,
  Cpu,
  MemoryStick,
  Variable,
  Box,
  BarChart3,
  Activity,
  Copy,
  Lock,
  Unlock,
  Check,
  X,
  MoreVertical,
  Eye,
  EyeOff,
  Users,
  Save,
  Info,
  AlertCircle,
  Monitor,
  Shield,
} from "lucide-react"

const ConsoleTabLazy = lazy(() => import("./ConsoleTab").then((m) => ({ default: m.ConsoleTab })))
const StatsTabLazy = lazy(() => import("./StatsTab").then((m) => ({ default: m.StatsTab })))
const FilesTabLazy = lazy(() => import("./FilesTab").then((m) => ({ default: m.FilesTab })))

function InfoRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (copyable) {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-secondary/20 p-2.5 sm:p-3 min-w-0",
        copyable && "cursor-pointer hover:bg-secondary/30 active:bg-secondary/40 transition-colors"
      )}
      onClick={handleCopy}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 truncate">{label}</p>
        {copyable && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </span>
        )}
      </div>
      <p className={cn(
        "text-xs sm:text-sm text-foreground truncate",
        mono && "font-mono"
      )}>{value}</p>
    </div>
  )
}

function EmptyState({ icon: Icon = Info, title, message, action }: { 
  icon?: any
  title?: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 text-center">
      <div className="rounded-full bg-secondary/50 p-3 mb-3">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
      </div>
      {title && <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>}
      <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function SectionHeader({ title, icon: Icon, action, className }: {
  title: string
  icon?: any
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-primary flex-shrink-0" />}
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

function KvmBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg border border-indigo-500/20 bg-indigo-500/5",
      compact ? "p-2.5" : "p-3 sm:p-4"
    )}>
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0",
          compact ? "p-1.5" : "p-2"
        )}>
          <Monitor className={cn("text-indigo-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "font-medium text-indigo-300",
            compact ? "text-[11px]" : "text-xs sm:text-sm"
          )}>
            KVM Virtualization Active
          </p>
          <p className={cn(
            "text-indigo-400/70 mt-0.5",
            compact ? "text-[10px]" : "text-[10px] sm:text-xs"
          )}>
            This server runs as a full virtual machine. File management and console may behave differently than container-based servers.
          </p>
        </div>
      </div>
    </div>
  )
}

function KvmInfoNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2.5 flex items-start gap-2">
      <Shield className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
      <p className="text-[10px] sm:text-xs text-indigo-300/80 leading-relaxed">{message}</p>
    </div>
  )
}

function CollapsibleSection({ 
  title, 
  icon: Icon, 
  defaultOpen = false, 
  children 
}: { 
  title: string
  icon?: any
  defaultOpen?: boolean
  children: React.ReactNode 
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/20 active:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-4 w-4 text-primary flex-shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="p-3 sm:p-4 pt-0 border-t border-border">
          {children}
        </div>
      )}
    </div>
  )
}

interface PowerActionsProps {
  server: any
  powerLoading: boolean
  onAction: (action: string) => void
  onTransfer?: () => void
  canTransfer?: boolean
  kvmEnabled?: boolean
  kvmLoading?: boolean
  onToggleKvm?: () => void
}

function PowerActions({ server, powerLoading, onAction, onTransfer, canTransfer, kvmEnabled, kvmLoading, onToggleKvm }: PowerActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isRunning = server.status === "running" || server.status === "online"
  const isStopped = server.status === "stopped" || server.status === "offline"
  const isHibernated = server.status === "hibernated"
  const isPowerable = isRunning || server.status === "starting" || server.status === "stopping"

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Button
        size="sm"
        variant="outline"
        className="border-green-500/30 text-green-400 hover:bg-green-500/10 active:bg-green-500/20 h-8 px-2 sm:px-3"
        disabled={powerLoading || isPowerable || isHibernated}
        onClick={() => onAction("start")}
      >
        {powerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline ml-1.5">Start</span>
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="border-red-500/30 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 h-8 px-2 sm:px-3"
        disabled={powerLoading || !isPowerable || isHibernated}
        onClick={() => onAction("stop")}
      >
        <Square className="h-3.5 w-3.5" />
        <span className="hidden sm:inline ml-1.5">Stop</span>
      </Button>

      <div className="relative" ref={menuRef}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMenuOpen(!menuOpen)}
          className="h-8 px-2"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95">
            <button
              onClick={() => { onAction("restart"); setMenuOpen(false) }}
              disabled={powerLoading || !isPowerable || isHibernated}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-yellow-400 hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Restart
            </button>
            <button
              onClick={() => { onAction("kill"); setMenuOpen(false) }}
              disabled={powerLoading || !isPowerable || isHibernated}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Power className="h-4 w-4" />
              Kill
            </button>
            {canTransfer && onTransfer && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => { onTransfer(); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-blue-400 hover:bg-secondary/80 transition-colors"
                >
                  <Repeat className="h-4 w-4" />
                  Transfer
                </button>
              </>
            )}
            {onToggleKvm && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => { onToggleKvm(); setMenuOpen(false) }}
                  disabled={powerLoading || kvmLoading}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-indigo-400 hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Monitor className="h-4 w-4" />
                  <span className="flex-1 text-left">{kvmEnabled ? "Disable KVM" : "Enable KVM"}</span>
                  {kvmLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface TabItem {
  id: string
  label: string
  icon: any
  shortLabel?: string
}

interface TabNavigationProps {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (tab: string) => void
}

function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeButton = container.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement
    if (activeButton) {
      const containerRect = container.getBoundingClientRect()
      const buttonRect = activeButton.getBoundingClientRect()
      const scrollLeft = buttonRect.left - containerRect.left + container.scrollLeft - (containerRect.width - buttonRect.width) / 2
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
    }
  }, [activeTab])

  return (
    <div 
      ref={scrollRef}
      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 overflow-x-auto scrollbar-none -mx-3 sm:mx-0 px-3 sm:px-1"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary"
          )}
        >
          <tab.icon className="h-3.5 w-3.5" />
          <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

interface ResourceStatsProps {
  resources: any
}

function ResourceStats({ resources }: ResourceStatsProps) {
  if (!resources) return null

  const stats = [
    { 
      label: "CPU", 
      value: `${(resources.cpu_absolute ?? 0).toFixed(1)}%`,
      color: "#3b82f6"
    },
    { 
      label: "Memory", 
      value: formatBytes(resources.memory_bytes ?? 0),
      color: "#8b5cf6"
    },
    { 
      label: "Disk", 
      value: formatBytes(resources.disk_bytes ?? 0),
      color: "#f59e0b"
    },
    { 
      label: "Net ↑↓", 
      value: `${formatBytes(resources.network?.tx_bytes ?? 0)} / ${formatBytes(resources.network?.rx_bytes ?? 0)}`,
      color: "#22c55e"
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {stats.map((stat) => (
        <MiniStat 
          key={stat.label}
          label={stat.label}
          value={stat.value}
          color={stat.color}
        />
      ))}
    </div>
  )
}

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const [editorSettings, setEditorSettings] = useState<EditorSettings | undefined>(undefined)
  const [server, setServer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("console")
  const [powerLoading, setPowerLoading] = useState(false)
  const [kvmLoading, setKvmLoading] = useState(false)
  const [powerDialogOpen, setPowerDialogOpen] = useState(false)
  const [pendingPowerAction, setPendingPowerAction] = useState<string | null>(null)

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferNodes, setTransferNodes] = useState<any[]>([])
  const [transferNodeId, setTransferNodeId] = useState<number | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  const isKvm = !!server?.configuration?.container?.kvm_passthrough_enabled

  const loadServer = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDetail.replace(":id", id))
      setServer(data)
    } catch (e) {
      console.error("Failed to load server", e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setEditorSettings(user?.settings?.editor)
  }, [user])

  useEffect(() => {
    loadServer()
    const interval = setInterval(loadServer, 15000)
    return () => clearInterval(interval)
  }, [loadServer])

  const sendPower = async (action: string) => {
    setPowerLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.serverPower.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ action }),
      })
      setTimeout(loadServer, 1500)
    } catch (e: any) {
      alert("Power action failed: " + e.message)
    } finally {
      setPowerLoading(false)
    }
  }

  const confirmPowerAction = (action: string) => {
    setPendingPowerAction(action)
    setPowerDialogOpen(true)
  }

  const doConfirmedPowerAction = async () => {
    if (!pendingPowerAction) return
    setPowerDialogOpen(false)
    await sendPower(pendingPowerAction)
    setPendingPowerAction(null)
  }

  const toggleKvm = async () => {
    if (!server) return
    const enable = !server.configuration?.container?.kvm_passthrough_enabled
    setKvmLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.serverKvm.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ enable }),
      })
      await loadServer()
      alert(`KVM ${enable ? "enabled" : "disabled"}.`)
    } catch (e: any) {
      alert(`KVM toggle failed: ${e?.message || e}`)
    } finally {
      setKvmLoading(false)
    }
  }

  const deleteServer = async () => {
    if (!confirm("Are you sure you want to permanently delete this server? This action cannot be undone.")) return
    try {
      await apiFetch(API_ENDPOINTS.serverDelete.replace(":id", id), { method: "DELETE" })
      router.push("/dashboard/servers")
    } catch (e: any) {
      alert("Delete failed: " + e.message)
    }
  }

  const loadNodes = async () => {
    try {
      const nodes = await apiFetch(API_ENDPOINTS.nodes)
      if (Array.isArray(nodes)) setTransferNodes(nodes)
    } catch {}
  }

  const openTransferDialog = async () => {
    setTransferError(null)
    setTransferNodeId(null)
    setTransferDialogOpen(true)
    if (transferNodes.length === 0) await loadNodes()
  }

  const doTransfer = async () => {
    if (!transferNodeId) {
      setTransferError('Please select a target node')
      return
    }
    setTransferLoading(true)
    setTransferError(null)
    try {
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ targetNodeId: transferNodeId }),
      })
      setTransferDialogOpen(false)
      setTransferNodeId(null)
      setTransferNodes([])
      loadServer()
      alert('Transfer initiated. This may take several minutes.')
    } catch (e: any) {
      setTransferError(e.message || 'Transfer failed')
    } finally {
      setTransferLoading(false)
    }
  }

  const canTransfer = !!(user && (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin'))
  const canToggleKvm = !!(user && (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin'))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading server...</p>
        </div>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-1">Server Not Found</h2>
          <p className="text-sm text-muted-foreground">The server you're looking for doesn't exist or is unavailable.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard/servers")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Servers
        </Button>
      </div>
    )
  }

  const statusColor =
    server.status === "running" || server.status === "online"
      ? "text-green-400 bg-green-400"
      : server.status === "hibernated"
        ? "text-purple-400 bg-purple-400"
        : server.status === "stopped" || server.status === "offline"
          ? "text-red-400 bg-red-400"
          : "text-yellow-400 bg-yellow-400"

  const tabs: TabItem[] = [
    { id: "console", label: "Console", icon: Terminal },
    { id: "stats", label: "Statistics", icon: BarChart3, shortLabel: "Stats" },
    { id: "files", label: "Files", icon: Folder },
    { id: "startup", label: "Startup", icon: Variable },
    { id: "databases", label: "Databases", icon: Database, shortLabel: "DB" },
    { id: "schedules", label: "Schedules", icon: Clock },
    { id: "network", label: "Network", icon: Network, shortLabel: "Net" },
    { id: "backups", label: "Backups", icon: HardDrive },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "subusers", label: "Subusers", icon: Users },
    { id: "mounts", label: "Mounts", icon: Box },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <>
      <div data-guide-id="server-header">
        <PanelHeader
          title={server.name || server.uuid?.slice(0, 8) || "Server"}
          description={`${server.uuid || id}`}
        />
      </div>
      
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-3 p-3 sm:p-4 md:p-6 max-w-full overflow-hidden">
          {/* Server Header */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
            {/* Server Info Row */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className={cn("h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full flex-shrink-0 animate-pulse", statusColor.split(" ")[1])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{server.name || "Unnamed Server"}</p>
                <p className="text-[10px] text-muted-foreground truncate font-mono hidden sm:block">{server.uuid || id}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                <Badge variant="outline" className={cn("text-[10px] sm:text-xs", statusColor.split(" ")[0])}>
                  {server.status || "unknown"}
                </Badge>
                {isKvm && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-indigo-500/30 text-indigo-400 bg-indigo-500/5">
                    <Monitor className="h-3 w-3 mr-1" />
                    KVM
                  </Badge>
                )}
              </div>
            </div>

            {/* Power Controls */}
            <div className="flex items-center justify-between gap-2">
              <PowerActions
                server={server}
                powerLoading={powerLoading}
                kvmLoading={kvmLoading}
                kvmEnabled={isKvm}
                onAction={confirmPowerAction}
                onToggleKvm={canToggleKvm ? toggleKvm : undefined}
                onTransfer={openTransferDialog}
                canTransfer={canTransfer}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={loadServer}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Resource Stats */}
          <div data-guide-id="server-resources">
            <ResourceStats resources={server.resources} />
          </div>

          {/* Tab Navigation */}
          <TabNavigation
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {/* Tab Content */}
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
            {activeTab === "console" && (
              <Suspense fallback={<LoadingState message="Loading console..." />}>
                <ConsoleTabLazy serverId={id} />
              </Suspense>
            )}
            {activeTab === "stats" && (
              <Suspense fallback={<LoadingState message="Loading statistics..." />}>
                <StatsTabLazy serverId={id} server={server} />
              </Suspense>
            )}
            {activeTab === "files" && (
              <Suspense fallback={<LoadingState message="Loading files..." />}>
                {isKvm && (
                  <div className="p-3 sm:p-4 pb-0">
                    <KvmInfoNotice message="KVM filesystem is managed by cloud-init. Files shown here may not reflect the guest VM's actual filesystem. Use SSH/SFTP to access the VM directly." />
                  </div>
                )}
                <FilesTabLazy serverId={id} sftpInfo={server?.sftp} editorSettings={editorSettings} />
              </Suspense>
            )}
            {activeTab === "startup" && <StartupTab serverId={id} />}
            {activeTab === "databases" && <DatabasesTab serverId={id} />}
            {activeTab === "schedules" && <SchedulesTab serverId={id} />}
            {activeTab === "network" && <NetworkTab serverId={id} />}
            {activeTab === "mounts" && <MountsTab serverId={id} isKvm={isKvm} />}
            {activeTab === "backups" && <BackupsTab serverId={id} />}
            {activeTab === "activity" && <ActivityTab serverId={id} />}
            {activeTab === "subusers" && <SubusersTab serverId={id} />}
            {activeTab === "settings" && <SettingsTab serverId={id} server={server} onDelete={deleteServer} reload={loadServer} isKvm={isKvm} />}
          </div>
        </div>
      </ScrollArea>

      {/* Power Confirmation Dialog */}
      <Dialog open={powerDialogOpen} onOpenChange={(open) => { 
        if (!open) { setPowerDialogOpen(false); setPendingPowerAction(null) } 
      }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirm {pendingPowerAction?.charAt(0).toUpperCase()}{pendingPowerAction?.slice(1)}</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to <span className="font-medium text-foreground">{pendingPowerAction}</span> the server?
            </p>
            {pendingPowerAction === 'kill' && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    Killing a server forcibly terminates its process. Data loss may occur.
                  </p>
                </div>
              </div>
            )}
            {isKvm && pendingPowerAction === 'kill' && (
              <div className="mt-2">
                <KvmInfoNotice message="Killing a KVM virtual machine is equivalent to pulling the power plug. The guest OS will not shut down gracefully." />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setPowerDialogOpen(false); setPendingPowerAction(null) }} 
              disabled={powerLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              variant={pendingPowerAction === 'kill' ? 'destructive' : 'default'} 
              onClick={doConfirmedPowerAction} 
              disabled={powerLoading}
              className="w-full sm:w-auto"
            >
              {powerLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {pendingPowerAction ? pendingPowerAction.charAt(0).toUpperCase() + pendingPowerAction.slice(1) : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => { 
        if (!open) { setTransferDialogOpen(false); setTransferNodeId(null); setTransferError(null) } 
      }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Transfer Server</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <p className="text-sm text-muted-foreground">
              Select the destination node to transfer this server to.
            </p>
            {isKvm && (
              <KvmInfoNotice message="Transferring a KVM server requires both nodes to support KVM passthrough. The VM disk image will be migrated." />
            )}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Destination Node</label>
              <select
                value={transferNodeId ?? ''}
                onChange={(e) => setTransferNodeId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Select a node...</option>
                {transferNodes.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.name || n.nodeId || n.id} {n.nodeType ? `(${n.nodeType})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {transferError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">{transferError}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              This may take several minutes. Both nodes must be online.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setTransferDialogOpen(false)} 
              disabled={transferLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              onClick={doTransfer} 
              disabled={transferLoading || !transferNodeId}
              className="w-full sm:w-auto"
            >
              {transferLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DatabasesTab({ serverId }: { serverId: string }) {
  const [databases, setDatabases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [creds, setCreds] = useState<Record<number, any>>({})
  const [loadingCreds, setLoadingCreds] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDatabases.replace(":id", serverId))
      setDatabases(Array.isArray(data) ? data : [])
    } catch {
      setDatabases([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createDb = async () => {
    setCreating(true)
    setCreateError("")
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDatabases.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ label: formLabel || undefined }),
      })
      setDatabases(prev => [...prev, { ...data, password: "***" }])
      if (data.id && data.password && data.password !== "***") {
        setCreds(prev => ({ ...prev, [data.id]: data }))
      }
      setFormLabel("")
      setShowForm(false)
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create database")
    } finally {
      setCreating(false)
    }
  }

  const deleteDb = async (dbId: number) => {
    if (!confirm("Delete this database? This will permanently DROP the database.")) return
    setDeletingId(dbId)
    try {
      await apiFetch(`${API_ENDPOINTS.serverDatabases.replace(":id", serverId)}/${dbId}`, { method: "DELETE" })
      setDatabases(prev => prev.filter((d: any) => d.id !== dbId))
      setCreds(prev => { const c = { ...prev }; delete c[dbId]; return c })
    } finally {
      setDeletingId(null)
    }
  }

  const viewCreds = async (dbId: number) => {
    if (creds[dbId]) {
      setCreds(prev => { const c = { ...prev }; delete c[dbId]; return c })
      return
    }
    setLoadingCreds(prev => ({ ...prev, [dbId]: true }))
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverDatabaseCredentials.replace(":id", serverId).replace(":dbId", String(dbId))
      )
      setCreds(prev => ({ ...prev, [dbId]: data }))
    } finally {
      setLoadingCreds(prev => ({ ...prev, [dbId]: false }))
    }
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader
        title="Databases"
        icon={Database}
        action={
          <Button size="sm" onClick={() => { setShowForm(!showForm); setCreateError("") }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">New Database</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Label (optional)</label>
            <input
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="e.g. Primary DB"
              value={formLabel}
              onChange={e => setFormLabel(e.target.value)}
            />
          </div>
          {createError && (
            <div className="p-2 rounded-lg bg-destructive/10 text-xs text-destructive">{createError}</div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={createDb} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {databases.length === 0 ? (
        <EmptyState icon={Database} message="No databases configured." />
      ) : (
        <div className="space-y-3">
          {databases.map((db: any) => (
            <div key={db.id} className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {db.label || db.name}
                  </p>
                  {db.label && <p className="text-xs text-muted-foreground font-mono truncate">{db.name}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">User: {db.username}</p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewCreds(db.id)}
                    disabled={loadingCreds[db.id]}
                    className="text-xs h-8 px-2 sm:px-3"
                  >
                    {loadingCreds[db.id] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : creds[db.id] ? (
                      <><EyeOff className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Hide</span></>
                    ) : (
                      <><Eye className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Show</span></>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteDb(db.id)}
                    disabled={deletingId === db.id}
                    className="h-8 px-2 sm:px-3"
                  >
                    {deletingId === db.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {creds[db.id] && (
                <div className="rounded-lg bg-background border border-border p-2.5 sm:p-3 space-y-2 overflow-hidden">
                  {[
                    { label: "Host", value: `${creds[db.id].host}:${creds[db.id].port}`, key: `host-${db.id}` },
                    { label: "Database", value: creds[db.id].name, key: `db-${db.id}` },
                    { label: "Username", value: creds[db.id].username, key: `user-${db.id}` },
                    { label: "Password", value: creds[db.id].password, key: `pass-${db.id}`, sensitive: true },
                    { label: "JDBC", value: creds[db.id].jdbc, key: `jdbc-${db.id}` },
                  ].map(row => (
                    <div key={row.key} className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] sm:text-xs text-muted-foreground w-16 sm:w-20 flex-shrink-0">{row.label}</span>
                      <code className="text-[10px] sm:text-xs bg-secondary/40 rounded px-2 py-1 flex-1 truncate font-mono min-w-0">
                        {row.sensitive ? '••••••••' : row.value}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 flex-shrink-0"
                        onClick={() => copyText(row.value, row.key)}
                      >
                        {copied === row.key ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SchedulesTab({ serverId }: { serverId: string }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ 
    name: "", 
    cron_minute: "*", 
    cron_hour: "*", 
    cron_day_of_month: "*", 
    cron_month: "*", 
    cron_day_of_week: "*", 
    is_active: true 
  })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverSchedules.replace(":id", serverId))
      setSchedules(Array.isArray(data) ? data : [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createSchedule = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverSchedules.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({ name: "", cron_minute: "*", cron_hour: "*", cron_day_of_month: "*", cron_month: "*", cron_day_of_week: "*", is_active: true })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteSchedule = async (sid: string) => {
    if (!confirm("Delete this schedule?")) return
    try {
      await apiFetch(API_ENDPOINTS.serverScheduleDelete.replace(":id", serverId).replace(":sid", sid), { method: "DELETE" })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader
        title="Schedules"
        icon={Clock}
        action={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">New Schedule</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Daily restart"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Cron Expression</label>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {(["cron_minute", "cron_hour", "cron_day_of_month", "cron_month", "cron_day_of_week"] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-[9px] sm:text-[10px] text-muted-foreground capitalize block text-center truncate">
                    {field.replace("cron_", "").replace(/_/g, " ").slice(0, 3)}
                  </label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full rounded-md border border-border bg-input px-1.5 sm:px-2 py-2 text-xs sm:text-sm font-mono outline-none text-center focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" onClick={createSchedule} disabled={creating}>
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState icon={Clock} message="No schedules configured." />
      ) : (
        <div className="space-y-3">
          {schedules.map((sched: any) => (
            <div key={sched.id} className="flex items-start justify-between gap-2 sm:gap-3 rounded-lg border border-border bg-secondary/20 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{sched.name || "Unnamed"}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-1 truncate">
                  {sched.cron_minute} {sched.cron_hour} {sched.cron_day_of_month} {sched.cron_month} {sched.cron_day_of_week}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                  <Badge variant="outline" className={cn("text-[10px]", sched.is_active ? "text-green-400" : "text-muted-foreground")}>
                    {sched.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate">
                    Last: {sched.last_run_at ? new Date(sched.last_run_at).toLocaleString() : "Never"}
                  </span>
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={() => deleteSchedule(String(sched.id))} className="flex-shrink-0 h-8 px-2 sm:px-3">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NetworkTab({ serverId }: { serverId: string }) {
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      .then((data) => setAllocations(Array.isArray(data) ? data : []))
      .catch(() => setAllocations([]))
      .finally(() => setLoading(false))
  }, [serverId])

  const requestPorts = async () => {
    setRequesting(true)
    setRequestError(null)
    try {
      await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId), { 
        method: 'POST', 
        body: JSON.stringify({ count: 1 }) 
      })
      const refreshed = await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      setAllocations(Array.isArray(refreshed) ? refreshed : [])
    } catch (e: any) {
      setRequestError(e?.message || 'Request failed')
    } finally {
      setRequesting(false)
    }
  }

  const deassignPort = async (ip: string, port: number) => {
    if (!confirm(`Remove ${ip}:${port}?`)) return
    const key = `${ip}:${port}`
    setDeleting(key)
    try {
      await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId), { 
        method: 'DELETE', 
        body: JSON.stringify({ ip, port }) 
      })
      const refreshed = await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      setAllocations(Array.isArray(refreshed) ? refreshed : [])
    } catch (e: any) {
      alert(e?.message || 'Failed')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader
        title="Network Allocations"
        icon={Network}
        action={
          <Button size="sm" onClick={requestPorts} disabled={requesting}>
            {requesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            <span className="hidden sm:inline">Request Port</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      {requestError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs sm:text-sm text-destructive">
          {requestError}
        </div>
      )}

      {allocations.length === 0 ? (
        <EmptyState icon={Network} message="No network allocations found." />
      ) : (
        <div className="space-y-2">
          {allocations.map((alloc: any, i: number) => {
            const key = `${alloc.ip}:${alloc.port}`
            return (
              <div key={i} className="flex items-center justify-between gap-2 sm:gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="font-mono text-xs sm:text-sm text-foreground truncate">
                      {alloc.fqdn || alloc.ip}:{alloc.port}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {alloc.is_default ? "Primary" : "Secondary"}
                    </Badge>
                  </div>
                  {alloc.fqdn && alloc.ip && alloc.fqdn !== alloc.ip && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-0.5 truncate">{alloc.ip}</p>
                  )}
                </div>
                {!alloc.is_default && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => deassignPort(alloc.ip, alloc.port)} 
                    disabled={deleting === key}
                    className="flex-shrink-0 h-8 px-2 sm:px-3"
                  >
                    {deleting === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


function BackupsTab({ serverId }: { serverId: string }) {
  const [backups, setBackups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId))
      setBackups(Array.isArray(data) ? data : [])
    } catch {
      setBackups([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createBackup = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  const restoreBackup = async (bid: string) => {
    if (!confirm("Restore this backup? Current data may be overwritten.")) return
    try {
      await apiFetch(API_ENDPOINTS.serverBackupRestore.replace(":id", serverId).replace(":bid", bid), { method: "POST" })
      alert("Restore initiated.")
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const deleteBackup = async (bid: string) => {
    if (!confirm("Delete this backup permanently?")) return
    try {
      await apiFetch(API_ENDPOINTS.serverBackupDelete.replace(":id", serverId).replace(":bid", bid), { method: "DELETE" })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const lockBackup = async (bid: string, lock: boolean) => {
    try {
      await apiFetch(`/api/servers/${serverId}/backups/${bid}/lock`, {
        method: "POST",
        body: JSON.stringify({ lock }),
      })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader
        title="Backups"
        icon={HardDrive}
        action={
          <Button size="sm" onClick={createBackup} disabled={creating}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            <span className="hidden sm:inline">Create Backup</span>
            <span className="sm:hidden">Create</span>
          </Button>
        }
      />

      {backups.length === 0 ? (
        <EmptyState icon={HardDrive} message="No backups found. Create one to get started." />
      ) : (
        <div className="space-y-3">
          {backups.map((backup: any) => {
            const isLocked = backup.locked || backup.is_locked
            const inProgress = (backup.progress != null && Number(backup.progress) > 0 && Number(backup.progress) < 100) || 
              (backup.status && ["running", "in-progress", "processing"].includes(String(backup.status).toLowerCase()))

            return (
              <div key={backup.uuid || backup.id} className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">
                        {backup.displayName || backup.display_name || backup.name || "Backup"}
                      </p>
                      {isLocked && <Lock className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {formatBytes(backup.bytes || 0)} • {backup.created_at ? new Date(backup.created_at).toLocaleString() : "—"}
                    </p>
                    {backup.is_successful === false && (
                      <p className="text-[10px] sm:text-xs text-destructive mt-1">Backup failed</p>
                    )}
                  </div>
                </div>

                {inProgress && (
                  <div className="space-y-1">
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all" 
                        style={{ width: `${Math.max(0, Math.min(100, Number(backup.progress) || 0))}%` }} 
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {Math.round(Number(backup.progress) || 0)}% complete
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <Button size="sm" variant="outline" onClick={() => restoreBackup(String(backup.uuid || backup.id))} className="h-8 px-2 sm:px-3 text-xs">
                    <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Restore</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => lockBackup(String(backup.uuid || backup.id), !isLocked)} className="h-8 px-2">
                    {isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => deleteBackup(String(backup.uuid || backup.id))} 
                    disabled={isLocked}
                    className="h-8 px-2 sm:px-3"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StartupTab({ serverId }: { serverId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startup, setStartup] = useState<any>(null)
  const [editedEnv, setEditedEnv] = useState<Record<string, string>>({})
  const [donePatterns, setDonePatterns] = useState<string[]>([])
  const [selectedDockerImage, setSelectedDockerImage] = useState<string>("")
  const [dockerImageOptions, setDockerImageOptions] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId))
      .then((data) => {
        setStartup(data)
        setEditedEnv(data?.environment || {})
        setSelectedDockerImage(data?.dockerImage || "")
        setDockerImageOptions(Array.isArray(data?.dockerImageOptions) ? data.dockerImageOptions : [])
        const patterns = data?.processConfig?.startup?.done
        setDonePatterns(Array.isArray(patterns) ? patterns.map(String) : patterns ? [String(patterns)] : [""])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId])

  const saveEnv = async () => {
    if (dockerImageOptions.length > 0 && !selectedDockerImage) {
      alert('Please select a Docker image before saving.')
      return
    }

    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId), {
        method: "PUT",
        body: JSON.stringify({
          environment: editedEnv,
          processConfig: { startup: { done: donePatterns.filter(p => p.length > 0) } },
          dockerImage: selectedDockerImage || undefined,
        }),
      })
      alert("Saved.")
    } catch (e: any) {
      alert("Save failed: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!startup) return <EmptyState icon={AlertCircle} message="Failed to load startup configuration." />

  const envVarDefs: any[] = startup.envVars || []
  const allKeys = new Set([
    ...envVarDefs.map((v: any) => v.env_variable || v.key || v.name),
    ...Object.keys(editedEnv),
  ])

  return (
    <div data-guide-id="startup-tab" className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      {/* Startup Info */}
      <CollapsibleSection title="Server Configuration" icon={Variable} defaultOpen>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InfoRow label="Egg" value={startup.eggName || "—"} />
            <InfoRow label="Docker Image" value={selectedDockerImage || "—"} mono />
          </div>

          {dockerImageOptions.length > 0 ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Docker Image</label>
              <select
                value={selectedDockerImage}
                onChange={(e) => setSelectedDockerImage(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="" disabled>Select image…</option>
                {dockerImageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} ({option.value})</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No alternate docker images are configured for this egg.</p>
          )}

          {startup.startup && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 overflow-hidden">
              <p className="text-[10px] text-muted-foreground mb-1">Startup Command</p>
              <p className="text-[10px] sm:text-xs font-mono text-foreground break-all">{startup.startup}</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Detection Patterns */}
      <CollapsibleSection title="Startup Detection" icon={Activity}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Patterns matched against console output to detect startup completion.
          </p>
          {donePatterns.map((pattern, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={pattern}
                onChange={(e) => {
                  const next = [...donePatterns]
                  next[i] = e.target.value
                  setDonePatterns(next)
                }}
                placeholder="e.g. Server started"
                className="flex-1 min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDonePatterns(donePatterns.filter((_, j) => j !== i))}
                className="text-destructive hover:text-destructive px-2 flex-shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setDonePatterns([...donePatterns, ""])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Pattern
          </Button>
        </div>
      </CollapsibleSection>

      {/* Environment Variables */}
      <div className="space-y-3">
        <SectionHeader
          title="Environment Variables"
          icon={Variable}
          action={
            <Button size="sm" onClick={saveEnv} disabled={saving || (dockerImageOptions.length > 0 && !selectedDockerImage)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
          }
        />

        <div className="space-y-3">
          {[...allKeys].map((key) => {
            const def = envVarDefs.find((v: any) => (v.env_variable || v.key || v.name) === key)
            const isEditable = def ? !!def.user_editable : true
            const description = def?.description || ""
            const name = def?.name || key

            return (
              <div key={key} className="rounded-lg border border-border bg-secondary/10 p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono max-w-[150px] sm:max-w-none truncate">{key}</Badge>
                  {!isEditable && (
                    <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500 flex-shrink-0">Read Only</Badge>
                  )}
                </div>
                {description && <p className="text-[10px] sm:text-xs text-muted-foreground mb-2">{description}</p>}
                <input
                  type="text"
                  value={editedEnv[key] ?? ""}
                  onChange={(e) => setEditedEnv((prev) => ({ ...prev, [key]: e.target.value }))}
                  disabled={!isEditable}
                  className={cn(
                    "w-full rounded-lg border border-border px-3 py-2 text-xs sm:text-sm font-mono outline-none",
                    isEditable 
                      ? "bg-input text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                      : "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                  )}
                />
              </div>
            )
          })}
          {allKeys.size === 0 && (
            <EmptyState icon={Variable} message="No environment variables defined." />
          )}
        </div>
      </div>
    </div>
  )
}

function MountsTab({ serverId, isKvm }: { serverId: string; isKvm?: boolean }) {
  const [mounts, setMounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/servers/${serverId}/mounts`)
      .then((data) => setMounts(Array.isArray(data) ? data : []))
      .catch(() => setMounts([]))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader title="Mounts" icon={Box} />

      {isKvm && (
        <KvmInfoNotice message="KVM filesystem is managed by cloud-init and may not display correctly in this panel. Use the VM console or SSH/SFTP to inspect guest filesystem state." />
      )}

      {!isKvm && (
        <p className="text-xs text-muted-foreground">
          Mounts bind host directories into your server container.
        </p>
      )}

      {mounts.length === 0 ? (
        <EmptyState icon={Box} message="No mounts configured. Mounts are managed by administrators." />
      ) : (
        <div className="space-y-3">
          {mounts.map((mount: any, i: number) => (
            <div key={mount.id || i} className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Box className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{mount.name || `Mount ${i + 1}`}</span>
                {mount.read_only && (
                  <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500 flex-shrink-0">Read Only</Badge>
                )}
              </div>
              {mount.description && <p className="text-xs text-muted-foreground">{mount.description}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded border border-border bg-secondary/30 p-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground">Source</span>
                  <p className="text-xs font-mono text-foreground truncate">{mount.source || "—"}</p>
                </div>
                <div className="rounded border border-border bg-secondary/30 p-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground">Target</span>
                  <p className="text-xs font-mono text-foreground truncate">{mount.target || "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTab({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/servers/${serverId}/activity?limit=100`)
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <LoadingState />

  const actionLabels: Record<string, string> = {
    'server:power:start': 'Started server',
    'server:power:stop': 'Stopped server',
    'server:power:restart': 'Restarted server',
    'server:power:kill': 'Killed server',
    'server:console:command': 'Ran command',
    'server:file:write': 'Modified file',
    'server:file:delete': 'Deleted file(s)',
    'server:reinstall': 'Reinstalled server',
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader title="Activity Log" icon={Activity} />

      {logs.length === 0 ? (
        <EmptyState icon={Activity} message="No activity recorded yet." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 sm:gap-3 rounded-lg border border-border bg-secondary/20 p-3">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-foreground">
                  {actionLabels[log.action] || log.action}
                </p>
                {log.metadata?.command && (
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground mt-1 break-all">
                    $ {log.metadata.command}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  <span>User #{log.userId}</span>
                  {log.ipAddress && <span className="hidden sm:inline">• {log.ipAddress}</span>}
                  <span>• {new Date(log.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SubusersTab({ serverId }: { serverId: string }) {
  const [subusers, setSubusers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const PERMISSIONS = [
    { key: 'console', label: 'Console' },
    { key: 'files', label: 'Files' },
    { key: 'backups', label: 'Backups' },
    { key: 'startup', label: 'Startup' },
    { key: 'settings', label: 'Settings' },
    { key: 'databases', label: 'DBs' },
    { key: 'schedules', label: 'Sched.' },
  ]
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['console'])

  const loadSubusers = () => {
    setLoading(true)
    apiFetch(`/api/servers/${serverId}/subusers`)
      .then((data) => setSubusers(Array.isArray(data) ? data : []))
      .catch(() => setSubusers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSubusers() }, [serverId])

  const handleAdd = async () => {
    if (!email.trim()) return
    setAdding(true)
    setError(null)
    try {
      await apiFetch(`/api/servers/${serverId}/subusers`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), permissions: selectedPerms }),
      })
      setEmail("")
      setSelectedPerms(['console'])
      setShowAdd(false)
      loadSubusers()
    } catch (e: any) {
      setError(e.message || "Failed")
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (subuserId: number) => {
    if (!confirm("Remove this subuser?")) return
    try {
      await apiFetch(`/api/servers/${serverId}/subusers/${subuserId}`, { method: "DELETE" })
      loadSubusers()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      <SectionHeader
        title="Subusers"
        icon={Users}
        action={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Add Subuser</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      {showAdd && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-4">
          {error && <div className="p-2 rounded-lg bg-destructive/10 text-xs text-destructive">{error}</div>}
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Permissions</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer p-2 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.key)}
                    onChange={(e) => {
                      setSelectedPerms(prev =>
                        e.target.checked ? [...prev, p.key] : prev.filter(x => x !== p.key)
                      )
                    }}
                    className="accent-primary flex-shrink-0"
                  />
                  <span className="truncate">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {subusers.length === 0 ? (
        <EmptyState icon={Users} message="No subusers added yet." />
      ) : (
        <div className="space-y-2">
          {subusers.map((su) => (
            <div key={su.id} className="flex items-center justify-between gap-2 sm:gap-3 rounded-lg border border-border bg-secondary/20 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {su.userEmail || su.email || `User #${su.userId}`}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(su.permissions || []).map((p: string) => (
                    <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={() => handleRemove(su.id)} className="flex-shrink-0 h-8 px-2 sm:px-3">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsTab({ serverId, server, onDelete, reload, isKvm }: { 
  serverId: string
  server: any
  onDelete: () => void
  reload: () => void
  isKvm?: boolean
}) {
  const [reinstalling, setReinstalling] = useState(false)

  const [primaryAlloc, setPrimaryAlloc] = useState<any>(
    server?.allocations?.find((a: any) => a.is_default) || server?.allocations?.[0] || null
  )

  useEffect(() => {
    if (server?.allocations && server.allocations.length > 0) {
      setPrimaryAlloc(server.allocations.find((a: any) => a.is_default) || server.allocations[0])
      return
    }

    let mounted = true
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      .then((data) => {
        if (!mounted) return
        const arr = Array.isArray(data) ? data : []
        setPrimaryAlloc(arr.find((a: any) => a.is_default) || arr[0] || null)
      })
      .catch(() => {
        if (!mounted) return
        setPrimaryAlloc(null)
      })

    return () => { mounted = false }
  }, [server, serverId])

  const handleReinstall = async () => {
    if (!confirm("Reinstall this server? All files will be wiped.")) return
    setReinstalling(true)
    try {
      await apiFetch(API_ENDPOINTS.serverReinstall.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      alert("Reinstall initiated.")
      reload()
    } catch (e: any) {
      alert("Failed: " + e.message)
    } finally {
      setReinstalling(false)
    }
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      {/* KVM Status Banner */}
      {isKvm && <KvmBanner />}

      {/* Server Info */}
      <CollapsibleSection title="Server Information" icon={Info} defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <InfoRow label="UUID" value={server.uuid || serverId} mono copyable />
          <InfoRow label="Name" value={server.name || "—"} />
          <InfoRow label="Status" value={server.status || "—"} />
          <InfoRow label="Node" value={server.node || "—"} />
          <InfoRow label="Docker Image" value={server.container?.image || "—"} mono />
          {isKvm && <InfoRow label="Virtualization" value="KVM (Full VM)" />}
          {!isKvm && <InfoRow label="Virtualization" value="Docker" />}
        </div>
      </CollapsibleSection>

      {/* SFTP/SSH Access */}
      {server.sftp && (
        <CollapsibleSection title="External Access" icon={Network}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <InfoRow
                label="Host"
                value={isKvm ? (primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp.host) : server.sftp.host}
                mono
                copyable
              />
              <InfoRow
                label="Port"
                value={isKvm ? String(primaryAlloc?.port || server.sftp.port) : String(server.sftp.port)}
                mono
                copyable
              />
              <InfoRow
                label="Username"
                value={server.sftp.username || (isKvm ? "root" : "—")}
                mono
                copyable
              />
            </div>
            {server.sftp.username && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] sm:text-xs font-mono bg-secondary/50 border border-border rounded px-2.5 sm:px-3 py-2 overflow-x-auto whitespace-nowrap min-w-0">
                    {isKvm
                      ? `sftp root@${primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp.host} -P ${primaryAlloc?.port || server.sftp.port}`
                      : `sftp ${server.sftp.username}@${server.sftp.host} -P ${server.sftp.port}`}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => navigator.clipboard.writeText(isKvm
                      ? `sftp root@${primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp.host} -P ${primaryAlloc?.port || server.sftp.port}`
                      : `sftp ${server.sftp.username}@${server.sftp.host} -P ${server.sftp.port}`)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] sm:text-xs font-mono bg-secondary/50 border border-border rounded px-2.5 sm:px-3 py-2 overflow-x-auto whitespace-nowrap min-w-0">
                    {isKvm
                      ? `ssh root@${primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp.host} -p ${primaryAlloc?.port || server.sftp.port}`
                      : `ssh ${server.sftp.username}@${server.sftp.host} -p ${server.sftp.port}`}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => navigator.clipboard.writeText(isKvm
                      ? `ssh root@${primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp.host} -p ${primaryAlloc?.port || server.sftp.port}`
                      : `ssh ${server.sftp.username}@${server.sftp.host} -p ${server.sftp.port}`)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {isKvm ? (
              <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Monitor className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-indigo-300">KVM Access Notes</p>
                    <ul className="text-[10px] sm:text-xs text-indigo-400/70 space-y-1 list-disc list-inside">
                      <li>Use the primary allocation (host:port above) for SSH/SFTP</li>
                      <li>Default credentials: <code className="bg-indigo-500/10 px-1 rounded">root</code> / <code className="bg-indigo-500/10 px-1 rounded">changeme</code></li>
                      <li>Filesystem is managed by cloud-init inside the VM</li>
                      <li>Panel file controls may not reflect guest filesystem state</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Use your panel password or SSH key to authenticate.</p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Build Configuration */}
      {server.build && (
        <CollapsibleSection title="Resource Limits" icon={Cpu}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <InfoRow label="Memory" value={`${server.build.memory_limit || 0} MB`} />
            <InfoRow label="Disk" value={`${server.build.disk_space || 0} MB`} />
            <InfoRow label="CPU" value={`${server.build.cpu_limit || 0}%`} />
            <InfoRow label="IO Weight" value={String(server.build.io_weight || 500)} />
            <InfoRow label="Swap" value={`${server.build.swap || 0} MB`} />
            {isKvm && <InfoRow label="KVM Passthrough" value="Enabled" />}
          </div>
        </CollapsibleSection>
      )}

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Danger Zone
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            These actions are irreversible. Proceed with caution.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 w-full sm:w-auto" 
            onClick={handleReinstall} 
            disabled={reinstalling}
          >
            {reinstalling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reinstall
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} className="w-full sm:w-auto">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete Server
          </Button>
        </div>
      </div>
    </div>
  )
}