"use client"

import { use, useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import Link from "next/link"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
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
  AlertCircle,  Info,  Loader2,
} from "lucide-react"

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-full break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function buildMessages(ticket: any) {
  if (Array.isArray(ticket?.messages) && ticket.messages.length) {
    return ticket.messages.map((m: any, idx: number) => ({
      id: `msg-${idx}`,
      sender: m.sender === 'staff' ? 'Support Team' : (m.sender === 'system' ? 'Information' : ticket.userName || 'You'),
      senderRole: m.sender === 'staff' ? 'staff' : (m.sender === 'system' ? 'system' : 'user'),
      ai: !!m.ai,
      content: m.message,
      timestamp: m.created || m.createdAt || ticket.created,
    }))
  }

  const msgs: { id: string; sender: string; senderRole: "user" | "staff" | "system"; content: string; timestamp: string }[] = []
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

  if (oldTicket.priority !== newTicket.priority) {
    changes.push({ icon: Tag, text: `Priority changed to ${newTicket.priority ?? 'unset'}` })
  }
  if (oldTicket.department !== newTicket.department) {
    changes.push({ icon: Info, text: `Department changed to ${newTicket.department ?? 'unset'}` })
  }
  if (!oldTicket.aiMarkedSpam && newTicket.aiMarkedSpam) {
    changes.push({ icon: AlertCircle, text: 'Ticket was marked as spam' })
  }
  if (!oldTicket.aiClosed && newTicket.aiClosed) {
    changes.push({ icon: CheckCircle, text: 'Ticket was closed by AI' })
  }
  if (oldTicket.status !== newTicket.status) {
    changes.push({ icon: Info, text: `Status changed to ${newTicket.status ?? 'unknown'}` })
  }

  return changes
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
  const [replyAs, setReplyAs] = useState<'staff' | 'user'>('user')
  const [replyPriority, setReplyPriority] = useState('medium')
  const [adminStatus, setAdminStatus] = useState('')
  const [adminPriority, setAdminPriority] = useState('')
  const [adminDepartment, setAdminDepartment] = useState('')
  const [adminAiDisabled, setAdminAiDisabled] = useState(false)
  const [adminAiTouched, setAdminAiTouched] = useState(false)
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevTicketRef = useRef<any>(null)

  useEffect(() => {
    const loadTicket = async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id))
        const diff = getTicketChangeNotifications(prevTicketRef.current, data)
        if (diff.length > 0) {
          setChangeNotifications((prev) => [...prev, ...diff])
        }
        prevTicketRef.current = data
        setTicket(data)
        setMessages(buildMessages(data))
        setReplyPriority(data?.priority || 'medium')
        setAdminStatus(data?.status || '')
        setAdminPriority(data?.priority || 'medium')
        setAdminDepartment(data?.department || '')
        setAdminAiDisabled(Boolean(data?.aiDisabled))
        setAdminAiTouched(Boolean(data?.aiTouched))
        if (isAdmin) {
          setReplyAs(data?.userId === user?.id ? 'user' : 'staff')
        }
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
        if (diff.length > 0) {
          setChangeNotifications((prev) => [...prev, ...diff])
        }

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
      if (diff.length > 0) {
        setChangeNotifications((prev) => [...prev, ...diff])
      }
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
      setChangeNotifications((prev) => [...prev, { icon: Info, text: 'Admin ticket settings updated' }])
    } catch (e: any) {
      alert("Failed to save admin settings: " + e.message)
    } finally {
      setSavingAdmin(false)
    }
  }

  const deleteTicket = async () => {
    if (!ticket || !isAdmin) return
    if (!confirm('Delete this ticket permanently?')) return
    setDeleting(true)
    try {
      await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), { method: "DELETE" })
      window.location.href = '/dashboard/tickets'
    } catch (e: any) {
      alert("Failed to delete: " + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "border-destructive/30 bg-destructive/10 text-destructive"
      case "high": return "border-warning/30 bg-warning/10 text-warning"
      case "medium": return "border-info/30 bg-info/10 text-info"
      default: return "border-border bg-secondary/50 text-muted-foreground"
    }
  }

  if (loading) return (
    <div className="flex h-full flex-1 flex-col">
      <PanelHeader title="Ticket" />
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    </div>
  )

  if (error || !ticket) return (
    <div className="flex h-full flex-1 flex-col">
      <PanelHeader title="Ticket" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">{error || "Ticket not found"}</p>
        <Link href="/dashboard/tickets" className="text-sm text-primary hover:underline">â† Back to tickets</Link>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-1">
      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border px-6 py-4">
          <Link
            href="/dashboard/tickets"
            className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">#{ticket.id}</span>
              <StatusBadge status={ticket.status} />
              <Badge variant="outline" className={priorityColor(ticket.priority)}>
                {ticket.priority}
              </Badge>
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">{ticket.subject}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {ticket.department && <span>Dept: {ticket.department}</span>}
              {ticket.assignedTo && <span>Assigned: #{ticket.assignedTo}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-secondary">
              Open in new tab
            </a>
            {ticket.status !== "closed" ? (
              <button
                onClick={() => setStatus("closed")}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                <XCircle className="h-3.5 w-3.5" /> Close Ticket
              </button>
            ) : (
              <button
                onClick={() => setStatus("open")}
                className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-xs font-medium text-success hover:bg-success/20"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Reopen
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-2 max-w-3xl mx-auto">
            {changeNotifications.map((n, idx) => (
              <div key={`cn-${idx}`} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                <n.icon className="h-3 w-3" />
                {n.text}
              </div>
            ))}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  msg.senderRole === "staff" ? "border-primary/30 bg-primary/10" : (msg.senderRole === "system" ? "border-border bg-muted/10" : "border-border bg-secondary")
                }`}>
                  {msg.senderRole === "staff" ? (
                    <Shield className="h-3.5 w-3.5 text-primary" />
                  ) : msg.senderRole === "system" ? (
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{msg.sender}</span>
                    {msg.senderRole === "staff" && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Staff</Badge>
                    )}
                    {msg.senderRole === "system" && (
                      <Badge className="bg-muted/10 text-muted-foreground border-border text-[10px]">System</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className={`rounded-xl p-4 text-sm leading-relaxed ${
                    msg.senderRole === "staff"
                      ? "border border-primary/20 bg-primary/5 text-foreground"
                      : "border border-border bg-card text-foreground"
                  }`}>
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply Composer */}
        {ticket.status !== "closed" ? (
          <div className="border-t border-border bg-card/50 p-4">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend() }}
                  placeholder={isAdmin ? "Write your staff reply..." : "Add more information..."}
                  rows={3}
                  className="w-full bg-transparent p-4 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
                />
                {isAdmin && (
                  <div className="flex items-center justify-between border-t border-border px-4 py-2 gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground">Post as</label>
                      <select value={replyAs} onChange={(e) => setReplyAs(e.target.value as any)}
                        className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50">
                        <option value="staff">Staff</option>
                        <option value="user">User</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground">Priority</label>
                      <select value={replyPriority} onChange={(e) => setReplyPriority(e.target.value)}
                        className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border px-4 py-2">
                  <span className="text-xs text-muted-foreground">Ctrl+Enter to send</span>
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {isAdmin ? "Send Reply" : "Add Info"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-border bg-card/50 p-4">
            <p className="text-center text-sm text-muted-foreground">
              This ticket is closed. Reopen it to continue the conversation.
            </p>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="hidden w-64 border-l border-border bg-card/50 p-5 lg:block">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Ticket Details</h3>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Tag className="h-3 w-3" /> Status
            </div>
            <StatusBadge status={ticket.status} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <AlertCircle className="h-3 w-3" /> Priority
            </div>
            <Badge variant="outline" className={priorityColor(ticket.priority) + " text-xs"}>
              {ticket.priority}
            </Badge>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" /> Created
            </div>
            <p className="text-sm text-foreground">{new Date(ticket.created).toLocaleDateString()}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3 w-3" /> Last Updated
            </div>
            <p className="text-sm text-foreground">{new Date(ticket.updatedAt || ticket.created).toLocaleString()}</p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground mb-1">Messages</p>
            <p className="text-lg font-semibold text-foreground">{messages.length}</p>
          </div>
          {isAdmin && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Admin actions</p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Status</label>
                <select value={adminStatus} onChange={(e) => setAdminStatus(e.target.value)} className="w-full rounded-lg border border-border bg-card px-2 py-1 text-sm">
                  <option value="opened">Open</option>
                  <option value="awaiting_staff_reply">Awaiting Staff</option>
                  <option value="replied">Replied</option>
                  <option value="closed">Closed</option>
                </select>

                <label className="text-xs text-muted-foreground">Priority</label>
                <select value={adminPriority} onChange={(e) => setAdminPriority(e.target.value)} className="w-full rounded-lg border border-border bg-card px-2 py-1 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>

                <label className="text-xs text-muted-foreground">Department</label>
                <select value={adminDepartment || ""} onChange={(e) => setAdminDepartment(e.target.value)} className="w-full rounded-lg border border-border bg-card px-2 py-1 text-sm">
                  <option value="">(none)</option>
                  <option value="Technical Support">Technical Support</option>
                  <option value="Billing">Billing</option>
                  <option value="Sales">Sales</option>
                  <option value="Security">Security</option>
                </select>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={adminAiDisabled} onChange={(e) => setAdminAiDisabled(e.target.checked)} />
                  Disable AI responses
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={adminAiTouched} onChange={(e) => setAdminAiTouched(e.target.checked)} />
                  Mark AI touched
                </div>

                {/* Ban user from support */}
                <div className="border-t border-border pt-3">
                  <label className="text-xs text-muted-foreground">Ban user from support</label>
                  <div className="mt-2 flex gap-2">
                    <button onClick={async () => {
                      const confirmed = confirm('Ban this user from support? This will prevent them from creating tickets.');
                      if (!confirmed) return;
                      const reason = prompt('Reason for ban (optional):') || '';
                      try {
                        await apiFetch(`/api/admin/users/${ticket.userId}`, { method: 'PUT', body: JSON.stringify({ supportBanned: true, supportBanReason: reason }) });
                        alert('User banned from support');
                      } catch (e: any) { alert('Failed to ban: ' + e.message) }
                    }} className="flex-1 rounded-lg border border-destructive px-3 py-2 text-xs text-destructive hover:bg-destructive/10">Ban</button>
                    <button onClick={async () => {
                      const confirmed = confirm('Unban this user from support?');
                      if (!confirmed) return;
                      try {
                        await apiFetch(`/api/admin/users/${ticket.userId}`, { method: 'PUT', body: JSON.stringify({ supportBanned: false, supportBanReason: null }) });
                        alert('User unbanned');
                      } catch (e: any) { alert('Failed to unban: ' + e.message) }
                    }} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">Unban</button>
                  </div>
                </div>

                <button onClick={saveAdminChanges} disabled={savingAdmin} className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {savingAdmin ? 'Saving...' : 'Save admin changes'}
                </button>
                <button onClick={deleteTicket} disabled={deleting} className="w-full rounded-lg border border-destructive text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Delete ticket'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
