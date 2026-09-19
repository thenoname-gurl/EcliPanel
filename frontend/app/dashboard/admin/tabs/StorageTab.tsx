"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { RefreshCw, HardDrive, Loader2, Database } from "lucide-react"
import { apiFetch } from "@/lib/api-client"

interface StorageRow {
  userId: number
  email: string | null
  name: string | null
  quotaBytes: number
  usedBytes: number
  serverUuid: string
  nodeId: number
  updatedAt: string | null
}

interface StorageResponse {
  storageNode: { id: number; name: string; url: string; provider: string } | null
  servers: StorageRow[]
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v < 10 && u > 0 ? 2 : 1)} ${units[u]}`
}

const GIB_TO_BYTES = (gb: number) => Math.round(gb * 1024 * 1024 * 1024)

export default function StorageTab({ ctx }: { ctx: any }) {
  const [data, setData] = useState<StorageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [quotaGB, setQuotaGB] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/admin/storage")
      setData(res)
    } catch (e: any) {
      toast.error(e?.message || "Failed to load storage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (row: StorageRow) => {
    setEditingUserId(row.userId)
    setQuotaGB(String(Math.round((row.quotaBytes / 1024 / 1024 / 1024) * 100) / 100))
  }

  const saveQuota = async () => {
    const gb = Number(quotaGB)
    if (!editingUserId || !Number.isFinite(gb) || gb <= 0) {
      toast.error("Enter a positive quota in GB")
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/admin/storage/${editingUserId}/quota`, {
        method: "PUT",
        body: JSON.stringify({ quotaBytes: GIB_TO_BYTES(gb) }),
      })
      toast.success("Quota updated")
      setEditingUserId(null)
      await load()
    } catch (e: any) {
      toast.error(e?.message || "Failed to update quota")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Cloud Storage</h3>
              <p className="text-xs text-muted-foreground">
                {data?.storageNode
                  ? `Storage node: ${data.storageNode.name} (${data.storageNode.url})`
                  : "No storage node configured — mark a Wings node as storage node"}
              </p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin rounded-full" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/30">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Quota</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Node</th>
                <th className="px-4 py-3">Server</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : !data?.servers?.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No user storage provisioned yet. It is created automatically on registration or first office use.
                  </td>
                </tr>
              ) : (
                data.servers.map((row) => {
                  const pct = row.quotaBytes > 0 ? (row.usedBytes / row.quotaBytes) * 100 : 0
                  const editing = editingUserId === row.userId
                  return (
                    <tr key={row.userId} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-foreground">{row.name || row.email || `User #${row.userId}`}</div>
                        <div className="text-xs text-muted-foreground">{row.email ? row.email : `#${row.userId}`}</div>
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              step="0.5"
                              value={quotaGB}
                              onChange={(e) => setQuotaGB(e.target.value)}
                              className="w-24 border border-border bg-secondary/50 px-2 py-1 text-sm outline-none focus:border-primary/50"
                            />
                            <span className="text-xs text-muted-foreground">GB</span>
                          </div>
                        ) : (
                          formatBytes(row.quotaBytes)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className={`text-xs ${pct > 90 ? "text-destructive" : "text-muted-foreground"}`}>
                            {formatBytes(row.usedBytes)} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">#{row.nodeId}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.serverUuid.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" onClick={saveQuota} disabled={saving}>
                              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>Edit</Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {data?.servers?.length ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              <Database className="mr-1 inline h-3.5 w-3.5" />
              {data.servers.length} user{data.servers.length === 1 ? "" : "s"} provisioned
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}