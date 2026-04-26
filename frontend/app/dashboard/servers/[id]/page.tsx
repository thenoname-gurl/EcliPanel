"use client"

import { use, useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  ExternalLink,
} from "lucide-react"

const ConsoleTabLazy = lazy(() => import("./ConsoleTab").then((m) => ({ default: m.ConsoleTab })))
const StatsTabLazy = lazy(() => import("./StatsTab").then((m) => ({ default: m.StatsTab })))
const FilesTabLazy = lazy(() => import("./FilesTab").then((m) => ({ default: m.FilesTab })))
const FirewallTabLazy = lazy(() => import("./FirewallTab").then((m) => ({ default: m.FirewallTab })))

// ─── Shared UI Primitives ────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!copyable) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [copyable, value])

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-secondary/20 p-3 min-w-0 overflow-hidden",
        copyable &&
          "cursor-pointer hover:bg-secondary/30 active:bg-secondary/40 transition-colors select-none"
      )}
      onClick={handleCopy}
      role={copyable ? "button" : undefined}
      tabIndex={copyable ? 0 : undefined}
      onKeyDown={
        copyable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleCopy()
              }
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-1 min-w-0">
        <p className="text-[11px] text-muted-foreground mb-0.5 truncate min-w-0">
          {label}
        </p>
        {copyable && (
          <span className="text-muted-foreground flex-shrink-0" aria-label={copied ? "Copied" : "Copy"}>
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </span>
        )}
      </div>
      <p
        className={cn(
          "text-sm text-foreground truncate min-w-0",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function EmptyState({
  icon: Icon = Info,
  title,
  message,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title?: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-4 text-center">
      <div className="rounded-full bg-secondary/50 p-3.5 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      {title && (
        <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      )}
      <p className="text-xs sm:text-sm text-muted-foreground max-w-xs break-words leading-relaxed">
        {message}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function SectionHeader({
  title,
  icon: Icon,
  action,
  className,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 min-w-0", className)}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {Icon && <Icon className="h-4 w-4 text-primary flex-shrink-0" />}
        <h3 className="text-sm font-semibold text-foreground truncate min-w-0">
          {title}
        </h3>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

function getUserAvatarInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function KvmBanner({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("serverDetailPage")

  return (
    <div
      className={cn(
        "rounded-lg border border-indigo-500/20 bg-indigo-500/5 overflow-hidden",
        compact ? "p-3" : "p-3.5 sm:p-4"
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            "rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0",
            compact ? "p-1.5" : "p-2"
          )}
        >
          <Monitor className={cn("text-indigo-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium text-indigo-300", compact ? "text-xs" : "text-sm")}>
            {t("kvm.bannerTitle")}
          </p>
          <p
            className={cn(
              "text-indigo-400/70 mt-0.5 break-words leading-relaxed",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            {t("kvm.bannerDescription")}
          </p>
        </div>
      </div>
    </div>
  )
}

function KvmInfoNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2.5 flex items-start gap-2 overflow-hidden">
      <Shield className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-indigo-300/80 leading-relaxed break-words min-w-0">
        {message}
      </p>
    </div>
  )
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 hover:bg-secondary/20 active:bg-secondary/30 transition-colors min-w-0"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {Icon && <Icon className="h-4 w-4 text-primary flex-shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate min-w-0">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="p-3.5 sm:p-4 pt-0 border-t border-border overflow-hidden">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Power Actions ───────────────────────────────────────────────────────────

interface PowerActionsProps {
  server: any
  t: any
  powerLoading: boolean
  markStartedLoading?: boolean
  onAction: (action: string) => void
  onTransfer?: () => void
  canTransfer?: boolean
  kvmEnabled?: boolean
  kvmLoading?: boolean
  onToggleKvm?: () => void
  onMarkStarted?: () => void
}

function PowerActions({
  server,
  t,
  powerLoading,
  markStartedLoading,
  onAction,
  onTransfer,
  canTransfer,
  kvmEnabled,
  kvmLoading,
  onToggleKvm,
  onMarkStarted,
}: PowerActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isRunning = server.status === "running" || server.status === "online"
  const isStopped = server.status === "stopped" || server.status === "offline"
  const isHibernated = server.status === "hibernated"
  const isPowerable = isRunning || server.status === "starting" || server.status === "stopping"

  const computePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const menuWidth = 192
    const menuHeight = 220
    const pad = 8

    let top = rect.bottom + 6
    let left = rect.right - menuWidth

    if (left < pad) left = pad
    if (left + menuWidth > window.innerWidth - pad) {
      left = window.innerWidth - menuWidth - pad
    }
    if (top + menuHeight > window.innerHeight - pad) {
      top = rect.top - menuHeight - 6
      if (top < pad) top = pad
    }

    setMenuPos({ top, left })
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    const handleDismiss = () => setMenuOpen(false)

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKey)
    window.addEventListener("scroll", handleDismiss, true)
    window.addEventListener("resize", handleDismiss)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKey)
      window.removeEventListener("scroll", handleDismiss, true)
      window.removeEventListener("resize", handleDismiss)
    }
  }, [menuOpen])

  const toggleMenu = useCallback(() => {
    if (!menuOpen) computePosition()
    setMenuOpen((v) => !v)
  }, [menuOpen, computePosition])

  const menuContent = menuOpen && mounted ? (
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        <div
          ref={menuRef}
          className="fixed z-[9999] w-48 rounded-xl border border-border bg-popover p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
          style={menuPos ? { top: menuPos.top, left: menuPos.left } : undefined}
          role="menu"
        >
          <button
            onClick={() => {
              onAction("restart")
              setMenuOpen(false)
            }}
            disabled={powerLoading || !isPowerable || isHibernated}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-yellow-400 hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            role="menuitem"
          >
            <RotateCcw className="h-4 w-4 flex-shrink-0" />
            <span>{t("actions.restart")}</span>
          </button>
          <button
            onClick={() => {
              onAction("kill")
              setMenuOpen(false)
            }}
            disabled={powerLoading || !isPowerable || isHibernated}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            role="menuitem"
          >
            <Power className="h-4 w-4 flex-shrink-0" />
            <span>{t("actions.kill")}</span>
          </button>
          {canTransfer && onTransfer && (
            <>
              <div className="my-1 h-px bg-border" role="separator" />
              <button
                onClick={() => {
                  onTransfer()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-blue-400 hover:bg-secondary/80 transition-colors"
                role="menuitem"
              >
                <Repeat className="h-4 w-4 flex-shrink-0" />
                <span>{t("actions.transfer")}</span>
              </button>
            </>
          )}
          {onToggleKvm && (
            <>
              <div className="my-1 h-px bg-border" role="separator" />
              <button
                onClick={() => {
                  onToggleKvm()
                  setMenuOpen(false)
                }}
                disabled={powerLoading || kvmLoading}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-indigo-400 hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                role="menuitem"
              >
                <Monitor className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">
                  {kvmEnabled ? t("actions.disableKvm") : t("actions.enableKvm")}
                </span>
                {kvmLoading && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />}
              </button>
            </>
          )}
          {onMarkStarted && server.status === "starting" && (
            <button
              onClick={() => {
                onMarkStarted()
                setMenuOpen(false)
              }}
              disabled={powerLoading || kvmLoading || markStartedLoading}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-blue-400 hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              role="menuitem"
            >
              <Check className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{t("actions.markStarted")}</span>
              {markStartedLoading && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />}
            </button>
          )}
        </div>
      </>,
      document.body
    )
  ) : null

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="border-green-500/30 text-green-400 hover:bg-green-500/10 active:bg-green-500/20 h-9 px-3"
        disabled={powerLoading || isPowerable || isHibernated}
        onClick={() => onAction("start")}
      >
        {powerLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        <span className="hidden sm:inline ml-1.5">{t("actions.start")}</span>
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="border-red-500/30 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 h-9 px-3"
        disabled={powerLoading || !isPowerable || isHibernated}
        onClick={() => onAction("stop")}
      >
        <Square className="h-4 w-4" />
        <span className="hidden sm:inline ml-1.5">{t("actions.stop")}</span>
      </Button>

      <div className="relative">
        <Button
          ref={buttonRef}
          size="sm"
          variant="outline"
          onClick={toggleMenu}
          className={cn("h-9 w-9 p-0", menuOpen && "bg-secondary")}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label={t("actions.morePowerOptions")}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
        {menuContent}
      </div>
    </div>
  )
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────

interface TabItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
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
      const scrollLeft =
        buttonRect.left -
        containerRect.left +
        container.scrollLeft -
        (containerRect.width - buttonRect.width) / 2
      container.scrollTo({ left: scrollLeft, behavior: "smooth" })
    }
  }, [activeTab])

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 overflow-x-auto scrollbar-none min-w-0 -mx-1 px-1"
      style={{ WebkitOverflowScrolling: "touch" }}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab={tab.id}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0",
            "touch-manipulation",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary/70"
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

// ─── Resource Stats ──────────────────────────────────────────────────────────

