"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Pipette } from "lucide-react"

const PRESET_COLORS = [
  "#000000", "#1a1a1a", "#333333", "#666666", "#999999", "#cccccc", "#ffffff",
  "#ff3b30", "#ff6b35", "#ff9500", "#ffcc00", "#34c759", "#007aff", "#5856d6",
  "#ff2d55", "#af52de", "#5ac8fa", "#4cd964", "#ff6b6b", "#ffd93d", "#6bcb77",
  "#4d96ff", "#c77dff", "#f77f00", "#d62828", "#023e8a", "#1b4332", "#6d2b00",
]

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  compact?: boolean
}

export function ColorPicker({ color, onChange, compact = false }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(color.replace('#', ''))
  const [activeTab, setActiveTab] = useState<'swatches' | 'custom'>('swatches')

  useEffect(() => {
    setHexInput(color.replace('#', ''))
  }, [color])

  const handleHexChange = (val: string) => {
    const clean = val.replace('#', '')
    setHexInput(clean)
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      onChange('#' + clean)
    }
  }

  return (
    <div className="w-full space-y-3">
      {/* Current color + hex input */}
      <div className="flex items-center gap-2">
        <div
          className="h-9 w-9 rounded-lg border border-white/10 shrink-0 cursor-pointer shadow-inner"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 flex items-center bg-[#1a1a1a] border border-white/10 rounded-lg px-2.5 h-9 gap-2">
          <span className="text-white/30 text-xs font-mono">#</span>
          <input
            type="text"
            value={hexInput.toUpperCase()}
            onChange={(e) => handleHexChange(e.target.value)}
            className="bg-transparent text-white/80 text-xs font-mono w-full outline-none"
            maxLength={6}
            placeholder="000000"
          />
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          id="native-color-picker"
        />
        <label
          htmlFor="native-color-picker"
          className="h-9 w-9 rounded-lg bg-[#1a1a1a] border border-white/10 flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] transition-colors shrink-0"
          title="Open color picker"
        >
          <Pipette className="h-3.5 w-3.5 text-white/40" />
        </label>
      </div>

      {/* Swatches */}
      <div className="grid grid-cols-7 gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={cn(
              "w-full aspect-square rounded-md border transition-all hover:scale-110",
              color.toLowerCase() === c.toLowerCase()
                ? "border-white/60 ring-1 ring-white/60 ring-offset-1 ring-offset-[#2a2a2a] scale-110"
                : "border-white/5 hover:border-white/20"
            )}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}