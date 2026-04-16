"use client"

import React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { PanelHeader } from "@/components/panel/header"
import { StatCard, SectionHeader, StatusBadge } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Users,
  HardDrive,
  Clock,
  Search,
  Ban,
  CheckCircle,
  X,
  XCircle,
  Bot,
  MessageSquare,
  Trash2,
  RefreshCw,
  UserCog,
  FileText,
  Building2,
  Server,
  Power,
  Edit,
  Package,
  Eye,
  EyeOff,
  Plus,
  Copy,
  BarChart3,
  Brain,
  UserPlus,
  Loader2,
  Shield,
  AlertTriangle,
  FileCode,
  Upload,
  Key,
  Lock,
  Globe,
  BookOpen,
  Zap,
  Database,
  Check,
  CreditCard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserMinus,
  RotateCcw,
  MoreHorizontal,
  Play,
  Square,
  ExternalLink,
  ShieldCheck,
  List,
  File,
  Camera,
  Folder,
  Archive,
  CheckSquare,
  ArchiveRestore,
  UserX,
  Box,
  Timer,
  Megaphone,
  Send,
  Info,
  MousePointerClick,
  ScrollText,
  Receipt,
  Calendar,
  Save,
  Code
} from "lucide-react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import SearchableUserSelect from "@/components/SearchableUserSelect"
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectLabel,
} from "@/components/ui/select"

const UsersTab = dynamic(() => import("./tabs/UsersTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading users tab...</div>,
})

const OrganisationsTab = dynamic(() => import("./tabs/OrganisationsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading organisations tab...</div>,
})

const ServersTab = dynamic(() => import("./tabs/ServersTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading servers tab...</div>,
})

const TicketsTab = dynamic(() => import("./tabs/TicketsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading tickets tab...</div>,
})

const VerificationsTab = dynamic(() => import("./tabs/VerificationsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading verifications tab...</div>,
})

const OutboundEmailsTab = dynamic(() => import("./tabs/OutboundEmailsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading outbound emails...</div>,
})

const DeletionsTab = dynamic(() => import("./tabs/DeletionsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading deletions tab...</div>,
})

const NodesTab = dynamic(() => import("./tabs/NodesTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading nodes tab...</div>,
})

const TunnelsTab = dynamic(() => import("./tabs/TunnelsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading tunnels tab...</div>,
})

const EggsTab = dynamic(() => import("./tabs/EggsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading eggs tab...</div>,
})

const AiTab = dynamic(() => import("./tabs/AiTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading AI tab...</div>,
})

const AnnouncementsTab = dynamic(() => import("./tabs/AnnouncementsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading announcements tab...</div>,
})

const FraudTab = dynamic(() => import("./tabs/FraudTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading fraud tab...</div>,
})

const AntiAbuseTab = dynamic(() => import("./tabs/AntiAbuseTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading anti-abuse tab...</div>,
})

const RolesTab = dynamic(() => import("./tabs/RolesTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading roles tab...</div>,
})

const LogsTab = dynamic(() => import("./tabs/LogsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading logs tab...</div>,
})

const OauthTab = dynamic(() => import("./tabs/OauthTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading OAuth tab...</div>,
})

const PlansTab = dynamic(() => import("./tabs/PlansTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading plans tab...</div>,
})

const OrdersTab = dynamic(() => import("./tabs/OrdersTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading orders tab...</div>,
})

const SettingsTab = dynamic(() => import("./tabs/SettingsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading settings tab...</div>,
})

const DatabasesTab = dynamic(() => import("./tabs/DatabasesTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading databases tab...</div>,
})

const ExportJobsTab = dynamic(() => import("./tabs/ExportJobsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading export jobs tab...</div>,
})

const ApplicationsTab = dynamic(() => import("./tabs/ApplicationsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading applications tab...</div>,
})

const MetricsTab = dynamic(() => import("./tabs/MetricsTab"), {
  ssr: false,
  loading: () => <div className="text-sm text-muted-foreground p-4">Loading metrics tab...</div>,
})

function EmailPreview({ title, message, details }: { title: string; message: string; details: string }) {
  const style = `.email-preview-root { font-family: Arial, sans-serif; background-color: transparent; color: var(--foreground); margin: 0; padding: 0; }
    .email-preview-root .container { max-width: 600px; margin: 0 auto; padding: 32px; background: var(--card); border-radius: 12px; border: 1px solid var(--border); }
    .email-preview-root .header { text-align: center; margin-bottom: 24px; }
    .email-preview-root .header h1 { color: var(--accent-foreground); font-size: 20px; margin: 0; }
    .email-preview-root .details { font-family: monospace; font-size: 13px; color: var(--card-foreground); background: var(--popover); border-radius: 8px; padding: 12px; border: 1px solid var(--border); margin-top: 12px; white-space: pre-wrap; }
    .email-preview-root .footer { font-size: 12px; color: var(--muted-foreground); margin-top: 24px; text-align: center; }
    .email-preview-root .message { word-wrap: break-word; }
    .email-preview-root p { line-height: 1.6; color: var(--foreground); margin: 0 0 1em 0; }
    .email-preview-root code { background: var(--input); padding: .2em .3em; border-radius: .25rem; }
    .email-preview-root pre { background: var(--input); border-radius: .5rem; overflow-x: auto; padding: .8rem; }
    .email-preview-root a { color: var(--primary); text-decoration: underline; }`;

  return (
    <div className="email-preview-root">
      <style>{style}</style>
      <div className="container">
        <div className="header">
          <h1>{title}</h1>
          <div className="text-xs text-muted-foreground">From: Eclipse Systems</div>
        </div>
        <div className="message text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message || ""}</ReactMarkdown>
        </div>
        <div className="details">{details || ""}</div>
        <div className="footer">© 2026 EclipseSystems under Misiu LLC. All rights reserved.</div>
      </div>
    </div>
  );
}

function formatDurationMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "N/A";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    const remSeconds = Math.floor(seconds % 60);
    return remSeconds > 0 ? `${totalMinutes}m ${remSeconds}s` : `${totalMinutes}m`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const remMinutes = totalMinutes % 60;
    return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number
  totalNodes: number
  totalOrganisations: number
  totalServers: number
  pendingTickets: number
  pendingVerifications: number
  pendingDeletions: number
  avgTicketResponseMs?: number | null
  avgTicketResponseSampleCount?: number | null
  avgTicketResponseMsLast30?: number | null
  avgTicketResponseSampleCountLast30?: number | null
  avgTicketResponseMsGlobal?: number | null
  avgTicketResponseSampleCountGlobal?: number | null
}

interface AdminUser {
  id: number
  firstName: string
  lastName: string
  email: string
  avatarUrl?: string
  role?: string
  portalType: string
  emailVerified: boolean
  idVerified: boolean
  suspended: boolean
  supportBanned?: boolean
  passkeyCount: number
  createdAt?: string
  studentVerified?: boolean
  demoUsed?: boolean
  settings?: Record<string, any>
  dateOfBirth?: string | null
  parentId?: number | null
}

interface AdminVerification {
  id: number
  userId: number
  status: string
  idDocumentUrl?: string
  selfieUrl?: string
  user?: { firstName: string; lastName: string; email: string; avatarUrl?: string }
}

interface AdminDeletion {
  id: number
  userId: number
  status: string
  requestedAt: string
  user?: { firstName: string; lastName: string; email: string; avatarUrl?: string }
}

interface AdminTicket {
  id: number
  userId: number
  subject: string
  message: string
  status: string
  priority: string
  aiTouched?: boolean
  adminReply: string | null
  created: string
  lastReply?: string
  department?: string
  assignedTo?: number
  archived?: boolean
  messages?: Array<{ sender: 'user' | 'staff'; message: string; created: string }>
  user?: { firstName: string; lastName: string; email: string }
}

interface AdminNode {
  id: number
  name: string
  url: string
  nodeType: string
  organisation?: { id: number; name: string }
}

interface AdminEgg {
  id: number
  name: string
  description?: string
  author?: string
  dockerImage: string
  dockerImages?: Record<string, string>
  startup: string
  envVars?: Record<string, any>[]
  configFiles?: Record<string, string>
  processConfig?: Record<string, any>
  installScript?: Record<string, any>
  features?: string[]
  fileDenylist?: string[]
  allowedPortals?: string[]
  updateUrl?: string
  visible: boolean
  rootless?: boolean
  requiresKvm?: boolean
}

interface AdminAIModel {
  id: number
  name: string
  endpoint?: string
  endpoints?: Array<{ id?: number; endpoint?: string; apiKey?: string }>
  apiKey?: string
  tags?: string[]
  config?: {
    type?: string
    status?: string
    description?: string
    maxTokens?: number
  }
  limits?: Record<string, any>
}

interface AdminOrganisation {
  id: number
  name: string
  handle: string
  ownerId: number
  portalTier: string
  avatarUrl?: string
  isStaff?: boolean
  owner?: { firstName: string; lastName: string; email: string; avatarUrl?: string }
  memberCount: number
}

interface AdminServer {
  uuid: string
  name?: string
  description?: string
  status?: string
  owner?: number
  eggId?: number
  nodeName: string
  nodeId: number
  // Wings configuration fields (when present)
  configuration?: {
    meta?: { description?: string }
    invocation?: string
    build?: { memory_limit?: number; disk_space?: number; cpu_limit?: number; swap?: number; io_weight?: number; oom_disabled?: boolean }
    docker?: { image?: string }
    autoSyncOnEggChange?: boolean
  }
}

interface AdminPlan {
  id: number
  name: string
  type: string
  price: number
  description?: string
  memory?: number
  disk?: number
  cpu?: number
  serverLimit?: number
  databases?: number
  backups?: number
  emailSendDailyLimit?: number
  emailSendQueueLimit?: number
  portCount?: number
  isDefault?: boolean
  hiddenFromBilling?: boolean
  features?: string[]
}

interface AdminOrder {
  id: number
  userId: number
  description?: string
  planId?: number
  amount: number
  status: string
  notes?: string
  items?: string
  createdAt: string
  expiresAt?: string
}

interface AdminRole {
  id: number
  name: string
  description?: string
  permissions: { id: number; value: string }[]
}

interface HeartbeatPoint {
  timestamp: string
  responseMs: number | null
  status: string // 'ok' | 'timeout' | 'error'
}

// ─── NodeSparkline — pure SVG heartbeat sparkline ─────────────────────────────
function NodeSparkline({ data, compact = true }: { data: HeartbeatPoint[]; compact?: boolean }) {
  const W = 300
  const H = compact ? 38 : 88
  const pts = compact ? data.slice(-120) : data
  const last = pts[pts.length - 1]
  const recent5 = pts.slice(-5)
  const isOffline = !last || last.status !== "ok"
  const isDegraded = !isOffline && recent5.some((p) => p.status !== "ok")
  const statusColor = isOffline ? "#ef4444" : isDegraded ? "#eab308" : "#22c55e"
  const statusText = isOffline ? "Offline" : isDegraded ? "Degraded" : "Online"
  const statusTextClass = isOffline ? "text-red-400" : isDegraded ? "text-yellow-400" : "text-green-400"
  const validMs = pts.filter((p) => p.responseMs != null).map((p) => p.responseMs!)
  const maxMs = Math.max(...validMs, 100)
  let path = ""
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (p.responseMs == null) continue
    const x = pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W
    const y = H - (p.responseMs / maxMs) * (H - 8) - 4
    const prevOk = i > 0 && pts[i - 1].responseMs != null
    path += prevOk ? `L${x.toFixed(1)},${y.toFixed(1)} ` : `M${x.toFixed(1)},${y.toFixed(1)} `
  }
  const uptimePct =
    pts.length > 0
      ? Math.round((pts.filter((p) => p.status === "ok").length / pts.length) * 1000) / 10
      : 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className={`text-xs font-medium ${statusTextClass}`}>{statusText}</span>
          {last?.responseMs != null && (
            <span className="text-xs text-muted-foreground">{last.responseMs}ms</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{uptimePct}% up</span>
      </div>
      {pts.length > 0 ? (
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="rounded overflow-hidden block"
        >
          <rect width={W} height={H} rx="2" fill="rgba(10,15,30,0.7)" />
          {pts.map((p, i) => {
            if (p.status === "ok") return null
            const x = pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W
            return (
              <rect
                key={i}
                x={Math.max(0, x - 1.5)}
                y={0}
                width={3}
                height={H}
                fill={
                  p.status === "timeout"
                    ? "rgba(234,179,8,0.4)"
                    : "rgba(239,68,68,0.45)"
                }
              />
            )
          })}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={statusColor}
              strokeWidth={compact ? "1.5" : "2"}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {last?.responseMs != null &&
            (() => {
              const i = pts.length - 1
              const x = pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W
              const y = H - (last.responseMs / maxMs) * (H - 8) - 4
              return <circle cx={x} cy={y} r="3" fill={statusColor} />
            })()}
        </svg>
      ) : (
        <div
          className="rounded flex items-center justify-center bg-secondary/30"
          style={{ height: H }}
        >
          <span className="text-xs text-muted-foreground">Collecting data…</span>
        </div>
      )}
    </div>
  )
}

function redactText(value?: string | number | null, privateMode = true) {
  if (!value && value !== 0) return <span className="text-muted-foreground">██████</span>
  if (!privateMode) return <>{value}</>
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">
      ██████
    </span>
  )
}

function redactNameGlobal(firstName?: string, lastName?: string, privateMode = true) {
  if (privateMode) return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">████████</span>
  )
  const parts = [firstName, lastName].filter(Boolean).join(" ")
  return parts || <span className="text-muted-foreground">—</span>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLES = ["user", "admin", "rootAdmin", "*"]
const TIERS = ["free", "paid", "educational", "enterprise"]
const BADGE_PRESETS = ["Bug Hunter", "Staff", "Ex Staff", "Contributor", "Loyal Customer", "Early Adopter", "Beta Tester"]

const priorityColor: Record<string, string> = {
  low: "border-border bg-secondary/50 text-muted-foreground",
  medium: "border-primary/30 bg-primary/10 text-primary",
  high: "border-warning/30 bg-warning/10 text-warning",
  urgent: "border-destructive/30 bg-destructive/10 text-destructive",
}

const ticketStatusColor: Record<string, string> = {
  opened: "border-primary/30 bg-primary/10 text-primary",
  awaiting_staff_reply: "border-warning/30 bg-warning/10 text-warning",
  replied: "border-info/30 bg-info/10 text-info",
  closed: "border-border bg-secondary/50 text-muted-foreground",
}

// ─── Database Hosts Panel ─────────────────────────────────────────────────────