function ResourceStats({ resources }: { resources: any }) {
  const t = useTranslations("serverDetailPage")
  const prevNetworkRef = useRef<{ tx: number; rx: number; ts: number } | null>(null)
  const [currentNetMbps, setCurrentNetMbps] = useState({ tx: 0, rx: 0 })

  const formatAdaptiveMbps = useCallback((valueMbps: number) => {
    const safe = Number.isFinite(valueMbps) ? Math.max(0, valueMbps) : 0
    if (safe >= 1000) return `${(safe / 1000).toFixed(2)} Gbps`
    if (safe >= 1) return `${safe.toFixed(2)} Mbps`
    return `${(safe * 1000).toFixed(2)} Kbps`
  }, [])

  useEffect(() => {
    const tx = Number(resources?.network?.tx_bytes ?? 0)
    const rx = Number(resources?.network?.rx_bytes ?? 0)
    const now = Date.now()

    const prev = prevNetworkRef.current
    if (!prev) {
      prevNetworkRef.current = { tx, rx, ts: now }
      return
    }

    const deltaSeconds = (now - prev.ts) / 1000
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      const txBps = Math.max(0, tx - prev.tx) / deltaSeconds
      const rxBps = Math.max(0, rx - prev.rx) / deltaSeconds
      setCurrentNetMbps({
        tx: (txBps * 8) / 1_000_000,
        rx: (rxBps * 8) / 1_000_000,
      })
    }

    prevNetworkRef.current = { tx, rx, ts: now }
  }, [resources?.network?.tx_bytes, resources?.network?.rx_bytes])

  if (!resources) return null

  const stats = [
    { label: t("stats.cpu"), value: `${(resources.cpu_absolute ?? 0).toFixed(1)}%`, color: "#3b82f6" },
    { label: t("stats.memory"), value: formatBytes(resources.memory_bytes ?? 0), color: "#8b5cf6" },
    { label: t("stats.disk"), value: formatBytes(resources.disk_bytes ?? 0), color: "#f59e0b" },
    {
      label: t("stats.net"),
      value: `${formatAdaptiveMbps(currentNetMbps.tx)} / ${formatAdaptiveMbps(currentNetMbps.rx)}`,
      color: "#22c55e",
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
      {stats.map((stat) => (
        <MiniStat key={stat.label} label={stat.label} value={stat.value} color={stat.color} />
      ))}
    </div>
  )
}

