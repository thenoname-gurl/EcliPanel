"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  Beaker,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react"

type Override = {
  id: number
  userId: number
  treatment: string | null
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

type UserResult = {
  id: number
  email: string
  firstName: string
  lastName: string
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

function coveragePercent(r: Rollout) {
  return (((r.hashRangeEnd - r.hashRangeStart + 1) / 10000) * 100).toFixed(1)
}

function computeBucket(key: string, userId: string): number {
  const input = `${key}:${userId}`
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash) % 10000
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function UserSearchPopover({
  onSelect,
  excludeIds,
}: {
  onSelect: (user: UserResult) => void
  excludeIds: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    apiFetch(`${API_ENDPOINTS.adminUsers}?q=${encodeURIComponent(debouncedQuery)}`)
      .then((data: any) => {
        if (!cancelled) setResults(data?.users || [])
      })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQuery])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start text-muted-foreground font-normal flex-1">
          <Search className="h-3.5 w-3.5 mr-1.5 shrink-0" />
          {query || "Search users by name or email..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search users..."
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            {loading && (
              <div className="py-6 text-center text-xs text-muted-foreground">Searching...</div>
            )}
            {!loading && query.length >= 2 && results.length === 0 && (
              <CommandEmpty>No users found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.filter((u) => !excludeIds.has(u.id)).map((user) => (
                  <CommandItem
                    key={user.id}
                    value={String(user.id)}
                    onSelect={() => {
                      onSelect(user)
                      setQuery("")
                      setResults([])
                      setOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">#{user.id}</span>
                      <span className="truncate text-sm">{user.firstName} {user.lastName}</span>
                      <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {query.length < 2 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Type at least 2 characters to search.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const [testInputs, setTestInputs] = useState<Record<number, string>>({})
  const [testResults, setTestResults] = useState<Record<number, { bucket: number; inRange: boolean } | null>>({})

  const [overrideTreatments, setOverrideTreatments] = useState<Record<string, string>>({})

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
        setRollouts((prev) => prev.map((r) =>
          r.id === editTarget.id ? { ...updated, overrides: r.overrides, overrideCount: r.overrideCount } : r
        ))
      } else {
        const created = await apiFetch(API_ENDPOINTS.adminRollouts, {
          method: "POST",
          body: JSON.stringify(body),
        })
        setRollouts((prev) => [{ ...created, overrideCount: 0, overrides: [] }, ...prev])
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

  const testRollout = (rolloutId: number) => {
    const uid = (testInputs[rolloutId] || "").trim()
    if (!uid) { setTestResults((prev) => ({ ...prev, [rolloutId]: null })); return }
    const rollout = rollouts.find((r) => r.id === rolloutId)
    if (!rollout) return
    const bucket = computeBucket(rollout.key, uid)
    setTestResults((prev) => ({
      ...prev,
      [rolloutId]: { bucket, inRange: bucket >= rollout.hashRangeStart && bucket <= rollout.hashRangeEnd },
    }))
  }

  const addOverrideWithSearch = async (rolloutId: number, user: UserResult) => {
    try {
      const created = await apiFetch(
        `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(rolloutId))}/overrides`,
        { method: "POST", body: JSON.stringify({ userId: user.id }) },
      ) as Override
      setRollouts((prev) => prev.map((r) =>
        r.id === rolloutId
          ? { ...r, overrideCount: r.overrideCount + 1, overrides: [...(r.overrides || []), created] }
          : r
      ))
    } catch (e: any) {
      alert(e?.message || "Failed to add override")
    }
  }

  const addOverrideRaw = async (rolloutId: number) => {
    const uidStr = (overrideTreatments[`raw:${rolloutId}`] || "").trim()
    if (!uidStr || !/^\d+$/.test(uidStr)) return
    const uid = Number(uidStr)
    const treatment = overrideTreatments[`rawTreatment:${rolloutId}`]?.trim() || undefined
    try {
      const created = await apiFetch(
        `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(rolloutId))}/overrides`,
        { method: "POST", body: JSON.stringify({ userId: uid, treatment: treatment || undefined }) },
      ) as Override
      setRollouts((prev) => prev.map((r) =>
        r.id === rolloutId
          ? { ...r, overrideCount: r.overrideCount + 1, overrides: [...(r.overrides || []), created] }
          : r
      ))
      setOverrideTreatments((prev) => {
        const next = { ...prev }
        delete next[`raw:${rolloutId}`]
        delete next[`rawTreatment:${rolloutId}`]
        return next
      })
    } catch (e: any) {
      alert(e?.message || "Failed to add override")
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

  const updateOverrideTreatment = async (rolloutId: number, userId: number, treatment: string | null) => {
    try {
      await apiFetch(
        `${API_ENDPOINTS.adminRolloutDetail.replace(":id", String(rolloutId))}/overrides`,
        { method: "POST", body: JSON.stringify({ userId, treatment: treatment || undefined }) },
      )
      setRollouts((prev) => prev.map((r) =>
        r.id === rolloutId
          ? {
              ...r,
              overrides: r.overrides.map((o) =>
                o.userId === userId ? { ...o, treatment } : o
              ),
            }
          : r
      ))
    } catch (e: any) {
      alert(e?.message || "Failed to update override treatment")
    }
  }

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 rounded-full animate-spin" /> Loading rollouts...
      </div>
    )
  }

  return (
    <>
      <div className="border border-border bg-card">
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
            {rollouts.map((r) => {
              const isExpanded = expanded[r.id] !== false
              const overrideIds = new Set((r.overrides || []).map((o) => o.userId))
              return (
                <div key={r.id}>
                  <div className="flex items-start gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors">
                    <button
                      onClick={() => toggleExpanded(r.id)}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        <Badge variant={r.active ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                          {r.active ? "active" : "inactive"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                          {r.key}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>
                          Treatment: <code className="text-[11px] bg-secondary/50 px-1 rounded">{r.treatment}</code>
                        </span>
                        <span>
                          Coverage: <strong>{coveragePercent(r)}%</strong>
                        </span>
                        {(r.overrides?.length || 0) > 0 && (
                          <span>
                            <Users className="h-3 w-3 inline mr-0.5" />
                            {r.overrideCount} override{(r.overrideCount || 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">{r.description}</p>
                      )}
                      <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all"
                          style={{ width: `${Math.min(100, Number(coveragePercent(r)))}%` }}
                        />
                      </div>
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

                  {isExpanded && (
                    <div className="border-t border-border bg-secondary/10 px-4 py-3 space-y-4">
                      {/* Override section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-medium text-foreground">User Overrides</p>
                          <p className="text-[10px] text-muted-foreground">
                            — override users bypass the hash bucket and are always included.
                          </p>
                        </div>

                        {/* User search */}
                        <div className="flex gap-2 items-start">
                          <div className="flex-1">
                            <UserSearchPopover
                              onSelect={(user) => addOverrideWithSearch(r.id, user)}
                              excludeIds={overrideIds}
                            />
                          </div>
                        </div>

                        {/* Raw ID fallback + treatment */}
                        <div className="flex gap-2 items-center">
                          <Input
                            placeholder="Or enter user ID directly..."
                            value={overrideTreatments[`raw:${r.id}`] || ""}
                            onChange={(e) =>
                              setOverrideTreatments((prev) => ({ ...prev, [`raw:${r.id}`]: e.target.value }))
                            }
                            className="max-w-[180px] h-8 text-xs font-mono"
                            onKeyDown={(e) => { if (e.key === "Enter") addOverrideRaw(r.id) }}
                          />
                          <Input
                            placeholder="Treatment"
                            value={overrideTreatments[`rawTreatment:${r.id}`] || ""}
                            onChange={(e) =>
                              setOverrideTreatments((prev) => ({ ...prev, [`rawTreatment:${r.id}`]: e.target.value }))
                            }
                            className="max-w-[120px] h-8 text-xs font-mono"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => addOverrideRaw(r.id)}
                            disabled={!(overrideTreatments[`raw:${r.id}`] || "").trim()}
                          >
                            Add by ID
                          </Button>
                        </div>

                        {/* Override list */}
                        {(r.overrides || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground/50 py-1">No overrides yet.</p>
                        ) : (
                          <div className="max-h-48 overflow-y-auto space-y-1.5">
                            {(r.overrides || []).map((o) => (
                              <div key={o.id} className="flex items-center justify-between border border-border bg-secondary/20 px-3 py-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-sm font-mono text-foreground shrink-0">User #{o.userId}</span>
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      placeholder="treatment"
                                      value={o.treatment || ""}
                                      onChange={(e) => {
                                        const newTreatment = e.target.value || null
                                        setRollouts((prev) => prev.map((ro) =>
                                          ro.id === r.id
                                            ? {
                                                ...ro,
                                                overrides: ro.overrides.map((ov) =>
                                                  ov.id === o.id ? { ...ov, treatment: newTreatment } : ov
                                                ),
                                              }
                                            : ro
                                        ))
                                      }}
                                      onBlur={() => {
                                        const current = (r.overrides || []).find((ov) => ov.id === o.id)
                                        if (current) updateOverrideTreatment(r.id, o.userId, current.treatment)
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          const current = (r.overrides || []).find((ov) => ov.id === o.id)
                                          if (current) updateOverrideTreatment(r.id, o.userId, current.treatment)
                                        }
                                      }}
                                      className="h-6 w-[130px] text-[11px] font-mono"
                                    />
                                    {!o.treatment && (
                                      <span className="text-[10px] text-muted-foreground/50 italic">
                                        (inherits &quot;{r.treatment}&quot;)
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => removeOverride(r.id, o.userId)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Test bucket */}
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-foreground">Test Bucket Assignment</p>
                        </div>
                        <div className="flex gap-2 mt-1.5">
                          <Input
                            value={testInputs[r.id] || ""}
                            onChange={(e) => {
                              setTestInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                              setTestResults((prev) => ({ ...prev, [r.id]: null }))
                            }}
                            placeholder="Enter user ID to test..."
                            className="max-w-[200px] h-8 text-xs font-mono"
                            onKeyDown={(e) => { if (e.key === "Enter") testRollout(r.id) }}
                          />
                          <Button size="sm" variant="outline" className="h-8" onClick={() => testRollout(r.id)}>
                            Test
                          </Button>
                        </div>
                        {testResults[r.id] !== undefined && testResults[r.id] !== null && (
                          <div className="flex items-center gap-2 mt-1.5 text-xs">
                            <span className="text-muted-foreground">Bucket:</span>
                            <code className="bg-secondary/50 px-1.5 rounded text-[11px]">{testResults[r.id]!.bucket}</code>
                            <Badge
                              variant={testResults[r.id]!.inRange ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {testResults[r.id]!.inRange ? "IN RANGE" : "OUTSIDE RANGE"}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
                  className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Feature Key</label>
                <input
                  type="text"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="new_dashboard_v2"
                  className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
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
                className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
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
                  className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
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
                  className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{
                    width: `${Math.min(100, (((form.hashRangeEnd - form.hashRangeStart + 1) / 10000) * 100))}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {form.hashRangeEnd - form.hashRangeStart + 1}/10000
                ({(((form.hashRangeEnd - form.hashRangeStart + 1) / 10000) * 100).toFixed(1)}%)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Treatment Name</label>
                <input
                  type="text"
                  value={form.treatment}
                  onChange={(e) => setForm({ ...form, treatment: e.target.value })}
                  placeholder="treatment"
                  className="w-full border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
              <div className="flex items-end space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="border-border"
                  />
                  Active
                </label>
              </div>
            </div>

            {/* Test bucket in dialog */}
            <div className="border border-border bg-secondary/20 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Test Bucket Assignment</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="dialog-test-user"
                  placeholder="Enter user ID to test"
                  className="flex-1 border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
                  onChange={() => {}}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById("dialog-test-user") as HTMLInputElement
                    const uid = input?.value?.trim()
                    if (!uid) return
                    const bucket = computeBucket(form.key, uid)
                    const inRange = bucket >= form.hashRangeStart && bucket <= form.hashRangeEnd
                    setFormError(`Bucket: ${bucket} — ${inRange ? "IN RANGE" : "OUTSIDE RANGE"}`)
                  }}
                >
                  Test
                </Button>
              </div>
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
