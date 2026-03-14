"use client"

import { useState, useEffect, useCallback } from "react"
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
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Users,
  HardDrive,
  Search,
  Ban,
  CheckCircle,
  XCircle,
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
  ExternalLink,
  ChevronRight,
  Zap,
  Database,
  Check,
  CreditCard,
} from "lucide-react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number
  totalNodes: number
  totalOrganisations: number
  totalServers: number
  pendingTickets: number
  pendingVerifications: number
  pendingDeletions: number
}

interface AdminUser {
  id: number
  firstName: string
  lastName: string
  email: string
  role?: string
  portalType: string
  emailVerified: boolean
  idVerified: boolean
  suspended: boolean
  passkeyCount: number
  createdAt?: string
}

interface AdminTicket {
  id: number
  userId: number
  subject: string
  message: string
  status: string
  priority: string
  adminReply: string | null
  created: string
  user?: { firstName: string; lastName: string; email: string }
}

interface AdminVerification {
  id: number
  userId: number
  status: string
  idDocumentUrl?: string
  selfieUrl?: string
  user?: { firstName: string; lastName: string; email: string }
}

interface AdminDeletion {
  id: number
  userId: number
  status: string
  requestedAt: string
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
  updateUrl?: string
  visible: boolean
}

interface AdminAIModel {
  id: number
  name: string
  endpoint?: string
  apiKey?: string
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
  owner?: { firstName: string; lastName: string; email: string }
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
  open: "border-primary/30 bg-primary/10 text-primary",
  pending: "border-warning/30 bg-warning/10 text-warning",
  closed: "border-border bg-secondary/50 text-muted-foreground",
}

// ─── Database Hosts Panel ─────────────────────────────────────────────────────

