"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { PanelHeader } from "@/components/panel/header"
import { StatusBadge, StatCard } from "@/components/panel/shared"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
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
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("")
  const [globalAvgResponseMs, setGlobalAvgResponseMs] = useState<number | null>(null)
  const [globalAvgResponseSampleCount, setGlobalAvgResponseSampleCount] = useState<number>(0)

  const loadTickets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) {
        if (statusFilter === "archived") {
          params.set("status", "archived")
        } else {
          params.set("status", statusFilter)
        }
      }
      if (priorityFilter) params.set("priority", priorityFilter)
      if (departmentFilter) params.set("department", departmentFilter)
      params.set("includeAiTouched", "1")
      const includeReplied = statusFilter === "" || statusFilter === "replied"
      const includeClosed = statusFilter === "" || statusFilter === "closed"
      if (includeReplied) params.set("includeReplied", "1")
      if (includeClosed) params.set("includeClosed", "1")

      const url = `${API_ENDPOINTS.tickets}${params.toString() ? `?${params.toString()}` : ""}`
      const data = await apiFetch(url)
      setTickets(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("failed to load tickets", err)
    } finally {
      setLoading(false)
    }
  }

  const loadTicketStats = async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.ticketsStats)
      if (data && typeof data === 'object') {
        setGlobalAvgResponseMs(data.avgTicketResponseMs ?? null)
        setGlobalAvgResponseSampleCount(data.avgTicketResponseSampleCountLast30 ?? 0)
      }
    } catch (err) {
      console.error("failed to load ticket stats", err)
      setGlobalAvgResponseMs(null)
      setGlobalAvgResponseSampleCount(0)
    }
  }

  useEffect(() => {
    loadTickets()
    loadTicketStats()
  }, [statusFilter, priorityFilter, departmentFilter])

  function formatDurationMs(ms: number | null | undefined) {
    if (ms == null || !Number.isFinite(ms)) return "N/A"
    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`
    const totalMinutes = Math.floor(seconds / 60)
    if (totalMinutes < 60) {
      const remSeconds = Math.floor(seconds % 60)
      return remSeconds > 0 ? `${totalMinutes}m ${remSeconds}s` : `${totalMinutes}m`
    }
    const totalHours = Math.floor(totalMinutes / 60)
    if (totalHours < 24) {
      const remMinutes = totalMinutes % 60
      return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`
    }
    const days = Math.floor(totalHours / 24)
    const remHours = totalHours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }

  const filtered = tickets.filter(
    (t) =>
      t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      String(t.id).toLowerCase().includes(search.toLowerCase())
  )

  const openCount = tickets.filter((t) => !t.archived && t.status === "open").length
  const pendingCount = tickets.filter((t) => !t.archived && t.status === "pending").length


  return (
    <FeatureGuard feature="ticketing">
      <>
        <PanelHeader title="Support Tickets" description="Manage your support requests" />
      {user?.supportBanned && (
        <div className="mx-6 my-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          You are banned from creating or interacting with support tickets. Reason: {user?.supportBanReason || 'No reason provided'}. Contact contact@ecli.app to appeal.
        </div>
      )}
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Open Tickets" value={openCount} icon={AlertCircle} />
            <StatCard title="Pending Reply" value={pendingCount} icon={Clock} />
            <StatCard title="Total Tickets" value={tickets.length} icon={MessageSquare} />
            <StatCard
              title="Avg Response (30d)"
              value={formatDurationMs(globalAvgResponseMs)}
              icon={CheckCircle}
              subtitle={globalAvgResponseSampleCount > 0 ? `Based on ${globalAvgResponseSampleCount} samples` : 'No samples in 30d'}
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
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
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <option value="">All Status</option>
                <option value="opened">Open</option>
                <option value="awaiting_staff_reply">Awaiting Staff</option>
                <option value="replied">Replied</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <option value="">All Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <option value="">All Departments</option>
                <option value="Technical Support">Technical Support</option>
                <option value="Billing">Billing</option>
                <option value="Sales">Sales</option>
                <option value="Security">Security</option>
              </select>
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
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        {ticket.department && <span>Dept: {ticket.department}</span>}
                        {ticket.assignedTo && <span>Assigned: #{ticket.assignedTo}</span>}
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
  </FeatureGuard>
  )
}