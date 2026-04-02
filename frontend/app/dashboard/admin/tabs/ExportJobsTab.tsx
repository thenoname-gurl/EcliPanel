"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { API_ENDPOINTS } from "@/lib/panel-config"

export default function ExportJobsTab({ ctx }: { ctx: any }) {
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
          <h3 className="text-sm font-semibold text-foreground">Export Job Queue</h3>
          <p className="text-xs text-muted-foreground">
            Runner: {exportJobsMeta?.runnerCron || "*/1 * * * *"} · Next run: {exportJobsMeta?.nextRunAt ? new Date(exportJobsMeta.nextRunAt).toLocaleString() : "n/a"} · Last run: {exportJobsMeta?.lastRunAt ? new Date(exportJobsMeta.lastRunAt).toLocaleString() : "n/a"}
          </p>
        </div>
        <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => fetchExportJobs(150, "")} disabled={exportJobsLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${exportJobsLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/30">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Job ID</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exportJobRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>No export jobs yet.</td>
              </tr>
            ) : exportJobRows.map((job: any) => (
              <tr key={job.id} className="border-b border-border/50 hover:bg-secondary/20">
                <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                <td className="px-4 py-3">{job.userId ?? "n/a"}</td>
                <td className="px-4 py-3">{job.status}</td>
                <td className="px-4 py-3">{Math.max(0, Math.min(100, Number(job.progress || 0)))}%</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{job.createdAt ? new Date(job.createdAt).toLocaleString() : "n/a"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : "n/a"}</td>
                <td className="px-4 py-3">
                  {job.status === "completed" ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <a href={API_ENDPOINTS.adminExportJobDownload.replace(":id", job.id)} className="text-xs text-sky-400 hover:text-sky-300" target="_blank" rel="noreferrer">Download</a>
                        <button type="button" onClick={() => createExportShareLink(job.id)} disabled={!!exportShareLoading[job.id]} className="text-xs text-emerald-400 hover:text-emerald-300 disabled:text-muted-foreground">
                          {exportShareLoading[job.id] ? "Generating…" : "Create share link"}
                        </button>
                      </div>
                      {exportShareLinks[job.id] ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <a href={exportShareLinks[job.id]} className="text-[11px] text-muted-foreground hover:text-foreground truncate" target="_blank" rel="noreferrer" title={exportShareLinks[job.id]}>
                            {exportShareLinks[job.id]}
                          </a>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(exportShareLinks[job.id])} className="text-[11px] text-muted-foreground hover:text-foreground" title="Copy share link">
                            Copy
                          </button>
                        </div>
                      ) : null}
                      {job.shareLinkExpiresAt ? <span className="text-[11px] text-muted-foreground">Expires at {new Date(job.shareLinkExpiresAt).toLocaleString()}</span> : null}
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
