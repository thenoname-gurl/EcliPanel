"use client"

import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import {
  Server,
  LogIn,
  CreditCard,
  Shield,
  Ticket,
  Cpu,
  Filter,
} from "lucide-react"

const typeIcons: Record<string, typeof Server> = {
  server: Server,
  auth: LogIn,
  login: LogIn,
  logout: LogIn,
  register: LogIn,
  billing: CreditCard,
  security: Shield,
  support: Ticket,
  compute: Cpu,
}

const typeColors: Record<string, string> = {
  server: "text-chart-2",
  auth: "text-primary",
  login: "text-primary",
  logout: "text-muted-foreground",
  register: "text-success",
  billing: "text-success",
  security: "text-warning",
  support: "text-info",
  compute: "text-chart-4",
}

function guessType(action: string): string {
  if (/login|logout|register|passkey/.test(action)) return action.includes("login") ? "login" : action.includes("logout") ? "logout" : "register"
  if (/server|start|stop|restart/.test(action)) return "server"
  if (/billing|payment|invoice|order/.test(action)) return "billing"
  if (/key|2fa|security|password/.test(action)) return "security"
  if (/ticket|support/.test(action)) return "support"
  if (/compute|instance/.test(action)) return "compute"
  return "auth"
}

export default function AccountActivity() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const LOGS_PER = 50

  const loadLogs = async (pageNumber = 1) => {
    if (!user) return
    setLoading(true)
    try {
      const offset = (pageNumber - 1) * LOGS_PER
      const url = `${API_ENDPOINTS.userDetail.replace(":id", user.id.toString())}/logs?limit=${LOGS_PER}&offset=${offset}`
      const data = await apiFetch(url)
      const items = Array.isArray(data) ? data : []
      setLogs(items)
      setHasMore(items.length === LOGS_PER)
      setPage(pageNumber)
      if (pageNumber === 1) {
        setSelectedLog(items[0] ?? null)
      }
    } catch {
      setLogs([])
      setHasMore(false)
      setSelectedLog(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs(1)
  }, [user])

  const displayLogs = logs.filter((item) => {
    if (!filter) return true
    return guessType(item.action ?? "") === filter
  })

  const filterTypes = ["server", "login", "billing", "security", "support", "compute"]

  return (
    <>
      <PanelHeader data-guide-id="activity-dashboard" title="Account Activity" description="SOC audit trail and account events" />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter(null)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                !filter
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              All Events
            </button>
            {filterTypes.map((type) => {
              const Icon = typeIcons[type] ?? Server
              return (
                <button
                  key={type}
                  onClick={() => setFilter(filter === type ? null : type)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    filter === type
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden capitalize sm:inline">{type}</span>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => loadLogs(Math.max(1, page - 1))}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={!hasMore || loading}
                onClick={() => loadLogs(page + 1)}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="rounded-xl border border-border bg-card p-5">
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading activity…</p>
            ) : displayLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity found.</p>
            ) : (
              <>
                <div className="flex flex-col">
                  {displayLogs.map((item, idx) => {
                    const type = guessType(item.action ?? "")
                    const Icon = typeIcons[type] ?? Server
                    const iconColor = typeColors[type] ?? "text-primary"
                    const selected = selectedLog?.id === item.id

                    return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedLog(item)}
                      className={`flex w-full gap-4 rounded-md p-3 text-left transition ${selected ? "border border-primary/40 bg-primary/10" : "border border-border bg-card hover:bg-secondary/60"}`}
                    >
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50">
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                        </div>
                        {idx < displayLogs.length - 1 && (
                          <div className="w-px flex-1 bg-border" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">
                              {item.action ?? "Unknown action"}
                            </p>
                            {item.target && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.target}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-muted-foreground">
                              {item.timestamp
                                ? `${new Date(item.timestamp).toLocaleDateString()} ${new Date(item.timestamp).toLocaleTimeString()}`
                                : ""}
                            </span>
                            {item.ipAddress && (
                              <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-[10px]">
                                IP: {item.ipAddress}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedLog && (
                <div className="rounded-xl border border-border bg-card p-4 mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Selected Log Details</h3>
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Action</p>
                      <p className="text-sm text-foreground">{selectedLog.action || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Target Type</p>
                      <p className="text-sm text-foreground">{selectedLog.targetType || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Target ID</p>
                      <p className="text-sm text-foreground">{selectedLog.targetId || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Timestamp</p>
                      <p className="text-sm text-foreground">{selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">IP Address</p>
                      <p className="text-sm text-foreground">{selectedLog.ipAddress || '-'}</p>
                    </div>
                  </div>
                  {selectedLog.metadata && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">Metadata</p>
                      <pre className="mt-1 rounded-md border border-border bg-secondary/50 p-2 text-xs font-mono overflow-x-auto">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">All Properties</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs">
                      {Object.entries(selectedLog).map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-border bg-secondary/50 p-2">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{key}</p>
                          <p className="mt-1 font-mono text-[11px] text-foreground break-words">{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground">Raw JSON</p>
                    <pre className="mt-1 rounded-md border border-border bg-secondary/50 p-2 text-xs font-mono overflow-x-auto">
                      {JSON.stringify(selectedLog, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