function DatabaseHostsPanel() {
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
                    {h.host}:{h.port} · User: {h.username}
                    {h.nodeId ? ` · Node #${h.nodeId}` : " · All nodes"}
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

  // ── Dialogs ──
  const [replyTicket, setReplyTicket] = useState<AdminTicket | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replyStatus, setReplyStatus] = useState("closed")
  const [replyLoading, setReplyLoading] = useState(false)

  const [editUserDialog, setEditUserDialog] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState("")
  const [editTier, setEditTier] = useState("")
  const [editLoading, setEditLoading] = useState(false)
  const [editServerLimit, setEditServerLimit] = useState("")
  const [editCpuLimit, setEditCpuLimit] = useState("")
  const [editMemoryLimit, setEditMemoryLimit] = useState("")
  const [editDiskLimit, setEditDiskLimit] = useState("")

  // ── Organisation edit dialog ──
  const [editOrgDialog, setEditOrgDialog] = useState<AdminOrganisation | null>(null)
  const [editOrgName, setEditOrgName] = useState("")
  const [editOrgHandle, setEditOrgHandle] = useState("")
  const [editOrgTier, setEditOrgTier] = useState("")
  const [editOrgOwnerId, setEditOrgOwnerId] = useState("")
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
  const [planPortCount, setPlanPortCount] = useState("1")
  const [planIsDefault, setPlanIsDefault] = useState(false)
  const [planFeatures, setPlanFeatures] = useState("")
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState("")
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
  const [issueOrderOpen, setIssueOrderOpen] = useState(false)
  const [ioUserId, setIoUserId] = useState("")
  const [ioDesc, setIoDesc] = useState("")
  const [ioPlanId, setIoPlanId] = useState("")
  const [ioAmount, setIoAmount] = useState("0")
  const [ioNotes, setIoNotes] = useState("")
  const [ioExpiresAt, setIoExpiresAt] = useState("")
  const [ioLoading, setIoLoading] = useState(false)
  const [ioError, setIoError] = useState("")

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
  const [aiModelApiKey, setAiModelApiKey] = useState("")
  const [aiModelType, setAiModelType] = useState("text")
  const [aiModelStatus, setAiModelStatus] = useState("active")
  const [aiModelDescription, setAiModelDescription] = useState("")
  const [aiModelMaxTokens, setAiModelMaxTokens] = useState("")
  const [aiModelLoading, setAiModelLoading] = useState(false)

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
  const [logType, setLogType] = useState<"audit" | "requests">("audit")

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
  const [eggProcessStop, setEggProcessStop] = useState("stop") // stop command value
  const [eggProcessDone, setEggProcessDone] = useState("") // done patterns, one per line
  const [eggInstallContainer, setEggInstallContainer] = useState("")
  const [eggInstallEntrypoint, setEggInstallEntrypoint] = useState("bash")
  const [eggInstallScript, setEggInstallScript] = useState("")
  const [eggLoading, setEggLoading] = useState(false)

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
  const [esEggId, setEsEggId] = useState("")
  const [esReinstalling, setEsReinstalling] = useState(false)

  // ── Create Server dialog ──
  const [createServerOpen, setCreateServerOpen] = useState(false)
  const [csNodeId, setCsNodeId] = useState("")
  const [csUserId, setCsUserId] = useState("")
  const [csEggId, setCsEggId] = useState("")
  const [csName, setCsName] = useState("")
  const [csMemory, setCsMemory] = useState("1024")
  const [csDisk, setCsDisk] = useState("10240")
  const [csCpu, setCsCpu] = useState("100")
  const [csLoading, setCsLoading] = useState(false)
  const [csError, setCsError] = useState("")

  // ── Sync from Wings ──
  const [syncingFromWings, setSyncingFromWings] = useState(false)

  // ── View Node Config dialog ──
  const [viewConfigNode, setViewConfigNode] = useState<AdminNode | null>(null)
  const [viewConfigToken, setViewConfigToken] = useState("")
  const [viewConfigLoading, setViewConfigLoading] = useState(false)

  // ── Fraud alerts ──
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([])
  const [oauthApps, setOauthApps] = useState<any[]>([])
  const [fraudScanning, setFraudScanning] = useState(false)
  const [fraudScanningAll, setFraudScanningAll] = useState(false)

  // ── Panel settings ──
  type PortalDescEntry = { name: string; description: string; features: string }
  const [panelSettings, setPanelSettings] = useState<{
    registrationEnabled: boolean
    registrationNotice: string
    portalDescriptions: Record<string, PortalDescEntry> | null
  }>({ registrationEnabled: true, registrationNotice: "", portalDescriptions: null })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

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
      .catch(() => {})
  }, [])

  // ── Tab loader ──
  const loadTab = useCallback(
    async (tab: string) => {
      if (loadedTabs.has(tab)) return
      setLoadedTabs((prev) => new Set([...prev, tab]))
      try {
        if (tab === "users") {
          const data = await apiFetch(API_ENDPOINTS.adminUsers)
          setUsers(data || [])
        } else if (tab === "tickets") {
          const data = await apiFetch(API_ENDPOINTS.adminTickets)
          setTickets(data || [])
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
            .catch(() => {})
        } else if (tab === "organisations") {
          const data = await apiFetch(API_ENDPOINTS.adminOrganisations)
          setOrganisations(data || [])
        } else if (tab === "servers") {
          const data = await apiFetch(API_ENDPOINTS.adminServers)
          setServers(data || [])
        } else if (tab === "eggs") {
          const data = await apiFetch(API_ENDPOINTS.adminEggs)
          setEggs(data || [])
        } else if (tab === "ai") {
          const data = await apiFetch(API_ENDPOINTS.adminAiModels)
          setAiModels(data || [])
        } else if (tab === "fraud") {
          const data = await apiFetch(API_ENDPOINTS.adminFraudAlerts)
          setFraudAlerts(data || [])
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
          if (data) setPanelSettings(data)
        } else if (tab === "plans") {
          const data = await apiFetch(API_ENDPOINTS.adminPlans)
          setPlans(Array.isArray(data) ? data : [])
        } else if (tab === "orders") {
          const data = await apiFetch(API_ENDPOINTS.adminOrders)
          setAdminOrders(Array.isArray(data) ? data : [])
          // also load plans so the order form can show plan names
          if (plans.length === 0) {
            apiFetch(API_ENDPOINTS.adminPlans).then((d: any) => setPlans(Array.isArray(d) ? d : [])).catch(() => {})
          }
        }
      } catch (_e) {
        // silently fail
      }
    },
    [loadedTabs]
  )

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
    ticketFilter === "all" ? tickets : tickets.filter((t) => t.status === ticketFilter)

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

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function toggleSuspend(user: AdminUser) {
    await apiFetch(`${API_ENDPOINTS.adminUsers}/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ suspended: !user.suspended }),
    })
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, suspended: !u.suspended } : u)))
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
    if (!confirm(`Cancel ${editUserDialog.firstName}'s active plan? They will revert to Free tier.`)) return
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
    setReplyText(ticket.adminReply || "")
    setReplyStatus("closed")
  }

  async function submitReply() {
    if (!replyTicket) return
    setReplyLoading(true)
    try {
      await apiFetch(`${API_ENDPOINTS.adminTickets}/${replyTicket.id}`, {
        method: "PUT",
        body: JSON.stringify({ adminReply: replyText, status: replyStatus }),
      })
      setTickets((prev) =>
        prev.map((t) =>
          t.id === replyTicket.id ? { ...t, adminReply: replyText, status: replyStatus } : t
        )
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
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
  }

  async function deleteVerification(id: number) {
    if (!confirm('Delete this verification record and its uploaded documents?')) return
    try {
      await apiFetch(`${API_ENDPOINTS.adminVerifications}/${id}`, { method: 'DELETE' })
      setVerifications((prev) => prev.filter((v) => v.id !== id))
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    setEditOrgAddMemberId("")
  }

  async function saveEditOrg() {
    if (!editOrgDialog) return
    setEditOrgLoading(true)
    try {
      await apiFetch(`${API_ENDPOINTS.adminOrganisations}/${editOrgDialog.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editOrgName, handle: editOrgHandle, portalTier: editOrgTier, ownerId: editOrgOwnerId ? Number(editOrgOwnerId) : undefined }),
      })
      setOrganisations((prev) =>
        prev.map((o) =>
          o.id === editOrgDialog.id ? { ...o, name: editOrgName, handle: editOrgHandle, portalTier: editOrgTier, ownerId: editOrgOwnerId ? Number(editOrgOwnerId) : o.ownerId } : o
        )
      )
      setEditOrgDialog(null)
    } finally {
      setEditOrgLoading(false)
    }
  }

  async function deleteOrg(org: AdminOrganisation) {
    if (!confirm(`Delete organisation "${org.name}"? This will unlink all members.`)) return
    await apiFetch(`${API_ENDPOINTS.adminOrganisations}/${org.id}`, { method: "DELETE" })
    setOrganisations((prev) => prev.filter((o) => o.id !== org.id))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    if (!confirm(`Delete server ${uuid}? This action cannot be undone.`)) return
    await apiFetch(`${API_ENDPOINTS.adminServers}/${uuid}`, { method: "DELETE" })
    setServers((prev) => prev.filter((s) => s.uuid !== uuid))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    setEsEggId(String(srv.eggId || ""))
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
      .catch(() => {})
    // ensure eggs are loaded for the egg selector
    if (eggs.length === 0) {
      apiFetch(API_ENDPOINTS.adminEggs).then((data: any) => setEggs(data || [])).catch(() => {})
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
          eggId: esEggId ? Number(esEggId) : undefined,
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
    if (!confirm(`Reinstall "${editServerDialog.name || editServerDialog.uuid}"? All server files will be wiped and the server will be re-provisioned from its egg.`)) return
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
      alert(`Sync complete — ${result.created} new configs imported, ${result.skipped} already existed.${
        result.errors?.length ? `\n\nErrors:\n${result.errors.join("\n")}` : ""
      }`)
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`)
    } finally {
      setSyncingFromWings(false)
    }
  }

  function openCreateServer() {
    setCsNodeId(nodes.length === 1 ? String(nodes[0].id) : "")
    setCsUserId("")
    setCsEggId(eggs.length === 1 ? String(eggs[0].id) : "")
    setCsName("")
    setCsMemory("1024")
    setCsDisk("10240")
    setCsCpu("100")
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
          eggId: csEggId ? Number(csEggId) : undefined,
          name: csName || undefined,
          memory: Number(csMemory),
          disk: Number(csDisk),
          cpu: Number(csCpu),
        }),
      })
      setCreateServerOpen(false)
      forceRefreshTab("servers")
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    setPlanPortCount("1"); setPlanIsDefault(false); setPlanFeatures(""); setPlanError("")
    setPlanDialogOpen(true)
  }

  function openEditPlan(plan: AdminPlan) {
    setPlanEditTarget(plan)
    setPlanName(plan.name); setPlanType(plan.type); setPlanPrice(String(plan.price ?? 0)); setPlanDesc(plan.description || "")
    setPlanMemory(plan.memory != null ? String(plan.memory) : ""); setPlanDisk(plan.disk != null ? String(plan.disk) : "")
    setPlanCpu(plan.cpu != null ? String(plan.cpu) : ""); setPlanServerLimit(plan.serverLimit != null ? String(plan.serverLimit) : "")
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

  async function deletePlan(plan: AdminPlan) {
    if (!confirm(`Delete plan "${plan.name}"?`)) return
    await apiFetch(`${API_ENDPOINTS.adminPlans}/${plan.id}`, { method: "DELETE" })
    setPlans((prev) => prev.filter((p) => p.id !== plan.id))
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

  // ── Apply Plan to User ────────────────────────────────────────────────────

  function openApplyPlan(userId: number) {
    setApplyPlanUserId(userId)
    setApplyPlanId(""); setApplyPlanNotes(""); setApplyPlanExpiry(""); setApplyPlanOrgId(""); setApplyPlanError("")
    if (plans.length === 0) apiFetch(API_ENDPOINTS.adminPlans).then((d: any) => setPlans(Array.isArray(d) ? d : [])).catch(() => {})
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
        setUsers((prev) => prev.map((u) => u.id === applyPlanUserId ? { ...u, portalType: plan.type, limits } : u))
        // Refresh current plan display if user edit dialog is open for the same user
        if (editUserDialog?.id === applyPlanUserId) {
          setEditTier(plan.type)
          apiFetch(API_ENDPOINTS.adminUserCurrentPlan.replace(":id", String(applyPlanUserId)))
            .then((data) => setUserCurrentPlan(data))
            .catch(() => {})
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
    if (!confirm(`Delete node "${node.name}"? All server mappings on this node will break.`)) return
    await apiFetch(`${API_ENDPOINTS.nodes}/${node.id}`, { method: "DELETE" })
    setNodes((prev) => prev.filter((n) => n.id !== node.id))
    apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
      apiFetch(API_ENDPOINTS.adminStats).then((d) => setStats(d)).catch(() => {})
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
    setEggProcessStop("stop"); setEggProcessDone("")
    setEggInstallContainer(""); setEggInstallEntrypoint("bash"); setEggInstallScript("")
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
    setEggProcessStop(egg.processConfig?.stop?.value || "stop")
    setEggProcessDone((egg.processConfig?.startup?.done || []).join("\n"))
    setEggInstallContainer(egg.installScript?.container || "")
    setEggInstallEntrypoint(egg.installScript?.entrypoint || "bash")
    setEggInstallScript(egg.installScript?.script || "")
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
    const installScript = eggInstallContainer.trim() ? {
      container: eggInstallContainer.trim(),
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

  async function deleteEgg(egg: AdminEgg) {
    if (!confirm(`Delete egg "${egg.name}"?`)) return
    await apiFetch(`${API_ENDPOINTS.adminEggs}/${egg.id}`, { method: "DELETE" })
    setEggs((prev) => prev.filter((e) => e.id !== egg.id))
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
    setAiModelName(""); setAiModelEndpoint(""); setAiModelApiKey("")
    setAiModelType("text"); setAiModelStatus("active"); setAiModelDescription(""); setAiModelMaxTokens("")
  }

  function openEditAIModel(m: AdminAIModel) {
    setAiModelDialog(m)
    setAiModelName(m.name)
    setAiModelEndpoint(m.endpoint || "")
    setAiModelApiKey(m.apiKey || "")
    setAiModelType(m.config?.type || "text")
    setAiModelStatus(m.config?.status || "active")
    setAiModelDescription(m.config?.description || "")
    setAiModelMaxTokens(String(m.config?.maxTokens || ""))
  }

  async function saveAIModel() {
    setAiModelLoading(true)
    const body = {
      name: aiModelName,
      endpoint: aiModelEndpoint || undefined,
      apiKey: aiModelApiKey || undefined,
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
    if (!confirm(`Delete model "${m.name}"?`)) return
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
        apiFetch(API_ENDPOINTS.roles).then((d) => setRoles(Array.isArray(d) ? d : [])).catch(() => {})
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
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <StatCard title="Total Users" value={stats ? String(stats.totalUsers) : "—"} icon={Users} />
            <StatCard title="Organisations" value={stats ? String(stats.totalOrganisations) : "—"} icon={Building2} />
            <StatCard title="Servers" value={stats ? String(stats.totalServers) : "—"} icon={Server} />
            <StatCard title="Nodes" value={stats ? String(stats.totalNodes) : "—"} icon={HardDrive} />
            <StatCard title="Open Tickets" value={stats ? String(stats.pendingTickets) : "—"} icon={MessageSquare} />
            <StatCard title="Pending KYC" value={stats ? String(stats.pendingVerifications) : "—"} icon={FileText} />
            <StatCard title="Deletion Queue" value={stats ? String(stats.pendingDeletions) : "—"} icon={Trash2} />
            <StatCard title="Fraud Alerts" value={stats ? String((stats as any).fraudAlerts ?? 0) : "—"} icon={AlertTriangle} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="users" onValueChange={(tab) => loadTab(tab)} className="w-full">
            <TabsList className="border border-border bg-secondary/50">
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
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ═══════════════ USERS ══════════════════════════════════════════ */}
            <TabsContent value="users" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="relative">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search by name or email…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        onFocus={() => setUserSearchFocused(true)}
                        onBlur={() => setTimeout(() => setUserSearchFocused(false), 150)}
                        className="w-64 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </div>
                    {userSearchFocused && userSearch.trim().length > 0 && filteredUsers.length > 0 && (
                      <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                        {filteredUsers.slice(0, 3).map((u) => (
                          <button
                            key={u.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { openViewUser(u); setUserSearch(""); setUserSearchFocused(false); }}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/40 last:border-0"
                          >
                            <div className="h-7 w-7 rounded-full bg-secondary/80 flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                              {u.firstName?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{u.firstName} {u.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                          </button>
                        ))}
                        {filteredUsers.length > 3 && (
                          <p className="px-3 py-1.5 text-xs text-muted-foreground text-center">+{filteredUsers.length - 3} more — keep typing to narrow</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => forceRefreshTab("users")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">User</th>
                        <th className="px-4 py-3 text-left font-medium">Role</th>
                        <th className="px-4 py-3 text-left font-medium">Tier</th>
                        <th className="px-4 py-3 text-left font-medium">Verified</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            {users.length === 0 ? "Loading users…" : "No users match the search."}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                          <tr key={user.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{user.firstName} {user.lastName}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
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
                            <td className="px-4 py-3 text-xs">
                              <span className={user.emailVerified ? "text-emerald-400" : "text-muted-foreground"}>
                                {user.emailVerified ? "✓" : "✗"} Email
                              </span>
                              <span className={user.studentVerified ? "text-emerald-400" : "text-muted-foreground"}>
                                {user.studentVerified ? "✓" : "✗"} Student
                              </span>
                              {"  "}
                              <span className={user.idVerified ? "text-emerald-400" : "text-muted-foreground"}>
                                {user.idVerified ? "✓" : "✗"} ID
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {user.suspended ? (
                                <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Suspended</Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Active</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openViewUser(user)} title="View full profile"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => openEditUser(user)} title="Edit role/tier"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                  <UserCog className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => toggleSuspend(user)} title={user.suspended ? "Unsuspend" : "Suspend"}
                                  className={`rounded-md p-1.5 transition-colors ${user.suspended
                                    ? "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                                    : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"}`}>
                                  {user.suspended ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
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
            </TabsContent>

            {/* ═══════════════ ORGANISATIONS ══════════════════════════════════ */}
            <TabsContent value="organisations" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search organisations..."
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      className="w-52 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                  <button
                    onClick={() => forceRefreshTab("organisations")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
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
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            {organisations.length === 0 ? "Loading organisations…" : "No organisations match the search."}
                          </td>
                        </tr>
                      ) : (
                        filteredOrgs.map((org) => (
                          <tr key={org.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{org.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">ID #{org.id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-muted-foreground">{org.handle}</span>
                            </td>
                            <td className="px-4 py-3">
                              {org.owner ? (
                                <div>
                                  <p className="text-sm text-foreground">{org.owner.firstName} {org.owner.lastName}</p>
                                  <p className="text-xs text-muted-foreground">{org.owner.email}</p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Owner #{org.ownerId}</span>
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
                            <td className="px-4 py-3 text-sm text-foreground">
                              {org.memberCount}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
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
            </TabsContent>

            {/* ═══════════════ SERVERS ════════════════════════════════════════ */}
            <TabsContent value="servers" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search servers..."
                      value={serverSearch}
                      onChange={(e) => setServerSearch(e.target.value)}
                      className="w-52 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={syncFromWings} disabled={syncingFromWings}
                      className="h-8 gap-1 border-border text-muted-foreground">
                      {syncingFromWings ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Sync from Wings
                    </Button>
                    <Button size="sm" onClick={() => { loadTab("nodes"); loadTab("eggs"); openCreateServer(); }}
                      className="bg-primary text-primary-foreground h-8 gap-1">
                      <Plus className="h-3 w-3" /> Create Server
                    </Button>
                    <button
                      onClick={() => forceRefreshTab("servers")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
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
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            {servers.length === 0 ? "Loading servers…" : "No servers match the search."}
                          </td>
                        </tr>
                      ) : (
                        filteredServers.map((srv) => (
                          <tr key={srv.uuid} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{srv.name || "Unnamed Server"}</p>
                              {srv.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs">{srv.description}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-muted-foreground">{(srv.uuid || '').substring(0, 12)}{srv.uuid ? '…' : ''}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground">
                                {srv.nodeName}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={
                                srv.status === "running"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : srv.status === "starting"
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : srv.status === "suspended"
                                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                                      : "border-border bg-secondary/50 text-muted-foreground"
                              }>
                                {srv.status || "unknown"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => serverPower(srv.uuid, "start")} title="Start"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                                  <Power className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => serverPower(srv.uuid, "restart")} title="Restart"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => serverPower(srv.uuid, "stop")} title="Stop"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════ TICKETS ════════════════════════════════════════ */}
            <TabsContent value="tickets" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex gap-2">
                    {["all", "open", "pending", "closed"].map((f) => (
                      <button key={f} onClick={() => setTicketFilter(f)}
                        className={`rounded-md px-3 py-1 text-xs transition-colors ${ticketFilter === f
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => forceRefreshTab("tickets")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">#</th>
                        <th className="px-4 py-3 text-left font-medium">Subject</th>
                        <th className="px-4 py-3 text-left font-medium">User</th>
                        <th className="px-4 py-3 text-left font-medium">Priority</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-left font-medium">Created</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            {tickets.length === 0 ? "Loading tickets…" : "No tickets match the filter."}
                          </td>
                        </tr>
                      ) : (
                        filteredTickets.map((ticket) => (
                          <tr key={ticket.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{ticket.id}</td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{ticket.subject}</p>
                              {ticket.adminReply && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">Reply: {ticket.adminReply}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {ticket.user ? `${ticket.user.firstName} ${ticket.user.lastName}` : `User #${ticket.userId}`}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={priorityColor[ticket.priority] || priorityColor.medium}>
                                {ticket.priority}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={ticketStatusColor[ticket.status] || ticketStatusColor.open}>
                                {ticket.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(ticket.created).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {ticket.status !== "closed" && (
                                <button onClick={() => openReply(ticket)} title="Reply"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════ KYC / VERIFICATIONS ════════════════════════════ */}
            <TabsContent value="verifications" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <SectionHeader title="ID Verifications" description="Review submitted KYC documents" />
                  <button onClick={() => forceRefreshTab("verifications")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
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
                      {verifications.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No verification requests found.
                          </td>
                        </tr>
                      ) : (
                        verifications.map((v) => (
                          <tr key={v.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">
                                {v.user ? `${v.user.firstName} ${v.user.lastName}` : `User #${v.userId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">{v.user?.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={v.status === "verified" ? "online" : v.status === "failed" ? "offline" : "pending"} />
                            </td>
                            <td className="px-4 py-3 flex gap-2 text-xs">
                              {v.idDocumentUrl && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    window.open(v.idDocumentUrl, '_blank');
                                  }}
                                  className="text-primary hover:underline cursor-pointer"
                                >ID Doc</a>
                              )}
                              {v.selfieUrl && (
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    window.open(v.selfieUrl, '_blank');
                                  }}
                                  className="text-primary hover:underline cursor-pointer"
                                >Selfie</a>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
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
                                <button onClick={() => deleteVerification(v.id)} title="Delete record & files"
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
            </TabsContent>

            {/* ═══════════════ DELETION REQUESTS ══════════════════════════════ */}
            <TabsContent value="deletions" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <SectionHeader title="Deletion Requests" description="Review and act on account deletion requests" />
                  <button onClick={() => forceRefreshTab("deletions")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
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
                      {deletions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No deletion requests found.
                          </td>
                        </tr>
                      ) : (
                        deletions.map((d) => (
                          <tr key={d.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">
                                {d.user ? `${d.user.firstName} ${d.user.lastName}` : `User #${d.userId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">{d.user?.email}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(d.requestedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={
                                d.status === "approved"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : d.status === "rejected"
                                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                                    : "border-warning/30 bg-warning/10 text-warning"
                              }>
                                {d.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {d.status === "pending" && (
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => reviewDeletion(d.id, "approved")} title="Approve deletion"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => reviewDeletion(d.id, "rejected")} title="Reject deletion"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                    <XCircle className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{node.url}</p>
                              {node.organisation && (
                                <p className="mt-1 text-xs text-muted-foreground">Org: {node.organisation.name}</p>
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
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" /> Server Templates (Eggs)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setImportEggError(""); setImportEggPreview(null); setImportEggJson(""); setImportEggUrl(""); setImportEggOpen(true) }} className="h-8 gap-1 border-border">
                      <Upload className="h-3.5 w-3.5" /> Import Egg
                    </Button>
                    <Button size="sm" onClick={openNewEgg} className="bg-primary text-primary-foreground h-8 gap-1">
                      <Plus className="h-3.5 w-3.5" /> New Egg
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Image</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Visible</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eggs.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No eggs configured.</td></tr>
                      ) : eggs.map((egg) => (
                        <tr key={egg.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{egg.name}</p>
                            {egg.description && <p className="text-xs text-muted-foreground">{egg.description}</p>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-xs truncate">{egg.dockerImage}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleEggVisible(egg)}
                              className={`flex items-center gap-1 text-xs rounded-md px-2 py-1 border transition-colors ${
                                egg.visible
                                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                                  : "border-border bg-secondary/50 text-muted-foreground"
                              }`}>
                              {egg.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              {egg.visible ? "Visible" : "Hidden"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEditEgg(egg)}
                                className="border-border h-7 px-2 text-xs gap-1">
                                <Edit className="h-3 w-3" /> Edit
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteEgg(egg)}
                                className="border-destructive/50 text-destructive h-7 px-2 text-xs">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════ AI MODELS ══════════════════════════════════════ */}
            <TabsContent value="ai" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <Brain className="h-4 w-4 text-muted-foreground" /> AI Models
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground ml-1">{aiModels.length}</Badge>
                  </h3>
                  <Button size="sm" onClick={openNewAIModel} className="bg-primary text-primary-foreground h-8 gap-1">
                    <Plus className="h-3.5 w-3.5" /> New Model
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Endpoint</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiModels.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No AI models configured. Add one to enable AI features.</td></tr>
                      ) : aiModels.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{m.name}</p>
                            {m.config?.description && <p className="text-xs text-muted-foreground">{m.config.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs capitalize">
                              {m.config?.type || "text"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${
                              m.config?.status === "beta" ? "border-warning/30 bg-warning/10 text-warning" :
                              m.config?.status === "disabled" ? "border-destructive/30 bg-destructive/10 text-destructive" :
                              "border-green-500/30 bg-green-500/10 text-green-400"
                            }`}>
                              {m.config?.status || "active"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-xs truncate">
                            {m.endpoint || <span className="italic">not set</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => openAssignAiModel(m)}
                                className="border-border h-7 px-2 text-xs gap-1">
                                <UserPlus className="h-3 w-3" /> Assign
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openEditAIModel(m)}
                                className="border-border h-7 px-2 text-xs gap-1">
                                <Edit className="h-3 w-3" /> Edit
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteAIModel(m)}
                                className="border-destructive/50 text-destructive h-7 px-2 text-xs">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

                {fraudAlerts.length === 0 ? (
                  <div className="p-8 text-center">
                    <Shield className="h-8 w-8 mx-auto text-success/60 mb-2" />
                    <p className="text-sm text-muted-foreground">No fraud alerts — all users look clean</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {fraudAlerts.map((alert) => (
                      <div key={alert.id} className="p-4 flex items-start gap-4">
                        <div className="shrink-0 h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {alert.firstName} {alert.lastName}
                            </span>
                            <span className="text-xs text-muted-foreground">{alert.email}</span>
                            {alert.suspended && (
                              <Badge className="bg-destructive/20 text-destructive border-0 text-[10px]">Suspended</Badge>
                            )}
                          </div>
                          <p className="text-xs text-destructive/80 mt-1">{alert.fraudReason}</p>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {alert.address && <p><span className="text-foreground/60">Address:</span> {alert.address}{alert.address2 ? `, ${alert.address2}` : ''}</p>}
                            {alert.billingCity && <p><span className="text-foreground/60">City:</span> {alert.billingCity}{alert.billingState ? `, ${alert.billingState}` : ''} {alert.billingZip}</p>}
                            {alert.billingCountry && <p><span className="text-foreground/60">Country:</span> {alert.billingCountry}</p>}
                            {alert.billingCompany && <p><span className="text-foreground/60">Company:</span> {alert.billingCompany}</p>}
                            {alert.phone && <p><span className="text-foreground/60">Phone:</span> {alert.phone}</p>}
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
                                if (!confirm(`Suspend user ${alert.firstName} ${alert.lastName}?`)) return;
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
                )}
              </div>
            </TabsContent>

            {/* ═══════════════ ROLES ════════════════════════════════════ */}
            <TabsContent value="roles" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Role list */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <p className="text-sm font-medium text-foreground">Custom Roles</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => forceRefreshTab("roles")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <Button size="sm" onClick={() => { setRoleDialog(true); setRoleName(""); setRoleDesc("") }}
                        className="bg-primary text-primary-foreground gap-1 h-7 px-2 text-xs">
                        <Plus className="h-3 w-3" /> New Role
                      </Button>
                    </div>
                  </div>
                  {roles.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground text-center">No custom roles created yet.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border">
                      {roles.map((role) => (
                        <div
                          key={role.id}
                          onClick={() => setSelectedRole(role)}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/30 ${
                            selectedRole?.id === role.id ? "bg-primary/10" : ""
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{role.name}</p>
                            {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                            <p className="text-xs text-muted-foreground">{role.permissions?.length || 0} permission(s)</p>
                          </div>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!confirm(`Delete role "${role.name}"?`)) return
                              await apiFetch(`${API_ENDPOINTS.roles}/${role.id}`, { method: "DELETE" })
                              setRoles((prev) => prev.filter((r) => r.id !== role.id))
                              if (selectedRole?.id === role.id) setSelectedRole(null)
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Permissions panel */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="border-b border-border p-4">
                    <p className="text-sm font-medium text-foreground">
                      {selectedRole ? `Permissions — ${selectedRole.name}` : "Select a role to manage permissions"}
                    </p>
                  </div>
                  {!selectedRole ? (
                    <p className="p-6 text-sm text-muted-foreground text-center">Click a role on the left.</p>
                  ) : (
                    <div className="flex flex-col gap-3 p-4">
                      {/* Add permission select */}
                      <div className="flex gap-2">
                        <select
                          value={newPermValue}
                          onChange={(e) => setNewPermValue(e.target.value)}
                          className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
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
                        <Button size="sm" disabled={!newPermValue.trim() || permLoading}
                          onClick={async () => {
                            if (!newPermValue.trim()) return
                            setPermLoading(true)
                            try {
                              const data = await apiFetch(`${API_ENDPOINTS.roles}/${selectedRole.id}/permissions`, {
                                method: "POST", body: JSON.stringify({ value: newPermValue.trim() })
                              })
                              const updated = { ...selectedRole, permissions: [...(selectedRole.permissions || []), data.perm] }
                              setSelectedRole(updated)
                              setRoles((prev) => prev.map((r) => r.id === updated.id ? updated : r))
                              setNewPermValue("")
                            } finally { setPermLoading(false) }
                          }}
                          className="bg-primary text-primary-foreground gap-1 h-9 px-3 text-xs shrink-0">
                          {permLoading ? "Adding…" : <><Plus className="h-3 w-3" /> Add</>}
                        </Button>
                      </div>
                      {/* Permission list */}
                      {(selectedRole.permissions || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No permissions yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {selectedRole.permissions.map((p) => (
                            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                              <span className="font-mono text-xs text-foreground">{p.value}</span>
                              <button
                                onClick={async () => {
                                  await apiFetch(`${API_ENDPOINTS.roles}/${selectedRole.id}/permissions/${p.id}`, { method: "DELETE" })
                                  const updated = { ...selectedRole, permissions: selectedRole.permissions.filter((x) => x.id !== p.id) }
                                  setSelectedRole(updated)
                                  setRoles((prev) => prev.map((r) => r.id === updated.id ? updated : r))
                                }}
                                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 LOGS \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */}
            <TabsContent value="logs" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-foreground">Audit Logs</p>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
                      {(["audit", "requests"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={async () => {
                            setLogType(t)
                            try {
                              const data = await apiFetch(`${API_ENDPOINTS.adminLogs}?type=${t}&limit=200`)
                              setLogs(data || [])
                            } catch {}
                          }}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize ${
                            logType === t
                              ? "bg-primary/20 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t === "audit" ? "Audit" : "API Requests"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const data = await apiFetch(`${API_ENDPOINTS.adminLogs}?type=${logType}&limit=200`)
                        setLogs(data || [])
                      } catch {}
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">Time</th>
                        <th className="px-4 py-3 text-left font-medium">User</th>
                        {logType === "audit" ? (
                          <th className="px-4 py-3 text-left font-medium">Action</th>
                        ) : (
                          <>
                            <th className="px-4 py-3 text-left font-medium">Endpoint</th>
                            <th className="px-4 py-3 text-left font-medium">Count</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No logs found.
                          </td>
                        </tr>
                      ) : (
                        logs.map((log: any) => (
                          <tr key={log.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              {log.username ? (
                                <div>
                                  <p className="text-sm font-medium text-foreground">{log.username}</p>
                                  <p className="text-xs text-muted-foreground">{log.email}</p>
                                </div>
                              ) : log.userId ? (
                                <span className="text-xs text-muted-foreground">User #{log.userId}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            {logType === "audit" ? (
                              <td className="px-4 py-3 font-mono text-xs text-foreground">{log.action}</td>
                            ) : (
                              <>
                                <td className="px-4 py-3 font-mono text-xs text-foreground">{log.endpoint}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">{log.count}</td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
                              { method: "GET",    path: "/.well-known/oauth-authorization-server", auth: "—",              desc: "RFC 8414 discovery metadata" },
                              { method: "POST",   path: "/api/oauth/apps",                         auth: "Bearer JWT",     desc: "Register a new OAuth application" },
                              { method: "GET",    path: "/api/oauth/apps",                         auth: "Bearer JWT",     desc: "List your registered apps" },
                              { method: "GET",    path: "/api/oauth/apps/:clientId",               auth: "—",              desc: "Public app info (used by consent UI)" },
                              { method: "PUT",    path: "/api/oauth/apps/:id",                    auth: "Bearer JWT",     desc: "Update app settings" },
                              { method: "DELETE", path: "/api/oauth/apps/:id",                    auth: "Bearer JWT",     desc: "Delete app + revoke all tokens" },
                              { method: "POST",   path: "/api/oauth/apps/:id/rotate-secret",      auth: "Bearer JWT",     desc: "Rotate client secret, revoke all tokens" },
                              { method: "GET",    path: "/api/oauth/authorize",                   auth: "—",              desc: "Return consent page data (app info + scopes)" },
                              { method: "POST",   path: "/api/oauth/authorize",                   auth: "Bearer JWT",     desc: "User approves / denies → returns redirect URL" },
                              { method: "POST",   path: "/api/oauth/token",                       auth: "client_secret",  desc: "Exchange code / credentials for token" },
                              { method: "POST",   path: "/api/oauth/token/revoke",                auth: "client_secret",  desc: "Revoke access or refresh token (RFC 7009)" },
                              { method: "POST",   path: "/api/oauth/token/introspect",            auth: "client_secret",  desc: "Validate token + return metadata (RFC 7662)" },
                              { method: "GET",    path: "/api/oauth/userinfo",                    auth: "Bearer OAuth",   desc: "Scoped user profile (OpenID-style)" },
                            ].map((ep) => (
                              <tr key={ep.path + ep.method} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                <td className="px-4 py-2.5">
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                                    ep.method === "GET" ? "bg-blue-500/15 text-blue-400" :
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
                          { scope: "profile",      desc: "firstName, lastName, displayName, avatarUrl, portalType, role" },
                          { scope: "email",        desc: "email + emailVerified flag" },
                          { scope: "orgs:read",    desc: "Organisation id, name, handle and the user's orgRole" },
                          { scope: "billing:read", desc: "Billing address fields (company, city, state, zip, country)" },
                          { scope: "servers:read", desc: "List user's servers across all nodes" },
                          { scope: "servers:write",desc: "Manage / power user's servers" },
                          { scope: "admin",        desc: "Admin-level access — only grantable to admin users" },
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
                              } catch {}
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
                                    if (!confirm(`Delete app "${oa.name}"? All tokens will be revoked.`)) return
                                    try {
                                      await apiFetch(`/api/oauth/apps/${oa.id}`, { method: "DELETE" })
                                      setOauthApps((prev) => prev.filter((a) => a.id !== oa.id))
                                    } catch {}
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
                          { label: "Access token",       value: "1 hour" },
                          { label: "Refresh token",      value: "30 days" },
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
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Plans</p>
                    <Badge variant="outline" className="text-xs">{plans.length}</Badge>
                  </div>
                  <Button size="sm" onClick={openNewPlan}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Plan
                  </Button>
                </div>
                {plans.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No plans configured. Create one to define resource tiers for users.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {plans.map((plan) => (
                      <div key={plan.id} className="flex items-start justify-between px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{plan.name}</p>
                            <Badge variant="outline" className="text-xs">{getPortalMarker(plan.type)}</Badge>
                            {plan.isDefault && <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Default</Badge>}
                          </div>
                          {plan.description && <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {plan.memory != null ? `${plan.memory} MB RAM` : "∞ RAM"} ·{" "}
                            {plan.disk != null ? `${(plan.disk / 1024).toFixed(0)} GB disk` : "∞ disk"} ·{" "}
                            {plan.cpu != null ? `${plan.cpu}% CPU` : "∞ CPU"} ·{" "}
                            {plan.serverLimit != null ? `${plan.serverLimit} servers` : "∞ servers"} ·{" "}
                            ${(plan.price ?? 0).toFixed(2)}/mo
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Button variant="ghost" size="sm" onClick={() => openEditPlan(plan)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deletePlan(plan)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═════════════════ ORDERS ══════════════════════════════════════ */}
            <TabsContent value="orders" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Orders</p>
                    <Badge variant="outline" className="text-xs">{adminOrders.length}</Badge>
                  </div>
                  <Button size="sm" onClick={openIssueOrder}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Issue Order
                  </Button>
                </div>
                {adminOrders.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No orders yet. Issue an order to assign a plan or resource pack to a user.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {adminOrders.map((order) => (
                      <div key={order.id} className="flex items-start justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{order.description || `Order #${order.id}`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            User #{order.userId}
                            {order.planId ? ` · Plan #${order.planId}` : ""}
                            {" "} · ${(order.amount ?? 0).toFixed(2)}
                            {" "} · <span className={order.status === "active" ? "text-green-400" : "text-muted-foreground"}>{order.status}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created: {new Date(order.createdAt).toLocaleDateString()}
                            {order.expiresAt ? ` · Expires: ${new Date(order.expiresAt).toLocaleDateString()}` : ""}
                          </p>
                          {order.notes && <p className="text-xs text-muted-foreground italic">{order.notes}</p>}
                        </div>
                        <Badge variant="outline" className="text-xs capitalize shrink-0 ml-3">{order.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═════════════════ PANEL SETTINGS ══════════════════════════════ */}
            <TabsContent value="settings" className="mt-4">
              <div className="flex flex-col gap-4 max-w-xl">

                {/* Registration toggle */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Registration</p>
                  </div>
                  <div className="flex flex-col gap-4 p-4">
                    {/* Toggle */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Allow new registrations</p>
                        <p className="text-xs text-muted-foreground mt-0.5">When disabled the Sign Up form is hidden and the backend returns HTTP 503 for any registration attempt.</p>
                      </div>
                      <button
                        onClick={() => setPanelSettings((s) => ({ ...s, registrationEnabled: !s.registrationEnabled }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                          panelSettings.registrationEnabled ? "bg-primary" : "bg-secondary"
                        }`}
                        role="switch"
                        aria-checked={panelSettings.registrationEnabled}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                            panelSettings.registrationEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Notice message */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {panelSettings.registrationEnabled ? "Notice (optional — shown as an info banner)" : "Reason shown to users"}
                      </label>
                      <textarea
                        rows={3}
                        value={panelSettings.registrationNotice}
                        onChange={(e) => setPanelSettings((s) => ({ ...s, registrationNotice: e.target.value }))}
                        placeholder={panelSettings.registrationEnabled
                          ? "e.g. This is a development build. Data may be reset."
                          : "e.g. Registration is temporarily closed for maintenance."}
                        className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Supports plain text. Leave empty for no banner.
                      </p>
                    </div>

                    {/* Preview */}
                    {(panelSettings.registrationNotice || !panelSettings.registrationEnabled) && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
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
                        ) : (
                          <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                            <p className="text-sm text-blue-300">{panelSettings.registrationNotice}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save button */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {settingsSaved && (
                        <span className="text-xs text-green-400">Settings saved</span>
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
                          } catch (e: any) {
                            alert(e.message || "Failed to save settings")
                          } finally {
                            setSettingsSaving(false)
                          }
                        }}
                        className="bg-primary text-primary-foreground"
                        size="sm"
                      >
                        {settingsSaving ? "Saving…" : "Save Settings"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Portal Descriptions */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Portal Tier Descriptions</p>
                    <span className="ml-auto text-xs text-muted-foreground">Shown on the Billing page</span>
                  </div>
                  <div className="flex flex-col gap-4 p-4">
                    {(["free", "paid", "enterprise"] as const).map((tier) => {
                      const saved = panelSettings.portalDescriptions?.[tier]
                      const defaultNames: Record<string, string> = { free: "Free Portal", paid: "Paid Portal", enterprise: "Enterprise Portal" }
                      return (
                        <div key={tier} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tier}</p>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-muted-foreground">Display Name</label>
                            <input
                              value={saved?.name ?? defaultNames[tier]}
                              onChange={(e) => setPanelSettings((s) => ({
                                ...s,
                                portalDescriptions: {
                                  ...(s.portalDescriptions ?? {}),
                                  [tier]: { ...((s.portalDescriptions?.[tier]) ?? { name: defaultNames[tier], description: "", features: "" }), name: e.target.value },
                                },
                              }))}
                              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-muted-foreground">Short Description</label>
                            <input
                              value={saved?.description ?? ""}
                              onChange={(e) => setPanelSettings((s) => ({
                                ...s,
                                portalDescriptions: {
                                  ...(s.portalDescriptions ?? {}),
                                  [tier]: { ...((s.portalDescriptions?.[tier]) ?? { name: defaultNames[tier], description: "", features: "" }), description: e.target.value },
                                },
                              }))}
                              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-muted-foreground">Features (one per line)</label>
                            <textarea
                              rows={4}
                              value={saved?.features ?? ""}
                              onChange={(e) => setPanelSettings((s) => ({
                                ...s,
                                portalDescriptions: {
                                  ...(s.portalDescriptions ?? {}),
                                  [tier]: { ...((s.portalDescriptions?.[tier]) ?? { name: defaultNames[tier], description: "", features: "" }), features: e.target.value },
                                },
                              }))}
                              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono"
                            />
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {settingsSaved && (
                        <span className="text-xs text-green-400">Settings saved</span>
                      )}
                      <Button
                        disabled={settingsSaving}
                        onClick={async () => {
                          setSettingsSaving(true); setSettingsSaved(false)
                          try {
                            const data = await apiFetch(API_ENDPOINTS.adminSettings, {
                              method: "PUT",
                              body: JSON.stringify({ portalDescriptions: panelSettings.portalDescriptions }),
                            })
                            if (data?.settings) setPanelSettings((s) => ({ ...s, ...data.settings }))
                            setSettingsSaved(true)
                            setTimeout(() => setSettingsSaved(false), 3000)
                          } catch (e: any) {
                            alert(e.message || "Failed to save portal descriptions")
                          } finally {
                            setSettingsSaving(false)
                          }
                        }}
                        className="bg-primary text-primary-foreground"
                        size="sm"
                      >
                        {settingsSaving ? "Saving…" : "Save Portal Descriptions"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            {/* ═════════════════ DATABASE HOSTS ══════════════════════════════ */}
            <TabsContent value="databases" className="mt-4">
              <DatabaseHostsPanel />
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

      {/* ═══════ Edit User Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={!!editUserDialog} onOpenChange={(open) => !open && setEditUserDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Edit User — {editUserDialog?.firstName} {editUserDialog?.lastName}
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
                <select value={esEggId} onChange={(e) => setEsEggId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">— No template —</option>
                  {eggs.map((egg) => (
                    <option key={egg.id} value={String(egg.id)}>{egg.name}</option>
                  ))}
                </select>
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
                <select value={csEggId} onChange={(e) => setCsEggId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="">Default (Node.js)</option>
                  {eggs.map((e) => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                </select>
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
                  <input type="number" min="128" value={csMemory} onChange={(e) => setCsMemory(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Disk (MB)</label>
                  <input type="number" min="512" value={csDisk} onChange={(e) => setCsDisk(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">CPU (%)</label>
                  <input type="number" min="10" value={csCpu} onChange={(e) => setCsCpu(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
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
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  From {replyTicket.user
                    ? `${replyTicket.user.firstName} ${replyTicket.user.lastName}`
                    : `User #${replyTicket.userId}`}
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{replyTicket.message}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Reply</label>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
                  placeholder="Type your reply…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Set Status</label>
                <div className="flex gap-2">
                  {["open", "pending", "closed"].map((s) => (
                    <button key={s} onClick={() => setReplyStatus(s)}
                      className={`rounded-md px-3 py-1.5 text-xs transition-colors border ${replyStatus === s
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
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
                        className={`rounded-md px-3 py-1.5 text-xs border transition-colors ${
                          (s === "https") === addNodeSsl
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ports per Server</label>
                <input type="number" min="1" placeholder="1" value={planPortCount} onChange={(e) => setPlanPortCount(e.target.value)}
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
                return <p className="text-xs text-muted-foreground">{p.description} · {p.memory ? `${p.memory} MB RAM` : "∞"} · {p.disk ? `${(p.disk/1024).toFixed(0)} GB` : "∞"} · {p.cpu ? `${p.cpu}% CPU` : "∞"} · {p.serverLimit ?? "∞"} servers</p>
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
              {assignAiUsersLoading ? (
                <p className="text-sm text-muted-foreground">Loading users…</p>
              ) : (
                <select
                  value={assignAiUserId}
                  onChange={(e) => setAssignAiUserId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">-- choose a user --</option>
                  {users.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.firstName} {u.lastName} ({u.email})
                    </option>
                  ))}
                </select>
              )}
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
              {viewUserDialog?.firstName} {viewUserDialog?.lastName}
              <span className="text-xs text-muted-foreground font-normal ml-1">#{viewUserDialog?.id}</span>
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
                <div><span className="text-muted-foreground">Email: </span><span className="text-foreground">{viewUserProfile.email}</span></div>
                <div><span className="text-muted-foreground">Role: </span><span className="text-foreground">{viewUserProfile.role || "user"}</span></div>
                <div><span className="text-muted-foreground">Tier: </span><span className="text-foreground">{viewUserProfile.portalType}</span></div>
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
                {viewUserProfile.address && <div className="col-span-2"><span className="text-muted-foreground">Address: </span><span className="text-foreground">{viewUserProfile.address}{viewUserProfile.address2 ? `, ${viewUserProfile.address2}` : ''}</span></div>}
                {viewUserProfile.billingCity && <div><span className="text-muted-foreground">City: </span><span className="text-foreground">{viewUserProfile.billingCity}</span></div>}
                {viewUserProfile.billingState && <div><span className="text-muted-foreground">State: </span><span className="text-foreground">{viewUserProfile.billingState}</span></div>}
                {viewUserProfile.billingCountry && <div><span className="text-muted-foreground">Country: </span><span className="text-foreground">{viewUserProfile.billingCountry}</span></div>}
                {viewUserProfile.billingCompany && <div><span className="text-muted-foreground">Company: </span><span className="text-foreground">{viewUserProfile.billingCompany}</span></div>}
                {viewUserProfile.phone && <div><span className="text-muted-foreground">Phone: </span><span className="text-foreground">{viewUserProfile.phone}</span></div>}
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

              {/* Suspend / Unsuspend */}
              <div className="flex justify-between items-center rounded-lg border border-border bg-secondary/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Account Status</p>
                  <p className="text-xs text-muted-foreground">{viewUserProfile.suspended ? "This account is currently suspended." : "This account is active."}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={viewUserProfile.suspended ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/30 text-destructive hover:bg-destructive/10"}
                  onClick={async () => {
                    if (!viewUserDialog) return
                    await toggleSuspend(viewUserDialog)
                    const updated = !viewUserProfile.suspended
                    setViewUserProfile((p: any) => ({ ...p, suspended: updated }))
                    setViewUserDialog((u) => u ? { ...u, suspended: updated } : u)
                  }}
                >
                  {viewUserProfile.suspended ? <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Unsuspend</> : <><Ban className="h-3.5 w-3.5 mr-1.5" />Suspend</>}
                </Button>
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
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  heartbeatDialogWindow === w
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
                  <p className={`text-xl font-bold ${
                    heartbeatDialogData.summary.uptime_pct >= 99 ? "text-green-400"
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
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 rounded" style={{background:'#22c55e'}} /> OK</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{background:'rgba(234,179,8,0.6)'}} /> Timeout</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{background:'rgba(239,68,68,0.6)'}} /> Error</span>
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
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  heartbeatDialogWindow === w
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
                  <p className={`text-xl font-bold ${
                    heartbeatDialogData.summary.uptime_pct >= 99 ? "text-green-400"
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