// ─── Main Server Detail Page ─────────────────────────────────────────────────

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("serverDetailPage")
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const isAdminUser = !!(
    user &&
    (user.role === "*" || user.role === "rootAdmin" || user.role === "admin" || user.role === "staff")
  )

  const [mounts, setMounts] = useState<any[] | null>(null)
  useEffect(() => {
    apiFetch(`/api/servers/${id}/mounts`)
      .then((data) => setMounts(Array.isArray(data) ? data : []))
      .catch(() => setMounts([]))
  }, [id])

  const [editorSettings, setEditorSettings] = useState<EditorSettings | undefined>(undefined)
  const [server, setServer] = useState<any>(null)
  const [subuserEntry, setSubuserEntry] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("console")
  const [powerLoading, setPowerLoading] = useState(false)
  const [powerToast, setPowerToast] = useState<{ type: "success" | "warning" | "error"; title: string; message: string } | null>(null)
  const [kvmLoading, setKvmLoading] = useState(false)
  const [markStartedLoading, setMarkStartedLoading] = useState(false)
  const [powerDialogOpen, setPowerDialogOpen] = useState(false)
  const [pendingPowerAction, setPendingPowerAction] = useState<string | null>(null)

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferNodes, setTransferNodes] = useState<any[]>([])
  const [transferNodeId, setTransferNodeId] = useState<number | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  useEffect(() => {
    if (!powerToast) return
    const timer = window.setTimeout(() => setPowerToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [powerToast])

  const isKvm = !!server?.configuration?.container?.kvm_passthrough_enabled

  const [primaryAlloc, setPrimaryAlloc] = useState<any>(
    server?.allocations?.find((a: any) => a.is_default) ||
    server?.allocations?.[0] ||
    null
  )

  useEffect(() => {
    if (server?.allocations && server.allocations.length > 0) {
      setPrimaryAlloc(
        server.allocations.find((a: any) => a.is_default) || server.allocations[0]
      )
      return
    }

    let mounted = true
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", id))
      .then((data) => {
        if (!mounted) return
        const arr = Array.isArray(data) ? data : []
        setPrimaryAlloc(arr.find((a: any) => a.is_default) || arr[0] || null)
      })
      .catch(() => {
        if (!mounted) return
        setPrimaryAlloc(null)
      })

    return () => {
      mounted = false
    }
  }, [server, id])

  const sftpHost = isKvm
    ? primaryAlloc?.fqdn || primaryAlloc?.ip || server?.sftp?.host || ""
    : server?.sftp?.host || ""

  const sftpPort = isKvm
    ? String(primaryAlloc?.port || server?.sftp?.port || "")
    : String(server?.sftp?.port || "")

  const sftpUser = isKvm
    ? "root"
    : server?.sftp?.username || ""

  const filesTabSftpInfo = isKvm
    ? {
        host: sftpHost,
        port: Number(sftpPort) || 0,
        username: sftpUser,
        proxied: server?.sftp?.proxied,
      }
    : server?.sftp

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

  const loadSubuserEntry = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverSubusers.replace(":id", id))
      if (Array.isArray(data)) {
        const meEmail = user?.email
        const meId = user?.id
        const match = data.find(
          (d: any) => d.userId === meId || (meEmail && d.userEmail === meEmail)
        )
        setSubuserEntry(match || null)
      } else if (data && typeof data === "object") {
        setSubuserEntry(data)
      } else {
        setSubuserEntry(null)
      }
    } catch {
      setSubuserEntry(null)
    }
  }, [id, user?.email, user?.id])

  useEffect(() => {
    setEditorSettings(user?.settings?.editor)
  }, [user?.settings?.editor])

  useEffect(() => {
    loadServer()
    loadSubuserEntry()
    const interval = setInterval(() => {
      loadServer()
      loadSubuserEntry()
    }, 15000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadServer()
        loadSubuserEntry()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [loadServer, loadSubuserEntry])

  const sendPower = useCallback(
    async (action: string) => {
      setPowerLoading(true)
      try {
        const res = await apiFetch(API_ENDPOINTS.serverPower.replace(":id", id), {
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
        setTimeout(loadServer, 1500)
      } catch (e: any) {
        setPowerToast({
          type: "error",
          title: t("toasts.powerFailedTitle"),
          message: e?.message || t("toasts.unknownError"),
        })
      } finally {
        setPowerLoading(false)
      }
    },
    [id, loadServer, t]
  )

  const confirmPowerAction = useCallback((action: string) => {
    setPendingPowerAction(action)
    setPowerDialogOpen(true)
  }, [])

  const doConfirmedPowerAction = useCallback(async () => {
    if (!pendingPowerAction) return
    setPowerDialogOpen(false)
    await sendPower(pendingPowerAction)
    setPendingPowerAction(null)
  }, [pendingPowerAction, sendPower])

  const toggleKvm = useCallback(async () => {
    if (!server) return
    const enable = !server.configuration?.container?.kvm_passthrough_enabled
    setKvmLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.serverKvm.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ enable }),
      })
      await loadServer()
      alert(t("alerts.kvmToggled", { state: enable ? t("states.enabled") : t("states.disabled") }))
    } catch (e: any) {
      alert(t("alerts.kvmToggleFailed", { reason: e?.message || e }))
    } finally {
      setKvmLoading(false)
    }
  }, [server, id, loadServer, t])

  const deleteServer = useCallback(async () => {
    if (!confirm(t("confirm.deleteServer")))
      return
    try {
      await apiFetch(API_ENDPOINTS.serverDelete.replace(":id", id), { method: "DELETE" })
      router.push("/dashboard/servers")
    } catch (e: any) {
      alert(t("alerts.deleteFailed", { reason: e.message }))
    }
  }, [id, router, t])

  const loadNodes = useCallback(async () => {
    try {
      const nodes = await apiFetch(API_ENDPOINTS.nodes)
      if (Array.isArray(nodes)) setTransferNodes(nodes)
    } catch {}
  }, [])

  const openTransferDialog = useCallback(async () => {
    setTransferError(null)
    setTransferNodeId(null)
    setTransferDialogOpen(true)
    if (transferNodes.length === 0) await loadNodes()
  }, [transferNodes.length, loadNodes])

  const doTransfer = useCallback(async () => {
    if (!transferNodeId) {
      setTransferError(t("errors.selectTargetNode"))
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
      alert(t("alerts.transferInitiated"))
    } catch (e: any) {
      setTransferError(e.message || t("errors.transferFailed"))
    } finally {
      setTransferLoading(false)
    }
  }, [transferNodeId, id, loadServer, t])

  const canTransfer = !!(
    user &&
    (user.role === "*" || user.role === "rootAdmin" || user.role === "admin")
  )
  const canToggleKvm = !!(
    user &&
    (user.role === "*" || user.role === "rootAdmin" || user.role === "admin")
  )
  const canMarkStarted = canToggleKvm && server?.status === "starting"
  const canOpenAdminMode = !!(
    user &&
    (user.role === "*" ||
      user.role === "rootAdmin" ||
      user.role === "admin" ||
      user.role === "staff")
  )

  const markServerAsStarted = useCallback(async () => {
    setMarkStartedLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.adminServerMarkStarted.replace(":id", id), {
        method: "POST",
      })
      await loadServer()
      alert(t("alerts.markedStarted"))
    } catch (e: any) {
      alert(t("alerts.markStartedFailed", { reason: e?.message || e }))
    } finally {
      setMarkStartedLoading(false)
    }
  }, [id, loadServer, t])

  const isOwnerOrAdmin = !!(
    user &&
    (user.role === "*" ||
      user.role === "rootAdmin" ||
      user.role === "admin" ||
      server?.isOwner === true ||
      server?.userId === user.id ||
      server?.owner === user.id ||
      server?.ownerId === user.id)
  )

  const isViewerSubuser =
    !!subuserEntry && !isOwnerOrAdmin && subuserEntry.accepted !== false

  const hasServerAccess = isOwnerOrAdmin || isViewerSubuser
  const isDmcaProtected = server?.status === 'dmca' || !!server?.is_dmca
  const dmcaDeletionAt = server?.dmcaDeletionAt ? new Date(server.dmcaDeletionAt) : server?.configuration?.dmcaDeletionAt ? new Date(server.configuration.dmcaDeletionAt) : null
  const dmcaDaysLeft = dmcaDeletionAt ? Math.max(0, Math.ceil((dmcaDeletionAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null
  const dmcaReason = server?.dmcaReason || server?.configuration?.dmcaReason || 'No reason provided'

  const subuserPerms = useMemo(
    () => (Array.isArray(subuserEntry?.permissions) ? subuserEntry.permissions : []),
    [subuserEntry?.permissions]
  )

  const tabs: TabItem[] = useMemo(() => {
    const baseTabs = [
      { id: "console", label: t("tabs.console"), icon: Terminal },
      { id: "stats", label: t("tabs.statistics"), icon: BarChart3, shortLabel: t("tabs.statsShort") },
      { id: "files", label: t("tabs.files"), icon: Folder },
      { id: "startup", label: t("tabs.startup"), icon: Variable },
      { id: "databases", label: t("tabs.databases"), icon: Database, shortLabel: t("tabs.dbShort") },
      { id: "schedules", label: t("tabs.schedules"), icon: Clock },
      { id: "network", label: t("tabs.network"), icon: Network, shortLabel: t("tabs.netShort") },
      ...(isKvm ? [{ id: "firewall", label: t("tabs.firewall"), icon: Shield }] : []),
      { id: "backups", label: t("tabs.backups"), icon: HardDrive },
      { id: "activity", label: t("tabs.activity"), icon: Activity },
      { id: "subusers", label: t("tabs.subusers"), icon: Users },
      { id: "settings", label: t("tabs.settings"), icon: Settings },
    ]
    if (mounts && mounts.length > 0) {
      baseTabs.splice(baseTabs.length - 1, 0, { id: "mounts", label: t("tabs.mounts"), icon: Box })
    }
    return baseTabs
  }, [t, isKvm, mounts])

  const tabPermissionMap: Record<string, string | null> = useMemo(
    () => ({
      console: "console",
      files: "files",
      backups: "backups",
      startup: "startup",
      settings: "settings",
      databases: "databases",
      schedules: "schedules",
      activity: "activity",
      stats: "stats",
      network: "network",
      mounts: "mounts",
    }),
    []
  )

  const visibleTabs = useMemo(() => {
    if (!hasServerAccess) return []
    return tabs.filter((t) => {
      if (!isViewerSubuser) return true
      if (t.id === "subusers") return true
      const required = tabPermissionMap[t.id]
      if (!required) return true
      if (subuserPerms.includes("*")) return true
      return subuserPerms.includes(required)
    })
  }, [tabs, hasServerAccess, isViewerSubuser, tabPermissionMap, subuserPerms])

  // Fix: this useEffect must run unconditionally (not after conditional returns)
  // We place it here before any early returns to comply with Rules of Hooks
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [visibleTabs, activeTab])

  // ── Early returns (loading / error) ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("states.loadingServer")}</p>
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
          <h2 className="text-lg font-semibold text-foreground mb-1">{t("states.serverNotFoundTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("states.serverNotFoundDescription")}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard/servers")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("actions.backToServers")}
        </Button>
      </div>
    )
  }

    if (isDmcaProtected && !isAdminUser) {
      return (
        <div className="flex min-h-full items-center justify-center p-6">
          <div className="max-w-2xl rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">Server under DMCA takedown</h2>
            <p className="text-sm text-muted-foreground mb-3">
              This server has been placed under a DMCA takedown and panel access is locked.
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Deletion is scheduled for{' '}
              {dmcaDeletionAt ? (
                <time dateTime={dmcaDeletionAt.toISOString()}>{dmcaDeletionAt.toLocaleString()}</time>
              ) : (
                'the next 30 days'
              )}
              {dmcaDaysLeft !== null ? ` (${dmcaDaysLeft} day${dmcaDaysLeft === 1 ? '' : 's'} remaining)` : ''}.
            </p>
            <p className="text-sm text-muted-foreground mb-4">Reason: {dmcaReason}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button variant="outline" onClick={() => router.push('/dashboard/tickets/new')}>
                Contact support
              </Button>
              <Button variant="secondary" onClick={() => router.push('/legal/dmca-copyright-policy')}>
                DMCA policy
              </Button>
            </div>
          </div>
        </div>
      )
    }

  const dmcaAlert = isDmcaProtected ? (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-3">
      <div className="font-semibold">DMCA takedown active</div>
      <div className="mt-2">
        {dmcaReason}
      </div>
      <div className="mt-2 text-xs text-destructive/80">
        Deletion scheduled for {dmcaDeletionAt ? dmcaDeletionAt.toLocaleString() : 'within 30 days'}{dmcaDaysLeft !== null ? ` (${dmcaDaysLeft} day${dmcaDaysLeft === 1 ? '' : 's'} remaining)` : ''}.
      </div>
    </div>
  ) : null

  const statusColor =
    server.status === 'running' || server.status === 'online'
      ? 'text-green-400 bg-green-400'
      : server.status === 'hibernated'
        ? 'text-purple-400 bg-purple-400'
        : server.status === 'dmca'
          ? 'text-destructive bg-destructive'
          : server.status === 'stopped' || server.status === 'offline'
            ? 'text-red-400 bg-red-400'
            : 'text-yellow-400 bg-yellow-400'

  if (!hasServerAccess) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-xl rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            {t("states.accessRevokedTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("states.accessRevokedDescription")}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/servers")}
            className="mt-6"
          >
            {t("actions.backToServers")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {powerToast && (
        <div className="fixed inset-x-0 bottom-4 z-[9999] px-3 sm:px-4 pointer-events-none">
          <div
            className={`mx-auto w-full max-w-sm sm:max-w-md rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto ${
              powerToast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : powerToast.type === "warning"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-destructive/30 bg-destructive/10"
            }`}
          >
            <div className="flex items-start gap-2.5">
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
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div data-guide-id="server-header" className="flex-shrink-0">
        <PanelHeader
          title={server.name || server.uuid?.slice(0, 8) || t("header.serverFallback")}
          description={`${server.uuid || id}`}
        />
      </div>

      {isDmcaProtected && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4 text-destructive mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">DMCA takedown active</p>
          </div>
          <p className="text-xs text-destructive/80 mt-2">
            {dmcaReason}. Deletion scheduled for {dmcaDeletionAt ? dmcaDeletionAt.toLocaleString() : 'within 30 days'}{dmcaDaysLeft !== null ? ` (${dmcaDaysLeft} day${dmcaDaysLeft === 1 ? '' : 's'} remaining)` : ''}.
          </p>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="flex flex-col gap-3 p-3 sm:p-4 md:p-6 w-full min-w-0 max-w-full">
          {/* Server Header Card */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "h-3 w-3 rounded-full flex-shrink-0 animate-pulse",
                  statusColor.split(" ")[1]
                )}
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
                  {server.name || t("header.unnamedServer")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate font-mono hidden sm:block">
                  {server.uuid || id}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                <Badge
                  variant="outline"
                  className={cn("text-xs whitespace-nowrap", statusColor.split(" ")[0])}
                >
                  {server.status || t("states.unknown")}
                </Badge>
                {isKvm && (
                  <Badge
                    variant="outline"
                    className="text-xs border-indigo-500/30 text-indigo-400 bg-indigo-500/5 whitespace-nowrap"
                  >
                    <Monitor className="h-3 w-3 mr-1" />
                    KVM
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 min-w-0">
              <PowerActions
                server={server}
                t={t}
                powerLoading={powerLoading}
                markStartedLoading={markStartedLoading}
                kvmLoading={kvmLoading}
                kvmEnabled={isKvm}
                onAction={confirmPowerAction}
                onToggleKvm={canToggleKvm ? toggleKvm : undefined}
                onMarkStarted={canMarkStarted ? markServerAsStarted : undefined}
                onTransfer={openTransferDialog}
                canTransfer={canTransfer}
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                {canOpenAdminMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/dashboard/admin?tab=servers&viewServer=${encodeURIComponent(server?.uuid || id)}`
                      )
                    }
                    className="h-9"
                  >
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    {t("actions.adminMode")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadServer}
                  className="h-9 w-9 p-0"
                  aria-label={t("actions.refreshServer")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Resource Stats */}
          <div data-guide-id="server-resources" className="min-w-0">
            <ResourceStats resources={server.resources} />
          </div>

          {/* Tab Navigation */}
          <div className="min-w-0 overflow-hidden">
            <TabNavigation tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Tab Content */}
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0 w-full">
            {activeTab === "console" && (
              <Suspense fallback={<LoadingState message={t("states.loadingConsole")} />}>
                <ConsoleTabLazy serverId={id} />
              </Suspense>
            )}
            {activeTab === "stats" && (
              <Suspense fallback={<LoadingState message={t("states.loadingStatistics")} />}>
                <StatsTabLazy serverId={id} server={server} />
              </Suspense>
            )}
            {activeTab === "files" && (
              <Suspense fallback={<LoadingState message={t("states.loadingFiles")} />}>
                <FilesTabLazy
                  serverId={id}
                  sftpInfo={filesTabSftpInfo}
                  isKvm={isKvm}
                  editorSettings={editorSettings}
                />
              </Suspense>
            )}
            {activeTab === "startup" && <StartupTab serverId={id} />}
            {activeTab === "databases" && <DatabasesTab serverId={id} />}
            {activeTab === "schedules" && <SchedulesTab serverId={id} />}
            {activeTab === "network" && <NetworkTab serverId={id} />}
            {activeTab === "firewall" && (
              <Suspense fallback={<LoadingState message={t("states.loadingFirewall")} />}>
                <FirewallTabLazy serverId={id} server={server} />
              </Suspense>
            )}
            {activeTab === "mounts" && <MountsTab serverId={id} isKvm={isKvm} />}
            {activeTab === "backups" && <BackupsTab serverId={id} />}
            {activeTab === "activity" && <ActivityTab serverId={id} />}
            {activeTab === "subusers" && (
              <SubusersTab
                serverId={id}
                subuserEntry={subuserEntry}
                isOwnerOrAdmin={isOwnerOrAdmin}
              />
            )}
            {activeTab === "settings" && (
              <SettingsTab
                serverId={id}
                server={server}
                onDelete={deleteServer}
                reload={loadServer}
                isKvm={isKvm}
                isAdminUser={isAdminUser}
              />
            )}
          </div>

          {/* Bottom safe area for mobile */}
          <div className="h-2 sm:h-0 flex-shrink-0" />
        </div>
      </div>

      {/* Power Confirmation Dialog */}
      <Dialog
        open={powerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPowerDialogOpen(false)
            setPendingPowerAction(null)
          }
        }}
      >
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md rounded-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {t("dialogs.power.confirmPrefix")} 
              {pendingPowerAction
                ? pendingPowerAction.charAt(0).toUpperCase() + pendingPowerAction.slice(1)
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground break-words">
              {t("dialogs.power.confirmMessage", { action: pendingPowerAction || "" })}
            </p>
            {pendingPowerAction === "kill" && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive break-words min-w-0">
                    {t("dialogs.power.killWarning")}
                  </p>
                </div>
              </div>
            )}
            {isKvm && pendingPowerAction === "kill" && (
              <div className="mt-2">
                <KvmInfoNotice message={t("kvm.killWarning")} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPowerDialogOpen(false)
                setPendingPowerAction(null)
              }}
              disabled={powerLoading}
              className="w-full sm:w-auto"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              variant={pendingPowerAction === "kill" ? "destructive" : "default"}
              onClick={doConfirmedPowerAction}
              disabled={powerLoading}
              className="w-full sm:w-auto"
            >
              {powerLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {pendingPowerAction
                ? pendingPowerAction.charAt(0).toUpperCase() + pendingPowerAction.slice(1)
                : t("actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTransferDialogOpen(false)
            setTransferNodeId(null)
            setTransferError(null)
          }
        }}
      >
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md rounded-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("dialogs.transfer.title")}</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <p className="text-sm text-muted-foreground break-words">
              {t("dialogs.transfer.description")}
            </p>
            {isKvm && (
              <KvmInfoNotice message={t("kvm.transferNotice")} />
            )}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">{t("dialogs.transfer.destinationNode")}</label>
              <select
                value={transferNodeId ?? ""}
                onChange={(e) =>
                  setTransferNodeId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none"
              >
                <option value="">{t("dialogs.transfer.selectNode")}</option>
                {transferNodes.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.name || n.nodeId || n.id}{" "}
                    {n.nodeType ? `(${n.nodeType})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {transferError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive break-words">{transferError}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("dialogs.transfer.notice")}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setTransferDialogOpen(false)}
              disabled={transferLoading}
              className="w-full sm:w-auto"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={doTransfer}
              disabled={transferLoading || !transferNodeId}
              className="w-full sm:w-auto"
            >
              {transferLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("actions.transfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Databases Tab ───────────────────────────────────────────────────────────

function DatabasesTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
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

  useEffect(() => {
    load()
  }, [load])

  const createDb = async () => {
    setCreating(true)
    setCreateError("")
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDatabases.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ label: formLabel || undefined }),
      })
      setDatabases((prev) => [...prev, { ...data, password: "***" }])
      if (data.id && data.password && data.password !== "***") {
        setCreds((prev) => ({ ...prev, [data.id]: data }))
      }
      setFormLabel("")
      setShowForm(false)
    } catch (e: any) {
      setCreateError(e?.message || t("databases.createFailed"))
    } finally {
      setCreating(false)
    }
  }

  const deleteDb = async (dbId: number) => {
    if (!confirm(t("databases.confirmDelete"))) return
    setDeletingId(dbId)
    try {
      await apiFetch(
        `${API_ENDPOINTS.serverDatabases.replace(":id", serverId)}/${dbId}`,
        { method: "DELETE" }
      )
      setDatabases((prev) => prev.filter((d: any) => d.id !== dbId))
      setCreds((prev) => {
        const c = { ...prev }
        delete c[dbId]
        return c
      })
    } finally {
      setDeletingId(null)
    }
  }

  const viewCreds = async (dbId: number) => {
    if (creds[dbId]) {
      setCreds((prev) => {
        const c = { ...prev }
        delete c[dbId]
        return c
      })
      return
    }
    setLoadingCreds((prev) => ({ ...prev, [dbId]: true }))
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverDatabaseCredentials
          .replace(":id", serverId)
          .replace(":dbId", String(dbId))
      )
      setCreds((prev) => ({ ...prev, [dbId]: data }))
    } finally {
      setLoadingCreds((prev) => ({ ...prev, [dbId]: false }))
    }
  }

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("databases.title")}
        icon={Database}
        action={
          <Button
            size="sm"
            onClick={() => {
              setShowForm(!showForm)
              setCreateError("")
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">{t("databases.newDatabase")}</span>
            <span className="sm:hidden">{t("databases.new")}</span>
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 overflow-hidden">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("databases.labelOptional")}</label>
            <input
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0"
              placeholder={t("databases.labelPlaceholder")}
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
          </div>
          {createError && (
            <div className="p-2.5 rounded-lg bg-destructive/10 text-xs text-destructive break-words">
              {createError}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={createDb} disabled={creating} className="h-9">
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {t("databases.create")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-9">
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {databases.length === 0 ? (
        <EmptyState icon={Database} message={t("databases.empty")} />
      ) : (
        <div className="space-y-3 min-w-0">
          {databases.map((db: any) => (
            <div
              key={db.id}
              className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate">
                    {db.label || db.name}
                  </p>
                  {db.label && (
                    <p className="text-xs text-muted-foreground font-mono truncate">{db.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {t("databases.user")}: {db.username}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewCreds(db.id)}
                    disabled={loadingCreds[db.id]}
                    className="text-xs h-9 px-2.5"
                  >
                    {loadingCreds[db.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : creds[db.id] ? (
                      <>
                        <EyeOff className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{t("databases.hide")}</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{t("databases.show")}</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteDb(db.id)}
                    disabled={deletingId === db.id}
                    className="h-9 w-9 p-0"
                    aria-label={t("databases.deleteDatabase")}
                  >
                    {deletingId === db.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {creds[db.id] && (
                <div className="rounded-lg bg-background border border-border p-3 space-y-2 min-w-0 overflow-hidden">
                  {[
                    {
                      label: t("databases.credentials.host"),
                      value: `${creds[db.id].host}:${creds[db.id].port}`,
                      key: `host-${db.id}`,
                    },
                    { label: t("databases.credentials.db"), value: creds[db.id].name, key: `db-${db.id}` },
                    { label: t("databases.credentials.user"), value: creds[db.id].username, key: `user-${db.id}` },
                    {
                      label: t("databases.credentials.pass"),
                      value: creds[db.id].password,
                      key: `pass-${db.id}`,
                      sensitive: true,
                    },
                    { label: t("databases.credentials.jdbc"), value: creds[db.id].jdbc, key: `jdbc-${db.id}` },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-12 flex-shrink-0">
                        {row.label}
                      </span>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="text-xs bg-secondary/40 rounded px-2 py-0.5 font-mono block truncate">
                          {row.sensitive ? "••••••••" : row.value}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 flex-shrink-0"
                        onClick={() => copyText(row.value, row.key)}
                        aria-label={t("databases.copy", { field: row.label })}
                      >
                        {copied === row.key ? (
                          <Check className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
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

// ─── Schedules Tab ───────────────────────────────────────────────────────────

function SchedulesTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
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
    is_active: true,
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

  useEffect(() => {
    load()
  }, [load])

  const createSchedule = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverSchedules.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({
        name: "",
        cron_minute: "*",
        cron_hour: "*",
        cron_day_of_month: "*",
        cron_month: "*",
        cron_day_of_week: "*",
        is_active: true,
      })
      load()
    } catch (e: any) {
      alert(t("schedules.failed", { reason: e.message }))
    } finally {
      setCreating(false)
    }
  }

  const deleteSchedule = async (sid: string) => {
    if (!confirm(t("schedules.confirmDelete"))) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverScheduleDelete.replace(":id", serverId).replace(":sid", sid),
        { method: "DELETE" }
      )
      load()
    } catch (e: any) {
      alert(t("schedules.failed", { reason: e.message }))
    }
  }

  if (loading) return <LoadingState />

  const cronLabels = ["Min", "Hr", "Day", "Mon", "Wk"] as const
  const cronFields = [
    "cron_minute",
    "cron_hour",
    "cron_day_of_month",
    "cron_month",
    "cron_day_of_week",
  ] as const

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("schedules.title")}
        icon={Clock}
        action={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">{t("schedules.newSchedule")}</span>
            <span className="sm:hidden">{t("schedules.new")}</span>
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-4 overflow-hidden">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("schedules.name")}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("schedules.namePlaceholder")}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("schedules.cronExpression")}</label>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {cronFields.map((field, idx) => (
                <div key={field} className="space-y-1 min-w-0">
                  <label className="text-[10px] text-muted-foreground block text-center">
                    {cronLabels[idx]}
                  </label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full rounded-md border border-border bg-input px-1 py-2.5 text-sm font-mono outline-none text-center focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={createSchedule} disabled={creating} className="h-9">
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {t("schedules.create")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowForm(false)}
              className="h-9"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState icon={Clock} message={t("schedules.empty")} />
      ) : (
        <div className="space-y-3 min-w-0">
          {schedules.map((sched: any) => (
            <div
              key={sched.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 min-w-0 overflow-hidden"
            >
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
                  {sched.name || t("schedules.unnamed")}
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                  {sched.cron_minute} {sched.cron_hour} {sched.cron_day_of_month}{" "}
                  {sched.cron_month} {sched.cron_day_of_week}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      sched.is_active ? "text-green-400" : "text-muted-foreground"
                    )}
                  >
                    {sched.is_active ? t("schedules.active") : t("schedules.inactive")}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate min-w-0">
                    {t("schedules.last")}: {sched.last_run_at ? new Date(sched.last_run_at).toLocaleString() : t("schedules.never")}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteSchedule(String(sched.id))}
                className="flex-shrink-0 h-9 w-9 p-0"
                aria-label={t("schedules.deleteSchedule")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Network Tab ─────────────────────────────────────────────────────────────

function NetworkTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      .then((data) => setAllocations(Array.isArray(data) ? data : []))
      .catch(() => setAllocations([]))
      .finally(() => setLoading(false))
  }, [serverId])

  const requestPorts = async (requestIpv6 = false) => {
    setRequesting(true)
    setRequestError(null)
    try {
      await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ count: 1, requestIpv6 }),
      })
      const refreshed = await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      setAllocations(Array.isArray(refreshed) ? refreshed : [])
    } catch (e: any) {
      setRequestError(e?.message || t("network.requestFailed"))
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
        method: "DELETE",
        body: JSON.stringify({ ip, port }),
      })
      const refreshed = await apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      setAllocations(Array.isArray(refreshed) ? refreshed : [])
    } catch (e: any) {
      alert(e?.message || t("network.failed"))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("network.title")}
        icon={Network}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => requestPorts(true)} disabled={requesting}>
              {requesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              <span className="hidden sm:inline">Request IPv6</span>
              <span className="sm:hidden">IPv6</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => requestPorts(false)} disabled={requesting}>
              {requesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              <span className="hidden sm:inline">Request Port</span>
              <span className="sm:hidden">Port</span>
            </Button>
          </div>
        }
      />

      {requestError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive break-words">
          {requestError}
        </div>
      )}

      {allocations.length === 0 ? (
        <EmptyState icon={Network} message={t("network.empty")} />
      ) : (
        <div className="space-y-2 min-w-0">
          {allocations.map((alloc: any, i: number) => {
            const key = `${alloc.ip}:${alloc.port}`
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3 min-w-0 overflow-hidden"
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-mono text-sm text-foreground truncate min-w-0 break-all">
                      {alloc.fqdn || alloc.ip}:{alloc.port}
                    </span>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0 whitespace-nowrap">
                      {alloc.is_default ? t("network.primary") : t("network.secondary")}
                    </Badge>
                  </div>
                  {alloc.fqdn && alloc.ip && alloc.fqdn !== alloc.ip && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                      {alloc.ip}
                    </p>
                  )}
                </div>
                {!alloc.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deassignPort(alloc.ip, alloc.port)}
                    disabled={deleting === key}
                    className="flex-shrink-0 h-9 w-9 p-0"
                    aria-label={t("network.removeAllocation")}
                  >
                    {deleting === key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
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

// ─── Backups Tab ─────────────────────────────────────────────────────────────

function BackupsTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
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

  useEffect(() => {
    load()
  }, [load])

  const createBackup = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      load()
    } catch (e: any) {
      alert(t("backups.failed", { reason: e.message }))
    } finally {
      setCreating(false)
    }
  }

  const restoreBackup = async (bid: string) => {
    if (!confirm(t("backups.confirmRestore"))) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverBackupRestore.replace(":id", serverId).replace(":bid", bid),
        { method: "POST" }
      )
      alert(t("backups.restoreInitiated"))
    } catch (e: any) {
      alert(t("backups.failed", { reason: e.message }))
    }
  }

  const deleteBackup = async (bid: string) => {
    if (!confirm(t("backups.confirmDelete"))) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverBackupDelete.replace(":id", serverId).replace(":bid", bid),
        { method: "DELETE" }
      )
      load()
    } catch (e: any) {
      alert(t("backups.failed", { reason: e.message }))
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
      alert(t("backups.failed", { reason: e.message }))
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("backups.title")}
        icon={HardDrive}
        action={
          <Button size="sm" onClick={createBackup} disabled={creating}>
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span className="hidden sm:inline">{t("backups.createBackup")}</span>
            <span className="sm:hidden">{t("backups.create")}</span>
          </Button>
        }
      />

      {backups.length === 0 ? (
        <EmptyState icon={HardDrive} message={t("backups.empty")} />
      ) : (
        <div className="space-y-3 min-w-0">
          {backups.map((backup: any) => {
            const isLocked = backup.locked || backup.is_locked
            const inProgress =
              (backup.progress != null &&
                Number(backup.progress) > 0 &&
                Number(backup.progress) < 100) ||
              (backup.status &&
                ["running", "in-progress", "processing"].includes(
                  String(backup.status).toLowerCase()
                ))

            return (
              <div
                key={backup.uuid || backup.id}
                className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <p className="text-sm font-medium text-foreground truncate min-w-0">
                        {backup.displayName ||
                          backup.display_name ||
                          backup.name ||
                          t("backups.backupFallback")}
                      </p>
                      {isLocked && (
                        <Lock className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {formatBytes(backup.bytes || 0)} •{" "}
                      {backup.created_at
                        ? new Date(backup.created_at).toLocaleString()
                        : "—"}
                    </p>
                    {backup.is_successful === false && (
                      <p className="text-xs text-destructive mt-1">{t("backups.backupFailed")}</p>
                    )}
                  </div>
                </div>

                {inProgress && (
                  <div className="space-y-1">
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{
                          width: `${Math.max(0, Math.min(100, Number(backup.progress) || 0))}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t("backups.progress", { value: Math.round(Number(backup.progress) || 0) })}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restoreBackup(String(backup.uuid || backup.id))}
                    className="h-9 px-3 text-xs"
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    {t("backups.restore")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      lockBackup(String(backup.uuid || backup.id), !isLocked)
                    }
                    className="h-9 w-9 p-0"
                    aria-label={isLocked ? t("backups.unlockBackup") : t("backups.lockBackup")}
                  >
                    {isLocked ? (
                      <Unlock className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteBackup(String(backup.uuid || backup.id))}
                    disabled={isLocked}
                    className="h-9 w-9 p-0"
                    aria-label={t("backups.deleteBackup")}
                  >
                    <Trash2 className="h-4 w-4" />
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

// ─── Startup Tab ─────────────────────────────────────────────────────────────

function StartupTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startup, setStartup] = useState<any>(null)
  const [editedEnv, setEditedEnv] = useState<Record<string, string>>({})
  const [extraEnvRows, setExtraEnvRows] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [donePatterns, setDonePatterns] = useState<string[]>([])
  const [selectedDockerImage, setSelectedDockerImage] = useState<string>("")
  const [dockerImageOptions, setDockerImageOptions] = useState<
    { label: string; value: string }[]
  >([])

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId))
      .then((data) => {
        setStartup(data)
        setEditedEnv(data?.environment || {})
        setExtraEnvRows([])
        setSelectedDockerImage(data?.dockerImage || "")
        setDockerImageOptions(
          Array.isArray(data?.dockerImageOptions) ? data.dockerImageOptions : []
        )
        const patterns = data?.processConfig?.startup?.done
        setDonePatterns(
          Array.isArray(patterns) ? patterns.map(String) : patterns ? [String(patterns)] : [" "]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId])

  const addEnvRow = () => {
    setExtraEnvRows((prev) => [
      ...prev,
      { id: `env-${Date.now()}-${Math.random()}`, key: "", value: "" },
    ])
  }

  const resetEnvOverrides = () => {
    setEditedEnv({})
    setExtraEnvRows([])
  }

  const saveEnv = async () => {
    if (dockerImageOptions.length > 0 && !selectedDockerImage) {
      alert(t("startup.selectDockerBeforeSave"))
      return
    }

    const nextEnvironment: Record<string, string> = {}

    for (const key of Object.keys(editedEnv)) {
      if (!key) continue
      nextEnvironment[key] = editedEnv[key]
    }

    for (const row of extraEnvRows) {
      if (row.key.trim()) {
        nextEnvironment[row.key.trim()] = row.value
      }
    }

    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId), {
        method: "PUT",
        body: JSON.stringify({
          environment: nextEnvironment,
          processConfig: {
            startup: { done: donePatterns.filter((p) => p.length > 0) },
          },
          dockerImage: selectedDockerImage || undefined,
        }),
      })
      setEditedEnv(nextEnvironment)
      setExtraEnvRows([])
      alert(t("startup.saved"))
    } catch (e: any) {
      alert(t("startup.saveFailed", { reason: e.message }))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!startup)
    return (
      <EmptyState icon={AlertCircle} message={t("startup.loadFailed")} />
    )

  const envVarDefs: any[] = startup.envVars || []
  const definedKeys = new Set(envVarDefs.map((v: any) => v.env_variable || v.key || v.name))
  const customKeys = Object.keys(editedEnv).filter((key) => !definedKeys.has(key))

  const envRows = [
    ...envVarDefs.map((def: any) => {
      const key = def.env_variable || def.key || def.name
      return {
        id: key,
        key,
        name: def.name || key,
        description: def.description || "",
        isEditable: !!def.user_editable,
        isDefined: true,
        value: editedEnv[key] ?? "",
        placeholder: String(def.default_value ?? def.defaultValue ?? def.value ?? ""),
      }
    }),
    ...customKeys.map((key) => ({
      id: key,
      key,
      name: key,
      description: "",
      isEditable: true,
      isCustom: true,
      value: editedEnv[key] ?? "",
      placeholder: "",
    })),
    ...extraEnvRows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.key,
      description: "",
      isEditable: true,
      isCustom: true,
      isNew: true,
      value: row.value,
      placeholder: "",
    })),
  ]

  return (
    <div
      data-guide-id="startup-tab"
      className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 min-w-0 overflow-hidden"
    >
      {/* Startup Info */}
      <CollapsibleSection title={t("startup.serverConfiguration")} icon={Variable} defaultOpen>
        <div className="space-y-3 min-w-0 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InfoRow label={t("startup.egg")} value={startup.eggName || "—"} />
            <InfoRow label={t("startup.dockerImage")} value={selectedDockerImage || "—"} mono />
          </div>

          {dockerImageOptions.length > 0 ? (
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("startup.selectDockerImage")}
              </label>
              <select
                value={selectedDockerImage}
                onChange={(e) => setSelectedDockerImage(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0 appearance-none"
              >
                <option value="" disabled>
                  {t("startup.selectImage")}
                </option>
                {dockerImageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground break-words">
              {t("startup.noAlternateDocker")}
            </p>
          )}

          {startup.startup && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted-foreground mb-1">{t("startup.startupCommand")}</p>
              <p className="text-xs font-mono text-foreground break-all leading-relaxed">
                {startup.startup}
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Detection Patterns */}
      <CollapsibleSection title={t("startup.detectionTitle")} icon={Activity}>
        <div className="space-y-3 min-w-0 pt-3">
          <p className="text-xs text-muted-foreground break-words">
            {t("startup.detectionDescription")}
          </p>
          {donePatterns.map((pattern, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={pattern}
                onChange={(e) => {
                  const next = [...donePatterns]
                  next[i] = e.target.value
                  setDonePatterns(next)
                }}
                placeholder={t("startup.patternPlaceholder")}
                className="flex-1 min-w-0 rounded-lg border border-border bg-input px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = donePatterns.filter((_, j) => j !== i)
                  setDonePatterns(next.length > 0 ? next : [" "])
                }}
                className="text-destructive hover:text-destructive h-9 w-9 p-0 flex-shrink-0"
                aria-label={t("startup.removePattern")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDonePatterns([...donePatterns, ""])}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("startup.addPattern")}
          </Button>
        </div>
      </CollapsibleSection>

      {/* Environment Variables */}
      <div className="space-y-3 min-w-0">
        <SectionHeader
          title={t("startup.environmentVariables")}
          icon={Variable}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={resetEnvOverrides} className="h-9">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {t("startup.resetDefaults")}
              </Button>
              <Button size="sm" variant="outline" onClick={addEnvRow} className="h-9">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("startup.addVariable")}
              </Button>
              <Button
                size="sm"
                onClick={saveEnv}
                disabled={saving || (dockerImageOptions.length > 0 && !selectedDockerImage)}
                className="h-9"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                {t("startup.save")}
              </Button>
            </div>
          }
        />

        <div className="space-y-3 min-w-0">
          {envRows.map((row) => {
            const rowItem = row as any
            const isDefined = !!rowItem.isDefined
            const isNew = !!rowItem.isNew
            const isEditable = row.isEditable
            const defaultPlaceholder = row.placeholder || ""

            return (
              <div
                key={row.id}
                className="rounded-lg border border-border bg-secondary/10 p-3 min-w-0 overflow-hidden"
              >
                <div className="flex items-center gap-1.5 mb-2 flex-wrap min-w-0">
                  {isDefined || !isNew ? (
                    <>
                      <span className="text-xs font-semibold text-foreground truncate min-w-0">
                        {row.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono truncate max-w-[50vw] sm:max-w-none"
                      >
                        {row.key}
                      </Badge>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) =>
                        setExtraEnvRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, key: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder={t("startup.variableName")}
                      className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground font-mono outline-none min-w-0 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  )}
                  {!isEditable && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-yellow-500/30 text-yellow-500 flex-shrink-0 whitespace-nowrap"
                    >
                      {t("startup.readOnly")}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (isDefined) {
                        setEditedEnv((prev) => {
                          const next = { ...prev }
                          delete next[row.key]
                          return next
                        })
                      } else if (isNew) {
                        setExtraEnvRows((prev) => prev.filter((item) => item.id !== row.id))
                        setEditedEnv((prev) => {
                          const next = { ...prev }
                          delete next[row.key]
                          return next
                        })
                      } else {
                        setEditedEnv((prev) => {
                          const next = { ...prev }
                          delete next[row.key]
                          return next
                        })
                      }
                    }}
                    className="text-destructive hover:text-destructive h-9 w-9 p-0 flex-shrink-0"
                    aria-label={t("startup.removeVariable")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {row.description && (
                  <p className="text-xs text-muted-foreground mb-2 break-words leading-relaxed">
                    {row.description}
                  </p>
                )}
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => {
                    if (isNew) {
                      setExtraEnvRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id
                            ? { ...item, value: e.target.value }
                            : item
                        )
                      )
                    } else {
                      setEditedEnv((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                  }}
                  placeholder={!isDefined ? t("startup.variableValue") : defaultPlaceholder}
                  disabled={!isEditable}
                  className={cn(
                    "w-full rounded-lg border border-border px-3 py-2.5 text-sm font-mono outline-none min-w-0",
                    isEditable
                      ? "bg-input text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      : "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                  )}
                />
              </div>
            )
          })}
          {envRows.length === 0 && (
            <EmptyState icon={Variable} message={t("startup.noEnvironmentVariables")} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Mounts Tab ──────────────────────────────────────────────────────────────

function MountsTab({ serverId, isKvm }: { serverId: string; isKvm?: boolean }) {
  const t = useTranslations("serverDetailPage")
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
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader title={t("mounts.title")} icon={Box} />

      {isKvm && (
        <KvmInfoNotice message={t("mounts.kvmNotice")} />
      )}

      {!isKvm && (
        <p className="text-xs text-muted-foreground break-words">
          {t("mounts.description")}
        </p>
      )}

      {mounts.length === 0 ? (
        <EmptyState
          icon={Box}
          message={t("mounts.empty")}
        />
      ) : (
        <div className="space-y-3 min-w-0">
          {mounts.map((mount: any, i: number) => (
            <div
              key={mount.id || i}
              className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Box className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate min-w-0">
                  {mount.name || `Mount ${i + 1}`}
                </span>
                {mount.read_only && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-yellow-500/30 text-yellow-500 flex-shrink-0 whitespace-nowrap"
                  >
                    {t("mounts.readOnly")}
                  </Badge>
                )}
              </div>
              {mount.description && (
                <p className="text-xs text-muted-foreground break-words">{mount.description}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded border border-border bg-secondary/30 p-2.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-muted-foreground">{t("mounts.source")}</span>
                  <p className="text-xs font-mono text-foreground truncate">
                    {mount.source || "—"}
                  </p>
                </div>
                <div className="rounded border border-border bg-secondary/30 p-2.5 min-w-0 overflow-hidden">
                  <span className="text-[10px] text-muted-foreground">{t("mounts.target")}</span>
                  <p className="text-xs font-mono text-foreground truncate">
                    {mount.target || "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Activity Tab ────────────────────────────────────────────────────────────

function ActivityTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
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
    "server:power:start": t("activity.actions.startedServer"),
    "server:power:stop": t("activity.actions.stoppedServer"),
    "server:power:restart": t("activity.actions.restartedServer"),
    "server:power:kill": t("activity.actions.killedServer"),
    "server:console:command": t("activity.actions.ranCommand"),
    "server:file:write": t("activity.actions.modifiedFile"),
    "server:file:delete": t("activity.actions.deletedFiles"),
    "server:reinstall": t("activity.actions.reinstalledServer"),
    "server:subuser:add": t("activity.actions.addedSubuser"),
    "server:subuser:accept_invite": t("activity.actions.acceptedSubuserInvite"),
    "server:subuser:remove": t("activity.actions.removedSubuser"),
    "server:subuser:reject_invite": t("activity.actions.rejectedSubuserInvite"),
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader title={t("activity.title")} icon={Activity} />

      {logs.length === 0 ? (
        <EmptyState icon={Activity} message={t("activity.empty")} />
      ) : (
        <div className="space-y-2 min-w-0">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3 min-w-0 overflow-hidden"
            >
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm text-foreground truncate">
                  {actionLabels[log.action] || log.action}
                </p>
                {log.metadata?.command && (
                  <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                    $ {log.metadata.command}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-4 w-4 flex-shrink-0">
                      {log.user?.avatarUrl ? (
                        <AvatarImage src={log.user.avatarUrl} alt={log.user?.displayName || log.user?.email || "User"} />
                      ) : (
                        <AvatarFallback>
                          {getUserAvatarInitials(
                            log.user?.displayName || log.user?.email || t("activity.user", { id: log.userId })
                          )}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="truncate">
                      {log.user?.displayName || log.user?.email || t("activity.user", { id: log.userId })}
                    </span>
                  </div>
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

// ─── Subusers Tab ────────────────────────────────────────────────────────────

function SubusersTab({
  serverId,
  subuserEntry,
  isOwnerOrAdmin,
}: {
  serverId: string
  subuserEntry?: any
  isOwnerOrAdmin?: boolean
}) {
  const t = useTranslations("serverDetailPage")
  const [subusers, setSubusers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locking, setLocking] = useState<Record<number, boolean>>({})
  const { user } = useAuth()

  const PERMISSIONS = [
    { key: "console", label: t("tabs.console") },
    { key: "files", label: t("tabs.files") },
    { key: "backups", label: t("tabs.backups") },
    { key: "startup", label: t("tabs.startup") },
    { key: "settings", label: t("tabs.settings") },
    { key: "databases", label: t("tabs.databases") },
    { key: "schedules", label: t("tabs.schedules") },
    { key: "activity", label: t("tabs.activity") },
    { key: "stats", label: t("tabs.statistics") },
    { key: "network", label: t("tabs.network") },
    { key: "mounts", label: t("tabs.mounts") },
  ]
  const [selectedPerms, setSelectedPerms] = useState<string[]>(["console"])

  const loadSubusers = useCallback(() => {
    setLoading(true)
    apiFetch(`/api/servers/${serverId}/subusers`)
      .then((data) => setSubusers(Array.isArray(data) ? data : []))
      .catch(() => setSubusers([]))
      .finally(() => setLoading(false))
  }, [serverId])

  useEffect(() => {
    loadSubusers()
  }, [loadSubusers])

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
      setSelectedPerms(["console"])
      setShowAdd(false)
      loadSubusers()
    } catch (e: any) {
      setError(e.message || t("subusers.failed"))
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (subuserId: number) => {
    if (!confirm(t("subusers.confirmRemove"))) return
    try {
      await apiFetch(`/api/servers/${serverId}/subusers/${subuserId}`, {
        method: "DELETE",
      })
      loadSubusers()
    } catch (e: any) {
      alert(t("subusers.failedWithReason", { reason: e.message }))
    }
  }

  const toggleLock = async (su: any) => {
    if (!isOwnerOrAdmin) return
    setLocking((s) => ({ ...s, [su.id]: true }))
    try {
      await apiFetch(
        API_ENDPOINTS.serverSubuserDetail
          .replace(":id", serverId)
          .replace(":subId", String(su.id)),
        {
          method: "PUT",
          body: JSON.stringify({
            permissions: su.permissions || [],
            locked: !su.locked,
          }),
        }
      )
      loadSubusers()
    } catch (e: any) {
      alert(t("subusers.failedUpdateLock", { reason: e?.message || e }))
    } finally {
      setLocking((s) => ({ ...s, [su.id]: false }))
    }
  }

  if (loading) return <LoadingState />

  const canAdd = !!(
    isOwnerOrAdmin ||
    (subuserEntry &&
      Array.isArray(subuserEntry.permissions) &&
      subuserEntry.permissions.includes("subusersd"))
  )

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("subusers.title")}
        icon={Users}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/subusers/invites"
              className="inline-flex items-center rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary/30"
            >
              {t("subusers.pendingInvites")}
            </Link>
            {canAdd ? (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">{t("subusers.addSubuser")}</span>
                <span className="sm:hidden">{t("subusers.add")}</span>
              </Button>
            ) : null}
          </div>
        }
      />

      {showAdd && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-4 overflow-hidden">
          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 text-xs text-destructive break-words">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("subusers.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("subusers.permissions")}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 text-xs text-foreground cursor-pointer p-2.5 rounded-lg border border-border hover:bg-secondary/30 active:bg-secondary/50 transition-colors min-w-0 touch-manipulation"
                >
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.key)}
                    onChange={(e) => {
                      setSelectedPerms((prev) =>
                        e.target.checked
                          ? [...prev, p.key]
                          : prev.filter((x) => x !== p.key)
                      )
                    }}
                    className="accent-primary flex-shrink-0 h-4 w-4"
                  />
                  <span className="truncate">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding} className="h-9">
              {adding && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {t("subusers.add")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdd(false)}
              className="h-9"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {subusers.length === 0 ? (
        <EmptyState icon={Users} message={t("subusers.empty")} />
      ) : (
        <div className="space-y-2 min-w-0">
          {subusers.map((su) => {
            const isSelf =
              user && (su.userId === user.id || su.userEmail === user.email)
            const canRemove = !!(
              isOwnerOrAdmin ||
              isSelf ||
              (subuserEntry &&
                Array.isArray(subuserEntry.permissions) &&
                subuserEntry.permissions.includes("subusersd"))
            )
            const removeDisabled = !canRemove || (su.locked && !isOwnerOrAdmin)
            return (
              <div
                key={su.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3 min-w-0 overflow-hidden"
              >
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      {su.user?.avatarUrl ? (
                        <AvatarImage src={su.user.avatarUrl} alt={su.user?.displayName || su.user?.email || "User"} />
                      ) : (
                        <AvatarFallback>
                          {getUserAvatarInitials(
                            su.user?.displayName || su.user?.email || su.userEmail || t("subusers.userFallback", { id: su.userId })
                          )}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0 overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate">
                        {su.user?.displayName || su.user?.email || su.userEmail || t("subusers.userFallback", { id: su.userId })}
                      </p>
                      {su.accepted === false && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {t("subusers.pending")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                    {(su.permissions || []).map((p: string) => (
                      <Badge key={p} variant="outline" className="text-[10px]">
                        {p}
                      </Badge>
                    ))}
                    {su.locked && (
                      <Badge
                        variant="outline"
                        className="text-[10px] ml-1 flex items-center gap-1"
                      >
                        <Lock className="h-3 w-3" />
                        {t("subusers.locked")}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isOwnerOrAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleLock(su)}
                      className="h-9 w-9 p-0"
                      disabled={!!locking[su.id]}
                      aria-label={su.locked ? t("subusers.unlockSubuser") : t("subusers.lockSubuser")}
                    >
                      {locking[su.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : su.locked ? (
                        <Unlock className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemove(su.id)}
                    className="flex-shrink-0 h-9 w-9 p-0"
                    disabled={removeDisabled}
                    aria-label={t("subusers.removeSubuser")}
                  >
                    <Trash2 className="h-4 w-4" />
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

// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({
  serverId,
  server,
  onDelete,
  reload,
  isKvm,
  isAdminUser,
}: {
  serverId: string
  server: any
  onDelete: () => void
  reload: () => void
  isKvm?: boolean
  isAdminUser?: boolean
}) {
  const t = useTranslations("serverDetailPage")
  const { user } = useAuth()
  const [reinstalling, setReinstalling] = useState(false)
  const [launchNotice, setLaunchNotice] = useState<string | null>(null)
  const [savingResources, setSavingResources] = useState(false)
  const [memoryLimit, setMemoryLimit] = useState<number>(Number(server?.build?.memory_limit ?? 0))
  const [diskSpace, setDiskSpace] = useState<number>(Number(server?.build?.disk_space ?? 0))
  const [cpuLimit, setCpuLimit] = useState<number>(Number(server?.build?.cpu_limit ?? 0))
  const [swapLimit, setSwapLimit] = useState<number>(Number(server?.build?.swap ?? 0))
  const [ioWeight, setIoWeight] = useState<number>(Number(server?.build?.io_weight ?? 500))
  const [memorySource, setMemorySource] = useState<"plan" | "node">("plan")
  const [diskSource, setDiskSource] = useState<"plan" | "node">("plan")
  const [cpuSource, setCpuSource] = useState<"plan" | "node">("plan")
  const [nodeResources, setNodeResources] = useState<{ memory?: number; disk?: number; cpu?: number }>({})
  const [primaryAlloc, setPrimaryAlloc] = useState<any>(
    server?.allocations?.find((a: any) => a.is_default) || server?.allocations?.[0] || null
  )

  useEffect(() => {
    setMemoryLimit(Number(server?.build?.memory_limit ?? 0))
    setDiskSpace(Number(server?.build?.disk_space ?? 0))
    setCpuLimit(Number(server?.build?.cpu_limit ?? 0))
    setSwapLimit(Number(server?.build?.swap ?? 0))
    setIoWeight(Number(server?.build?.io_weight ?? 500))
  }, [server])

  useEffect(() => {
    let mounted = true
    if (!server?.node) return

    apiFetch(API_ENDPOINTS.nodesAvailable)
      .then((data) => {
        if (!mounted) return
        const nodes = Array.isArray(data) ? data : []
        const match = nodes.find((n: any) =>
          n.name === server.node || String(n.nodeId) === String(server.node) || String(n.id) === String(server.node)
        )
        if (!match) return
        setNodeResources({
          memory: match.memory != null ? Number(match.memory) : undefined,
          disk: match.disk != null ? Number(match.disk) : undefined,
          cpu: match.cpu != null ? Number(match.cpu) : undefined,
        })
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [server?.node])

  const planLimits = {
    memory: user?.limits?.memory ?? null,
    disk: user?.limits?.disk ?? null,
    cpu: user?.limits?.cpu ?? null,
  }

  useEffect(() => {
    if (!planLimits.memory && nodeResources.memory != null) setMemorySource("node")
    if (!planLimits.disk && nodeResources.disk != null) setDiskSource("node")
    if (!planLimits.cpu && nodeResources.cpu != null) setCpuSource("node")
  }, [planLimits, nodeResources])

  const maxMemory = memorySource === "node" ? nodeResources.memory : planLimits.memory ?? nodeResources.memory
  const maxDisk = diskSource === "node" ? nodeResources.disk : planLimits.disk ?? nodeResources.disk
  const maxCpu = cpuSource === "node" ? nodeResources.cpu : planLimits.cpu ?? nodeResources.cpu

  useEffect(() => {
    if (maxMemory != null && memoryLimit > maxMemory) setMemoryLimit(maxMemory)
  }, [maxMemory])

  useEffect(() => {
    if (maxDisk != null && diskSpace > maxDisk) setDiskSpace(maxDisk)
  }, [maxDisk])

  useEffect(() => {
    if (maxCpu != null && cpuLimit > maxCpu) setCpuLimit(maxCpu)
  }, [maxCpu])

  const sliderMaxMemory = Math.max(128, maxMemory ?? Number(server?.build?.memory_limit ?? 0), memoryLimit)
  const sliderMaxDisk = Math.max(1024, maxDisk ?? Number(server?.build?.disk_space ?? 0), diskSpace)
  const sliderMaxCpu = Math.max(10, maxCpu ?? Number(server?.build?.cpu_limit ?? 0), cpuLimit)

  const hasResourcePools = !isAdminUser && (planLimits.memory != null || planLimits.disk != null || planLimits.cpu != null || nodeResources.memory != null || nodeResources.disk != null || nodeResources.cpu != null)

  useEffect(() => {
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

    return () => {
      mounted = false
    }
  }, [server, serverId])

  const handleReinstall = async () => {
    if (!confirm(t("settings.confirmReinstall"))) return
    setReinstalling(true)
    try {
      await apiFetch(API_ENDPOINTS.serverReinstall.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      alert(t("settings.reinstallInitiated"))
      reload()
    } catch (e: any) {
      alert(t("settings.failedWithReason", { reason: e.message }))
    } finally {
      setReinstalling(false)
    }
  }

  const sftpHost = isKvm
    ? primaryAlloc?.fqdn || primaryAlloc?.ip || server.sftp?.host || "—"
    : server.sftp?.host || "—"
  const sftpPort = isKvm
    ? String(primaryAlloc?.port || server.sftp?.port || "")
    : String(server.sftp?.port || "")
  const sftpUser = server.sftp?.username || (isKvm ? "root" : "—")
  const sftpCmd = isKvm
    ? `sftp root@${sftpHost} -P ${sftpPort}`
    : `sftp ${server.sftp?.username}@${server.sftp?.host} -P ${server.sftp?.port}`
  const sshCmd = isKvm
    ? `ssh root@${sftpHost} -p ${sftpPort}`
    : `ssh ${server.sftp?.username}@${server.sftp?.host} -p ${server.sftp?.port}`

  const filesTabSftpInfo = isKvm
    ? {
        host: sftpHost,
        port: Number(sftpPort) || 0,
        username: sftpUser,
        proxied: server.sftp?.proxied,
      }
    : server?.sftp

  const launchSsh = () => {
    const host = sftpHost
    const port = sftpPort
    const u = sftpUser
    if (!host || host === "—" || !port) {
      setLaunchNotice(t("settings.sshDetailsUnavailable"))
      setTimeout(() => setLaunchNotice(null), 4000)
      return
    }
    const sshUri = `ssh://${encodeURIComponent(u)}@${host}:${port}`
    window.open(sshUri, "_blank")
    setLaunchNotice(t("settings.openingSsh"))
    setTimeout(() => setLaunchNotice(null), 5000)
  }

  const launchSftp = () => {
    const host = sftpHost
    const port = sftpPort
    const u = sftpUser
    if (!host || host === "—" || !port) {
      setLaunchNotice(t("settings.sftpDetailsUnavailable"))
      setTimeout(() => setLaunchNotice(null), 4000)
      return
    }
    const sftpUri = `sftp://${encodeURIComponent(u)}@${host}:${port}`
    window.open(sftpUri, "_blank")
    setLaunchNotice(t("settings.openingSftp"))
    setTimeout(() => setLaunchNotice(null), 5000)
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {/* KVM Status Banner */}
      {isKvm && <KvmBanner />}

      {/* Server Info */}
      <CollapsibleSection title={t("settings.serverInformation")} icon={Info} defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0 pt-3">
          <InfoRow label={t("settings.uuid")} value={server.uuid || serverId} mono copyable />
          <InfoRow label={t("settings.name")} value={server.name || "—"} />
          <InfoRow label={t("settings.status")} value={server.status || "—"} />
          <InfoRow label={t("settings.node")} value={server.node || "—"} />
          <InfoRow label={t("settings.dockerImage")} value={server.container?.image || "—"} mono />
          {isKvm ? (
            <InfoRow label={t("settings.virtualization")} value={t("settings.virtualizationKvm")} />
          ) : (
            <InfoRow label={t("settings.virtualization")} value={t("settings.virtualizationDocker")} />
          )}
        </div>
      </CollapsibleSection>

      {/* SFTP/SSH Access */}
      {server.sftp && (
        <CollapsibleSection title={t("settings.externalAccess")} icon={Network}>
          <div className="space-y-3 min-w-0 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <InfoRow label={t("settings.host")} value={sftpHost} mono copyable />
              <InfoRow label={t("settings.port")} value={sftpPort} mono copyable />
              <InfoRow label={t("settings.username")} value={sftpUser} mono copyable />
            </div>

            {/* Launch Buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={launchSsh}
                className="flex-1 sm:flex-none border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/20 h-10 sm:h-9 px-3"
              >
                <Terminal className="h-4 w-4 mr-2" />
                {t("settings.launchSsh")}
                <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={launchSftp}
                className="flex-1 sm:flex-none border-blue-500/30 text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/20 h-10 sm:h-9 px-3"
              >
                <Folder className="h-4 w-4 mr-2" />
                {t("settings.launchSftp")}
                <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
              </Button>
            </div>

            {/* Launch notice */}
            {launchNotice && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 flex items-start gap-2 animate-in fade-in-0 slide-in-from-top-2 overflow-hidden">
                <Info className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80 leading-relaxed break-words min-w-0">
                  {launchNotice}
                </p>
              </div>
            )}

            {server.sftp.username && (
              <div className="space-y-2.5 min-w-0">
                {/* SSH command */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {t("settings.sshCommand")}
                  </p>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/50 overflow-hidden">
                      <div className="overflow-x-auto scrollbar-none">
                        <code className="text-xs font-mono block px-3 py-2.5 whitespace-nowrap">
                          {sshCmd}
                        </code>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-9 w-9 p-0"
                      onClick={() => navigator.clipboard.writeText(sshCmd)}
                      aria-label={t("settings.copySshCommand")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* SFTP command */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {t("settings.sftpCommand")}
                  </p>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/50 overflow-hidden">
                      <div className="overflow-x-auto scrollbar-none">
                        <code className="text-xs font-mono block px-3 py-2.5 whitespace-nowrap">
                          {sftpCmd}
                        </code>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-9 w-9 p-0"
                      onClick={() => navigator.clipboard.writeText(sftpCmd)}
                      aria-label={t("settings.copySftpCommand")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isKvm ? (
              <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-3 space-y-2 min-w-0 overflow-hidden">
                <div className="flex items-start gap-2 min-w-0">
                  <Monitor className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1.5 min-w-0 flex-1 overflow-hidden">
                    <p className="text-xs font-medium text-indigo-300">{t("settings.kvmNotes.title")}</p>
                    <ul className="text-xs text-indigo-400/70 space-y-1 list-disc pl-4">
                      <li>{t("settings.kvmNotes.usePrimary")}</li>
                      <li className="break-all">
                        {t("settings.kvmNotes.default")}:{" "}
                        <code className="bg-indigo-500/10 px-1 rounded">root</code> /{" "}
                        <code className="bg-indigo-500/10 px-1 rounded">changeme</code>
                      </li>
                      <li>{t("settings.kvmNotes.filesystemManaged")}</li>
                      <li>{t("settings.kvmNotes.panelFilesGuest")}</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground break-words">
                {t("settings.authNote")}
              </p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Build Configuration */}
      {server.build && (
        <CollapsibleSection title={t("settings.resourceLimits")} icon={Cpu}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0 pt-3">
            <div className="space-y-4">
              {hasResourcePools && (
                <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/10 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("resources.resourcePoolSelection")}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                        {t("resources.memory")}
                      </label>
                      <select
                        value={memorySource}
                        onChange={(e) => setMemorySource(e.target.value as "plan" | "node")}
                        className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {planLimits.memory != null && (
                          <option value="plan">
                            {t("resources.planOption", { value: planLimits.memory, unit: "MB" })}
                          </option>
                        )}
                        {nodeResources.memory != null && (
                          <option value="node">
                            {t("resources.nodeOption", { value: nodeResources.memory, unit: "MB" })}
                          </option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                        {t("resources.disk")}
                      </label>
                      <select
                        value={diskSource}
                        onChange={(e) => setDiskSource(e.target.value as "plan" | "node")}
                        className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {planLimits.disk != null && (
                          <option value="plan">
                            {t("resources.planOption", { value: planLimits.disk, unit: "MB" })}
                          </option>
                        )}
                        {nodeResources.disk != null && (
                          <option value="node">
                            {t("resources.nodeOption", { value: nodeResources.disk, unit: "MB" })}
                          </option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                        {t("resources.cpu")}
                      </label>
                      <select
                        value={cpuSource}
                        onChange={(e) => setCpuSource(e.target.value as "plan" | "node")}
                        className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {planLimits.cpu != null && (
                          <option value="plan">
                            {t("resources.planOption", { value: planLimits.cpu, unit: "%" })}
                          </option>
                        )}
                        {nodeResources.cpu != null && (
                          <option value="node">
                            {t("resources.nodeOption", { value: nodeResources.cpu, unit: "%" })}
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <ResourceSlider
                label={t("stats.memory")}
                icon={MemoryStick}
                value={memoryLimit}
                min={128}
                max={sliderMaxMemory}
                step={128}
                onChange={(value) => setMemoryLimit(Math.max(0, value))}
                format={(value) => `${value} MB`}
                formatMax={(value) => `${value} MB`}
                color="text-blue-500"
              />
              <ResourceSlider
                label={t("stats.disk")}
                icon={HardDrive}
                value={diskSpace}
                min={1024}
                max={sliderMaxDisk}
                step={1024}
                onChange={(value) => setDiskSpace(Math.max(0, value))}
                format={(value) =>
                  value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${value} MB`
                }
                formatMax={(value) =>
                  value >= 1024 ? `${(value / 1024).toFixed(0)} GB` : `${value} MB`
                }
                color="text-emerald-500"
              />
              <ResourceSlider
                label={t("stats.cpu")}
                icon={Cpu}
                value={cpuLimit}
                min={10}
                max={sliderMaxCpu}
                step={5}
                onChange={(value) => setCpuLimit(Math.max(0, value))}
                format={(value) => `${value}%`}
                color="text-amber-500"
              />
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-secondary/10 p-4 space-y-4">
                {isAdminUser ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t("settings.swap")}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={swapLimit}
                        onChange={(e) => setSwapLimit(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t("settings.ioWeight")}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={ioWeight}
                        onChange={(e) => setIoWeight(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoRow
                      label={t("settings.swap")}
                      value={`${Number(server.build.swap ?? 0)} MB`}
                    />
                    <InfoRow label={t("settings.ioWeight")} value={String(server.build.io_weight || 500)} />
                  </>
                )}
                {isKvm && <InfoRow label={t("settings.kvmPassthrough")} value={t("states.enabled")} />}
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  setSavingResources(true)
                  try {
                    const payload: Record<string, any> = {
                      memory: memoryLimit,
                      disk: diskSpace,
                      cpu: cpuLimit,
                    }
                    if (isAdminUser) {
                      payload.swap = swapLimit
                      payload.ioWeight = ioWeight
                    }
                    await apiFetch(API_ENDPOINTS.serverUpdate.replace(":id", serverId), {
                      method: "PUT",
                      body: JSON.stringify(payload),
                    })
                    alert(t("settings.resourcesSaved"))
                    reload()
                  } catch (e: any) {
                    alert(t("settings.saveFailed", { reason: e?.message || e }))
                  } finally {
                    setSavingResources(false)
                  }
                }}
                disabled={savingResources}
                className="h-10 sm:h-9"
              >
                {savingResources ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t("settings.saveResources")}
              </Button>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 sm:p-4 md:p-6 space-y-4 overflow-hidden">
        <div>
          <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{t("settings.dangerZone")}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1 break-words">
            {t("settings.dangerDescription")}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 w-full sm:w-auto h-10 sm:h-9"
            onClick={handleReinstall}
            disabled={reinstalling}
          >
            {reinstalling && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {t("settings.reinstall")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {t("settings.deleteServer")}
          </Button>
        </div>
      </div>
    </div>
  )
}
function ResourceSlider({
  label,
  icon: Icon,
  value,
  min,
  max,
  step,
  onChange,
  format,
  formatMax,
  color,
}: {
  label: string
  icon: any
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
  formatMax?: (v: number) => string
  color: string
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
          <div
            className={`h-full rounded-full transition-all duration-150 ${color.replace("text-", "bg-")}/60`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white bg-white shadow-md pointer-events-none"
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
