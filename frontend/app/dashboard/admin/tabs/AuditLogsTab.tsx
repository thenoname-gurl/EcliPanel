"use client"

import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { Search, Loader2, Clock, User, ChevronLeft, ChevronRight, FileJson } from "lucide-react"

export default function AuditLogsTab() {
  const t = useTranslations("adminAuditLogs")
  const [uuid, setUuid] = useState("")
  const [searchUuid, setSearchUuid] = useState("")
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const PER = 100

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const doSearch = useCallback(async (p: number = 1) => {
    const q = uuid.trim() || searchUuid
    if (!q) return
    setSearchUuid(q)
    setLoading(true)
    setError(null)
    setExpanded(new Set())
    try {
      const data = await apiFetch(`/api/admin/audit/${encodeURIComponent(q)}?page=${p}&per=${PER}`)
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setPage(p)
    } catch (e: any) {
      setError(e?.message || "Failed to fetch audit logs")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [uuid, searchUuid])

  const totalPages = Math.max(1, Math.ceil(total / PER))

  const formatMetadata = (meta: any): string => {
    if (!meta) return ""
    if (typeof meta === "string") return meta
    return JSON.stringify(meta, null, 2)
  }

  const hasMetadata = (meta: any): boolean => {
    if (!meta) return false
    if (typeof meta === "object" && Object.keys(meta).length === 0) return false
    return true
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border bg-card">
        <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={t?.("searchPlaceholder") || "Enter server UUID to view all linked activity..."}
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <button
            onClick={() => doSearch(1)}
            disabled={loading || !uuid.trim()}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t?.("search") || "Search"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/20 bg-destructive/5 p-4">
          {error}
        </div>
      )}

      {searchUuid && !loading && logs.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {t?.("noResults") || "No activity logs found."}
        </div>
      )}

      {logs.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} {t?.("entriesFound") || "entries found"}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => doSearch(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1 hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>Page {page} / {totalPages}</span>
              <button
                onClick={() => doSearch(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-1 hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground w-40"><Clock className="h-3.5 w-3.5 inline mr-1" />Timestamp</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-28">Source</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-32"><User className="h-3.5 w-3.5 inline mr-1" />User</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-36">IP Address</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-10">Meta</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <>
                    <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => hasMetadata(log.metadata) && toggleExpand(log.id)}>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {log.source === 'antiabuse' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-destructive/10 text-destructive">
                            Abuse
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Log</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {log.userId ? (
                          <span className="text-foreground">{log.username || `#${log.userId}`}</span>
                        ) : (
                          <span className="text-muted-foreground italic">System</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-foreground break-all">
                        {log.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                        {log.ipAddress || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-center">
                        {hasMetadata(log.metadata) ? (
                          <FileJson className="h-3.5 w-3.5 inline text-primary/60" />
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded.has(log.id) && hasMetadata(log.metadata) && (
                      <tr key={`meta-${log.id}`} className="bg-secondary/10">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-muted/30 p-3">
                            {formatMetadata(log.metadata)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2">
            {logs.map((log: any) => (
              <div key={log.id} className="border border-border bg-card p-3 text-sm" onClick={() => hasMetadata(log.metadata) && toggleExpand(log.id)}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    {log.source === 'antiabuse' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-destructive/10 text-destructive">
                        Abuse
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{log.ipAddress || "—"}</span>
                </div>
                <p className="text-xs font-mono text-foreground break-all mb-1">{log.action}</p>
                <p className="text-xs text-muted-foreground">
                  {log.userId ? (log.username || `#${log.userId}`) : "System"}
                  {hasMetadata(log.metadata) && <FileJson className="h-3 w-3 inline ml-1 text-primary/60" />}
                </p>
                {expanded.has(log.id) && hasMetadata(log.metadata) && (
                  <pre className="mt-2 text-[10px] font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-muted/30 p-2">
                    {formatMetadata(log.metadata)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
