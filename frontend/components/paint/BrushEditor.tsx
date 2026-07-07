"use client"

import { useState, useEffect } from "react"
import { type BrushSettings } from "@/lib/paint-brush-engine"
import { X, Save } from "lucide-react"
import { cn } from "@/lib/utils"

interface BrushEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSettings: BrushSettings
  initialName: string
  onSave: (settings: BrushSettings, name: string) => void
}

interface ProSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  suffix?: string
  accent?: string
}

function ProSlider({ label, value, min, max, step, onChange, suffix = '', accent = '#0a84ff' }: ProSliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className="text-[11px] text-white/70 font-mono tabular-nums">{value}{suffix}</span>
      </div>
      <div className="relative h-1.5 bg-white/10 rounded-full">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  )
}

export function BrushEditor({ open, onOpenChange, initialSettings, initialName, onSave }: BrushEditorProps) {
  const [name, setName] = useState(initialName)
  const [settings, setSettings] = useState<BrushSettings>(initialSettings)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setSettings(initialSettings)
    }
  }, [open, initialName, initialSettings])

  if (!open) return null

  const set = (partial: Partial<BrushSettings>) => setSettings(s => ({ ...s, ...partial }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-80 bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Brush Studio</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          {/* Name */}
          <div className="px-5 py-4 border-b border-white/5">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-2">Brush Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Brush"
              className="w-full bg-[#0a0a0a] border border-white/10 text-white text-sm px-3 py-2 rounded-lg outline-none focus:border-[#0a84ff]/50 transition-colors placeholder:text-white/20"
            />
          </div>

          {/* Tip Shape */}
          <div className="px-5 py-4 border-b border-white/5">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-3">Tip Shape</label>
            <div className="flex gap-2">
              {(['round', 'square'] as const).map((shape) => (
                <button
                  key={shape}
                  onClick={() => set({ tipShape: shape })}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all capitalize flex items-center justify-center gap-2",
                    settings.tipShape === shape
                      ? "bg-[#0a84ff]/20 border-[#0a84ff]/50 text-[#0a84ff]"
                      : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 border border-current",
                    shape === 'round' ? 'rounded-full' : 'rounded-sm'
                  )} />
                  {shape}
                </button>
              ))}
            </div>
          </div>

          {/* Properties */}
          <div className="px-5 py-4 space-y-4 border-b border-white/5">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block">Properties</label>
            <ProSlider label="Size" value={settings.size} min={1} max={200} step={1} suffix="px" onChange={v => set({ size: v })} />
            <ProSlider label="Opacity" value={Math.round(settings.opacity * 100)} min={1} max={100} step={1} suffix="%" onChange={v => set({ opacity: v / 100 })} />
            <ProSlider label="Flow" value={Math.round(settings.flow * 100)} min={1} max={100} step={1} suffix="%" onChange={v => set({ flow: v / 100 })} accent="#34c759" />
            <ProSlider label="Spacing" value={settings.spacing} min={1} max={100} step={1} suffix="px" onChange={v => set({ spacing: v })} />
            <ProSlider label="Hardness" value={settings.hardness} min={0} max={100} step={1} suffix="%" onChange={v => set({ hardness: v })} accent="#ff9500" />
            <ProSlider label="Scatter" value={settings.scatter} min={0} max={100} step={1} suffix="px" onChange={v => set({ scatter: v })} accent="#ff6b35" />
            <ProSlider label="Rotation" value={settings.rotation} min={0} max={360} step={1} suffix="°" onChange={v => set({ rotation: v })} accent="#af52de" />
          </div>

          {/* Dynamics */}
          <div className="px-5 py-4 space-y-4">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block">Dynamics</label>
            <ProSlider label="Size Jitter" value={settings.sizeJitter} min={0} max={100} step={1} suffix="%" onChange={v => set({ sizeJitter: v })} accent="#ff3b30" />
            <ProSlider label="Opacity Jitter" value={settings.opacityJitter} min={0} max={100} step={1} suffix="%" onChange={v => set({ opacityJitter: v })} accent="#ff3b30" />
            <ProSlider label="Rotation Jitter" value={settings.rotationJitter} min={0} max={360} step={1} suffix="°" onChange={v => set({ rotationJitter: v })} accent="#ff3b30" />
            <ProSlider label="Scatter Jitter" value={settings.scatterJitter} min={0} max={100} step={1} suffix="%" onChange={v => set({ scatterJitter: v })} accent="#ff3b30" />
            <ProSlider label="Hue Jitter" value={settings.hueJitter} min={0} max={360} step={1} suffix="°" onChange={v => set({ hueJitter: v })} accent="#5856d6" />
            <ProSlider label="Saturation Jitter" value={settings.saturationJitter} min={0} max={100} step={1} suffix="%" onChange={v => set({ saturationJitter: v })} accent="#5856d6" />
            <ProSlider label="Brightness Jitter" value={settings.brightnessJitter} min={0} max={100} step={1} suffix="%" onChange={v => set({ brightnessJitter: v })} accent="#5856d6" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(settings, name.trim() || 'Custom Brush')
              onOpenChange(false)
            }}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}