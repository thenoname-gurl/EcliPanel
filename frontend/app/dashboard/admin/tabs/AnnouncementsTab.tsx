"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"
import { AlertTriangle, Edit, Eye, EyeOff, Info, Loader2, Megaphone, Send } from "lucide-react"

export default function AnnouncementsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminAnnouncementsTab")
  const {
    annPreview,
    setAnnPreview,
    annSubject,
    setAnnSubject,
    annMessage,
    setAnnMessage,
    annForce,
    setAnnForce,
    annSending,
    setAnnSending,
    confirmAsync,
    user,
    EmailPreview,
  } = ctx

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Megaphone className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("header.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAnnPreview((p: boolean) => !p)}
              className={`rounded-lg p-2 transition-colors ${annPreview
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              title={annPreview ? t("actions.hidePreview") : t("actions.showPreview")}
            >
              {annPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!annSubject.trim() || !annMessage.trim()) return alert(t("alerts.testRequired"))
                setAnnSending(true)
                try {
                  const res = await apiFetch(API_ENDPOINTS.adminProductUpdates, {
                    method: "POST",
                    body: JSON.stringify({ subject: annSubject, message: annMessage, test: true }),
                  })
                  if (res && res.success) alert(t("alerts.testSent", { recipients: res.recipients }))
                  else alert(t("alerts.testFailed"))
                } catch (e: any) {
                  alert(t("alerts.testFailedWithReason", { reason: e.message || e }))
                } finally {
                  setAnnSending(false)
                }
              }}
              disabled={annSending || !annSubject.trim() || !annMessage.trim()}
              className="h-8 gap-1.5 border-border"
            >
              {annSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t("actions.sendTest")}</span>
              <span className="sm:hidden">{t("actions.test")}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Edit className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-foreground">{t("compose.title")}</p>
          </div>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("compose.subject")}
              </label>
              <input
                type="text"
                placeholder={t("compose.subjectPlaceholder")}
                value={annSubject}
                onChange={(e) => setAnnSubject(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {t("compose.message")}
                </label>
                <span className="text-[10px] text-muted-foreground">{t("compose.markdownSupported")}</span>
              </div>
              <textarea
                placeholder={t("compose.messagePlaceholder")}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors min-h-[280px] resize-y font-mono whitespace-pre-wrap"
              />
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{t("compose.characters", { count: annMessage.length })}</span>
                {annMessage.trim() && (
                  <>
                    <span>·</span>
                    <span>{t("compose.minRead", { minutes: Math.ceil(annMessage.trim().split(/\s+/).length / 200) })}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 cursor-pointer hover:bg-secondary/50 transition-colors">
                <input
                  type="checkbox"
                  checked={annForce}
                  onChange={(e) => setAnnForce(e.target.checked)}
                  className="rounded border-border"
                />
                <div>
                  <p className="text-xs font-medium text-foreground">{t("compose.forceTitle")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("compose.forceSubtitle")}</p>
                </div>
              </label>

              {annForce && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] text-warning">
                    {t("compose.forceWarning")}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!annSubject.trim() || !annMessage.trim()) return alert(t("alerts.required"))
                    const ok = await confirmAsync(
                      t("alerts.confirmBroadcast")
                    )
                    if (!ok) return
                    setAnnSending(true)
                    try {
                      const res = await apiFetch(API_ENDPOINTS.adminProductUpdates, {
                        method: "POST",
                        body: JSON.stringify({ subject: annSubject, message: annMessage, force: annForce }),
                      })
                      if (res && res.success) alert(t("alerts.broadcastSent", { recipients: res.recipients }))
                      else alert(t("alerts.broadcastFailed"))
                    } catch (e: any) {
                      alert(t("alerts.broadcastFailedWithReason", { reason: e.message || e }))
                    } finally {
                      setAnnSending(false)
                    }
                  }}
                  disabled={annSending || !annSubject.trim() || !annMessage.trim()}
                  variant="destructive"
                  className="gap-1.5"
                >
                  {annSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{t("actions.sendBroadcast")}</span>
                  <span className="sm:hidden">{t("actions.broadcast")}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-medium text-foreground">{t("preview.title")}</p>
            </div>
            <span className="text-[10px] text-muted-foreground rounded-full bg-secondary/50 px-2 py-0.5">
              {t("preview.live")}
            </span>
          </div>

          <div className="flex-1 flex flex-col p-4">
            <div className="rounded-t-lg border border-border bg-secondary/30 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {annSubject || t("preview.subjectFallback")}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{t("preview.from")}</span>
                    <span>·</span>
                    <span>{t("preview.justNow")}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-400 shrink-0">
                  {t("preview.badge")}
                </Badge>
              </div>
            </div>

            <div className="flex-1 rounded-b-lg border border-t-0 border-border bg-background overflow-y-auto">
              <div className="p-4">
                {(() => {
                  const detailParts: string[] = []
                  if (user?.firstName) detailParts.push(user.firstName)
                  if (user?.middleName) detailParts.push(user.middleName[0] + ".")
                  if (user?.lastName) detailParts.push(user.lastName[0] + ".")
                  const previewDetails = `${detailParts.join(" ")} — ${user?.email || ""}`.trim()
                  return (
                    <EmailPreview
                      title={annSubject || t("preview.subjectFallback")}
                      message={annMessage || ""}
                      details={previewDetails}
                    />
                  )
                })()}
              </div>
            </div>

            <div className="flex items-start gap-2 mt-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2">
              <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                {t("preview.note")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        {!annPreview && annMessage.trim() && (
          <button
            onClick={() => setAnnPreview(true)}
            className="w-full rounded-xl border border-dashed border-border bg-card/50 py-4 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs font-medium">{t("actions.tapToPreview")}</span>
          </button>
        )}
      </div>
    </div>
  )
}
