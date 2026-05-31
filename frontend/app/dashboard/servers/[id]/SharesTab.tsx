"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LoadingState } from "./serverTabShared"
import {
  Link2, Trash2, Copy, Check, ExternalLink,
  Loader2, Clock, Download, File, AlertCircle,
  Calendar, ToggleLeft
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

interface ShareEntry {
  id: string
  token: string
  filePath: string
  expiresIn: string
  expiresAt: string | null
  downloads: number
  active: boolean
  createdAt: string
  url: string
}

export function SharesTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverSharesTab")
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ShareEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(API_ENDPOINTS.serverFileShares.replace(":id", serverId))
      setShares(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || t("errorLoad"))
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (share: ShareEntry) => {
    setDeleting(share.id)
    try {
      await apiFetch(
        API_ENDPOINTS.serverFileShareDelete
          .replace(":id", serverId)
          .replace(":shareId", share.id),
        { method: "DELETE" }
      )
      setShares(prev => prev.filter(s => s.id !== share.id))
    } catch {
      setError(t("errorDelete"))
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const copyLink = async (share: ShareEntry) => {
    try {
      await navigator.clipboard.writeText(share.url)
      setCopiedId(share.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  const formatDate = (d: string | null) => {
    if (!d) return "—"
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }

  const isExpired = (share: ShareEntry) =>
    share.expiresAt ? new Date(share.expiresAt) < new Date() : false

  if (loading) {
    return <LoadingState message={t("loading")} />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{error}</p>
        <Button size="sm" variant="outline" onClick={load}>{t("retry")}</Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("description")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
          <Loader2 className="h-3.5 w-3.5" />
          {t("refresh")}
        </Button>
      </div>

      {shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Link2 className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">{t("emptyTitle")}</p>
          <p className="text-xs">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map(share => {
            const expired = isExpired(share)
            return (
              <div
                key={share.id}
                className={cn(
                  "rounded-lg border bg-card p-4 transition-colors",
                  !share.active || expired ? "border-dashed border-border/40 opacity-60" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <File className="h-4 w-4 text-violet-400 shrink-0" />
                      <span className="text-sm font-mono text-foreground truncate">
                        {share.filePath}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(share.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {share.expiresIn === "permanent" ? t("neverExpires") : t("expires", { duration: share.expiresIn })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {t("downloads", { count: share.downloads })}
                      </span>
                      <span className={cn(
                        "flex items-center gap-1",
                        !share.active || expired ? "text-destructive" : "text-emerald-400"
                      )}>
                        <ToggleLeft className="h-3 w-3" />
                        {!share.active ? t("statusDisabled") : expired ? t("statusExpired") : t("statusActive")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => copyLink(share)}
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title={t("copyLink")}
                    >
                      {copiedId === share.id ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <a
                      href={share.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title={t("openSharePage")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => setConfirmDelete(share)}
                      disabled={deleting === share.id}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                      title={t("deleteShareLink")}
                    >
                      {deleting === share.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {confirmDelete && (
            <div className="rounded-lg bg-secondary/20 border border-border/60 px-3.5 py-2.5 text-sm font-mono text-foreground truncate">
              {confirmDelete.filePath}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(confirmDelete!)}
              disabled={deleting === confirmDelete?.id}
              className="gap-1.5"
            >
              {deleting === confirmDelete?.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("deleteLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}