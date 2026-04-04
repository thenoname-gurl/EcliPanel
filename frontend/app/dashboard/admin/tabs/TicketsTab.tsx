"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import SearchableUserSelect from "@/components/SearchableUserSelect"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Folder,
  MessageSquare,
  RefreshCw,
  Search,
  UserCog,
  X,
} from "lucide-react"

export default function TicketsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminTicketsTab")
  const {
    setTicketFilterAndReload,
    ticketFilter,
    forceRefreshTab,
    ticketSearch,
    setTicketSearch,
    fetchTickets,
    ticketPriorityFilter,
    setTicketPriorityFilter,
    showAiTouched,
    setShowAiTouched,
    setTicketFilter,
    selectedTicketIds,
    setSelectedTicketIds,
    tickets,
    filteredTickets,
    redactName,
    redact,
    priorityColor,
    ticketStatusColor,
    openReply,
    ticketsTotal,
    ticketsPage,
    TICKETS_PER,
    replyTicket,
    setReplyTicket,
    replyText,
    setReplyText,
    replyAs,
    setReplyAs,
    replyPriority,
    setReplyPriority,
    replyDepartment,
    setReplyDepartment,
    replyAssignedTo,
    setReplyAssignedTo,
    staffUsers,
    staffLoading,
    replyStatus,
    setReplyStatus,
    submitReply,
    replyLoading,
  } = ctx

  const statusLabels: Record<string, string> = {
    opened: t("status.opened"),
    awaiting_staff_reply: t("status.awaitingStaffReply"),
    replied: t("status.replied"),
    closed: t("status.closed"),
    archived: t("status.archived"),
  }

  const filterLabels: Record<string, string> = {
    all: t("filters.all"),
    opened: t("filters.open"),
    awaiting_staff_reply: t("filters.awaitingReply"),
    replied: t("filters.replied"),
    closed: t("filters.closed"),
    archived: t("filters.archived"),
  }

  const priorityLabels: Record<string, string> = {
    any: t("priority.any"),
    urgent: t("priority.urgent"),
    high: t("priority.high"),
    medium: t("priority.medium"),
    low: t("priority.low"),
  }

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 p-2 sm:p-3">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {["all", "opened", "awaiting_staff_reply", "replied", "closed", "archived"].map((f) => {
              const counts: Record<string, string> = { awaiting_staff_reply: "!" }
              return (
                <button
                  key={f}
                  onClick={() => setTicketFilterAndReload(f)}
                  className={`relative rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${ticketFilter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  {filterLabels[f] || f}
                  {counts[f] && ticketFilter !== f && (
                    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive/20 text-[10px] font-bold text-destructive">
                      {counts[f]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <button onClick={() => forceRefreshTab("tickets")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0" title={t("actions.refresh")}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder={t("search.placeholder")}
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchTickets(1, ticketSearch, ticketPriorityFilter)}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {ticketSearch && (
                  <button
                    onClick={() => {
                      setTicketSearch("")
                      fetchTickets(1, "", ticketPriorityFilter)
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select onValueChange={(v) => setTicketPriorityFilter(v)} value={ticketPriorityFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs border-border">
                  <SelectValue placeholder={t("priority.label")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("priority.any")}</SelectItem>
                  <SelectItem value="urgent">{t("priority.urgent")}</SelectItem>
                  <SelectItem value="high">{t("priority.high")}</SelectItem>
                  <SelectItem value="medium">{t("priority.medium")}</SelectItem>
                  <SelectItem value="low">{t("priority.low")}</SelectItem>
                </SelectContent>
              </Select>

              <label className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-secondary transition-colors">
                <input type="checkbox" checked={showAiTouched} onChange={(e) => setShowAiTouched(e.target.checked)} className="rounded border-border" />
                <span className="whitespace-nowrap">{t("filters.aiHandled")}</span>
              </label>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTicketSearch("")
                  setTicketPriorityFilter("any")
                  setShowAiTouched(false)
                  setTicketFilter("all")
                  fetchTickets(1, "", "any")
                }}
                className="h-8 text-xs text-muted-foreground"
              >
                {t("actions.reset")}
              </Button>
            </div>
          </div>

          {selectedTicketIds.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">{t("selection.selected", { count: selectedTicketIds.length })}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1"
                  onClick={async () => {
                    if (!window.confirm(t("selection.confirmArchive", { count: selectedTicketIds.length }))) return
                    await apiFetch(API_ENDPOINTS.adminTicketsBulkArchive, { method: "POST", body: JSON.stringify({ ids: selectedTicketIds, archived: true }) })
                    fetchTickets(1, ticketSearch, ticketPriorityFilter)
                  }}
                >
                  <Archive className="h-3 w-3" />
                  {t("actions.archive")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1"
                  onClick={async () => {
                    if (!window.confirm(t("selection.confirmUnarchive", { count: selectedTicketIds.length }))) return
                    await apiFetch(API_ENDPOINTS.adminTicketsBulkArchive, { method: "POST", body: JSON.stringify({ ids: selectedTicketIds, archived: false }) })
                    fetchTickets(1, ticketSearch, ticketPriorityFilter)
                  }}
                >
                  <ArchiveRestore className="h-3 w-3" />
                  {t("actions.unarchive")}
                </Button>
                <button onClick={() => setSelectedTicketIds([])} className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
                      if (e.target.checked) setSelectedTicketIds(tickets.map((t: any) => t.id))
                      else setSelectedTicketIds([])
                    }}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">{t("table.ticket")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.user")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.department")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.assigned")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.priority")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.created")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{tickets.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket: any, i: number) => (
                  <tr key={ticket.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.includes(ticket.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTicketIds((prev: number[]) => [...new Set([...prev, ticket.id])])
                          else setSelectedTicketIds((prev: number[]) => prev.filter((id) => id !== ticket.id))
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
                            {ticket.aiTouched && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">AI</span>}
                            {ticket.archived && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground border border-border shrink-0">{t("status.archived")}</span>}
                          </div>
                          {((ticket.messages && ticket.messages.length) || ticket.adminReply) && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">
                              {ticket.messages?.length ? ticket.messages[ticket.messages.length - 1].message : ticket.adminReply || ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-foreground">{ticket.user ? redactName(ticket.user.firstName, ticket.user.lastName) : redact(ticket.userId)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{ticket.department || t("common.dash")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{ticket.assignedTo ? `#${ticket.assignedTo}` : t("common.dash")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={priorityColor[ticket.priority] || priorityColor.medium}>{priorityLabels[ticket.priority] || ticket.priority}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={ticketStatusColor[ticket.status] || ticketStatusColor.opened}>{statusLabels[ticket.status] || ticket.status?.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(ticket.created).toLocaleDateString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        {ticket.status !== "closed" && (
                          <button onClick={() => openReply(ticket)} title={t("actions.reply")} className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer" title={t("actions.openInNewTab")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
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
                      if (e.target.checked) setSelectedTicketIds(tickets.map((t: any) => t.id))
                      else setSelectedTicketIds([])
                    }}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-3 py-3 text-left font-medium">{t("table.ticket")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("table.priority")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{tickets.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket: any, i: number) => (
                  <tr key={ticket.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.includes(ticket.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTicketIds((prev: number[]) => [...new Set([...prev, ticket.id])])
                          else setSelectedTicketIds((prev: number[]) => prev.filter((id) => id !== ticket.id))
                        }}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">#{ticket.id}</span>
                          <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                          {ticket.aiTouched && <span className="rounded px-1 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 shrink-0">AI</span>}
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
                      <Badge variant="outline" className={`text-[10px] ${priorityColor[ticket.priority] || priorityColor.medium}`}>{priorityLabels[ticket.priority] || ticket.priority}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`text-[10px] ${ticketStatusColor[ticket.status] || ticketStatusColor.opened}`}>{statusLabels[ticket.status] || ticket.status?.replace(/_/g, " ")}</Badge>
                        {ticket.archived && <span className="text-[10px] text-muted-foreground">{t("status.archived")}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {ticket.status !== "closed" && (
                          <button onClick={() => openReply(ticket)} title={t("actions.reply")} className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
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

      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between px-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={selectedTicketIds.length > 0 && selectedTicketIds.length === tickets.length}
              onChange={(e) => {
                if (e.target.checked) setSelectedTicketIds(tickets.map((t: any) => t.id))
                else setSelectedTicketIds([])
              }}
              className="rounded border-border"
            />
            {t("selection.selectAll")}
          </label>
          {ticketsTotal ? <span className="text-xs text-muted-foreground">{t("selection.totalTickets", { count: ticketsTotal })}</span> : null}
        </div>

        {filteredTickets.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{tickets.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
            </div>
          </div>
        ) : (
          filteredTickets.map((ticket: any, i: number) => {
            const isSelected = selectedTicketIds.includes(ticket.id)
            return (
              <div key={ticket.id ?? i} className={`rounded-xl border bg-card overflow-hidden transition-colors ${isSelected ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <div className="flex items-start gap-3 p-4 pb-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedTicketIds((prev: number[]) => [...new Set([...prev, ticket.id])])
                      else setSelectedTicketIds((prev: number[]) => prev.filter((id) => id !== ticket.id))
                    }}
                    className="rounded border-border mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] text-muted-foreground">#{ticket.id}</span>
                          {ticket.aiTouched && <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">AI</span>}
                          {ticket.archived && <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground border border-border">{t("status.archived")}</span>}
                        </div>
                        <p className="text-sm font-semibold text-foreground mt-0.5 line-clamp-2">{ticket.subject}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${priorityColor[ticket.priority] || priorityColor.medium}`}>{priorityLabels[ticket.priority] || ticket.priority}</Badge>
                    </div>

                    {((ticket.messages && ticket.messages.length) || ticket.adminReply) && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{ticket.messages?.length ? ticket.messages[ticket.messages.length - 1].message : ticket.adminReply || ""}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.status")}</p>
                    <Badge variant="outline" className={`text-[10px] ${ticketStatusColor[ticket.status] || ticketStatusColor.opened}`}>{statusLabels[ticket.status] || ticket.status?.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="bg-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.user")}</p>
                    <p className="text-xs text-foreground truncate">{ticket.user ? redactName(ticket.user.firstName, ticket.user.lastName) : redact(ticket.userId)}</p>
                  </div>
                  <div className="bg-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.created")}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ticket.created).toLocaleDateString()}</p>
                  </div>
                </div>

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

                <div className="flex items-center border-t border-border divide-x divide-border">
                  {ticket.status !== "closed" && (
                    <button onClick={() => openReply(ticket)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{t("actions.reply")}</span>
                    </button>
                  )}
                  <a href={`/dashboard/tickets/${ticket.id}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{t("actions.open")}</span>
                  </a>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            {t("pagination.page")} <span className="font-medium text-foreground">{ticketsPage}</span>
            {ticketsTotal ? (
              <>
                {" "}
                {t("pagination.of")} <span className="font-medium text-foreground">{Math.max(1, Math.ceil(ticketsTotal / TICKETS_PER))}</span>
              </>
            ) : null}
            {ticketsTotal ? <span className="hidden sm:inline"> · {t("pagination.total", { count: ticketsTotal })}</span> : null}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (ticketsPage > 1) fetchTickets(ticketsPage - 1, ticketSearch, ticketPriorityFilter)
              }}
              disabled={ticketsPage <= 1}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">{t("actions.previous")}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!ticketsTotal || ticketsPage < Math.ceil((ticketsTotal || 0) / TICKETS_PER)) fetchTickets(ticketsPage + 1, ticketSearch, ticketPriorityFilter)
              }}
              disabled={ticketsTotal ? ticketsPage >= Math.ceil(ticketsTotal / TICKETS_PER) : tickets.length < TICKETS_PER}
              className="h-8 px-3 text-xs"
            >
              <span className="hidden sm:inline mr-1">{t("actions.next")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={!!replyTicket} onOpenChange={(open) => !open && setReplyTicket(null)}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("dialog.replyTitle", { id: replyTicket?.id ?? "" })}: {replyTicket?.subject}
          </DialogTitle>
        </DialogHeader>
        {replyTicket && (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-lg border border-border bg-secondary/30 p-3 max-h-64 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("dialog.conversation")}</p>
              {Array.isArray(replyTicket.messages) && replyTicket.messages.length ? (
                replyTicket.messages.map((m: any, idx: number) => (
                  <div key={idx} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{m.sender === 'staff' ? t("dialog.supportTeam") : (replyTicket.user ? `${replyTicket.user.firstName} ${replyTicket.user.lastName}` : t("dialog.userId", { id: replyTicket.userId }))}</span>
                      <span className="text-xs text-muted-foreground">{m.created ? new Date(m.created).toLocaleString() : ""}</span>
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap">{m.message}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-foreground whitespace-pre-wrap">{replyTicket.message || replyTicket.adminReply || t("dialog.noMessages")}</div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.yourReply")}</label>
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
                placeholder={t("dialog.typeReply")} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.replyAs")}</label>
                <select value={replyAs} onChange={(e) => setReplyAs(e.target.value as any)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="staff">{t("dialog.staff")}</option>
                  <option value="user">{t("dialog.user")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("priority.label")}</label>
                <select value={replyPriority} onChange={(e) => setReplyPriority(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="low">{t("priority.low")}</option>
                  <option value="medium">{t("priority.medium")}</option>
                  <option value="high">{t("priority.high")}</option>
                  <option value="urgent">{t("priority.urgent")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.department")}</label>
                <input value={replyDepartment} onChange={(e) => setReplyDepartment(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.assignedStaff")}</label>
                <SearchableUserSelect
                  value={replyAssignedTo}
                  onChange={(v) => setReplyAssignedTo(v)}
                  placeholder={t("dialog.searchStaff")}
                  initialList={staffUsers}
                  filter={(u) => ['admin', 'rootAdmin', '*'].includes(u.role || '')}
                  disabled={staffLoading}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.setStatus")}</label>
              <div className="flex gap-2">
                {['opened', 'awaiting_staff_reply', 'replied', 'closed'].map((s) => (
                  <button key={s} onClick={() => setReplyStatus(s)}
                    className={`rounded-md px-3 py-1.5 text-xs transition-colors border ${replyStatus === s
                      ? "border-primary/50 bg-primary/20 text-primary"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"}`}>
                    {statusLabels[s] || s.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setReplyTicket(null)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={submitReply} disabled={replyLoading || !replyText.trim()} className="bg-primary text-primary-foreground">
            {replyLoading ? t("actions.sending") : t("actions.sendReply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
