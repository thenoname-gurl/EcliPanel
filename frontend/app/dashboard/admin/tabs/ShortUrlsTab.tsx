"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Trash2, Edit3, Check, Plus, X } from "lucide-react"

interface ShortUrlItem {
  id: number
  code: string
  prefix: 'root' | 'a'
  targetUrl: string
  active: boolean
  ownerId?: number
  createdAt: string
}

function normalizeCode(value: string) {
  return String(value || '').trim()
}

export default function ShortUrlsTab() {
  const t = useTranslations("adminPage.shortUrls")
  const [shortUrls, setShortUrls] = useState<ShortUrlItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ code: "", prefix: "a", targetUrl: "" })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(API_ENDPOINTS.adminShortUrls)
      setShortUrls(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || t("errors.failedLoad"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setForm({ code: "", prefix: "a", targetUrl: "" })
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const body = {
        code: normalizeCode(form.code),
        prefix: form.prefix,
        targetUrl: form.targetUrl.trim(),
      }
      if (!body.code || !body.targetUrl) {
        setError(t("errors.missingFields"))
        return
      }

      if (editingId) {
        await apiFetch(API_ENDPOINTS.adminShortUrlDetail.replace(":id", String(editingId)), {
          method: "PUT",
          body,
        })
      } else {
        await apiFetch(API_ENDPOINTS.adminShortUrls, {
          method: "POST",
          body,
        })
      }
      await load()
      resetForm()
    } catch (err: any) {
      setError(err?.message || t("errors.failedSave"))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: ShortUrlItem) => {
    setEditingId(item.id)
    setForm({ code: item.code, prefix: item.prefix, targetUrl: item.targetUrl })
    setError(null)
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("actions.confirmDelete"))) return
    setError(null)
    try {
      await apiFetch(API_ENDPOINTS.adminShortUrlDetail.replace(":id", String(id)), {
        method: "DELETE",
      })
      await load()
      if (editingId === id) resetForm()
    } catch (err: any) {
      setError(err?.message || t("errors.failedDelete"))
    }
  }

  const activeCount = useMemo(() => shortUrls.filter((item) => item.active).length, [shortUrls])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("overview.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("overview.description")}</p>
          </div>
          <div className="rounded-full bg-secondary/70 px-3 py-2 text-sm text-foreground">
            {t("overview.count", { count: shortUrls.length })} • {t("overview.activeCount", { count: activeCount })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{editingId ? t("editor.editTitle") : t("editor.createTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("editor.description")}</p>
            </div>
            {editingId ? (
              <Button variant="secondary" onClick={resetForm} size="sm">
                <X className="mr-2 h-3.5 w-3.5" /> {t("actions.cancel")}
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div>
              <Label htmlFor="shorturl-code">{t("fields.code")}</Label>
              <Input
                id="shorturl-code"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder={t("fields.codePlaceholder")}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("fields.codeHint")}</p>
            </div>
            <div>
              <Label htmlFor="shorturl-prefix">{t("fields.prefix")}</Label>
              <select
                id="shorturl-prefix"
                value={form.prefix}
                onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
                className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none transition"
              >
                <option value="a">/a/{t("fields.optionA")}</option>
                <option value="root">/{t("fields.optionRoot")}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="shorturl-target">{t("fields.targetUrl")}</Label>
              <Input
                id="shorturl-target"
                value={form.targetUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                placeholder={t("fields.targetPlaceholder")}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("fields.targetHint")}</p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                <Plus className="mr-2 h-3.5 w-3.5" /> {editingId ? t("actions.update") : t("actions.create")}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-base font-semibold text-foreground">{t("list.title")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("list.description")}</p>

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">{t("list.loading")}</div>
            ) : shortUrls.length === 0 ? (
              <div className="rounded-lg border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">{t("list.empty")}</div>
            ) : (
              shortUrls.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-secondary/50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.prefix === 'root' ? `/${item.code}` : `/a/${item.code}`}</p>
                      <p className="text-xs text-muted-foreground break-all">{item.targetUrl}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-1 text-[11px] ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.active ? t("list.active") : t("list.inactive")}
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(item)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
