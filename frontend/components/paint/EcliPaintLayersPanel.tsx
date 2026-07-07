"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { type LayerData } from "./LayersPanel"
import { Eye, EyeOff, Plus, Trash2, Lock, Unlock, GripVertical, ChevronUp, ChevronDown } from "lucide-react"

interface Props {
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
  onReorder?: (fromIndex: number, toIndex: number) => void
  getLayerCanvas?: (id: string) => HTMLCanvasElement | undefined
}

function LayerThumbnail({ layerId, getLayerCanvas }: { layerId: string; getLayerCanvas?: (id: string) => HTMLCanvasElement | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = getLayerCanvas?.(layerId)
    if (!canvas || !canvasRef.current) return
    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, 32, 32)
    ctx.drawImage(canvas, 0, 0, 32, 32)
  })

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      className="w-8 h-8 rounded-lg shrink-0 border border-white/10"
      style={{ imageRendering: "pixelated" }}
    />
  )
}

export function EcliPaintLayersPanel({
  layers, activeLayerId, onActiveLayerChange, onAddLayer, onDeleteLayer,
  onToggleVisibility, onToggleLock, onRenameLayer, onOpacityChange, onMoveUp, onMoveDown,
  onReorder, getLayerCanvas,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const activeLayer = layers.find(l => l.id === activeLayerId)
  const dragIndexRef = useRef<number | null>(null)
  const dragOverIndexRef = useRef<number | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const reversed = useCallback(() => [...layers].reverse(), [layers])

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragIndexRef.current = idx
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", layers[layers.length - 1 - idx].id)
    const el = e.currentTarget as HTMLElement
    el.style.opacity = "0.4"
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    dragOverIndexRef.current = idx
    const lid = layers[layers.length - 1 - idx]?.id
    if (lid) setDragOverId(lid)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    setDragOverId(null)
    const from = dragIndexRef.current
    if (from === null || from === dropIdx) return
    onReorder?.(layers.length - 1 - from, layers.length - 1 - dropIdx)
    dragIndexRef.current = null
    dragOverIndexRef.current = null
    const el = e.currentTarget as HTMLElement
    el.style.opacity = ""
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDragOverId(null)
    const el = e.currentTarget as HTMLElement
    el.style.opacity = ""
  }

  return (
    <div className="flex flex-col h-full text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-sm font-semibold text-white/80">Layers</span>
        <button
          onClick={onAddLayer}
          className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {reversed().map((layer, displayIdx) => {
          const actualIdx = layers.length - 1 - displayIdx
          const active = layer.id === activeLayerId
          const isDragOver = dragOverId === layer.id
          return (
            <div
              key={layer.id}
              draggable
              onClick={() => onActiveLayerChange(layer.id)}
              onDragStart={e => handleDragStart(e, displayIdx)}
              onDragOver={e => handleDragOver(e, displayIdx)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, displayIdx)}
              onDragEnd={handleDragEnd}
              className="group relative flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all"
              style={{
                background: active ? "rgba(139,92,246,0.2)" : isDragOver ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(139,92,246,0.4)" : isDragOver ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div className="shrink-0 text-white/15 hover:text-white/40 cursor-grab active:cursor-grabbing transition-colors">
                <GripVertical className="h-3.5 w-3.5" />
              </div>

              <LayerThumbnail layerId={layer.id} getLayerCanvas={getLayerCanvas} />

              <div className="flex-1 min-w-0">
                {editingId === layer.id ? (
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => { onRenameLayer(layer.id, editName || layer.name); setEditingId(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRenameLayer(layer.id, editName || layer.name); setEditingId(null) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="h-6 text-xs px-1 bg-white/10 border-white/20 text-white"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="block truncate text-xs font-medium text-white/80"
                    onDoubleClick={() => { setEditingId(layer.id); setEditName(layer.name) }}
                  >
                    {layer.name}
                  </span>
                )}
                <span className="text-[10px] text-white/30">{Math.round(layer.opacity * 100)}% opacity</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id) }}
                  className="h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/80 transition-colors">
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={e => { e.stopPropagation(); onToggleLock(layer.id) }}
                  className="h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/80 transition-colors">
                  {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </button>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {layers.length > 1 && displayIdx > 0 && (
                  <button onClick={e => { e.stopPropagation(); onMoveUp(layer.id) }} className="h-5 w-5 flex items-center justify-center text-white/30 hover:text-white/80 rounded hover:bg-white/10">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                )}
                {layers.length > 1 && displayIdx < layers.length - 1 && (
                  <button onClick={e => { e.stopPropagation(); onMoveDown(layer.id) }} className="h-5 w-5 flex items-center justify-center text-white/30 hover:text-white/80 rounded hover:bg-white/10">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); onDeleteLayer(layer.id) }} className="h-5 w-5 flex items-center justify-center text-red-400/50 hover:text-red-400 rounded hover:bg-red-400/10">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {activeLayer && (
        <div className="px-4 py-3 border-t border-white/8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40 uppercase tracking-wider">Opacity</span>
            <span className="text-[11px] text-white/60 tabular-nums">{Math.round(activeLayer.opacity * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(activeLayer.opacity * 100)]}
            onValueChange={([v]) => onOpacityChange(activeLayerId, v / 100)}
            min={0} max={100} step={1}
            className="[&>[data-slot=track]]:bg-white/10 [&>[data-slot=range]]:bg-purple-500"
          />
        </div>
      )}
    </div>
  )
}
