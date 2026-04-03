"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS, BRAND } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"

type AbuseForm = {
  id: number
  title: string
  description?: string
}

export default function AbuseReportPage() {
  const [forms, setForms] = useState<AbuseForm[]>([])
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null)
  const [reporterEmail, setReporterEmail] = useState("")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await apiFetch(API_ENDPOINTS.publicApplicationsForms)
        const normalized = Array.isArray(rows) ? rows : []
        setForms(normalized)
        if (normalized.length > 0) {
          setSelectedFormId(Number(normalized[0].id))
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load abuse report forms")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const submit = async () => {
    if (!selectedFormId) {
      setError("No abuse report form is available")
      return
    }
    if (!content.trim()) {
      setError("Please provide your report details")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await apiFetch(API_ENDPOINTS.publicApplicationsSubmit.replace(":id", String(selectedFormId)), {
        method: "POST",
        body: JSON.stringify({ content: content.trim(), reporterEmail: reporterEmail.trim() || undefined }),
      })
      setContent("")
      setReporterEmail("")
      setSuccess("Report submitted successfully.")
    } catch (err: any) {
      setError(err?.message || "Failed to submit report")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Abuse Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit abuse reports without an account. Each IP can submit once per hour per form.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading forms...</p>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No abuse report forms are currently available.</p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Form</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedFormId ?? ""}
                onChange={(e) => setSelectedFormId(Number(e.target.value))}
              >
                {forms.map((form) => (
                  <option key={form.id} value={form.id}>{form.title}</option>
                ))}
              </select>
              {selectedFormId && (
                <p className="text-xs text-muted-foreground">
                  {forms.find((x) => Number(x.id) === Number(selectedFormId))?.description || "No description"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact email (optional)</label>
              <input
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Report details</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Describe the abuse, affected resources, timestamps, and evidence links."
              />
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
            {success && <div className="text-sm text-emerald-600">{success}</div>}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{BRAND.name}</p>
              <Button onClick={submit} disabled={saving}>{saving ? "Submitting..." : "Submit Report"}</Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
