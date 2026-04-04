"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useTranslations } from "next-intl"

export default function ExportJobsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminExportJobsTab")
  const {
    exportJobsMeta,
    fetchExportJobs,
    exportJobsLoading,
    exportJobRows,
    createExportShareLink,
    exportShareLoading,
    exportShareLinks,
  } = ctx

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("meta.runner")}: {exportJobsMeta?.runnerCron || "*/1 * * * *"} · {t("meta.nextRun")}: {exportJobsMeta?.nextRunAt ? new Date(exportJobsMeta.nextRunAt).toLocaleString() : t("common.na")} · {t("meta.lastRun")}: {exportJobsMeta?.lastRunAt ? new Date(exportJobsMeta.lastRunAt).toLocaleString() : t("common.na")}
          </p>
        </div>
        <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => fetchExportJobs(150, "")} disabled={exportJobsLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${exportJobsLoading ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/30">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">{t("table.user")}</th>
              <th className="px-4 py-3">{t("table.status")}</th>
              <th className="px-4 py-3">{t("table.progress")}</th>
              <th className="px-4 py-3">{t("table.created")}</th>
              <th className="px-4 py-3">{t("table.updated")}</th>
              <th className="px-4 py-3">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {exportJobRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>{t("states.empty")}</td>
              </tr>
            ) : exportJobRows.map((job: any) => (
              <tr key={job.id} className="border-b border-border/50 hover:bg-secondary/20">
                <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                <td className="px-4 py-3">{job.userId ?? t("common.na")}</td>
                <td className="px-4 py-3">{job.status}</td>
                <td className="px-4 py-3">{Math.max(0, Math.min(100, Number(job.progress || 0)))}%</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{job.createdAt ? new Date(job.createdAt).toLocaleString() : t("common.na")}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : t("common.na")}</td>
                <td className="px-4 py-3">
                  {job.status === "completed" ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <a href={API_ENDPOINTS.adminExportJobDownload.replace(":id", job.id)} className="text-xs text-sky-400 hover:text-sky-300" target="_blank" rel="noreferrer">{t("actions.download")}</a>
                        <button type="button" onClick={() => createExportShareLink(job.id)} disabled={!!exportShareLoading[job.id]} className="text-xs text-emerald-400 hover:text-emerald-300 disabled:text-muted-foreground">
                          {exportShareLoading[job.id] ? t("actions.generating") : t("actions.createShareLink")}
                        </button>
                      </div>
                      {exportShareLinks[job.id] ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <a href={exportShareLinks[job.id]} className="text-[11px] text-muted-foreground hover:text-foreground truncate" target="_blank" rel="noreferrer" title={exportShareLinks[job.id]}>
                            {exportShareLinks[job.id]}
                          </a>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(exportShareLinks[job.id])} className="text-[11px] text-muted-foreground hover:text-foreground" title={t("actions.copyShareLink")}
                          >
                            {t("actions.copy")}
                          </button>
                        </div>
                      ) : null}
                      {job.shareLinkExpiresAt ? <span className="text-[11px] text-muted-foreground">{t("meta.expiresAt")} {new Date(job.shareLinkExpiresAt).toLocaleString()}</span> : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
