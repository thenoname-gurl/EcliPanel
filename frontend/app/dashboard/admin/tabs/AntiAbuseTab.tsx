"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"
import { AlertTriangle, Brain, Loader2, RefreshCw, ShieldAlert } from "lucide-react"

type Incident = {
  id: number
  createdAt?: string
  status?: string
  reviewedAt?: string | null
  serverId?: string | null
  serverName?: string | null
  suspectedServerIds?: string[]
  suspectedServerNames?: string[]
  detectionType?: string
  enforcementAction?: string
  strikeCount?: number | null
  reason?: string
  nodeName?: string | null
  sourceIp?: string | null
  targetIp?: string | null
  targetPort?: number | null
  suspendAttempted?: boolean
  suspendSuccess?: boolean
  aiRiskScore?: number | null
  aiCategory?: string | null
  aiSummary?: string | null
  aiRecommendedAction?: string | null
  aiConfidence?: number | null
}

type AntiAbuseAgent = {
  agentId: string
  detectorName: string
  nodeName: string
  lastSeenAt: string
  ageMs: number
  active: boolean
  pid?: number | null
  version?: string | null
}

function riskTone(score?: number | null) {
  if (score == null) return "text-muted-foreground"
  if (score >= 80) return "text-destructive"
  if (score >= 50) return "text-warning"
  return "text-emerald-400"
}

function formatAgentAgeMs(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 0
  return Math.max(0, Math.floor(ageMs / 1000))
}

