"use client"

import { use, useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/panel/shared"
import { PanelHeader } from "@/components/panel/header"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import {
  ArrowLeft,
  Send,
  User,
  Shield,
  Clock,
  Tag,
  XCircle,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  MoreVertical,
  ChevronDown,
  Settings2,
  Trash2,
  Ban,
  UserCheck,
  Bot,
  BotOff,
  Building2,
  MessageSquare,
} from "lucide-react"

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-full break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function buildMessages(ticket: any) {
  if (Array.isArray(ticket?.messages) && ticket.messages.length) {
    return ticket.messages.map((m: any, idx: number) => ({
      id: `msg-${idx}`,
      sender: m.sender === "staff" ? "Support Team" : m.sender === "system" ? "Information" : ticket.userName || "You",
      senderRole: m.sender === "staff" ? "staff" : m.sender === "system" ? "system" : "user",
      ai: !!m.ai,
      content: m.message,
      timestamp: m.created || m.createdAt || ticket.created,
    }))
  }

  const msgs: { id: string; sender: string; senderRole: "user" | "staff" | "system"; ai?: boolean; content: string; timestamp: string }[] = []
  if (ticket?.message) {
    msgs.push({ id: "msg-initial", sender: ticket.userName || "You", senderRole: "user", content: ticket.message, timestamp: ticket.created })
  }
  if (ticket?.adminReply) {
    msgs.push({ id: "msg-reply", sender: "Support Team", senderRole: "staff", content: ticket.adminReply, timestamp: ticket.updatedAt || ticket.created })
  }
  return msgs
}

function getTicketChangeNotifications(oldTicket: any, newTicket: any) {
  const changes: Array<{ icon: any; text: string }> = []
  if (!oldTicket || !newTicket) return changes
  if (oldTicket.priority !== newTicket.priority) changes.push({ icon: Tag, text: `Priority changed to ${newTicket.priority ?? "unset"}` })
  if (oldTicket.department !== newTicket.department) changes.push({ icon: Info, text: `Department changed to ${newTicket.department ?? "unset"}` })
  if (!oldTicket.aiMarkedSpam && newTicket.aiMarkedSpam) changes.push({ icon: AlertCircle, text: "Ticket was marked as spam" })
  if (!oldTicket.aiClosed && newTicket.aiClosed) changes.push({ icon: CheckCircle, text: "Ticket was closed by AI" })
  if (oldTicket.status !== newTicket.status) changes.push({ icon: Info, text: `Status changed to ${newTicket.status ?? "unknown"}` })
  return changes
}

function TimeAgo({ date }: { date: string }) {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let timeAgo: string
  if (diffMins < 1) timeAgo = "just now"
  else if (diffMins < 60) timeAgo = `${diffMins}m ago`
  else if (diffHours < 24) timeAgo = `${diffHours}h ago`
  else timeAgo = `${diffDays}d ago`

  return (
    <span title={d.toLocaleString()} className="cursor-help">
      {timeAgo}
    </span>
  )
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const isAdmin = user?.role === "admin" || user?.role === "rootAdmin" || user?.role === "*"

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [changeNotifications, setChangeNotifications] = useState<Array<{ icon: any; text: string }>>([])
  const [reply, setReply] = useState("")
  const [replyAs, setReplyAs] = useState<"staff" | "user">("user")
  const [replyPriority, setReplyPriority] = useState("medium")
  const [adminStatus, setAdminStatus] = useState("")
  const [adminPriority, setAdminPriority] = useState("")
  const [adminDepartment, setAdminDepartment] = useState("")
  const [adminAiDisabled, setAdminAiDisabled] = useState(false)
  const [adminAiTouched, setAdminAiTouched] = useState(false)
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState(false)
  const [showMobileDetails, setShowMobileDetails] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevTicketRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const loadTicket = async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id))
        const diff = getTicketChangeNotifications(prevTicketRef.current, data)
        if (diff.length > 0) setChangeNotifications((prev) => [...prev, ...diff])
        prevTicketRef.current = data
        setTicket(data)
        setMessages(buildMessages(data))
        setReplyPriority(data?.priority || "medium")
        setAdminStatus(data?.status || "")
        setAdminPriority(data?.priority || "medium")
        setAdminDepartment(data?.department || "")
        setAdminAiDisabled(Boolean(data?.aiDisabled))
        setAdminAiTouched(Boolean(data?.aiTouched))
        if (isAdmin) setReplyAs(data?.userId === user?.id ? "user" : "staff")
      } catch (e: any) {
        setError(e.message || "Failed to load ticket")
      } finally {
        setLoading(false)
      }
    }

    loadTicket()

    const pollId = setInterval(async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id))
        if (!data) return
        const diff = getTicketChangeNotifications(prevTicketRef.current, data)
        if (diff.length > 0) setChangeNotifications((prev) => [...prev, ...diff])
        prevTicketRef.current = data
        setTicket(data)
        setMessages(buildMessages(data))
      } catch {
        // ignore poll errors
      }
    }, 7000)

    return () => clearInterval(pollId)
  }, [id, isAdmin, user?.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleSend = async () => {
    if (!reply.trim() || !ticket) return
    setSending(true)
    try {
      const updated = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify({
          reply: reply.trim(),
          replyAs,
          status: ticket.status,
          ...(isAdmin ? { priority: replyPriority } : {}),
        }),
      })
      const diff = getTicketChangeNotifications(prevTicketRef.current, updated)
      if (diff.length > 0) setChangeNotifications((prev) => [...prev, ...diff])
      prevTicketRef.current = updated
      setTicket(updated)
      setMessages(buildMessages(updated))
      setReply("")
    } catch (e: any) {
      alert("Failed to send: " + e.message)
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (newStatus: string) => {
    if (!ticket) return
    try {
      const updated = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      })
      setTicket(updated)
      setMessages(buildMessages(updated))
      setAdminStatus(updated.status)
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const saveAdminChanges = async () => {
    if (!ticket || !isAdmin) return
    setSavingAdmin(true)
    try {
      const updated = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify({
          status: adminStatus,
          priority: adminPriority,
          department: adminDepartment || null,
          aiDisabled: adminAiDisabled,
          aiTouched: adminAiTouched,
        }),
      })
      setTicket(updated)
      setMessages(buildMessages(updated))
      setChangeNotifications((prev) => [...prev, { icon: Info, text: "Admin ticket settings updated" }])
      setShowAdminPanel(false)
    } catch (e: any) {
      alert("Failed to save admin settings: " + e.message)
    } finally {
      setSavingAdmin(false)
    }
  }

  const deleteTicket = async () => {
    if (!ticket || !isAdmin) return
    if (!confirm("Delete this ticket permanently?")) return
    setDeleting(true)
    try {
      await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), { method: "DELETE" })
      window.location.href = "/dashboard/tickets"
    } catch (e: any) {
      alert("Failed to delete: " + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent":
        return "border-red-500/30 bg-red-500/10 text-red-400"
      case "high":
        return "border-orange-500/30 bg-orange-500/10 text-orange-400"
      case "medium":
        return "border-blue-500/30 bg-blue-500/10 text-blue-400"
      default:
        return "border-border bg-secondary/50 text-muted-foreground"
    }
  }

  const priorityDot = (p: string) => {
    switch (p) {
      case "urgent":
        return "bg-red-400"
      case "high":
        return "bg-orange-400"
      case "medium":
        return "bg-blue-400"
      default:
        return "bg-muted-foreground"
    }
  }

  if (loading)
    return (
      <div className="flex h-full flex-1 flex-col">
        <PanelHeader title="Ticket" />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading ticket…</p>
          </div>
        </div>
      </div>
    )

  if (error || !ticket)
    return (
      <div className="flex h-full flex-1 flex-col">
        <PanelHeader title="Ticket" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="h-8 w-8 text-destructive/50" />
          </div>
          <p className="text-sm text-muted-foreground">{error || "Ticket not found"}</p>
          <Link href="/dashboard/tickets" className="text-sm text-primary hover:underline flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to tickets
          </Link>
        </div>
      </div>
    )

  const isClosed = ticket.status === "closed"

  // Sidebar content
  const TicketDetailsContent = () => (
    <div className="flex flex-col gap-5">
      {/* Quick Info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Status</p>
          <StatusBadge status={ticket.status} />
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Priority</p>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${priorityDot(ticket.priority)}`} />
            <span className="text-sm font-medium text-foreground capitalize">{ticket.priority}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Created</p>
          <p className="text-sm text-foreground">
            <TimeAgo date={ticket.created} />
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(ticket.created).toLocaleDateString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Messages</p>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{messages.length}</span>
          </div>
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex flex-col gap-2">
        {ticket.department && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              Department
            </div>
            <span className="text-xs font-medium text-foreground">{ticket.department}</span>
          </div>
        )}
        {ticket.assignedTo && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              Assigned
            </div>
            <span className="text-xs font-medium text-foreground font-mono">#{ticket.assignedTo}</span>
          </div>
        )}
        {ticket.updatedAt && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Updated
            </div>
            <span className="text-xs text-foreground">
              <TimeAgo date={ticket.updatedAt} />
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</p>
        {!isClosed ? (
          <button
            onClick={() => {
              setStatus("closed")
              setShowMobileDetails(false)
            }}
            className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors w-full"
          >
            <XCircle className="h-4 w-4" />
            Close Ticket
          </button>
        ) : (
          <button
            onClick={() => {
              setStatus("open")
              setShowMobileDetails(false)
            }}
            className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400 hover:bg-green-500/20 transition-colors w-full"
          >
            <CheckCircle className="h-4 w-4" />
            Reopen Ticket
          </button>
        )}
      </div>
    </div>
  )

  // Admin panel content (shared)
  const AdminPanelContent = () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</label>
          <select
            value={adminStatus}
            onChange={(e) => setAdminStatus(e.target.value)}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-colors"
          >
            <option value="opened">Open</option>
            <option value="awaiting_staff_reply">Awaiting Staff</option>
            <option value="replied">Replied</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
          <select
            value={adminPriority}
            onChange={(e) => setAdminPriority(e.target.value)}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-colors"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Department</label>
        <select
          value={adminDepartment || ""}
          onChange={(e) => setAdminDepartment(e.target.value)}
          className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-colors"
        >
          <option value="">(none)</option>
          <option value="Technical Support">Technical Support</option>
          <option value="Billing">Billing</option>
          <option value="Sales">Sales</option>
          <option value="Security">Security</option>
        </select>
      </div>

      {/* AI Toggles */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Settings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setAdminAiDisabled(!adminAiDisabled)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${adminAiDisabled
                ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              }`}
          >
            {adminAiDisabled ? <BotOff className="h-4 w-4 shrink-0" /> : <Bot className="h-4 w-4 shrink-0" />}
            <div>
              <p className="text-xs font-medium">AI Responses</p>
              <p className="text-[10px] opacity-70">{adminAiDisabled ? "Disabled" : "Enabled"}</p>
            </div>
          </button>
          <button
            onClick={() => setAdminAiTouched(!adminAiTouched)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${adminAiTouched
                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              }`}
          >
            <Bot className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-medium">AI Touched</p>
              <p className="text-[10px] opacity-70">{adminAiTouched ? "Yes" : "No"}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Save */}
      <Button onClick={saveAdminChanges} disabled={savingAdmin} className="w-full bg-primary text-primary-foreground" size="sm">
        {savingAdmin ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Saving…
          </>
        ) : (
          "Save Changes"
        )}
      </Button>

      {/* Danger Zone */}
      <div className="border-t border-border pt-4">
        <p className="text-[10px] font-medium text-red-400 uppercase tracking-wider mb-3">Danger Zone</p>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                if (!confirm("Ban this user from support?")) return
                const reason = prompt("Reason for ban (optional):") || ""
                try {
                  await apiFetch(`/api/admin/users/${ticket.userId}`, {
                    method: "PUT",
                    body: JSON.stringify({ supportBanned: true, supportBanReason: reason }),
                  })
                  alert("User banned from support")
                } catch (e: any) {
                  alert("Failed to ban: " + e.message)
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" />
              Ban User
            </button>
            <button
              onClick={async () => {
                if (!confirm("Unban this user from support?")) return
                try {
                  await apiFetch(`/api/admin/users/${ticket.userId}`, {
                    method: "PUT",
                    body: JSON.stringify({ supportBanned: false, supportBanReason: null }),
                  })
                  alert("User unbanned")
                } catch (e: any) {
                  alert("Failed to unban: " + e.message)
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Unban User
            </button>
          </div>
          <button
            onClick={deleteTicket}
            disabled={deleting}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {deleting ? "Deleting…" : "Delete Ticket"}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-1 flex-col lg:flex-row">
      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/dashboard/tickets"
            className="mt-1 rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-snug line-clamp-2">{ticket.subject}</h1>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">#{ticket.id}</span>
              <StatusBadge status={ticket.status} />
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${priorityDot(ticket.priority)}`} />
                <span className="text-[11px] text-muted-foreground capitalize">{ticket.priority}</span>
              </div>
              {ticket.department && (
                <span className="text-[11px] text-muted-foreground hidden sm:inline">· {ticket.department}</span>
              )}
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-1.5 shrink-0 mt-1">
            {/* Desktop close/reopen */}
            <div className="hidden sm:flex items-center gap-1.5">
              {!isClosed ? (
                <button
                  onClick={() => setStatus("closed")}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Close
                </button>
              ) : (
                <button
                  onClick={() => setStatus("open")}
                  className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Reopen
                </button>
              )}
            </div>

            {/* Admin gear - desktop */}
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`hidden lg:flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${showAdminPanel
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Admin
              </button>
            )}

            {/* Mobile details button */}
            <button
              onClick={() => setShowMobileDetails(!showMobileDetails)}
              className="lg:hidden rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile details drawer */}
        {showMobileDetails && (
          <div className="lg:hidden border-b border-border bg-card/50 animate-in slide-in-from-top-2 duration-200">
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Ticket Details</h3>
                <button
                  onClick={() => setShowMobileDetails(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              <TicketDetailsContent />

              {/* Admin panel in mobile */}
              {isAdmin && (
                <div className="mt-5 pt-5 border-t border-border">
                  <button
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="flex items-center justify-between w-full mb-3"
                  >
                    <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-primary" />
                      Admin Settings
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAdminPanel ? "rotate-180" : ""}`} />
                  </button>
                  {showAdminPanel && <AdminPanelContent />}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desktop Admin Panel (inline collapsible) */}
        {isAdmin && showAdminPanel && (
          <div className="hidden lg:block border-b border-border bg-card/30 animate-in slide-in-from-top-2 duration-200">
            <div className="max-w-3xl mx-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Admin Settings
                </h3>
                <button
                  onClick={() => setShowAdminPanel(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
              <AdminPanelContent />
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col justify-start min-h-full max-w-3xl mx-auto p-4 sm:p-6">
            {/* Change notifications */}
            {changeNotifications.length > 0 && (
              <div className="flex flex-col gap-1 mb-3">
                {changeNotifications.map((n, idx) => (
                  <div
                    key={`cn-${idx}`}
                    className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-1.5 text-[11px] text-muted-foreground"
                  >
                    <n.icon className="h-3 w-3 shrink-0" />
                    <span>{n.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, idx) => {
              const isStaff = msg.senderRole === "staff"
              const isSystem = msg.senderRole === "system"
              const isUser = msg.senderRole === "user"
              const showAvatar = idx === 0 || messages[idx - 1]?.senderRole !== msg.senderRole
              const showTimestamp = idx === 0 || messages[idx - 1]?.senderRole !== msg.senderRole

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="flex items-center gap-2 rounded-full bg-secondary/40 border border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground max-w-[90%]">
                      <Info className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">{msg.content}</span>
                    </div>
                  </div>
                )
              }

              return (
                <div key={msg.id} className={`flex gap-2.5 sm:gap-3 ${isStaff ? "" : "flex-row-reverse"} ${showAvatar ? "mt-4" : "mt-0.5"}`}>
                  {/* Avatar */}
                  {showAvatar ? (
                    <div
                      className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border ${isStaff ? "border-primary/30 bg-primary/10" : "border-border bg-secondary"
                        }`}
                    >
                      {isStaff ? <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" /> : <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />}
                    </div>
                  ) : (
                    <div className="w-7 sm:w-8 shrink-0" />
                  )}

                  {/* Message content */}
                  <div className={`flex flex-col ${isStaff ? "items-start" : "items-end"} flex-1 min-w-0 max-w-[85%] sm:max-w-[80%]`}>
                    {showTimestamp && (
                      <div className={`flex items-center gap-1.5 mb-1 ${isStaff ? "" : "flex-row-reverse"}`}>
                        <span className="text-xs font-medium text-foreground">{msg.sender}</span>
                        {isStaff && <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] px-1.5 py-0">Staff</Badge>}
                        {msg.ai && <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[9px] px-1.5 py-0">AI</Badge>}
                        <span className="text-[10px] text-muted-foreground">
                          <TimeAgo date={msg.timestamp} />
                        </span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed w-fit ${isStaff
                          ? "rounded-tl-md border border-primary/20 bg-primary/5 text-foreground"
                          : "rounded-tr-md border border-border bg-card text-foreground"
                        }`}
                    >
                      <MarkdownContent content={msg.content} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Reply Composer */}
        {!isClosed ? (
          <div className="border-t border-border bg-card/50 p-3 sm:p-4">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-xl border border-border bg-card overflow-hidden focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all">
                <textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend()
                  }}
                  placeholder={isAdmin ? "Write your staff reply…" : "Add more information…"}
                  rows={2}
                  className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
                />

                {/* Composer footer */}
                <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Admin: reply-as toggle */}
                    {isAdmin && (
                      <button
                        onClick={() => setReplyAs(replyAs === "staff" ? "user" : "staff")}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${replyAs === "staff"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-secondary/50 text-muted-foreground"
                          }`}
                      >
                        {replyAs === "staff" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        <span className="hidden sm:inline">{replyAs === "staff" ? "Staff" : "User"}</span>
                      </button>
                    )}

                    {/* Admin: priority selector */}
                    {isAdmin && (
                      <select
                        value={replyPriority}
                        onChange={(e) => setReplyPriority(e.target.value)}
                        className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] text-foreground outline-none cursor-pointer hover:border-primary/30 transition-colors"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    )}

                    <span className="text-[10px] text-muted-foreground hidden sm:inline">⌘+Enter to send</span>
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{isAdmin ? "Send Reply" : "Send"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-border bg-card/50 p-3 sm:p-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-border py-3">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">This ticket is closed.</p>
                <button
                  onClick={() => setStatus("open")}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-72 flex-col border-l border-border bg-card/30 overflow-y-auto">
        <div className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Ticket Details</h3>
          <TicketDetailsContent />
        </div>
      </div>
    </div>
  )
}