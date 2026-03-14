"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { PanelHeader } from "@/components/panel/header"
import { StatusBadge, StatCard } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Plus,
  Search,
  MessageSquare,
  Clock,
  AlertCircle,
  CheckCircle,
  Filter,
  ChevronRight,
} from "lucide-react"

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    apiFetch(API_ENDPOINTS.tickets)
      .then((data) => setTickets(Array.isArray(data) ? data : []))
      .catch((err) => console.error("failed to load tickets", err))
      .finally(() => setLoading(false))
  }, [])

  const filtered = tickets.filter(
    (t) =>
      t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      String(t.id).toLowerCase().includes(search.toLowerCase())
  )

  const openCount = tickets.filter((t) => t.status === "open").length
  const pendingCount = tickets.filter((t) => t.status === "pending").length

  return (
    <>
      <PanelHeader title="Support Tickets" description="Manage your support requests" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Open Tickets" value={openCount} icon={AlertCircle} />
            <StatCard title="Pending Reply" value={pendingCount} icon={Clock} />
            <StatCard title="Total Tickets" value={tickets.length} icon={MessageSquare} />
            <StatCard title="Avg Response" value="N/A" icon={CheckCircle} subtitle="Last 30 days" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-48"
                />
              </div>
              <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors">
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
            <Link
              href="/dashboard/tickets/new"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Ticket
            </Link>
          </div>

          {/* Tickets List */}
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-10">Loading tickets...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              {search ? "No tickets match your search." : "You have no support tickets yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/tickets/${ticket.id}`}
                  className="group rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {ticket.id}
                        </span>
                        <StatusBadge status={ticket.status} />
                        {ticket.priority && (
                          <Badge
                            variant="outline"
                            className={
                              ticket.priority === "urgent"
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : ticket.priority === "high"
                                  ? "border-warning/30 bg-warning/10 text-warning"
                                  : ticket.priority === "medium"
                                    ? "border-info/30 bg-info/10 text-info"
                                    : "border-border bg-secondary/50 text-muted-foreground"
                            }
                          >
                            {ticket.priority}
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-2 font-medium text-foreground group-hover:text-primary transition-colors">
                        {ticket.subject}
                      </h3>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        {ticket.created && <span>Created: {new Date(ticket.created).toLocaleDateString()}</span>}
                        {ticket.lastReply && <span>Last reply: {new Date(ticket.lastReply).toLocaleString()}</span>}
                        {ticket.updatedAt && !ticket.lastReply && <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}