export default function AntiAbuseTab() {
  const t = useTranslations("adminAntiAbuseTab")
  const [items, setItems] = useState<Incident[]>([])
  const [agents, setAgents] = useState<AntiAbuseAgent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<"aiRisk" | "createdAt">("aiRisk")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [minRisk, setMinRisk] = useState("0")
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const PAGE_SIZE = 25

  const load = useCallback(async (targetPage?: number) => {
    const nextPage = Math.max(1, targetPage ?? page)
    setLoading(true)
    try {
      const query = new URLSearchParams()
      query.set("page", String(nextPage))
      query.set("limit", String(PAGE_SIZE))
      query.set("sort", sort)
      query.set("order", order)
      const min = Number(minRisk)
      if (Number.isFinite(min) && min > 0) query.set("minRisk", String(min))

      const res: any = await apiFetch(`${API_ENDPOINTS.adminAntiAbuseIncidents}?${query.toString()}`)
      setItems(Array.isArray(res?.items) ? res.items : [])
      setAgents(Array.isArray(res?.agents) ? res.agents : [])
      setTotal(Number.isFinite(Number(res?.total)) ? Number(res.total) : 0)
      const serverPage = Number(res?.page)
      setPage(Number.isFinite(serverPage) && serverPage > 0 ? Math.floor(serverPage) : nextPage)
    } catch {
      setItems([])
      setAgents([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, sort, order, minRisk])

  const updateIncidentStatus = useCallback(async (id: number, action: "resolve" | "dismiss") => {
    setUpdatingId(id)
    try {
      const endpoint = API_ENDPOINTS.adminAntiAbuseIncidentStatus.replace(":id", String(id))
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ action }),
      })
      await load(page)
    } finally {
      setUpdatingId(null)
    }
  }, [load, page])

  const bulkUpdateIncidentStatus = useCallback(async (action: "resolve" | "dismiss" | "archive") => {
    if (selectedIds.length === 0) {
      return
    }

    setUpdatingId(-1)
    try {
      await apiFetch(API_ENDPOINTS.adminAntiAbuseIncidentsBulkStatus, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, action }),
      })
      setSelectedIds([])
      await load(page)
    } finally {
      setUpdatingId(null)
    }
  }, [selectedIds, load, page])

  const deleteIncident = useCallback(async (id: number) => {
    if (!window.confirm(t("confirm.deleteOne"))) {
      return
    }

    setUpdatingId(id)
    try {
      const endpoint = API_ENDPOINTS.adminAntiAbuseIncidentDelete.replace(":id", String(id))
      await apiFetch(endpoint, { method: "DELETE" })
      setSelectedIds((prev) => prev.filter((v) => v !== id))
      await load(page)
    } finally {
      setUpdatingId(null)
    }
  }, [load, page, t])

  const bulkDeleteIncidents = useCallback(async () => {
    if (selectedIds.length === 0) {
      return
    }
    if (!window.confirm(t("confirm.bulkDelete", { count: selectedIds.length }))) {
      return
    }

    setUpdatingId(-1)
    try {
      await apiFetch(API_ENDPOINTS.adminAntiAbuseIncidentsBulkDelete, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds }),
      })
      setSelectedIds([])
      await load(page)
    } finally {
      setUpdatingId(null)
    }
  }, [selectedIds, load, page, t])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1

  const summary = useMemo(() => {
    const high = items.filter((x) => (x.aiRiskScore ?? 0) >= 80).length
    const suspended = items.filter((x) => !!x.suspendSuccess).length
    const activeAgents = agents.filter((x) => x.active).length
    return { high, suspended, activeAgents }
  }, [items, agents])

  const allVisibleSelected = items.length > 0 && items.every((it) => selectedIds.includes(it.id))

  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      const visibleSet = new Set(items.map((it) => it.id))
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const it of items) next.add(it.id)
        return Array.from(next)
      })
    }
  }, [allVisibleSelected, items])

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{t("header.title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("header.subtitle")}</p>
        </div>
        <button
          onClick={() => load()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={t("actions.refresh")}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="border-b border-border p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground">{t("summary.total")}</p>
          <p className="text-lg font-semibold text-foreground">{total}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground">{t("summary.highRisk")}</p>
          <p className="text-lg font-semibold text-destructive">{summary.high}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground">{t("summary.suspended")}</p>
          <p className="text-lg font-semibold text-foreground">{summary.suspended}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          {t("summary.activeAgents")}: <span className="text-foreground font-medium">{summary.activeAgents}</span>
        </div>
      </div>

      <div className="border-b border-border p-4">
        <p className="text-[11px] text-muted-foreground mb-2">{t("agents.title")}</p>
        {agents.filter((x) => x.active).length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("agents.none")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {agents.filter((x) => x.active).map((agent) => (
              <div key={agent.agentId} className="rounded border border-border bg-secondary/30 px-2.5 py-1.5 text-xs text-foreground">
                <span className="font-medium">{agent.detectorName}</span>
                <span className="text-muted-foreground"> @ {agent.nodeName}</span>
                <span className="text-muted-foreground"> · {t("agents.lastSeenAgo", { seconds: formatAgentAgeMs(agent.ageMs) })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-border p-4 flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">{t("filters.sort")}</label>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value === "createdAt" ? "createdAt" : "aiRisk")
              setPage(1)
            }}
            className="rounded border border-border bg-secondary/40 px-2 py-1.5 text-xs"
          >
            <option value="aiRisk">{t("filters.sortRisk")}</option>
            <option value="createdAt">{t("filters.sortCreated")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">{t("filters.order")}</label>
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value === "asc" ? "asc" : "desc")
              setPage(1)
            }}
            className="rounded border border-border bg-secondary/40 px-2 py-1.5 text-xs"
          >
            <option value="desc">{t("filters.desc")}</option>
            <option value="asc">{t("filters.asc")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">{t("filters.minRisk")}</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minRisk}
            onChange={(e) => {
              setMinRisk(e.target.value)
              setPage(1)
            }}
            className="rounded border border-border bg-secondary/40 px-2 py-1.5 text-xs w-24"
          />
        </div>
        <button
          onClick={() => {
            setPage(1)
            load(1)
          }}
          className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10"
        >
          {t("actions.apply")}
        </button>
        <button
          onClick={toggleSelectAllVisible}
          className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10"
        >
          {allVisibleSelected ? t("actions.clearSelection") : t("actions.selectAllVisible")}
        </button>
        <button
          onClick={() => bulkUpdateIncidentStatus("resolve")}
          disabled={updatingId !== null || selectedIds.length === 0}
          className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
        >
          {updatingId === -1 ? t("states.saving") : t("actions.bulkResolve", { count: selectedIds.length })}
        </button>
        <button
          onClick={() => bulkUpdateIncidentStatus("dismiss")}
          disabled={updatingId !== null || selectedIds.length === 0}
          className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
        >
          {updatingId === -1 ? t("states.saving") : t("actions.bulkDismiss", { count: selectedIds.length })}
        </button>
        <button
          onClick={() => bulkUpdateIncidentStatus("archive")}
          disabled={updatingId !== null || selectedIds.length === 0}
          className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
        >
          {updatingId === -1 ? t("states.saving") : t("actions.bulkArchive", { count: selectedIds.length })}
        </button>
        <button
          onClick={bulkDeleteIncidents}
          disabled={updatingId !== null || selectedIds.length === 0}
          className="h-8 px-3 rounded border border-destructive/30 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
        >
          {updatingId === -1 ? t("states.saving") : t("actions.bulkDelete", { count: selectedIds.length })}
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("states.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-70" />
          {t("states.empty")}
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="text-sm text-foreground font-medium">
                      {item.serverName || item.serverId || t("common.unknownServer")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${riskTone(item.aiRiskScore)}`}>
                      <Brain className="h-3.5 w-3.5 inline mr-1" />
                      {t("labels.risk")}: {item.aiRiskScore ?? t("common.na")}
                    </span>
                    <span className="text-muted-foreground">#{item.id}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t("labels.detection")}: <span className="text-foreground">{item.detectionType || "unknown"}</span></span>
                  <span>{t("labels.action")}: <span className="text-foreground">{item.enforcementAction || "unknown"}</span></span>
                  <span>{t("labels.strikes")}: <span className="text-foreground">{item.strikeCount ?? "—"}</span></span>
                  <span>{t("labels.time")}: <span className="text-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</span></span>
                  <span>{t("labels.status")}: <span className="text-foreground">{item.status || t("common.pending")}</span></span>
                </div>

                <p className="text-sm text-foreground/90">{item.reason || t("common.noReason")}</p>

                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t("labels.source")}: <span className="text-foreground">{item.sourceIp || "—"}</span></span>
                  <span>{t("labels.target")}: <span className="text-foreground">{item.targetIp || "—"}{item.targetPort ? `:${item.targetPort}` : ""}</span></span>
                  <span>{t("labels.suspend")}: <span className="text-foreground">{item.suspendSuccess ? t("common.yes") : t("common.no")}</span></span>
                  <span>{t("labels.aiAction")}: <span className="text-foreground">{item.aiRecommendedAction || "—"}</span></span>
                </div>

                {Array.isArray(item.suspectedServerNames) && item.suspectedServerNames.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("labels.attachedCandidates")}: <span className="text-foreground">{item.suspectedServerNames.join(", ")}</span>
                  </p>
                ) : null}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateIncidentStatus(item.id, "resolve")}
                    disabled={updatingId === item.id}
                    className="h-7 px-2.5 rounded border border-border bg-secondary/50 text-[11px] text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    {updatingId === item.id ? t("states.saving") : t("actions.markSolved")}
                  </button>
                  <button
                    onClick={() => updateIncidentStatus(item.id, "dismiss")}
                    disabled={updatingId === item.id}
                    className="h-7 px-2.5 rounded border border-border bg-secondary/50 text-[11px] text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    {updatingId === item.id ? t("states.saving") : t("actions.dismiss")}
                  </button>
                  <button
                    onClick={() => deleteIncident(item.id)}
                    disabled={updatingId === item.id}
                    className="h-7 px-2.5 rounded border border-destructive/30 bg-destructive/10 text-[11px] text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  >
                    {updatingId === item.id ? t("states.saving") : t("actions.delete")}
                  </button>
                </div>

                {item.aiSummary ? (
                  <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">{item.aiSummary}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border-t border-border p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("pagination.page")} <span className="font-medium text-foreground">{page}</span> {t("pagination.of")} <span className="font-medium text-foreground">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => load(page - 1)}
                disabled={loading || page <= 1}
                className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
              >
                {t("pagination.previous")}
              </button>
              <button
                onClick={() => load(page + 1)}
                disabled={loading || page >= totalPages}
                className="h-8 px-3 rounded border border-border bg-secondary/50 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
              >
                {t("pagination.next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
