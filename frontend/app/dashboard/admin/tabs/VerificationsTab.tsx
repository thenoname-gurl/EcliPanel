"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { Camera, CheckCircle, Clock, FileText, List, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react"

export default function VerificationsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminVerificationsTab")
  const {
    verifications,
    forceRefreshTab,
    verificationFilter,
    setVerificationFilter,
    redactName,
    redact,
    openPreview,
    reviewVerification,
    deleteVerification,
  } = ctx

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {verifications.filter((v: any) => v.status === "pending").length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">{t("header.pendingCount", { count: verifications.filter((v: any) => v.status === "pending").length })}</span>
                <span className="sm:hidden">{verifications.filter((v: any) => v.status === "pending").length}</span>
              </span>
            )}
            <button onClick={() => forceRefreshTab("verifications")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={t("actions.refresh")}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1">
        {(["all", "pending", "verified", "failed"] as const).map((f) => {
          const config: Record<string, { label: string; icon: any; activeColor: string }> = {
            all: { label: t("filters.all"), icon: List, activeColor: "bg-secondary text-foreground" },
            pending: { label: t("filters.pending"), icon: Clock, activeColor: "bg-warning/15 text-warning" },
            verified: { label: t("filters.verified"), icon: CheckCircle, activeColor: "bg-emerald-500/15 text-emerald-400" },
            failed: { label: t("filters.failed"), icon: XCircle, activeColor: "bg-destructive/15 text-destructive" },
          }
          const c = config[f]
          const Icon = c.icon
          const count = f === "all" ? verifications.length : verifications.filter((v: any) => v.status === f).length
          const isActive = (verificationFilter || "all") === f

          return (
            <button
              key={f}
              onClick={() => setVerificationFilter(f === "all" ? "" : f)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive ? c.activeColor : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
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
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.documents")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = verificationFilter ? verifications.filter((v: any) => v.status === verificationFilter) : verifications
                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">{verifications.length === 0 ? t("states.noneFound") : t("states.noMatch")}</p>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return filtered.map((v: any, i: number) => {
                  const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                    pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning", label: t("status.pending") },
                    verified: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: t("status.verified") },
                    failed: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive", label: t("status.failed") },
                  }
                  const sc = statusConfig[v.status] || statusConfig.pending
                  return (
                    <tr key={v.id ?? i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {v.user?.avatarUrl ? <img src={v.user.avatarUrl} alt={`${v.user.firstName || t("common.user")} ${t("common.avatar")}`} className="h-8 w-8 rounded-full object-cover shrink-0" /> : <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">{v.user?.firstName?.[0]?.toUpperCase() || "?"}</div>}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{v.user ? redactName(v.user.firstName, v.user.lastName) : redact(v.userId)}</p>
                            <p className="text-xs text-muted-foreground truncate">{redact(v.user?.email)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={sc.class}><span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />{sc.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {v.idDocumentUrl && <button onClick={() => v.idDocumentUrl && openPreview(v.idDocumentUrl, t("documents.idDocument"))} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"><FileText className="h-3 w-3 text-primary" />{t("documents.idDoc")}</button>}
                          {v.selfieUrl && <button onClick={() => v.selfieUrl && openPreview(v.selfieUrl, t("documents.selfie"))} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"><Camera className="h-3 w-3 text-primary" />{t("documents.selfie")}</button>}
                          {!v.idDocumentUrl && !v.selfieUrl && <span className="text-xs text-muted-foreground">{t("documents.none")}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {v.status === "pending" && (
                            <>
                              <button onClick={() => reviewVerification(v.id, "verified")} title={t("actions.approve")} className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"><CheckCircle className="h-3.5 w-3.5" /></button>
                              <button onClick={() => reviewVerification(v.id, "failed")} title={t("actions.reject")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"><XCircle className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                          {v.status === "verified" && <button onClick={() => reviewVerification(v.id, "failed")} title={t("actions.revokeVerification")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"><XCircle className="h-3.5 w-3.5" /></button>}
                          <button onClick={() => deleteVerification(v.id)} title={t("actions.deleteRecord")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
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
          const filtered = verificationFilter ? verifications.filter((v: any) => v.status === verificationFilter) : verifications
          if (filtered.length === 0) {
            return (
              <div className="rounded-xl border border-border bg-card px-4 py-12">
                <div className="flex flex-col items-center gap-2">
                  <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{verifications.length === 0 ? t("states.noneFound") : t("states.noMatch")}</p>
                </div>
              </div>
            )
          }

          return filtered.map((v: any, i: number) => {
            const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
              pending: { class: "text-warning", dot: "bg-warning", label: t("status.pendingReview") },
              verified: { class: "text-emerald-400", dot: "bg-emerald-400", label: t("status.verified") },
              failed: { class: "text-destructive", dot: "bg-destructive", label: t("status.failed") },
            }
            const sc = statusConfig[v.status] || statusConfig.pending

            return (
              <div key={v.id ?? i} className={`rounded-xl border bg-card overflow-hidden ${v.status === "pending" ? "border-warning/20" : "border-border"}`}>
                {v.status === "pending" && <div className="h-0.5 bg-gradient-to-r from-warning/60 via-warning to-warning/60" />}
                <div className="flex items-start gap-3 p-4 pb-3">
                  {v.user?.avatarUrl ? <img src={v.user.avatarUrl} alt={`${v.user.firstName || t("common.user")} ${t("common.avatar")}`} className="h-10 w-10 rounded-full object-cover shrink-0" /> : <div className="relative h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">{v.user?.firstName?.[0]?.toUpperCase() || "?"}<span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${sc.dot}`} /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{v.user ? redactName(v.user.firstName, v.user.lastName) : redact(v.userId)}</p>
                        <p className="text-xs text-muted-foreground truncate">{redact(v.user?.email)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}><span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">{t("table.documents")}</p>
                  <div className="flex items-center gap-2">
                    {v.idDocumentUrl && <button onClick={() => v.idDocumentUrl && openPreview(v.idDocumentUrl, t("documents.idDocument"))} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><FileText className="h-4 w-4 text-primary" /><div className="text-left"><p className="text-xs font-medium">{t("documents.idDocument")}</p><p className="text-[10px] text-muted-foreground">{t("documents.tapToPreview")}</p></div></button>}
                    {v.selfieUrl && <button onClick={() => v.selfieUrl && openPreview(v.selfieUrl, t("documents.selfie"))} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><Camera className="h-4 w-4 text-primary" /><div className="text-left"><p className="text-xs font-medium">{t("documents.selfie")}</p><p className="text-[10px] text-muted-foreground">{t("documents.tapToPreview")}</p></div></button>}
                    {!v.idDocumentUrl && !v.selfieUrl && <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border py-3"><p className="text-xs text-muted-foreground">{t("documents.noneUploaded")}</p></div>}
                  </div>
                </div>

                <div className="flex items-center border-t border-border divide-x divide-border">
                  {v.status === "pending" && (
                    <>
                      <button onClick={() => reviewVerification(v.id, "verified")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"><CheckCircle className="h-3.5 w-3.5" /><span>{t("actions.approve")}</span></button>
                      <button onClick={() => reviewVerification(v.id, "failed")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><XCircle className="h-3.5 w-3.5" /><span>{t("actions.reject")}</span></button>
                    </>
                  )}
                  {v.status === "verified" && <button onClick={() => reviewVerification(v.id, "failed")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><XCircle className="h-3.5 w-3.5" /><span>{t("actions.revoke")}</span></button>}
                  <button onClick={() => deleteVerification(v.id)} className={`${v.status === "failed" ? "flex-1" : ""} flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors`}><Trash2 className="h-3.5 w-3.5" /><span>{t("actions.delete")}</span></button>
                </div>
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}
