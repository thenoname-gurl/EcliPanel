"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Loader2, RefreshCw } from "lucide-react"

type ShortUrl = {
  id: number
  code: string
  prefix: 'a' | 'root'
  target: string
  active: boolean
  ownerId: number | null
  ownerEmail: string | null
  createdAt: string
  updatedAt: string
}

export default function ShortUrlsTab() {
  const t = useTranslations("adminShortUrlsTab")
  const { user } = useAuth()

  const canAdd = !!user && hasPermission(user, 'admin.shorturl.add')
  const canEditAny = !!user && hasPermission(user, 'admin.shorturl.edit.any')
  const canEditOwn = !!user && hasPermission(user, 'admin.shorturl.edit.own')
  const canRemove = !!user && hasPermission(user, 'admin.shorturl.remove')

  const [entries, setEntries] = useState<ShortUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ShortUrl | null>(null)
  const [editing, setEditing] = useState<ShortUrl | null>(null)
  const [code, setCode] = useState("")
  const [prefix, setPrefix] = useState<'a' | 'root'>('a')
  const [target, setTarget] = useState("")
  const [active, setActive] = useState(true)
  const [formError, setFormError] = useState("")

  const loadShortUrls = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.adminShortUrls)
      setEntries(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadShortUrls()
  }, [])

  const openNew = () => {
    setEditing(null)
    setCode("")
    setPrefix('a')
    setTarget("")
    setActive(true)
    setFormError("")
    setDialogOpen(true)
  }

  const openEdit = (entry: ShortUrl) => {
    setEditing(entry)
    setCode(entry.code)
    setPrefix(entry.prefix)
    setTarget(entry.target)
    setActive(entry.active)
    setFormError("")
    setDialogOpen(true)
  }

  const canModify = useMemo(() => {
    return (entry: ShortUrl) => {
      if (canEditAny) return true
      if (canEditOwn && entry.ownerId === user?.id) return true
      return false
    }
  }, [canEditAny, canEditOwn, user?.id])

  const save = async () => {
    if (!code.trim()) {
      setFormError(t('errors.missingCode'))
      return
    }
    if (!target.trim()) {
      setFormError(t('errors.missingTarget'))
      return
    }

    setSaving(true)
    try {
      const body = { code: code.trim(), prefix, target: target.trim(), active }
      const url = editing ? API_ENDPOINTS.adminShortUrl.replace(':id', String(editing.id)) : API_ENDPOINTS.adminShortUrls
      const method = editing ? 'PATCH' : 'POST'
      await apiFetch(url, { method, body })
      setDialogOpen(false)
      await loadShortUrls()
    } catch (error: any) {
      setFormError(error?.message || String(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.adminShortUrl.replace(':id', String(deleteTarget.id)), {
        method: 'DELETE',
      })
      setDeleteTarget(null)
      await loadShortUrls()
    } catch (error: any) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('header.title')}</p>
          <p className="text-sm text-muted-foreground">{t('header.subtitle')}</p>
        </div>
        {canAdd ? (
          <Button className="inline-flex items-center gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" />
            {t('actions.create')}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="text-sm text-muted-foreground">{t('header.help')}</div>
        <Button variant="secondary" className="inline-flex items-center gap-2" onClick={loadShortUrls}>
          <RefreshCw className="h-4 w-4" />
          {t('actions.reload')}
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
          {t('states.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t('table.noItems')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-secondary text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-4 py-3">{t('table.path')}</th>
                <th className="px-4 py-3">{t('table.target')}</th>
                <th className="px-4 py-3">{t('table.owner')}</th>
                <th className="px-4 py-3">{t('table.status')}</th>
                <th className="px-4 py-3">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const prefixLabel = entry.prefix === 'root' ? '' : '/a/'
                const path = `${prefixLabel}${entry.code}`
                return (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">
                      <div className="font-mono text-sm text-foreground">{path}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground break-all">{entry.target}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.ownerEmail || t('table.noOwner')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.active ? 'secondary' : 'outline'}>
                        {entry.active ? t('status.active') : t('status.inactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {canModify(entry) ? (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(entry)}>
                          <Edit className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t('actions.edit')}</span>
                        </Button>
                      ) : null}
                      {canRemove ? (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(entry)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t('actions.delete')}</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>{editing ? t('dialog.editDescription') : t('dialog.createDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground">{t('fields.code')}</label>
              <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t('fields.codePlaceholder')} />
              <p className="text-[11px] text-muted-foreground mt-1">{t('fields.codeHint')}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">{t('fields.prefix')}</label>
              <div className="mt-2 flex gap-2">
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${prefix === 'a' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`} onClick={() => setPrefix('a')}>
                  /a/
                </button>
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${prefix === 'root' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`} onClick={() => setPrefix('root')}>
                  {t('fields.rootPrefix')}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">{t('fields.target')}</label>
              <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={t('fields.targetPlaceholder')} />
              <p className="text-[11px] text-muted-foreground mt-1">{t('fields.targetHint')}</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                {t('fields.active')}
              </label>
            </div>
            {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{t('actions.cancel')}</Button>
            <Button onClick={save} disabled={saving} className="inline-flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? t('actions.save') : t('actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('dialog.deleteDescription', { code: deleteTarget?.code || '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>{t('actions.cancel')}</Button>
            <Button variant="destructive" onClick={remove} disabled={saving} className="inline-flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}