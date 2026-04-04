"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { AlertTriangle, Check, CheckCircle, Clock, List, RefreshCw, RotateCcw, Timer, Trash2, UserX, XCircle } from "lucide-react"

export default function DeletionsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminDeletionsTab")
  const {
    deletions,
    forceRefreshTab,
    deletionFilter,
    setDeletionFilter,
    redactName,
    redact,
    formatDeletionCountdown,
    reviewDeletion,
    expediteDeletion,
    cancelPendingDeletion,
  } = ctx

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <UserX className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deletions.filter((d: any) => d.status === "pending").length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="h-3 w-3" />
                <span className="hidden sm:inline">{t("header.pendingCount", { count: deletions.filter((d: any) => d.status === "pending").length })}</span>
                <span className="sm:hidden">{deletions.filter((d: any) => d.status === "pending").length}</span>
              </span>
            )}
            <button onClick={() => forceRefreshTab("deletions")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={t("actions.refresh")}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1">
        {(["all", "pending", "pending_deletion", "approved", "rejected", "cancelled", "deleted"] as const).map((f) => {
          const config: Record<string, { label: string; icon: any; activeColor: string }> = {
            all: { label: t("filters.all"), icon: List, activeColor: "bg-secondary text-foreground" },
            pending: { label: t("filters.pending"), icon: Clock, activeColor: "bg-warning/15 text-warning" },
            pending_deletion: { label: t("filters.pendingDeletion"), icon: Timer, activeColor: "bg-amber-500/15 text-amber-400" },
            approved: { label: t("filters.approved"), icon: CheckCircle, activeColor: "bg-emerald-500/15 text-emerald-400" },
            rejected: { label: t("filters.rejected"), icon: XCircle, activeColor: "bg-destructive/15 text-destructive" },
            cancelled: { label: t("filters.cancelled"), icon: RotateCcw, activeColor: "bg-slate-500/15 text-slate-300" },
            deleted: { label: t("filters.deleted"), icon: Trash2, activeColor: "bg-red-500/15 text-red-300" },
          }
          const c = config[f]
          const Icon = c.icon
          const count = f === "all" ? deletions.length : deletions.filter((d: any) => d.status === f).length
          const isActive = (deletionFilter || "all") === f
          return (
            <button key={f} onClick={() => setDeletionFilter(f === "all" ? "" : f)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive ? c.activeColor : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <Icon className="h-3 w-3" />
              {c.label}
              <span className={`ml-0.5 text-[10px] ${isActive ? "opacity-80" : "opacity-50"}`}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-card hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{t("table.user")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.requested")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = deletionFilter ? deletions.filter((d: any) => d.status === deletionFilter) : deletions
                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <UserX className="h-8 w-8 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">{deletions.length === 0 ? t("states.noneFound") : t("states.noMatch")}</p>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return filtered.map((d: any, i: number) => {
                  const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                    pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning", label: t("status.pending") },
                    pending_deletion: { class: "border-amber-500/30 bg-amber-500/10 text-amber-300", dot: "bg-amber-300", label: t("status.pendingDeletion") },
                    approved: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: t("status.approved") },
                    rejected: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive", label: t("status.rejected") },
                    cancelled: { class: "border-slate-500/30 bg-slate-500/10 text-slate-300", dot: "bg-slate-300", label: t("status.cancelled") },
                    deleted: { class: "border-red-500/30 bg-red-500/10 text-red-300", dot: "bg-red-300", label: t("status.deleted") },
                  }
                  const sc = statusConfig[d.status] || statusConfig.pending
                  const requestedDate = new Date(d.requestedAt)
                  const daysAgo = Math.floor((Date.now() - requestedDate.getTime()) / (1000 * 60 * 60 * 24))

                  return (
                    <tr key={d.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {d.user?.avatarUrl ? <img src={d.user.avatarUrl} alt={`${d.user.firstName || "User"} avatar`} className="h-8 w-8 rounded-full object-cover shrink-0" /> : <div className="relative h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-semibold text-destructive shrink-0">{d.user?.firstName?.[0]?.toUpperCase() || "?"}<span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} /></div>}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{d.user ? redactName(d.user.firstName, d.user.lastName) : redact(d.userId)}</p>
                            <p className="text-xs text-muted-foreground truncate">{redact(d.user?.email)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-foreground">{requestedDate.toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">{daysAgo === 0 ? t("time.today") : daysAgo === 1 ? t("time.yesterday") : t("time.daysAgo", { count: daysAgo })}</p>
                          {(d.scheduledDeletionAt) && (() => {
                            const countdown = formatDeletionCountdown(d.scheduledDeletionAt)
                            if (!countdown) return null
                            return <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${countdown.urgent ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}><Timer className="h-2.5 w-2.5" />{countdown.label}</span>
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge variant="outline" className={sc.class}><span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />{sc.label}</Badge>
                          {(d.scheduledDeletionAt) && (() => {
                            const countdown = formatDeletionCountdown(d.scheduledDeletionAt)
                            if (!countdown) return null
                            return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${countdown.urgent ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}><Timer className="h-2.5 w-2.5" />{countdown.label}</span>
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {d.status === "pending" && (
                            <>
                              <button onClick={() => reviewDeletion(d.id, "approved")} title={t("actions.approveDeletion")} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"><CheckCircle className="h-3.5 w-3.5" /><span>{t("actions.approveDelete")}</span></button>
                              <button onClick={() => reviewDeletion(d.id, "rejected")} title={t("actions.keepAccountTitle")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"><XCircle className="h-3.5 w-3.5" /><span>{t("actions.keepAccount")}</span></button>
                            </>
                          )}
                          {d.status === "pending_deletion" && (
                            <>
                              <button onClick={() => expediteDeletion(d.id)} title={t("actions.deleteUserNow") } className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"><Timer className="h-3.5 w-3.5" /><span>{t("actions.deleteNow")}</span></button>
                              <button onClick={() => cancelPendingDeletion(d.id)} title={t("actions.dontDeleteUser")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.dontDelete")}</span></button>
                            </>
                          )}
                          {d.scheduledDeletionAt && d.status !== "pending_deletion" && (
                            <>
                              <button onClick={() => cancelPendingDeletion(d.id)} title={t("actions.dontDeleteUser")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.dontDelete")}</span></button>
                            </>
                          )}
                          {d.status === "approved" && <span className="text-xs text-muted-foreground italic">{t("status.processed")}</span>}
                          {d.status === "rejected" && <button onClick={() => reviewDeletion(d.id, "approved")} title={t("actions.reconsiderTitle")} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.reconsider")}</span></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {(() => {
          const filtered = deletionFilter ? deletions.filter((d: any) => d.status === deletionFilter) : deletions
          if (filtered.length === 0) {
            return (
              <div className="rounded-xl border border-border bg-card px-4 py-12">
                <div className="flex flex-col items-center gap-2">
                  <UserX className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{deletions.length === 0 ? t("states.noneFound") : t("states.noMatch")}</p>
                </div>
              </div>
            )
          }

          return filtered.map((d: any, i: number) => {
            const statusConfig: Record<string, { class: string; dot: string; label: string; borderTint: string }> = {
              pending: { class: "text-warning", dot: "bg-warning", label: t("status.pendingReview"), borderTint: "border-warning/20" },
              pending_deletion: { class: "text-amber-300", dot: "bg-amber-300", label: t("status.pendingDeletion"), borderTint: "border-amber-500/20" },
              approved: { class: "text-emerald-400", dot: "bg-emerald-400", label: t("status.approved"), borderTint: "border-emerald-500/20" },
              rejected: { class: "text-destructive", dot: "bg-destructive", label: t("status.rejected"), borderTint: "border-border" },
              cancelled: { class: "text-slate-300", dot: "bg-slate-300", label: t("status.cancelled"), borderTint: "border-border" },
              deleted: { class: "text-red-300", dot: "bg-red-300", label: t("status.deleted"), borderTint: "border-red-500/20" },
            }
            const sc = statusConfig[d.status] || statusConfig.pending
            const requestedDate = new Date(d.requestedAt)
            const daysAgo = Math.floor((Date.now() - requestedDate.getTime()) / (1000 * 60 * 60 * 24))

            return (
              <div key={d.id ?? i} className={`rounded-xl border bg-card overflow-hidden ${d.status === "pending" ? sc.borderTint : "border-border"}`}>
                {d.status === "pending" && <div className={`h-0.5 ${daysAgo >= 14 ? "bg-gradient-to-r from-destructive/60 via-destructive to-destructive/60" : daysAgo >= 7 ? "bg-gradient-to-r from-warning/60 via-warning to-warning/60" : "bg-gradient-to-r from-primary/40 via-primary to-primary/40"}`} />}

                <div className="flex items-start gap-3 p-4 pb-3">
                  {d.user?.avatarUrl ? <img src={d.user.avatarUrl} alt={`${d.user.firstName || "User"} avatar`} className="h-10 w-10 rounded-full object-cover shrink-0" /> : <div className="relative h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-sm font-semibold text-destructive shrink-0">{d.user?.firstName?.[0]?.toUpperCase() || "?"}<span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${sc.dot}`} /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{d.user ? redactName(d.user.firstName, d.user.lastName) : redact(d.userId)}</p>
                        <p className="text-xs text-muted-foreground truncate">{redact(d.user?.email)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}><span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-4 py-2.5"><p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.requested")}</p><p className="text-xs font-medium text-foreground">{requestedDate.toLocaleDateString()}</p></div>
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.timeElapsed")}</p>
                    <p className={`text-xs font-medium ${d.status === "pending" && daysAgo >= 14 ? "text-destructive" : d.status === "pending" && daysAgo >= 7 ? "text-warning" : "text-foreground"}`}>
                      {daysAgo === 0 ? t("time.today") : daysAgo === 1 ? t("time.yesterday") : t("time.daysAgo", { count: daysAgo })}
                      {d.status === "pending" && daysAgo >= 14 && <span className="ml-1 text-[10px]">⚠️</span>}
                    </p>
                    {d.status === "pending_deletion" && (() => {
                      const countdown = formatDeletionCountdown(d.scheduledDeletionAt)
                      if (!countdown) return null
                      return <p className={`mt-1 text-[10px] font-medium ${countdown.urgent ? "text-destructive" : "text-amber-300"}`}>{countdown.label}</p>
                    })()}
                  </div>
                </div>

                <div className="flex items-center border-t border-border divide-x divide-border">
                  {d.status === "pending" && (
                    <>
                      <button onClick={() => reviewDeletion(d.id, "approved")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"><CheckCircle className="h-3.5 w-3.5" /><span>{t("actions.approveDelete")}</span></button>
                      <button onClick={() => reviewDeletion(d.id, "rejected")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground hover:bg-secondary/40 transition-colors"><XCircle className="h-3.5 w-3.5" /><span>{t("actions.keepAccount")}</span></button>
                    </>
                  )}
                  {d.status === "pending_deletion" && (
                    <>
                      <button onClick={() => expediteDeletion(d.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"><Timer className="h-3.5 w-3.5" /><span>{t("actions.deleteNow")}</span></button>
                      <button onClick={() => cancelPendingDeletion(d.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground hover:bg-secondary/40 transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.dontDelete")}</span></button>
                    </>
                  )}
                  {d.scheduledDeletionAt && d.status !== "pending_deletion" && (
                    <>
                      <button onClick={() => cancelPendingDeletion(d.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-foreground hover:bg-secondary/40 transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.dontDelete")}</span></button>
                    </>
                  )}
                  {d.status === "approved" && <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-400" /><span>{t("status.deletionProcessed")}</span></div>}
                  {d.status === "rejected" && <button onClick={() => reviewDeletion(d.id, "approved")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><RotateCcw className="h-3.5 w-3.5" /><span>{t("actions.reconsiderApprove")}</span></button>}
                </div>
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}
