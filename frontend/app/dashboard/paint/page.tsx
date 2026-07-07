"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Trash2, Search, Paintbrush, ExternalLink, ImageIcon, Clock, MoreHorizontal } from "lucide-react"
import { formatDistanceToNow } from "date-fns/formatDistanceToNow"

interface PaintItem {
  id: number
  title: string
  description: string | null
  thumbnail: string | null
  width: number
  height: number
  createdAt: string
  updatedAt: string
}

export default function PaintGalleryPage() {
  const router = useRouter()
  const [paintings, setPaintings] = useState<PaintItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)
  const [canvasHeight, setCanvasHeight] = useState(600)

  const loadPaintings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      const data = await apiFetch(`${API_ENDPOINTS.paints}?${params}`)
      setPaintings(data?.data || [])
    } catch {
      setPaintings([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    loadPaintings()
  }, [loadPaintings])

  const createNew = async () => {
    const res = await apiFetch(API_ENDPOINTS.paints, {
      method: "POST",
      body: JSON.stringify({
        title: newTitle.trim() || "Untitled",
        width: canvasWidth,
        height: canvasHeight,
      }),
    })
    if (res?.id) {
      router.push(`/dashboard/paint/${res.id}`)
    }
    setShowNewDialog(false)
    setNewTitle("")
  }

  const deletePainting = async () => {
    if (!deleteId) return
    await apiFetch(API_ENDPOINTS.paint.replace(":id", String(deleteId)), {
      method: "DELETE",
    })
    setDeleteId(null)
    loadPaintings()
  }

  return (
    <FeatureGuard feature="paint">
      <RolloutGuard rolloutKey="paint" fallback={
        <div className="flex flex-col items-center justify-center py-24 px-6 gap-4 max-w-md mx-auto text-center">
          <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center">
            <Paintbrush className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Ecli Paint is being rolled out</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">This feature is being gradually released. It should be available to you soon.</p>
          </div>
        </div>
      }>
        <PanelHeader title="Ecli Paint" description="Create and manage your digital paintings" />
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Toolbar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search paintings..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Painting
              </Button>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <div className="aspect-[4/3] bg-muted rounded-t-lg" />
                    <CardFooter className="p-3">
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : paintings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Paintbrush className="h-16 w-16 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-2">No paintings yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Create your first painting to get started. You can draw, paint, and export your creations.
                </p>
                <Button onClick={() => setShowNewDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Painting
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paintings.map((p) => (
                  <Card
                    key={p.id}
                    className="group cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                    onClick={() => router.push(`/dashboard/paint/${p.id}`)}
                  >
                    <div className="aspect-[4/3] bg-muted relative overflow-hidden flex items-center justify-center">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteId(p.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <CardFooter className="p-3 flex flex-col items-start gap-1">
                      <p className="font-medium text-sm truncate w-full">{p.title}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* New Painting Dialog */}
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Painting</DialogTitle>
                <DialogDescription>
                  Give your painting a name and choose the canvas size.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title</label>
                  <Input
                    placeholder="Untitled"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Width (px)</label>
                    <Input
                      type="number"
                      value={canvasWidth}
                      onChange={(e) => setCanvasWidth(Number(e.target.value))}
                      min={100}
                      max={4096}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Height (px)</label>
                    <Input
                      type="number"
                      value={canvasHeight}
                      onChange={(e) => setCanvasHeight(Number(e.target.value))}
                      min={100}
                      max={4096}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createNew}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Painting</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this painting? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteId(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={deletePainting}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ScrollArea>
      </RolloutGuard>
    </FeatureGuard>
  )
}
