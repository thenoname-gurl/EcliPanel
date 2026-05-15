"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Trash2, MessageSquare, Star, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

type FeedbackItem = {
  id: number
  rating: number
  message: string
  createdAt: string
  user: {
    id: number
    firstName: string
    lastName: string
    email: string
    avatarUrl: string | null
  } | null
}

type FeedbackResponse = {
  data: FeedbackItem[]
  total: number
  page: number
  limit: number
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5"
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`${cls} ${s <= rating ? "text-yellow-400" : "text-muted-foreground/20"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export default function FeedbackTab() {
  const [data, setData] = useState<FeedbackResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterRating, setFilterRating] = useState<number | undefined>()
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [viewMessage, setViewMessage] = useState<FeedbackItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (filterRating !== undefined) params.set("rating", String(filterRating))
      const res = await apiFetch(`${API_ENDPOINTS.adminFeedback}?${params}`)
      setData(res as FeedbackResponse)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [page, filterRating])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(API_ENDPOINTS.adminFeedbackDelete.replace(":id", String(id)), { method: "DELETE" })
      setData((prev) => prev ? { ...prev, data: prev.data.filter((d) => d.id !== id), total: prev.total - 1 } : prev)
      setDeleteConfirm(null)
    } catch (e: any) {
      alert(e?.message || "Failed to delete feedback")
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1
  const avgRating = data && data.data.length > 0
    ? (data.data.reduce((s, d) => s + d.rating, 0) / data.data.length).toFixed(1)
    : "—"

  return (
    <>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">User Feedback</p>
            {data && (
              <>
                <Badge variant="outline" className="text-xs">{data.total} total</Badge>
                <Badge variant="secondary" className="text-xs">Avg: {avgRating}/5</Badge>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterRating ?? ""}
              onChange={(e) => { setFilterRating(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
              className="rounded-lg border border-border bg-background/80 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
            >
              <option value="">All ratings</option>
              {[5, 4, 3, 2, 1, 0].map((r) => (
                <option key={r} value={r}>{r} star{r !== 1 ? "s" : ""}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading feedback...
          </div>
        ) : data && data.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 px-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No feedback submissions yet.</p>
          </div>
        ) : data ? (
          <div className="divide-y divide-border">
            {data.data.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                <div className="shrink-0 mt-0.5">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-foreground overflow-hidden">
                    {item.user?.avatarUrl ? (
                      <img src={item.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      `${item.user?.firstName?.[0] || ""}${item.user?.lastName?.[0] || "?"}`
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {item.user ? `${item.user.firstName} ${item.user.lastName}` : `User #${item.userId || "?"}`}
                    </span>
                    <StarDisplay rating={item.rating} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {item.message ? (
                    <button
                      onClick={() => setViewMessage(item)}
                      className="mt-1 text-xs text-muted-foreground text-left line-clamp-2 hover:text-foreground transition-colors cursor-pointer"
                    >
                      {item.message}
                    </button>
                  ) : (
                    <p className="mt-1 text-xs italic text-muted-foreground/50">No message</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => setDeleteConfirm(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} ({data.total} total)
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* View Message Dialog */}
      <Dialog open={!!viewMessage} onOpenChange={() => setViewMessage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StarDisplay rating={viewMessage?.rating || 0} size="md" />
            </DialogTitle>
            <DialogDescription>
              From {viewMessage?.user ? `${viewMessage.user.firstName} ${viewMessage.user.lastName}` : "Unknown"} · {viewMessage?.createdAt ? new Date(viewMessage.createdAt).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{viewMessage?.message || "(no message)"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewMessage(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Feedback</DialogTitle>
            <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm !== null && handleDelete(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}