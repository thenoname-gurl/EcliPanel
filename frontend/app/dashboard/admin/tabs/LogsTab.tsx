"use client"

import { Button } from "@/components/ui/button"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Globe, RefreshCw, ScrollText, Shield, Timer, Trash2 } from "lucide-react"

export default function LogsTab({ ctx }: { ctx: any }) {
  const {
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
  } = ctx

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                <ScrollText className="h-4 w-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {logType === "serverErrors" ? "Server Errors" : logType === "requests" ? "API Request Logs" : logType === "slow" ? "Slow Queries" : "Audit Logs"}
                </p>
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
                      await apiFetch(`${API_ENDPOINTS.adminSlowQueries}/clear`, { method: "POST" })
                      await fetchLogs(1, "slow", logsUserFilter)
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
                    await fetchLogs(logsPage, logType, logsUserFilter)
                  } catch {
                    await fetchLogs(1, logType, logsUserFilter)
                  }
                }}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(["audit", "requests", "slow", "serverErrors"] as const).map((t) => {
              const config: Record<string, { label: string; icon: any; color: string }> = {
                audit: { label: "Audit", icon: Shield, color: "text-indigo-400" },
                requests: { label: "API Requests", icon: Globe, color: "text-blue-400" },
                slow: { label: "Slow Queries", icon: Timer, color: "text-orange-400" },
                serverErrors: { label: "Server Errors", icon: AlertTriangle, color: "text-red-400" },
              }
              const c = config[t]
              const Icon = c.icon
              const isActive = logType === t

              return (
                <button
                  key={t}
                  onClick={async () => {
                    setLogType(t)
                    try {
                      await fetchLogs(1, t, logsUserFilter)
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

      <div className="rounded-xl border border-border bg-card hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Time</th>
                {(logType === "audit" || logType === "requests" || logType === "serverErrors") && (
                  <th className="px-4 py-3 text-left font-medium">User</th>
                )}
                {logType === "audit" && (
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                )}
                {logType === "serverErrors" && (
                  <>
                    <th className="px-4 py-3 text-left font-medium">Action</th>
                    <th className="px-4 py-3 text-left font-medium">Error</th>
                    <th className="px-4 py-3 text-left font-medium">Manage</th>
                  </>
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
                  <td colSpan={logType === "requests" || logType === "serverErrors" ? 4 : 3} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ScrollText className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No logs found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log: any, i: number) => {
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
                              {log.avatarUrl ? (
                                <img src={log.avatarUrl} alt={`${log.username} avatar`} className="h-6 w-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                                  {log.username?.[0]?.toUpperCase() || "?"}
                                </div>
                              )}
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

                      {logType === "serverErrors" && (
                        <>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[14rem] overflow-hidden text-ellipsis">
                            <div className="text-xs text-muted-foreground break-words">
                              {log.metadata?.message || log.metadata?.error || log.metadata?.detail || "(no details)"}
                            </div>
                            {log.metadata?.stack && (
                              <details className="text-[10px] text-muted-foreground mt-1">
                                <summary>Stack</summary>
                                <pre className="whitespace-pre-wrap max-h-28 overflow-auto">{log.metadata.stack}</pre>
                              </details>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteLog(log.id)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </>
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

      <div className="flex flex-col gap-2 md:hidden">
        {logs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <ScrollText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No logs found</p>
            </div>
          </div>
        ) : (
          logs.map((log: any, i: number) => {
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
                {logType === "slow" && (isSlowWarning || isSlowCritical) && (
                  <div className={`h-0.5 ${isSlowCritical ? "bg-destructive" : "bg-warning"}`} />
                )}

                <div className="p-3">
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
  )
}
