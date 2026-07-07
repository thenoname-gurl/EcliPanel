"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { type BrushSettings } from "@/lib/paint-brush-engine"
import { Search, Download, Cloud, Loader2, Users } from "lucide-react"
import { toast } from "sonner"

interface CommunityBrush {
  id: number
  name: string
  tipShape: string
  settings: BrushSettings
  downloads: number
  previewData: string | null
  userId: number
}

interface BrushStoreProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload: (settings: BrushSettings, name: string) => void
  myBrushIds: number[]
}

export function BrushStore({ open, onOpenChange, onDownload, myBrushIds }: BrushStoreProps) {
  const [brushes, setBrushes] = useState<CommunityBrush[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const loadCommunity = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      const data = await apiFetch(`${API_ENDPOINTS.paintBrushCommunity}?${params}`)
      setBrushes(data?.data || [])
    } catch {
      setBrushes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadCommunity()
  }, [open, search])

  const handleDownload = async (brush: CommunityBrush) => {
    setDownloadingId(brush.id)
    try {
      const data = await apiFetch(API_ENDPOINTS.paintBrushDownload.replace(":id", String(brush.id)), { method: "POST" })
      if (data?.settings) {
        onDownload(data.settings, data.name || brush.name)
        toast.success(`"${brush.name}" downloaded!`)
        loadCommunity()
      }
    } catch {
      toast.error("Failed to download brush")
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Community Brushes</DialogTitle>
          <DialogDescription>
            Browse and download brushes shared by the community.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brushes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <ScrollArea className="flex-1 max-h-80">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : brushes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Cloud className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No community brushes yet</p>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {brushes.map((b) => {
                const isMine = myBrushIds.includes(b.id)
                return (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                    {/* Preview */}
                    <div className="w-10 h-8 rounded bg-muted-foreground/10 shrink-0 flex items-center justify-center overflow-hidden">
                      {b.previewData ? (
                        <img src={b.previewData} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div
                          className="rounded-full bg-foreground/40"
                          style={{ width: Math.max(3, (b.settings?.size || 12) / 4), height: Math.max(3, (b.settings?.size || 12) / 4) }}
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="capitalize">{b.tipShape}</span>
                        <span>·</span>
                        <span>{b.settings?.size || '?'}px</span>
                        <span>·</span>
                        <Users className="h-3 w-3" />
                        <span>{b.downloads}</span>
                      </div>
                    </div>

                    {/* Download */}
                    <Button
                      size="sm"
                      variant={isMine ? "ghost" : "secondary"}
                      className="h-7 text-xs shrink-0"
                      disabled={isMine || downloadingId === b.id}
                      onClick={() => handleDownload(b)}
                    >
                      {downloadingId === b.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isMine ? (
                        'Owned'
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" /> Get
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
