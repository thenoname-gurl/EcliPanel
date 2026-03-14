"use client"

import { use, useState, useEffect, useRef } from "react"
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
  AlertCircle,
  Loader2,
} from "lucide-react"

function buildMessages(ticket: any) {
  const msgs: { id: string; sender: string; senderRole: "user" | "staff"; content: string; timestamp: string }[] = []
  if (ticket?.message) {
    msgs.push({ id: "msg-initial", sender: ticket.userName || "You", senderRole: "user", content: ticket.message, timestamp: ticket.created })
  }
  if (ticket?.adminReply) {
    msgs.push({ id: "msg-reply", sender: "Support Team", senderRole: "staff", content: ticket.adminReply, timestamp: ticket.updatedAt || ticket.created })
  }
  return msgs
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const isAdmin = user?.role === "admin" || user?.role === "rootAdmin" || user?.role === "*"

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id))
      .then((data) => {
        setTicket(data)
        setMessages(buildMessages(data))
      })
      .catch((e) => setError(e.message || "Failed to load ticket"))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleSend = async () => {
    if (!reply.trim() || !ticket) return
    setSending(true)
    try {
      const updatePayload = isAdmin
        ? { adminReply: reply.trim(), status: ticket.status }
        : { message: ticket.message + "\n\n---\n" + reply.trim() }
      const updated = await apiFetch(API_ENDPOINTS.ticketDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify(updatePayload),
      })
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
    } catch (e: any) {
      alert("Failed: " + e.message)
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
          </div>
          <div className="flex items-center gap-2">
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
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  msg.senderRole === "staff" ? "border-primary/30 bg-primary/10" : "border-border bg-secondary"
                }`}>
                  {msg.senderRole === "staff" ? (
                    <Shield className="h-3.5 w-3.5 text-primary" />
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
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className={`rounded-xl p-4 text-sm leading-relaxed ${
                    msg.senderRole === "staff"
                      ? "border border-primary/20 bg-primary/5 text-foreground"
                      : "border border-border bg-card text-foreground"
                  }`}>
                    {msg.content.split("\n").map((line: string, i: number) => (
                      <span key={i}>{line}{i < msg.content.split("\n").length - 1 && <br />}</span>
                    ))}
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
        </div>
      </div>
    </div>
  )
}
