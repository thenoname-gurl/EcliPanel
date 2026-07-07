"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useToast } from "@/hooks/use-toast"
import { useEffect, useState } from "react"
import {
  Trash2,
  Edit,
  Loader2,
  RefreshCw,
  Hash,
  Globe,
  MessageSquare,
} from "lucide-react"

interface ChannelData {
  id: number
  slug: string
  name: string
  description: string | null
  type: "community" | "public_anonymous"
  createdById: number | null
  isListed: boolean
  isArchived: boolean
  createdAt: string
  threadCount?: number
  postCount?: number
}

export default function ChatTab({ ctx }: { ctx: any }) {
  const { toast } = useToast()

  const [channels, setChannels] = useState<ChannelData[]>([])
  const [loading, setLoading] = useState(true)

  const [editDialog, setEditDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<ChannelData | null>(null)
  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ChannelData | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchChannels() {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.chatChannelsAll)
      if (Array.isArray(data)) setChannels(data as ChannelData[])
    } catch {
      toast({ title: "Failed to load channels", variant: "destructive" })
    }
    setLoading(false)
  }

  useEffect(() => { fetchChannels() }, [])

  function openEdit(ch: ChannelData) {
    setEditTarget(ch)
    setEditName(ch.name)
    setEditSlug(ch.slug)
    setEditDescription(ch.description || "")
    setEditDialog(true)
  }

  async function saveEdit() {
    if (!editTarget || !editName.trim() || saving) return
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (editName.trim() !== editTarget.name) body.name = editName.trim()
      const newSlug = editSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64)
      if (editSlug.trim() !== editTarget.slug) {
        if (newSlug.length < 1) {
          toast({ title: "Slug cannot be empty", variant: "destructive" })
          setSaving(false)
          return
        }
        if (newSlug !== editTarget.slug) body.slug = newSlug
      }
      if (editDescription.trim() !== (editTarget.description || "")) body.description = editDescription.trim() || ""
      if (Object.keys(body).length === 0) { setEditDialog(false); setSaving(false); return }
      const updated = await apiFetch(API_ENDPOINTS.chatChannel.replace(":id", String(editTarget.id)), {
        method: "PUT",
        body: JSON.stringify(body),
      })
      if (updated) {
        setChannels(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...updated } as ChannelData : c))
        toast({ title: "Channel updated" })
        setEditDialog(false)
      }
    } catch { toast({ title: "Failed to update channel", variant: "destructive" }) }
    setSaving(false)
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await apiFetch(API_ENDPOINTS.chatChannel.replace(":id", String(deleteTarget.id)), { method: "DELETE" })
      setChannels(prev => prev.filter(c => c.id !== deleteTarget.id))
      toast({ title: "Channel archived" })
      setDeleteTarget(null)
    } catch { toast({ title: "Failed to delete channel", variant: "destructive" }) }
    setDeleting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Chat Channels</h2>
          <Badge variant="secondary" className="text-[10px]">{channels.length}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/40">No channels found</p>
        </div>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground/60">Name</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground/60">Slug</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground/60">Type</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground/60">Threads</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground/60">Posts</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground/60">Status</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, i) => (
                <tr key={ch.id} className={`border-b border-border/30 ${i % 2 === 0 ? "bg-muted/10" : ""} hover:bg-muted/20 transition-colors`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {ch.type === "public_anonymous" ? <Globe className="h-3 w-3 text-primary/50" /> : <Hash className="h-3 w-3 text-primary/50" />}
                      <span className="font-medium text-foreground/80">{ch.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-muted-foreground/60">/{ch.slug}/</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {ch.type === "public_anonymous" ? "Public" : "Community"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground/60">{ch.threadCount ?? "-"}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground/60">{ch.postCount ?? "-"}</td>
                  <td className="px-3 py-2.5 text-center">
                    {ch.isArchived ? (
                      <Badge variant="destructive" className="text-[9px]">Archived</Badge>
                    ) : (
                      <Badge variant="default" className="text-[9px] bg-green-500/20 text-green-500 hover:bg-green-500/30">Active</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ch)} title="Edit">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => setDeleteTarget(ch)} title="Archive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/60">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-muted/50 border-border/50 text-xs h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/60">Slug</Label>
              <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="bg-muted/50 border-border/50 text-xs h-8 font-mono" />
              <p className="text-[9px] text-muted-foreground/30">Lowercase letters, numbers, and hyphens</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/60">Description</Label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2}
                className="w-full bg-muted/50 border border-border/50 rounded px-2.5 py-1.5 text-xs text-foreground/70 outline-none focus:border-primary/40 transition-colors resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEdit} disabled={!editName.trim() || saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Archive Channel</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground/60 leading-relaxed py-2">
            Are you sure you want to archive <strong className="text-foreground/80">{deleteTarget?.name}</strong>?
            All threads and replies will be hidden. This can be reversed by an admin.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