function DatabaseHostsPanel({ privateMode }: { privateMode: boolean }) {
  const tDb = useTranslations("adminDatabaseHostsPanel")
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editHost, setEditHost] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const emptyForm = { name: "", host: "", port: "3306", username: "", password: "", nodeId: "", maxDatabases: "0" }
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/database-hosts")
      setHosts(Array.isArray(data) ? data : [])
    } catch {
      setHosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm(emptyForm)
    setFormError("")
    setEditHost(null)
    setShowForm(true)
  }

  const openEdit = (h: any) => {
    setForm({
      name: h.name,
      host: h.host,
      port: String(h.port),
      username: h.username,
      password: "",
      nodeId: h.nodeId ? String(h.nodeId) : "",
      maxDatabases: String(h.maxDatabases ?? 0),
    })
    setFormError("")
    setEditHost(h)
    setShowForm(true)
  }

  const submitForm = async () => {
    setSaving(true)
    setFormError("")
    const body: any = {
      name: form.name,
      host: form.host,
      port: Number(form.port) || 3306,
      username: form.username,
      maxDatabases: Number(form.maxDatabases) || 0,
    }
    if (form.nodeId) body.nodeId = Number(form.nodeId)
    if (form.password && form.password !== "***") body.password = form.password

    try {
      if (editHost) {
        const updated = await apiFetch(`/api/admin/database-hosts/${editHost.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
        setHosts(prev => prev.map(h => h.id === editHost.id ? updated : h))
      } else {
        if (!form.password) { setFormError(tDb("errors.passwordRequired")); setSaving(false); return }
        body.password = form.password
        const created = await apiFetch("/api/admin/database-hosts", {
          method: "POST",
          body: JSON.stringify(body),
        })
        setHosts(prev => [...prev, created])
      }
      setShowForm(false)
    } catch (e: any) {
      setFormError(e?.message || tDb("errors.failedToSave"))
    } finally {
      setSaving(false)
    }
  }

  const testConn = async (id: number) => {
    setTestingId(id)
    try {
      const data = await apiFetch(`/api/admin/database-hosts/${id}/test`, { method: "POST" })
      setTestResults(prev => ({ ...prev, [id]: { ok: true, msg: data.message || tDb("states.connectionSuccessful") } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: e?.message || tDb("states.connectionFailed") } }))
    } finally {
      setTestingId(null)
    }
  }

  const deleteHost = async (id: number) => {
    try {
      await apiFetch(`/api/admin/database-hosts/${id}`, { method: "DELETE" })
      setHosts(prev => prev.filter(h => h.id !== id))
      setDeleteConfirm(null)
    } catch (e: any) {
      alert(e?.message || tDb("errors.failedToDelete"))
    }
  }

  if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tDb("states.loading")}</div>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">{tDb("header.title")}</p>
            <Badge variant="outline" className="text-xs">{hosts.length}</Badge>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {tDb("actions.addHost")}
          </Button>
        </div>

        {showForm && (
          <div className="border-b border-border p-4 bg-secondary/10">
            <p className="text-sm font-medium mb-3">{editHost ? tDb("form.editTitle") : tDb("form.newTitle")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.name")}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={tDb("form.placeholders.name")}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.host")}</label>
                <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder={tDb("form.placeholders.host")}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.port")}</label>
                <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.username")}</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder={tDb("form.placeholders.username")}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{editHost ? tDb("form.fields.passwordKeep") : tDb("form.fields.password")}</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.linkedNodeId")}</label>
                <input type="number" value={form.nodeId} onChange={e => setForm(f => ({ ...f, nodeId: e.target.value }))}
                  placeholder={tDb("form.placeholders.linkedNodeId")}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{tDb("form.fields.maxDatabases")}</label>
                <input type="number" min="0" value={form.maxDatabases} onChange={e => setForm(f => ({ ...f, maxDatabases: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
            </div>
            {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={submitForm} disabled={saving}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{tDb("actions.saving")}</> : (editHost ? tDb("actions.saveChanges") : tDb("actions.createHost"))}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{tDb("actions.cancel")}</Button>
            </div>
          </div>
        )}

        {hosts.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground p-4">{tDb("states.emptyHosts")}</p>
        ) : (
          <div className="divide-y divide-border">
            {hosts.map(h => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {redactText(h.host, privateMode)}:{redactText(h.port, privateMode)} · {tDb("row.userPrefix")} {redactText(h.username, privateMode)}
                    {h.nodeId ? <> · {tDb("row.nodePrefix")} #{redactText(h.nodeId, privateMode)}</> : <> · {tDb("row.allNodes")}</>}
                    {h.maxDatabases > 0 ? <> · {tDb("row.limitPrefix")} {h.maxDatabases}</> : <> · {tDb("row.unlimited")}</>}
                  </p>
                  {testResults[h.id] && (
                    <p className={`text-xs mt-0.5 ${testResults[h.id].ok ? "text-green-400" : "text-red-400"}`}>
                      {testResults[h.id].msg}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => testConn(h.id)} disabled={testingId === h.id}>
                    {testingId === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tDb("actions.test")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(h)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {deleteConfirm === h.id ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={() => deleteHost(h.id)}>{tDb("actions.confirm")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>{tDb("actions.cancel")}</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(h.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPanel() {
  const t = useTranslations("adminPage")
  const router = useRouter()
  const { user, isLoading } = useAuth()

  const isAdmin = !!user && (user.role === "*" || user.role === "rootAdmin" || user.role === "admin")

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace("/login")
      return
    }
    if (!isAdmin) {
      router.replace("/dashboard")
    }
  }, [user, isAdmin, isLoading, router])

  if (isLoading || !user || !isAdmin) {
    return null
  }

  // ── Stats state ──
  const [stats, setStats] = useState<AdminStats | null>(null)

  // ── Per-tab data ──
  const [users, setUsers] = useState<AdminUser[]>([])
  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [verifications, setVerifications] = useState<AdminVerification[]>([])
  const [deletions, setDeletions] = useState<AdminDeletion[]>([])
  const [nodes, setNodes] = useState<AdminNode[]>([])
  const [organisations, setOrganisations] = useState<AdminOrganisation[]>([])
  const [servers, setServers] = useState<AdminServer[]>([])
  const [eggs, setEggs] = useState<AdminEgg[]>([])

  // ── Loading flags ──
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("users")

  // ── Filters ──
  const [userSearch, setUserSearch] = useState("")
  const [userSearchFocused, setUserSearchFocused] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")
  const [globalResults, setGlobalResults] = useState<{ users: any[]; organisations: any[]; servers: any[]; orders: any[] }>({ users: [], organisations: [], servers: [], orders: [] })
  const [globalLoading, setGlobalLoading] = useState(false)
  const [ticketFilter, setTicketFilter] = useState<string>("all")
  const [orgSearch, setOrgSearch] = useState("")
  const [serverSearch, setServerSearch] = useState("")
  const [verificationFilter, setVerificationFilter] = useState<string>("")
  const [deletionFilter, setDeletionFilter] = useState<string>("")
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([])
  const [exportJobs, setExportJobs] = useState<Record<string, any>>({})
  const [exportJobsMeta, setExportJobsMeta] = useState<any>(null)
  const [userExportJobId, setUserExportJobId] = useState<Record<number, string>>({})
  const [exportJobsLoading, setExportJobsLoading] = useState(false)
  const [exportShareLoading, setExportShareLoading] = useState<Record<string, boolean>>({})
  const [exportShareLinks, setExportShareLinks] = useState<Record<string, string>>({})

  const exportJobRows = Object.values(exportJobs).sort((a: any, b: any) => {
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })

  // ── Dialogs ──
  const [replyTicket, setReplyTicket] = useState<AdminTicket | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replyStatus, setReplyStatus] = useState("closed")
  const [replyPriority, setReplyPriority] = useState("medium")
  const [replyDepartment, setReplyDepartment] = useState("")
  const [replyAssignedTo, setReplyAssignedTo] = useState("")
  const [replyAs, setReplyAs] = useState<'staff' | 'user'>('staff')
  const [replyLoading, setReplyLoading] = useState(false)
  const [staffUsers, setStaffUsers] = useState<AdminUser[]>([])
  const [staffLoading, setStaffLoading] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string | null>(null)
  const openPreview = async (url: string | undefined, title?: string) => {
    if (!url) return
    setPreviewTitle(title ?? "")
    setPreviewOpen(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (token) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) {
          setPreviewUrl(null)
          return
        }
        const blob = await res.blob()
        const obj = URL.createObjectURL(blob)
        setPreviewBlobUrl(obj)
        setPreviewUrl(obj)
        return
      }
      setPreviewUrl(url)
    } catch (err) {
      setPreviewUrl(null)
    }
  }

  // ── Confirmation dialog helper (replaces window.confirm)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState<string>("")

  const [privateMode, setPrivateMode] = useState(true)
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(true)
  const [pendingViewUserDialog, setPendingViewUserDialog] = useState<AdminUser | null>(null)
  const [pendingViewServerDialog, setPendingViewServerDialog] = useState<AdminServer | null>(null)
  const [viewUserQueryHandled, setViewUserQueryHandled] = useState(false)
  const [viewServerQueryHandled, setViewServerQueryHandled] = useState(false)
  const [redactServers, setRedactServers] = useState<boolean>(true)
  const [redactOrganisations, setRedactOrganisations] = useState<boolean>(true)

  const redact = (value?: any) => {
    if (value === undefined || value === null || value === "" || (typeof value === "object" && Object.keys(value).length === 0)) {
      return <span className="text-muted-foreground">████████████</span>
    }
    if (!privateMode) {
      if (typeof value === "object") {
        return <>{JSON.stringify(value)}</>
      }
      return <>{value}</>
    }
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">
        ████████████
      </span>
    )
  }

  const redactName = (firstName?: string, lastName?: string) => {
    if (privateMode) return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">████████</span>
    )
    const parts = [firstName, lastName].filter(Boolean).join(" ")
    return parts || <span className="text-muted-foreground">████████████</span>
  }

  const redactOrg = (value?: string | number | null) => {
    if (!value && value !== 0) return <span className="text-muted-foreground">████████████</span>
    if (!privateMode) return <>{value}</>
    if (!redactOrganisations) return <>{value}</>
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">
        ████████████
      </span>
    )
  }

  const redactOrgName = (firstName?: string, lastName?: string) => {
    if (!privateMode) {
      const parts = [firstName, lastName].filter(Boolean).join(" ")
      return parts || <span className="text-muted-foreground">████████████</span>
    }
    if (redactOrganisations) return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-black text-black text-[0.62rem] tracking-widest select-none">████████</span>
    )
    const parts = [firstName, lastName].filter(Boolean).join(" ")
    return parts || <span className="text-muted-foreground">████████████</span>
  }
  const [confirmTitle, setConfirmTitle] = useState<string>("Confirm Action")
  const [confirmLoading, setConfirmLoading] = useState(false)
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null)

  function confirmAsync(message: string, title?: string): Promise<boolean> {
    setConfirmTitle(title || "Confirm Action")
    setConfirmMessage(message)
    setConfirmOpen(true)
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
    })
  }

  const handleConfirmOk = async () => {
    setConfirmOpen(false)
    setConfirmLoading(false)
    if (confirmResolveRef.current) confirmResolveRef.current(true)
    confirmResolveRef.current = null
  }

  const handleConfirmCancel = () => {
    setConfirmOpen(false)
    setConfirmLoading(false)
    if (confirmResolveRef.current) confirmResolveRef.current(false)
    confirmResolveRef.current = null
  }

  const [editUserDialog, setEditUserDialog] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState("")
  const [editTier, setEditTier] = useState("")
  const [editLoading, setEditLoading] = useState(false)
  const [editServerLimit, setEditServerLimit] = useState("")
  const [editCpuLimit, setEditCpuLimit] = useState("")
  const [editMemoryLimit, setEditMemoryLimit] = useState("")
  const [editDiskLimit, setEditDiskLimit] = useState("")
  const [editDatabaseLimit, setEditDatabaseLimit] = useState("")
  const [editBackupLimit, setEditBackupLimit] = useState("")
  const [editDateOfBirth, setEditDateOfBirth] = useState("")
  const [editParentId, setEditParentId] = useState("")
  const [editBadgesText, setEditBadgesText] = useState("")

  const parseBadgeText = (value: string): string[] =>
    Array.from(
      new Set(
        value
          .split(/[\n,]/g)
          .map((badge) => badge.trim())
          .filter(Boolean)
      )
    )

  const toggleBadgePreset = (badge: string) => {
    const current = parseBadgeText(editBadgesText)
    const hasBadge = current.some((b) => b.toLowerCase() === badge.toLowerCase())
    const next = hasBadge
      ? current.filter((b) => b.toLowerCase() !== badge.toLowerCase())
      : [...current, badge]
    setEditBadgesText(next.join(", "))
  }

  // ── Organisation edit dialog ──
  const [editOrgDialog, setEditOrgDialog] = useState<AdminOrganisation | null>(null)
  const [editOrgName, setEditOrgName] = useState("")
  const [editOrgHandle, setEditOrgHandle] = useState("")
  const [editOrgTier, setEditOrgTier] = useState("")
  const [editOrgOwnerId, setEditOrgOwnerId] = useState("")
  const [editOrgIsStaff, setEditOrgIsStaff] = useState(false)
  const [editOrgAddMemberId, setEditOrgAddMemberId] = useState("")
  const [editOrgAddMemberRole, setEditOrgAddMemberRole] = useState("member")
  const [editOrgMemberLoading, setEditOrgMemberLoading] = useState(false)
  const [editOrgLoading, setEditOrgLoading] = useState(false)

  // ── Node classification edit dialog ──
  const [editNodeDialog, setEditNodeDialog] = useState<AdminNode | null>(null)
  const [editNodeType, setEditNodeType] = useState("free")
  const [editNodePortStart, setEditNodePortStart] = useState("")
  const [editNodePortEnd, setEditNodePortEnd] = useState("")
  const [editNodeDefaultIp, setEditNodeDefaultIp] = useState("")
  const [editNodeLoading, setEditNodeLoading] = useState(false)

  // ── Plans state ──
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planEditTarget, setPlanEditTarget] = useState<AdminPlan | null>(null)
  const [planName, setPlanName] = useState("")
  const [planType, setPlanType] = useState("free")
  const [planPrice, setPlanPrice] = useState("0")
  const [planDesc, setPlanDesc] = useState("")
  const [planMemory, setPlanMemory] = useState("")
  const [planDisk, setPlanDisk] = useState("")
  const [planCpu, setPlanCpu] = useState("")
  const [planServerLimit, setPlanServerLimit] = useState("")
  const [planDatabases, setPlanDatabases] = useState("")
  const [planBackups, setPlanBackups] = useState("")
  const [planEmailSendDailyLimit, setPlanEmailSendDailyLimit] = useState("")
  const [planEmailSendQueueLimit, setPlanEmailSendQueueLimit] = useState("")
  const [planPortCount, setPlanPortCount] = useState("1")
  const [planIsDefault, setPlanIsDefault] = useState(false)
  const [planHiddenFromBilling, setPlanHiddenFromBilling] = useState(false)
  const [planFeatures, setPlanFeatures] = useState("")
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState("")
  const [planReapplyId, setPlanReapplyId] = useState<number | null>(null)
  const [planReapplyLoading, setPlanReapplyLoading] = useState(false)
  const [ensureLoading, setEnsureLoading] = useState(false)
  const portalMarkerByTier: Record<string, string> = {
    free: "Free Portal",
    paid: "Paid Portal",
    enterprise: "Enterprise Portal",
  }
  const getPortalMarker = (tier?: string) => {
    if (!tier) return "Free Portal"
    return portalMarkerByTier[String(tier).toLowerCase()] ?? "Free Portal"
  }

  // ── Admin Orders state ──
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([])
  const [ordersPage, setOrdersPage] = useState(1)
  const ORDERS_PER = 50
  const [ordersTotal, setOrdersTotal] = useState<number | null>(null)
  const [ordersQuery, setOrdersQuery] = useState("")
  const [ordersLoading, setOrdersLoading] = useState(false)

  const [issueOrderOpen, setIssueOrderOpen] = useState(false)
  const [ioUserId, setIoUserId] = useState("")
  const [ioDesc, setIoDesc] = useState("")
  const [ioPlanId, setIoPlanId] = useState("")
  const [ioAmount, setIoAmount] = useState("0")
  const [ioNotes, setIoNotes] = useState("")
  const [ioExpiresAt, setIoExpiresAt] = useState("")
  const [ioLoading, setIoLoading] = useState(false)
  const [ioError, setIoError] = useState("")

  // ── Edit / Cancel / Delete Order ──
  const [editOrderOpen, setEditOrderOpen] = useState(false)
  const [editOrderTarget, setEditOrderTarget] = useState<AdminOrder | null>(null)
  const [eoDescription, setEoDescription] = useState("")
  const [eoAmount, setEoAmount] = useState("0")
  const [eoPlanId, setEoPlanId] = useState("")
  const [eoNotes, setEoNotes] = useState("")
  const [eoExpiresAt, setEoExpiresAt] = useState("")
  const [eoStatus, setEoStatus] = useState("")
  const [eoLoading, setEoLoading] = useState(false)
  const [eoError, setEoError] = useState("")

  // ── User current plan ──
  const [userCurrentPlan, setUserCurrentPlan] = useState<{ plan: any; order: any } | null>(null)
  const [userPlanLoading, setUserPlanLoading] = useState(false)
  const [cancelPlanLoading, setCancelPlanLoading] = useState(false)

  // ── Apply Plan to user ──
  const [applyPlanOpen, setApplyPlanOpen] = useState(false)
  const [applyPlanUserId, setApplyPlanUserId] = useState<number | null>(null)
  const [applyPlanId, setApplyPlanId] = useState("")
  const [applyPlanNotes, setApplyPlanNotes] = useState("")
  const [applyPlanExpiry, setApplyPlanExpiry] = useState("")
  const [applyPlanLoading, setApplyPlanLoading] = useState(false)
  const [applyPlanError, setApplyPlanError] = useState("")
  const [applyPlanOrgId, setApplyPlanOrgId] = useState("")

  // ── Add Node dialog ──
  type AddNodeStep = "form" | "config" | "done"
  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [addNodeStep, setAddNodeStep] = useState<AddNodeStep>("form")
  const [addNodeName, setAddNodeName] = useState("")
  const [addNodeFqdn, setAddNodeFqdn] = useState("")
  const [addNodePort, setAddNodePort] = useState("8080")
  const [addNodeSsl, setAddNodeSsl] = useState(true)
  const [addNodeDataPath, setAddNodeDataPath] = useState("/var/lib/eclipanel/volumes")
  const [addNodeSftpPort, setAddNodeSftpPort] = useState("2022")
  const [addNodeType, setAddNodeType] = useState("free")
  const [addNodeToken, setAddNodeToken] = useState("")
  const [addNodeTokenLoading, setAddNodeTokenLoading] = useState(false)
  const [addNodeLoading, setAddNodeLoading] = useState(false)
  const [addNodeCreated, setAddNodeCreated] = useState<AdminNode | null>(null)

  // ── AI Model state ──
  const [aiModels, setAiModels] = useState<AdminAIModel[]>([])
  const [aiModelDialog, setAiModelDialog] = useState<AdminAIModel | null | "new">(null)
  const [aiModelName, setAiModelName] = useState("")
  const [aiModelEndpoint, setAiModelEndpoint] = useState("")
  const [aiModelExtraEndpoints, setAiModelExtraEndpoints] = useState<Array<{ id?: string; endpoint: string; apiKey?: string }>>([])
  const [aiModelApiKey, setAiModelApiKey] = useState("")
  const [aiModelType, setAiModelType] = useState("text")
  const [aiModelStatus, setAiModelStatus] = useState("active")
  const [aiModelDescription, setAiModelDescription] = useState("")

  // ── Admin Users/Servers/Orgs/Tickets pagination state ──
  const [usersPage, setUsersPage] = useState(1)
  const USERS_PER = 50
  const [usersTotal, setUsersTotal] = useState<number | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)

  const [organisationsPage, setOrganisationsPage] = useState(1)
  const ORGS_PER = 50
  const [organisationsTotal, setOrganisationsTotal] = useState<number | null>(null)
  const [organisationsLoading, setOrganisationsLoading] = useState(false)

  const [serversPage, setServersPage] = useState(1)
  const SERVERS_PER = 50
  const [serversTotal, setServersTotal] = useState<number | null>(null)
  const [serversLoading, setServersLoading] = useState(false)

  const [ticketsPage, setTicketsPage] = useState(1)
  const TICKETS_PER = 50
  const [ticketsTotal, setTicketsTotal] = useState<number | null>(null)
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketSearch, setTicketSearch] = useState("")
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState("any")
  const [showAiTouched, setShowAiTouched] = useState(false)
  const [aiModelMaxTokens, setAiModelMaxTokens] = useState("")
  const [aiModelTags, setAiModelTags] = useState("")
  const [aiModelLoading, setAiModelLoading] = useState(false)
  const [aiModelCooldowns, setAiModelCooldowns] = useState<any[]>([])

  // ── Assign AI model to user ──
  const [assignAiModel, setAssignAiModel] = useState<AdminAIModel | null>(null)
  const [assignAiUserId, setAssignAiUserId] = useState("")
  const [assignAiLimitTokens, setAssignAiLimitTokens] = useState("")
  const [assignAiLimitRequests, setAssignAiLimitRequests] = useState("")
  const [assignAiLoading, setAssignAiLoading] = useState(false)
  const [assignAiUsersLoading, setAssignAiUsersLoading] = useState(false)

  // ── View user profile ──
  const [viewUserDialog, setViewUserDialog] = useState<AdminUser | null>(null)
  const [viewUserProfile, setViewUserProfile] = useState<any | null>(null)
  const [viewUserLoading, setViewUserLoading] = useState(false)
  const [viewUserRoles, setViewUserRoles] = useState<any[]>([])
  const [viewUserAssignRoleId, setViewUserAssignRoleId] = useState("")
  const [viewUserRoleLoading, setViewUserRoleLoading] = useState(false)

  // ── Roles ──
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [roleDialog, setRoleDialog] = useState(false)
  const [roleName, setRoleName] = useState("")
  const [roleDesc, setRoleDesc] = useState("")
  const [roleLoading, setRoleLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<AdminRole | null>(null)
  const [newPermValue, setNewPermValue] = useState("")
  const [permLoading, setPermLoading] = useState(false)

  // ── Logs ──
  const [logs, setLogs] = useState<any[]>([])
  const [logType, setLogType] = useState<"audit" | "requests" | "slow" | "serverErrors">("audit")
  const [logsPage, setLogsPage] = useState(1)
  const LOGS_PER = 50
  const [logsPer, setLogsPer] = useState(LOGS_PER)
  const [logsTotal, setLogsTotal] = useState<number | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsUserFilter, setLogsUserFilter] = useState("")

  async function fetchLogs(page = 1, type: string = 'audit', userId = "") {
    setLogsLoading(true)
    try {
      if (type === 'slow') {
        const res = await apiFetch(API_ENDPOINTS.adminSlowQueries)
        setLogs(Array.isArray(res) ? res : [])
        setLogsTotal(null)
        setLogsPage(1)
        return
      }
      const url = `${API_ENDPOINTS.adminLogs}?type=${encodeURIComponent(type)}&page=${page}&per=${logsPer}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`
      const res: any = await apiFetch(url)
      if (res) {
        if (Array.isArray(res)) {
          setLogs(res)
          setLogsTotal(null)
          setLogsPage(1)
        } else {
          setLogs(Array.isArray(res.logs) ? res.logs : [])
          setLogsTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.logs) ? res.logs.length : 0))
          setLogsPage(typeof res.page === 'number' ? res.page : page)
        }
      } else {
        setLogs([])
        setLogsTotal(0)
        setLogsPage(page)
      }
    } catch (e) {
      setLogs([])
      setLogsTotal(0)
    } finally {
      setLogsLoading(false)
    }
  }

  async function deleteLog(logId: number) {
    if (!(await confirmAsync('Delete this log entry? This cannot be undone.'))) return;
    try {
      await apiFetch(`${API_ENDPOINTS.adminLogs}/${logId}`, { method: 'DELETE' });
      setLogs((prev) => prev.filter((log) => log.id !== logId));
      setLogsTotal((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    } catch (err: any) {
      alert('Failed to delete log: ' + (err?.message || 'unknown error'));
    }
  }

  // ── Egg dialog ──
  const [eggDialog, setEggDialog] = useState<AdminEgg | null | "new">(null)
  const [eggTab, setEggTab] = useState<"basic" | "variables" | "config" | "advanced">("basic")
  const [eggName, setEggName] = useState("")
  const [eggDesc, setEggDesc] = useState("")
  const [eggAuthor, setEggAuthor] = useState("")
  const [eggUpdateUrl, setEggUpdateUrl] = useState("")
  const [eggImage, setEggImage] = useState("")
  const [eggDockerImagesRaw, setEggDockerImagesRaw] = useState("") // JSON object text
  const [eggStartup, setEggStartup] = useState("")
  const [eggEnvVars, setEggEnvVars] = useState("")
  const [eggEnvVarDefs, setEggEnvVarDefs] = useState<Record<string, any>[]>([])
  const [eggVisible, setEggVisible] = useState(true)
  const [eggFeatures, setEggFeatures] = useState("") // comma-separated
  const [eggFileDenylist, setEggFileDenylist] = useState("") // one per line
  const [eggAllowedPortals, setEggAllowedPortals] = useState<string[]>([])
  const [eggProcessStop, setEggProcessStop] = useState("stop") // stop command value
  const [eggProcessDone, setEggProcessDone] = useState("") // done patterns, one per line
  const [eggInstallContainer, setEggInstallContainer] = useState("")
  const [eggInstallEntrypoint, setEggInstallEntrypoint] = useState("bash")
  const [eggInstallScript, setEggInstallScript] = useState("")
  const [eggRootless, setEggRootless] = useState(false)
  const [eggRequiresKvm, setEggRequiresKvm] = useState(false)
  const [eggLoading, setEggLoading] = useState(false)
  const [syncingEggIds, setSyncingEggIds] = useState<number[]>([])

  // ── Import Egg dialog ──
  const [importEggOpen, setImportEggOpen] = useState(false)
  const [importEggMode, setImportEggMode] = useState<"paste" | "url">("paste")
  const [importEggJson, setImportEggJson] = useState("")
  const [importEggUrl, setImportEggUrl] = useState("")
  const [importEggLoading, setImportEggLoading] = useState(false)
  const [importEggError, setImportEggError] = useState("")
  const [importEggPreview, setImportEggPreview] = useState<AdminEgg | null>(null)

  // ── Edit Server dialog ──
  const [editServerDialog, setEditServerDialog] = useState<AdminServer | null>(null)
  const [esName, setEsName] = useState("")
  const [esDesc, setEsDesc] = useState("")
  const [esUserId, setEsUserId] = useState("")
  const [esMemory, setEsMemory] = useState("")
  const [esDisk, setEsDisk] = useState("")
  const [esCpu, setEsCpu] = useState("")
  const [esSwap, setEsSwap] = useState("")
  const [esDockerImage, setEsDockerImage] = useState("")
  const [esStartup, setEsStartup] = useState("")
  const [esEnvironment, setEsEnvironment] = useState<Record<string, string>>({})
  const [esEnvVarDefs, setEsEnvVarDefs] = useState<any[]>([])
  const [esExtraEnvRows, setEsExtraEnvRows] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [esEnvModified, setEsEnvModified] = useState(false)
  const [esLoading, setEsLoading] = useState(false)
  const [esError, setEsError] = useState("")
  const [esAllocations, setEsAllocations] = useState<{ ip: string; port: number; is_default: boolean; fqdn?: string }[]>([])
  const [esAllocIp, setEsAllocIp] = useState("0.0.0.0")
  const [esAllocPort, setEsAllocPort] = useState("")
  const [esAllocFqdn, setEsAllocFqdn] = useState("")
  const [esEditFqdnIdx, setEsEditFqdnIdx] = useState<number | null>(null)
  const [esEditFqdnVal, setEsEditFqdnVal] = useState("")
  const [esEggId, setEsEggId] = useState<string | undefined>(undefined)
  const [esReinstalling, setEsReinstalling] = useState(false)
  const [esAutoSyncOnEggChange, setEsAutoSyncOnEggChange] = useState<boolean>(true)

  // ── Create Server dialog ──
  const [createServerOpen, setCreateServerOpen] = useState(false)
  const [csNodeId, setCsNodeId] = useState("")
  const [csUserId, setCsUserId] = useState("")
  const [csEggId, setCsEggId] = useState<string | undefined>(undefined)
  const [csName, setCsName] = useState("")
  const [csMemory, setCsMemory] = useState("1024")
  const [csDisk, setCsDisk] = useState("10240")
  const [csCpu, setCsCpu] = useState("100")
  const [csKvmPassthroughEnabled, setCsKvmPassthroughEnabled] = useState(false)
  const [csLoading, setCsLoading] = useState(false)
  const [csError, setCsError] = useState("")

  // ── Sync from Wings ──
  const [syncingFromWings, setSyncingFromWings] = useState(false)
  // ── Sync to Wings (push panel configs) ──
  const [syncingToWings, setSyncingToWings] = useState(false)

  // ── View Node Config dialog ──
  const [viewConfigNode, setViewConfigNode] = useState<AdminNode | null>(null)
  const [viewConfigToken, setViewConfigToken] = useState("")
  const [viewConfigLoading, setViewConfigLoading] = useState(false)

  // ── Fraud alerts ──
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([])
  const [oauthApps, setOauthApps] = useState<any[]>([])
  const [fraudScanning, setFraudScanning] = useState(false)
  const [fraudScanningAll, setFraudScanningAll] = useState(false)
  const [selectedFraudIds, setSelectedFraudIds] = useState<number[]>([])
  const [hideSuspendedFraud, setHideSuspendedFraud] = useState<boolean>(true)
  const [selectAllFraud, setSelectAllFraud] = useState<boolean>(false)
  const [bulkDismissing, setBulkDismissing] = useState<boolean>(false)

  // ── Panel settings ──
  const [panelSettings, setPanelSettings] = useState<{
    registrationEnabled: boolean
    registrationNotice: string
    codeInstancesEnabled: boolean
    geoBlockCountries: string
    billingCurrency: string
    billingTaxRules: string
    gamblingEnabled: boolean
    gamblingResourceLuckyChance: number
    gamblingPowerDenyChance: number
    featureToggles: Record<string, boolean>
  }>({
    registrationEnabled: true,
    registrationNotice: "",
    codeInstancesEnabled: true,
    geoBlockCountries: "",
    billingCurrency: "USD",
    billingTaxRules: "",
    gamblingEnabled: true,
    gamblingResourceLuckyChance: 0.0777,
    gamblingPowerDenyChance: 0.5,
    featureToggles: {
      registration: true,
      codeInstances: true,
      gambling: true,
      billing: true,
      ai: true,
      dns: true,
      ticketing: true,
      applications: true,
      oauth: true,
      tunnels: true,
    },
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [geoBlockMetrics, setGeoBlockMetrics] = useState<any | null>(null)
  const [geoBlockMetricsLoading, setGeoBlockMetricsLoading] = useState(false)
  const [geoBlockMetricsError, setGeoBlockMetricsError] = useState("")

  // ── Announcements / Product updates ──
  const [annSubject, setAnnSubject] = useState("")
  const [annMessage, setAnnMessage] = useState("")
  const [annPreview, setAnnPreview] = useState(false)
  const [annForce, setAnnForce] = useState(false)
  const [annSending, setAnnSending] = useState(false)

  // ── OAuth app management ─────────────────────────────────────────────────
  const [oauthCreateOpen, setOauthCreateOpen] = useState(false)
  const [oauthCreateName, setOauthCreateName] = useState("")
  const [oauthCreateDesc, setOauthCreateDesc] = useState("")
  const [oauthCreateRedirects, setOauthCreateRedirects] = useState<string[]>([""])
  const [oauthCreateScopes, setOauthCreateScopes] = useState<string[]>(["profile", "email"])
  const [oauthCreateGrants, setOauthCreateGrants] = useState<string[]>(["authorization_code", "refresh_token"])
  const [oauthCreateLoading, setOauthCreateLoading] = useState(false)
  const [oauthNewSecret, setOauthNewSecret] = useState<{ name: string; clientId: string; clientSecret: string } | null>(null)
  const [oauthEditApp, setOauthEditApp] = useState<any | null>(null)
  const [oauthEditRedirects, setOauthEditRedirects] = useState<string[]>([""])
  const [oauthEditScopes, setOauthEditScopes] = useState<string[]>([])
  const [oauthEditGrants, setOauthEditGrants] = useState<string[]>([])
  const [oauthEditLoading, setOauthEditLoading] = useState(false)
  const [oauthRotateApp, setOauthRotateApp] = useState<any | null>(null)
  const [oauthRotateLoading, setOauthRotateLoading] = useState(false)

  // ── Node heartbeats ──────────────────────────────────────────────────────────
  const [nodeHeartbeats, setNodeHeartbeats] = useState<Record<number, HeartbeatPoint[]>>({})
  const [heartbeatDialogNode, setHeartbeatDialogNode] = useState<AdminNode | null>(null)
  const [heartbeatDialogData, setHeartbeatDialogData] = useState<{ points: HeartbeatPoint[]; summary: any } | null>(null)
  const [heartbeatDialogLoading, setHeartbeatDialogLoading] = useState(false)
  const [heartbeatDialogWindow, setHeartbeatDialogWindow] = useState<"24h" | "7d">("24h")

  // Fetch history whenever dialog opens or window toggles
  useEffect(() => {
    if (!heartbeatDialogNode) return
    setHeartbeatDialogLoading(true)
    setHeartbeatDialogData(null)
    apiFetch(`${API_ENDPOINTS.nodes}/${heartbeatDialogNode.id}/heartbeats?window=${heartbeatDialogWindow}`)
      .then((d) => setHeartbeatDialogData(d))
      .catch(() => setHeartbeatDialogData(null))
      .finally(() => setHeartbeatDialogLoading(false))
  }, [heartbeatDialogNode, heartbeatDialogWindow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load stats on mount ──
  useEffect(() => {
    apiFetch(API_ENDPOINTS.adminStats)
      .then((d) => setStats(d))
      .catch(() => { })
  }, [])

  // ── Tab loader ──
  const loadTab = useCallback(
    async (tab: string) => {
      if (loadedTabs.has(tab)) return
      setLoadedTabs((prev) => new Set([...prev, tab]))
      try {
        if (tab === "users") {
          await fetchUsers(1, "")
        } else if (tab === "tickets") {
          await fetchTickets(1, "", "")
        } else if (tab === "verifications") {
          const data = await apiFetch(API_ENDPOINTS.adminVerifications)
          setVerifications(data || [])
        } else if (tab === "deletions") {
          const data = await apiFetch(API_ENDPOINTS.adminDeletions)
          setDeletions(data || [])
        } else if (tab === "nodes") {
          const data = await apiFetch(API_ENDPOINTS.adminNodes)
          setNodes(data || [])
          // also load heartbeat summaries for all nodes
          apiFetch(API_ENDPOINTS.nodeHeartbeatsAll)
            .then((hb) => setNodeHeartbeats(hb || {}))
            .catch(() => { })
        } else if (tab === "organisations") {
          await fetchOrganisations(1, "")
        } else if (tab === "servers") {
          await fetchServers(1, "")
        } else if (tab === "eggs") {
          const data = await apiFetch(API_ENDPOINTS.adminEggs)
          setEggs(data || [])
        } else if (tab === "ai") {
          const modelData = await apiFetch(API_ENDPOINTS.adminAiModels)
          setAiModels(modelData || [])
          try {
            const cd = await apiFetch("/api/admin/ai/cooldowns")
            setAiModelCooldowns(cd || [])
          } catch {
            setAiModelCooldowns([])
          }
        } else if (tab === "logs") {
          await fetchLogs(1, logType, "")
        } else if (tab === "fraud") {
          const data = await apiFetch(API_ENDPOINTS.adminFraudAlerts)
          setFraudAlerts(data || [])
          setSelectedFraudIds([])
          setSelectAllFraud(false)
        } else if (tab === "roles") {
          const data = await apiFetch(API_ENDPOINTS.roles)
          setRoles(data || [])
        } else if (tab === "logs") {
          const data = await apiFetch(`${API_ENDPOINTS.adminLogs}?type=audit&limit=200`)
          setLogs(data || [])
        } else if (tab === "oauth") {
          const data = await apiFetch("/api/oauth/apps")
          setOauthApps(Array.isArray(data) ? data : [])
        } else if (tab === "export-jobs") {
          await fetchExportJobs(150, "")
        } else if (tab === "settings") {
          const data = await apiFetch(API_ENDPOINTS.adminSettings)
          if (data) {
            setPanelSettings({
              registrationEnabled: data.registrationEnabled ?? true,
              registrationNotice: data.registrationNotice ?? "",
              codeInstancesEnabled:
                data.codeInstancesEnabled === "false" ? false : Boolean(data.codeInstancesEnabled),
              geoBlockCountries: data.geoBlockCountries ?? "",
              billingCurrency: (data.billingCurrency ?? "USD").toUpperCase(),
              billingTaxRules: data.billingTaxRules ?? "",
              gamblingEnabled: data.gamblingEnabled !== false,
              gamblingResourceLuckyChance:
                typeof data.gamblingResourceLuckyChance === "number" ? data.gamblingResourceLuckyChance : 0.0777,
              gamblingPowerDenyChance:
                typeof data.gamblingPowerDenyChance === "number" ? data.gamblingPowerDenyChance : 0.5,
              featureToggles: {
                registration: true,
                codeInstances: data.codeInstancesEnabled !== false
                  ? (data.featureToggles?.codeInstances ?? true)
                  : false,
                gambling: data.gamblingEnabled !== false,
                billing: true,
                ai: true,
                dns: true,
                ticketing: true,
                applications: true,
                tunnels: true,
                ...(data.featureToggles || {}),
              },
            })
          }

          setGeoBlockMetricsLoading(true)
          setGeoBlockMetricsError("")
          try {
            const m = await apiFetch("/api/admin/geo-block/metrics")
            setGeoBlockMetrics(m)
          } catch (e: any) {
            setGeoBlockMetricsError(e?.message || "Failed to load geo block metrics")
          } finally {
            setGeoBlockMetricsLoading(false)
          }
        } else if (tab === "plans") {
          const data = await apiFetch(API_ENDPOINTS.adminPlans)
          setPlans(Array.isArray(data) ? data : [])
        } else if (tab === "orders") {
          await fetchOrders(1, "")
          if (plans.length === 0) {
            apiFetch(API_ENDPOINTS.adminPlans).then((d: any) => setPlans(Array.isArray(d) ? d : [])).catch(() => { })
          }
        }
      } catch (_e) {
        // skip
      }
    },
    [loadedTabs]
  )

  async function fetchExportJobs(limit = 150, status = "") {
    setExportJobsLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("limit", String(limit))
      if (status) qs.set("status", status)
      const res: any = await apiFetch(`${API_ENDPOINTS.adminExportJobs}?${qs.toString()}`)
      const jobs = Array.isArray(res?.jobs) ? res.jobs : []
      setExportJobsMeta(res?.meta || null)
      setExportJobs(() => {
        const next: Record<string, any> = {}
        for (const job of jobs) {
          if (!job?.id) continue
          next[String(job.id)] = job
        }
        return next
      })
      setUserExportJobId((prev) => {
        const next = { ...prev }
        for (const job of jobs) {
          if (job?.userId != null && job?.id) {
            next[Number(job.userId)] = String(job.id)
          }
        }
        return next
      })
    } catch {
      setExportJobsMeta(null)
      setExportJobs({})
    } finally {
      setExportJobsLoading(false)
    }
  }

  async function startExportJob(targetUser: any) {
    if (!targetUser?.id) return
    try {
      const res: any = await apiFetch(API_ENDPOINTS.adminUserExportJob.replace(":id", String(targetUser.id)), {
        method: "POST",
      })
      const jobId = String(res?.jobId || "")
      if (!jobId) return
      setUserExportJobId((prev) => ({ ...prev, [Number(targetUser.id)]: jobId }))
      setExportJobs((prev) => ({
        ...prev,
        [jobId]: {
          id: jobId,
          userId: targetUser.id,
          status: "queued",
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }))
      void fetchExportJobs(150, "")
    } catch (e: any) {
      alert(e?.message || "Failed to start export job")
    }
  }

  async function createExportShareLink(jobId: string) {
    if (!jobId) return
    setExportShareLoading((prev) => ({ ...prev, [jobId]: true }))
    try {
      const res: any = await apiFetch(API_ENDPOINTS.adminExportJobShareLink.replace(":id", String(jobId)), {
        method: "POST",
        body: JSON.stringify({ expiresHours: 24 }),
      })
      const link = res?.shareLink || res?.url || res?.link || ""
      if (link) {
        setExportShareLinks((prev) => ({ ...prev, [jobId]: String(link) }))
      }
      void fetchExportJobs(150, "")
    } catch (e: any) {
      alert(e?.message || "Failed to create share link")
    } finally {
      setExportShareLoading((prev) => ({ ...prev, [jobId]: false }))
    }
  }

  // ── Fetch orders with pagination/search ──
  async function fetchOrders(page = 1, q = "") {
    setOrdersLoading(true)
    try {
      const url = `${API_ENDPOINTS.adminOrders}?page=${page}&q=${encodeURIComponent(q || '')}`
      const res: any = await apiFetch(url)
      if (res) {
        setAdminOrders(Array.isArray(res.orders) ? res.orders : [])
        setOrdersTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.orders) ? res.orders.length : 0))
        setOrdersPage(typeof res.page === 'number' ? res.page : page)
      } else {
        setAdminOrders([])
        setOrdersTotal(0)
        setOrdersPage(page)
      }
    } catch (e) {
      setAdminOrders([])
      setOrdersTotal(0)
    } finally {
      setOrdersLoading(false)
    }
  }

  async function fetchGlobalSearch(q = "") {
    setGlobalSearch(q)
    if (!q || String(q).trim() === "") {
      setGlobalResults({ users: [], organisations: [], servers: [], orders: [] })
      return
    }

    setGlobalLoading(true)
    try {
      const url = `${API_ENDPOINTS.adminGlobalSearch}?q=${encodeURIComponent(q)}`
      const res: any = await apiFetch(url)

      if (res) {
        setGlobalResults({
          users: Array.isArray(res.users) ? res.users : [],
          organisations: Array.isArray(res.organisations) ? res.organisations : [],
          servers: Array.isArray(res.servers) ? res.servers : [],
          orders: Array.isArray(res.orders) ? res.orders : [],
        })
      } else {
        setGlobalResults({ users: [], organisations: [], servers: [], orders: [] })
      }
    } catch (_e) {
      setGlobalResults({ users: [], organisations: [], servers: [], orders: [] })
    } finally {
      setGlobalLoading(false)
    }
  }

  // ── Fetch users (paged) ──
  async function fetchUsers(page = 1, q = "") {
    setUsersLoading(true)
    let loadedUsers: any[] = []
    try {
      const url = `${API_ENDPOINTS.adminUsers}?page=${page}&q=${encodeURIComponent(q || '')}`
      const res: any = await apiFetch(url)
      if (res) {
        const usersData = Array.isArray(res.users) ? res.users : []
        loadedUsers = usersData
        setUsers(usersData)
        setUsersTotal(typeof res.total === 'number' ? res.total : usersData.length)
        setUsersPage(typeof res.page === 'number' ? res.page : page)
      } else {
        loadedUsers = []
        setUsers([])
        setUsersTotal(0)
        setUsersPage(page)
      }
    } catch (e) {
      loadedUsers = []
      setUsers([])
      setUsersTotal(0)
    } finally {
      setUsersLoading(false)
    }
    return loadedUsers
  }

  // ── Fetch organisations (paged) ──
  async function fetchOrganisations(page = 1, q = "") {
    setOrganisationsLoading(true)
    try {
      const url = `${API_ENDPOINTS.adminOrganisations}?page=${page}&q=${encodeURIComponent(q || '')}`
      const res: any = await apiFetch(url)
      if (res) {
        setOrganisations(Array.isArray(res.organisations) ? res.organisations : [])
        setOrganisationsTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.organisations) ? res.organisations.length : 0))
        setOrganisationsPage(typeof res.page === 'number' ? res.page : page)
      } else {
        setOrganisations([])
        setOrganisationsTotal(0)
        setOrganisationsPage(page)
      }
    } catch (e) {
      setOrganisations([])
      setOrganisationsTotal(0)
    } finally {
      setOrganisationsLoading(false)
    }
  }

  // ── Fetch servers (paged) ──
  async function fetchServers(page = 1, q = "") {
    setServersLoading(true)
    try {
      const url = `${API_ENDPOINTS.adminServers}?page=${page}&q=${encodeURIComponent(q || '')}`
      const res: any = await apiFetch(url)
      if (res) {
        setServers(Array.isArray(res.servers) ? res.servers : [])
        setServersTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.servers) ? res.servers.length : 0))
        setServersPage(typeof res.page === 'number' ? res.page : page)
      } else {
        setServers([])
        setServersTotal(0)
        setServersPage(page)
      }
    } catch (e) {
      setServers([])
      setServersTotal(0)
    } finally {
      setServersLoading(false)
    }
  }

  // ── Fetch tickets (paged) ──
  async function fetchTickets(page = 1, q = "", priority = "") {
    setTicketsLoading(true)
    try {
      const priorityParam = priority === 'any' ? '' : (priority || '')
      let url = `${API_ENDPOINTS.adminTickets}?page=${page}&q=${encodeURIComponent(q || '')}&priority=${encodeURIComponent(priorityParam)}`
      if (ticketFilter && ticketFilter !== 'all') {
        url += `&status=${encodeURIComponent(ticketFilter)}`
      }
      if (showAiTouched) url += `&includeAiTouched=1`
      if (ticketFilter === 'archived') url += `&archived=1`

      const res: any = await apiFetch(url)
      if (res) {
        setTickets(Array.isArray(res.tickets) ? res.tickets : [])
        setTicketsTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.tickets) ? res.tickets.length : 0))
        setTicketsPage(typeof res.page === 'number' ? res.page : page)
      } else {
        setTickets([])
        setTicketsTotal(0)
        setTicketsPage(page)
      }
      setSelectedTicketIds([])
    } catch (e) {
      setTickets([])
      setTicketsTotal(0)
    } finally {
      setTicketsLoading(false)
    }
  }

  const setTicketFilterAndReload = async (f: string) => {
    setTicketFilter(f)
    await fetchTickets(1, ticketSearch, ticketPriorityFilter)
  }

  const searchParams = useSearchParams()

  useEffect(() => {
    const tabFromQuery = searchParams.get("tab")
    if (!tabFromQuery || tabFromQuery === activeTab) return
    setActiveTab(tabFromQuery)
  }, [searchParams, activeTab])

  useEffect(() => {
    loadTab(activeTab)
  }, [activeTab, loadTab])

  // ── Load default tab on mount and honor ?viewUser=123 query ──
  useEffect(() => {
    const tab = searchParams.get("tab") || "users"
    const viewUserId = Number(searchParams.get("viewUser") || "")

    if (viewUserQueryHandled) return
    if (!Number.isFinite(viewUserId) || viewUserId <= 0) return

    const openFromQuery = async () => {
      await loadTab(tab)

      let selectedUser: AdminUser | null = null
      const existingUser = users.find((u) => u.id === viewUserId)
      if (existingUser) {
        selectedUser = existingUser
      } else {
        const fetchedUsers = await fetchUsers(1, "")
        const match = Array.isArray(fetchedUsers)
          ? fetchedUsers.find((u: any) => u.id === viewUserId)
          : null
        selectedUser = match ? match : ({ id: viewUserId } as AdminUser)
      }

      if (!selectedUser) {
        setViewUserQueryHandled(true)
        return
      }

      if (privacyDialogOpen) {
        setPendingViewUserDialog(selectedUser)
      } else {
        openViewUser(selectedUser)
      }

      setViewUserQueryHandled(true)
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.delete("viewUser")
      router.replace(`${window.location.pathname}?${params.toString()}`)
    }

    openFromQuery()
  }, [searchParams, privacyDialogOpen, users, viewUserQueryHandled]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const viewServerUuid = (searchParams.get("viewServer") || "").trim()

    if (viewServerQueryHandled) return
    if (!viewServerUuid) return

    const openFromQuery = async () => {
      setActiveTab("servers")
      await loadTab("servers")

      let selectedServer: AdminServer | null = null
      const existingServer = servers.find((s) => s.uuid === viewServerUuid)
      if (existingServer) {
        selectedServer = existingServer
      } else {
        const fetchedServers = await fetchServers(1, viewServerUuid)
        const match = Array.isArray(fetchedServers)
          ? fetchedServers.find((s: any) => s.uuid === viewServerUuid)
          : null
        selectedServer = match ? match : ({ uuid: viewServerUuid } as AdminServer)
      }

      if (!selectedServer) {
        setViewServerQueryHandled(true)
        return
      }

      if (privacyDialogOpen) {
        setPendingViewServerDialog(selectedServer)
      } else {
        openEditServer(selectedServer)
      }

      setViewServerQueryHandled(true)
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.delete("viewServer")
      router.replace(`${window.location.pathname}?${params.toString()}`)
    }

    openFromQuery()
  }, [searchParams, servers, privacyDialogOpen, viewServerQueryHandled]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredUsers = users

  // ── Filtered tickets ──
  const filteredTickets =
    ticketFilter === "all"
      ? tickets
      : ticketFilter === "archived"
        ? tickets.filter((t) => t.archived)
        : tickets.filter((t) => t.status === ticketFilter)

  // ── Filtered organisations ──
  const filteredOrgs = organisations.filter((o) => {
    const q = orgSearch.toLowerCase()
    return o.name.toLowerCase().includes(q) || o.handle.toLowerCase().includes(q)
  })

  // ── Filtered servers ──
  const filteredServers = servers.filter((s) => {
    const q = serverSearch.toLowerCase()
    return (
      (s.name || s.uuid || '').toLowerCase().includes(q) ||
      (s.uuid || '').toLowerCase().includes(q) ||
      (s.nodeName || '').toLowerCase().includes(q)
    )
  })

  // ── Fraud display filtering ──
  const displayedFraudAlerts = fraudAlerts.filter((a) => {
    if (hideSuspendedFraud && a.suspended) return false
    return true
  })

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function toggleSuspend(user: AdminUser) {
    await apiFetch(`${API_ENDPOINTS.adminUsers}/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ suspended: !user.suspended }),
    })
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, suspended: !u.suspended } : u)))
  }

  async function resetDemo(user: AdminUser) {
    if (!(await confirmAsync(`Reset demo status for ${user.firstName} ${user.lastName}?`))) return
    await apiFetch(`${API_ENDPOINTS.adminUsers}/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ demoUsed: false, demoExpiresAt: null, demoOriginalPortalType: null, demoLimits: null }),
    })
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, demoUsed: false, demoExpiresAt: null } : u)))
  }

  async function deleteUser(user: AdminUser) {
    if (!(await confirmAsync(`Delete user ${user.firstName} ${user.lastName}? This is permanent.`))) return
    await apiFetch(`${API_ENDPOINTS.adminUsers}/${user.id}`, {
      method: "DELETE",
    })
    setUsers((prev) => prev.filter((u) => u.id !== user.id))
  }

  async function deassignStudent(user: AdminUser) {
    if (!(await confirmAsync(`Deassign student verification for ${user.firstName} ${user.lastName}?`))) return
    try {
      await apiFetch(API_ENDPOINTS.adminUserDeassignStudent.replace(':id', String(user.id)), {
        method: 'POST',
        body: JSON.stringify({ removePortal: true }),
      })
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, studentVerified: false, portalType: 'free' } : u))
      alert('Student deassigned')
    } catch (e: any) {
      alert('Failed: ' + (e.message || 'error'))
    }
  }

  async function requireStudentReverify(user: AdminUser) {
    if (!(await confirmAsync(`Require ${user.firstName} ${user.lastName} to re-verify student status?`))) return
    try {
      await apiFetch(API_ENDPOINTS.adminUserRequireStudentReverify.replace(':id', String(user.id)), {
        method: 'POST',
        body: JSON.stringify({ clearLimits: false }),
      })
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, studentVerified: false } : u))
      alert('User marked for re-verification')
    } catch (e: any) {
      alert('Failed: ' + (e.message || 'error'))
    }
  }

  function openEditUser(user: AdminUser) {
    setEditUserDialog(user)
    setEditRole(user.role || "user")
    setEditTier(user.portalType || "free")
    const lim = (user as any).limits || {}
    setEditServerLimit(lim.serverLimit !== undefined ? String(lim.serverLimit) : "")
    setEditCpuLimit(lim.cpu !== undefined ? String(lim.cpu) : "")
    setEditMemoryLimit(lim.memory !== undefined ? String(lim.memory) : "")
    setEditDiskLimit(lim.disk !== undefined ? String(lim.disk) : "")
    setEditDatabaseLimit(lim.databases !== undefined ? String(lim.databases) : "")
    setEditBackupLimit(lim.backups !== undefined ? String(lim.backups) : "")
    setEditDateOfBirth(user.dateOfBirth || "")
    setEditParentId(user.parentId != null ? String(user.parentId) : "")
    const badges = Array.isArray((user as any)?.settings?.badges)
      ? (user as any).settings.badges
      : Array.isArray((user as any)?.settings?.gambling?.badges)
        ? (user as any).settings.gambling.badges
        : []
    setEditBadgesText((badges as any[]).map((badge) => String(badge || "").trim()).filter(Boolean).join(", "))
    // Fetch current plan
    setUserCurrentPlan(null)
    setUserPlanLoading(true)
    apiFetch(API_ENDPOINTS.adminUserCurrentPlan.replace(":id", String(user.id)))
      .then((data) => setUserCurrentPlan(data))
      .catch(() => setUserCurrentPlan(null))
      .finally(() => setUserPlanLoading(false))
  }

  async function cancelUserPlan() {
    if (!editUserDialog) return
    if (!(await confirmAsync(`Cancel ${editUserDialog.firstName}'s active plan? They will revert to Free tier.`))) return
    setCancelPlanLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.adminUserCancelPlan.replace(":id", String(editUserDialog.id)), { method: "POST" })
      setUserCurrentPlan({ plan: null, order: null })
      setEditTier("free")
      setUsers((prev) => prev.map((u) => u.id === editUserDialog.id ? { ...u, portalType: "free", limits: null } : u))
    } catch (e: any) {
      alert("Failed to cancel plan: " + (e.message || "error"))
    } finally {
      setCancelPlanLoading(false)
    }
  }

  async function saveEditUser() {
    if (!editUserDialog) return
    setEditLoading(true)
    try {
      const limits: Record<string, number> = {}
      if (editServerLimit !== "") limits.serverLimit = Number(editServerLimit)
      if (editCpuLimit !== "") limits.cpu = Number(editCpuLimit)
      if (editMemoryLimit !== "") limits.memory = Number(editMemoryLimit)
      if (editDiskLimit !== "") limits.disk = Number(editDiskLimit)
      if (editDatabaseLimit !== "") limits.databases = Number(editDatabaseLimit)
      if (editBackupLimit !== "") limits.backups = Number(editBackupLimit)
      const badges = parseBadgeText(editBadgesText)
      await apiFetch(`${API_ENDPOINTS.adminUsers}/${editUserDialog.id}`, {
        method: "PUT",
        body: JSON.stringify({
          role: editRole,
          portalType: editTier,
          limits: Object.keys(limits).length ? limits : null,
          badges,
          dateOfBirth: editDateOfBirth || undefined,
          parentId: editParentId ? Number(editParentId) : null,
        }),
      })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUserDialog.id
            ? {
                ...u,
                role: editRole,
                portalType: editTier,
                dateOfBirth: editDateOfBirth !== "" ? editDateOfBirth : null,
                parentId: editParentId !== "" ? Number(editParentId) : null,
                settings: {
                  ...(u.settings || {}),
                  badges,
                  gambling: {
                    ...((u.settings as any)?.gambling || {}),
                    badges,
                  },
                },
              }
            : u
        )
      )
      setEditUserDialog(null)
    } finally {
      setEditLoading(false)
    }
  }

  function openReply(ticket: AdminTicket) {
    setReplyTicket(ticket)
    setReplyText("")
    setReplyStatus(ticket.status || "closed")
    setReplyPriority(ticket.priority || "medium")
    setReplyDepartment(ticket.department || "")
    setReplyAssignedTo(ticket.assignedTo ? String(ticket.assignedTo) : "")

    setReplyAs('staff')

    if (staffUsers.length === 0) {
      setStaffLoading(true)
      apiFetch(API_ENDPOINTS.adminUsers)
        .then((data: any) => {
          const list = Array.isArray(data) ? data : []
          setStaffUsers(list.filter((u) => ['admin', 'rootAdmin', '*'].includes(u.role || '')))
        })
        .catch(() => { })
        .finally(() => setStaffLoading(false))
    }
  }

  async function submitReply() {
    if (!replyTicket) return
    setReplyLoading(true)
    try {
      const updated = await apiFetch(`${API_ENDPOINTS.adminTickets}/${replyTicket.id}`, {
        method: "PUT",
        body: JSON.stringify({
          reply: replyText,
          replyAs: replyAs,
          status: replyStatus,
          priority: replyPriority,
          department: replyDepartment || undefined,
          assignedTo: replyAssignedTo ? Number(replyAssignedTo) : undefined,
        }),
      })
      setTickets((prev) =>
        prev.map((t) => (t.id === replyTicket.id ? (updated.ticket ?? updated) : t))
      )
      setReplyTicket(null)
    } finally {
      setReplyLoading(false)
    }
  }

  async function reviewVerification(id: number, status: "verified" | "failed") {
    await apiFetch(`${API_ENDPOINTS.adminVerifications}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    })
    setVerifications((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  async function deleteVerification(id: number) {
    if (!(await confirmAsync('Delete this verification record and its uploaded documents?'))) return
    try {
      await apiFetch(`${API_ENDPOINTS.adminVerifications}/${id}`, { method: 'DELETE' })
      setVerifications((prev) => prev.filter((v) => v.id !== id))
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
    } catch (err: any) {
      alert('Failed to delete: ' + (err?.message || 'unknown error'))
    }
  }

  async function reviewDeletion(id: number, status: "approved" | "rejected") {
    await apiFetch(`${API_ENDPOINTS.adminDeletions}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    })
    setDeletions((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  function forceRefreshTab(tab: string) {
    setLoadedTabs((prev) => {
      const next = new Set(prev)
      next.delete(tab)
      return next
    })
    setTimeout(() => loadTab(tab), 50)
  }

  // ── Organisation actions ─────────────────────────────────────────────────────

  function openEditOrg(org: AdminOrganisation) {
    setEditOrgDialog(org)
    setEditOrgName(org.name)
    setEditOrgHandle(org.handle)
    setEditOrgTier(org.portalTier || "free")
    setEditOrgOwnerId(String(org.ownerId))
    setEditOrgIsStaff(!!org.isStaff)
    setEditOrgAddMemberId("")
  }

  async function saveEditOrg() {
    if (!editOrgDialog) return
    setEditOrgLoading(true)
    try {
      await apiFetch(`${API_ENDPOINTS.adminOrganisations}/${editOrgDialog.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editOrgName, handle: editOrgHandle, portalTier: editOrgTier, ownerId: editOrgOwnerId ? Number(editOrgOwnerId) : undefined, isStaff: editOrgIsStaff }),
      })
      setOrganisations((prev) =>
        prev.map((o) =>
          o.id === editOrgDialog.id ? { ...o, name: editOrgName, handle: editOrgHandle, portalTier: editOrgTier, ownerId: editOrgOwnerId ? Number(editOrgOwnerId) : o.ownerId, isStaff: editOrgIsStaff } : o
        )
      )
      setEditOrgDialog(null)
    } finally {
      setEditOrgLoading(false)
    }
  }

  async function deleteOrg(org: AdminOrganisation) {
    if (!(await confirmAsync(`Delete organisation "${org.name}"? This will unlink all members.`))) return
    await apiFetch(`${API_ENDPOINTS.adminOrganisations}/${org.id}`, { method: "DELETE" })
    setOrganisations((prev) => prev.filter((o) => o.id !== org.id))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  // ── Server actions ─────────────────────────────────────────────────────────

  async function serverPower(uuid: string, action: string) {
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}/power`, {
      method: "POST",
      body: JSON.stringify({ action }),
    })
    forceRefreshTab("servers")
  }

  async function markServerStarted(uuid: string) {
    await apiFetch(API_ENDPOINTS.adminServerMarkStarted.replace(":id", uuid), {
      method: "POST",
    })
    alert("Startup detection was set to auto-complete for this server.")
    forceRefreshTab("servers")
  }

  async function deleteServer(uuid: string) {
    if (!(await confirmAsync(`Delete server ${uuid}? This action cannot be undone.`))) return
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}`, { method: "DELETE" })
    setServers((prev) => prev.filter((s) => s.uuid !== uuid))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  async function openEditServer(srv: AdminServer) {
    setEsError("")
    setEsReinstalling(false)
    setEsAllocations([])
    setEsAllocIp("0.0.0.0")
    setEsAllocPort("")
    setEsAllocFqdn("")
    setEsEditFqdnIdx(null)

    let mergedServer: AdminServer = srv
    try {
      const full = await apiFetch(API_ENDPOINTS.serverDetail.replace(":id", srv.uuid))
      if (full && typeof full === "object") {
        mergedServer = { ...srv, ...full }
      }
    } catch {
      // skip
    }

    const mergedAny = mergedServer as any
    const cfgBuild = mergedAny?.configuration?.build || {}
    const rootBuild = mergedAny?.build || {}
    const cfgDocker = mergedAny?.configuration?.docker || {}
    const rootContainer = mergedAny?.container || {}

    setEsName(mergedAny.name || "")
    setEsDesc(
      mergedAny?.configuration?.meta?.description ||
        mergedAny?.description ||
        mergedAny?.configuration?.meta?.name ||
        ""
    )
    setEsUserId(String(mergedAny.owner || mergedAny.userId || ""))
    setEsMemory(String(cfgBuild.memory_limit ?? rootBuild.memory_limit ?? mergedAny.memory ?? ""))
    setEsDisk(String(cfgBuild.disk_space ?? rootBuild.disk_space ?? mergedAny.disk ?? ""))
    setEsCpu(String(cfgBuild.cpu_limit ?? rootBuild.cpu_limit ?? mergedAny.cpu ?? ""))
    setEsSwap(String(cfgBuild.swap ?? rootBuild.swap ?? mergedAny.swap ?? "0"))
    setEsDockerImage(
      cfgDocker.image ||
        rootContainer.image ||
        mergedAny?.configuration?.container?.image ||
        mergedAny.dockerImage ||
        ""
    )
    setEsStartup(mergedAny?.configuration?.invocation || mergedAny.invocation || mergedAny.startup || "")
    setEsEggId(
      mergedAny.eggId
        ? String(mergedAny.eggId)
        : mergedAny?.egg?.id
          ? String(mergedAny.egg.id)
          : undefined
    )
    setEsAutoSyncOnEggChange(mergedAny?.configuration?.autoSyncOnEggChange !== false)
    setEditServerDialog(mergedServer)
    setEsEnvironment({})
    setEsEnvVarDefs([])
    setEsExtraEnvRows([])
    setEsEnvModified(false)
    try {
      const startupData = await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", srv.uuid))
      if (startupData && typeof startupData === "object") {
        setEsEnvironment(startupData.environment || {})
        setEsEnvVarDefs(startupData.envVars || [])
        setEsExtraEnvRows([])
      }
    } catch {
      setEsEnvironment({})
      setEsEnvVarDefs([])
      setEsExtraEnvRows([])
    }
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", srv.uuid))
      .then((data: any) => {
        if (Array.isArray(data)) setEsAllocations(data.map((a: any) => ({ ip: a.ip, port: a.port, is_default: !!a.is_default, fqdn: a.fqdn || "" })))
      })
      .catch(() => { })
    // ensure eggs are loaded for the egg selector
    if (eggs.length === 0) {
      apiFetch(API_ENDPOINTS.adminEggs).then((data: any) => setEggs(data || [])).catch(() => { })
    }
  }

  async function saveEditServer() {
    if (!editServerDialog) return
    setEsLoading(true)
    setEsError("")
    try {
      await apiFetch(`${API_ENDPOINTS.adminServers}/${editServerDialog.uuid}`, {
        method: "PUT",
        body: JSON.stringify({
          name: esName || undefined,
          description: esDesc || undefined,
          userId: esUserId ? Number(esUserId) : undefined,
          memory: esMemory ? Number(esMemory) : undefined,
          disk: esDisk ? Number(esDisk) : undefined,
          cpu: esCpu ? Number(esCpu) : undefined,
          swap: esSwap !== "" ? Number(esSwap) : undefined,
          dockerImage: esDockerImage || undefined,
          startup: esStartup || undefined,
          allocations: esAllocations,
          eggId: esEggId && esEggId !== "none" ? Number(esEggId) : undefined,
          autoSyncOnEggChange: esAutoSyncOnEggChange,
        }),
      })
      if (esEnvModified) {
        const nextEnvironment: Record<string, string> = { ...esEnvironment }
        for (const row of esExtraEnvRows) {
          if (row.key.trim()) nextEnvironment[row.key.trim()] = row.value
        }
        await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", editServerDialog.uuid), {
          method: "PUT",
          body: JSON.stringify({ environment: nextEnvironment }),
        })
      }
      setServers((prev) => prev.map((s) =>
        s.uuid === editServerDialog.uuid ? { ...s, name: esName || s.name, description: esDesc || s.description } : s
      ))
      setEditServerDialog(null)
    } catch (e: any) {
      setEsError(e.message || "Failed to save")
    } finally {
      setEsLoading(false)
    }
  }

  const esDefinedKeys = new Set(esEnvVarDefs.map((v: any) => v.env_variable || v.key || v.name))
  const esEnvRows = [
    ...esEnvVarDefs.map((def: any) => {
      const key = def.env_variable || def.key || def.name
      return {
        id: key,
        key,
        name: def.name || key,
        description: def.description || "",
        isEditable: !!def.user_editable,
        isDefined: true,
        value: esEnvironment[key] ?? "",
        placeholder: String(def.default_value ?? def.defaultValue ?? def.value ?? ""),
      }
    }),
    ...Object.keys(esEnvironment)
      .filter((key) => !esDefinedKeys.has(key))
      .map((key) => ({
        id: key,
        key,
        name: key,
        description: "",
        isEditable: true,
        isCustom: true,
        value: esEnvironment[key] ?? "",
        placeholder: "",
      })),
    ...esExtraEnvRows.map((row) => ({
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

  async function reinstallServerFromDialog() {
    if (!editServerDialog) return
    if (!(await confirmAsync(`Reinstall "${editServerDialog.name || editServerDialog.uuid}"? All server files will be wiped and the server will be re-provisioned from its egg.`))) return
    setEsReinstalling(true)
    try {
      await apiFetch(`/api/servers/${editServerDialog.uuid}/reinstall`, { method: "POST" })
      alert("Reinstall initiated. The server will restart shortly.")
    } catch (e: any) {
      alert("Reinstall failed: " + e.message)
    } finally {
      setEsReinstalling(false)
    }
  }

  async function suspendServer(uuid: string) {
    const reason = window.prompt("Reason for suspension (shown to users in console/SFTP):", "")?.trim()
    if (!reason) return
    const result = await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })

    if (!result?.emailSent) {
      const extra = result?.emailReason ? ` (${result.emailReason})` : ""
      alert(`Server suspended, but owner email was not sent${extra}.`)
    }

    setServers((prev) => prev.map((s) => s.uuid === uuid ? { ...s, status: "suspended" } : s))
  }

  async function unsuspendServer(uuid: string) {
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}/unsuspend`, { method: "POST" })
    setServers((prev) => prev.map((s) => s.uuid === uuid ? { ...s, status: "offline" } : s))
  }

  async function syncFromWings() {
    setSyncingFromWings(true)
    try {
      const result = await apiFetch(API_ENDPOINTS.adminSyncFromWings, { method: "POST" })
      forceRefreshTab("servers")
      alert(`Sync complete — ${result.created} new configs imported, ${result.skipped} already existed.${result.errors?.length ? `\n\nErrors:\n${result.errors.join("\n")}` : ""
        }`)
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`)
    } finally {
      setSyncingFromWings(false)
    }
  }

  async function syncToWings() {
    setSyncingToWings(true)
    try {
      const result = await apiFetch(API_ENDPOINTS.adminSyncToWings, { method: "POST" })
      forceRefreshTab("nodes")
      alert(result?.message || 'Sync to Wings started in the background. Check your activity notifications for completion updates.')
    } catch (e: any) {
      alert(`Sync to Wings failed: ${e.message}`)
    } finally {
      setSyncingToWings(false)
    }
  }

  function openCreateServer() {
    setCsNodeId(nodes.length === 1 ? String(nodes[0].id) : "")
    setCsUserId("")
    setCsEggId(eggs.length === 1 ? String(eggs[0].id) : undefined)
    setCsName("")
    setCsMemory("1024")
    setCsDisk("10240")
    setCsCpu("100")
    setCsKvmPassthroughEnabled(false)
    setCsError("")
    setCreateServerOpen(true)
  }

  async function submitCreateServer() {
    if (!csNodeId) { setCsError("Please select a node."); return }
    setCsLoading(true); setCsError("")
    try {
      await apiFetch(API_ENDPOINTS.adminCreateServer, {
        method: "POST",
        body: JSON.stringify({
          nodeId: Number(csNodeId),
          userId: csUserId ? Number(csUserId) : undefined,
          eggId: csEggId && csEggId !== "none" ? Number(csEggId) : undefined,
          name: csName || undefined,
          memory: Number(csMemory),
          disk: Number(csDisk),
          cpu: Number(csCpu),
          kvmPassthroughEnabled: !!csKvmPassthroughEnabled,
        }),
      })
      setCreateServerOpen(false)
      forceRefreshTab("servers")
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
    } catch (e: any) {
      setCsError(e.message || "Failed to create server")
    } finally {
      setCsLoading(false)
    }
  }

  // ── Node classification actions ────────────────────────────────────────────

  function openEditNode(node: AdminNode) {
    setEditNodeDialog(node)
    setEditNodeType(node.nodeType || "free")
    setEditNodePortStart((node as any).portRangeStart != null ? String((node as any).portRangeStart) : "")
    setEditNodePortEnd((node as any).portRangeEnd != null ? String((node as any).portRangeEnd) : "")
    setEditNodeDefaultIp((node as any).defaultIp || "")
  }

  async function saveEditNode() {
    if (!editNodeDialog) return
    setEditNodeLoading(true)
    try {
      await apiFetch(`${API_ENDPOINTS.nodes}/${editNodeDialog.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nodeType: editNodeType,
          portRangeStart: editNodePortStart ? Number(editNodePortStart) : null,
          portRangeEnd: editNodePortEnd ? Number(editNodePortEnd) : null,
          defaultIp: editNodeDefaultIp || null,
        }),
      })
      setNodes((prev) => prev.map((n) => n.id === editNodeDialog.id ? {
        ...n,
        nodeType: editNodeType,
        portRangeStart: editNodePortStart ? Number(editNodePortStart) : undefined,
        portRangeEnd: editNodePortEnd ? Number(editNodePortEnd) : undefined,
        defaultIp: editNodeDefaultIp || undefined,
      } as any : n))
      setEditNodeDialog(null)
    } finally {
      setEditNodeLoading(false)
    }
  }

  // ── Plan CRUD ─────────────────────────────────────────────────────────────

  function openNewPlan() {
    setPlanEditTarget(null)
    setPlanName(""); setPlanType("free"); setPlanPrice("0"); setPlanDesc("")
    setPlanMemory(""); setPlanDisk(""); setPlanCpu(""); setPlanServerLimit("")
    setPlanDatabases(""); setPlanBackups(""); setPlanEmailSendDailyLimit(""); setPlanEmailSendQueueLimit("")
    setPlanPortCount("1"); setPlanIsDefault(false); setPlanHiddenFromBilling(false); setPlanFeatures(""); setPlanError("")
    setPlanDialogOpen(true)
  }

  function openEditPlan(plan: AdminPlan) {
    setPlanEditTarget(plan)
    setPlanName(plan.name); setPlanType(plan.type); setPlanPrice(String(plan.price ?? 0)); setPlanDesc(plan.description || "")
    setPlanMemory(plan.memory != null ? String(plan.memory) : ""); setPlanDisk(plan.disk != null ? String(plan.disk) : "")
    setPlanCpu(plan.cpu != null ? String(plan.cpu) : ""); setPlanServerLimit(plan.serverLimit != null ? String(plan.serverLimit) : "")
    setPlanDatabases((plan as any).databases != null ? String((plan as any).databases) : ""); setPlanBackups((plan as any).backups != null ? String((plan as any).backups) : "")
    setPlanEmailSendDailyLimit((plan as any).emailSendDailyLimit != null ? String((plan as any).emailSendDailyLimit) : "")
    setPlanEmailSendQueueLimit((plan as any).emailSendQueueLimit != null ? String((plan as any).emailSendQueueLimit) : "")
    setPlanPortCount(plan.portCount != null ? String(plan.portCount) : "1"); setPlanIsDefault(plan.isDefault ?? false)
    setPlanHiddenFromBilling(Boolean((plan as any).hiddenFromBilling))
    const featList = (plan as any).features?.list
    setPlanFeatures(Array.isArray(featList) ? featList.join("\n") : "")
    setPlanError("")
    setPlanDialogOpen(true)
  }

  async function savePlan() {
    if (!planName.trim()) { setPlanError("Name is required"); return }
    setPlanLoading(true); setPlanError("")
    const featuresList = planFeatures.split("\n").map((f) => f.trim()).filter(Boolean)
    const body = {
      name: planName, type: planType, price: Number(planPrice) || 0,
      description: planDesc || undefined,
      memory: planMemory ? Number(planMemory) : null,
      disk: planDisk ? Number(planDisk) : null,
      cpu: planCpu ? Number(planCpu) : null,
      serverLimit: planServerLimit ? Number(planServerLimit) : null,
      databases: planDatabases ? Number(planDatabases) : null,
      backups: planBackups ? Number(planBackups) : null,
      emailSendDailyLimit: planEmailSendDailyLimit !== "" ? Number(planEmailSendDailyLimit) : null,
      emailSendQueueLimit: planEmailSendQueueLimit !== "" ? Number(planEmailSendQueueLimit) : null,
      portCount: planPortCount ? Number(planPortCount) : 1,
      isDefault: planIsDefault,
      hiddenFromBilling: planHiddenFromBilling,
      features: featuresList.length ? { list: featuresList } : null,
    }
    try {
      if (planEditTarget) {
        const updated = await apiFetch(`${API_ENDPOINTS.adminPlans}/${planEditTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        setPlans((prev) => prev.map((p) => p.id === planEditTarget.id ? (updated.plan ?? updated) : p))
      } else {
        const created = await apiFetch(API_ENDPOINTS.adminPlans, { method: "POST", body: JSON.stringify(body) })
        setPlans((prev) => [...prev, created.plan ?? created])
      }
      setPlanDialogOpen(false)
    } catch (e: any) {
      setPlanError(e.message || "Failed to save")
    } finally {
      setPlanLoading(false)
    }
  }

  async function reapplyPlanLimits(planId: number, force = false) {
    const confirmation = force
      ? 'Force reapply limits for all users on this plan (this will overwrite custom limits)?'
      : 'Reapply limits for all users on this plan (skipping users with custom limits)?';
    if (!confirm(confirmation)) return

    setPlanReapplyId(planId)
    setPlanReapplyLoading(true)
    try {
      const query = force ? '?force=true' : ''
      const res = await apiFetch(API_ENDPOINTS.adminPlanReapplyLimits.replace(':id', String(planId)) + query, { method: 'POST' })
      if (res && res.updated != null) {
        alert(`Reapplied plan limits to ${res.updated} users`)
      } else {
        alert('Reapplied plan limits')
      }
    } catch (e: any) {
      alert('Failed: ' + (e.message || 'error'))
    } finally {
      setPlanReapplyId(null)
      setPlanReapplyLoading(false)
    }
  }

  async function deletePlan(plan: AdminPlan) {
    if (!(await confirmAsync(`Delete plan "${plan.name}"?`))) return
    await apiFetch(`${API_ENDPOINTS.adminPlans}/${plan.id}`, { method: "DELETE" })
    setPlans((prev) => prev.filter((p) => p.id !== plan.id))
  }

  async function ensurePortalPlans() {
    if (!(await confirmAsync("Ensure all users have a portal-matching plan? This will create orders for missing assignments."))) return
    setEnsureLoading(true)
    try {
      const res = await apiFetch('/api/admin/ensure-portal-plans', { method: 'POST' })
      if (res && typeof res.assigned !== 'undefined') {
        alert(`Assigned plans to ${res.assigned} users.`)
        apiFetch(API_ENDPOINTS.adminPlans).then((d: any) => setPlans(Array.isArray(d) ? d : [])).catch(() => { })
        apiFetch(API_ENDPOINTS.adminUsers).then((d: any) => setUsers(Array.isArray(d) ? d : [])).catch(() => { })
      } else {
        alert('Operation completed.')
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to ensure portal plans')
    } finally {
      setEnsureLoading(false)
    }
  }

  // ── Issue Order ───────────────────────────────────────────────────────────

  function openIssueOrder() {
    setIoUserId(""); setIoDesc(""); setIoPlanId(""); setIoAmount("0"); setIoNotes(""); setIoExpiresAt(""); setIoError("")
    setIssueOrderOpen(true)
  }

  async function submitIssueOrder() {
    if (!ioUserId) { setIoError("User ID is required"); return }
    setIoLoading(true); setIoError("")
    try {
      const created = await apiFetch(API_ENDPOINTS.adminOrders, {
        method: "POST",
        body: JSON.stringify({
          userId: Number(ioUserId), description: ioDesc || undefined,
          planId: ioPlanId ? Number(ioPlanId) : undefined,
          amount: Number(ioAmount) || 0,
          notes: ioNotes || undefined,
          expiresAt: ioExpiresAt || undefined,
        }),
      })
      setAdminOrders((prev) => [...prev, created.order ?? created])
      setIssueOrderOpen(false)
    } catch (e: any) {
      setIoError(e.message || "Failed to issue order")
    } finally {
      setIoLoading(false)
    }
  }

  function openEditOrder(order: AdminOrder) {
    setEditOrderTarget(order)
    setEoDescription(order.description || "")
    setEoAmount(String(order.amount ?? 0))
    setEoPlanId(order.planId ? String(order.planId) : "")
    setEoNotes(order.notes || "")
    setEoExpiresAt(order.expiresAt || "")
    setEoStatus(order.status || "")
    setEoError("")
    setEditOrderOpen(true)
  }

  async function submitEditOrder() {
    if (!editOrderTarget) return
    setEoLoading(true); setEoError("")
    try {
      const id = String(editOrderTarget.id)
      const res = await apiFetch(API_ENDPOINTS.adminOrderDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify({
          description: eoDescription || undefined,
          amount: eoAmount ? Number(eoAmount) : 0,
          planId: eoPlanId ? Number(eoPlanId) : undefined,
          notes: eoNotes || undefined,
          expiresAt: eoExpiresAt || undefined,
          status: eoStatus || undefined,
        }),
      })
      setAdminOrders((prev) => prev.map((o) => (o.id === editOrderTarget.id ? (res.order ?? res) : o)))
      setEditOrderOpen(false)
    } catch (e: any) {
      setEoError(e?.message || "Failed to save order")
    } finally {
      setEoLoading(false)
    }
  }

  async function cancelOrder(order: AdminOrder) {
    if (!confirm(`Cancel order #${order.id}?`)) return
    try {
      const res = await apiFetch(API_ENDPOINTS.adminOrderDetail.replace(":id", String(order.id)), {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      })
      setAdminOrders((prev) => prev.map((o) => (o.id === order.id ? (res.order ?? res) : o)))
    } catch (e) {
      alert("Failed to cancel order")
    }
  }

  async function deleteOrder(order: AdminOrder) {
    if (!confirm(`Delete order #${order.id}? This cannot be undone.`)) return
    try {
      await apiFetch(API_ENDPOINTS.adminOrderDetail.replace(":id", String(order.id)), { method: "DELETE" })
      setAdminOrders((prev) => prev.filter((o) => o.id !== order.id))
    } catch (e) {
      alert("Failed to delete order")
    }
  }

  // ── Apply Plan to User ────────────────────────────────────────────────────

  function openApplyPlan(userId: number) {
    setApplyPlanUserId(userId)
    setApplyPlanId(""); setApplyPlanNotes(""); setApplyPlanExpiry(""); setApplyPlanOrgId(""); setApplyPlanError("")
    if (plans.length === 0) apiFetch(API_ENDPOINTS.adminPlans).then((d: any) => setPlans(Array.isArray(d) ? d : [])).catch(() => { })
    setApplyPlanOpen(true)
  }

  async function submitApplyPlan() {
    if (!applyPlanId) { setApplyPlanError("Select a plan"); return }
    setApplyPlanLoading(true); setApplyPlanError("")
    try {
      await apiFetch(API_ENDPOINTS.adminApplyPlan.replace(":id", String(applyPlanUserId)), {
        method: "POST",
        body: JSON.stringify({
          planId: Number(applyPlanId),
          notes: applyPlanNotes || undefined,
          expiresAt: applyPlanExpiry || undefined,
          orgId: applyPlanOrgId ? Number(applyPlanOrgId) : undefined,
        }),
      })
      const plan = plans.find((p) => p.id === Number(applyPlanId))
      if (plan) {
        const limits: any = {}
        if (plan.memory) limits.memory = plan.memory
        if (plan.disk) limits.disk = plan.disk
        if (plan.cpu) limits.cpu = plan.cpu
        if (plan.serverLimit) limits.serverLimit = plan.serverLimit
        if (plan.databases) limits.databases = plan.databases
        if (plan.backups) limits.backups = plan.backups
        setUsers((prev) => prev.map((u) => u.id === applyPlanUserId ? { ...u, portalType: plan.type, limits } : u))
        // Refresh current plan display if user edit dialog is open for the same user
        if (editUserDialog?.id === applyPlanUserId) {
          setEditTier(plan.type)
          apiFetch(API_ENDPOINTS.adminUserCurrentPlan.replace(":id", String(applyPlanUserId)))
            .then((data) => setUserCurrentPlan(data))
            .catch(() => { })
        }
      }
      setApplyPlanOpen(false)
    } catch (e: any) {
      setApplyPlanError(e.message || "Failed to apply plan")
    } finally {
      setApplyPlanLoading(false)
    }
  }

  async function deleteNode(node: AdminNode) {
    if (!(await confirmAsync(`Delete node "${node.name}"? All server mappings on this node will break.`))) return
    await apiFetch(`${API_ENDPOINTS.nodes}/${node.id}`, { method: "DELETE" })
    setNodes((prev) => prev.filter((n) => n.id !== node.id))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  function buildNodeConfigYaml(node: AdminNode, token: string): string {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ||
      (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "https://panel.example.com")
    const urlObj = (() => { try { return new URL(node.url) } catch { return null } })()
    const port = urlObj?.port || "8080"
    const isSsl = urlObj?.protocol === "https:"
    const fqdn = urlObj?.hostname || node.url
    return `debug: false
uuid: ${node.id}
token_id: eclipanel
token: ${token}
api:
  host: 0.0.0.0
  port: ${port}
  ssl:
    enabled: ${isSsl}
    cert: /etc/letsencrypt/live/${fqdn}/fullchain.pem
    key: /etc/letsencrypt/live/${fqdn}/privkey.pem
  upload_limit: 100
system:
  data: /var/lib/eclipanel/volumes
  sftp:
    bind_port: 2022
allowed_mounts: []
allowed_origins:
  - https://ecli.app
  - https://backend.ecli.app
  - "*.ecli.app"
remote: ${backendUrl}`
  }

  async function viewNodeConfig(node: AdminNode) {
    setViewConfigNode(node)
    setViewConfigToken("")
    setViewConfigLoading(true)
    try {
      const data = await apiFetch(`${API_ENDPOINTS.nodes}/${node.id}/token`)
      setViewConfigToken(data.token || "")
    } finally {
      setViewConfigLoading(false)
    }
  }

  function openHeartbeatHistory(node: AdminNode) {
    setHeartbeatDialogWindow("24h")
    setHeartbeatDialogData(null)
    setHeartbeatDialogNode(node)
  }

  function openAddNode() {
    setAddNodeOpen(true)
    setAddNodeStep("form")
    setAddNodeName(""); setAddNodeFqdn("")
    setAddNodePort("8080"); setAddNodeSsl(true)
    setAddNodeDataPath("/var/lib/eclipanel/volumes"); setAddNodeSftpPort("2022")
    setAddNodeType("free"); setAddNodeToken(""); setAddNodeCreated(null)
  }

  async function generateAddNodeToken() {
    setAddNodeTokenLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.nodeGenerateToken)
      setAddNodeToken(data.token || "")
    } finally {
      setAddNodeTokenLoading(false)
    }
  }

  async function submitAddNode() {
    if (!addNodeToken) { await generateAddNodeToken(); return }
    setAddNodeLoading(true)
    try {
      const scheme = addNodeSsl ? "https" : "http"
      const url = `${scheme}://${addNodeFqdn}:${addNodePort}`
      const created = await apiFetch(API_ENDPOINTS.nodes, {
        method: "POST",
        body: JSON.stringify({ name: addNodeName, url, token: addNodeToken, nodeType: addNodeType }),
      })
      setNodes((prev) => [...prev, created])
      setAddNodeCreated(created)
      setAddNodeStep("config")
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
    } finally {
      setAddNodeLoading(false)
    }
  }

  function buildWingsConfig() {
    const panelUrl = process.env.NEXT_PUBLIC_BACKEND_URL ||
      (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "https://panel.example.com")
    const certPath = `/etc/letsencrypt/live/${addNodeFqdn}/fullchain.pem`
    const keyPath = `/etc/letsencrypt/live/${addNodeFqdn}/privkey.pem`
    return `debug: false
uuid: ${addNodeCreated?.id ?? "<node-id>"}
token_id: eclipanel
token: ${addNodeToken}
api:
  host: 0.0.0.0
  port: ${addNodePort}
  ssl:
    enabled: ${addNodeSsl}
    cert: ${certPath}
    key: ${keyPath}
  upload_limit: 100
system:
  data: ${addNodeDataPath}
  sftp:
    bind_port: ${addNodeSftpPort}
allowed_mounts: []
allowed_origins:
  - https://ecli.app
  - https://backend.ecli.app
  - "*.ecli.app"
remote: ${panelUrl}`
  }

  // ── Egg CRUD actions ───────────────────────────────────────────────────────

  function openNewEgg() {
    setEggTab("basic")
    setEggDialog("new")
    setEggName(""); setEggDesc(""); setEggAuthor(""); setEggUpdateUrl("")
    setEggImage(""); setEggDockerImagesRaw(""); setEggStartup("")
    setEggEnvVars(""); setEggEnvVarDefs([]); setEggVisible(true)
    setEggFeatures(""); setEggFileDenylist("")
    setEggAllowedPortals([])
    setEggProcessStop("stop"); setEggProcessDone("")
    setEggInstallContainer(""); setEggInstallEntrypoint("bash"); setEggInstallScript("")
    setEggRootless(false)
    setEggRequiresKvm(false)
  }

  function openEditEgg(egg: AdminEgg) {
    setEggTab("basic")
    setEggDialog(egg)
    setEggName(egg.name)
    setEggDesc(egg.description || "")
    setEggAuthor(egg.author || "")
    setEggUpdateUrl(egg.updateUrl || "")
    setEggImage(egg.dockerImage)
    setEggDockerImagesRaw(egg.dockerImages ? JSON.stringify(egg.dockerImages, null, 2) : "")
    setEggStartup(egg.startup)
    const envLines = (egg.envVars || []).map((v: any) =>
      typeof v === "string" ? v : v.env_variable ?? ""
    ).filter(Boolean)
    setEggEnvVars(envLines.join("\n"))
    setEggEnvVarDefs(Array.isArray(egg.envVars) ? egg.envVars : [])
    setEggVisible(egg.visible)
    setEggFeatures((egg.features || []).join(", "))
    setEggFileDenylist((egg.fileDenylist || []).join("\n"))
    setEggAllowedPortals(egg.allowedPortals || [])
    setEggProcessStop(egg.processConfig?.stop?.value || "stop")
    const rawDone = egg.processConfig?.startup?.done
    setEggProcessDone(Array.isArray(rawDone) ? rawDone.join("\n") : typeof rawDone === "string" ? rawDone : "")
    setEggInstallContainer(egg.installScript?.container || "")
    setEggInstallEntrypoint(egg.installScript?.entrypoint || "bash")
    setEggInstallScript(egg.installScript?.script || "")
    setEggRootless(Boolean(egg.rootless))
    setEggRequiresKvm(Boolean(egg.requiresKvm))
  }

  async function saveEgg() {
    setEggLoading(true)
    const envVarNames = String(eggEnvVars || "").split("\n").map((s) => s.trim()).filter(Boolean)
    const existingEnvVars: Record<string, any>[] = (eggDialog !== "new" && eggDialog)
      ? ((eggDialog as AdminEgg).envVars || []) as any[]
      : []
    let envVarsOut: any[] = []
    if (eggEnvVarDefs && eggEnvVarDefs.length) {
      const defs = eggEnvVarDefs.map((v: any) => ({ ...v, env_variable: v.env_variable ?? v.name }))
      const defsMap = new Map(defs.map((d: any) => [d.env_variable || d.name, d]))
      for (const key of envVarNames) {
        if (!defsMap.has(key)) defsMap.set(key, { name: key, env_variable: key, default_value: "", user_viewable: true, user_editable: true, rules: "", field_type: "text" })
      }
      envVarsOut = Array.from(defsMap.values())
    } else {
      envVarsOut = envVarNames.map((key) => {
        const existing = existingEnvVars.find((v: any) => (v.env_variable ?? v.name) === key)
        return existing ?? { name: key, env_variable: key, default_value: "", user_viewable: true, user_editable: true, rules: "", field_type: "text" }
      })
    }

    // Build docker images object if raw text provided
    let dockerImages: Record<string, string> | undefined
    if (String(eggDockerImagesRaw || "").trim()) {
      try { dockerImages = JSON.parse(String(eggDockerImagesRaw || "")) } catch { /* ignore parse error */ }
    }

    // Build process config
    const donePatterns = String(eggProcessDone || "").split("\n").map(s => s.trim()).filter(Boolean)
    const processConfig = (donePatterns.length || String(eggProcessStop || "").trim()) ? {
      startup: { done: donePatterns, user_interaction: [], strip_ansi: false },
      stop: {
        type: String(eggProcessStop || "") === "SIGKILL" ? "kill" : String(eggProcessStop || "") === "SIGTERM" ? "stop" : "command",
        value: String(eggProcessStop || ""),
      },
      configs: [],
    } : undefined

    // Build install script
    const installScript = (String(eggInstallContainer || "").trim() || String(eggInstallScript || "").trim()) ? {
      container: String(eggInstallContainer || "").trim() || undefined,
      entrypoint: String(eggInstallEntrypoint || "").trim() || "bash",
      script: String(eggInstallScript || ""),
    } : undefined

    const features = String(eggFeatures || "").split(",").map(s => s.trim()).filter(Boolean)
    const fileDenylist = String(eggFileDenylist || "").split("\n").map(s => s.trim()).filter(Boolean)

    const body = {
      name: eggName,
      description: eggDesc,
      author: eggAuthor,
      updateUrl: eggUpdateUrl,
      dockerImage: eggImage,
      dockerImages,
      startup: eggStartup,
      envVars: envVarsOut,
      processConfig,
      installScript,
      features: features.length ? features : undefined,
      fileDenylist: fileDenylist.length ? fileDenylist : undefined,
      allowedPortals: eggAllowedPortals,
      rootless: eggRootless,
      requiresKvm: eggRequiresKvm,
      visible: eggVisible,
    }
    try {
      if (eggDialog === "new") {
        const created = await apiFetch(API_ENDPOINTS.adminEggs, { method: "POST", body: JSON.stringify(body) })
        setEggs((prev) => [...prev, created])
      } else if (eggDialog !== null && typeof eggDialog !== "string") {
        const updated = await apiFetch(`${API_ENDPOINTS.adminEggs}/${(eggDialog as AdminEgg).id}`, { method: "PUT", body: JSON.stringify(body) })
        setEggs((prev) => prev.map((e) => e.id === (eggDialog as AdminEgg).id ? updated : e))
      }
      setEggDialog(null)
    } finally {
      setEggLoading(false)
    }
  }

  async function forceSyncEgg(egg: AdminEgg) {
    if (!confirm(`Force-sync all servers using egg "${egg.name}"?`)) return
    setSyncingEggIds(prev => [...prev, egg.id])
    try {
      const res = await apiFetch(`/api/admin/eggs/${egg.id}/sync`, { method: 'POST', body: JSON.stringify({ respectOptOut: false }) })
      if (res && res.results) {
        const failed = res.results.filter((r: any) => r.status !== 'synced' && r.status !== 'skipped_opt_out')
        if (failed.length === 0) alert(`Sync requested for ${res.total} servers.`)
        else alert(`Sync completed: ${res.total} total, ${failed.length} failures.`)
      } else {
        alert('Sync request sent')
      }
    } catch (e: any) {
      alert('Sync failed: ' + (e?.message || String(e)))
    } finally {
      setSyncingEggIds(prev => prev.filter(id => id !== egg.id))
    }
  }

  async function deleteEgg(egg: AdminEgg) {
    if (!(await confirmAsync(`Delete egg "${egg.name}"?`))) return
    await apiFetch(`${API_ENDPOINTS.adminEggs}/${egg.id}`, { method: "DELETE" })
    setEggs((prev) => prev.filter((e) => e.id !== egg.id))
  }

  async function deleteAllEggs() {
    if (!(await confirmAsync('Delete ALL eggs? This cannot be undone.'))) return
    await apiFetch(API_ENDPOINTS.adminEggs, { method: "DELETE" })
    setEggs([])
  }

  async function toggleEggVisible(egg: AdminEgg) {
    await apiFetch(`${API_ENDPOINTS.adminEggs}/${egg.id}`, {
      method: "PUT",
      body: JSON.stringify({ visible: !egg.visible }),
    })
    setEggs((prev) => prev.map((e) => e.id === egg.id ? { ...e, visible: !egg.visible } : e))
  }

  async function doImportEgg() {
    setImportEggError("")
    setImportEggLoading(true)
    try {
      let body: Record<string, any>
      if (importEggMode === "url") {
        if (!String(importEggUrl || "").trim()) { setImportEggError("Please enter a URL."); return }
        body = { url: String(importEggUrl || "").trim() }
      } else {
        if (!String(importEggJson || "").trim()) { setImportEggError("Please paste egg JSON."); return }
        let parsed: any
        try { parsed = JSON.parse(String(importEggJson || "")) }
        catch { setImportEggError("Invalid JSON — could not parse."); return }
        body = { json: parsed }
      }
      const egg = await apiFetch(API_ENDPOINTS.adminEggImport, { method: "POST", body: JSON.stringify(body) })
      setEggs((prev) => [...prev, egg])
      setImportEggPreview(egg)
    } catch (err: any) {
      setImportEggError(err?.message ?? "Import failed.")
    } finally {
      setImportEggLoading(false)
    }
  }

  // ── AI Model functions ──
  function openNewAIModel() {
    setAiModelDialog("new")
    setAiModelName(""); setAiModelEndpoint(""); setAiModelExtraEndpoints([]); setAiModelApiKey("")
    setAiModelType("text"); setAiModelStatus("active"); setAiModelDescription(""); setAiModelMaxTokens(""); setAiModelTags("")
  }

  function openEditAIModel(m: AdminAIModel) {
    setAiModelDialog(m)
    setAiModelName(m.name)
    setAiModelEndpoint(m.endpoint || "")
    setAiModelExtraEndpoints(Array.isArray(m.endpoints) ? m.endpoints.map((x: any) => ({ id: x?.id, endpoint: x.endpoint || "", apiKey: x.apiKey || "" })) : [])
    setAiModelApiKey(m.apiKey || "")
    setAiModelType(m.config?.type || "text")
    setAiModelStatus(m.config?.status || "active")
    setAiModelDescription(m.config?.description || "")
    setAiModelMaxTokens(String(m.config?.maxTokens || ""))
    setAiModelTags(Array.isArray(m.tags) ? m.tags.join(", ") : "")
  }

  async function saveAIModel() {
    setAiModelLoading(true)
    const cleanExtraEndpoints = aiModelExtraEndpoints.filter((e) => e.endpoint.trim()).map((e) => ({ id: e.id, endpoint: e.endpoint.trim(), apiKey: e.apiKey?.trim() || undefined }))
    const body = {
      name: aiModelName,
      endpoint: aiModelEndpoint || undefined,
      endpoints: cleanExtraEndpoints.length ? cleanExtraEndpoints : undefined,
      apiKey: aiModelApiKey || undefined,
      tags: aiModelTags ? aiModelTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      config: {
        type: aiModelType,
        status: aiModelStatus,
        description: aiModelDescription || undefined,
        maxTokens: aiModelMaxTokens ? Number(aiModelMaxTokens) : undefined,
      },
    }
    try {
      if (aiModelDialog === "new") {
        const created = await apiFetch(API_ENDPOINTS.adminAiModels, { method: "POST", body: JSON.stringify(body) })
        setAiModels((prev) => [...prev, created])
      } else if (aiModelDialog !== null && typeof aiModelDialog !== "string") {
        const updated = await apiFetch(`${API_ENDPOINTS.adminAiModels}/${(aiModelDialog as AdminAIModel).id}`, { method: "PUT", body: JSON.stringify(body) })
        setAiModels((prev) => prev.map((m) => m.id === (aiModelDialog as AdminAIModel).id ? updated : m))
      }
      setAiModelDialog(null)
    } finally {
      setAiModelLoading(false)
    }
  }

  async function deleteAIModel(m: AdminAIModel) {
    if (!(await confirmAsync(`Delete model "${m.name}"?`))) return
    await apiFetch(`${API_ENDPOINTS.adminAiModels}/${m.id}`, { method: "DELETE" })
    setAiModels((prev) => prev.filter((x) => x.id !== m.id))
  }

  async function openAssignAiModel(m: AdminAIModel) {
    setAssignAiModel(m)
    setAssignAiUserId("")
    setAssignAiLimitTokens("")
    setAssignAiLimitRequests("")
    if (users.length === 0) {
      setAssignAiUsersLoading(true)
      try {
        const data = await apiFetch(API_ENDPOINTS.adminUsers)
        setUsers(data || [])
      } finally {
        setAssignAiUsersLoading(false)
      }
    }
  }

  async function submitAssignAiModel() {
    if (!assignAiModel || !assignAiUserId) return
    setAssignAiLoading(true)
    try {
      const limits: Record<string, number> = {}
      if (assignAiLimitTokens) limits.tokens = Number(assignAiLimitTokens)
      if (assignAiLimitRequests) limits.requests = Number(assignAiLimitRequests)
      await apiFetch(`/api/ai/models/${assignAiModel.id}/link-user`, {
        method: "POST",
        body: JSON.stringify({ userId: Number(assignAiUserId), limits: Object.keys(limits).length ? limits : undefined }),
      })
      setAssignAiModel(null)
    } finally {
      setAssignAiLoading(false)
    }
  }

  async function openGlobalUser(user: AdminUser) {
    setActiveTab("users")
    setUserSearch(user.email || "")
    await fetchUsers(1, user.email || "")
    openViewUser(user)
  }

  async function openGlobalOrganisation(org: AdminOrganisation) {
    setActiveTab("organisations")
    setOrgSearch(org.name || "")
    await fetchOrganisations(1, org.name || "")
    openEditOrg(org)
  }

  async function openGlobalServer(srv: AdminServer) {
    setActiveTab("servers")
    setServerSearch(srv.name || srv.uuid || "")
    await fetchServers(1, srv.name || srv.uuid || "")
    openEditServer(srv)
  }

  async function openGlobalOrder(order: AdminOrder) {
    setActiveTab("orders")
    setOrdersQuery(String(order.id))
    await fetchOrders(1, String(order.id))
    openEditOrder(order)
  }

  async function openViewUser(user: AdminUser) {
    setViewUserDialog(user)
    setViewUserProfile(null)
    setViewUserRoles([])
    setViewUserAssignRoleId("")
    setViewUserLoading(true)
    try {
      const [profileData, rolesData] = await Promise.all([
        apiFetch(`${API_ENDPOINTS.adminUsers}/${user.id}/profile`),
        apiFetch(API_ENDPOINTS.userRoles.replace(":id", String(user.id))),
      ])
      setViewUserProfile(profileData)
      setViewUserRoles(Array.isArray(rolesData) ? rolesData : [])
      // ensure global roles list is available for the assign dropdown
      if (roles.length === 0) {
        apiFetch(API_ENDPOINTS.roles).then((d) => setRoles(Array.isArray(d) ? d : [])).catch(() => { })
      }
    } catch { setViewUserProfile({ error: true }) }
    finally { setViewUserLoading(false) }
  }

  async function revokeAiLink(linkId: number) {
    if (!viewUserDialog) return
    await apiFetch(`${API_ENDPOINTS.adminUsers}/${viewUserDialog.id}/ai/${linkId}`, { method: "DELETE" })
    setViewUserProfile((prev: any) => prev ? { ...prev, aiModels: prev.aiModels.filter((l: any) => l.id !== linkId) } : prev)
  }

  // ── OAuth app management ───────────────────────────────────────────────────

  async function submitCreateOAuthApp() {
    if (!oauthCreateName.trim()) return
    setOauthCreateLoading(true)
    try {
      const cleanRedirects = oauthCreateRedirects.map((r) => r.trim()).filter(Boolean)
      const result = await apiFetch("/api/oauth/apps", {
        method: "POST",
        body: JSON.stringify({
          name: oauthCreateName.trim(),
          description: oauthCreateDesc.trim() || undefined,
          redirectUris: cleanRedirects,
          allowedScopes: oauthCreateScopes,
          grantTypes: oauthCreateGrants,
        }),
      })
      setOauthApps((prev) => [...prev, result])
      setOauthCreateOpen(false)
      setOauthNewSecret({ name: result.name, clientId: result.clientId, clientSecret: result.clientSecret })
      setOauthCreateName(""); setOauthCreateDesc(""); setOauthCreateRedirects([""])
      setOauthCreateScopes(["profile", "email"]); setOauthCreateGrants(["authorization_code", "refresh_token"])
    } catch (e: any) {
      alert(e.message || "Failed to create OAuth app")
    } finally {
      setOauthCreateLoading(false)
    }
  }

  function openEditOAuthApp(app: any) {
    setOauthEditApp(app)
    setOauthEditRedirects(app.redirectUris?.length ? [...app.redirectUris] : [""])
    setOauthEditScopes(app.allowedScopes || [])
    setOauthEditGrants(app.grantTypes || [])
  }

  async function submitEditOAuthApp() {
    if (!oauthEditApp) return
    setOauthEditLoading(true)
    try {
      const cleanRedirects = oauthEditRedirects.map((r) => r.trim()).filter(Boolean)
      const updated = await apiFetch(`/api/oauth/apps/${oauthEditApp.id}`, {
        method: "PUT",
        body: JSON.stringify({
          redirectUris: cleanRedirects,
          allowedScopes: oauthEditScopes,
          grantTypes: oauthEditGrants,
        }),
      })
      setOauthApps((prev) => prev.map((a) => a.id === oauthEditApp.id ? { ...a, ...updated } : a))
      setOauthEditApp(null)
    } catch (e: any) {
      alert(e.message || "Failed to update app")
    } finally {
      setOauthEditLoading(false)
    }
  }

  async function confirmRotateOAuthSecret() {
    if (!oauthRotateApp) return
    setOauthRotateLoading(true)
    try {
      const result = await apiFetch(`/api/oauth/apps/${oauthRotateApp.id}/rotate-secret`, { method: "POST" })
      const app = oauthRotateApp
      setOauthRotateApp(null)
      setOauthNewSecret({ name: app.name, clientId: app.clientId, clientSecret: result.clientSecret })
    } catch (e: any) {
      alert(e.message || "Failed to rotate secret")
    } finally {
      setOauthRotateLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <PanelHeader title={t("header.title")} description={t("header.description")} />
      <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t("privacy.sensitiveDataPrefix")} <strong>{privateMode ? t("privacy.hidden") : t("privacy.visible")}</strong>.
            {privateMode ? "" : ""}
          </span>
          <Button size="sm" variant="outline" onClick={() => {
            if (viewUserDialog) {
              setPendingViewUserDialog(viewUserDialog);
              setViewUserDialog(null);
            }
            if (editServerDialog) {
              setPendingViewServerDialog(editServerDialog);
              setEditServerDialog(null);
            }
            setPrivacyDialogOpen(true);
          }}>
            {privateMode ? t("actions.confirmReveal") : t("actions.rehidePrivateData")}
          </Button>
        </div>
      </div>
      {/* Global confirmation dialog used by page actions */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleConfirmCancel() }}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{confirmTitle}</DialogTitle>
            {confirmMessage && <DialogDescription className="text-sm text-muted-foreground">{confirmMessage}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleConfirmCancel()} disabled={confirmLoading}>{t("actions.cancel")}</Button>
            <Button variant="destructive" onClick={() => handleConfirmOk()} disabled={confirmLoading}>
              {confirmLoading ? t("actions.working") : t("actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privacy check before exposing sensitive fields */}
      <Dialog open={privacyDialogOpen} onOpenChange={(open) => setPrivacyDialogOpen(open)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("privacy.confirmationTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("privacy.confirmationDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPrivateMode(true);
              setRedactOrganisations(true);
              setRedactServers(true);
              setPrivacyDialogOpen(false);
              if (pendingViewUserDialog) {
                openViewUser(pendingViewUserDialog);
                setPendingViewUserDialog(null);
              }
              if (pendingViewServerDialog) {
                openEditServer(pendingViewServerDialog);
                setPendingViewServerDialog(null);
              }
            }}>
              {t("privacy.continueWithRedaction")}
            </Button>
            <Button onClick={() => {
              setPrivateMode(false);
              setRedactOrganisations(false);
              setRedactServers(false);
              setPrivacyDialogOpen(false);
              if (pendingViewUserDialog) {
                openViewUser(pendingViewUserDialog);
                setPendingViewUserDialog(null);
              }
              if (pendingViewServerDialog) {
                openEditServer(pendingViewServerDialog);
                setPendingViewServerDialog(null);
              }
            }}>
              {t("privacy.notRecording")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScrollArea className="flex-1 min-w-0 overflow-x-hidden max-w-full box-border">
        <div className="flex flex-col gap-6 p-4 sm:p-5 lg:p-6 max-w-full w-full min-w-0 overflow-x-hidden box-border">

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <StatCard title="Total Users" value={stats ? String(stats.totalUsers) : "—"} icon={Users} />
            <StatCard title="Organisations" value={stats ? String(stats.totalOrganisations) : "—"} icon={Building2} />
            <StatCard title="Servers" value={stats ? String(stats.totalServers) : "—"} icon={Server} />
            <StatCard title="Nodes" value={stats ? String(stats.totalNodes) : "—"} icon={HardDrive} />
            <StatCard title="Open Tickets" value={stats ? String(stats.pendingTickets) : "—"} icon={MessageSquare} />
            <StatCard title="Pending KYC" value={stats ? String(stats.pendingVerifications) : "—"} icon={FileText} />
            <StatCard title="Deletion Queue" value={stats ? String(stats.pendingDeletions) : "—"} icon={Trash2} />
            <StatCard title="Avg Response (30d)" value={stats ? formatDurationMs(stats.avgTicketResponseMs) : "N/A"} icon={Clock} />
            <StatCard title="Fraud Alerts" value={stats ? String((stats as any).fraudAlerts ?? 0) : "—"} icon={AlertTriangle} />
          </div>

          {/* Global search */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col gap-3 p-4">
              <h3 className="text-sm font-semibold text-foreground">{t("globalSearch.title")}</h3>
              <div className="relative flex items-center gap-2 max-w-lg">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={globalSearch}
                  onChange={(e) => fetchGlobalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchGlobalSearch(globalSearch)}
                  placeholder={t("globalSearch.placeholder")}
                  className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {globalSearch && (
                  <button
                    onClick={() => fetchGlobalSearch("")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={t("globalSearch.clearSearch")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {globalLoading ? (
                <p className="text-xs text-muted-foreground">{t("globalSearch.searching")}</p>
              ) : !globalSearch ? (
                <p className="text-xs text-muted-foreground">{t("globalSearch.hint")}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-2 bg-secondary/50">
                    <p className="text-xs font-semibold text-foreground mb-1">{t("globalSearch.users", { count: globalResults.users.length })}</p>
                    {globalResults.users.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t("globalSearch.noMatches")}</p>
                    ) : (
                      globalResults.users.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-foreground gap-2">
                          <div className="truncate">
                            <span className="font-semibold">#{item.id}</span>
                            {' '}
                            {redactName(item.firstName, item.lastName) || redact(item.email)}
                            <span className="ml-1 text-muted-foreground">{redact(item.email)}</span>
                          </div>
                          <button
                            className="rounded px-2 py-1 text-[10px] border border-border hover:bg-secondary transition"
                            onClick={() => openGlobalUser(item)}
                          >{t("actions.open")}</button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-2 bg-secondary/50">
                    <p className="text-xs font-semibold text-foreground mb-1">{t("globalSearch.organisations", { count: globalResults.organisations.length })}</p>
                    {globalResults.organisations.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t("globalSearch.noMatches")}</p>
                    ) : (
                      globalResults.organisations.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-foreground gap-2">
                          <div className="truncate">
                            <span className="font-semibold">#{item.id}</span>{' '}
                            {redactOrg(item.name)}
                            {item.handle ? <span className="ml-1 text-muted-foreground">({item.handle})</span> : null}
                          </div>
                          <button
                            className="rounded px-2 py-1 text-[10px] border border-border hover:bg-secondary transition"
                            onClick={() => openGlobalOrganisation(item)}
                          >{t("actions.open")}</button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-2 bg-secondary/50">
                    <p className="text-xs font-semibold text-foreground mb-1">{t("globalSearch.servers", { count: globalResults.servers.length })}</p>
                    {globalResults.servers.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t("globalSearch.noMatches")}</p>
                    ) : (
                      globalResults.servers.slice(0, 5).map((item) => {
                        const serverName = item.name && typeof item.name === 'string' ? item.name : item.uuid || JSON.stringify(item.name || '')
                        const nodeName = item.nodeName && typeof item.nodeName === 'string' ? item.nodeName : (item.nodeName ? JSON.stringify(item.nodeName) : '')
                        return (
                          <div key={item.uuid} className="flex items-center justify-between text-xs text-foreground gap-2">
                            <div className="truncate">
                              <span className="font-semibold">{redact(serverName)}</span>{' '}
                              <span className="text-muted-foreground">{nodeName ? `on ${redact(nodeName)}` : ''}</span>
                            </div>
                            <button
                              className="rounded px-2 py-1 text-[10px] border border-border hover:bg-secondary transition"
                              onClick={() => openGlobalServer(item)}
                            >{t("actions.open")}</button>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-2 bg-secondary/50">
                    <p className="text-xs font-semibold text-foreground mb-1">{t("globalSearch.orders", { count: globalResults.orders.length })}</p>
                    {globalResults.orders.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t("globalSearch.noMatches")}</p>
                    ) : (
                      globalResults.orders.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-foreground gap-2">
                          <div className="truncate">
                            <span className="font-semibold">#{item.id}</span>{' '}
                            {redact(item.description || t("globalSearch.orderFallback"))} {item.userId ? <span className="text-muted-foreground">{t("globalSearch.forUser", { id: privateMode ? "████████" : String(item.userId) })}</span> : null}
                          </div>
                          <button
                            className="rounded px-2 py-1 text-[10px] border border-border hover:bg-secondary transition"
                            onClick={() => openGlobalOrder(item)}
                          >{t("actions.open")}</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0 max-w-full">
            <TabsList
              className="flex w-full min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden px-2 border border-border bg-secondary/50"
            >
              {[
                { value: "users", label: t("tabs.users") },
                { value: "metrics", label: t("tabs.metrics") },
                { value: "export-jobs", label: t("tabs.exportJobs") },
                { value: "organisations", label: t("tabs.organisations") },
                { value: "servers", label: t("tabs.servers") },
                { value: "tickets", label: t("tabs.tickets"), feature: "ticketing" },
                { value: "applications", label: t("tabs.applications"), feature: "applications" },
                { value: "verifications", label: t("tabs.kyc") },
                { value: "deletions", label: t("tabs.deletions") },
                { value: "nodes", label: t("tabs.nodes") },
                { value: "tunnels", label: t("tabs.tunnels"), feature: "tunnels" },
                { value: "eggs", label: t("tabs.eggs") },
                { value: "ai", label: t("tabs.aiModels"), feature: "ai" },
                { value: "announcements", label: t("tabs.announcements") },
                { value: "outbound-emails", label: t("tabs.outboundEmails") },
                { value: "antiabuse", label: t("tabs.antiabuse") },
                { value: "fraud", label: t("tabs.fraud") },
                { value: "roles", label: t("tabs.roles") },
                { value: "logs", label: t("tabs.logs") },
                { value: "oauth", label: t("tabs.oauth"), feature: "oauth" },
                { value: "databases", label: t("tabs.databases") },
                { value: "plans", label: t("tabs.plans") },
                { value: "orders", label: t("tabs.orders") },
                { value: "settings", label: t("tabs.settings") },
              ]
                .filter((t) => !t.feature || panelSettings.featureToggles[t.feature])
                .map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap max-w-full"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
            </TabsList>

            {/* ═══════════════ USERS ══════════════════════════════════════════ */}
            <TabsContent value="users" className="mt-4">
              {activeTab === "users" ? (
                <UsersTab
                  ctx={{
                    userSearch,
                    setUserSearch,
                    fetchUsers,
                    setUserSearchFocused,
                    userSearchFocused,
                    filteredUsers,
                    openViewUser,
                    redactName,
                    redact,
                    usersTotal,
                    forceRefreshTab,
                    users,
                    openEditUser,
                    toggleSuspend,
                    resetDemo,
                    startExportJob,
                    userExportJobId,
                    exportJobs,
                    deassignStudent,
                    requireStudentReverify,
                    deleteUser,
                    usersPage,
                    USERS_PER,
                  }}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="metrics" className="mt-4">
              {activeTab === "metrics" ? <MetricsTab /> : null}
            </TabsContent>

            {/* ═══════════════ EXPORT JOBS ═══════════════════════════════════ */}
            <TabsContent value="export-jobs" className="mt-4">
              {activeTab === "export-jobs" ? (
                <ExportJobsTab
                  ctx={{
                    exportJobsMeta,
                    fetchExportJobs,
                    exportJobsLoading,
                    exportJobRows,
                    createExportShareLink,
                    exportShareLoading,
                    exportShareLinks,
                  }}
                />
              ) : null}
            </TabsContent>

            {/* ═══════════════ ORGANISATIONS ══════════════════════════════════ */}
            <TabsContent value="organisations" className="mt-4">
              {activeTab === "organisations" ? (
                <OrganisationsTab
                  ctx={{
                    orgSearch,
                    setOrgSearch,
                    fetchOrganisations,
                    organisationsTotal,
                    setRedactOrganisations,
                    redactOrganisations,
                    forceRefreshTab,
                    filteredOrgs,
                    organisations,
                    redactOrg,
                    redactOrgName,
                    openEditOrg,
                    deleteOrg,
                    organisationsPage,
                    ORGS_PER,
                    editOrgDialog,
                    setEditOrgDialog,
                    editOrgName,
                    setEditOrgName,
                    editOrgHandle,
                    setEditOrgHandle,
                    editOrgTier,
                    setEditOrgTier,
                    TIERS,
                    editOrgOwnerId,
                    setEditOrgOwnerId,
                    editOrgIsStaff,
                    setEditOrgIsStaff,
                    editOrgAddMemberId,
                    setEditOrgAddMemberId,
                    editOrgAddMemberRole,
                    setEditOrgAddMemberRole,
                    editOrgMemberLoading,
                    setEditOrgMemberLoading,
                    saveEditOrg,
                    editOrgLoading,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ SERVERS ════════════════════════════════════════ */}
            <TabsContent value="servers" className="mt-4">
              {activeTab === "servers" ? (
                <ServersTab
                  ctx={{
                    serverSearch,
                    setServerSearch,
                    fetchServers,
                    serversTotal,
                    setRedactServers,
                    redactServers,
                    forceRefreshTab,
                    syncFromWings,
                    syncingFromWings,
                    loadTab,
                    openCreateServer,
                    filteredServers,
                    servers,
                    redactText,
                    privateMode,
                    serverPower,
                    unsuspendServer,
                    suspendServer,
                    openEditServer,
                    deleteServer,
                    serversPage,
                    SERVERS_PER,
                    editServerDialog,
                    setEditServerDialog,
                    esName,
                    setEsName,
                    esDesc,
                    setEsDesc,
                    esUserId,
                    setEsUserId,
                    esMemory,
                    setEsMemory,
                    esDisk,
                    setEsDisk,
                    esCpu,
                    setEsCpu,
                    esSwap,
                    setEsSwap,
                    esDockerImage,
                    setEsDockerImage,
                    esStartup,
                    setEsStartup,
                    esEggId,
                    setEsEggId,
                    eggs,
                    esAllocations,
                    setEsAllocations,
                    esEditFqdnIdx,
                    setEsEditFqdnIdx,
                    esEditFqdnVal,
                    setEsEditFqdnVal,
                    esAllocIp,
                    setEsAllocIp,
                    esAllocPort,
                    setEsAllocPort,
                    esAllocFqdn,
                    setEsAllocFqdn,
                    esError,
                    reinstallServerFromDialog,
                    esReinstalling,
                    saveEditServer,
                    esLoading,
                    createServerOpen,
                    setCreateServerOpen,
                    csName,
                    setCsName,
                    csNodeId,
                    setCsNodeId,
                    nodes,
                    csEggId,
                    setCsEggId,
                    csUserId,
                    setCsUserId,
                    csMemory,
                    setCsMemory,
                    csDisk,
                    setCsDisk,
                    csCpu,
                    setCsCpu,
                    csKvmPassthroughEnabled,
                    setCsKvmPassthroughEnabled,
                    csError,
                    submitCreateServer,
                    csLoading,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ TICKETS ════════════════════════════════════════ */}
            <TabsContent value="tickets" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Status Filter Tabs */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 p-2 sm:p-3">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
                      {["all", "opened", "awaiting_staff_reply", "replied", "closed", "archived"].map((f) => {
                        const labels: Record<string, string> = {
                          all: "All",
                          opened: "Open",
                          awaiting_staff_reply: "Awaiting Reply",
                          replied: "Replied",
                          closed: "Closed",
                          archived: "Archived",
                        }
                        const counts: Record<string, string> = {
                          awaiting_staff_reply: "!",
                        }
                        return (
                          <button
                            key={f}
                            onClick={() => setTicketFilterAndReload(f)}
                            className={`relative rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${ticketFilter === f
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              }`}
                          >
                            {labels[f] || f}
                            {counts[f] && ticketFilter !== f && (
                              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive/20 text-[10px] font-bold text-destructive">
                                {counts[f]}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => forceRefreshTab("tickets")}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                      title="Refresh"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Search, Filters & Bulk Actions */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    {/* Search row */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="relative flex-1 max-w-md">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            placeholder="Search by user ID or email…"
                            value={ticketSearch}
                            onChange={(e) => setTicketSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && fetchTickets(1, ticketSearch, ticketPriorityFilter)}
                            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                          />
                          {ticketSearch && (
                            <button
                              onClick={() => { setTicketSearch(""); fetchTickets(1, "", ticketPriorityFilter); }}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filters */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select onValueChange={(v) => setTicketPriorityFilter(v)} value={ticketPriorityFilter}>
                          <SelectTrigger className="h-8 w-[130px] text-xs border-border">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any Priority</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>

                        <label className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-secondary transition-colors">
                          <input
                            type="checkbox"
                            checked={showAiTouched}
                            onChange={(e) => setShowAiTouched(e.target.checked)}
                            className="rounded border-border"
                          />
                          <span className="whitespace-nowrap">AI-handled</span>
                        </label>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setTicketSearch("");
                            setTicketPriorityFilter("any");
                            setShowAiTouched(false);
                            setTicketFilter("all");
                            fetchTickets(1, "", "any");
                          }}
                          className="h-8 text-xs text-muted-foreground"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>

                    {/* Bulk actions */}
                    {selectedTicketIds.length > 0 && (
                      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-medium text-primary">{selectedTicketIds.length} selected</span>
                        </div>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1"
                            onClick={async () => {
                              if (!window.confirm(`Archive ${selectedTicketIds.length} ticket(s)?`)) return;
                              await apiFetch(API_ENDPOINTS.adminTicketsBulkArchive, { method: "POST", body: JSON.stringify({ ids: selectedTicketIds, archived: true }) });
                              fetchTickets(1, ticketSearch, ticketPriorityFilter);
                            }}
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1"
                            onClick={async () => {
                              if (!window.confirm(`Unarchive ${selectedTicketIds.length} ticket(s)?`)) return;
                              await apiFetch(API_ENDPOINTS.adminTicketsBulkArchive, { method: "POST", body: JSON.stringify({ ids: selectedTicketIds, archived: false }) });
                              fetchTickets(1, ticketSearch, ticketPriorityFilter);
                            }}
                          >
                            <ArchiveRestore className="h-3 w-3" />
                            Unarchive
                          </Button>
                          <button
                            onClick={() => setSelectedTicketIds([])}
                            className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden xl:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium w-10">
                            <input
                              type="checkbox"
                              checked={selectedTicketIds.length > 0 && selectedTicketIds.length === tickets.length}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedTicketIds(tickets.map((t) => t.id));
                                else setSelectedTicketIds([]);
                              }}
                              className="rounded border-border"
                            />
                          </th>
                          <th className="px-4 py-3 text-left font-medium">Ticket</th>
                          <th className="px-4 py-3 text-left font-medium">User</th>
                          <th className="px-4 py-3 text-left font-medium">Department</th>
                          <th className="px-4 py-3 text-left font-medium">Assigned</th>
                          <th className="px-4 py-3 text-left font-medium">Priority</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Created</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTickets.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  {tickets.length === 0 ? "Loading tickets…" : "No tickets match your filters"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredTickets.map((ticket, i) => (
                            <tr key={ticket.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedTicketIds.includes(ticket.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedTicketIds((prev) => [...new Set([...prev, ticket.id])]);
                                    else setSelectedTicketIds((prev) => prev.filter((id) => id !== ticket.id));
                                  }}
                                  className="rounded border-border"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="font-mono text-[11px] text-muted-foreground shrink-0 mt-0.5">#{ticket.id}</span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                                      {ticket.aiTouched && (
                                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                                          AI
                                        </span>
                                      )}
                                      {ticket.archived && (
                                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground border border-border shrink-0">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                    {((ticket.messages && ticket.messages.length) || ticket.adminReply) && (
                                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">
                                        {ticket.messages?.length
                                          ? ticket.messages[ticket.messages.length - 1].message
                                          : ticket.adminReply || ""}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-foreground">
                                  {ticket.user ? redactName(ticket.user.firstName, ticket.user.lastName) : redact(ticket.userId)}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">{ticket.department || "—"}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">{ticket.assignedTo ? `#${ticket.assignedTo}` : "—"}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={priorityColor[ticket.priority] || priorityColor.medium}>
                                  {ticket.priority}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={ticketStatusColor[ticket.status] || ticketStatusColor.opened}>
                                  {ticket.status?.replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(ticket.created).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                  {ticket.status !== "closed" && (
                                    <button onClick={() => openReply(ticket)} title="Reply"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                      <MessageSquare className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer" title="Open in new tab"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tablet Table (simplified columns) */}
                <div className="rounded-xl border border-border bg-card hidden md:block xl:hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-3 py-3 text-left font-medium w-10">
                            <input
                              type="checkbox"
                              checked={selectedTicketIds.length > 0 && selectedTicketIds.length === tickets.length}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedTicketIds(tickets.map((t) => t.id));
                                else setSelectedTicketIds([]);
                              }}
                              className="rounded border-border"
                            />
                          </th>
                          <th className="px-3 py-3 text-left font-medium">Ticket</th>
                          <th className="px-3 py-3 text-left font-medium">Priority</th>
                          <th className="px-3 py-3 text-left font-medium">Status</th>
                          <th className="px-3 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTickets.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  {tickets.length === 0 ? "Loading tickets…" : "No tickets match your filters"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredTickets.map((ticket, i) => (
                            <tr key={ticket.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedTicketIds.includes(ticket.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedTicketIds((prev) => [...new Set([...prev, ticket.id])]);
                                    else setSelectedTicketIds((prev) => prev.filter((id) => id !== ticket.id));
                                  }}
                                  className="rounded border-border"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[11px] text-muted-foreground">#{ticket.id}</span>
                                    <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                                    {ticket.aiTouched && (
                                      <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 shrink-0">AI</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {ticket.user ? redactName(ticket.user.firstName, ticket.user.lastName) : redact(ticket.userId)}
                                    {ticket.department && <> · {ticket.department}</>}
                                    {" · "}
                                    {new Date(ticket.created).toLocaleDateString()}
                                  </p>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline" className={`text-[10px] ${priorityColor[ticket.priority] || priorityColor.medium}`}>
                                  {ticket.priority}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-col gap-1">
                                  <Badge variant="outline" className={`text-[10px] ${ticketStatusColor[ticket.status] || ticketStatusColor.opened}`}>
                                    {ticket.status?.replace(/_/g, " ")}
                                  </Badge>
                                  {ticket.archived && (
                                    <span className="text-[10px] text-muted-foreground">Archived</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-end gap-0.5">
                                  {ticket.status !== "closed" && (
                                    <button onClick={() => openReply(ticket)} title="Reply"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                      <MessageSquare className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="flex flex-col gap-3 md:hidden">
                  {/* Select all on mobile */}
                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.length > 0 && selectedTicketIds.length === tickets.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTicketIds(tickets.map((t) => t.id));
                          else setSelectedTicketIds([]);
                        }}
                        className="rounded border-border"
                      />
                      Select all
                    </label>
                    {ticketsTotal ? (
                      <span className="text-xs text-muted-foreground">{ticketsTotal} ticket{ticketsTotal !== 1 ? "s" : ""}</span>
                    ) : null}
                  </div>

                  {filteredTickets.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          {tickets.length === 0 ? "Loading tickets…" : "No tickets match your filters"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    filteredTickets.map((ticket, i) => {
                      const isSelected = selectedTicketIds.includes(ticket.id)
                      return (
                        <div
                          key={ticket.id ?? i}
                          className={`rounded-xl border bg-card overflow-hidden transition-colors ${isSelected ? "border-primary/40 bg-primary/5" : "border-border"
                            }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start gap-3 p-4 pb-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedTicketIds((prev) => [...new Set([...prev, ticket.id])]);
                                else setSelectedTicketIds((prev) => prev.filter((id) => id !== ticket.id));
                              }}
                              className="rounded border-border mt-0.5 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[11px] text-muted-foreground">#{ticket.id}</span>
                                    {ticket.aiTouched && (
                                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">AI</span>
                                    )}
                                    {ticket.archived && (
                                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground border border-border">Archived</span>
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold text-foreground mt-0.5 line-clamp-2">{ticket.subject}</p>
                                </div>
                                <Badge variant="outline" className={`shrink-0 text-[10px] ${priorityColor[ticket.priority] || priorityColor.medium}`}>
                                  {ticket.priority}
                                </Badge>
                              </div>

                              {/* Latest reply preview */}
                              {((ticket.messages && ticket.messages.length) || ticket.adminReply) && (
                                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                                  {ticket.messages?.length
                                    ? ticket.messages[ticket.messages.length - 1].message
                                    : ticket.adminReply || ""}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Card Details */}
                          <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                            <div className="bg-card px-3 py-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
                              <Badge variant="outline" className={`text-[10px] ${ticketStatusColor[ticket.status] || ticketStatusColor.opened}`}>
                                {ticket.status?.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="bg-card px-3 py-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">User</p>
                              <p className="text-xs text-foreground truncate">
                                {ticket.user ? redactName(ticket.user.firstName, ticket.user.lastName) : redact(ticket.userId)}
                              </p>
                            </div>
                            <div className="bg-card px-3 py-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Created</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(ticket.created).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {/* Extra info row */}
                          {(ticket.department || ticket.assignedTo) && (
                            <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground">
                              {ticket.department && (
                                <span className="flex items-center gap-1">
                                  <Folder className="h-3 w-3" />
                                  {ticket.department}
                                </span>
                              )}
                              {ticket.assignedTo && (
                                <span className="flex items-center gap-1">
                                  <UserCog className="h-3 w-3" />
                                  #{ticket.assignedTo}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Card Actions */}
                          <div className="flex items-center border-t border-border divide-x divide-border">
                            {ticket.status !== "closed" && (
                              <button
                                onClick={() => openReply(ticket)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                            )}
                            <a
                              href={`/dashboard/tickets/${ticket.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Open</span>
                            </a>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Pagination */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <p className="text-xs text-muted-foreground">
                      Page <span className="font-medium text-foreground">{ticketsPage}</span>
                      {ticketsTotal ? (
                        <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(ticketsTotal / TICKETS_PER))}</span></>
                      ) : null}
                      {ticketsTotal ? (
                        <span className="hidden sm:inline"> · {ticketsTotal} total</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (ticketsPage > 1) fetchTickets(ticketsPage - 1, ticketSearch, ticketPriorityFilter); }}
                        disabled={ticketsPage <= 1}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                        <span className="hidden sm:inline ml-1">Previous</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!ticketsTotal || ticketsPage < Math.ceil((ticketsTotal || 0) / TICKETS_PER))
                            fetchTickets(ticketsPage + 1, ticketSearch, ticketPriorityFilter);
                        }}
                        disabled={ticketsTotal ? ticketsPage >= Math.ceil(ticketsTotal / TICKETS_PER) : tickets.length < TICKETS_PER}
                        className="h-8 px-3 text-xs"
                      >
                        <span className="hidden sm:inline mr-1">Next</span>
                        <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="applications" className="mt-4">
              {activeTab === "applications" ? <ApplicationsTab /> : null}
            </TabsContent>
            <TabsContent value="antiabuse" className="mt-4">
              {activeTab === "antiabuse" ? <AntiAbuseTab /> : null}
            </TabsContent>
            {/* ═══════════════ KYC / VERIFICATIONS ════════════════════════════ */}
            <TabsContent value="verifications" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">ID Verifications</p>
                        <p className="text-xs text-muted-foreground">Review submitted KYC documents</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Pending count */}
                      {verifications.filter((v) => v.status === "pending").length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                          <Clock className="h-3 w-3" />
                          <span className="hidden sm:inline">
                            {verifications.filter((v) => v.status === "pending").length} pending
                          </span>
                          <span className="sm:hidden">
                            {verifications.filter((v) => v.status === "pending").length}
                          </span>
                        </span>
                      )}
                      <button
                        onClick={() => forceRefreshTab("verifications")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1">
                  {(["all", "pending", "verified", "failed"] as const).map((f) => {
                    const config: Record<string, { label: string; icon: any; color: string; activeColor: string }> = {
                      all: { label: "All", icon: List, color: "text-muted-foreground", activeColor: "bg-secondary text-foreground" },
                      pending: { label: "Pending", icon: Clock, color: "text-warning", activeColor: "bg-warning/15 text-warning" },
                      verified: { label: "Verified", icon: CheckCircle, color: "text-emerald-400", activeColor: "bg-emerald-500/15 text-emerald-400" },
                      failed: { label: "Failed", icon: XCircle, color: "text-destructive", activeColor: "bg-destructive/15 text-destructive" },
                    }
                    const c = config[f]
                    const Icon = c.icon
                    const count = f === "all" ? verifications.length : verifications.filter((v) => v.status === f).length
                    const isActive = (verificationFilter || "all") === f

                    return (
                      <button
                        key={f}
                        onClick={() => setVerificationFilter(f === "all" ? "" : f)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive ? c.activeColor : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                      >
                        <Icon className="h-3 w-3" />
                        {c.label}
                        <span className={`ml-0.5 text-[10px] ${isActive ? "opacity-80" : "opacity-50"}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">User</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Documents</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = verificationFilter
                            ? verifications.filter((v) => v.status === verificationFilter)
                            : verifications

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={4} className="px-4 py-12 text-center">
                                  <div className="flex flex-col items-center gap-2">
                                    <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                                    <p className="text-sm text-muted-foreground">
                                      {verifications.length === 0
                                        ? "No verification requests found"
                                        : "No verifications match this filter"}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )
                          }

                          return filtered.map((v, i) => {
                            const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                              pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning", label: "Pending" },
                              verified: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: "Verified" },
                              failed: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive", label: "Failed" },
                            }
                            const sc = statusConfig[v.status] || statusConfig.pending

                            return (
                              <tr key={v.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {v.user?.avatarUrl ? (
                                      <img src={v.user.avatarUrl} alt={`${v.user.firstName || "User"} avatar`} className="h-8 w-8 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                        {v.user?.firstName?.[0]?.toUpperCase() || "?"}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {v.user ? redactName(v.user.firstName, v.user.lastName) : redact(v.userId)}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{redact(v.user?.email)}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={sc.class}>
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                    {sc.label}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {v.idDocumentUrl && (
                                      <button
                                        onClick={() => v.idDocumentUrl && openPreview(v.idDocumentUrl, "ID Document")}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                                      >
                                        <FileText className="h-3 w-3 text-primary" />
                                        ID Doc
                                      </button>
                                    )}
                                    {v.selfieUrl && (
                                      <button
                                        onClick={() => v.selfieUrl && openPreview(v.selfieUrl, "Selfie")}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                                      >
                                        <Camera className="h-3 w-3 text-primary" />
                                        Selfie
                                      </button>
                                    )}
                                    {!v.idDocumentUrl && !v.selfieUrl && (
                                      <span className="text-xs text-muted-foreground">No documents</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    {v.status === "pending" && (
                                      <>
                                        <button onClick={() => reviewVerification(v.id, "verified")} title="Approve"
                                          className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                                          <CheckCircle className="h-3.5 w-3.5" />
                                        </button>
                                        <button onClick={() => reviewVerification(v.id, "failed")} title="Reject"
                                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                          <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                      </>
                                    )}
                                    {v.status === "verified" && (
                                      <button onClick={() => reviewVerification(v.id, "failed")} title="Revoke verification"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                        <XCircle className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => deleteVerification(v.id)} title="Delete record & files"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="flex flex-col gap-3 md:hidden">
                  {(() => {
                    const filtered = verificationFilter
                      ? verifications.filter((v) => v.status === verificationFilter)
                      : verifications

                    if (filtered.length === 0) {
                      return (
                        <div className="rounded-xl border border-border bg-card px-4 py-12">
                          <div className="flex flex-col items-center gap-2">
                            <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">
                              {verifications.length === 0
                                ? "No verification requests found"
                                : "No verifications match this filter"}
                            </p>
                          </div>
                        </div>
                      )
                    }

                    return filtered.map((v, i) => {
                      const statusConfig: Record<string, { class: string; dot: string; label: string; borderClass: string }> = {
                        pending: { class: "text-warning", dot: "bg-warning", label: "Pending Review", borderClass: "border-warning/30" },
                        verified: { class: "text-emerald-400", dot: "bg-emerald-400", label: "Verified", borderClass: "border-emerald-500/30" },
                        failed: { class: "text-destructive", dot: "bg-destructive", label: "Failed", borderClass: "border-destructive/30" },
                      }
                      const sc = statusConfig[v.status] || statusConfig.pending

                      return (
                        <div
                          key={v.id ?? i}
                          className={`rounded-xl border bg-card overflow-hidden ${v.status === "pending" ? "border-warning/20" : "border-border"
                            }`}
                        >
                          {/* Pending highlight bar */}
                          {v.status === "pending" && (
                            <div className="h-0.5 bg-gradient-to-r from-warning/60 via-warning to-warning/60" />
                          )}

                          {/* Card Header */}
                          <div className="flex items-start gap-3 p-4 pb-3">
                            {v.user?.avatarUrl ? (
                              <img src={v.user.avatarUrl} alt={`${v.user.firstName || "User"} avatar`} className="h-10 w-10 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="relative h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                                {v.user?.firstName?.[0]?.toUpperCase() || "?"}
                                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${sc.dot}`} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {v.user ? redactName(v.user.firstName, v.user.lastName) : redact(v.userId)}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{redact(v.user?.email)}</p>
                                </div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {sc.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Documents */}
                          <div className="px-4 pb-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Documents</p>
                            <div className="flex items-center gap-2">
                              {v.idDocumentUrl && (
                                <button
                                  onClick={() => v.idDocumentUrl && openPreview(v.idDocumentUrl, "ID Document")}
                                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                                >
                                  <FileText className="h-4 w-4 text-primary" />
                                  <div className="text-left">
                                    <p className="text-xs font-medium">ID Document</p>
                                    <p className="text-[10px] text-muted-foreground">Tap to preview</p>
                                  </div>
                                </button>
                              )}
                              {v.selfieUrl && (
                                <button
                                  onClick={() => v.selfieUrl && openPreview(v.selfieUrl, "Selfie")}
                                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Camera className="h-4 w-4 text-primary" />
                                  <div className="text-left">
                                    <p className="text-xs font-medium">Selfie</p>
                                    <p className="text-[10px] text-muted-foreground">Tap to preview</p>
                                  </div>
                                </button>
                              )}
                              {!v.idDocumentUrl && !v.selfieUrl && (
                                <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border py-3">
                                  <p className="text-xs text-muted-foreground">No documents uploaded</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center border-t border-border divide-x divide-border">
                            {v.status === "pending" && (
                              <>
                                <button
                                  onClick={() => reviewVerification(v.id, "verified")}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => reviewVerification(v.id, "failed")}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                            {v.status === "verified" && (
                              <button
                                onClick={() => reviewVerification(v.id, "failed")}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </button>
                            )}
                            <button
                              onClick={() => deleteVerification(v.id)}
                              className={`${v.status === "failed" ? "flex-1" : ""} flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ DELETION REQUESTS ══════════════════════════════ */}
            <TabsContent value="deletions" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                        <UserX className="h-4 w-4 text-destructive" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Deletion Requests</p>
                        <p className="text-xs text-muted-foreground">Review and act on account deletion requests</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {deletions.filter((d) => d.status === "pending").length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="hidden sm:inline">
                            {deletions.filter((d) => d.status === "pending").length} pending
                          </span>
                          <span className="sm:hidden">
                            {deletions.filter((d) => d.status === "pending").length}
                          </span>
                        </span>
                      )}
                      <button
                        onClick={() => forceRefreshTab("deletions")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1">
                  {(["all", "pending", "approved", "rejected"] as const).map((f) => {
                    const config: Record<string, { label: string; icon: any; activeColor: string }> = {
                      all: { label: "All", icon: List, activeColor: "bg-secondary text-foreground" },
                      pending: { label: "Pending", icon: Clock, activeColor: "bg-warning/15 text-warning" },
                      approved: { label: "Approved", icon: CheckCircle, activeColor: "bg-emerald-500/15 text-emerald-400" },
                      rejected: { label: "Rejected", icon: XCircle, activeColor: "bg-destructive/15 text-destructive" },
                    }
                    const c = config[f]
                    const Icon = c.icon
                    const count = f === "all" ? deletions.length : deletions.filter((d) => d.status === f).length
                    const isActive = (deletionFilter || "all") === f

                    return (
                      <button
                        key={f}
                        onClick={() => setDeletionFilter(f === "all" ? "" : f)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive ? c.activeColor : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                      >
                        <Icon className="h-3 w-3" />
                        {c.label}
                        <span className={`ml-0.5 text-[10px] ${isActive ? "opacity-80" : "opacity-50"}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">User</th>
                          <th className="px-4 py-3 text-left font-medium">Requested</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = deletionFilter
                            ? deletions.filter((d) => d.status === deletionFilter)
                            : deletions

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={4} className="px-4 py-12 text-center">
                                  <div className="flex flex-col items-center gap-2">
                                    <UserX className="h-8 w-8 text-muted-foreground/50" />
                                    <p className="text-sm text-muted-foreground">
                                      {deletions.length === 0
                                        ? "No deletion requests found"
                                        : "No requests match this filter"}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )
                          }

                          return filtered.map((d, i) => {
                            const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                              pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning", label: "Pending" },
                              approved: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: "Approved" },
                              rejected: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive", label: "Rejected" },
                            }
                            const sc = statusConfig[d.status] || statusConfig.pending

                            const requestedDate = new Date(d.requestedAt)
                            const daysAgo = Math.floor((Date.now() - requestedDate.getTime()) / (1000 * 60 * 60 * 24))

                            return (
                              <tr key={d.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {d.user?.avatarUrl ? (
                                      <img src={d.user.avatarUrl} alt={`${d.user.firstName || "User"} avatar`} className="h-8 w-8 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <div className="relative h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-semibold text-destructive shrink-0">
                                        {d.user?.firstName?.[0]?.toUpperCase() || "?"}
                                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {d.user ? redactName(d.user.firstName, d.user.lastName) : redact(d.userId)}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{redact(d.user?.email)}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="text-sm text-foreground">{requestedDate.toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={sc.class}>
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                    {sc.label}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    {d.status === "pending" && (
                                      <>
                                        <button onClick={() => reviewDeletion(d.id, "approved")} title="Approve deletion"
                                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                          <CheckCircle className="h-3.5 w-3.5" />
                                          <span className="hidden lg:inline">Approve</span>
                                        </button>
                                        <button onClick={() => reviewDeletion(d.id, "rejected")} title="Reject deletion"
                                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                          <XCircle className="h-3.5 w-3.5" />
                                          <span className="hidden lg:inline">Reject</span>
                                        </button>
                                      </>
                                    )}
                                    {d.status === "approved" && (
                                      <span className="text-xs text-muted-foreground italic">Processed</span>
                                    )}
                                    {d.status === "rejected" && (
                                      <button onClick={() => reviewDeletion(d.id, "approved")} title="Reconsider — approve deletion"
                                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        <span className="hidden lg:inline">Reconsider</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="flex flex-col gap-3 md:hidden">
                  {(() => {
                    const filtered = deletionFilter
                      ? deletions.filter((d) => d.status === deletionFilter)
                      : deletions

                    if (filtered.length === 0) {
                      return (
                        <div className="rounded-xl border border-border bg-card px-4 py-12">
                          <div className="flex flex-col items-center gap-2">
                            <UserX className="h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">
                              {deletions.length === 0
                                ? "No deletion requests found"
                                : "No requests match this filter"}
                            </p>
                          </div>
                        </div>
                      )
                    }

                    return filtered.map((d, i) => {
                      const statusConfig: Record<string, { class: string; dot: string; label: string; borderTint: string }> = {
                        pending: { class: "text-warning", dot: "bg-warning", label: "Pending Review", borderTint: "border-warning/20" },
                        approved: { class: "text-emerald-400", dot: "bg-emerald-400", label: "Approved", borderTint: "border-emerald-500/20" },
                        rejected: { class: "text-destructive", dot: "bg-destructive", label: "Rejected", borderTint: "border-border" },
                      }
                      const sc = statusConfig[d.status] || statusConfig.pending

                      const requestedDate = new Date(d.requestedAt)
                      const daysAgo = Math.floor((Date.now() - requestedDate.getTime()) / (1000 * 60 * 60 * 24))

                      return (
                        <div
                          key={d.id ?? i}
                          className={`rounded-xl border bg-card overflow-hidden ${d.status === "pending" ? sc.borderTint : "border-border"
                            }`}
                        >
                          {/* Pending urgency bar */}
                          {d.status === "pending" && (
                            <div className={`h-0.5 ${daysAgo >= 14
                              ? "bg-gradient-to-r from-destructive/60 via-destructive to-destructive/60"
                              : daysAgo >= 7
                                ? "bg-gradient-to-r from-warning/60 via-warning to-warning/60"
                                : "bg-gradient-to-r from-primary/40 via-primary to-primary/40"
                              }`} />
                          )}

                          {/* Card Header */}
                          <div className="flex items-start gap-3 p-4 pb-3">
                            {d.user?.avatarUrl ? (
                              <img src={d.user.avatarUrl} alt={`${d.user.firstName || "User"} avatar`} className="h-10 w-10 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="relative h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-sm font-semibold text-destructive shrink-0">
                                {d.user?.firstName?.[0]?.toUpperCase() || "?"}
                                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${sc.dot}`} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {d.user ? redactName(d.user.firstName, d.user.lastName) : redact(d.userId)}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{redact(d.user?.email)}</p>
                                </div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {sc.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Request Details */}
                          <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                            <div className="bg-card px-4 py-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Requested</p>
                              <p className="text-xs font-medium text-foreground">{requestedDate.toLocaleDateString()}</p>
                            </div>
                            <div className="bg-card px-4 py-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Time Elapsed</p>
                              <p className={`text-xs font-medium ${d.status === "pending" && daysAgo >= 14
                                ? "text-destructive"
                                : d.status === "pending" && daysAgo >= 7
                                  ? "text-warning"
                                  : "text-foreground"
                                }`}>
                                {daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`}
                                {d.status === "pending" && daysAgo >= 14 && (
                                  <span className="ml-1 text-[10px]">⚠️</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center border-t border-border divide-x divide-border">
                            {d.status === "pending" && (
                              <>
                                <button
                                  onClick={() => reviewDeletion(d.id, "approved")}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Approve Deletion</span>
                                </button>
                                <button
                                  onClick={() => reviewDeletion(d.id, "rejected")}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                            {d.status === "approved" && (
                              <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground">
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Deletion processed</span>
                              </div>
                            )}
                            {d.status === "rejected" && (
                              <button
                                onClick={() => reviewDeletion(d.id, "approved")}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Reconsider & Approve</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ NODES ══════════════════════════════════════════ */}
            <TabsContent value="nodes" className="mt-4">
              {activeTab === "nodes" ? (
                <NodesTab
                  ctx={{
                    nodes,
                    forceRefreshTab,
                    syncToWings,
                    syncingToWings,
                    openAddNode,
                    redact,
                    openEditNode,
                    viewNodeConfig,
                    deleteNode,
                    openHeartbeatHistory,
                    NodeSparkline,
                    nodeHeartbeats,
                    addNodeOpen,
                    setAddNodeOpen,
                    addNodeStep,
                    addNodeName,
                    setAddNodeName,
                    addNodeType,
                    setAddNodeType,
                    addNodeFqdn,
                    setAddNodeFqdn,
                    addNodePort,
                    setAddNodePort,
                    addNodeSftpPort,
                    setAddNodeSftpPort,
                    addNodeSsl,
                    setAddNodeSsl,
                    addNodeDataPath,
                    setAddNodeDataPath,
                    addNodeToken,
                    setAddNodeToken,
                    generateAddNodeToken,
                    addNodeTokenLoading,
                    addNodeCreated,
                    buildWingsConfig,
                    submitAddNode,
                    addNodeLoading,
                    editNodeDialog,
                    setEditNodeDialog,
                    editNodeType,
                    setEditNodeType,
                    editNodePortStart,
                    setEditNodePortStart,
                    editNodePortEnd,
                    setEditNodePortEnd,
                    editNodeDefaultIp,
                    setEditNodeDefaultIp,
                    saveEditNode,
                    editNodeLoading,
                    heartbeatDialogNode,
                    setHeartbeatDialogNode,
                    setHeartbeatDialogData,
                    heartbeatDialogWindow,
                    setHeartbeatDialogWindow,
                    heartbeatDialogLoading,
                    heartbeatDialogData,
                    viewConfigNode,
                    setViewConfigNode,
                    setViewConfigToken,
                    viewConfigLoading,
                    viewConfigToken,
                    buildNodeConfigYaml,
                  }}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="tunnels" className="mt-4">
              {activeTab === "tunnels" ? <TunnelsTab /> : null}
            </TabsContent>
            {/* ═══════════════ EGGS ═══════════════════════════════════════════ */}
            <TabsContent value="eggs" className="mt-4">
              {activeTab === "eggs" ? (
                <EggsTab
                  ctx={{
                    eggs,
                    forceRefreshTab,
                    setImportEggError,
                    setImportEggPreview,
                    importEggOpen,
                    importEggPreview,
                    importEggMode,
                    setImportEggMode,
                    importEggJson,
                    importEggUrl,
                    importEggError,
                    importEggLoading,
                    setImportEggJson,
                    setImportEggUrl,
                    setImportEggOpen,
                    doImportEgg,
                    eggDialog,
                    setEggDialog,
                    eggTab,
                    setEggTab,
                    eggName,
                    setEggName,
                    eggAuthor,
                    setEggAuthor,
                    eggDesc,
                    setEggDesc,
                    eggImage,
                    setEggImage,
                    eggDockerImagesRaw,
                    setEggDockerImagesRaw,
                    eggStartup,
                    setEggStartup,
                    eggFeatures,
                    setEggFeatures,
                    eggUpdateUrl,
                    setEggUpdateUrl,
                    eggFileDenylist,
                    setEggFileDenylist,
                    eggVisible,
                    setEggVisible,
                    eggRootless,
                    setEggRootless,
                    eggRequiresKvm,
                    setEggRequiresKvm,
                    eggEnvVars,
                    setEggEnvVars,
                    eggEnvVarDefs,
                    setEggEnvVarDefs,
                    eggProcessStop,
                    setEggProcessStop,
                    eggProcessDone,
                    setEggProcessDone,
                    eggInstallContainer,
                    setEggInstallContainer,
                    eggInstallEntrypoint,
                    setEggInstallEntrypoint,
                    eggInstallScript,
                    setEggInstallScript,
                    eggAllowedPortals,
                    setEggAllowedPortals,
                    portalMarkerByTier,
                    saveEgg,
                    eggLoading,
                    openNewEgg,
                    deleteAllEggs,
                    toggleEggVisible,
                    openEditEgg,
                    forceSyncEgg,
                    syncingEggIds,
                    deleteEgg,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ AI MODELS ══════════════════════════════════════ */}
            <TabsContent value="ai" className="mt-4">
              {activeTab === "ai" ? (
                <AiTab
                  ctx={{
                    aiModels,
                    openNewAIModel,
                    loadTab,
                    openAssignAiModel,
                    openEditAIModel,
                    deleteAIModel,
                    aiModelCooldowns,
                    assignAiModel,
                    setAssignAiModel,
                    assignAiUserId,
                    setAssignAiUserId,
                    users,
                    assignAiLimitTokens,
                    setAssignAiLimitTokens,
                    assignAiLimitRequests,
                    setAssignAiLimitRequests,
                    submitAssignAiModel,
                    assignAiLoading,
                    aiModelDialog,
                    setAiModelDialog,
                    aiModelName,
                    setAiModelName,
                    aiModelType,
                    setAiModelType,
                    aiModelStatus,
                    setAiModelStatus,
                    aiModelMaxTokens,
                    setAiModelMaxTokens,
                    aiModelDescription,
                    setAiModelDescription,
                    aiModelTags,
                    setAiModelTags,
                    aiModelEndpoint,
                    setAiModelEndpoint,
                    aiModelApiKey,
                    setAiModelApiKey,
                    aiModelExtraEndpoints,
                    setAiModelExtraEndpoints,
                    saveAIModel,
                    aiModelLoading,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ ANNOUNCEMENTS / PRODUCT UPDATES ═══════════════ */}
            <TabsContent value="announcements" className="mt-4">
              {activeTab === "announcements" ? (
                <AnnouncementsTab
                  ctx={{
                    annPreview,
                    setAnnPreview,
                    annSubject,
                    setAnnSubject,
                    annMessage,
                    setAnnMessage,
                    annForce,
                    setAnnForce,
                    annSending,
                    setAnnSending,
                    confirmAsync,
                    user,
                    EmailPreview,
                  }}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="outbound-emails" className="mt-4">
              {activeTab === "outbound-emails" ? <OutboundEmailsTab /> : null}
            </TabsContent>
            {/* ═══════════════ FRAUD DETECTION ════════════════════════════ */}
            <TabsContent value="fraud" className="mt-4">
              {activeTab === "fraud" ? (
                <FraudTab
                  ctx={{
                    setFraudScanningAll,
                    fraudScanningAll,
                    setFraudAlerts,
                    displayedFraudAlerts,
                    hideSuspendedFraud,
                    setHideSuspendedFraud,
                    selectAllFraud,
                    setSelectAllFraud,
                    setSelectedFraudIds,
                    selectedFraudIds,
                    confirmAsync,
                    setBulkDismissing,
                    bulkDismissing,
                    redactName,
                    redact,
                    privateMode,
                    setFraudScanning,
                    fraudScanning,
                    forceRefreshTab,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ ROLES ════════════════════════════════════ */}
            <TabsContent value="roles" className="mt-4">
              {activeTab === "roles" ? (
                <RolesTab
                  ctx={{
                    roles,
                    selectedRole,
                    setSelectedRole,
                    setRoles,
                    setRoleDialog,
                    setRoleName,
                    setRoleDesc,
                    confirmAsync,
                    newPermValue,
                    setNewPermValue,
                    permLoading,
                    setPermLoading,
                    forceRefreshTab,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═══════════════ LOGS ════════════════════════════════════ */}
            <TabsContent value="logs" className="mt-4">
              {activeTab === "logs" ? (
                <LogsTab
                  ctx={{
                    logType,
                    setLogType,
                    logs,
                    logsTotal,
                    logsPage,
                    logsPer,
                    logsUserFilter,
                    logsLoading,
                    fetchLogs,
                    deleteLog,
                    redact,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═════════════════ OAUTH ═══════════════════════════════════ */}
            <TabsContent value="oauth" className="mt-4">
              {activeTab === "oauth" ? (
                <OauthTab
                  ctx={{
                    setOauthCreateName,
                    setOauthCreateDesc,
                    setOauthCreateRedirects,
                    setOauthCreateScopes,
                    setOauthCreateGrants,
                    setOauthCreateOpen,
                    oauthCreateOpen,
                    oauthCreateName,
                    oauthCreateDesc,
                    oauthCreateRedirects,
                    oauthCreateScopes,
                    oauthCreateGrants,
                    oauthCreateLoading,
                    submitCreateOAuthApp,
                    oauthApps,
                    setOauthApps,
                    oauthNewSecret,
                    setOauthNewSecret,
                    openEditOAuthApp,
                    oauthEditApp,
                    setOauthEditApp,
                    oauthEditRedirects,
                    setOauthEditRedirects,
                    oauthEditScopes,
                    setOauthEditScopes,
                    oauthEditGrants,
                    setOauthEditGrants,
                    oauthEditLoading,
                    submitEditOAuthApp,
                    oauthRotateApp,
                    setOauthRotateApp,
                    oauthRotateLoading,
                    confirmRotateOAuthSecret,
                    confirmAsync,
                  }}
                />
              ) : null}
            </TabsContent>

            {/* ═════════════════ PLANS ═══════════════════════════════════════ */}
            <TabsContent value="plans" className="mt-4">
              {activeTab === "plans" ? (
                <PlansTab
                  ctx={{
                    plans,
                    panelSettings,
                    ensurePortalPlans,
                    ensureLoading,
                    openNewPlan,
                    planReapplyLoading,
                    planReapplyId,
                    getPortalMarker,
                    reapplyPlanLimits,
                    openEditPlan,
                    deletePlan,
                    planDialogOpen,
                    setPlanDialogOpen,
                    planEditTarget,
                    planName,
                    setPlanName,
                    planType,
                    setPlanType,
                    planPrice,
                    setPlanPrice,
                    planDesc,
                    setPlanDesc,
                    planMemory,
                    setPlanMemory,
                    planDisk,
                    setPlanDisk,
                    planCpu,
                    setPlanCpu,
                    planServerLimit,
                    setPlanServerLimit,
                    planDatabases,
                    setPlanDatabases,
                    planBackups,
                    setPlanBackups,
                    planEmailSendDailyLimit,
                    setPlanEmailSendDailyLimit,
                    planEmailSendQueueLimit,
                    setPlanEmailSendQueueLimit,
                    planPortCount,
                    setPlanPortCount,
                    planIsDefault,
                    setPlanIsDefault,
                    planHiddenFromBilling,
                    setPlanHiddenFromBilling,
                    planFeatures,
                    setPlanFeatures,
                    planError,
                    planLoading,
                    savePlan,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═════════════════ ORDERS ══════════════════════════════════════ */}
            <TabsContent value="orders" className="mt-4">
              {activeTab === "orders" ? (
                <OrdersTab
                  ctx={{
                    adminOrders,
                    panelSettings,
                    ordersTotal,
                    ordersPage,
                    ordersQuery,
                    ordersLoading,
                    setOrdersQuery,
                    fetchOrders,
                    openIssueOrder,
                    openEditOrder,
                    cancelOrder,
                    deleteOrder,
                    privateMode,
                    ORDERS_PER,
                    issueOrderOpen,
                    setIssueOrderOpen,
                    ioUserId,
                    setIoUserId,
                    ioDesc,
                    setIoDesc,
                    ioPlanId,
                    setIoPlanId,
                    ioAmount,
                    setIoAmount,
                    ioExpiresAt,
                    setIoExpiresAt,
                    ioNotes,
                    setIoNotes,
                    ioError,
                    submitIssueOrder,
                    ioLoading,
                    plans,
                    applyPlanOpen,
                    setApplyPlanOpen,
                    applyPlanUserId,
                    applyPlanId,
                    setApplyPlanId,
                    applyPlanExpiry,
                    setApplyPlanExpiry,
                    applyPlanOrgId,
                    setApplyPlanOrgId,
                    applyPlanNotes,
                    setApplyPlanNotes,
                    applyPlanError,
                    submitApplyPlan,
                    applyPlanLoading,
                    editOrderOpen,
                    setEditOrderOpen,
                    editOrderTarget,
                    eoDescription,
                    setEoDescription,
                    eoAmount,
                    setEoAmount,
                    eoPlanId,
                    setEoPlanId,
                    eoNotes,
                    setEoNotes,
                    eoExpiresAt,
                    setEoExpiresAt,
                    eoStatus,
                    setEoStatus,
                    eoError,
                    submitEditOrder,
                    eoLoading,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═════════════════ PANEL SETTINGS ══════════════════════════════ */}
            <TabsContent value="settings" className="mt-4">
              {activeTab === "settings" ? (
                <SettingsTab
                  ctx={{
                    settingsSaved,
                    settingsSaving,
                    setSettingsSaving,
                    setSettingsSaved,
                    panelSettings,
                    setPanelSettings,
                    geoBlockMetricsLoading,
                    setGeoBlockMetricsLoading,
                    geoBlockMetricsError,
                    geoBlockMetrics,
                    setGeoBlockMetrics,
                  }}
                />
              ) : null}
            </TabsContent>
            {/* ═════════════════ DATABASE HOSTS ══════════════════════════════ */}
            <TabsContent value="databases" className="mt-4">
              {activeTab === "databases" ? (
                <DatabasesTab
                  ctx={{
                    DatabaseHostsPanel,
                    privateMode,
                  }}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Create Role Dialog */}
      <Dialog open={roleDialog} onOpenChange={(open) => setRoleDialog(open)}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Role</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role Name</label>
              <input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g. support-agent"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description <span className="normal-case text-muted-foreground/70">(optional)</span></label>
              <input
                value={roleDesc}
                onChange={(e) => setRoleDesc(e.target.value)}
                placeholder="What is this role for?"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(false)} className="border-border">Cancel</Button>
            <Button
              disabled={roleLoading || !roleName.trim()}
              onClick={async () => {
                setRoleLoading(true)
                try {
                  const created = await apiFetch(API_ENDPOINTS.roles, {
                    method: "POST",
                    body: JSON.stringify({ name: roleName.trim(), description: roleDesc.trim() || undefined }),
                  })
                  const newRole = { ...created.role, permissions: [] }
                  setRoles((prev) => [...prev, newRole])
                  setSelectedRole(newRole)
                  setRoleDialog(false)
                } finally { setRoleLoading(false) }
              }}
              className="bg-primary text-primary-foreground"
            >
              {roleLoading ? "Creating…" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview ID / Selfie Dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) { setPreviewOpen(false); if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); } setPreviewUrl(null); setPreviewTitle(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-3xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-foreground">{previewTitle || 'Preview'}</DialogTitle>
            <DialogDescription>
              {previewTitle ? `Preview of ${previewTitle}` : 'Preview of uploaded document'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-2 flex items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={previewTitle || 'Preview'} className="max-h-[70vh] w-auto rounded" />
            ) : (
              <div className="text-xs text-muted-foreground">No preview available</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit User Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={!!editUserDialog} onOpenChange={(open) => !open && setEditUserDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Edit User — {editUserDialog ? (privateMode ? redactName(editUserDialog.firstName, editUserDialog.lastName) : `${editUserDialog.firstName} ${editUserDialog.lastName}`) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Current Plan */}
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Plan</p>
                {userCurrentPlan?.plan && (
                  <button
                    onClick={cancelUserPlan}
                    disabled={cancelPlanLoading}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    {cancelPlanLoading ? "Cancelling…" : "Cancel Plan"}
                  </button>
                )}
              </div>
              {userPlanLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : userCurrentPlan?.plan ? (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-foreground">{userCurrentPlan.plan.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({userCurrentPlan.plan.type})</span>
                    {userCurrentPlan.plan.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{userCurrentPlan.plan.description}</p>
                    )}
                    {userCurrentPlan.order?.expiresAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Expires: {new Date(userCurrentPlan.order.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const uid = editUserDialog?.id
                      setEditUserDialog(null)
                      if (uid) openApplyPlan(uid)
                    }}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No active plan assigned</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tier</label>
              <select value={editTier} onChange={(e) => setEditTier(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date of Birth</label>
              <input
                type="date"
                value={editDateOfBirth}
                onChange={(e) => setEditDateOfBirth(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground">Enter a birth date for age verification and child account handling.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent Account ID</label>
              <input
                type="number"
                min="1"
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                placeholder="Parent user id"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <p className="text-xs text-muted-foreground">Assign a parent account for underage users. Leave blank to clear.</p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Resource Limits (leave blank = unlimited)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Max Servers</label>
                  <input type="number" min="0" value={editServerLimit} onChange={(e) => setEditServerLimit(e.target.value)}
                    placeholder="unlimited"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">CPU Limit (%)</label>
                  <input type="number" min="0" value={editCpuLimit} onChange={(e) => setEditCpuLimit(e.target.value)}
                    placeholder="unlimited"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Memory (MB)</label>
                  <input type="number" min="0" value={editMemoryLimit} onChange={(e) => setEditMemoryLimit(e.target.value)}
                    placeholder="unlimited"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Disk (MB)</label>
                  <input type="number" min="0" value={editDiskLimit} onChange={(e) => setEditDiskLimit(e.target.value)}
                    placeholder="unlimited"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Databases</label>
                  <input type="number" min="0" value={editDatabaseLimit} onChange={(e) => setEditDatabaseLimit(e.target.value)}
                    placeholder="0"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Backups</label>
                  <input type="number" min="0" value={editBackupLimit} onChange={(e) => setEditBackupLimit(e.target.value)}
                    placeholder="0"
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Badges</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {BADGE_PRESETS.map((preset) => {
                  const selected = parseBadgeText(editBadgesText).some((b) => b.toLowerCase() === preset.toLowerCase())
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => toggleBadgePreset(preset)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        selected
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  )
                })}
              </div>
              <textarea
                value={editBadgesText}
                onChange={(e) => setEditBadgesText(e.target.value)}
                rows={3}
                placeholder="bug hunter, staff, ex staff, contributor"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Separate badges with commas or new lines.</p>
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => {
              const uid = editUserDialog?.id
              setEditUserDialog(null)
              if (uid) openApplyPlan(uid)
            }} className="border-border text-primary mr-auto">
              Apply Plan
            </Button>
            <Button variant="outline" onClick={() => setEditUserDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditUser} disabled={editLoading} className="bg-primary text-primary-foreground">
              {editLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit Server Dialog ══════════════════════════════════════════ */}
      <Dialog open={!!editServerDialog} onOpenChange={(open) => !open && setEditServerDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Server — {editServerDialog?.name || editServerDialog?.uuid}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                <input value={esName} onChange={(e) => setEsName(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                <input value={esDesc} onChange={(e) => setEsDesc(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner User ID</label>
                <input type="number" value={esUserId} onChange={(e) => setEsUserId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory (MB)</label>
                <input type="number" min="128" value={esMemory} onChange={(e) => setEsMemory(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disk (MB)</label>
                <input type="number" min="512" value={esDisk} onChange={(e) => setEsDisk(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU (%)</label>
                <input type="number" min="10" value={esCpu} onChange={(e) => setEsCpu(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Swap (MB)</label>
                <input type="number" min="0" value={esSwap} onChange={(e) => setEsSwap(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Docker Image</label>
                <input value={esDockerImage} onChange={(e) => setEsDockerImage(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startup Command</label>
                <input value={esStartup} onChange={(e) => setEsStartup(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.environmentVariables")}</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => {
                      setEsEnvironment({})
                      setEsExtraEnvRows([])
                      setEsEnvModified(true)
                    }}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t("editDialog.fields.resetEnvironment")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => {
                      setEsExtraEnvRows((prev) => [...prev, { id: `env-${Date.now()}-${Math.random()}`, key: "", value: "" }])
                      setEsEnvModified(true)
                    }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t("editDialog.fields.addVariable")}
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {esEnvRows.map((row: any) => (
                    <div key={row.id} className="rounded-lg border border-border bg-secondary/10 p-3">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {row.isDefined || !row.isNew ? (
                          <>
                            <span className="text-xs font-semibold text-foreground truncate">{row.name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono truncate max-w-[50vw] sm:max-w-none">{row.key}</Badge>
                          </>
                        ) : (
                          <input
                            type="text"
                            value={row.key}
                            onChange={(e) => {
                              setEsExtraEnvRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.id ? { ...item, key: e.target.value } : item
                                )
                              )
                              setEsEnvModified(true)
                            }}
                            placeholder={t("editDialog.fields.variableName")}
                            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50"
                          />
                        )}
                        {!row.isEditable && (
                          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500 whitespace-nowrap">{t("editDialog.fields.readOnly")}</Badge>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8 p-0" onClick={() => {
                          if (row.isDefined || row.isCustom) {
                            setEsEnvironment((prev) => {
                              const next = { ...prev }
                              delete next[row.key]
                              return next
                            })
                          }
                          if (row.isNew) {
                            setEsExtraEnvRows((prev) => prev.filter((item) => item.id !== row.id))
                          }
                          setEsEnvModified(true)
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {row.description && (
                        <p className="text-xs text-muted-foreground mb-2">{row.description}</p>
                      )}
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          if (row.isNew) {
                            setEsExtraEnvRows((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, value: e.target.value } : item
                              )
                            )
                          } else {
                            setEsEnvironment((prev) => ({ ...prev, [row.key]: e.target.value }))
                          }
                          setEsEnvModified(true)
                        }}
                        placeholder={row.isDefined ? row.placeholder : t("editDialog.fields.variableValue")}
                        disabled={!row.isEditable}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50"
                      />
                    </div>
                  ))}
                  {esEnvRows.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("editDialog.fields.noEnvironmentVariables")}</p>
                  )}
                </div>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Egg / Template</label>
                <div>
                  <Select value={esEggId ?? "none"} onValueChange={(v) => setEsEggId(v === "none" ? undefined : v)}>
                    <SelectTrigger className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full">
                      <SelectValue placeholder="— No template —" />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                      <SelectItem value="none">— No template —</SelectItem>
                      {eggs.map((egg) => (
                        <SelectItem key={egg.id} value={String(egg.id)}>
                          <div className="flex flex-col">
                            <span className="font-medium">{egg.name}</span>
                            {egg.description && (
                              <span className="text-xs text-muted-foreground line-clamp-2">{egg.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Network Allocations</label>
                <div className="space-y-1.5">
                  {esAllocations.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No allocations configured.</p>
                  )}
                  {esAllocations.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5">
                      {esEditFqdnIdx === i ? (
                        <>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground shrink-0">{a.ip}:{a.port}</span>
                            <input
                              autoFocus
                              placeholder="Display FQDN (e.g. n1.ecli.app)"
                              value={esEditFqdnVal}
                              onChange={(e) => setEsEditFqdnVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setEsAllocations(prev => prev.map((x, j) => j === i ? { ...x, fqdn: esEditFqdnVal.trim() || undefined } : x))
                                  setEsEditFqdnIdx(null)
                                } else if (e.key === 'Escape') setEsEditFqdnIdx(null)
                              }}
                              className="flex-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                            />
                          </div>
                          <button onClick={() => {
                            setEsAllocations(prev => prev.map((x, j) => j === i ? { ...x, fqdn: esEditFqdnVal.trim() || undefined } : x))
                            setEsEditFqdnIdx(null)
                          }} title="Save FQDN" className="text-muted-foreground hover:text-green-400 transition-colors">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEsEditFqdnIdx(null)} title="Cancel" className="text-muted-foreground hover:text-destructive transition-colors">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-sm text-foreground">{a.ip}:{a.port}</span>
                            {a.fqdn && <span className="ml-2 text-xs text-muted-foreground">→ {a.fqdn}:{a.port}</span>}
                          </div>
                          <button onClick={() => { setEsEditFqdnIdx(i); setEsEditFqdnVal(a.fqdn || "") }}
                            title="Edit FQDN" className="text-muted-foreground hover:text-primary transition-colors">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          {a.is_default
                            ? <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">default</span>
                            : <button onClick={() => setEsAllocations(prev => prev.map((x, j) => ({ ...x, is_default: j === i })))}
                              title="Set as default" className="text-muted-foreground hover:text-primary transition-colors">
                              <Globe className="h-3.5 w-3.5" />
                            </button>
                          }
                          <button onClick={() => setEsAllocations(prev => {
                            const next = prev.filter((_, j) => j !== i)
                            if (a.is_default && next.length > 0) next[0].is_default = true
                            return next
                          })} title="Remove" className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input placeholder="Bind IP" value={esAllocIp} onChange={(e) => setEsAllocIp(e.target.value)}
                    className="w-32 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                  <input type="number" placeholder="Port" value={esAllocPort} onChange={(e) => setEsAllocPort(e.target.value)}
                    className="w-24 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                  <input placeholder="Display FQDN (e.g. n1.ecli.app)" value={esAllocFqdn} onChange={(e) => setEsAllocFqdn(e.target.value)}
                    className="flex-1 min-w-[160px] rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                  <Button size="sm" variant="outline" className="border-border h-9" onClick={() => {
                    const port = Number(esAllocPort); if (!esAllocIp || !port) return
                    setEsAllocations(prev => [...prev, { ip: esAllocIp, port, fqdn: esAllocFqdn.trim(), is_default: prev.length === 0 }])
                    setEsAllocPort(""); setEsAllocFqdn("")
                  }}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                </div>
              </div>
            </div>
            {esError && <p className="text-xs text-destructive">{esError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reinstallServerFromDialog} disabled={esReinstalling || esLoading}
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 mr-auto">
              {esReinstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Reinstall
            </Button>
            <Button variant="outline" onClick={() => setEditServerDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditServer} disabled={esLoading} className="bg-primary text-primary-foreground">
              {esLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Create Server Dialog ══════════════════════════════════════════ */}
      <Dialog open={createServerOpen} onOpenChange={(open) => !open && setCreateServerOpen(false)}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Server</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Server Name (optional)</label>
                <input value={csName} onChange={(e) => setCsName(e.target.value)} placeholder="My Server"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node *</label>
                <select value={csNodeId} onChange={(e) => setCsNodeId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Select node…</option>
                  {nodes.map((n) => <option key={n.id} value={String(n.id)}>{n.name} ({n.nodeType})</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Egg (optional)</label>
                <div>
                  <Select value={csEggId ?? "none"} onValueChange={(v) => setCsEggId(v === "none" ? undefined : v)}>
                    <SelectTrigger className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full">
                      <SelectValue placeholder="Default (Node.js)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default (Node.js)</SelectItem>
                      {eggs.map((egg) => (
                        <SelectItem key={egg.id} value={String(egg.id)}>
                          <div className="flex flex-col">
                            <span className="font-medium">{egg.name}</span>
                            {egg.description && (
                              <span className="text-xs text-muted-foreground line-clamp-2">{egg.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner User ID (optional)</label>
                <input type="number" value={csUserId} onChange={(e) => setCsUserId(e.target.value)} placeholder="User ID"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Resources</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Memory (MB)</label>
                  <input type="number" min="1" value={csMemory} onChange={(e) => setCsMemory(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Disk (MB)</label>
                  <input type="number" min="1" value={csDisk} onChange={(e) => setCsDisk(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">CPU (%)</label>
                  <input type="number" min="5" value={csCpu} onChange={(e) => setCsCpu(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input id="cs-kvm-passthrough" type="checkbox" checked={csKvmPassthroughEnabled} onChange={(e) => setCsKvmPassthroughEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-secondary/50 text-primary focus:ring-primary" />
                <label htmlFor="cs-kvm-passthrough" className="text-sm text-foreground">Enable KVM passthrough</label>
              </div>
            </div>
            {csError && <p className="text-xs text-destructive">{csError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateServerOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitCreateServer} disabled={csLoading || !csNodeId} className="bg-primary text-primary-foreground">
              {csLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Creating…</> : "Create Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Plan Create/Edit Dialog ════════════════════════════════════════ */}
      <Dialog open={planDialogOpen} onOpenChange={(open) => !open && setPlanDialogOpen(false)}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{planEditTarget ? "Edit Plan" : "New Plan"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan Name *</label>
                <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Starter"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                <select value={planType} onChange={(e) => setPlanType(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="educational">Educational</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price ($/mo)</label>
                <input type="number" min="0" step="0.01" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                <input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Brief description of the plan"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Resource Limits (leave blank for unlimited)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory (MB)</label>
                <input type="number" min="0" placeholder="e.g. 2048" value={planMemory} onChange={(e) => setPlanMemory(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disk (MB)</label>
                <input type="number" min="0" placeholder="e.g. 10240" value={planDisk} onChange={(e) => setPlanDisk(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU (%)</label>
                <input type="number" min="0" placeholder="e.g. 100" value={planCpu} onChange={(e) => setPlanCpu(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Server Limit</label>
                <input type="number" min="0" placeholder="e.g. 3" value={planServerLimit} onChange={(e) => setPlanServerLimit(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Databases</label>
                <input type="number" min="0" placeholder="e.g. 10" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Backups</label>
                <input type="number" min="0" placeholder="e.g. 20" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email send per day</label>
                <input type="number" min="0" placeholder="e.g. 50" value={planEmailSendDailyLimit} onChange={(e) => setPlanEmailSendDailyLimit(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email queue limit</label>
                <input type="number" min="0" placeholder="e.g. 10" value={planEmailSendQueueLimit} onChange={(e) => setPlanEmailSendQueueLimit(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ports per Server</label>
                <input type="number" min="1" placeholder="1" value={planPortCount} onChange={(e) => setPlanPortCount(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Databases Limit</label>
                <input type="number" min="0" placeholder="0" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Backups Limit</label>
                <input type="number" min="0" placeholder="0" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5 justify-end">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={planIsDefault} onChange={(e) => setPlanIsDefault(e.target.checked)} className="accent-primary" />
                  Set as default plan
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Billing Page Features (one per line)
              </label>
              <textarea
                rows={4}
                value={planFeatures}
                onChange={(e) => setPlanFeatures(e.target.value)}
                placeholder={"e.g.\n3 Servers\n2048 MB RAM\n10 GB SSD\nPriority Support"}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono"
              />
              <p className="text-xs text-muted-foreground">These lines appear as feature bullets on the user's Billing page.</p>
            </div>
            {planError && <p className="text-xs text-destructive">{planError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={savePlan} disabled={planLoading} className="bg-primary text-primary-foreground">
              {planLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : (planEditTarget ? "Save Changes" : "Create Plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ User View Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={!!viewUserDialog} onOpenChange={(open) => { if (!open) { setViewUserDialog(null); setViewUserProfile(null) } }}>
        <DialogContent className="border-border bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {privateMode ? redactName(viewUserDialog?.firstName, viewUserDialog?.lastName) : `${viewUserDialog?.firstName || ""} ${viewUserDialog?.lastName || ""}`}
              <span className="text-xs text-muted-foreground font-normal ml-1">#{redact(viewUserDialog?.id)}</span>
            </DialogTitle>
          </DialogHeader>
          {viewUserLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading profile…</div>
          ) : viewUserProfile?.error ? (
            <div className="py-8 text-center text-sm text-destructive">Failed to load profile.</div>
          ) : viewUserProfile ? (
            <div className="flex flex-col gap-5 py-2">
              {/* Profile Info */}
              <div className="rounded-lg border border-border bg-secondary/20 p-4 grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email: </span><span className="text-foreground">{redact(viewUserProfile.email)}</span></div>
                <div><span className="text-muted-foreground">Role: </span><span className="text-foreground">{privateMode ? redact(viewUserProfile.role) : (viewUserProfile.role || "user")}</span></div>
                <div><span className="text-muted-foreground">Tier: </span><span className="text-foreground">{privateMode ? redact(viewUserProfile.portalType) : viewUserProfile.portalType}</span></div>
                <div><span className="text-muted-foreground">Status: </span>
                  <span className={viewUserProfile.suspended ? "text-destructive" : "text-emerald-400"}>
                    {viewUserProfile.suspended ? "Suspended" : "Active"}
                  </span>
                </div>
                <div><span className="text-muted-foreground">Email Verified: </span>
                  <span className={viewUserProfile.emailVerified ? "text-emerald-400" : "text-muted-foreground"}>{viewUserProfile.emailVerified ? "Yes" : "No"}</span>
                </div>
                <div><span className="text-muted-foreground">ID Verified: </span>
                  <span className={viewUserProfile.idVerified ? "text-emerald-400" : "text-muted-foreground"}>{viewUserProfile.idVerified ? "Yes" : "No"}</span>
                </div>
                {viewUserProfile.address && <div className="col-span-2"><span className="text-muted-foreground">Address: </span><span className="text-foreground">{redact(viewUserProfile.address)}{viewUserProfile.address2 ? `, ${redact(viewUserProfile.address2)}` : ''}</span></div>}
                {viewUserProfile.billingCity && <div><span className="text-muted-foreground">City: </span><span className="text-foreground">{redact(viewUserProfile.billingCity)}</span></div>}
                {viewUserProfile.billingState && <div><span className="text-muted-foreground">State: </span><span className="text-foreground">{redact(viewUserProfile.billingState)}</span></div>}
                {viewUserProfile.billingCountry && <div><span className="text-muted-foreground">Country: </span><span className="text-foreground">{redact(viewUserProfile.billingCountry)}</span></div>}
                {viewUserProfile.billingCompany && <div><span className="text-muted-foreground">Company: </span><span className="text-foreground">{redact(viewUserProfile.billingCompany)}</span></div>}
                {viewUserProfile.phone && <div><span className="text-muted-foreground">Phone: </span><span className="text-foreground">{redact(viewUserProfile.phone)}</span></div>}
              </div>

              {/* Fraud Scan */}
              {viewUserProfile.fraudFlag && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-destructive">Fraud Alert</p>
                    <p className="text-xs text-destructive/70">{viewUserProfile.fraudReason}</p>
                  </div>
                </div>
              )}
              <button
                onClick={async () => {
                  if (!viewUserDialog) return;
                  try {
                    const res = await apiFetch(API_ENDPOINTS.adminFraudScan.replace(":id", String(viewUserDialog.id)), { method: "POST" });
                    setViewUserProfile((prev: any) => prev ? { ...prev, fraudFlag: res.isSuspicious, fraudReason: res.reasons?.join('; ') || null } : prev);
                    alert(res.isSuspicious ? `Suspicious! Score: ${res.fraudScore}/100` : `Clean — fraud score: ${res.fraudScore}/100`);
                  } catch (e: any) {
                    alert("Fraud scan failed: " + e.message);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors w-fit"
              >
                <Brain className="h-3.5 w-3.5" /> Run Fraud Scan
              </button>

              {/* AI Models */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5" /> AI Model Access ({viewUserProfile.aiModels?.length || 0})
                </p>
                {(viewUserProfile.aiModels?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No AI models assigned.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {viewUserProfile.aiModels.map((link: any) => (
                      <div key={link.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{link.model?.name}</p>
                          {link.limits && (
                            <p className="text-xs text-muted-foreground">
                              {link.limits.tokens ? `${link.limits.tokens.toLocaleString()} tokens` : ""}
                              {link.limits.tokens && link.limits.requests ? " · " : ""}
                              {link.limits.requests ? `${link.limits.requests} requests` : ""}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => revokeAiLink(link.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Revoke access"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Servers */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" /> Servers ({viewUserProfile.servers?.length || 0})
                </p>
                {(viewUserProfile.servers?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No servers found.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {viewUserProfile.servers.map((s: any) => (
                      <div key={s.uuid} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.name || s.uuid}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.uuid} · {s.nodeName}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => serverPower(s.uuid, "start")} title="Start"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => markServerStarted(s.uuid)}
                            title="Mark Started"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteServer(s.uuid)} title="Delete"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders / Billing */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Orders ({viewUserProfile.orders?.length || 0})
                </p>
                {(viewUserProfile.orders?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No orders found.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {viewUserProfile.orders.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">Order #{o.id} — ${o.amount?.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">{o.status} · {new Date(o.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className={o.status === "paid" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary/50 text-muted-foreground"}>
                          {o.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Roles */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <UserCog className="h-3.5 w-3.5" /> Custom Roles ({viewUserRoles.length})
                </p>
                <div className="flex flex-col gap-2">
                  {viewUserRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No custom roles assigned.</p>
                  ) : (
                    viewUserRoles.map((ur: any) => (
                      <div key={ur.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{ur.role?.name}</p>
                          {ur.role?.description && <p className="text-xs text-muted-foreground">{ur.role.description}</p>}
                        </div>
                        <button
                          onClick={async () => {
                            if (!viewUserDialog) return
                            setViewUserRoleLoading(true)
                            try {
                              await apiFetch(`${API_ENDPOINTS.userRoles.replace(":id", String(viewUserDialog.id))}/${ur.id}`, { method: "DELETE" })
                              setViewUserRoles((prev) => prev.filter((r) => r.id !== ur.id))
                            } finally { setViewUserRoleLoading(false) }
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  {/* Assign role */}
                  {roles.length > 0 && (
                    <div className="flex gap-2 mt-1">
                      <select
                        value={viewUserAssignRoleId}
                        onChange={(e) => setViewUserAssignRoleId(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      >
                        <option value="">— assign a role —</option>
                        {roles.map((r) => (
                          <option key={r.id} value={String(r.id)}>{r.name}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!viewUserAssignRoleId || viewUserRoleLoading}
                        onClick={async () => {
                          if (!viewUserDialog || !viewUserAssignRoleId) return
                          setViewUserRoleLoading(true)
                          try {
                            const data = await apiFetch(
                              API_ENDPOINTS.userRoles.replace(":id", String(viewUserDialog.id)),
                              { method: "POST", body: JSON.stringify({ roleId: Number(viewUserAssignRoleId) }) }
                            )
                            setViewUserRoles((prev) => [...prev, data.ur])
                            setViewUserAssignRoleId("")
                          } finally { setViewUserRoleLoading(false) }
                        }}
                        className="bg-primary text-primary-foreground gap-1 h-9 px-3 text-xs shrink-0"
                      >
                        {viewUserRoleLoading ? "…" : <><Plus className="h-3 w-3" /> Assign</>}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Suspend / Unsuspend / Support Ban */}
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Account Status</p>
                  <p className="text-xs text-muted-foreground">{viewUserProfile.suspended ? "This account is currently suspended." : "This account is active."}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: viewUserProfile.supportBanned ? "#dc2626" : "#16a34a" }}>
                    Support tickets: {viewUserProfile.supportBanned ? "BANNED" : "Allowed"}
                  </p>
                  {viewUserProfile.supportBanReason && (
                    <p className="text-xs text-muted-foreground">Reason: {viewUserProfile.supportBanReason}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={viewUserProfile.suspended ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/30 text-destructive hover:bg-destructive/10"}
                    onClick={async () => {
                      if (!viewUserDialog) return;
                      await toggleSuspend(viewUserDialog);
                      const updated = !viewUserProfile.suspended;
                      setViewUserProfile((p: any) => ({ ...p, suspended: updated }));
                      setViewUserDialog((u) => (u ? { ...u, suspended: updated } : u));
                    }}
                  >
                    {viewUserProfile.suspended ? <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Unsuspend</> : <><Ban className="h-3.5 w-3.5 mr-1.5" />Suspend</>}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className={viewUserProfile.supportBanned ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/30 text-destructive hover:bg-destructive/10"}
                    onClick={async () => {
                      if (!viewUserDialog) return;
                      const makeUnban = !!viewUserProfile.supportBanned;
                      let reason: string | null = viewUserProfile.supportBanReason || "";
                      if (!makeUnban) {
                        reason = window.prompt("Reason for banning this user from support tickets:", reason || "")?.trim() || "";
                        if (!reason) {
                          alert("Ban reason cannot be empty.");
                          return;
                        }
                      }

                      try {
                        await apiFetch(`${API_ENDPOINTS.adminUsers}/${viewUserDialog.id}`, {
                          method: "PUT",
                          body: JSON.stringify({
                            supportBanned: !makeUnban,
                            supportBanReason: makeUnban ? null : reason,
                          }),
                        });

                        setViewUserProfile((p: any) => ({ ...p, supportBanned: !makeUnban, supportBanReason: makeUnban ? null : reason }));
                        setViewUserDialog((u) => (u ? { ...u, supportBanned: !makeUnban } : u));
                      } catch (err: any) {
                        alert(`Failed to ${makeUnban ? "unban" : "ban"} user: ${err?.message || "unknown error"}`);
                      }
                    }}
                  >
                    {viewUserProfile.supportBanned ? <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Unban it</> : <><Ban className="h-3.5 w-3.5 mr-1.5" />Ban from support</>}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewUserDialog(null); setViewUserProfile(null) }} className="border-border">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}