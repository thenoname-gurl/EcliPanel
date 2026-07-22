"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { CheckCircle, Clock, GraduationCap, RefreshCw, Trash2, XCircle } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

export default function StudentVerificationsTab() {
  const t = useTranslations("adminStudentVerificationsTab")
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecords = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.adminStudentVerifications)
      setRecords(Array.isArray(data) ? data : [])
    } catch { /* VOIDDDDDD */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  async function updateStatus(id: number, status: string) {
    try {
      await apiFetch(API_ENDPOINTS.adminStudentVerificationDetail.replace(':id', String(id)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      fetchRecords()
    } catch (e: any) {
      alert(e?.message || 'Failed')
    }
  }

  async function deleteRecord(id: number) {
    if (!confirm(t("deleteConfirm"))) return
    try {
      await apiFetch(API_ENDPOINTS.adminStudentVerificationDetail.replace(':id', String(id)), { method: 'DELETE' })
      fetchRecords()
    } catch (e: any) {
      alert(e?.message || 'Failed')
    }
  }

  const pendingCount = records.filter(r => r.status === 'pending').length
  const proofTypeLabels: Record<string, string> = {
    school_email: t("proofTypes.schoolEmail"),
    enrollment_doc: t("proofTypes.enrollmentDoc"),
    github_screenshot: t("proofTypes.githubScreenshot"),
    other: t("proofTypes.other"),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                <Clock className="h-3 w-3" />{pendingCount} {t("header.pending")}
              </span>
            )}
            <button onClick={fetchRecords} className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={t("actions.refresh")}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          {t("states.loading")}
        </div>
      ) : records.length === 0 ? (
        <div className="border border-border bg-card px-4 py-12">
          <div className="flex flex-col items-center gap-2">
            <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("states.noneFound")}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r: any) => (
            <div key={r.id} className="flex flex-col gap-2 border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">
                    {r.user?.firstName} {r.user?.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.user?.email}</span>
                  <span className="text-xs text-muted-foreground">ID: {r.userId}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {proofTypeLabels[r.proofType] || r.proofType || 'other'}
                  </Badge>
                  {r.adminNotes && (
                    <span className="text-xs text-muted-foreground font-mono">{r.adminNotes}</span>
                  )}
                  {r.proofUrl && (
                    <a href={r.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {t("actions.viewProof")}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={
                  r.status === 'verified' ? 'border-success/30 bg-success/10 text-success' :
                  r.status === 'failed' ? 'border-destructive/30 bg-destructive/10 text-destructive' :
                  'border-warning/30 bg-warning/10 text-warning'
                }>
                  {r.status}
                </Badge>
                {r.status === 'pending' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateStatus(r.id, 'verified')} className="p-1.5 text-success hover:bg-success/10 transition-colors" title={t("actions.approve")}>
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button onClick={() => updateStatus(r.id, 'failed')} className="p-1.5 text-destructive hover:bg-destructive/10 transition-colors" title={t("actions.reject")}>
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button onClick={() => deleteRecord(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={t("actions.delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}