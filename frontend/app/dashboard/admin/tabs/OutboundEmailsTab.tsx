"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import SearchableUserSelect from "@/components/SearchableUserSelect"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

export default function OutboundEmailsTab() {
  const t = useTranslations("adminPage")
  const [q, setQ] = useState("")
  const [userId, setUserId] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [per, setPer] = useState(50)
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<any | null>(null)

  async function fetchList() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("page", String(page))
      qs.set("per", String(per))
      if (q) qs.set("q", q)
      if (userId) qs.set("userId", String(userId))
      if (status) qs.set("status", status)
      const res: any = await apiFetch(`${API_ENDPOINTS.adminOutboundEmails}?${qs.toString()}`)
      setItems(Array.isArray(res.items) ? res.items : [])
      setTotal(Number(res.total || 0))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [page, per, q, userId, status])

  return (
    <div>
      <div className="rounded-lg border border-border bg-secondary/50 p-4 mb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-2 min-w-0">
            <input
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              placeholder={t("adminOutboundEmails.searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="w-full lg:w-72">
              <SearchableUserSelect
                value={userId}
                onChange={(value: string) => setUserId(value)}
                placeholder={t("adminOutboundEmails.userFilterPlaceholder")}
              />
            </div>
            <select
              className="rounded border border-border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t("adminOutboundEmails.statusAll")}</option>
              <option value="queued">{t("adminOutboundEmails.statusQueued")}</option>
              <option value="sent">{t("adminOutboundEmails.statusSent")}</option>
              <option value="failed">{t("adminOutboundEmails.statusFailed")}</option>
            </select>
          </div>
          <Button onClick={() => setPage(1)}>{t("adminOutboundEmails.searchButton")}</Button>
        </div>
      </div>

      <div className="overflow-auto rounded border border-border bg-background">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className="px-3 py-2">{t("adminOutboundEmails.columnId")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnUser")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnFrom")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnTo")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnSubject")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnStatus")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnSentAt")}</th>
              <th className="px-3 py-2">{t("adminOutboundEmails.columnActions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t last:border-b hover:bg-secondary/50 transition-colors">
                <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.id}</td>
                <td className="px-3 py-2 align-top">{item.user?.displayName || item.user?.email || `#${item.userId}`}</td>
                <td className="px-3 py-2 align-top">{item.fromAddress}</td>
                <td className="px-3 py-2 align-top">{item.toAddress}</td>
                <td className="px-3 py-2 align-top truncate max-w-xs">{item.subject}</td>
                <td className="px-3 py-2 align-top">{item.status}</td>
                <td className="px-3 py-2 align-top">{item.sentAt ? new Date(item.sentAt).toLocaleString() : ""}</td>
                <td className="px-3 py-2 align-top">
                  <Button size="sm" onClick={() => setView(item)}>{t("adminOutboundEmails.viewButton")}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !loading ? (
          <div className="p-4 text-sm text-muted-foreground">{t("adminOutboundEmails.noResults")}</div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div>{loading ? t("adminOutboundEmails.loading") : `${items.length} / ${total}`}</div>
        <div className="flex gap-2">
          <Button disabled={page <= 1} size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {t("adminOutboundEmails.prev")}
          </Button>
          <Button disabled={page * per >= total} size="sm" onClick={() => setPage((p) => p + 1)}>
            {t("adminOutboundEmails.next")}
          </Button>
        </div>
      </div>

      <Dialog open={!!view} onOpenChange={(open) => { if (!open) setView(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminOutboundEmails.viewTitle", { id: view?.id })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-2 max-h-[60vh] overflow-auto text-sm">
            <p><strong>{t("adminOutboundEmails.viewFrom")}</strong> {view?.fromAddress}</p>
            <p><strong>{t("adminOutboundEmails.viewTo")}</strong> {view?.toAddress}</p>
            <p><strong>{t("adminOutboundEmails.viewSubject")}</strong> {view?.subject}</p>
            <div className="rounded border border-border bg-secondary/50 p-3 whitespace-pre-wrap break-words">
              {view?.html ? (
                <div dangerouslySetInnerHTML={{ __html: view?.html }} />
              ) : (
                <pre className="whitespace-pre-wrap break-words">{view?.body}</pre>
              )}
            </div>
            {view?.messageId ? (
              <p className="text-xs text-muted-foreground"><strong>{t("adminOutboundEmails.messageId")}</strong> {view.messageId}</p>
            ) : null}
            {view?.createdAt ? (
              <p className="text-xs text-muted-foreground"><strong>{t("adminOutboundEmails.createdAt")}</strong> {new Date(view.createdAt).toLocaleString()}</p>
            ) : null}
            {view?.failureReason ? (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
                <strong>{t("adminOutboundEmails.viewFailure")}</strong> {view.failureReason}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setView(null)}>{t("adminOutboundEmails.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
