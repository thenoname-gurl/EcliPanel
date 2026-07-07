"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BrushEditor } from "./BrushEditor"
import { BrushStore } from "./BrushStore"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PRESET_BRUSHES, type BrushSettings } from "@/lib/paint-brush-engine"
import { Paintbrush, Settings2, Store, Plus, ChevronDown } from "lucide-react"
import { toast } from "sonner"

export interface SavedBrush {
  id: number
  name: string
  tipShape: string
  settings: BrushSettings
  isPublic: boolean
  downloads: number
  previewData: string | null
}

interface BrushSelectorProps {
  currentSettings: BrushSettings
  currentName: string
  onSelect: (name: string, settings: BrushSettings) => void
  currentColor: string
  onColorChange: (color: string) => void
}

export function BrushSelector({ currentSettings, currentName, onSelect, currentColor, onColorChange }: BrushSelectorProps) {
  const [open, setOpen] = useState(false)
  const [savedBrushes, setSavedBrushes] = useState<SavedBrush[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [editingBrush, setEditingBrush] = useState<SavedBrush | null>(null)

  const loadBrushes = async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.paintBrushes)
      setSavedBrushes(data || [])
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    if (open) loadBrushes()
  }, [open])

  const handleDeleteBrush = async (id: number) => {
    try {
      await apiFetch(API_ENDPOINTS.paintBrush.replace(":id", String(id)), { method: "DELETE" })
      setSavedBrushes(prev => prev.filter(b => b.id !== id))
      toast.success("Brush deleted")
    } catch {
      toast.error("Failed to delete brush")
    }
  }

  const handleSaveAsPreset = async (settings: BrushSettings, name: string) => {
    try {
      const previewCanvas = document.createElement("canvas")
      previewCanvas.width = 60
      previewCanvas.height = 40
      const pctx = previewCanvas.getContext("2d")
      if (pctx) {
        const half = settings.size / 4
        pctx.fillStyle = currentColor
        pctx.beginPath()
        pctx.arc(30, 20, Math.max(2, half), 0, Math.PI * 2)
        pctx.fill()
      }
      const previewData = previewCanvas.toDataURL()

      const res = await apiFetch(API_ENDPOINTS.paintBrushes, {
        method: "POST",
        body: JSON.stringify({ name, tipShape: settings.tipShape, settings, previewData }),
      })
      if (res?.id) {
        setSavedBrushes(prev => [...prev, res])
        onSelect(name, settings)
        toast.success(`Brush "${name}" saved`)
      }
    } catch {
      toast.error("Failed to save brush")
    }
    setShowEditor(false)
  }

  const handleStoreDownload = (settings: BrushSettings, name: string) => {
    onSelect(name, settings)
    setShowStore(false)
    setOpen(false)
  }

  const brushThumb = (tipShape: string, size: number, preview?: string | null) => {
    if (preview) return <img src={preview} alt="" className="w-full h-full object-contain" />
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="rounded-full bg-foreground/80"
          style={{ width: Math.max(4, size / 3), height: Math.max(4, size / 3) }}
        />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2">
              <Paintbrush className="h-3.5 w-3.5" />
              <span className="text-xs max-w-[80px] truncate">{currentName}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-72 p-0">
            <div className="p-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Brushes</span>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowStore(true); setOpen(false) }}>
                      <Store className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Community Store</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingBrush(null); setShowEditor(true) }}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Create New Brush</p></TooltipContent>
                </Tooltip>
              </div>
            </div>
            <ScrollArea className="max-h-72">
              {/* Preset Brushes */}
              <div className="p-1">
                <p className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">Presets</p>
                {PRESET_BRUSHES.map((b) => (
                  <button
                    key={b.name}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
                    onClick={() => { onSelect(b.name, b.settings as BrushSettings); setOpen(false) }}
                  >
                    <span className="text-lg w-5 text-center shrink-0">{b.icon}</span>
                    <span className="truncate">{b.name}</span>
                    {currentName === b.name && <span className="ml-auto text-primary text-xs">✓</span>}
                  </button>
                ))}
              </div>

              {/* Saved Brushes */}
              {savedBrushes.length > 0 && (
                <div className="p-1 border-t border-border">
                  <p className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">My Brushes</p>
                  {savedBrushes.map((b) => (
                    <div key={b.id} className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors">
                      <button
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        onClick={() => { onSelect(b.name, b.settings); setOpen(false) }}
                      >
                        <span className="w-6 h-5 shrink-0 flex items-center justify-center">
                          {brushThumb(b.tipShape, b.settings?.size || 12, b.previewData)}
                        </span>
                        <span className="text-sm truncate">{b.name}</span>
                        {currentName === b.name && <span className="ml-auto text-primary text-xs">✓</span>}
                      </button>
                      <button
                        className="h-6 w-6 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                        onClick={() => { setEditingBrush(b); setShowEditor(true) }}
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                      <button
                        className="h-6 w-6 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteBrush(b.id)}
                      >
                        <span className="text-xs">✕</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <BrushEditor
          open={showEditor}
          onOpenChange={(v) => { setShowEditor(v); if (!v) setEditingBrush(null) }}
          initialSettings={editingBrush?.settings || currentSettings}
          initialName={editingBrush?.name || ""}
          onSave={handleSaveAsPreset}
        />

        <BrushStore
          open={showStore}
          onOpenChange={setShowStore}
          onDownload={handleStoreDownload}
          myBrushIds={savedBrushes.map(b => b.id)}
        />
      </>
    </TooltipProvider>
  )
}
