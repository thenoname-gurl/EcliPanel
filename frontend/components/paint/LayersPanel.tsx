"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Eye, EyeOff, Plus, Trash2, ChevronUp, ChevronDown,
  Lock, Unlock, Layers
} from "lucide-react"

export interface LayerData {
  id: string
  name: string
  visible: boolean
  opacity: number
  locked: boolean
}

interface LayersPanelProps {
  layers: LayerData[]
  activeLayerId: string
  onActiveLayerChange: (id: string) => void
  onAddLayer: () => void
  onDeleteLayer: (id: string) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onRenameLayer: (id: string, name: string) => void
  onOpacityChange: (id: string, opacity: number) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

export function LayersPanel({
  layers, activeLayerId, onActiveLayerChange,
  onAddLayer, onDeleteLayer, onToggleVisibility, onToggleLock,
  onRenameLayer, onOpacityChange, onMoveUp, onMoveDown,
}: LayersPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const activeLayer = layers.find(l => l.id === activeLayerId)

  const handleDoubleClick = (layer: LayerData) => {
    setEditingLayerId(layer.id)
    setEditName(layer.name)
  }

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) onRenameLayer(id, editName.trim())
    setEditingLayerId(null)
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-white/40" />
          <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Layers</span>
        </div>
        <button
          onClick={onAddLayer}
          className="h-6 w-6 rounded-md bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-white/10 flex items-center justify-center transition-colors"
        >
          <Plus className="h-3.5 w-3.5 text-white/60" />
        </button>
      </div>

      {/* Layers list - reversed so top layer is at top */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5 px-1">
        {[...layers].reverse().map((layer, i) => (
          <div
            key={layer.id}
            className={cn(
              "group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all select-none",
              activeLayerId === layer.id
                ? "bg-[#0a84ff]/20 border border-[#0a84ff]/30"
                : "hover:bg-white/5 border border-transparent"
            )}
            onClick={() => onActiveLayerChange(layer.id)}
          >
            {/* Layer thumbnail placeholder */}
            <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
              <div className="w-full h-full bg-gradient-to-br from-white/10 to-transparent" />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              {editingLayerId === layer.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameSubmit(layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(layer.id)
                    if (e.key === 'Escape') setEditingLayerId(null)
                  }}
                  className="w-full bg-[#0a0a0a] text-white text-xs px-1.5 py-0.5 rounded outline-none border border-[#0a84ff]/50"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p
                  className="text-xs text-white/80 truncate font-medium"
                  onDoubleClick={() => handleDoubleClick(layer)}
                >
                  {layer.name}
                </p>
              )}
              <p className="text-[10px] text-white/30 mt-0.5">
                {Math.round(layer.opacity * 100)}% opacity
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                className="h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 transition-colors"
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id) }}
              >
                {layer.visible
                  ? <Eye className="h-3 w-3" />
                  : <EyeOff className="h-3 w-3 text-white/20" />
                }
              </button>
              <button
                className="h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 transition-colors"
                onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id) }}
              >
                {layer.locked
                  ? <Lock className="h-3 w-3 text-amber-400/60" />
                  : <Unlock className="h-3 w-3" />
                }
              </button>
            </div>

            {/* Move / delete - appear on hover */}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1e1e1e] rounded-md px-0.5 py-0.5">
              <button
                className="h-5 w-5 flex items-center justify-center rounded text-white/30 hover:text-white/70"
                onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id) }}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="h-5 w-5 flex items-center justify-center rounded text-white/30 hover:text-white/70"
                onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id) }}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              {layers.length > 1 && (
                <button
                  className="h-5 w-5 flex items-center justify-center rounded text-red-400/50 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id) }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Active layer opacity */}
      {activeLayer && (
        <div className="px-3 py-3 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Opacity</span>
            <span className="text-[10px] text-white/60 font-mono tabular-nums">
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>
          <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#0a84ff] rounded-full"
              style={{ width: `${activeLayer.opacity * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) => onOpacityChange(activeLayerId, Number(e.target.value) / 100)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}