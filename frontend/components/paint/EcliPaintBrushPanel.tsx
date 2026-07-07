"use client"

import { useState, useEffect } from "react"
import { PRESET_BRUSHES, type BrushSettings } from "@/lib/paint-brush-engine"
import { Slider } from "@/components/ui/slider"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { type SavedBrush } from "./BrushSelector"
import { BrushEditor } from "./BrushEditor"
import { BrushStore } from "./BrushStore"
import { Trash2, Check, Plus, Store } from "lucide-react"
import { toast } from "sonner"

interface Props {
  brushSettings: BrushSettings
  brushName: string
  onBrushSelect: (name: string, settings: BrushSettings) => void
  brushColor: string
}

export function EcliPaintBrushPanel({ brushSettings, brushName, onBrushSelect, brushColor }: Props) {
  const [savedBrushes, setSavedBrushes] = useState<SavedBrush[]>([])
  const [activeTab, setActiveTab] = useState<"presets" | "mine">("presets")
  const [showEditor, setShowEditor] = useState(false)
  const [showStore, setShowStore] = useState(false)

  const loadBrushes = async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.paintBrushes)
      setSavedBrushes(data || [])
    } catch {}
  }

  useEffect(() => {
    loadBrushes()
  }, [])

  const handleSaveAsPreset = async (settings: BrushSettings, name: string) => {
    try {
      const res = await apiFetch(API_ENDPOINTS.paintBrushes, {
        method: "POST",
        body: JSON.stringify({ name, tipShape: settings.tipShape, settings }),
      })
      if (res?.id) {
        setSavedBrushes(prev => [...prev, res])
        onBrushSelect(name, settings)
        toast.success(`Brush "${name}" saved`)
      }
    } catch {
      toast.error("Failed to save brush")
    }
    setShowEditor(false)
  }

  const handleStoreDownload = (settings: BrushSettings, name: string) => {
    onBrushSelect(name, settings)
    setShowStore(false)
  }

  const deleteBrush = async (id: number) => {
    await apiFetch(API_ENDPOINTS.paintBrush.replace(":id", String(id)), { method: "DELETE" })
    setSavedBrushes(p => p.filter(b => b.id !== id))
    toast.success("Brush deleted")
  }

  return (
    <div className="flex flex-col h-full text-white">
      <div className="px-4 py-3 border-b border-white/8">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white/80">Brushes</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowStore(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              title="Community Store"
            >
              <Store className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowEditor(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              title="Create New Brush"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex mt-2 gap-1">
          {(["presets", "mine"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
              style={{
                background: activeTab === tab ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)",
                color: activeTab === tab ? "#93c5fd" : "rgba(255,255,255,0.4)",
              }}
            >
              {tab === "mine" ? "My Brushes" : "Presets"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {activeTab === "presets" && PRESET_BRUSHES.map(b => {
          const active = brushName === b.name
          return (
            <button
              key={b.name}
              onClick={() => onBrushSelect(b.name, b.settings as BrushSettings)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
              style={{
                background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "transparent"}`,
              }}
            >
              <span className="text-2xl w-8 text-center shrink-0">{b.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/80 truncate">{b.name}</p>
                <p className="text-[10px] text-white/30">{b.settings.size}px &middot; {Math.round((b.settings.opacity ?? 1) * 100)}% opacity</p>
              </div>
              {active && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
            </button>
          )
        })}

        {activeTab === "mine" && savedBrushes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-white/25 text-sm">No saved brushes yet</p>
            <p className="text-white/15 text-xs mt-1">Create custom brushes via the Brush Editor</p>
          </div>
        )}

        {activeTab === "mine" && savedBrushes.map(b => {
          const active = brushName === b.name
          return (
            <div
              key={b.id}
              className="group flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
              style={{
                background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "transparent"}`,
              }}
            >
              <button className="flex-1 flex items-center gap-3 text-left" onClick={() => onBrushSelect(b.name, b.settings)}>
                {b.previewData ? (
                  <img src={b.previewData} alt="" className="w-8 h-6 object-contain rounded" />
                ) : (
                  <div className="w-8 h-6 rounded bg-white/10 flex items-center justify-center">
                    <div className="rounded-full bg-white/60" style={{ width: Math.max(3, (b.settings?.size || 12) / 5), height: Math.max(3, (b.settings?.size || 12) / 5) }} />
                  </div>
                )}
                <span className="text-xs text-white/70 truncate">{b.name}</span>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center text-red-400/60 hover:text-red-400 transition-all"
                onClick={() => deleteBrush(b.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/8 px-4 py-3 space-y-3">
        <p className="text-[11px] text-white/30 uppercase tracking-wider">Current Brush</p>
        <div className="space-y-2.5">
          <SliderRow label="Size" value={brushSettings.size} min={1} max={200} step={1}
            onChange={v => onBrushSelect(brushName, { ...brushSettings, size: v })} suffix="px" />
          <SliderRow label="Opacity" value={Math.round((brushSettings.opacity ?? 1) * 100)} min={1} max={100} step={1}
            onChange={v => onBrushSelect(brushName, { ...brushSettings, opacity: v / 100 })} suffix="%" />
          <SliderRow label="Hardness" value={brushSettings.hardness} min={0} max={100} step={1}
            onChange={v => onBrushSelect(brushName, { ...brushSettings, hardness: v })} suffix="%" />
        </div>
      </div>

      <BrushEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        initialSettings={brushSettings}
        initialName=""
        onSave={handleSaveAsPreset}
      />
      <BrushStore
        open={showStore}
        onOpenChange={setShowStore}
        onDownload={handleStoreDownload}
        myBrushIds={savedBrushes.map(b => b.id)}
      />
    </div>
  )
}

function SliderRow({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; suffix?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40">{label}</span>
        <span className="text-[11px] text-white/60 tabular-nums">{value}{suffix}</span>
      </div>
      <Slider
        value={[value]} onValueChange={([v]) => onChange(v)}
        min={min} max={max} step={step}
        className="[&>[data-slot=track]]:bg-white/10 [&>[data-slot=range]]:bg-blue-500"
      />
    </div>
  )
}
