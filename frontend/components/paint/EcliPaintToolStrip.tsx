"use client"

import { useState, useRef, useCallback } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Pencil, Eraser, Fingerprint, Hand, MoreHorizontal,
  MousePointer2, PaintBucket, GripHorizontal, Pipette,
  Square, Circle, Minus, Triangle, Type, Gauge, Settings,
} from "lucide-react"

export type Tool = "select" | "brush" | "eraser" | "smudge" | "rect" | "circle" | "line" | "triangle" | "text" | "pan" | "fill" | "eyedropper" | "gradient"

const QUICK_TOOLS: { id: Tool; icon: typeof Pencil; label: string; shortcut: string }[] = [
  { id: "brush", icon: Pencil, label: "Brush", shortcut: "B" },
  { id: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
  { id: "smudge", icon: Fingerprint, label: "Smudge", shortcut: "S" },
  { id: "pan", icon: Hand, label: "Pan", shortcut: "H" },
]

const MENU_TOOLS: { id: Tool; icon: typeof Pencil; label: string; shortcut: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "fill", icon: PaintBucket, label: "Fill", shortcut: "G" },
  { id: "gradient", icon: GripHorizontal, label: "Gradient", shortcut: "" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", shortcut: "I" },
  { id: "rect", icon: Square, label: "Rectangle", shortcut: "R" },
  { id: "circle", icon: Circle, label: "Ellipse", shortcut: "C" },
  { id: "line", icon: Minus, label: "Line", shortcut: "L" },
  { id: "triangle", icon: Triangle, label: "Triangle", shortcut: "" },
  { id: "text", icon: Type, label: "Text", shortcut: "T" },
]

interface EcliPaintToolStripProps {
  activeTool: Tool
  onToolChange: (t: Tool) => void
  brushSize: number
  onBrushSizeChange: (v: number) => void
  brushOpacity: number
  onBrushOpacityChange: (v: number) => void
  pressureSensitive: boolean
  onPressureToggle: () => void
  onOpenSettings: () => void
}

export function EcliPaintToolStrip({
  activeTool, onToolChange, brushSize, onBrushSizeChange, brushOpacity, onBrushOpacityChange,
  pressureSensitive, onPressureToggle, onOpenSettings,
}: EcliPaintToolStripProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pos, setPos] = useState({ x: 12, y: 0 })
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const stripRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, [role='slider']")) return
    draggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setPos({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy })
  }, [])

  const handlePointerUp = useCallback(() => { draggingRef.current = false }, [])

  return (
    <TooltipProvider>
      <div
        ref={stripRef}
        className="fixed z-30 flex flex-col items-center gap-1 py-3 px-2 rounded-2xl select-none"
        style={{
          left: pos.x,
          top: pos.y ? `${pos.y}px` : "50%",
          transform: pos.y ? "none" : "translateY(-50%)",
          background: "rgba(22,22,22,0.88)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          cursor: draggingRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Drag handle indicator */}
        <div className="w-4 h-0.5 rounded-full bg-white/15 mb-1" />

        {QUICK_TOOLS.map((tool) => {
          const active = activeTool === tool.id
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToolChange(tool.id)}
                  className="relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-150"
                  style={{
                    background: active ? "rgba(139,92,246,0.35)" : "transparent",
                    color: active ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                    border: `1px solid ${active ? "rgba(139,92,246,0.6)" : "transparent"}`,
                    boxShadow: active ? "0 0 12px rgba(139,92,246,0.25)" : "none",
                  }}
                >
                  <tool.icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">
                <div className="flex items-center gap-2">
                  <span>{tool.label}</span>
                  {tool.shortcut && (
                    <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{tool.shortcut}</kbd>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}

        <div className="w-5 h-px bg-white/10 my-1" />

        {/* More tools menu */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-150"
                style={{
                  background: menuOpen || MENU_TOOLS.some(t => t.id === activeTool) ? "rgba(139,92,246,0.25)" : "transparent",
                  color: menuOpen ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                  border: `1px solid ${menuOpen ? "rgba(139,92,246,0.5)" : "transparent"}`,
                  boxShadow: menuOpen ? "0 0 10px rgba(139,92,246,0.2)" : "none",
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute left-full ml-2 top-0 z-20 flex flex-col gap-1 py-2 px-1.5 rounded-xl"
                    style={{
                      background: "rgba(22,22,22,0.92)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                      minWidth: 140,
                    }}
                  >
                    <div className="text-[9px] text-white/30 uppercase tracking-wider px-2 pb-1">Tools</div>
                    {MENU_TOOLS.map((tool) => {
                      const active = activeTool === tool.id
                      return (
                        <button
                          key={tool.id}
                          onClick={() => { onToolChange(tool.id); setMenuOpen(false) }}
                          className="flex items-center gap-2.5 h-8 px-2 rounded-lg transition-all duration-150 text-sm"
                          style={{
                            background: active ? "rgba(139,92,246,0.25)" : "transparent",
                            color: active ? "#c4b5fd" : "rgba(255,255,255,0.55)",
                          }}
                        >
                          <tool.icon className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">{tool.label}</span>
                          {tool.shortcut && (
                            <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{tool.shortcut}</kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">
            <span>More Tools</span>
          </TooltipContent>
        </Tooltip>

        <div className="w-5 h-px bg-white/10 my-1" />

        {/* Brush Size */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-1 cursor-ns-resize select-none" onPointerDown={e => e.stopPropagation()}>
              <span className="text-[9px] text-white/30 uppercase tracking-wider">Sz</span>
              <VerticalSlider value={brushSize} min={1} max={200} onChange={onBrushSizeChange} color="#8b5cf6" height={56} />
              <span className="text-[9px] text-white/40 tabular-nums">{brushSize}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">Brush Size</TooltipContent>
        </Tooltip>

        {/* Opacity */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center gap-1 cursor-ns-resize select-none" onPointerDown={e => e.stopPropagation()}>
              <span className="text-[9px] text-white/30 uppercase tracking-wider">Op</span>
              <VerticalSlider value={Math.round(brushOpacity * 100)} min={1} max={100} onChange={v => onBrushOpacityChange(v / 100)} color="#a78bfa" height={56} />
              <span className="text-[9px] text-white/40 tabular-nums">{Math.round(brushOpacity * 100)}%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">Opacity</TooltipContent>
        </Tooltip>

        <div className="w-5 h-px bg-white/10 my-1" />

        {/* Pressure Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onPressureToggle}
              className="relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-150"
              style={{
                background: pressureSensitive ? "rgba(139,92,246,0.25)" : "transparent",
                color: pressureSensitive ? "#c4b5fd" : "rgba(255,255,255,0.35)",
                border: `1px solid ${pressureSensitive ? "rgba(139,92,246,0.5)" : "transparent"}`,
                boxShadow: pressureSensitive ? "0 0 10px rgba(139,92,246,0.2)" : "none",
              }}
            >
              <Gauge className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">
            <span>Pressure Sensitivity</span>
            <span className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{pressureSensitive ? "ON" : "OFF"}</span>
          </TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenSettings}
              className="relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-150"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              <Settings className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#222] border-white/10 text-white">
            <span>Settings</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

function VerticalSlider({
  value, min, max, onChange, color, height,
}: { value: number; min: number; max: number; onChange: (v: number) => void; color: string; height: number }) {
  const pct = (value - min) / (max - min)

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const y = ev.clientY - rect.top
      const ratio = 1 - Math.max(0, Math.min(1, y / rect.height))
      onChange(Math.round(min + ratio * (max - min)))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    const ratio = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(Math.round(min + ratio * (max - min)))
  }

  return (
    <div
      className="relative rounded-full overflow-hidden"
      style={{ width: 8, height, background: "rgba(255,255,255,0.08)", cursor: "ns-resize" }}
      onPointerDown={handlePointer}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full transition-none"
        style={{ height: `${pct * 100}%`, background: color, opacity: 0.8 }}
      />
    </div>
  )
}
