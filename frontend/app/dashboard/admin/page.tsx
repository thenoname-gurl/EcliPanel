"use client"

import React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
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

function EmailPreview({ title, message, details }: { title: string; message: string; details: string }) {
  const style = `.email-preview-root { font-family: Arial, sans-serif; background-color: transparent; color: #e0e0e0; margin: 0; padding: 0; }
    .email-preview-root .container { max-width: 600px; margin: 0 auto; padding: 32px; background: #12111f; border-radius: 12px; border: 1px solid #2a2545; }
    .email-preview-root .header { text-align: center; margin-bottom: 24px; }
    .email-preview-root .header h1 { color: #c4b5fd; font-size: 20px; margin: 0; }
    .email-preview-root .details { font-family: monospace; font-size: 13px; color: #cbd5e1; background: #0f1724; border-radius: 8px; padding: 12px; border: 1px solid #2a2545; margin-top: 12px; white-space: pre-wrap; }
    .email-preview-root .footer { font-size: 12px; color: #777; margin-top: 24px; text-align: center; }
    .email-preview-root .message { word-wrap: break-word; }
    .email-preview-root p { line-height: 1.6; color: #e0e0e0; margin: 0 0 1em 0; }
    .email-preview-root code { background: #1f1b31; padding: .2em .3em; border-radius: .25rem; }
    .email-preview-root pre { background: #1f1b31; border-radius: .5rem; overflow-x: auto; padding: .8rem; }
    .email-preview-root a { color: #8b5cf6; text-decoration: underline; }`;

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
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ─────────────────────────────────────────────────────────────────────────────

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
  portCount?: number
  isDefault?: boolean
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
        if (!form.password) { setFormError("Password is required"); setSaving(false); return }
        body.password = form.password
        const created = await apiFetch("/api/admin/database-hosts", {
          method: "POST",
          body: JSON.stringify(body),
        })
        setHosts(prev => [...prev, created])
      }
      setShowForm(false)
    } catch (e: any) {
      setFormError(e?.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const testConn = async (id: number) => {
    setTestingId(id)
    try {
      const data = await apiFetch(`/api/admin/database-hosts/${id}/test`, { method: "POST" })
      setTestResults(prev => ({ ...prev, [id]: { ok: true, msg: data.message || "Connection successful" } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: e?.message || "Connection failed" } }))
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
      alert(e?.message || "Failed to delete")
    }
  }

  if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
  
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Database Hosts</p>
            <Badge variant="outline" className="text-xs">{hosts.length}</Badge>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Host
          </Button>
        </div>

        {showForm && (
          <div className="border-b border-border p-4 bg-secondary/10">
            <p className="text-sm font-medium mb-3">{editHost ? "Edit Database Host" : "New Database Host"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Production MySQL"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Host *</label>
                <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder="192.168.1.10"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Port</label>
                <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Username *</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="panel_admin"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{editHost ? "Password (leave blank to keep)" : "Password *"}</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Linked Node ID (optional)</label>
                <input type="number" value={form.nodeId} onChange={e => setForm(f => ({ ...f, nodeId: e.target.value }))}
                  placeholder="Leave blank for any node"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Max Databases (0 = unlimited)</label>
                <input type="number" min="0" value={form.maxDatabases} onChange={e => setForm(f => ({ ...f, maxDatabases: e.target.value }))}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </div>
            </div>
            {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={submitForm} disabled={saving}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : (editHost ? "Save Changes" : "Create Host")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {hosts.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground p-4">No database hosts configured. Add one to allow servers to create databases.</p>
        ) : (
          <div className="divide-y divide-border">
            {hosts.map(h => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {redactText(h.host, privateMode)}:{redactText(h.port, privateMode)} · User: {redactText(h.username, privateMode)}
                    {h.nodeId ? ` · Node #${redactText(h.nodeId, privateMode)}` : " · All nodes"}
                    {h.maxDatabases > 0 ? ` · Limit: ${h.maxDatabases}` : " · Unlimited"}
                  </p>
                  {testResults[h.id] && (
                    <p className={`text-xs mt-0.5 ${testResults[h.id].ok ? "text-green-400" : "text-red-400"}`}>
                      {testResults[h.id].msg}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => testConn(h.id)} disabled={testingId === h.id}>
                    {testingId === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(h)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {deleteConfirm === h.id ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={() => deleteHost(h.id)}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
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
  const { user } = useAuth()
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

  // ── Filters ──
  const [userSearch, setUserSearch] = useState("")
  const [userSearchFocused, setUserSearchFocused] = useState(false)
  const [ticketFilter, setTicketFilter] = useState<string>("all")
  const [orgSearch, setOrgSearch] = useState("")
  const [serverSearch, setServerSearch] = useState("")
  const [verificationFilter, setVerificationFilter] = useState<string>("")
  const [deletionFilter, setDeletionFilter] = useState<string>("")
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([])

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
  const [redactServers, setRedactServers] = useState<boolean>(true)
  const [redactOrganisations, setRedactOrganisations] = useState<boolean>(true)

  const redact = (value?: string | number | null) => {
    if (!value && value !== 0) return <span className="text-muted-foreground">████████████</span>
    if (!privateMode) return <>{value}</>
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
  const [planPortCount, setPlanPortCount] = useState("1")
  const [planIsDefault, setPlanIsDefault] = useState(false)
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
  const [logType, setLogType] = useState<"audit" | "requests" | "slow">("audit")
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
  }>({ registrationEnabled: true, registrationNotice: "", codeInstancesEnabled: true, geoBlockCountries: "" })
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
        } else if (tab === "settings") {
          const data = await apiFetch(API_ENDPOINTS.adminSettings)
          if (data) {
            setPanelSettings({
              registrationEnabled: data.registrationEnabled ?? true,
              registrationNotice: data.registrationNotice ?? "",
              codeInstancesEnabled:
                data.codeInstancesEnabled === "false" ? false : Boolean(data.codeInstancesEnabled),
              geoBlockCountries: data.geoBlockCountries ?? "",
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

  // ── Fetch users (paged) ──
  async function fetchUsers(page = 1, q = "") {
    setUsersLoading(true)
    try {
      const url = `${API_ENDPOINTS.adminUsers}?page=${page}&q=${encodeURIComponent(q || '')}`
      const res: any = await apiFetch(url)
      if (res) {
        setUsers(Array.isArray(res.users) ? res.users : [])
        setUsersTotal(typeof res.total === 'number' ? res.total : (Array.isArray(res.users) ? res.users.length : 0))
        setUsersPage(typeof res.page === 'number' ? res.page : page)
      } else {
        setUsers([])
        setUsersTotal(0)
        setUsersPage(page)
      }
    } catch (e) {
      setUsers([])
      setUsersTotal(0)
    } finally {
      setUsersLoading(false)
    }
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

  // ── Load default tab on mount ──
  useEffect(() => {
    loadTab("users")
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered users ──
  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase()
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  })

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
      await apiFetch(`${API_ENDPOINTS.adminUsers}/${editUserDialog.id}`, {
        method: "PUT",
        body: JSON.stringify({ role: editRole, portalType: editTier, limits: Object.keys(limits).length ? limits : null }),
      })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUserDialog.id ? { ...u, role: editRole, portalType: editTier } : u
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

  async function deleteServer(uuid: string) {
    if (!(await confirmAsync(`Delete server ${uuid}? This action cannot be undone.`))) return
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}`, { method: "DELETE" })
    setServers((prev) => prev.filter((s) => s.uuid !== uuid))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => { })
  }

  async function openEditServer(srv: AdminServer) {
    setEsName(srv.name || "")
    setEsDesc(srv.configuration?.meta?.description || srv.description || "")
    setEsUserId(String(srv.owner || ""))
    setEsMemory(String(srv.configuration?.build?.memory_limit || ""))
    setEsDisk(String(srv.configuration?.build?.disk_space || ""))
    setEsCpu(String(srv.configuration?.build?.cpu_limit || ""))
    setEsSwap(String(srv.configuration?.build?.swap || "0"))
    setEsDockerImage(srv.configuration?.docker?.image || "")
    setEsStartup(srv.configuration?.invocation || "")
    setEsEggId(srv.eggId ? String(srv.eggId) : undefined)
    setEsError("")
    setEsReinstalling(false)
    setEsAllocations([])
    setEsAllocIp("0.0.0.0")
    setEsAllocPort("")
    setEsAllocFqdn("")
    setEsEditFqdnIdx(null)
    setEditServerDialog(srv)
    // load existing allocations from panel DB
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", srv.uuid))
      .then((data: any) => {
        if (Array.isArray(data)) setEsAllocations(data.map((a: any) => ({ ip: a.ip, port: a.port, is_default: !!a.is_default, fqdn: a.fqdn || "" })))
      })
      .catch(() => { })
    // ensure eggs are loaded for the egg selector
    if (eggs.length === 0) {
      apiFetch(API_ENDPOINTS.adminEggs).then((data: any) => setEggs(data || [])).catch(() => { })
    }
    try {
      const full = await apiFetch(`/api/servers/${srv.uuid}`)
      if (full && full.configuration) {
        setEsAutoSyncOnEggChange(full.configuration.autoSyncOnEggChange !== false)
      }
    } catch {
      // skip
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
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}/suspend`, { method: "POST" })
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
      alert(`Sync to Wings complete — processed ${Array.isArray(result) ? result.length : JSON.stringify(result)}`)
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
    setPlanDatabases(""); setPlanBackups("")
    setPlanPortCount("1"); setPlanIsDefault(false); setPlanFeatures(""); setPlanError("")
    setPlanDialogOpen(true)
  }

  function openEditPlan(plan: AdminPlan) {
    setPlanEditTarget(plan)
    setPlanName(plan.name); setPlanType(plan.type); setPlanPrice(String(plan.price ?? 0)); setPlanDesc(plan.description || "")
    setPlanMemory(plan.memory != null ? String(plan.memory) : ""); setPlanDisk(plan.disk != null ? String(plan.disk) : "")
    setPlanCpu(plan.cpu != null ? String(plan.cpu) : ""); setPlanServerLimit(plan.serverLimit != null ? String(plan.serverLimit) : "")
    setPlanDatabases((plan as any).databases != null ? String((plan as any).databases) : ""); setPlanBackups((plan as any).backups != null ? String((plan as any).backups) : "")
    setPlanPortCount(plan.portCount != null ? String(plan.portCount) : "1"); setPlanIsDefault(plan.isDefault ?? false)
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
      portCount: planPortCount ? Number(planPortCount) : 1,
      isDefault: planIsDefault,
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
    setEggEnvVars(""); setEggVisible(true)
    setEggFeatures(""); setEggFileDenylist("")
    setEggAllowedPortals([])
    setEggProcessStop("stop"); setEggProcessDone("")
    setEggInstallContainer(""); setEggInstallEntrypoint("bash"); setEggInstallScript("")
    setEggRootless(false)
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
    setEggVisible(egg.visible)
    setEggFeatures((egg.features || []).join(", "))
    setEggFileDenylist((egg.fileDenylist || []).join("\n"))
    setEggAllowedPortals(egg.allowedPortals || [])
    setEggProcessStop(egg.processConfig?.stop?.value || "stop")
    setEggProcessDone((egg.processConfig?.startup?.done || []).join("\n"))
    setEggInstallContainer(egg.installScript?.container || "")
    setEggInstallEntrypoint(egg.installScript?.entrypoint || "bash")
    setEggInstallScript(egg.installScript?.script || "")
    setEggRootless(Boolean(egg.rootless))
  }

  async function saveEgg() {
    setEggLoading(true)
    const envVarNames = eggEnvVars.split("\n").map((s) => s.trim()).filter(Boolean)
    const existingEnvVars: Record<string, any>[] = (eggDialog !== "new" && eggDialog)
      ? ((eggDialog as AdminEgg).envVars || []) as any[]
      : []
    const envVarsOut = envVarNames.map((key) => {
      const existing = existingEnvVars.find((v: any) => (v.env_variable ?? v.name) === key)
      return existing ?? { name: key, env_variable: key, default_value: "", user_viewable: true, user_editable: true, rules: "", field_type: "text" }
    })

    // Build docker images object if raw text provided
    let dockerImages: Record<string, string> | undefined
    if (eggDockerImagesRaw.trim()) {
      try { dockerImages = JSON.parse(eggDockerImagesRaw) } catch { /* ignore parse error */ }
    }

    // Build process config
    const donePatterns = eggProcessDone.split("\n").map(s => s.trim()).filter(Boolean)
    const processConfig = (donePatterns.length || eggProcessStop) ? {
      startup: { done: donePatterns, user_interaction: [], strip_ansi: false },
      stop: {
        type: eggProcessStop === "SIGKILL" ? "kill" : eggProcessStop === "SIGTERM" ? "stop" : "command",
        value: eggProcessStop,
      },
      configs: [],
    } : undefined

    // Build install script
    const installScript = (eggInstallContainer.trim() || eggInstallScript.trim()) ? {
      container: eggInstallContainer.trim() || undefined,
      entrypoint: eggInstallEntrypoint.trim() || "bash",
      script: eggInstallScript,
    } : undefined

    const features = eggFeatures.split(",").map(s => s.trim()).filter(Boolean)
    const fileDenylist = eggFileDenylist.split("\n").map(s => s.trim()).filter(Boolean)

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
        if (!importEggUrl.trim()) { setImportEggError("Please enter a URL."); return }
        body = { url: importEggUrl.trim() }
      } else {
        if (!importEggJson.trim()) { setImportEggError("Please paste egg JSON."); return }
        let parsed: any
        try { parsed = JSON.parse(importEggJson) }
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
      <PanelHeader title="Admin Panel" description="System administration and management" />
      <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Sensitive data is currently <strong>{privateMode ? "hidden" : "visible"}</strong>.
            {privateMode ? "" : ""}
          </span>
          <Button size="sm" variant="outline" onClick={() => setPrivacyDialogOpen(true)}>
            {privateMode ? "Confirm to reveal" : "Re-hide private data"}
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
            <Button variant="outline" onClick={() => handleConfirmCancel()} disabled={confirmLoading}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleConfirmOk()} disabled={confirmLoading}>
              {confirmLoading ? "Working…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privacy check before exposing sensitive fields */}
      <Dialog open={privacyDialogOpen} onOpenChange={(open) => setPrivacyDialogOpen(open)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Privacy Confirmation</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This admin panel contains private user data (names, emails, IDs),
              which is prohibited from being shared with third parties (see NDA, clause 4).
              <br />
              To proceed, please confirm that you are not recording your screen or sharing it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPrivateMode(true);
              setRedactOrganisations(true);
              setRedactServers(true);
              setPrivacyDialogOpen(false);
            }}>
              Continue with redaction
            </Button>
            <Button onClick={() => {
              setPrivateMode(false);
              setRedactOrganisations(false);
              setRedactServers(false);
              setPrivacyDialogOpen(false);
            }}>
              I am not recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">

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

          {/* Tabs */}
          <Tabs defaultValue="users" onValueChange={(tab) => loadTab(tab)} className="w-full">
            <TabsList className="flex gap-2 overflow-x-auto scrollbar-none px-2 border border-border bg-secondary/50">
              {[
                { value: "users", label: "Users" },
                { value: "organisations", label: "Organisations" },
                { value: "servers", label: "Servers" },
                { value: "tickets", label: "Tickets" },
                { value: "verifications", label: "KYC" },
                { value: "deletions", label: "Deletions" },
                { value: "nodes", label: "Nodes" },
                { value: "eggs", label: "Eggs" },
                { value: "ai", label: "AI Models" },
                { value: "announcements", label: "Announcements" },
                { value: "fraud", label: "Fraud" },
                { value: "roles", label: "Roles" },
                { value: "logs", label: "Logs" },
                { value: "oauth", label: "OAuth" },
                { value: "databases", label: "Databases" },
                { value: "plans", label: "Plans" },
                { value: "orders", label: "Orders" },
                { value: "settings", label: "Settings" },
              ].map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ═══════════════ USERS ══════════════════════════════════════════ */}
            <TabsContent value="users" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Search & Controls Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          placeholder="Search by name or email…"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && fetchUsers(1, userSearch)}
                          onFocus={() => setUserSearchFocused(true)}
                          onBlur={() => setTimeout(() => setUserSearchFocused(false), 150)}
                          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                        />
                        {userSearch && (
                          <button
                            onClick={() => { setUserSearch(""); fetchUsers(1, ""); }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Search dropdown */}
                      {userSearchFocused && userSearch.trim().length > 0 && filteredUsers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                          {filteredUsers.slice(0, 5).map((u) => (
                            <button
                              key={u.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { openViewUser(u); setUserSearch(""); setUserSearchFocused(false); }}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/40 last:border-0"
                            >
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                {u.firstName?.[0]?.toUpperCase() || "?"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{redactName(u.firstName, u.lastName)}</p>
                                <p className="text-xs text-muted-foreground truncate">{redact(u.email)}</p>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </button>
                          ))}
                          {filteredUsers.length > 5 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground text-center bg-secondary/30">
                              +{filteredUsers.length - 5} more results
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {usersTotal ? `${usersTotal} user${usersTotal !== 1 ? "s" : ""}` : ""}
                      </span>
                      <button
                        onClick={() => forceRefreshTab("users")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="rounded-xl border border-border bg-card hidden lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">User</th>
                          <th className="px-4 py-3 text-left font-medium">Role</th>
                          <th className="px-4 py-3 text-left font-medium">Tier</th>
                          <th className="px-4 py-3 text-left font-medium">Verification</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Users className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  {users.length === 0 ? "Loading users…" : "No users match your search"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((user) => (
                            <tr key={user.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={`${user.firstName || "User"} avatar`} className="h-8 w-8 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                      {user.firstName?.[0]?.toUpperCase() || "?"}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{redactName(user.firstName, user.lastName)}</p>
                                    <p className="text-xs text-muted-foreground truncate">{redact(user.email)}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={
                                  user.role === "*" || user.role === "rootAdmin"
                                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                                    : user.role === "admin"
                                      ? "border-warning/30 bg-warning/10 text-warning"
                                      : "border-border bg-secondary/50 text-muted-foreground"
                                }>
                                  {user.role || "user"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={
                                  user.portalType === "enterprise"
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : user.portalType === "paid" || user.portalType === "pro" || user.portalType === "educational"
                                      ? "border-primary/30 bg-primary/10 text-primary"
                                      : "border-border bg-secondary/50 text-muted-foreground"
                                }>
                                  {user.portalType}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {[
                                    { label: "Email", verified: user.emailVerified },
                                    { label: "Student", verified: user.studentVerified },
                                    { label: "ID", verified: user.idVerified },
                                  ].map((v) => (
                                    <span
                                      key={v.label}
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.verified
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-secondary/50 text-muted-foreground"
                                        }`}
                                    >
                                      {v.verified ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                                      {v.label}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  {user.suspended ? (
                                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Suspended</Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Active</Badge>
                                  )}
                                  {user.supportBanned && (
                                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]">Support Banned</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openViewUser(user)} title="View profile"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => openEditUser(user)} title="Edit user"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <UserCog className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => toggleSuspend(user)} title={user.suspended ? "Unsuspend" : "Suspend"}
                                    className={`rounded-md p-1.5 transition-colors ${user.suspended
                                      ? "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                                      : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"}`}>
                                    {user.suspended ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                                  </button>
                                  {user.demoUsed && (
                                    <button onClick={() => resetDemo(user)} title="Reset demo"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {(user.studentVerified || user.portalType === "educational") && (
                                    <>
                                      <button onClick={() => deassignStudent(user)} title="Deassign student"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                        <UserMinus className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => requireStudentReverify(user)} title="Require re-verify"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button onClick={() => deleteUser(user)} title="Delete account"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
                <div className="flex flex-col gap-3 lg:hidden">
                  {filteredUsers.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          {users.length === 0 ? "Loading users…" : "No users match your search"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <div key={user.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Card Header */}
                        <div className="flex items-start gap-3 p-4 pb-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                            {user.firstName?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{redactName(user.firstName, user.lastName)}</p>
                                <p className="text-xs text-muted-foreground truncate">{redact(user.email)}</p>
                              </div>
                              {user.suspended ? (
                                <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive shrink-0 text-[10px]">Suspended</Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0 text-[10px]">Active</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Details */}
                        <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                          <div className="bg-card px-4 py-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Role</p>
                            <Badge variant="outline" className={`text-[10px] ${user.role === "*" || user.role === "rootAdmin"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : user.role === "admin"
                                ? "border-warning/30 bg-warning/10 text-warning"
                                : "border-border bg-secondary/50 text-muted-foreground"
                              }`}>
                              {user.role || "user"}
                            </Badge>
                          </div>
                          <div className="bg-card px-4 py-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Tier</p>
                            <Badge variant="outline" className={`text-[10px] ${user.portalType === "enterprise"
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : user.portalType === "paid" || user.portalType === "pro" || user.portalType === "educational"
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-secondary/50 text-muted-foreground"
                              }`}>
                              {user.portalType}
                            </Badge>
                          </div>
                        </div>

                        {/* Verification Row */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-secondary/20">
                          {[
                            { label: "Email", verified: user.emailVerified },
                            { label: "Student", verified: user.studentVerified },
                            { label: "ID", verified: user.idVerified },
                          ].map((v) => (
                            <span
                              key={v.label}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${v.verified
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-secondary/80 text-muted-foreground"
                                }`}
                            >
                              {v.verified ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                              {v.label}
                            </span>
                          ))}
                          {user.supportBanned && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive">
                              <Ban className="h-2.5 w-2.5" />
                              Banned
                            </span>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center border-t border-border divide-x divide-border">
                          <button
                            onClick={() => openViewUser(user)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            onClick={() => openEditUser(user)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                          >
                            <UserCog className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => toggleSuspend(user)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${user.suspended
                              ? "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              }`}
                          >
                            {user.suspended ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            <span>{user.suspended ? "Unsuspend" : "Suspend"}</span>
                          </button>

                          {/* More actions dropdown for mobile */}
                          <div className="relative group/more">
                            <button className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                            <div className="absolute bottom-full right-0 mb-1 hidden group-focus-within/more:block rounded-lg border border-border bg-card shadow-xl overflow-hidden z-50 min-w-[160px]">
                              {user.demoUsed && (
                                <button
                                  onClick={() => resetDemo(user)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Reset demo
                                </button>
                              )}
                              {(user.studentVerified || user.portalType === "educational") && (
                                <>
                                  <button
                                    onClick={() => deassignStudent(user)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                    Deassign student
                                  </button>
                                  <button
                                    onClick={() => requireStudentReverify(user)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Require re-verify
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => deleteUser(user)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete account
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Pagination */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <p className="text-xs text-muted-foreground">
                      Page <span className="font-medium text-foreground">{usersPage}</span>
                      {usersTotal ? (
                        <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(usersTotal / USERS_PER))}</span></>
                      ) : null}
                      {usersTotal ? (
                        <span className="hidden sm:inline"> · {usersTotal} total</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (usersPage > 1) fetchUsers(usersPage - 1, userSearch); }}
                        disabled={usersPage <= 1}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                        <span className="hidden sm:inline ml-1">Previous</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!usersTotal || usersPage < Math.ceil((usersTotal || 0) / USERS_PER))
                            fetchUsers(usersPage + 1, userSearch);
                        }}
                        disabled={usersTotal ? usersPage >= Math.ceil(usersTotal / USERS_PER) : users.length < USERS_PER}
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

            {/* ═══════════════ ORGANISATIONS ══════════════════════════════════ */}
            <TabsContent value="organisations" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Search & Controls Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          placeholder="Search organisations…"
                          value={orgSearch}
                          onChange={(e) => setOrgSearch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && fetchOrganisations(1, orgSearch)}
                          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                        />
                        {orgSearch && (
                          <button
                            onClick={() => { setOrgSearch(""); fetchOrganisations(1, ""); }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Right controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {organisationsTotal ? `${organisationsTotal} org${organisationsTotal !== 1 ? "s" : ""}` : ""}
                      </span>
                      <button
                        onClick={() => setRedactOrganisations(!redactOrganisations)}
                        title={redactOrganisations ? "Show full details" : "Redact details"}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        {redactOrganisations ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => forceRefreshTab("organisations")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Organisation</th>
                          <th className="px-4 py-3 text-left font-medium">Handle</th>
                          <th className="px-4 py-3 text-left font-medium">Owner</th>
                          <th className="px-4 py-3 text-left font-medium">Tier</th>
                          <th className="px-4 py-3 text-left font-medium">Members</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrgs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Building2 className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  {organisations.length === 0 ? "Loading organisations…" : "No organisations match your search"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredOrgs.map((org) => (
                            <tr key={org.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {org.avatarUrl ? (
                                    <img src={org.avatarUrl} alt={`${org.name} logo`} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                      {org.name?.[0]?.toUpperCase() || "?"}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{redactOrg(org.name)}</p>
                                    <p className="font-mono text-[11px] text-muted-foreground truncate">#{redactOrg(org.id)}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                  @{redactOrg(org.handle)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {org.owner ? (
                                  <div className="min-w-0">
                                    <p className="text-sm text-foreground truncate">{redactOrgName(org.owner.firstName, org.owner.lastName)}</p>
                                    <p className="text-xs text-muted-foreground truncate">{redactOrg(org.owner.email)}</p>
                                  </div>
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">{redactOrg(org.ownerId)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={
                                  org.portalTier === "enterprise"
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : org.portalTier === "pro"
                                      ? "border-primary/30 bg-primary/10 text-primary"
                                      : "border-border bg-secondary/50 text-muted-foreground"
                                }>
                                  {org.portalTier}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm font-medium text-foreground">{org.memberCount}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEditOrg(org)} title="Edit organisation"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => deleteOrg(org)} title="Delete organisation"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
                <div className="flex flex-col gap-3 lg:hidden">
                  {filteredOrgs.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          {organisations.length === 0 ? "Loading organisations…" : "No organisations match your search"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    filteredOrgs.map((org) => (
                      <div key={org.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Card Header */}
                        <div className="flex items-start gap-3 p-4 pb-3">
                          {org.avatarUrl ? (
                            <img src={org.avatarUrl} alt={`${org.name} logo`} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                              {org.name?.[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{redactOrg(org.name)}</p>
                                <span className="inline-flex items-center rounded-md bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground mt-0.5">
                                  @{redactOrg(org.handle)}
                                </span>
                              </div>
                              <Badge variant="outline" className={`shrink-0 text-[10px] ${org.portalTier === "enterprise"
                                ? "border-warning/30 bg-warning/10 text-warning"
                                : org.portalTier === "pro"
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "border-border bg-secondary/50 text-muted-foreground"
                                }`}>
                                {org.portalTier}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Card Details Grid */}
                        <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                          <div className="bg-card px-4 py-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Owner</p>
                            {org.owner ? (
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{redactOrgName(org.owner.firstName, org.owner.lastName)}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{redactOrg(org.owner.email)}</p>
                              </div>
                            ) : (
                              <p className="font-mono text-[11px] text-muted-foreground truncate">{redactOrg(org.ownerId)}</p>
                            )}
                          </div>
                          <div className="bg-card px-4 py-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Members</p>
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-semibold text-foreground">{org.memberCount}</span>
                            </div>
                          </div>
                        </div>

                        {/* ID row */}
                        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-secondary/20">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ID</span>
                          <span className="font-mono text-[11px] text-muted-foreground truncate">#{redactOrg(org.id)}</span>
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center border-t border-border divide-x divide-border">
                          <button
                            onClick={() => openEditOrg(org)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => deleteOrg(org)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Pagination */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <p className="text-xs text-muted-foreground">
                      Page <span className="font-medium text-foreground">{organisationsPage}</span>
                      {organisationsTotal ? (
                        <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(organisationsTotal / ORGS_PER))}</span></>
                      ) : null}
                      {organisationsTotal ? (
                        <span className="hidden sm:inline"> · {organisationsTotal} total</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (organisationsPage > 1) fetchOrganisations(organisationsPage - 1, orgSearch); }}
                        disabled={organisationsPage <= 1}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                        <span className="hidden sm:inline ml-1">Previous</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!organisationsTotal || organisationsPage < Math.ceil((organisationsTotal || 0) / ORGS_PER))
                            fetchOrganisations(organisationsPage + 1, orgSearch);
                        }}
                        disabled={organisationsTotal ? organisationsPage >= Math.ceil(organisationsTotal / ORGS_PER) : organisations.length < ORGS_PER}
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
            {/* ═══════════════ SERVERS ════════════════════════════════════════ */}
            <TabsContent value="servers" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Search & Controls Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    {/* Top row: Search + icon controls */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-md">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            placeholder="Search servers…"
                            value={serverSearch}
                            onChange={(e) => setServerSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && fetchServers(1, serverSearch)}
                            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                          />
                          {serverSearch && (
                            <button
                              onClick={() => { setServerSearch(""); fetchServers(1, ""); }}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {serversTotal ? `${serversTotal} server${serversTotal !== 1 ? "s" : ""}` : ""}
                        </span>
                        <button
                          onClick={() => setRedactServers(!redactServers)}
                          title={redactServers ? "Show full details" : "Redact details"}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          {redactServers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => forceRefreshTab("servers")}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {/* Bottom row: action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={syncFromWings}
                        disabled={syncingFromWings}
                        className="h-8 gap-1.5 border-border text-muted-foreground"
                      >
                        {syncingFromWings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">Sync from Wings</span>
                        <span className="sm:hidden">Sync</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => { loadTab("nodes"); loadTab("eggs"); openCreateServer(); }}
                        className="bg-primary text-primary-foreground h-8 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Create Server</span>
                        <span className="sm:hidden">Create</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Server</th>
                          <th className="px-4 py-3 text-left font-medium">UUID</th>
                          <th className="px-4 py-3 text-left font-medium">Node</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredServers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Server className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  {servers.length === 0 ? "Loading servers…" : "No servers match your search"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredServers.map((srv, i) => {
                            const statusConfig: Record<string, { class: string; dot: string }> = {
                              running: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                              starting: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                              suspended: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                              stopping: { class: "border-orange-500/30 bg-orange-500/10 text-orange-400", dot: "bg-orange-400" },
                            }
                            const sc = srv.status && statusConfig[srv.status] ? statusConfig[srv.status] : { class: "border-border bg-secondary/50 text-muted-foreground", dot: "bg-muted-foreground" }

                            return (
                              <tr key={srv.uuid ? `${srv.uuid}-${srv.nodeId || ""}` : i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="relative h-8 w-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                                      <Server className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {srv.name ? redactText(srv.name, privateMode ? redactServers : false) : "Unnamed Server"}
                                      </p>
                                      {srv.description && (
                                        <p className={`text-xs text-muted-foreground truncate max-w-xs ${privateMode && redactServers ? "blur-sm" : ""}`}>
                                          {srv.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(srv.uuid || "")}
                                    title="Click to copy full UUID"
                                    className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                                  >
                                    {(srv.uuid || "").substring(0, 8)}…
                                    <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground">
                                    {srv.nodeName || "Unknown"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={sc.class}>
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                    {srv.status || "unknown"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    {/* Power controls */}
                                    <div className="flex items-center gap-0.5 border-r border-border pr-1 mr-1">
                                      <button onClick={() => serverPower(srv.uuid, "start")} title="Start"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                                        <Play className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => serverPower(srv.uuid, "restart")} title="Restart"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => serverPower(srv.uuid, "stop")} title="Stop"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                                        <Square className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {/* Management controls */}
                                    {srv.status === "suspended" ? (
                                      <button onClick={() => unsuspendServer(srv.uuid)} title="Unsuspend"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                      </button>
                                    ) : (
                                      <button onClick={() => suspendServer(srv.uuid)} title="Suspend"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                                        <Shield className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => openEditServer(srv)} title="Edit server"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => deleteServer(srv.uuid)} title="Delete server"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="flex flex-col gap-3 lg:hidden">
                  {filteredServers.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Server className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          {servers.length === 0 ? "Loading servers…" : "No servers match your search"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    filteredServers.map((srv, i) => {
                      const statusConfig: Record<string, { class: string; dot: string; bg: string }> = {
                        running: { class: "text-emerald-400", dot: "bg-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
                        starting: { class: "text-warning", dot: "bg-warning", bg: "bg-warning/10 border-warning/30" },
                        suspended: { class: "text-destructive", dot: "bg-destructive", bg: "bg-destructive/10 border-destructive/30" },
                        stopping: { class: "text-orange-400", dot: "bg-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
                      }
                      const sc = srv.status && statusConfig[srv.status] ? statusConfig[srv.status] : { class: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-secondary/50 border-border" }

                      return (
                        <div key={srv.uuid ? `${srv.uuid}-${srv.nodeId || ""}` : i} className="rounded-xl border border-border bg-card overflow-hidden">
                          {/* Card Header */}
                          <div className="flex items-start gap-3 p-4 pb-3">
                            <div className="relative h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {srv.name ? redactText(srv.name, privateMode ? redactServers : false) : "Unnamed Server"}
                                  </p>
                                  {srv.description && (
                                    <p className={`text-xs text-muted-foreground truncate mt-0.5 ${privateMode && redactServers ? "blur-sm" : ""}`}>
                                      {srv.description}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className={`shrink-0 text-[10px] ${sc.bg} ${sc.class}`}>
                                  <span className={`mr-1 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                  {srv.status || "unknown"}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Card Details */}
                          <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                            <div className="bg-card px-4 py-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Node</p>
                              <Badge variant="outline" className="text-[10px] border-border bg-secondary/50 text-muted-foreground">
                                {srv.nodeName || "Unknown"}
                              </Badge>
                            </div>
                            <div className="bg-card px-4 py-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">UUID</p>
                              <button
                                onClick={() => navigator.clipboard?.writeText(srv.uuid || "")}
                                className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {(srv.uuid || "").substring(0, 8)}…
                                <Copy className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>

                          {/* Power Controls */}
                          <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-border bg-secondary/20">
                            <button onClick={() => serverPower(srv.uuid, "start")} title="Start"
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                              <Play className="h-3.5 w-3.5" />
                              <span>Start</span>
                            </button>
                            <button onClick={() => serverPower(srv.uuid, "restart")} title="Restart"
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Restart</span>
                            </button>
                            <button onClick={() => serverPower(srv.uuid, "stop")} title="Stop"
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                              <Square className="h-3.5 w-3.5" />
                              <span>Stop</span>
                            </button>
                          </div>

                          {/* Management Actions */}
                          <div className="flex items-center border-t border-border divide-x divide-border">
                            {srv.status === "suspended" ? (
                              <button onClick={() => unsuspendServer(srv.uuid)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Unsuspend</span>
                              </button>
                            ) : (
                              <button onClick={() => suspendServer(srv.uuid)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors">
                                <Shield className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </button>
                            )}
                            <button onClick={() => openEditServer(srv)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button onClick={() => deleteServer(srv.uuid)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
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
                      Page <span className="font-medium text-foreground">{serversPage}</span>
                      {serversTotal ? (
                        <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(serversTotal / SERVERS_PER))}</span></>
                      ) : null}
                      {serversTotal ? (
                        <span className="hidden sm:inline"> · {serversTotal} total</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (serversPage > 1) fetchServers(serversPage - 1, serverSearch); }}
                        disabled={serversPage <= 1}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                        <span className="hidden sm:inline ml-1">Previous</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!serversTotal || serversPage < Math.ceil((serversTotal || 0) / SERVERS_PER))
                            fetchServers(serversPage + 1, serverSearch);
                        }}
                        disabled={serversTotal ? serversPage >= Math.ceil(serversTotal / SERVERS_PER) : servers.length < SERVERS_PER}
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
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{nodes.length} node{nodes.length !== 1 ? "s" : ""} registered</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => forceRefreshTab("nodes")} className="border-border h-8 gap-1">
                      <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                    <Button size="sm" variant="outline" onClick={syncToWings} disabled={syncingToWings} className="border-border h-8 gap-1">
                      {syncingToWings ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sync to Wings
                    </Button>
                    <Button size="sm" onClick={openAddNode} className="bg-primary text-primary-foreground h-8 gap-1">
                      <Plus className="h-3 w-3" /> Add Node
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {nodes.length === 0 ? (
                    <div className="col-span-2 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
                      <HardDrive className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">No nodes registered</p>
                      <p className="text-xs text-muted-foreground">Add a Wings node to start hosting servers.</p>
                      <Button size="sm" onClick={openAddNode} className="bg-primary text-primary-foreground gap-1 mt-1">
                        <Plus className="h-3 w-3" /> Add Node
                      </Button>
                    </div>
                  ) : (
                    nodes.map((node) => {
                      const typeColors: Record<string, string> = {
                        free: "border-green-500/30 bg-green-500/10 text-green-400",
                        paid: "border-blue-500/30 bg-blue-500/10 text-blue-400",
                        free_and_paid: "border-purple-500/30 bg-purple-500/10 text-purple-400",
                        enterprise: "border-orange-500/30 bg-orange-500/10 text-orange-400",
                      }
                      const typeLabel: Record<string, string> = {
                        free: "Free", paid: "Paid", free_and_paid: "Free + Paid", enterprise: "Enterprise",
                      }
                      return (
                        <div key={node.id} className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-medium text-foreground">{node.name}</h3>
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{redact(node.url)}</p>
                              {node.organisation && (
                                <p className="mt-1 text-xs text-muted-foreground">Org: {redact(node.organisation.name)}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs">
                                #{node.id}
                              </Badge>
                              <Badge variant="outline" className={`text-xs ${typeColors[node.nodeType] || typeColors.free}`}>
                                {typeLabel[node.nodeType] || node.nodeType}
                              </Badge>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => openEditNode(node)}
                                  className="border-border h-7 px-2 text-xs gap-1">
                                  <Edit className="h-3 w-3" /> Classify
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => viewNodeConfig(node)}
                                  className="border-border h-7 px-2 text-xs gap-1" title="View Wings config.yml">
                                  <FileCode className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => deleteNode(node)}
                                  className="border-destructive/50 text-destructive h-7 px-2 text-xs">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          {/* ── Heartbeat sparkline ── */}
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Response time · last 120 pings</span>
                              <button
                                className="text-[11px] text-primary/70 hover:text-primary transition-colors"
                                onClick={() => openHeartbeatHistory(node)}
                              >
                                Full history →
                              </button>
                            </div>
                            <NodeSparkline data={nodeHeartbeats[node.id] || []} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ EGGS ═══════════════════════════════════════════ */}
            <TabsContent value="eggs" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Server Templates</p>
                          <p className="text-xs text-muted-foreground">
                            {eggs.length} egg{eggs.length !== 1 ? "s" : ""} configured
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => forceRefreshTab("eggs")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImportEggError("");
                          setImportEggPreview(null);
                          setImportEggJson("");
                          setImportEggUrl("");
                          setImportEggOpen(true);
                        }}
                        className="h-8 gap-1.5 border-border text-muted-foreground"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Import Egg</span>
                        <span className="sm:hidden">Import</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={openNewEgg}
                        className="bg-primary text-primary-foreground h-8 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New Egg</span>
                        <span className="sm:hidden">New</span>
                      </Button>
                      <div className="flex-1" />
                      {eggs.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={deleteAllEggs}
                          className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Delete All</span>
                          <span className="sm:hidden">Clear</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Empty State */}
                {eggs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Package className="h-6 w-6 text-primary/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No eggs configured</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create a new egg or import one to get started.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImportEggError("");
                          setImportEggPreview(null);
                          setImportEggJson("");
                          setImportEggUrl("");
                          setImportEggOpen(true);
                        }}
                        className="gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import
                      </Button>
                      <Button size="sm" onClick={openNewEgg} className="bg-primary text-primary-foreground gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> New Egg
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="rounded-xl border border-border bg-card hidden md:block">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="px-4 py-3 text-left font-medium">Egg</th>
                              <th className="px-4 py-3 text-left font-medium">Docker Image</th>
                              <th className="px-4 py-3 text-left font-medium">Visibility</th>
                              <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eggs.map((egg, i) => (
                              <tr key={egg.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{egg.name}</p>
                                      {egg.description && (
                                        <p className="text-xs text-muted-foreground truncate max-w-xs">{egg.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                                    {egg.dockerImage}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => toggleEggVisible(egg)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${egg.visible
                                      ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                      }`}
                                  >
                                    {egg.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                    {egg.visible ? "Visible" : "Hidden"}
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => openEditEgg(egg)}
                                      title="Edit egg"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => forceSyncEgg(egg)}
                                      disabled={syncingEggIds.includes(egg.id)}
                                      title="Sync to Wings"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-40"
                                    >
                                      {syncingEggIds.includes(egg.id)
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <RefreshCw className="h-3.5 w-3.5" />
                                      }
                                    </button>
                                    <button
                                      onClick={() => deleteEgg(egg)}
                                      title="Delete egg"
                                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {eggs.map((egg, i) => (
                        <div key={egg.id ?? i} className="rounded-xl border border-border bg-card overflow-hidden">
                          {/* Card Header */}
                          <div className="flex items-start gap-3 p-4 pb-3">
                            <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{egg.name}</p>
                                  {egg.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{egg.description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => toggleEggVisible(egg)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0 ${egg.visible
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-secondary/50 text-muted-foreground"
                                    }`}
                                >
                                  {egg.visible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                                  {egg.visible ? "Visible" : "Hidden"}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Docker Image */}
                          <div className="px-4 pb-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Docker Image</p>
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                              <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs text-muted-foreground truncate">{egg.dockerImage}</span>
                              <button
                                onClick={() => navigator.clipboard?.writeText(egg.dockerImage || "")}
                                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors ml-auto"
                                title="Copy image name"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center border-t border-border divide-x divide-border">
                            <button
                              onClick={() => openEditEgg(egg)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => forceSyncEgg(egg)}
                              disabled={syncingEggIds.includes(egg.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                            >
                              {syncingEggIds.includes(egg.id)
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />
                              }
                              <span>Sync</span>
                            </button>
                            <button
                              onClick={() => deleteEgg(egg)}
                              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
            {/* ═══════════════ AI MODELS ══════════════════════════════════════ */}
            <TabsContent value="ai" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                          <Brain className="h-4 w-4 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">AI Models</p>
                          <p className="text-xs text-muted-foreground">
                            {aiModels.length} model{aiModels.length !== 1 ? "s" : ""} configured
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={openNewAIModel}
                          className="bg-primary text-primary-foreground h-8 gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">New Model</span>
                          <span className="sm:hidden">New</span>
                        </Button>
                        <button
                          onClick={() => loadTab("ai")}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Empty State */}
                {aiModels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <Brain className="h-6 w-6 text-violet-400/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No AI models configured</p>
                      <p className="text-xs text-muted-foreground mt-1">Add a model to enable AI features across your panel.</p>
                    </div>
                    <Button size="sm" onClick={openNewAIModel} className="bg-primary text-primary-foreground gap-1.5 mt-1">
                      <Plus className="h-3.5 w-3.5" /> New Model
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="rounded-xl border border-border bg-card hidden lg:block">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="px-4 py-3 text-left font-medium">Model</th>
                              <th className="px-4 py-3 text-left font-medium">Type</th>
                              <th className="px-4 py-3 text-left font-medium">Status</th>
                              <th className="px-4 py-3 text-left font-medium">Tags</th>
                              <th className="px-4 py-3 text-left font-medium">Endpoints</th>
                              <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiModels.map((m, i) => {
                              const statusConfig: Record<string, { class: string; dot: string }> = {
                                active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                                beta: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                                disabled: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                              }
                              const sc = statusConfig[m.config?.status || "active"] || statusConfig.active

                              const typeConfig: Record<string, { class: string; icon: any }> = {
                                text: { class: "border-blue-500/30 bg-blue-500/10 text-blue-400", icon: MessageSquare },
                                image: { class: "border-purple-500/30 bg-purple-500/10 text-purple-400", icon: Image },
                                code: { class: "border-amber-500/30 bg-amber-500/10 text-amber-400", icon: FileCode },
                              }
                              const tc = typeConfig[m.config?.type || "text"] || typeConfig.text
                              const TypeIcon = tc.icon

                              const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

                              return (
                                <tr key={m.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                        <Brain className="h-3.5 w-3.5 text-violet-400" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                                        {m.config?.description && (
                                          <p className="text-xs text-muted-foreground truncate max-w-xs">{m.config.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant="outline" className={`text-xs capitalize ${tc.class}`}>
                                      <TypeIcon className="h-2.5 w-2.5 mr-1" />
                                      {m.config?.type || "text"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant="outline" className={`text-xs ${sc.class}`}>
                                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                      {m.config?.status || "active"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                      {Array.isArray(m.tags) && m.tags.length > 0 ? (
                                        m.tags.map((tag: string) => (
                                          <span key={tag} className="inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            {tag}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs text-muted-foreground italic">none</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className={`h-2 w-2 rounded-full shrink-0 ${endpointCount > 0 ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                                      <span className="text-xs text-muted-foreground">
                                        {endpointCount > 0 ? `${endpointCount} configured` : "not set"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => openAssignAiModel(m)} title="Assign to users"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                        <UserPlus className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => openEditAIModel(m)} title="Edit model"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => deleteAIModel(m)} title="Delete model"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Tablet Table (simplified) */}
                    <div className="rounded-xl border border-border bg-card hidden md:block lg:hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="px-3 py-3 text-left font-medium">Model</th>
                              <th className="px-3 py-3 text-left font-medium">Status</th>
                              <th className="px-3 py-3 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiModels.map((m, i) => {
                              const statusConfig: Record<string, { class: string; dot: string }> = {
                                active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                                beta: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                                disabled: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                              }
                              const sc = statusConfig[m.config?.status || "active"] || statusConfig.active
                              const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

                              return (
                                <tr key={m.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                        <Brain className="h-3.5 w-3.5 text-violet-400" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          <span className="capitalize">{m.config?.type || "text"}</span>
                                          {" · "}
                                          {endpointCount > 0 ? `${endpointCount} endpoint${endpointCount !== 1 ? "s" : ""}` : "no endpoints"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge variant="outline" className={`text-[10px] ${sc.class}`}>
                                      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                      {m.config?.status || "active"}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center justify-end gap-0.5">
                                      <button onClick={() => openAssignAiModel(m)} title="Assign"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                                        <UserPlus className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => openEditAIModel(m)} title="Edit"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => deleteAIModel(m)} title="Delete"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {aiModels.map((m, i) => {
                        const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                          active: { class: "text-emerald-400", dot: "bg-emerald-400", label: "Active" },
                          beta: { class: "text-warning", dot: "bg-warning", label: "Beta" },
                          disabled: { class: "text-destructive", dot: "bg-destructive", label: "Disabled" },
                        }
                        const sc = statusConfig[m.config?.status || "active"] || statusConfig.active
                        const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

                        return (
                          <div key={m.id ?? i} className="rounded-xl border border-border bg-card overflow-hidden">
                            {/* Card Header */}
                            <div className="flex items-start gap-3 p-4 pb-3">
                              <div className="relative h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                                <Brain className="h-4 w-4 text-violet-400" />
                                <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                                    {m.config?.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.config.description}</p>
                                    )}
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                    {sc.label}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Type</p>
                                <p className="text-xs font-medium text-foreground capitalize">{m.config?.type || "text"}</p>
                              </div>
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Endpoints</p>
                                <div className="flex items-center gap-1">
                                  <span className={`h-1.5 w-1.5 rounded-full ${endpointCount > 0 ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                                  <span className="text-xs font-medium text-foreground">{endpointCount || "—"}</span>
                                </div>
                              </div>
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Tags</p>
                                <p className="text-xs text-foreground truncate">
                                  {Array.isArray(m.tags) && m.tags.length > 0 ? m.tags.join(", ") : "—"}
                                </p>
                              </div>
                            </div>

                            {/* Tags (if many) */}
                            {Array.isArray(m.tags) && m.tags.length > 2 && (
                              <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border bg-secondary/20 overflow-x-auto no-scrollbar">
                                {m.tags.map((tag: string) => (
                                  <span key={tag} className="inline-flex items-center rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Card Actions */}
                            <div className="flex items-center border-t border-border divide-x divide-border">
                              <button
                                onClick={() => openAssignAiModel(m)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                <span>Assign</span>
                              </button>
                              <button
                                onClick={() => openEditAIModel(m)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => deleteAIModel(m)}
                                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Cooldowns Card */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Timer className="h-4 w-4 text-orange-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Rate Limit Cooldowns</p>
                        <p className="text-xs text-muted-foreground">AI endpoint throttling events in the last 24h</p>
                      </div>
                    </div>
                    <button
                      onClick={() => loadTab("ai")}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  {aiModelCooldowns.length === 0 ? (
                    <div className="flex items-center gap-3 px-4 py-6 justify-center">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <p className="text-sm text-muted-foreground">No rate-limit cooldowns in the last 24 hours</p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop cooldown list */}
                      <div className="hidden sm:block max-h-64 overflow-y-auto divide-y divide-border">
                        {aiModelCooldowns.map((c, i) => {
                          const waitSec = Math.round((c.waitMs || 0) / 1000)
                          const isLong = waitSec >= 30

                          return (
                            <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isLong ? "bg-destructive/10" : "bg-orange-500/10"
                                }`}>
                                <Timer className={`h-3.5 w-3.5 ${isLong ? "text-destructive" : "text-orange-400"}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {c.modelName || c.modelId || "unknown"}
                                  </p>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${isLong
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-orange-500/10 text-orange-400"
                                    }`}>
                                    {waitSec}s wait
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                  <span className="truncate font-mono">{c.endpoint}</span>
                                  <span>·</span>
                                  <span className="whitespace-nowrap">{new Date(c.timestamp).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Mobile cooldown cards */}
                      <div className="sm:hidden max-h-80 overflow-y-auto divide-y divide-border">
                        {aiModelCooldowns.map((c, i) => {
                          const waitSec = Math.round((c.waitMs || 0) / 1000)
                          const isLong = waitSec >= 30

                          return (
                            <div key={i} className="px-4 py-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {c.modelName || c.modelId || "unknown"}
                                </p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium shrink-0 ${isLong
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-orange-500/10 text-orange-400"
                                  }`}>
                                  {waitSec}s
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono truncate">{c.endpoint}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {new Date(c.timestamp).toLocaleString()}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ ANNOUNCEMENTS / PRODUCT UPDATES ═══════════════ */}
            <TabsContent value="announcements" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Megaphone className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Announcements</p>
                        <p className="text-xs text-muted-foreground">
                          Send product updates and platform announcements
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setAnnPreview((p) => !p)}
                        className={`rounded-lg p-2 transition-colors ${annPreview
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        title={annPreview ? "Hide preview" : "Show preview"}
                      >
                        {annPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!annSubject.trim() || !annMessage.trim()) return alert("Subject and message are required for test send");
                          setAnnSending(true);
                          try {
                            const res = await apiFetch(API_ENDPOINTS.adminProductUpdates, {
                              method: "POST",
                              body: JSON.stringify({ subject: annSubject, message: annMessage, test: true }),
                            });
                            if (res && res.success) alert(`Test sent — ${res.recipients} recipient(s)`);
                            else alert("Test send failed");
                          } catch (e: any) {
                            alert("Test send failed: " + (e.message || e));
                          } finally {
                            setAnnSending(false);
                          }
                        }}
                        disabled={annSending || !annSubject.trim() || !annMessage.trim()}
                        className="h-8 gap-1.5 border-border"
                      >
                        {annSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">Send Test</span>
                        <span className="sm:hidden">Test</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Composer + Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Composer */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <Edit className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium text-foreground">Compose</p>
                    </div>
                    <div className="flex flex-col gap-4 p-4">
                      {/* Subject */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          Subject
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Platform Maintenance Notice"
                          value={annSubject}
                          onChange={(e) => setAnnSubject(e.target.value)}
                          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>

                      {/* Message */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                            Message
                          </label>
                          <span className="text-[10px] text-muted-foreground">Markdown supported</span>
                        </div>
                        <textarea
                          placeholder="Write your announcement…"
                          value={annMessage}
                          onChange={(e) => setAnnMessage(e.target.value)}
                          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors min-h-[280px] resize-y font-mono whitespace-pre-wrap"
                        />
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>{annMessage.length} characters</span>
                          {annMessage.trim() && (
                            <>
                              <span>·</span>
                              <span>~{Math.ceil(annMessage.trim().split(/\s+/).length / 200)} min read</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Options & Send */}
                      <div className="flex flex-col gap-3 pt-1">
                        <label className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 cursor-pointer hover:bg-secondary/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={annForce}
                            onChange={(e) => setAnnForce(e.target.checked)}
                            className="rounded border-border"
                          />
                          <div>
                            <p className="text-xs font-medium text-foreground">Force send to everyone</p>
                            <p className="text-[11px] text-muted-foreground">Override user email preferences</p>
                          </div>
                        </label>

                        {annForce && (
                          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                            <p className="text-[11px] text-warning">
                              This will send the email to all users regardless of their notification preferences.
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!annSubject.trim() || !annMessage.trim()) return alert("Subject and message are required");
                              const ok = await confirmAsync(
                                "Send this announcement to ALL users? This will respect or override preferences based on the Force option."
                              );
                              if (!ok) return;
                              setAnnSending(true);
                              try {
                                const res = await apiFetch(API_ENDPOINTS.adminProductUpdates, {
                                  method: "POST",
                                  body: JSON.stringify({ subject: annSubject, message: annMessage, force: annForce }),
                                });
                                if (res && res.success) alert(`Broadcast sent — ${res.recipients} recipient(s)`);
                                else alert("Broadcast failed");
                              } catch (e: any) {
                                alert("Broadcast failed: " + (e.message || e));
                              } finally {
                                setAnnSending(false);
                              }
                            }}
                            disabled={annSending || !annSubject.trim() || !annMessage.trim()}
                            variant="destructive"
                            className="gap-1.5"
                          >
                            {annSending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">Send Broadcast</span>
                            <span className="sm:hidden">Broadcast</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs font-medium text-foreground">Email Preview</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground rounded-full bg-secondary/50 px-2 py-0.5">
                        Live preview
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col p-4">
                      {/* Email header mock */}
                      <div className="rounded-t-lg border border-border bg-secondary/30 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {annSubject || "Announcement Subject"}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>From: Eclipse Systems</span>
                              <span>·</span>
                              <span>Just now</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400 shrink-0">
                            Preview
                          </Badge>
                        </div>
                      </div>

                      {/* Email body */}
                      <div className="flex-1 rounded-b-lg border border-t-0 border-border bg-background overflow-y-auto">
                        <div className="p-4">
                          {(() => {
                            const detailParts: string[] = [];
                            if (user?.firstName) detailParts.push(user.firstName);
                            if (user?.middleName) detailParts.push(user.middleName[0] + ".");
                            if (user?.lastName) detailParts.push(user.lastName[0] + ".");
                            const previewDetails = `${detailParts.join(" ")} — ${user?.email || ""}`.trim();
                            return (
                              <EmailPreview
                                title={annSubject || "Announcement Subject"}
                                message={annMessage || ""}
                                details={previewDetails}
                              />
                            );
                          })()}
                        </div>
                      </div>

                      {/* Preview footer */}
                      <div className="flex items-start gap-2 mt-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2">
                        <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          This is an approximate preview. Final rendering may vary by email client.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Preview Toggle (shows below composer on small screens) */}
                <div className="lg:hidden">
                  {!annPreview && annMessage.trim() && (
                    <button
                      onClick={() => setAnnPreview(true)}
                      className="w-full rounded-xl border border-dashed border-border bg-card/50 py-4 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                    >
                      <Eye className="h-5 w-5" />
                      <span className="text-xs font-medium">Tap to preview email</span>
                    </button>
                  )}
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ FRAUD DETECTION ════════════════════════════ */}
            <TabsContent value="fraud" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Fraud Detection</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI scans user billing info for suspicious patterns</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setFraudScanningAll(true);
                        try {
                          const res = await apiFetch(API_ENDPOINTS.adminFraudScanAll, { method: "POST" });
                          alert(`Scan complete — ${res.flagged} user(s) flagged`);
                          const data = await apiFetch(API_ENDPOINTS.adminFraudAlerts);
                          setFraudAlerts(data || []);
                        } catch (e: any) {
                          alert("Scan failed: " + e.message);
                        } finally {
                          setFraudScanningAll(false);
                        }
                      }}
                      disabled={fraudScanningAll}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors disabled:opacity-50"
                    >
                      {fraudScanningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                      {fraudScanningAll ? "Scanning All…" : "Scan All Users"}
                    </button>
                    <button
                      onClick={() => forceRefreshTab("fraud")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {displayedFraudAlerts.length === 0 ? (
                  <div className="p-8 text-center">
                    <Shield className="h-8 w-8 mx-auto text-success/60 mb-2" />
                    <p className="text-sm text-muted-foreground">No fraud alerts — all users look clean</p>
                  </div>
                ) : (
                  <>
                    <div className="p-2 border-b border-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center text-xs text-muted-foreground gap-2">
                          <input type="checkbox" checked={hideSuspendedFraud} onChange={(e) => setHideSuspendedFraud(e.target.checked)} className="accent-primary" />
                          Hide suspended
                        </label>
                        <button
                          onClick={() => {
                            const nowAll = !selectAllFraud
                            setSelectAllFraud(nowAll)
                            if (nowAll) setSelectedFraudIds(displayedFraudAlerts.map((a) => a.id))
                            else setSelectedFraudIds([])
                          }}
                          className="text-xs rounded px-2 py-1 border border-border bg-secondary/50 text-foreground"
                        >
                          {selectAllFraud ? 'Unselect All' : 'Select All'}
                        </button>
                        <button
                          onClick={async () => {
                            if (selectedFraudIds.length === 0) return
                            if (!(await confirmAsync(`Dismiss ${selectedFraudIds.length} selected fraud alert(s)?`))) return
                            setBulkDismissing(true)
                            try {
                              await apiFetch(API_ENDPOINTS.adminFraudBulkDismiss, { method: 'POST', body: JSON.stringify({ ids: selectedFraudIds }) })
                              setFraudAlerts((prev) => prev.filter((a) => !selectedFraudIds.includes(a.id)))
                              setSelectedFraudIds([])
                              setSelectAllFraud(false)
                            } catch (e: any) {
                              alert('Failed to dismiss: ' + (e?.message || 'error'))
                            } finally {
                              setBulkDismissing(false)
                            }
                          }}
                          disabled={selectedFraudIds.length === 0 || bulkDismissing}
                          className="text-xs rounded px-2 py-1 border border-border bg-secondary/50 text-foreground disabled:opacity-50"
                        >
                          {bulkDismissing ? 'Dismissing…' : `Dismiss Selected (${selectedFraudIds.length})`}
                        </button>
                      </div>
                      <div />
                    </div>
                    <div className="divide-y divide-border">
                      {displayedFraudAlerts.map((alert) => (
                        <div key={alert.id} className="p-4 flex items-start gap-4">
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              checked={selectedFraudIds.includes(alert.id)}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setSelectedFraudIds((prev) => {
                                  if (checked) return [...prev, alert.id]
                                  return prev.filter((id) => id !== alert.id)
                                })
                              }}
                              className="mt-1 mr-3"
                            />
                          </div>
                          <div className="shrink-0 h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-destructive" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {redactName(alert.firstName, alert.lastName)}
                              </span>
                              <span className="text-xs text-muted-foreground">{redact(alert.email)}</span>
                              {alert.suspended && (
                                <Badge className="bg-destructive/20 text-destructive border-0 text-[10px]">Suspended</Badge>
                              )}
                            </div>
                            <p className={privateMode ? "text-xs text-destructive/80 mt-1 blur-sm" : "text-xs text-destructive/80 mt-1"}>
                              {privateMode ? "Sensitive fraud reason redacted" : alert.fraudReason}
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {alert.address && <p><span className="text-foreground/60">Address:</span> {redact(alert.address)}{alert.address2 ? `, ${redact(alert.address2)}` : ''}</p>}
                              {alert.billingCity && <p><span className="text-foreground/60">City:</span> {redact(alert.billingCity)}{alert.billingState ? `, ${redact(alert.billingState)}` : ''} {redact(alert.billingZip)}</p>}
                              {alert.billingCountry && <p><span className="text-foreground/60">Country:</span> {redact(alert.billingCountry)}</p>}
                              {alert.billingCompany && <p><span className="text-foreground/60">Company:</span> {redact(alert.billingCompany)}</p>}
                              {alert.phone && <p><span className="text-foreground/60">Phone:</span> {redact(alert.phone)}</p>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Detected {alert.fraudDetectedAt ? new Date(alert.fraudDetectedAt).toLocaleString() : "—"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={async () => {
                                try {
                                  await apiFetch(API_ENDPOINTS.adminFraudAction.replace(":id", String(alert.id)), {
                                    method: "PUT",
                                    body: JSON.stringify({ action: "dismiss" }),
                                  });
                                  setFraudAlerts((prev) => prev.filter((a) => a.id !== alert.id));
                                } catch (e: any) {
                                  alert("Failed: " + e.message);
                                }
                              }}
                              className="rounded-md border border-border bg-secondary/50 px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              Dismiss
                            </button>
                            {!alert.suspended && (
                              <button
                                onClick={async () => {
                                  if (!(await confirmAsync(`Suspend user ${alert.firstName} ${alert.lastName}?`))) return;
                                  try {
                                    await apiFetch(API_ENDPOINTS.adminFraudAction.replace(":id", String(alert.id)), {
                                      method: "PUT",
                                      body: JSON.stringify({ action: "suspend" }),
                                    });
                                    setFraudAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, suspended: true } : a));
                                  } catch (e: any) {
                                    alert("Failed: " + e.message);
                                  }
                                }}
                                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive hover:bg-destructive/20 transition-colors"
                              >
                                Suspend
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                setFraudScanning(true);
                                try {
                                  const res = await apiFetch(API_ENDPOINTS.adminFraudScan.replace(":id", String(alert.id)), { method: "POST" });
                                  if (!res.isSuspicious) {
                                    setFraudAlerts((prev) => prev.filter((a) => a.id !== alert.id));
                                  } else {
                                    setFraudAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, fraudReason: res.reasons?.join('; ') } : a));
                                  }
                                } catch (e: any) {
                                  alert("Re-scan failed: " + e.message);
                                } finally {
                                  setFraudScanning(false);
                                }
                              }}
                              disabled={fraudScanning}
                              className="rounded-md border border-border bg-secondary/50 px-3 py-1 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors disabled:opacity-50"
                            >
                              Re-scan
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
            {/* ═══════════════ ROLES ════════════════════════════════════ */}
            <TabsContent value="roles" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Shield className="h-4 w-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Roles & Permissions</p>
                        <p className="text-xs text-muted-foreground">
                          {roles.length} role{roles.length !== 1 ? "s" : ""} configured
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => { setRoleDialog(true); setRoleName(""); setRoleDesc(""); }}
                        className="bg-primary text-primary-foreground h-8 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New Role</span>
                        <span className="sm:hidden">New</span>
                      </Button>
                      <button
                        onClick={() => forceRefreshTab("roles")}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="grid gap-4 lg:grid-cols-5">

                  {/* Role List — Left Panel */}
                  <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <List className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium text-foreground">Roles</p>
                      <span className="ml-auto text-[10px] text-muted-foreground">{roles.length}</span>
                    </div>

                    {roles.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-amber-400/60" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-foreground">No roles yet</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Create your first role to manage permissions.</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => { setRoleDialog(true); setRoleName(""); setRoleDesc(""); }}
                          className="bg-primary text-primary-foreground gap-1.5 mt-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Create Role
                        </Button>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">

                        {/* Desktop Role List */}
                        <div className="hidden md:flex flex-col divide-y divide-border">
                          {roles.map((role) => {
                            const isSelected = selectedRole?.id === role.id
                            const permCount = role.permissions?.length || 0
                            const hasWildcard = role.permissions?.some((p: any) => p.value === "*")

                            return (
                              <div
                                key={role.id}
                                onClick={() => setSelectedRole(role)}
                                className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-all group ${isSelected
                                  ? "bg-primary/10 border-l-2 border-l-primary"
                                  : "hover:bg-secondary/30 border-l-2 border-l-transparent"
                                  }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                                      {role.name}
                                    </p>
                                    {hasWildcard && (
                                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                        FULL
                                      </span>
                                    )}
                                  </div>
                                  {role.description && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{role.description}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Key className="h-2.5 w-2.5 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">
                                      {permCount} permission{permCount !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!(await confirmAsync(`Delete role "${role.name}"?`))) return;
                                    await apiFetch(`${API_ENDPOINTS.roles}/${role.id}`, { method: "DELETE" });
                                    setRoles((prev) => prev.filter((r) => r.id !== role.id));
                                    if (selectedRole?.id === role.id) setSelectedRole(null);
                                  }}
                                  className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>

                        {/* Mobile Role Cards */}
                        <div className="flex flex-col gap-2 p-2 md:hidden">
                          {roles.map((role) => {
                            const isSelected = selectedRole?.id === role.id
                            const permCount = role.permissions?.length || 0
                            const hasWildcard = role.permissions?.some((p: any) => p.value === "*")

                            return (
                              <div
                                key={role.id}
                                onClick={() => setSelectedRole(role)}
                                className={`rounded-lg border p-3 cursor-pointer transition-all ${isSelected
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-border hover:border-primary/20 hover:bg-secondary/20"
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                                        {role.name}
                                      </p>
                                      {hasWildcard && (
                                        <span className="rounded px-1 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">
                                          FULL
                                        </span>
                                      )}
                                    </div>
                                    {role.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      <Key className="h-2.5 w-2.5 text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">
                                        {permCount} permission{permCount !== 1 ? "s" : ""}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!(await confirmAsync(`Delete role "${role.name}"?`))) return;
                                      await apiFetch(`${API_ENDPOINTS.roles}/${role.id}`, { method: "DELETE" });
                                      setRoles((prev) => prev.filter((r) => r.id !== role.id));
                                      if (selectedRole?.id === role.id) setSelectedRole(null);
                                    }}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Permissions Panel — Right */}
                  <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <Key className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium text-foreground">
                        {selectedRole ? `Permissions` : "Permissions"}
                      </p>
                      {selectedRole && (
                        <>
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className="text-xs font-medium text-primary truncate">{selectedRole.name}</span>
                          <span className="ml-auto inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                            {selectedRole.permissions?.length || 0}
                          </span>
                        </>
                      )}
                    </div>

                    {!selectedRole ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                        <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center">
                          <MousePointerClick className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-foreground">No role selected</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {roles.length > 0 ? "Select a role to manage its permissions." : "Create a role first."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col">
                        {/* Add permission */}
                        <div className="p-4 border-b border-border bg-secondary/10">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                            Add Permission
                          </p>
                          <div className="flex gap-2">
                            <select
                              value={newPermValue}
                              onChange={(e) => setNewPermValue(e.target.value)}
                              className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 cursor-pointer"
                            >
                              <option value="">— select a permission —</option>
                              <optgroup label="Global">
                                <option value="*">* (full access)</option>
                              </optgroup>
                              <optgroup label="Servers">
                                <option value="servers:read">servers:read</option>
                                <option value="servers:write">servers:write</option>
                                <option value="servers:delete">servers:delete</option>
                                <option value="servers:*">servers:*</option>
                              </optgroup>
                              <optgroup label="Nodes">
                                <option value="nodes:read">nodes:read</option>
                                <option value="nodes:write">nodes:write</option>
                                <option value="nodes:*">nodes:*</option>
                              </optgroup>
                              <optgroup label="AI">
                                <option value="ai:chat">ai:chat</option>
                                <option value="ai:create">ai:create</option>
                                <option value="ai:assign">ai:assign</option>
                                <option value="ai:*">ai:*</option>
                              </optgroup>
                              <optgroup label="SOC">
                                <option value="soc:read">soc:read</option>
                                <option value="soc:write">soc:write</option>
                                <option value="soc:*">soc:*</option>
                              </optgroup>
                              <optgroup label="Orders">
                                <option value="orders:read">orders:read</option>
                                <option value="orders:create">orders:create</option>
                                <option value="orders:*">orders:*</option>
                              </optgroup>
                              <optgroup label="Roles & Permissions">
                                <option value="roles:read">roles:read</option>
                                <option value="roles:create">roles:create</option>
                                <option value="permissions:assign">permissions:assign</option>
                              </optgroup>
                              <optgroup label="Wings">
                                <option value="wings:system">wings:system</option>
                                <option value="wings:transfers">wings:transfers</option>
                                <option value="wings:backups">wings:backups</option>
                                <option value="wings:deauthorize">wings:deauthorize</option>
                                <option value="wings:*">wings:*</option>
                              </optgroup>
                              <optgroup label="DNS / Tickets / Other">
                                <option value="dns:read">dns:read</option>
                                <option value="dns:write">dns:write</option>
                                <option value="tickets:read">tickets:read</option>
                                <option value="tickets:write">tickets:write</option>
                              </optgroup>
                            </select>
                            <Button
                              size="sm"
                              disabled={!newPermValue.trim() || permLoading}
                              onClick={async () => {
                                if (!newPermValue.trim()) return;
                                setPermLoading(true);
                                try {
                                  const data = await apiFetch(`${API_ENDPOINTS.roles}/${selectedRole.id}/permissions`, {
                                    method: "POST",
                                    body: JSON.stringify({ value: newPermValue.trim() }),
                                  });
                                  const updated = { ...selectedRole, permissions: [...(selectedRole.permissions || []), data.perm] };
                                  setSelectedRole(updated);
                                  setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                                  setNewPermValue("");
                                } finally {
                                  setPermLoading(false);
                                }
                              }}
                              className="bg-primary text-primary-foreground gap-1.5 h-9 px-3 text-xs shrink-0"
                            >
                              {permLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-3 w-3" />
                                  <span className="hidden sm:inline">Add</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Permission list */}
                        <div className="flex-1 overflow-y-auto">
                          {(selectedRole.permissions || []).length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
                              <Key className="h-6 w-6 text-muted-foreground/40" />
                              <p className="text-xs text-muted-foreground">No permissions assigned yet</p>
                            </div>
                          ) : (
                            <>
                              {/* Group permissions by category */}
                              {(() => {
                                const perms = selectedRole.permissions || []
                                const groups: Record<string, typeof perms> = {}

                                perms.forEach((p: any) => {
                                  const [cat] = p.value.split(":")
                                  const category = p.value === "*" ? "Global" : cat.charAt(0).toUpperCase() + cat.slice(1)
                                  if (!groups[category]) groups[category] = []
                                  groups[category].push(p)
                                })

                                const categoryColors: Record<string, string> = {
                                  Global: "text-destructive",
                                  Servers: "text-blue-400",
                                  Nodes: "text-emerald-400",
                                  Ai: "text-violet-400",
                                  Soc: "text-orange-400",
                                  Orders: "text-amber-400",
                                  Roles: "text-pink-400",
                                  Permissions: "text-pink-400",
                                  Wings: "text-cyan-400",
                                  Dns: "text-teal-400",
                                  Tickets: "text-indigo-400",
                                }

                                return (
                                  <div className="divide-y divide-border">
                                    {Object.entries(groups).map(([category, items]) => (
                                      <div key={category} className="px-4 py-3">
                                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${categoryColors[category] || "text-muted-foreground"}`}>
                                          {category}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {items.map((p: any) => {
                                            const isWildcard = p.value === "*" || p.value.endsWith(":*")
                                            return (
                                              <div
                                                key={p.id}
                                                className={`group/perm inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${isWildcard
                                                  ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                                                  : "border-border bg-secondary/20 hover:bg-secondary/40"
                                                  }`}
                                              >
                                                <span className={`font-mono text-xs ${isWildcard ? "text-destructive font-medium" : "text-foreground"}`}>
                                                  {p.value}
                                                </span>
                                                <button
                                                  onClick={async () => {
                                                    await apiFetch(`${API_ENDPOINTS.roles}/${selectedRole.id}/permissions/${p.id}`, { method: "DELETE" });
                                                    const updated = { ...selectedRole, permissions: selectedRole.permissions.filter((x: any) => x.id !== p.id) };
                                                    setSelectedRole(updated);
                                                    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                                                  }}
                                                  className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/perm:opacity-100 hover:text-destructive transition-all"
                                                >
                                                  <X className="h-3 w-3" />
                                                </button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </>
                          )}
                        </div>

                        {/* Full access warning */}
                        {selectedRole.permissions?.some((p: any) => p.value === "*") && (
                          <div className="flex items-start gap-2.5 border-t border-destructive/20 bg-destructive/5 px-4 py-3">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            <p className="text-[11px] text-destructive">
                              This role has full access (<code className="font-mono font-bold">*</code>). Users with this role can perform any action.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
            {/* ═══════════════ LOGS ════════════════════════════════════ */}
            <TabsContent value="logs" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <ScrollText className="h-4 w-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Audit Logs</p>
                          <p className="text-xs text-muted-foreground">
                            {logsTotal ? `${logsTotal} entries` : "System activity & diagnostics"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {logType === "slow" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await apiFetch(`${API_ENDPOINTS.adminSlowQueries}/clear`, { method: "POST" });
                                await fetchLogs(1, "slow", logsUserFilter);
                              } catch { }
                            }}
                            className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Clear</span>
                          </Button>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              await fetchLogs(logsPage, logType, logsUserFilter);
                            } catch {
                              await fetchLogs(1, logType, logsUserFilter);
                            }
                          }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Log type tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                      {(["audit", "requests", "slow"] as const).map((t) => {
                        const config: Record<string, { label: string; icon: any; color: string }> = {
                          audit: { label: "Audit", icon: Shield, color: "text-indigo-400" },
                          requests: { label: "API Requests", icon: Globe, color: "text-blue-400" },
                          slow: { label: "Slow Queries", icon: Timer, color: "text-orange-400" },
                        }
                        const c = config[t]
                        const Icon = c.icon
                        const isActive = logType === t

                        return (
                          <button
                            key={t}
                            onClick={async () => {
                              setLogType(t);
                              try {
                                await fetchLogs(1, t, logsUserFilter);
                              } catch { }
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive
                              ? `bg-secondary ${c.color}`
                              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                              }`}
                          >
                            <Icon className="h-3 w-3" />
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="rounded-xl border border-border bg-card hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Time</th>
                          {(logType === "audit" || logType === "requests") && (
                            <th className="px-4 py-3 text-left font-medium">User</th>
                          )}
                          {logType === "audit" && (
                            <th className="px-4 py-3 text-left font-medium">Action</th>
                          )}
                          {logType === "requests" && (
                            <>
                              <th className="px-4 py-3 text-left font-medium">Endpoint</th>
                              <th className="px-4 py-3 text-left font-medium">Count</th>
                            </>
                          )}
                          {logType === "slow" && (
                            <>
                              <th className="px-4 py-3 text-left font-medium">Duration</th>
                              <th className="px-4 py-3 text-left font-medium">Query</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={logType === "requests" ? 4 : 3} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <ScrollText className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">No logs found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          logs.map((log: any, i) => {
                            const isSlowWarning = logType === "slow" && log.durationMs >= 1000
                            const isSlowCritical = logType === "slow" && log.durationMs >= 5000

                            return (
                              <tr
                                key={log.id ?? i}
                                className={`border-b border-border/50 transition-colors hover:bg-secondary/20 group ${isSlowCritical ? "bg-destructive/5" : isSlowWarning ? "bg-warning/5" : ""
                                  }`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${logType === "audit"
                                      ? "bg-indigo-400"
                                      : logType === "requests"
                                        ? "bg-blue-400"
                                        : isSlowCritical
                                          ? "bg-destructive"
                                          : isSlowWarning
                                            ? "bg-warning"
                                            : "bg-orange-400"
                                      }`} />
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                </td>

                                {(logType === "audit" || logType === "requests") && (
                                  <td className="px-4 py-3">
                                    {log.username ? (
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                                          {log.username?.[0]?.toUpperCase() || "?"}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-foreground truncate">{redact(log.username)}</p>
                                          <p className="text-[11px] text-muted-foreground truncate">{redact(log.email)}</p>
                                        </div>
                                      </div>
                                    ) : log.userId !== undefined && log.userId !== null ? (
                                      <span className={`inline-flex items-center gap-1 text-xs ${log.userId === 0 ? "text-muted-foreground italic" : "text-muted-foreground"}`}>
                                        {log.userId === 0 ? (
                                          <>
                                            <Bot className="h-3 w-3" />
                                            System
                                          </>
                                        ) : (
                                          redact(log.userId)
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                )}

                                {logType === "audit" && (
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-foreground">
                                      {log.action}
                                    </span>
                                  </td>
                                )}

                                {logType === "requests" && (
                                  <>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-foreground max-w-[300px] truncate">
                                        {log.endpoint}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-xs font-medium text-foreground">{log.count}</span>
                                    </td>
                                  </>
                                )}

                                {logType === "slow" && (
                                  <>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-medium ${isSlowCritical
                                        ? "bg-destructive/10 text-destructive"
                                        : isSlowWarning
                                          ? "bg-warning/10 text-warning"
                                          : "bg-orange-500/10 text-orange-400"
                                        }`}>
                                        {log.durationMs >= 1000
                                          ? `${(log.durationMs / 1000).toFixed(1)}s`
                                          : `${log.durationMs}ms`
                                        }
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="max-w-[480px]">
                                        <p className="font-mono text-xs text-foreground break-words line-clamp-2 group-hover:line-clamp-none transition-all">
                                          {log.query}
                                        </p>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="flex flex-col gap-2 md:hidden">
                  {logs.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <ScrollText className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">No logs found</p>
                      </div>
                    </div>
                  ) : (
                    logs.map((log: any, i) => {
                      const isSlowWarning = logType === "slow" && log.durationMs >= 1000
                      const isSlowCritical = logType === "slow" && log.durationMs >= 5000

                      return (
                        <div
                          key={log.id ?? i}
                          className={`rounded-xl border bg-card overflow-hidden ${isSlowCritical
                            ? "border-destructive/30"
                            : isSlowWarning
                              ? "border-warning/30"
                              : "border-border"
                            }`}
                        >
                          {/* Severity bar for slow queries */}
                          {logType === "slow" && (isSlowWarning || isSlowCritical) && (
                            <div className={`h-0.5 ${isSlowCritical ? "bg-destructive" : "bg-warning"}`} />
                          )}

                          <div className="p-3">
                            {/* Timestamp + type indicator */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5">
                                <div className={`h-1.5 w-1.5 rounded-full ${logType === "audit"
                                  ? "bg-indigo-400"
                                  : logType === "requests"
                                    ? "bg-blue-400"
                                    : isSlowCritical
                                      ? "bg-destructive"
                                      : "bg-orange-400"
                                  }`} />
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(log.timestamp).toLocaleString()}
                                </span>
                              </div>

                              {logType === "slow" && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${isSlowCritical
                                  ? "bg-destructive/10 text-destructive"
                                  : isSlowWarning
                                    ? "bg-warning/10 text-warning"
                                    : "bg-orange-500/10 text-orange-400"
                                  }`}>
                                  {log.durationMs >= 1000
                                    ? `${(log.durationMs / 1000).toFixed(1)}s`
                                    : `${log.durationMs}ms`
                                  }
                                </span>
                              )}

                              {logType === "requests" && (
                                <span className="inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-foreground">
                                  ×{log.count}
                                </span>
                              )}
                            </div>

                            {/* User info (audit & requests) */}
                            {(logType === "audit" || logType === "requests") && (
                              <div className="mb-2">
                                {log.username ? (
                                  <div className="flex items-center gap-2">
                                    {log.avatarUrl ? (
                                      <img src={log.avatarUrl} alt={`${log.username} avatar`} className="h-5 w-5 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                                        {log.username?.[0]?.toUpperCase() || "?"}
                                      </div>
                                    )}
                                    <span className="text-xs font-medium text-foreground truncate">{redact(log.username)}</span>
                                  </div>
                                ) : log.userId !== undefined && log.userId !== null ? (
                                  <span className="text-xs text-muted-foreground">
                                    {log.userId === 0 ? "System" : redact(log.userId)}
                                  </span>
                                ) : null}
                              </div>
                            )}

                            {/* Main content */}
                            {logType === "audit" && (
                              <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-foreground">
                                {log.action}
                              </span>
                            )}

                            {logType === "requests" && (
                              <p className="font-mono text-xs text-foreground truncate">{log.endpoint}</p>
                            )}

                            {logType === "slow" && (
                              <p className="font-mono text-[11px] text-foreground break-words line-clamp-3">
                                {log.query}
                              </p>
                            )}
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
                      {logType === "slow" ? (
                        <>
                          Showing <span className="font-medium text-foreground">{logs.length}</span> slow queries
                        </>
                      ) : (
                        <>
                          Page <span className="font-medium text-foreground">{logsPage}</span>
                          {logsTotal ? (
                            <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(logsTotal / logsPer))}</span></>
                          ) : null}
                          {logsTotal ? (
                            <span className="hidden sm:inline"> · {logsTotal} entries</span>
                          ) : null}
                        </>
                      )}
                    </p>
                    {logType !== "slow" && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchLogs(Math.max(1, logsPage - 1), logType, logsUserFilter)}
                          disabled={logsPage <= 1 || logsLoading}
                          className="h-8 px-3 text-xs"
                        >
                          <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                          <span className="hidden sm:inline ml-1">Previous</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchLogs(logsPage + 1, logType, logsUserFilter)}
                          disabled={(logsTotal !== null && logsPage >= Math.ceil((logsTotal || 0) / logsPer)) || logsLoading}
                          className="h-8 px-3 text-xs"
                        >
                          <span className="hidden sm:inline mr-1">Next</span>
                          <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
            {/* ═════════════════ OAUTH ═══════════════════════════════════ */}
            <TabsContent value="oauth" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* ── Summary bar ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: Globe, label: "Endpoints", value: "13" },
                    { icon: Key, label: "Scopes", value: "7" },
                    { icon: Zap, label: "Grant Types", value: "3" },
                    { icon: Lock, label: "PKCE", value: "S256 / plain" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <s.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-semibold text-foreground">{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                  {/* ── LEFT: API reference ──────────────────────────── */}
                  <div className="lg:col-span-2 flex flex-col gap-4">

                    {/* Discovery */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Globe className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">RFC 8414 Discovery</p>
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground mb-3">Services discover the server metadata automatically via this well-known URL:</p>
                        <div className="relative">
                          <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto">
                            {`GET /.well-known/oauth-authorization-server`}</pre>
                          <button onClick={() => navigator.clipboard.writeText("GET /.well-known/oauth-authorization-server")} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Returns <code className="font-mono text-foreground">issuer</code>, <code className="font-mono text-foreground">authorization_endpoint</code>, <code className="font-mono text-foreground">token_endpoint</code>, supported scopes and grant types.</p>
                      </div>
                    </div>

                    {/* Endpoints table */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Endpoint Reference</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="px-4 py-2.5 text-left font-medium w-20">Method</th>
                              <th className="px-4 py-2.5 text-left font-medium">Path</th>
                              <th className="px-4 py-2.5 text-left font-medium">Auth</th>
                              <th className="px-4 py-2.5 text-left font-medium">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { method: "GET", path: "/.well-known/oauth-authorization-server", auth: "—", desc: "RFC 8414 discovery metadata" },
                              { method: "POST", path: "/api/oauth/apps", auth: "Bearer JWT", desc: "Register a new OAuth application" },
                              { method: "GET", path: "/api/oauth/apps", auth: "Bearer JWT", desc: "List your registered apps" },
                              { method: "GET", path: "/api/oauth/apps/:clientId", auth: "—", desc: "Public app info (used by consent UI)" },
                              { method: "PUT", path: "/api/oauth/apps/:id", auth: "Bearer JWT", desc: "Update app settings" },
                              { method: "DELETE", path: "/api/oauth/apps/:id", auth: "Bearer JWT", desc: "Delete app + revoke all tokens" },
                              { method: "POST", path: "/api/oauth/apps/:id/rotate-secret", auth: "Bearer JWT", desc: "Rotate client secret, revoke all tokens" },
                              { method: "GET", path: "/api/oauth/authorize", auth: "—", desc: "Return consent page data (app info + scopes)" },
                              { method: "POST", path: "/api/oauth/authorize", auth: "Bearer JWT", desc: "User approves / denies → returns redirect URL" },
                              { method: "POST", path: "/api/oauth/token", auth: "client_secret", desc: "Exchange code / credentials for token" },
                              { method: "POST", path: "/api/oauth/token/revoke", auth: "client_secret", desc: "Revoke access or refresh token (RFC 7009)" },
                              { method: "POST", path: "/api/oauth/token/introspect", auth: "client_secret", desc: "Validate token + return metadata (RFC 7662)" },
                              { method: "GET", path: "/api/oauth/userinfo", auth: "Bearer OAuth", desc: "Scoped user profile (OpenID-style)" },
                            ].map((ep) => (
                              <tr key={ep.path + ep.method} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                <td className="px-4 py-2.5">
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${ep.method === "GET" ? "bg-blue-500/15 text-blue-400" :
                                    ep.method === "POST" ? "bg-green-500/15 text-green-400" :
                                      ep.method === "PUT" ? "bg-yellow-500/15 text-yellow-400" :
                                        "bg-red-500/15 text-red-400"
                                    }`}>{ep.method}</span>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-foreground">{ep.path}</td>
                                <td className="px-4 py-2.5">
                                  <span className="text-[10px] text-muted-foreground">{ep.auth}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{ep.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Scopes */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Shield className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Scope Reference</p>
                      </div>
                      <div className="p-4 flex flex-col gap-2">
                        {[
                          { scope: "profile", desc: "firstName, lastName, displayName, avatarUrl, portalType, role" },
                          { scope: "email", desc: "email + emailVerified flag" },
                          { scope: "orgs:read", desc: "Organisation id, name, handle and the user's orgRole" },
                          { scope: "billing:read", desc: "Billing address fields (company, city, state, zip, country)" },
                          { scope: "servers:read", desc: "List user's servers across all nodes" },
                          { scope: "servers:write", desc: "Manage / power user's servers" },
                          { scope: "admin", desc: "Admin-level access — only grantable to admin users" },
                        ].map((s) => (
                          <div key={s.scope} className="flex items-start gap-3">
                            <code className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary whitespace-nowrap mt-0.5">{s.scope}</code>
                            <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Auth Code Flow */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Zap className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Authorization Code Flow (+ PKCE)</p>
                      </div>
                      <div className="flex flex-col gap-3 p-4">
                        {[
                          {
                            step: "1 — Redirect user to consent page",
                            code: `GET /api/oauth/authorize
  ?client_id=<clientId>
  &redirect_uri=https://yourapp.com/callback
  &scope=profile%20email
  &response_type=code
  &state=random_state
  &code_challenge=<sha256_of_verifier_base64url>
  &code_challenge_method=S256`,
                            note: "Returns JSON with app info and grantable scopes so your UI can render a consent page.",
                          },
                          {
                            step: "2 — User approves (POST from your frontend with the user's panel JWT)",
                            code: `POST /api/oauth/authorize
Authorization: Bearer <panel_jwt>
Content-Type: application/json

{
  "client_id": "<clientId>",
  "redirect_uri": "https://yourapp.com/callback",
  "scope": "profile email",
  "state": "random_state",
  "approved": true,
  "code_challenge": "<sha256_of_verifier_base64url>",
  "code_challenge_method": "S256"
}`,
                            note: `Response: { "redirect": "https://yourapp.com/callback?code=abc&state=xyz" }`,
                          },
                          {
                            step: "3 — Exchange code for tokens",
                            code: `POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<code_from_step_2>",
  "redirect_uri": "https://yourapp.com/callback",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>",
  "code_verifier": "<original_random_verifier>"
}`,
                            note: `Response: { "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "...", "scope": "profile email" }`,
                          },
                          {
                            step: "4 — Call EcliPanel APIs",
                            code: `GET /api/oauth/userinfo
Authorization: Bearer <access_token>`,
                            note: "Any EcliPanel endpoint protected by authenticate will accept this token. Responses are scope-gated.",
                          },
                        ].map((s, i) => (
                          <div key={i} className="flex flex-col gap-1.5">
                            <p className="text-xs font-semibold text-foreground">{s.step}</p>
                            <div className="relative">
                              <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{s.code}</pre>
                              <button onClick={() => navigator.clipboard.writeText(s.code)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                            </div>
                            {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Client Credentials Flow */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Key className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Client Credentials Flow (service-to-service)</p>
                      </div>
                      <div className="p-4 flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">No user involved — use when an Eclipse backend service authenticates directly as the app.</p>
                        <div className="relative">
                          <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{`POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>",
  "scope": "servers:read"
}`}</pre>
                          <button onClick={() => navigator.clipboard.writeText(`POST /api/oauth/token\nContent-Type: application/json\n\n{\n  "grant_type": "client_credentials",\n  "client_id": "<clientId>",\n  "client_secret": "<clientSecret>",\n  "scope": "servers:read"\n}`)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">The app must have <code className="font-mono text-foreground">client_credentials</code> in its <code className="font-mono text-foreground">grantTypes</code> when registered.</p>
                      </div>
                    </div>

                    {/* Token Introspection */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <FileCode className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Token Introspection (RFC 7662)</p>
                      </div>
                      <div className="p-4 flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">Resource servers can validate any access token without calling userinfo. Returns <code className="font-mono text-foreground">{`{ "active": false }`}</code> for invalid/expired tokens.</p>
                        <div className="relative">
                          <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{`POST /api/oauth/token/introspect
Content-Type: application/json

{
  "token": "<access_token>",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>"
}

// 200 response when active:
{
  "active": true,
  "scope": "profile email",
  "client_id": "<clientId>",
  "token_type": "Bearer",
  "exp": 1741222800,
  "iat": 1741219200,
  "sub": "42"
}`}</pre>
                          <button onClick={() => navigator.clipboard.writeText(`POST /api/oauth/token/introspect`)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                        </div>
                      </div>
                    </div>

                  </div>{/* end LEFT col */}

                  {/* ── RIGHT: App management ────────────────────────── */}
                  <div className="flex flex-col gap-4">

                    {/* Registered apps */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium text-foreground">Registered Apps</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setOauthCreateName(""); setOauthCreateDesc(""); setOauthCreateRedirects([""])
                              setOauthCreateScopes(["profile", "email"]); setOauthCreateGrants(["authorization_code", "refresh_token"])
                              setOauthCreateOpen(true)
                            }}
                            className="bg-primary text-primary-foreground h-7 gap-1 px-2 text-xs"
                          >
                            <Plus className="h-3 w-3" /> New App
                          </Button>
                          <button
                            onClick={async () => {
                              try {
                                const data = await apiFetch("/api/oauth/apps")
                                setOauthApps(Array.isArray(data) ? data : [])
                              } catch { }
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {oauthApps.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No OAuth apps registered yet.</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {oauthApps.map((oa: any) => (
                            <div key={oa.id} className="p-4 flex flex-col gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground truncate">{oa.name}</p>
                                <button
                                  onClick={async () => {
                                    if (!(await confirmAsync(`Delete app "${oa.name}"? All tokens will be revoked.`))) return
                                    try {
                                      await apiFetch(`/api/oauth/apps/${oa.id}`, { method: "DELETE" })
                                      setOauthApps((prev) => prev.filter((a) => a.id !== oa.id))
                                    } catch { }
                                  }}
                                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                  title="Delete app"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <p className="text-[11px] font-mono text-muted-foreground break-all">{oa.clientId}</p>
                              {oa.description && <p className="text-xs text-muted-foreground">{oa.description}</p>}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(oa.allowedScopes || []).map((s: string) => (
                                  <span key={s} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">{s}</span>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(oa.grantTypes || []).map((g: string) => (
                                  <span key={g} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{g}</span>
                                ))}
                              </div>
                              {/* Redirect URIs */}
                              {(oa.redirectUris || []).length > 0 && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  {(oa.redirectUris as string[]).map((uri) => (
                                    <p key={uri} className="text-[10px] font-mono text-muted-foreground truncate">{uri}</p>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 mt-1">
                                <button
                                  onClick={() => openEditOAuthApp(oa)}
                                  className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Edit className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  onClick={() => setOauthRotateApp(oa)}
                                  className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <RefreshCw className="h-3 w-3" /> Rotate Secret
                                </button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Registered {oa.createdAt ? new Date(oa.createdAt).toLocaleDateString() : "—"}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Token TTLs */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Lock className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Token Lifetimes</p>
                      </div>
                      <div className="p-4 flex flex-col gap-2">
                        {[
                          { label: "Authorization code", value: "10 minutes" },
                          { label: "Access token", value: "1 hour" },
                          { label: "Refresh token", value: "30 days" },
                        ].map((t) => (
                          <div key={t.label} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t.label}</span>
                            <span className="text-xs font-mono text-foreground">{t.value}</span>
                          </div>
                        ))}
                        <p className="text-[11px] text-muted-foreground mt-1">Refresh tokens rotate on use. Rotating the client secret immediately revokes all active tokens.</p>
                      </div>
                    </div>

                    {/* Auth methods */}
                    <div className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Shield className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Client Auth Methods</p>
                      </div>
                      <div className="p-4 flex flex-col gap-3">
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-1">client_secret_post</p>
                          <p className="text-xs text-muted-foreground">Send <code className="font-mono text-foreground">client_id</code> and <code className="font-mono text-foreground">client_secret</code> in the JSON body.</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-1">client_secret_basic</p>
                          <p className="text-xs text-muted-foreground">Send <code className="font-mono text-foreground">Authorization: Basic base64(clientId:secret)</code> header.</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-1">PKCE only (public clients)</p>
                          <p className="text-xs text-muted-foreground">Omit <code className="font-mono text-foreground">client_secret</code> when <code className="font-mono text-foreground">code_verifier</code> is present. Forces S256 or plain challenge verification.</p>
                        </div>
                      </div>
                    </div>

                  </div>{/* end RIGHT col */}
                </div>{/* end grid */}
              </div>
            </TabsContent>

            {/* ═════════════════ PLANS ═══════════════════════════════════════ */}
            <TabsContent value="plans" className="mt-4">
              <div className="flex flex-col gap-6 max-w-4xl">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Plans</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Define resource tiers and pricing for users.
                      {plans.length > 0 && (
                        <span className="text-muted-foreground/60"> · {plans.length} {plans.length === 1 ? "plan" : "plans"} configured</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={ensurePortalPlans} disabled={ensureLoading}>
                      {ensureLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      Sync Portal
                    </Button>
                    <Button size="sm" onClick={openNewPlan} className="bg-primary text-primary-foreground">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      New Plan
                    </Button>
                  </div>
                </div>

                {/* Plans Grid */}
                {plans.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card">
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="rounded-full bg-secondary/50 p-4">
                        <Zap className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">No plans configured</p>
                        <p className="text-xs text-muted-foreground mt-1">Create your first plan to define resource tiers for users.</p>
                      </div>
                      <Button size="sm" onClick={openNewPlan} className="mt-2 bg-primary text-primary-foreground">
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Create First Plan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plans.map((plan) => {
                      const isReapplying = planReapplyLoading && planReapplyId === plan.id

                      const resources = [
                        { label: "RAM", value: plan.memory != null ? `${plan.memory} MB` : "∞", icon: "💾" },
                        { label: "Disk", value: plan.disk != null ? `${(plan.disk / 1024).toFixed(0)} GB` : "∞", icon: "💿" },
                        { label: "CPU", value: plan.cpu != null ? `${plan.cpu}%` : "∞", icon: "⚡" },
                        { label: "Servers", value: plan.serverLimit != null ? `${plan.serverLimit}` : "∞", icon: "🖥️" },
                        { label: "DBs", value: plan.databases != null ? `${plan.databases}` : "∞", icon: "🗄️" },
                        { label: "Backups", value: plan.backups != null ? `${plan.backups}` : "∞", icon: "📦" },
                      ]

                      return (
                        <div
                          key={plan.id}
                          className={`group rounded-xl border bg-card transition-all hover:shadow-md hover:border-primary/20 ${plan.isDefault ? "border-green-500/30 ring-1 ring-green-500/10" : "border-border"
                            }`}
                        >
                          {/* Plan Header */}
                          <div className="flex items-start justify-between p-4 pb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-foreground truncate">{plan.name}</h3>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${plan.type === 'free'
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                    : plan.type === 'premium'
                                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                      : plan.type === 'educational'
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        : 'bg-secondary text-muted-foreground border-border'
                                  }`}>
                                  {getPortalMarker(plan.type)}
                                </span>
                                {plan.isDefault && (
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                                    <Check className="h-2.5 w-2.5" />
                                    Default
                                  </span>
                                )}
                              </div>
                              {plan.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                              )}
                            </div>

                            {/* Price */}
                            <div className="text-right shrink-0 ml-3">
                              <p className="text-lg font-bold text-foreground tabular-nums">
                                ${(plan.price ?? 0).toFixed(2)}
                              </p>
                              <p className="text-[10px] text-muted-foreground -mt-0.5">/month</p>
                            </div>
                          </div>

                          {/* Resources Grid */}
                          <div className="px-4 pb-3">
                            <div className="grid grid-cols-3 gap-2">
                              {resources.map((res) => (
                                <div
                                  key={res.label}
                                  className="rounded-lg bg-secondary/30 border border-border/50 px-2.5 py-2 text-center"
                                >
                                  <p className="text-[10px] text-muted-foreground">{res.label}</p>
                                  <p className={`text-xs font-semibold mt-0.5 tabular-nums ${res.value === "∞" ? "text-muted-foreground" : "text-foreground"
                                    }`}>
                                    {res.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions Footer */}
                          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-secondary/10 rounded-b-xl">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                                disabled={isReapplying}
                                onClick={() => reapplyPlanLimits(plan.id)}
                              >
                                {isReapplying ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Reapply
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/10 gap-1"
                                disabled={isReapplying}
                                onClick={() => reapplyPlanLimits(plan.id, true)}
                              >
                                {isReapplying ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3" />
                                )}
                                Force
                              </Button>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => openEditPlan(plan)}
                                title="Edit plan"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deletePlan(plan)}
                                title="Delete plan"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
            {/* ═════════════════ ORDERS ══════════════════════════════════════ */}
            <TabsContent value="orders" className="mt-4">
              <div className="flex flex-col gap-4">

                {/* Header Bar */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Receipt className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Orders</p>
                          <p className="text-xs text-muted-foreground">
                            {ordersTotal ? `${ordersTotal} order${ordersTotal !== 1 ? "s" : ""}` : "Manage plans & resource packs"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={openIssueOrder}
                          className="bg-primary text-primary-foreground h-8 gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Issue Order</span>
                          <span className="sm:hidden">Issue</span>
                        </Button>
                        <button
                          onClick={() => fetchOrders(ordersPage, ordersQuery)}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 max-w-md">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            placeholder="Search by user ID or email…"
                            value={ordersQuery}
                            onChange={(e) => setOrdersQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && fetchOrders(1, ordersQuery)}
                            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                          />
                          {ordersQuery && (
                            <button
                              onClick={() => { setOrdersQuery(""); fetchOrders(1, ""); }}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                {ordersLoading ? (
                  <div className="rounded-xl border border-border bg-card px-4 py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading orders…</p>
                    </div>
                  </div>
                ) : adminOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Receipt className="h-6 w-6 text-emerald-400/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No orders yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Issue an order to assign a plan or resource pack to a user.
                      </p>
                    </div>
                    <Button size="sm" onClick={openIssueOrder} className="bg-primary text-primary-foreground gap-1.5 mt-1">
                      <Plus className="h-3.5 w-3.5" /> Issue Order
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="rounded-xl border border-border bg-card hidden md:block">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="px-4 py-3 text-left font-medium">Order</th>
                              <th className="px-4 py-3 text-left font-medium">User</th>
                              <th className="px-4 py-3 text-left font-medium">Amount</th>
                              <th className="px-4 py-3 text-left font-medium">Status</th>
                              <th className="px-4 py-3 text-left font-medium">Dates</th>
                              <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminOrders.map((order) => {
                              const statusConfig: Record<string, { class: string; dot: string }> = {
                                active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                                pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                                cancelled: { class: "border-muted-foreground/30 bg-secondary/50 text-muted-foreground", dot: "bg-muted-foreground" },
                                expired: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                              }
                              const sc = statusConfig[order.status] || statusConfig.pending

                              return (
                                <tr key={order.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                          {order.description || `Order #${order.id}`}
                                        </p>
                                        {order.planId && (
                                          <p className="text-xs text-muted-foreground">
                                            Plan #{privateMode ? "████" : order.planId}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                      #{privateMode ? "████" : order.userId}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm font-semibold text-foreground">
                                      ${(order.amount ?? 0).toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant="outline" className={`text-xs capitalize ${sc.class}`}>
                                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                                      {order.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                                      </div>
                                      {order.expiresAt && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <Clock className="h-3 w-3" />
                                          <span>Expires {new Date(order.expiresAt).toLocaleDateString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => openEditOrder(order)}
                                        title="Edit order"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      {order.status === "active" && (
                                        <button
                                          onClick={() => cancelOrder(order)}
                                          title="Cancel order"
                                          className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors"
                                        >
                                          <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => deleteOrder(order)}
                                        title="Delete order"
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {adminOrders.map((order) => {
                        const statusConfig: Record<string, { class: string; dot: string; borderTint: string }> = {
                          active: { class: "text-emerald-400", dot: "bg-emerald-400", borderTint: "border-emerald-500/20" },
                          pending: { class: "text-warning", dot: "bg-warning", borderTint: "border-warning/20" },
                          cancelled: { class: "text-muted-foreground", dot: "bg-muted-foreground", borderTint: "border-border" },
                          expired: { class: "text-destructive", dot: "bg-destructive", borderTint: "border-destructive/20" },
                        }
                        const sc = statusConfig[order.status] || statusConfig.pending

                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl border bg-card overflow-hidden ${order.status === "active" ? sc.borderTint : "border-border"
                              }`}
                          >
                            {/* Card Header */}
                            <div className="flex items-start gap-3 p-4 pb-3">
                              <div className="relative h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                <Receipt className="h-4 w-4 text-emerald-400" />
                                <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                      {order.description || `Order #${order.id}`}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      User #{privateMode ? "████" : order.userId}
                                      {order.planId && ` · Plan #${privateMode ? "████" : order.planId}`}
                                    </p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10 capitalize`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                    {order.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount</p>
                                <p className="text-sm font-bold text-foreground">${(order.amount ?? 0).toFixed(2)}</p>
                              </div>
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Created</p>
                                <p className="text-xs text-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div className="bg-card px-3 py-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Expires</p>
                                <p className="text-xs text-foreground">
                                  {order.expiresAt ? new Date(order.expiresAt).toLocaleDateString() : "—"}
                                </p>
                              </div>
                            </div>

                            {/* Notes (if present) */}
                            {order.notes && (
                              <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
                                <p className="text-[11px] text-muted-foreground italic line-clamp-2">{order.notes}</p>
                              </div>
                            )}

                            {/* Card Actions */}
                            <div className="flex items-center border-t border-border divide-x divide-border">
                              <button
                                onClick={() => openEditOrder(order)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                              {order.status === "active" && (
                                <button
                                  onClick={() => cancelOrder(order)}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Cancel</span>
                                </button>
                              )}
                              <button
                                onClick={() => deleteOrder(order)}
                                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Pagination */}
                {!ordersLoading && adminOrders.length > 0 && (
                  <div className="rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                      <p className="text-xs text-muted-foreground">
                        Page <span className="font-medium text-foreground">{ordersPage}</span>
                        {ordersTotal ? (
                          <> of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(ordersTotal / ORDERS_PER))}</span></>
                        ) : null}
                        {ordersTotal ? (
                          <span className="hidden sm:inline"> · {ordersTotal} total</span>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { if (ordersPage > 1) fetchOrders(ordersPage - 1, ordersQuery); }}
                          disabled={ordersPage <= 1}
                          className="h-8 px-3 text-xs"
                        >
                          <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                          <span className="hidden sm:inline ml-1">Previous</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!ordersTotal || ordersPage < Math.ceil((ordersTotal || 0) / ORDERS_PER))
                              fetchOrders(ordersPage + 1, ordersQuery);
                          }}
                          disabled={ordersTotal ? ordersPage >= Math.ceil(ordersTotal / ORDERS_PER) : adminOrders.length < ORDERS_PER}
                          className="h-8 px-3 text-xs"
                        >
                          <span className="hidden sm:inline mr-1">Next</span>
                          <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* ═════════════════ PANEL SETTINGS ══════════════════════════════ */}
            <TabsContent value="settings" className="mt-4">
              <div className="flex flex-col gap-6 max-w-3xl">

                {/* Section Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Panel Settings</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Configure registration, services, and access restrictions.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {settingsSaved && (
                      <div className="flex items-center gap-1.5 text-xs text-green-400 animate-in fade-in slide-in-from-right-2">
                        <Check className="h-3.5 w-3.5" />
                        <span>Saved</span>
                      </div>
                    )}
                    <Button
                      disabled={settingsSaving}
                      onClick={async () => {
                        setSettingsSaving(true)
                        setSettingsSaved(false)
                        try {
                          const data = await apiFetch(API_ENDPOINTS.adminSettings, {
                            method: "PUT",
                            body: JSON.stringify(panelSettings),
                          })
                          if (data?.settings) setPanelSettings(data.settings)
                          setSettingsSaved(true)
                          setTimeout(() => setSettingsSaved(false), 3000)
                          setGeoBlockMetricsLoading(true)
                          try {
                            const m = await apiFetch("/api/admin/geo-block/metrics")
                            setGeoBlockMetrics(m)
                          } catch {
                            // ignore
                          } finally {
                            setGeoBlockMetricsLoading(false)
                          }
                        } catch (e: any) {
                          alert(e.message || "Failed to save settings")
                        } finally {
                          setSettingsSaving(false)
                        }
                      }}
                      className="bg-primary text-primary-foreground"
                      size="sm"
                    >
                      {settingsSaving ? (
                        <>
                          <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          Save Settings
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Quick Toggles Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Registration Toggle */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-lg p-2 ${panelSettings.registrationEnabled ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          <UserPlus className={`h-4 w-4 ${panelSettings.registrationEnabled ? "text-green-400" : "text-red-400"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Registration</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {panelSettings.registrationEnabled ? "New users can sign up" : "Sign-ups are blocked (HTTP 503)"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPanelSettings((s) => ({ ...s, registrationEnabled: !s.registrationEnabled }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${panelSettings.registrationEnabled ? "bg-green-500" : "bg-secondary"}`}
                        role="switch"
                        aria-checked={panelSettings.registrationEnabled}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${panelSettings.registrationEnabled ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Code Instances Toggle */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-lg p-2 ${panelSettings.codeInstancesEnabled ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          <FileCode className={`h-4 w-4 ${panelSettings.codeInstancesEnabled ? "text-green-400" : "text-red-400"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Code Instances</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {panelSettings.codeInstancesEnabled ? "Users can create instances" : "Creation blocked for non-admins"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPanelSettings((s) => ({ ...s, codeInstancesEnabled: !s.codeInstancesEnabled }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${panelSettings.codeInstancesEnabled ? "bg-green-500" : "bg-secondary"}`}
                        role="switch"
                        aria-checked={panelSettings.codeInstancesEnabled}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${panelSettings.codeInstancesEnabled ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Registration Notice */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      {panelSettings.registrationEnabled ? "Registration Notice" : "Registration Disabled Message"}
                    </p>
                    {!panelSettings.registrationEnabled && (
                      <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        Required
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    <textarea
                      rows={2}
                      value={panelSettings.registrationNotice}
                      onChange={(e) => setPanelSettings((s) => ({ ...s, registrationNotice: e.target.value }))}
                      placeholder={panelSettings.registrationEnabled
                        ? "e.g. This is a development build. Data may be reset."
                        : "e.g. Registration is temporarily closed for maintenance."}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {panelSettings.registrationEnabled
                        ? "Optional info banner shown on the login/register page."
                        : "Shown to users who try to access the registration page."}
                    </p>

                    {/* Preview */}
                    {(panelSettings.registrationNotice || !panelSettings.registrationEnabled) && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Live Preview</p>
                        {!panelSettings.registrationEnabled ? (
                          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                            <div>
                              <p className="text-sm font-semibold text-yellow-300">Registration is currently unavailable</p>
                              {panelSettings.registrationNotice && (
                                <p className="mt-1 text-sm text-yellow-200/80">{panelSettings.registrationNotice}</p>
                              )}
                            </div>
                          </div>
                        ) : panelSettings.registrationNotice ? (
                          <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                            <p className="text-sm text-blue-300">{panelSettings.registrationNotice}</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {/* Geo-Block Card — Redesigned */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium text-foreground">Geo-Block Rules</p>
                    </div>
                    {(() => {
                      const entries = panelSettings.geoBlockCountries
                        ? panelSettings.geoBlockCountries.split(",").map((s: string) => s.trim()).filter(Boolean)
                        : []
                      return entries.length > 0 ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                          {entries.length} {entries.length === 1 ? "rule" : "rules"} active
                        </span>
                      ) : null
                    })()}
                  </div>
                  <div className="flex flex-col gap-0 divide-y divide-border">
                    {(() => {
                      const [newCountry, setNewCountry] = React.useState("")
                      const [newLevel, setNewLevel] = React.useState("2")
                      const [searchFilter, setSearchFilter] = React.useState("")

                      const levelConfig: Record<string, { label: string; shortLabel: string; color: string; bgColor: string; borderColor: string; description: string }> = {
                        "1": { label: "ID Block", shortLabel: "ID", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20", description: "Blocks identity verification" },
                        "2": { label: "Free Block", shortLabel: "Free", color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/20", description: "Blocks free tier services" },
                        "3": { label: "Edu + Free Block", shortLabel: "Edu+Free", color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20", description: "Blocks educational and free tiers" },
                        "4": { label: "All Services (subuser)", shortLabel: "All Svc", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20", description: "Blocks all services except subuser access" },
                        "5": { label: "Registration Block", shortLabel: "Reg Block", color: "text-red-500", bgColor: "bg-red-500/15", borderColor: "border-red-500/30", description: "Completely blocks registration from this country" },
                      }

                      const entries: { country: string; level: string }[] = panelSettings.geoBlockCountries
                        ? panelSettings.geoBlockCountries
                          .split(",")
                          .map((s: string) => s.trim())
                          .filter(Boolean)
                          .map((s: string) => {
                            const [country, level] = s.split(":")
                            return { country: country?.toUpperCase() || "", level: level || "0" }
                          })
                          .filter((e: { country: string }) => e.country.length === 2)
                        : []

                      const filteredEntries = searchFilter
                        ? entries.filter((e) => e.country.includes(searchFilter.toUpperCase()))
                        : entries

                      const updateEntries = (newEntries: { country: string; level: string }[]) => {
                        const str = newEntries.map((e) => `${e.country.toLowerCase()}:${e.level}`).join(",")
                        setPanelSettings((s) => ({ ...s, geoBlockCountries: str }))
                      }

                      const addEntry = () => {
                        const code = newCountry.trim().toUpperCase()
                        if (code.length !== 2) return
                        if (entries.some((e) => e.country === code)) {
                          updateEntries(entries.map((e) => (e.country === code ? { ...e, level: newLevel } : e)))
                        } else {
                          updateEntries([...entries, { country: code, level: newLevel }])
                        }
                        setNewCountry("")
                      }

                      const removeEntry = (country: string) => {
                        updateEntries(entries.filter((e) => e.country !== country))
                      }

                      const updateLevel = (country: string, level: string) => {
                        updateEntries(entries.map((e) => (e.country === country ? { ...e, level } : e)))
                      }

                      return (
                        <>
                          {/* Level Reference — Horizontal pills */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">Restriction Levels</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(levelConfig).map(([lvl, config]) => (
                                <div
                                  key={lvl}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${config.bgColor} ${config.borderColor} ${config.color}`}
                                  title={config.description}
                                >
                                  <span className="font-mono font-bold">{lvl}</span>
                                  <span className="opacity-80">{config.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Add Country — Compact inline form */}
                          <div className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-shrink-0">
                                <input
                                  type="text"
                                  maxLength={2}
                                  value={newCountry}
                                  onChange={(e) => setNewCountry(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                                  onKeyDown={(e) => e.key === "Enter" && addEntry()}
                                  placeholder="CC"
                                  className="w-16 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 uppercase font-mono text-center transition-colors"
                                />
                              </div>
                              <select
                                value={newLevel}
                                onChange={(e) => setNewLevel(e.target.value)}
                                className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-colors"
                              >
                                {Object.entries(levelConfig).map(([lvl, config]) => (
                                  <option key={lvl} value={lvl}>
                                    Level {lvl} — {config.label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                disabled={newCountry.trim().length !== 2}
                                onClick={addEntry}
                                className="bg-primary text-primary-foreground shrink-0 gap-1"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add
                              </Button>
                            </div>
                            {newCountry.length === 2 && entries.some((e) => e.country === newCountry.toUpperCase()) && (
                              <p className="text-[11px] text-yellow-400 mt-1.5 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                This will update the existing rule for {newCountry.toUpperCase()}
                              </p>
                            )}
                          </div>

                          {/* Rules List */}
                          <div className="px-4 py-3">
                            {entries.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {/* Search/filter when many rules */}
                                {entries.length > 5 && (
                                  <div className="relative mb-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <input
                                      type="text"
                                      value={searchFilter}
                                      onChange={(e) => setSearchFilter(e.target.value.replace(/[^a-zA-Z]/g, ""))}
                                      placeholder="Filter countries…"
                                      className="w-full rounded-lg border border-border bg-secondary/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                                    />
                                  </div>
                                )}

                                {/* Rules grid */}
                                <div className="rounded-lg border border-border overflow-hidden">
                                  <div className="max-h-64 overflow-y-auto">
                                    {filteredEntries.length === 0 ? (
                                      <div className="py-4 text-center text-xs text-muted-foreground">
                                        No matching countries
                                      </div>
                                    ) : (
                                      <div className="divide-y divide-border">
                                        {filteredEntries
                                          .sort((a, b) => a.country.localeCompare(b.country))
                                          .map((entry) => {
                                            const config = levelConfig[entry.level] || levelConfig["1"]
                                            return (
                                              <div
                                                key={entry.country}
                                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors group"
                                              >
                                                {/* Country code with flag-like styling */}
                                                <div className="flex items-center justify-center w-10 h-8 rounded-md bg-secondary/60 border border-border">
                                                  <span className="text-sm font-mono font-bold text-foreground tracking-wide">
                                                    {entry.country}
                                                  </span>
                                                </div>

                                                {/* Level badge */}
                                                <div className="flex-1 min-w-0">
                                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${config.bgColor} ${config.borderColor} ${config.color}`}>
                                                    <span className="font-mono">{entry.level}</span>
                                                    <span className="hidden sm:inline">{config.shortLabel}</span>
                                                  </span>
                                                </div>

                                                {/* Level selector */}
                                                <select
                                                  value={entry.level}
                                                  onChange={(e) => updateLevel(entry.country, e.target.value)}
                                                  className="rounded-md border border-border bg-secondary/50 text-xs text-foreground outline-none cursor-pointer hover:border-primary/40 focus:border-primary/50 px-2 py-1 transition-colors"
                                                >
                                                  {Object.entries(levelConfig).map(([lvl, c]) => (
                                                    <option key={lvl} value={lvl}>
                                                      {lvl} — {c.label}
                                                    </option>
                                                  ))}
                                                </select>

                                                {/* Remove button */}
                                                <button
                                                  onClick={() => removeEntry(entry.country)}
                                                  className="p-1.5 rounded-md opacity-40 hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                                  title={`Remove ${entry.country}`}
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            )
                                          })}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Summary footer */}
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                                  <span>{entries.length} {entries.length === 1 ? "country" : "countries"} blocked</span>
                                  {entries.length > 0 && (
                                    <button
                                      onClick={() => {
                                        if (confirm(`Remove all ${entries.length} geo-block rules?`)) {
                                          setPanelSettings((s) => ({ ...s, geoBlockCountries: "" }))
                                        }
                                      }}
                                      className="text-destructive/60 hover:text-destructive transition-colors"
                                    >
                                      Clear all
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 gap-2">
                                <Globe className="h-8 w-8 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No geo-block rules</p>
                                <p className="text-xs text-muted-foreground/60">Add a country code above to get started</p>
                              </div>
                            )}
                          </div>

                          {/* Raw value */}
                          <details className="group">
                            <summary className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground hover:bg-secondary/20 transition-colors select-none">
                              <Code className="h-3 w-3" />
                              Raw value
                              <ChevronDown className="h-3 w-3 ml-auto transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="px-4 pb-3">
                              <textarea
                                rows={2}
                                value={panelSettings.geoBlockCountries}
                                onChange={(e) => setPanelSettings((s) => ({ ...s, geoBlockCountries: e.target.value }))}
                                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none transition-colors"
                                placeholder="de:2,fr:3,ru:5"
                              />
                            </div>
                          </details>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Geo-Block Metrics — Standalone card */}
                <div className="rounded-xl border border-border bg-card">
                  <button
                    onClick={() => {
                      const el = document.getElementById("geo-metrics-content")
                      if (el) el.classList.toggle("hidden")
                      const chevron = document.getElementById("geo-metrics-chevron")
                      if (chevron) chevron.classList.toggle("rotate-180")
                    }}
                    className="flex items-center justify-between gap-2 w-full px-4 py-3 hover:bg-secondary/20 transition-colors rounded-t-xl"
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Geo-Block Impact & Metrics</span>
                    </div>
                    <ChevronDown id="geo-metrics-chevron" className="h-4 w-4 text-muted-foreground transition-transform" />
                  </button>
                  <div id="geo-metrics-content" className="hidden border-t border-border">
                    <div className="p-4">
                      {geoBlockMetricsLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8">
                          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Loading metrics…</p>
                        </div>
                      ) : geoBlockMetricsError ? (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <p className="text-sm text-destructive">{geoBlockMetricsError}</p>
                        </div>
                      ) : geoBlockMetrics ? (
                        <div className="flex flex-col gap-5">
                          {/* Stats grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                              { label: "Total Users", value: geoBlockMetrics.totalUsers, icon: Users, color: "text-foreground", iconColor: "text-primary" },
                              { label: "Reg. Blocked", sublabel: "Level ≥ 5", value: geoBlockMetrics.blocked.registration, color: "text-red-400", iconColor: "text-red-400" },
                              { label: "ID Blocked", sublabel: "Level ≥ 1", value: geoBlockMetrics.blocked.idVerification, color: "text-blue-400", iconColor: "text-blue-400" },
                              { label: "Free Blocked", sublabel: "Level ≥ 2", value: geoBlockMetrics.blocked.free, color: "text-yellow-400", iconColor: "text-yellow-400" },
                              { label: "Edu Blocked", sublabel: "Level ≥ 3", value: geoBlockMetrics.blocked.educational, color: "text-orange-400", iconColor: "text-orange-400" },
                              { label: "Subuser Only", sublabel: "Level 4", value: geoBlockMetrics.blocked.subuserOnly, color: "text-red-400", iconColor: "text-red-400" },
                            ].map((stat, i) => (
                              <div key={i} className="rounded-lg border border-border bg-secondary/20 px-3 py-3 hover:bg-secondary/30 transition-colors">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
                                  {stat.sublabel && (
                                    <span className="text-[9px] text-muted-foreground/60 font-mono">{stat.sublabel}</span>
                                  )}
                                </div>
                                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
                                  {stat.value ?? "—"}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Per-country breakdown */}
                          {geoBlockMetrics.byCountry && Object.keys(geoBlockMetrics.byCountry).length > 0 && (
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Users by Country</p>
                              <div className="rounded-lg border border-border overflow-hidden">
                                <div className="grid grid-cols-[56px_1fr_60px] gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Code</p>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Users</p>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase text-right">Level</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                                  {Object.entries(geoBlockMetrics.byCountry)
                                    .sort(([, a]: any, [, b]: any) => (b.users || 0) - (a.users || 0))
                                    .map(([country, stats]: any) => (
                                      <div key={country} className="grid grid-cols-[56px_1fr_60px] gap-2 items-center px-3 py-2 hover:bg-secondary/20 transition-colors">
                                        <div className="flex items-center justify-center w-9 h-6 rounded bg-secondary/60 border border-border">
                                          <span className="text-xs font-mono font-bold text-foreground">{country.toUpperCase()}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-foreground tabular-nums">{stats.users}</span>
                                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[140px]">
                                            <div
                                              className="h-full bg-primary/70 rounded-full transition-all"
                                              style={{ width: `${Math.min(100, (stats.users / geoBlockMetrics.totalUsers) * 100)}%` }}
                                            />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground tabular-nums">
                                            {((stats.users / geoBlockMetrics.totalUsers) * 100).toFixed(1)}%
                                          </span>
                                        </div>
                                        <span className="text-xs font-mono text-muted-foreground text-right">
                                          {stats.minLevel === stats.maxLevel ? stats.minLevel : `${stats.minLevel}–${stats.maxLevel}`}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">Save settings to generate impact metrics</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sticky save bar for mobile */}
                <div className="sm:hidden sticky bottom-4 z-10">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-lg">
                    {settingsSaved && (
                      <div className="flex items-center gap-1.5 text-xs text-green-400">
                        <Check className="h-3.5 w-3.5" />
                        <span>Saved</span>
                      </div>
                    )}
                    <div className="flex-1" />
                    <Button
                      disabled={settingsSaving}
                      onClick={async () => {
                        setSettingsSaving(true)
                        setSettingsSaved(false)
                        try {
                          const data = await apiFetch(API_ENDPOINTS.adminSettings, {
                            method: "PUT",
                            body: JSON.stringify(panelSettings),
                          })
                          if (data?.settings) setPanelSettings(data.settings)
                          setSettingsSaved(true)
                          setTimeout(() => setSettingsSaved(false), 3000)
                          setGeoBlockMetricsLoading(true)
                          try {
                            const m = await apiFetch("/api/admin/geo-block/metrics")
                            setGeoBlockMetrics(m)
                          } catch {
                            // ignore
                          } finally {
                            setGeoBlockMetricsLoading(false)
                          }
                        } catch (e: any) {
                          alert(e.message || "Failed to save settings")
                        } finally {
                          setSettingsSaving(false)
                        }
                      }}
                      className="bg-primary text-primary-foreground"
                      size="sm"
                    >
                      {settingsSaving ? (
                        <>
                          <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
            {/* ═════════════════ DATABASE HOSTS ══════════════════════════════ */}
            <TabsContent value="databases" className="mt-4">
              <DatabaseHostsPanel privateMode={privateMode} />
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Egg / Template</label>
                <div>
                  <Select value={esEggId ?? "none"} onValueChange={(v) => setEsEggId(v === "none" ? undefined : v)}>
                    <SelectTrigger className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full">
                      <SelectValue placeholder="— No template —" />
                    </SelectTrigger>
                    <SelectContent>
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

      {/* ═══════ Reply Ticket Dialog ════════════════════════════════════════════ */}
      <Dialog open={!!replyTicket} onOpenChange={(open) => !open && setReplyTicket(null)}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Reply — #{replyTicket?.id}: {replyTicket?.subject}
            </DialogTitle>
          </DialogHeader>
          {replyTicket && (
            <div className="flex flex-col gap-4 py-2">
              <div className="rounded-lg border border-border bg-secondary/30 p-3 max-h-64 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">Conversation</p>
                {Array.isArray(replyTicket.messages) && replyTicket.messages.length ? (
                  replyTicket.messages.map((m: any, idx: number) => (
                    <div key={idx} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{m.sender === 'staff' ? 'Support Team' : (replyTicket.user ? `${replyTicket.user.firstName} ${replyTicket.user.lastName}` : `User #${replyTicket.userId}`)}</span>
                        <span className="text-xs text-muted-foreground">{m.created ? new Date(m.created).toLocaleString() : ''}</span>
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap">{m.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-foreground whitespace-pre-wrap">{replyTicket.message || replyTicket.adminReply || 'No messages'}</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Reply</label>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
                  placeholder="Type your reply…" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reply As</label>
                  <select value={replyAs} onChange={(e) => setReplyAs(e.target.value as any)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="staff">Staff</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</label>
                  <select value={replyPriority} onChange={(e) => setReplyPriority(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</label>
                  <input value={replyDepartment} onChange={(e) => setReplyDepartment(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Staff</label>
                  <SearchableUserSelect
                    value={replyAssignedTo}
                    onChange={(v) => setReplyAssignedTo(v)}
                    placeholder="Search staff by name, email or id"
                    initialList={staffUsers}
                    filter={(u) => ['admin', 'rootAdmin', '*'].includes(u.role || '')}
                    disabled={staffLoading}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Set Status</label>
                <div className="flex gap-2">
                  {['opened', 'awaiting_staff_reply', 'replied', 'closed'].map((s) => (
                    <button key={s} onClick={() => setReplyStatus(s)}
                      className={`rounded-md px-3 py-1.5 text-xs transition-colors border ${replyStatus === s
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"}`}>
                      {s.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTicket(null)} className="border-border">Cancel</Button>
            <Button onClick={submitReply} disabled={replyLoading || !replyText.trim()} className="bg-primary text-primary-foreground">
              {replyLoading ? "Sending…" : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit Organisation Dialog ═══════════════════════════════════════ */}
      <Dialog open={!!editOrgDialog} onOpenChange={(open) => !open && setEditOrgDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Edit Organisation — {editOrgDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <input value={editOrgName} onChange={(e) => setEditOrgName(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Handle</label>
              <input value={editOrgHandle} onChange={(e) => setEditOrgHandle(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tier</label>
                <select value={editOrgTier} onChange={(e) => setEditOrgTier(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner User ID</label>
                <input type="number" value={editOrgOwnerId} onChange={(e) => setEditOrgOwnerId(e.target.value)}
                  placeholder="User ID"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staff Organisation</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={editOrgIsStaff} onChange={(e) => setEditOrgIsStaff(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm text-foreground">This organisation is the admin staff org</span>
              </div>
            </div>

            {/* Add Member */}
            <div className="rounded-lg border border-border bg-secondary/10 p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Member by User ID</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="User ID"
                  value={editOrgAddMemberId}
                  onChange={(e) => setEditOrgAddMemberId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                />
                <select
                  value={editOrgAddMemberRole}
                  onChange={(e) => setEditOrgAddMemberRole(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
                <Button
                  size="sm"
                  disabled={!editOrgAddMemberId.trim() || editOrgMemberLoading || !editOrgDialog}
                  onClick={async () => {
                    if (!editOrgDialog || !editOrgAddMemberId.trim()) return
                    setEditOrgMemberLoading(true)
                    try {
                      await apiFetch(`${API_ENDPOINTS.adminOrgMembers.replace(":id", String(editOrgDialog.id))}`, {
                        method: "POST",
                        body: JSON.stringify({ userId: Number(editOrgAddMemberId), orgRole: editOrgAddMemberRole }),
                      })
                      setEditOrgAddMemberId("")
                    } catch (e: any) {
                      alert("Failed: " + e.message)
                    } finally {
                      setEditOrgMemberLoading(false)
                    }
                  }}
                  className="bg-primary text-primary-foreground px-3 text-xs h-9 shrink-0"
                >
                  {editOrgMemberLoading ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrgDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditOrg} disabled={editOrgLoading} className="bg-primary text-primary-foreground">
              {editOrgLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Add Node Dialog ════════════════════════════════════════════════ */}
      <Dialog open={addNodeOpen} onOpenChange={(open) => { if (!open) setAddNodeOpen(false) }}>
        <DialogContent className="border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              {addNodeStep === "config" ? "Wings Configuration" : "Add Node"}
            </DialogTitle>
          </DialogHeader>

          {addNodeStep === "form" && (
            <div className="flex flex-col gap-3 py-1">
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node Name</label>
                  <input value={addNodeName} onChange={(e) => setAddNodeName(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    placeholder="EU-1" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node Type</label>
                  <select value={addNodeType} onChange={(e) => setAddNodeType(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="free_and_paid">Free + Paid</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              {/* FQDN + SSL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">FQDN (domain or IP)</label>
                <input value={addNodeFqdn} onChange={(e) => setAddNodeFqdn(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder="wings.example.com" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wings Port</label>
                  <input value={addNodePort} onChange={(e) => setAddNodePort(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="8080" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SFTP Port</label>
                  <input value={addNodeSftpPort} onChange={(e) => setAddNodeSftpPort(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="2022" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SSL</label>
                  <div className="flex gap-2 h-9 items-center">
                    {["https", "http"].map((s) => (
                      <button key={s} type="button"
                        onClick={() => setAddNodeSsl(s === "https")}
                        className={`rounded-md px-3 py-1.5 text-xs border transition-colors ${(s === "https") === addNodeSsl
                          ? "border-primary/50 bg-primary/20 text-primary"
                          : "border-border bg-secondary/50 text-muted-foreground"
                          }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data directory */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wings Data Directory</label>
                <input value={addNodeDataPath} onChange={(e) => setAddNodeDataPath(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
              </div>

              {/* Token */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auth Token</label>
                <div className="flex gap-2">
                  <input value={addNodeToken} onChange={(e) => setAddNodeToken(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="Click Generate or paste your own" />
                  <Button type="button" size="sm" variant="outline" onClick={generateAddNodeToken}
                    disabled={addNodeTokenLoading} className="border-border shrink-0 h-9 px-3 text-xs">
                    {addNodeTokenLoading ? "…" : "Generate"}
                  </Button>
                </div>
                {addNodeToken && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5">
                    <span className="flex-1 font-mono text-xs text-green-400 break-all truncate">{addNodeToken}</span>
                    <button onClick={() => navigator.clipboard.writeText(addNodeToken)} className="text-green-400 hover:text-green-300 shrink-0">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {addNodeStep === "config" && (
            <div className="flex flex-col gap-3 py-1">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-xs text-green-400">
                ✓ Node <strong>{addNodeCreated?.name}</strong> registered. Copy the config below to{" "}
                <code className="font-mono">/etc/eclipanel/config.yml</code> on your Wings server.
              </div>
              <div className="relative">
                <pre className="rounded-lg border border-border bg-black/40 p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed">
                  {buildWingsConfig()}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(buildWingsConfig())}
                  className="absolute top-2 right-2 rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                After saving the config, restart Wings with{" "}
                <code className="font-mono text-foreground">systemctl restart wings</code>.
              </p>
            </div>
          )}

          <DialogFooter>
            {addNodeStep === "form" ? (
              <>
                <Button variant="outline" onClick={() => setAddNodeOpen(false)} className="border-border">Cancel</Button>
                <Button
                  onClick={submitAddNode}
                  disabled={addNodeLoading || !addNodeName.trim() || !addNodeFqdn.trim() || !addNodeToken.trim()}
                  className="bg-primary text-primary-foreground"
                >
                  {addNodeLoading ? "Creating…" : !addNodeToken ? "Generate Token First" : "Create Node"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setAddNodeOpen(false)} className="bg-primary text-primary-foreground">
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit Node Dialog ════════════════════════════════════════════ */}
      <Dialog open={!!editNodeDialog} onOpenChange={(open) => !open && setEditNodeDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Edit Node — {editNodeDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node Type</label>
              <select value={editNodeType} onChange={(e) => setEditNodeType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="free_and_paid">Free + Paid</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Port Range Start</label>
                <input type="number" placeholder="e.g. 25500" value={editNodePortStart}
                  onChange={(e) => setEditNodePortStart(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Port Range End</label>
                <input type="number" placeholder="e.g. 25600" value={editNodePortEnd}
                  onChange={(e) => setEditNodePortEnd(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Bind IP (optional)</label>
              <input type="text" placeholder="0.0.0.0" value={editNodeDefaultIp}
                onChange={(e) => setEditNodeDefaultIp(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              <p className="text-xs text-muted-foreground">IP used for auto-allocated ports. Leave blank for 0.0.0.0.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNodeDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditNode} disabled={editNodeLoading} className="bg-primary text-primary-foreground">
              {editNodeLoading ? "Saving…" : "Save"}
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

      {/* ═══════ Issue Order Dialog ═════════════════════════════════════════════ */}
      <Dialog open={issueOrderOpen} onOpenChange={(open) => !open && setIssueOrderOpen(false)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Issue Order</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User ID *</label>
              <input type="number" placeholder="User ID" value={ioUserId} onChange={(e) => setIoUserId(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <input placeholder="e.g. Monthly hosting plan" value={ioDesc} onChange={(e) => setIoDesc(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan (optional)</label>
                <select value={ioPlanId} onChange={(e) => setIoPlanId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">— none —</option>
                  {plans.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount ($)</label>
                <input type="number" min="0" step="0.01" value={ioAmount} onChange={(e) => setIoAmount(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At (optional)</label>
              <input type="date" value={ioExpiresAt} onChange={(e) => setIoExpiresAt(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <input placeholder="Internal notes" value={ioNotes} onChange={(e) => setIoNotes(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            {ioError && <p className="text-xs text-destructive">{ioError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOrderOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitIssueOrder} disabled={ioLoading} className="bg-primary text-primary-foreground">
              {ioLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Issuing…</> : "Issue Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Apply Plan to User Dialog ══════════════════════════════════════ */}
      <Dialog open={applyPlanOpen} onOpenChange={(open) => !open && setApplyPlanOpen(false)}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Apply Plan to User #{applyPlanUserId}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan *</label>
              <select value={applyPlanId} onChange={(e) => setApplyPlanId(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="">— select a plan —</option>
                {plans.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.type})</option>)}
              </select>
              {applyPlanId && (() => {
                const p = plans.find(x => x.id === Number(applyPlanId))
                if (!p) return null
                return <p className="text-xs text-muted-foreground">{p.description} · {p.memory ? `${p.memory} MB RAM` : "∞"} · {p.disk ? `${(p.disk / 1024).toFixed(0)} GB` : "∞"} · {p.cpu ? `${p.cpu}% CPU` : "∞"} · {p.serverLimit ?? "∞"} servers</p>
              })()}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At (optional)</label>
              <input type="date" value={applyPlanExpiry} onChange={(e) => setApplyPlanExpiry(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            {/* Show org assignment for enterprise-tier plans */}
            {(() => {
              const selectedPlan = plans.find(x => x.id === Number(applyPlanId))
              if (!selectedPlan || selectedPlan.type !== 'enterprise') return null
              return (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assign to Organisation ID (optional)</label>
                  <input type="number" min="1" placeholder="Leave blank for user-only" value={applyPlanOrgId} onChange={(e) => setApplyPlanOrgId(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                  <p className="text-xs text-muted-foreground">If set, the organisation's tier will also be upgraded to enterprise.</p>
                </div>
              )
            })()}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (internal)</label>
              <input placeholder="e.g. Trial period" value={applyPlanNotes} onChange={(e) => setApplyPlanNotes(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            {applyPlanError && <p className="text-xs text-destructive">{applyPlanError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyPlanOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitApplyPlan} disabled={applyPlanLoading} className="bg-primary text-primary-foreground">
              {applyPlanLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Applying…</> : "Apply Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit Order Dialog ═════════════════════════════════════════════ */}
      <Dialog open={editOrderOpen} onOpenChange={(open) => !open && setEditOrderOpen(false)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editOrderTarget ? `Edit Order #${editOrderTarget.id}` : 'Edit Order'}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">Modify order details or change status.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <input value={eoDescription} onChange={(e) => setEoDescription(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</label>
                <input type="number" value={eoAmount} onChange={(e) => setEoAmount(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan ID</label>
                <input value={eoPlanId} onChange={(e) => setEoPlanId(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <input value={eoNotes} onChange={(e) => setEoNotes(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At</label>
                <input type="date" value={eoExpiresAt?.split("T")?.[0] || eoExpiresAt} onChange={(e) => setEoExpiresAt(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                <input value={eoStatus} onChange={(e) => setEoStatus(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
              </div>
            </div>
            {eoError && <p className="text-xs text-destructive">{eoError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrderOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitEditOrder} disabled={eoLoading} className="bg-primary text-primary-foreground">
              {eoLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Assign AI Model to User Dialog ═════════════════════════════ */}
      <Dialog open={!!assignAiModel} onOpenChange={(open) => !open && setAssignAiModel(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Assign “{assignAiModel?.name}” to User
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select User</label>
              <SearchableUserSelect
                value={assignAiUserId}
                onChange={(v) => setAssignAiUserId(v)}
                placeholder="Type name, email or id to search"
                initialList={users}
              />
            </div>
            <p className="text-xs text-muted-foreground">Limits (optional — leave blank for unlimited)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token Limit</label>
                <input
                  type="number"
                  placeholder="e.g. 100000"
                  value={assignAiLimitTokens}
                  onChange={(e) => setAssignAiLimitTokens(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Request Limit</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={assignAiLimitRequests}
                  onChange={(e) => setAssignAiLimitRequests(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAiModel(null)} className="border-border">Cancel</Button>
            <Button
              onClick={submitAssignAiModel}
              disabled={assignAiLoading || !assignAiUserId}
              className="bg-primary text-primary-foreground"
            >
              {assignAiLoading ? "Assigning…" : "Assign Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ AI Model Create / Edit Dialog ══════════════════════════════════ */}
      <Dialog open={aiModelDialog !== null} onOpenChange={(open) => !open && setAiModelDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              {aiModelDialog === "new" ? "New AI Model" : `Edit Model — ${(aiModelDialog as AdminAIModel)?.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                <input value={aiModelName} onChange={(e) => setAiModelName(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder="gpt-4o" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                <select value={aiModelType} onChange={(e) => setAiModelType(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="text">Text</option>
                  <option value="code">Code</option>
                  <option value="vision">Vision</option>
                  <option value="image">Image</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                <select value={aiModelStatus} onChange={(e) => setAiModelStatus(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="active">Active</option>
                  <option value="beta">Beta</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Max Tokens</label>
                <input value={aiModelMaxTokens} onChange={(e) => setAiModelMaxTokens(e.target.value)} type="number"
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder="4096" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <input value={aiModelDescription} onChange={(e) => setAiModelDescription(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder="Optional description shown to users" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</label>
              <input value={aiModelTags} onChange={(e) => setAiModelTags(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder="comma-separated tags (e.g. demo, core)" />
              <p className="text-xs text-muted-foreground">Tags can be used to mark models for special purposes (e.g. <span className="font-semibold">demo</span>).</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoint URL</label>
              <input value={aiModelEndpoint} onChange={(e) => setAiModelEndpoint(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder="https://api.openai.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">API Key</label>
              <input value={aiModelApiKey} onChange={(e) => setAiModelApiKey(e.target.value)} type="password"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder="sk-..." />
            </div>
            <div className="mt-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fallback Endpoints</div>
              {aiModelExtraEndpoints.map((ep, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end mt-2">
                  <div className="col-span-4">
                    <input
                      value={ep.endpoint}
                      placeholder="https://api.groq.com"
                      onChange={(e) => {
                        const next = [...aiModelExtraEndpoints]
                        next[index] = { ...next[index], endpoint: e.target.value }
                        setAiModelExtraEndpoints(next)
                      }}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      value={ep.apiKey || ""}
                      placeholder="api key"
                      onChange={(e) => {
                        const next = [...aiModelExtraEndpoints]
                        next[index] = { ...next[index], apiKey: e.target.value }
                        setAiModelExtraEndpoints(next)
                      }}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      value={ep.id || ""}
                      placeholder="id (optional)"
                      onChange={(e) => {
                        const next = [...aiModelExtraEndpoints]
                        next[index] = { ...next[index], id: e.target.value }
                        setAiModelExtraEndpoints(next)
                      }}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => setAiModelExtraEndpoints(aiModelExtraEndpoints.filter((_, i) => i !== index))}
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                    >Remove</button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAiModelExtraEndpoints([...aiModelExtraEndpoints, { endpoint: "", apiKey: "" }])}
                className="mt-2 rounded-lg border border-border bg-secondary/60 px-3 py-1 text-xs"
              >Add an endpoint</button>
              <p className="text-xs text-muted-foreground mt-1">Fallback endpoints will be tried sequentially on failure/rate-limit.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiModelDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveAIModel} disabled={aiModelLoading || !aiModelName.trim()}
              className="bg-primary text-primary-foreground">
              {aiModelLoading ? "Saving…" : aiModelDialog === "new" ? "Create Model" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Import Egg Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={importEggOpen} onOpenChange={(open) => { if (!open) { setImportEggOpen(false); setImportEggPreview(null); setImportEggError("") } }}>
        <DialogContent className="border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Upload className="h-4 w-4" /> Import Pterodactyl Egg
            </DialogTitle>
          </DialogHeader>

          {importEggPreview ? (
            /* ── Success preview ── */
            <div className="flex flex-col gap-4 py-2">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex flex-col gap-2">
                <p className="text-sm font-medium text-green-400">Egg imported successfully!</p>
                <p className="text-sm text-foreground font-semibold">{importEggPreview.name}</p>
                {importEggPreview.description && <p className="text-xs text-muted-foreground">{importEggPreview.description}</p>}
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Image: <span className="font-mono text-foreground">{importEggPreview.dockerImage}</span></span>
                  <span>Env vars: <span className="text-foreground">{(importEggPreview.envVars ?? []).length}</span></span>
                  {importEggPreview.installScript && <span className="text-green-400">✓ Install script included</span>}
                  {importEggPreview.processConfig && <span className="text-green-400">✓ Process config included</span>}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setImportEggOpen(false); setImportEggPreview(null) }}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Import form ── */
            <div className="flex flex-col gap-4 py-2">
              {/* Mode tabs */}
              <div className="flex gap-1 rounded-lg border border-border p-1 bg-secondary/20">
                <button
                  onClick={() => setImportEggMode("paste")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${importEggMode === "paste" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Paste JSON
                </button>
                <button
                  onClick={() => setImportEggMode("url")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${importEggMode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Fetch from URL
                </button>
              </div>

              {importEggMode === "paste" ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Egg JSON (PTDL_v1 or PTDL_v2)</label>
                  <textarea
                    className="h-52 w-full rounded-md border border-border bg-secondary/30 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={'{\n  "meta": { "version": "PTDL_v2" },\n  "name": "My Egg",\n  ...\n}'}
                    value={importEggJson}
                    onChange={(e) => setImportEggJson(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the full exported egg JSON from Pterodactyl / Pelican.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Raw JSON URL</label>
                  <input
                    className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="https://raw.githubusercontent.com/pterodactyl/eggs/master/.../egg-paper.json"
                    value={importEggUrl}
                    onChange={(e) => setImportEggUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The panel will fetch this URL server-side. Use a raw GitHub URL for community eggs.
                  </p>
                </div>
              )}

              {importEggError && (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{importEggError}</p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportEggOpen(false)} className="border-border">Cancel</Button>
                <Button onClick={doImportEgg} disabled={importEggLoading} className="bg-primary text-primary-foreground">
                  {importEggLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Importing…</> : "Import Egg"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Egg Create / Edit Dialog ═══════════════════════════════════════ */}
      <Dialog open={eggDialog !== null} onOpenChange={(open) => !open && setEggDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {eggDialog === "new" ? "New Egg" : `Edit Egg — ${(eggDialog as AdminEgg)?.name}`}
            </DialogTitle>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex gap-1 rounded-lg border border-border p-1 bg-secondary/20 mt-1">
            {(["basic", "variables", "config", "advanced"] as const).map((t) => (
              <button key={t} onClick={() => setEggTab(t)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${eggTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "config" ? "Process Config" : t === "advanced" ? "Install Script" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 py-1">

            {/* ── Basic tab ── */}
            {eggTab === "basic" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                    <input value={eggName} onChange={(e) => setEggName(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      placeholder="Minecraft Java" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Author</label>
                    <input value={eggAuthor} onChange={(e) => setEggAuthor(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      placeholder="support@pterodactyl.io" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                  <input value={eggDesc} onChange={(e) => setEggDesc(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    placeholder="Optional description" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Primary Docker Image *</label>
                  <input value={eggImage} onChange={(e) => setEggImage(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="ghcr.io/pterodactyl/yolks:java_21" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Additional Docker Images <span className="normal-case text-muted-foreground/60">(JSON object, optional)</span>
                  </label>
                  <textarea value={eggDockerImagesRaw} onChange={(e) => setEggDockerImagesRaw(e.target.value)} rows={3}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/50 resize-none"
                    placeholder={'{\n  "Java 21": "ghcr.io/pterodactyl/yolks:java_21",\n  "Java 17": "ghcr.io/pterodactyl/yolks:java_17"\n}'} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startup Command *</label>
                  <input value={eggStartup} onChange={(e) => setEggStartup(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Features <span className="normal-case text-muted-foreground/60">(comma-separated)</span></label>
                    <input value={eggFeatures} onChange={(e) => setEggFeatures(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      placeholder="eula" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Update URL</label>
                    <input value={eggUpdateUrl} onChange={(e) => setEggUpdateUrl(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      placeholder="https://…" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File Denylist <span className="normal-case text-muted-foreground/60">(one per line)</span></label>
                  <textarea value={eggFileDenylist} onChange={(e) => setEggFileDenylist(e.target.value)} rows={2}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none"
                    placeholder="/.env" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={eggVisible} onChange={(e) => setEggVisible(e.target.checked)} className="accent-primary" />
                  <span className="text-sm text-foreground">Visible to users</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={eggRootless} onChange={(e) => setEggRootless(e.target.checked)} className="accent-primary" />
                  <span className="text-sm text-foreground">Launch in rootless mode</span>
                </label>
              </>
            )}

            {/* ── Variables tab ── */}
            {eggTab === "variables" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Enter one <code className="font-mono bg-secondary/50 px-1 rounded">ENV_VARIABLE</code> name per line.
                  Default values and metadata are preserved from imported eggs.
                </p>
                <textarea value={eggEnvVars} onChange={(e) => setEggEnvVars(e.target.value)} rows={12}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none"
                  placeholder={"SERVER_MEMORY\nSERVER_JARFILE\nMC_VERSION"} />
                {(eggDialog !== "new" && eggDialog) && (
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Current variable definitions</p>
                    {((eggDialog as AdminEgg).envVars ?? []).map((v: any, i: number) => (
                      <div key={i} className="flex gap-2">
                        <span className="font-mono text-foreground w-40 shrink-0">{v.env_variable ?? v.name ?? "?"}</span>
                        <span className="truncate">{v.description || "—"}</span>
                        <span className="ml-auto shrink-0 text-foreground/60">default: {String(v.default_value ?? v.defaultValue ?? "")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Process Config tab ── */}
            {eggTab === "config" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stop Command</label>
                  <input value={eggProcessStop} onChange={(e) => setEggProcessStop(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="stop" />
                  <p className="text-xs text-muted-foreground">Use <code className="font-mono bg-secondary/50 px-1 rounded">SIGKILL</code> or <code className="font-mono bg-secondary/50 px-1 rounded">SIGTERM</code> for signal-based stop, or any text command.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Startup Done Patterns <span className="normal-case text-muted-foreground/60">(one regex per line)</span>
                  </label>
                  <textarea value={eggProcessDone} onChange={(e) => setEggProcessDone(e.target.value)} rows={6}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none"
                    placeholder={"Done ("} />
                  <p className="text-xs text-muted-foreground">Wings watches stdout for these strings to mark the server as fully started.</p>
                </div>
              </div>
            )}

            {/* ── Install Script tab ── */}
            {eggTab === "advanced" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Container</label>
                    <input value={eggInstallContainer} onChange={(e) => setEggInstallContainer(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="ghcr.io/pterodactyl/installers:debian" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entrypoint</label>
                    <input value={eggInstallEntrypoint} onChange={(e) => setEggInstallEntrypoint(e.target.value)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="bash" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Script</label>
                  <textarea value={eggInstallScript} onChange={(e) => setEggInstallScript(e.target.value)} rows={14}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/50 resize-none"
                    placeholder={"#!/bin/bash\napt-get install -y curl\n# ...\n"} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Allowed Portals</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['free', 'paid', 'enterprise'].map((tier) => (
                      <label key={tier} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={eggAllowedPortals.includes(tier)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...eggAllowedPortals, tier]
                              : eggAllowedPortals.filter((p) => p !== tier)
                            setEggAllowedPortals(next)
                          }}
                          className="accent-primary"
                        />
                        <span>{portalMarkerByTier[tier] ?? tier}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">When empty, this egg is available to all portals.</p>
                </div>
              </div>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEggDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEgg} disabled={eggLoading || !eggName.trim() || !eggImage.trim() || !eggStartup.trim()}
              className="bg-primary text-primary-foreground">
              {eggLoading ? "Saving…" : eggDialog === "new" ? "Create Egg" : "Save Changes"}
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
      {/* ═══════ Node Heartbeat History Dialog ════════════════════════════════ */}
      <Dialog
        open={!!heartbeatDialogNode}
        onOpenChange={(open) => { if (!open) { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) } }}
      >
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              Heartbeat History — {heartbeatDialogNode?.name}
            </DialogTitle>
          </DialogHeader>
          {/* Window toggle */}
          <div className="flex gap-2">
            {(["24h", "7d"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setHeartbeatDialogWindow(w)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${heartbeatDialogWindow === w
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
                  }`}
              >
                {w === "24h" ? "Last 24 hours" : "Last 7 days"}
              </button>
            ))}
          </div>
          {heartbeatDialogLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : heartbeatDialogData ? (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                  <p className={`text-xl font-bold ${heartbeatDialogData.summary.uptime_pct >= 99 ? "text-green-400"
                    : heartbeatDialogData.summary.uptime_pct >= 95 ? "text-yellow-400"
                      : "text-red-400"
                    }`}>
                    {heartbeatDialogData.summary.uptime_pct}%
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Avg response</p>
                  <p className="text-xl font-bold text-foreground">
                    {heartbeatDialogData.summary.avg_ms != null ? `${heartbeatDialogData.summary.avg_ms}ms` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Checks</p>
                  <p className="text-xl font-bold text-foreground">{heartbeatDialogData.summary.total_checks}</p>
                </div>
              </div>
              {/* Full chart */}
              <div>
                <NodeSparkline data={heartbeatDialogData.points} compact={false} />
              </div>
              {/* Time range */}
              {heartbeatDialogData.points.length > 1 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  {new Date(heartbeatDialogData.points[0].timestamp).toLocaleString()} →{" "}
                  {new Date(heartbeatDialogData.points[heartbeatDialogData.points.length - 1].timestamp).toLocaleString()}
                </p>
              )}
              {/* Legend */}
              <div className="flex items-center gap-4 justify-center text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 rounded" style={{ background: '#22c55e' }} /> OK</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{ background: 'rgba(234,179,8,0.6)' }} /> Timeout</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{ background: 'rgba(239,68,68,0.6)' }} /> Error</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No heartbeat data for this window.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) }} className="border-border">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ Node Heartbeat History Dialog ════════════════════════════════ */}
      <Dialog
        open={!!heartbeatDialogNode}
        onOpenChange={(open) => { if (!open) { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) } }}
      >
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Heartbeat History — {heartbeatDialogNode?.name}
            </DialogTitle>
          </DialogHeader>
          {/* Window toggle */}
          <div className="flex gap-2">
            {(["24h", "7d"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setHeartbeatDialogWindow(w)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${heartbeatDialogWindow === w
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
                  }`}
              >
                {w === "24h" ? "Last 24 hours" : "Last 7 days"}
              </button>
            ))}
          </div>
          {heartbeatDialogLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : heartbeatDialogData ? (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                  <p className={`text-xl font-bold ${heartbeatDialogData.summary.uptime_pct >= 99 ? "text-green-400"
                    : heartbeatDialogData.summary.uptime_pct >= 95 ? "text-yellow-400"
                      : "text-red-400"
                    }`}>
                    {heartbeatDialogData.summary.uptime_pct}%
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Avg response</p>
                  <p className="text-xl font-bold text-foreground">
                    {heartbeatDialogData.summary.avg_ms != null ? `${heartbeatDialogData.summary.avg_ms}ms` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Checks</p>
                  <p className="text-xl font-bold text-foreground">{heartbeatDialogData.summary.total_checks}</p>
                </div>
              </div>
              {/* Full chart */}
              <div>
                <NodeSparkline data={heartbeatDialogData.points} compact={false} />
              </div>
              {/* Time range */}
              {heartbeatDialogData.points.length > 1 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  {new Date(heartbeatDialogData.points[0].timestamp).toLocaleString()} →{" "}
                  {new Date(heartbeatDialogData.points[heartbeatDialogData.points.length - 1].timestamp).toLocaleString()}
                </p>
              )}
              {/* Legend */}
              <div className="flex items-center gap-4 justify-center text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded" style={{ background: "#22c55e" }} /> OK</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: "rgba(234,179,8,0.5)" }} /> Timeout</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: "rgba(239,68,68,0.5)" }} /> Error</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No heartbeat data for this window.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) }} className="border-border">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ View Node Config Dialog ═══════════════════════════════════════ */}
      <Dialog open={!!viewConfigNode} onOpenChange={(open) => { if (!open) { setViewConfigNode(null); setViewConfigToken("") } }}>
        <DialogContent className="max-w-xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Wings Config — {viewConfigNode?.name}</DialogTitle>
          </DialogHeader>
          {viewConfigLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading token…
            </div>
          ) : viewConfigToken ? (
            <div className="flex flex-col gap-3 py-1">
              <p className="text-xs text-muted-foreground">
                Copy to <code className="font-mono text-foreground">/etc/eclipanel/config.yml</code> on the Wings server, then run{" "}
                <code className="font-mono text-foreground">systemctl restart wings</code>.
              </p>
              <div className="relative">
                <pre className="rounded-lg border border-border bg-black/40 p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed">
                  {buildNodeConfigYaml(viewConfigNode!, viewConfigToken)}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(buildNodeConfigYaml(viewConfigNode!, viewConfigToken))}
                  className="absolute top-2 right-2 rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive py-4">Failed to load token for this node.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewConfigNode(null); setViewConfigToken("") }} className="border-border">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ OAuth Create App Dialog ══════════════════════════════════════ */}
      <Dialog open={oauthCreateOpen} onOpenChange={setOauthCreateOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Register OAuth App</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">App Name *</label>
              <input
                value={oauthCreateName}
                onChange={(e) => setOauthCreateName(e.target.value)}
                placeholder="My Eclipse Service"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Description</label>
              <input
                value={oauthCreateDesc}
                onChange={(e) => setOauthCreateDesc(e.target.value)}
                placeholder="Optional description"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Redirect URIs</label>
              <div className="flex flex-col gap-2">
                {oauthCreateRedirects.map((uri, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={uri}
                      onChange={(e) => {
                        const next = [...oauthCreateRedirects]
                        next[idx] = e.target.value
                        setOauthCreateRedirects(next)
                      }}
                      placeholder="https://yourapp.example.com/callback"
                      className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                    />
                    {oauthCreateRedirects.length > 1 && (
                      <button onClick={() => setOauthCreateRedirects((p) => p.filter((_, i) => i !== idx))}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setOauthCreateRedirects((p) => [...p, ""])}
                  className="flex items-center gap-1 self-start rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                  <Plus className="h-3 w-3" /> Add URI
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Allowed Scopes</label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {["profile", "email", "orgs:read", "billing:read", "servers:read", "servers:write", "admin"].map((scope) => (
                  <label key={scope} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={oauthCreateScopes.includes(scope)}
                      onChange={(e) => setOauthCreateScopes((p) => e.target.checked ? [...p, scope] : p.filter((s) => s !== scope))}
                      className="accent-primary" />
                    <span className="text-xs font-mono text-foreground">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Grant Types</label>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {["authorization_code", "client_credentials", "refresh_token"].map((grant) => (
                  <label key={grant} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={oauthCreateGrants.includes(grant)}
                      onChange={(e) => setOauthCreateGrants((p) => e.target.checked ? [...p, grant] : p.filter((g) => g !== grant))}
                      className="accent-primary" />
                    <span className="text-xs font-mono text-foreground">{grant}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOauthCreateOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={submitCreateOAuthApp} disabled={oauthCreateLoading || !oauthCreateName.trim()} className="bg-primary text-primary-foreground">
              {oauthCreateLoading ? "Creating…" : "Create App"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ OAuth Secret Reveal Dialog ═══════════════════════════════════ */}
      <Dialog open={!!oauthNewSecret} onOpenChange={(open) => { if (!open) setOauthNewSecret(null) }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">App Created — Save Your Secret</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-300">
              This is the <strong>only time</strong> the client secret is shown. Copy it now — it cannot be retrieved later.
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">App Name</p>
                <p className="text-sm font-medium text-foreground">{oauthNewSecret?.name}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Client ID</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-black/40 px-3 py-2 text-xs font-mono text-foreground break-all">{oauthNewSecret?.clientId}</code>
                  <button onClick={() => navigator.clipboard.writeText(oauthNewSecret?.clientId || "")}
                    className="shrink-0 rounded border border-border bg-secondary/80 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Client Secret</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs font-mono text-yellow-200 break-all">{oauthNewSecret?.clientSecret}</code>
                  <button onClick={() => navigator.clipboard.writeText(oauthNewSecret?.clientSecret || "")}
                    className="shrink-0 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/20 transition-colors">Copy</button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOauthNewSecret(null)} className="bg-primary text-primary-foreground">I&apos;ve saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ OAuth Edit App Dialog ════════════════════════════════════════ */}
      <Dialog open={!!oauthEditApp} onOpenChange={(open) => { if (!open) setOauthEditApp(null) }}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit OAuth App — {oauthEditApp?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Redirect URIs</label>
              <div className="flex flex-col gap-2">
                {oauthEditRedirects.map((uri, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={uri}
                      onChange={(e) => {
                        const next = [...oauthEditRedirects]
                        next[idx] = e.target.value
                        setOauthEditRedirects(next)
                      }}
                      placeholder="https://yourapp.example.com/callback"
                      className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                    />
                    {oauthEditRedirects.length > 1 && (
                      <button onClick={() => setOauthEditRedirects((p) => p.filter((_, i) => i !== idx))}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setOauthEditRedirects((p) => [...p, ""])}
                  className="flex items-center gap-1 self-start rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                  <Plus className="h-3 w-3" /> Add URI
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Allowed Scopes</label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {["profile", "email", "orgs:read", "billing:read", "servers:read", "servers:write", "admin"].map((scope) => (
                  <label key={scope} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={oauthEditScopes.includes(scope)}
                      onChange={(e) => setOauthEditScopes((p) => e.target.checked ? [...p, scope] : p.filter((s) => s !== scope))}
                      className="accent-primary" />
                    <span className="text-xs font-mono text-foreground">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Grant Types</label>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {["authorization_code", "client_credentials", "refresh_token"].map((grant) => (
                  <label key={grant} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={oauthEditGrants.includes(grant)}
                      onChange={(e) => setOauthEditGrants((p) => e.target.checked ? [...p, grant] : p.filter((g) => g !== grant))}
                      className="accent-primary" />
                    <span className="text-xs font-mono text-foreground">{grant}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOauthEditApp(null)} className="border-border">Cancel</Button>
            <Button onClick={submitEditOAuthApp} disabled={oauthEditLoading} className="bg-primary text-primary-foreground">
              {oauthEditLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ OAuth Rotate Secret Confirmation ═════════════════════════════ */}
      <Dialog open={!!oauthRotateApp} onOpenChange={(open) => { if (!open) setOauthRotateApp(null) }}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rotate Client Secret?</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Rotating the secret for <strong className="text-foreground">{oauthRotateApp?.name}</strong> will
              immediately revoke all active tokens. Services using the current secret will stop working
              until updated with the new one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOauthRotateApp(null)} className="border-border">Cancel</Button>
            <Button onClick={confirmRotateOAuthSecret} disabled={oauthRotateLoading} className="bg-destructive text-destructive-foreground">
              {oauthRotateLoading ? "Rotating…" : "Rotate Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}