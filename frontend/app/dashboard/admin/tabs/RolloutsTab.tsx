"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, RefreshCw, Edit, Trash2, Beaker, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

type Override = {
  id: number
  userId: number
  createdAt: string
}

type Rollout = {
  id: number
  name: string
  description: string
  key: string
  active: boolean
  hashRangeStart: number
  hashRangeEnd: number
  treatment: string
  overrideCount: number
  overrides: Override[]
  createdAt: string
  updatedAt: string
}

const EMPTY_FORM = {
  name: "",
  description: "",
  key: "",
  active: true,
  hashRangeStart: 0,
  hashRangeEnd: 9999,
  treatment: "treatment",
}

export default function RolloutsTab() {
  const [rollouts, setRollouts] = useState<Rollout[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Rollout | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [testUserId, setTestUserId] = useState("")
  const [testResult, setTestResult] = useState<{ bucket: number; inRange: boolean } | null>(null)

  const [overrideNewIds, setOverrideNewIds] = useState<Record<number, string>>({})
  const [initialOverrideId, setInitialOverrideId] = useState("")
  const [overrideAddingIds, setOverrideAddingIds] = useState<Record<number, boolean>>({})
  const [overrideErrors, setOverrideErrors] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.adminRollouts)
      setRollouts(Array.isArray(data) ? data : [])
    } catch {
      setRollouts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setEditTarget(null)
    setInitialOverrideId("")
    setDialogOpen(true)
  }

  const openEdit = (r: Rollout) => {
    setForm({
      name: r.name,
      description: r.description || "",
      key: r.key,
      active: r.active,
      hashRangeStart: r.hashRangeStart,
      hashRangeEnd: r.hashRangeEnd,
      treatment: r.treatment,
    })
    setFormError("")
    setEditTarget(r)
    setDialogOpen(true)
  }

  const submitForm = async () => {
    if (!form.name.trim()) { setFormError("Name is required"); return }
    if (!form.key.trim()) { setFormError("Key is required"); return }

    setSaving(true)
    setFormError("")

    const body: any = {
      name: form.name.trim(),
      key: form.key.trim(),
      description: form.description.trim(),
      active: form.active,
      hashRangeStart: Number(form.hashRangeStart),
      hashRangeEnd: Number(form.hashRangeEnd),
      treatment: form.treatment.trim(),
    }

    try {
      if (editTarget) {
        const updated = await apiFetch(
          API_ENDPOINTS.adminRolloutDetail.replace(":id", String(editTarget.id)),
          { method: "PUT", body: JSON.stringify(body) },
        )
        setRollouts((prev) => prev.map((r) => (r.id === editTarget.id ? { ...updated, overrides: r.overrides, overrideCount: r.overrideCount } : r)))
      } else {
        const created = await apiFetch(API_ENDPOINTS.adminRollouts, {
          method: "POST",
          body: JSON.stringify(body),
        })
        const newRollout = { ...created, overrideCount: 0, overrides: [] }
        if (initialOverrideId.trim()) {
          const uid = Number(initialOverrideId.trim())
          if (uid && !isNaN(uid)) {
            try {
              const ov = await apiFetch(
                `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(created.id))}/overrides`,
                { method: "POST", body: JSON.stringify({ userId: uid }) },
              )
              newRollout.overrideCount = 1
              newRollout.overrides = [ov]
            } catch {}
          }
        }
        setRollouts((prev) => [newRollout, ...prev])
      }
      setDialogOpen(false)
    } catch (e: any) {
      setFormError(e?.message || "Failed to save rollout")
    } finally {
      setSaving(false)
    }
  }

  const deleteRollout = async (id: number) => {
    try {
      await apiFetch(API_ENDPOINTS.adminRolloutDetail.replace(":id", String(id)), {
        method: "DELETE",
      })
      setRollouts((prev) => prev.filter((r) => r.id !== id))
      setDeleteConfirm(null)
    } catch (e: any) {
      alert(e?.message || "Failed to delete rollout")
    }
  }

  const testRollout = () => {
    const uid = testUserId.trim()
    if (!uid) { setTestResult(null); return }
    const HASH_RANGE = 10000
    const input = `${form.key}:${uid}`
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    const bucket = Math.abs(hash) % HASH_RANGE
    const start = Number(form.hashRangeStart)
    const end = Number(form.hashRangeEnd)
    setTestResult({ bucket, inRange: bucket >= start && bucket <= end })
  }

  const coverage = (r: Rollout) => {
    const total = 10000
    const range = r.hashRangeEnd - r.hashRangeStart + 1
    return ((range / total) * 100).toFixed(1)
  }

  // ─── Override management ─────────────────────────────────────────────

  const addOverride = async (rolloutId: number) => {
    const uidStr = (overrideNewIds[rolloutId] || "").trim()
    if (!uidStr) return
    const uid = Number(uidStr)
    if (!uid || isNaN(uid)) {
      setOverrideErrors((prev) => ({ ...prev, [rolloutId]: "Enter a valid numeric user ID" }))
      return
    }

    setOverrideAddingIds((prev) => ({ ...prev, [rolloutId]: true }))
    setOverrideErrors((prev) => ({ ...prev, [rolloutId]: "" }))
    try {
      const created = await apiFetch(
        `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(rolloutId))}/overrides`,
        { method: "POST", body: JSON.stringify({ userId: uid }) },
      ) as { id: number; userId: number; createdAt: string }
      setOverrideNewIds((prev) => ({ ...prev, [rolloutId]: "" }))
      setRollouts((prev) => prev.map((r) =>
        r.id === rolloutId
          ? { ...r, overrideCount: r.overrideCount + 1, overrides: [...(r.overrides || []), created] }
          : r
      ))
    } catch (e: any) {
      setOverrideErrors((prev) => ({ ...prev, [rolloutId]: e?.message || "Failed to add override" }))
    } finally {
      setOverrideAddingIds((prev) => ({ ...prev, [rolloutId]: false }))
    }
  }

  const removeOverride = async (rolloutId: number, userId: number) => {
    try {
      await apiFetch(
        `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(rolloutId))}/overrides/${userId}`,
        { method: "DELETE" },
      )
      setRollouts((prev) => prev.map((r) =>
        r.id === rolloutId
          ? { ...r, overrideCount: r.overrideCount - 1, overrides: r.overrides.filter((o) => o.userId !== userId) }
          : r
      ))
    } catch (e: any) {
      alert(e?.message || "Failed to remove override")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading rollouts...
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Feature Rollouts</p>
            <Badge variant="outline" className="text-xs">{rollouts.length}</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Rollout
            </Button>
          </div>
        </div>

        {rollouts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 px-4">
            <Beaker className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No rollouts configured yet.</p>
            <p className="text-xs text-muted-foreground/60">Create your first rollout to start A/B testing features with murmurhash-based bucketing.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rollouts.map((r) => (
              <div key={r.id}>
                <div className="flex items-start gap-4 px-4 py-3.5 hover:bg-secondary/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <Badge variant={r.active ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                        {r.active ? "active" : "inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <code className="text-[11px] bg-secondary/50 px-1 rounded">{r.key}</code>
                      {" · "}Range: {r.hashRangeStart}–{r.hashRangeEnd} ({coverage(r)}%)
                      {" · "}Treatment: <code className="text-[11px]">{r.treatment}</code>
                    </p>
                    {r.description && (
                      <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{r.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(r)}
                      title="Edit rollout"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(r.id)}
                      title="Delete rollout"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border bg-secondary/10 px-4 py-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    User Overrides — users added here bypass the hash bucket and are always included.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={overrideNewIds[r.id] || ""}
                      onChange={(e) => {
                        setOverrideNewIds((prev) => ({ ...prev, [r.id]: e.target.value }))
                        setOverrideErrors((prev) => ({ ...prev, [r.id]: "" }))
                      }}
                      placeholder="Enter user ID..."
                      className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                      onKeyDown={(e) => { if (e.key === "Enter") addOverride(r.id) }}
                    />
                    <Button
                      size="sm"
                      onClick={() => addOverride(r.id)}
                      disabled={overrideAddingIds[r.id] || !(overrideNewIds[r.id] || "").trim()}
                    >
                      {overrideAddingIds[r.id] ? "..." : "Add"}
                    </Button>
                  </div>
                  {overrideErrors[r.id] && (
                    <p className="text-xs text-destructive">{overrideErrors[r.id]}</p>
                  )}

                  {(r.overrides || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 py-1">No overrides yet.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {(r.overrides || []).map((o) => (
                        <div key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-foreground">User #{o.userId}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeOverride(r.id, o.userId)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create/Edit Dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Rollout" : "New Rollout"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Modify the rollout configuration. Users are assigned via murmurhash of their ID."
                : "Create a new feature rollout. Users are assigned to buckets using murmurhash of `key:userId`."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {formError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{formError}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="New Dashboard"
                  className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Feature Key</label>
                <input
                  type="text"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="new_dashboard_v2"
                  className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description of the feature"
                className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Hash Range Start (0–9999)</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.hashRangeStart}
                  onChange={(e) => setForm({ ...form, hashRangeStart: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Hash Range End (0–9999)</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.hashRangeEnd}
                  onChange={(e) => setForm({ ...form, hashRangeEnd: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Coverage: <strong>{form.hashRangeEnd - form.hashRangeStart + 1}/10000</strong> users
              ({(((form.hashRangeEnd - form.hashRangeStart + 1) / 10000) * 100).toFixed(1)}%)
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Treatment Name</label>
                <input
                  type="text"
                  value={form.treatment}
                  onChange={(e) => setForm({ ...form, treatment: e.target.value })}
                  placeholder="treatment"
                  className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
              <div className="flex items-end space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded border-border"
                  />
                  Active
                </label>
              </div>
            </div>

            {/* Overrides section inside dialog */}
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">User Overrides</p>
              <p className="text-[11px] text-muted-foreground">Override users bypass the hash bucket and are always included.</p>

              {editTarget ? (
                <>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={overrideNewIds[editTarget.id] || ""}
                      onChange={(e) => {
                        setOverrideNewIds((prev) => ({ ...prev, [editTarget.id]: e.target.value }))
                        setOverrideErrors((prev) => ({ ...prev, [editTarget.id]: "" }))
                      }}
                      placeholder="Enter user ID..."
                      className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                      onKeyDown={(e) => { if (e.key === "Enter") addOverride(editTarget.id) }}
                    />
                    <Button
                      size="sm"
                      onClick={() => addOverride(editTarget.id)}
                      disabled={overrideAddingIds[editTarget.id] || !(overrideNewIds[editTarget.id] || "").trim()}
                    >
                      {overrideAddingIds[editTarget.id] ? "..." : "Add"}
                    </Button>
                  </div>
                  {overrideErrors[editTarget.id] && (
                    <p className="text-xs text-destructive">{overrideErrors[editTarget.id]}</p>
                  )}
                  {(editTarget.overrides || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 py-1">No overrides yet.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {(editTarget.overrides || []).map((o) => (
                        <div key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-1.5">
                          <span className="text-sm font-mono text-foreground">User #{o.userId}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive hover:text-destructive"
                            onClick={() => removeOverride(editTarget.id, o.userId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={initialOverrideId}
                    onChange={(e) => setInitialOverrideId(e.target.value)}
                    placeholder="Enter user ID..."
                    className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Test bucket */}
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Test Bucket Assignment</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testUserId}
                  onChange={(e) => setTestUserId(e.target.value)}
                  placeholder="Enter user ID to test"
                  className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
                <Button size="sm" variant="outline" onClick={testRollout}>
                  Test
                </Button>
              </div>
              {testResult !== null && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Bucket:</span>
                  <code className="bg-secondary/50 px-1.5 rounded">{testResult.bucket}</code>
                  <Badge
                    variant={testResult.inRange ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {testResult.inRange ? "IN RANGE" : "OUTSIDE RANGE"}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={saving}>
              {saving ? "Saving..." : editTarget ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Rollout</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rollout? This action cannot be undone. User overrides will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm !== null && deleteRollout(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}