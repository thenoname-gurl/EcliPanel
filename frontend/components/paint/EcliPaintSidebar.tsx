"use client"

import { type LayerData } from "./LayersPanel"
import { type BrushSettings } from "@/lib/paint-brush-engine"
import { EcliPaintLayersPanel } from "./EcliPaintLayersPanel"
import { EcliPaintBrushPanel } from "./EcliPaintBrushPanel"
import { EcliPaintColorPanel } from "./EcliPaintColorPanel"

interface EcliPaintSidebarProps {
  showLayers: boolean
  showBrushes: boolean
  showColors: boolean
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
  onReorderLayers?: (fromIdx: number, toIdx: number) => void
  brushSettings: BrushSettings
  brushName: string
  onBrushSelect: (name: string, settings: BrushSettings) => void
  brushColor: string
  color: string
  onColorChange: (color: string) => void
  getLayerCanvas?: (id: string) => HTMLCanvasElement | undefined
}

export function EcliPaintSidebar({
  showLayers, showBrushes, showColors,
  layers, activeLayerId, onActiveLayerChange, onAddLayer, onDeleteLayer,
  onToggleVisibility, onToggleLock, onRenameLayer, onOpacityChange, onMoveUp, onMoveDown,
  onReorderLayers,
  brushSettings, brushName, onBrushSelect, brushColor, color, onColorChange,
  getLayerCanvas,
}: EcliPaintSidebarProps) {
  const anyOpen = showLayers || showBrushes || showColors

  return (
    <div className="absolute right-0 top-0 bottom-0 z-20 flex flex-col pointer-events-none" style={{ width: anyOpen ? 280 : 0 }}>
      <div
        className="flex-1 flex flex-col m-3 rounded-2xl overflow-hidden pointer-events-auto transition-all duration-200"
        style={{
          opacity: anyOpen ? 1 : 0,
          transform: anyOpen ? "translateX(0)" : "translateX(20px)",
          background: "rgba(22,22,22,0.92)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          display: anyOpen ? "flex" : "none",
        }}
      >
        {showLayers && (
          <EcliPaintLayersPanel
            layers={layers} activeLayerId={activeLayerId}
            onActiveLayerChange={onActiveLayerChange} onAddLayer={onAddLayer}
            onDeleteLayer={onDeleteLayer} onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock} onRenameLayer={onRenameLayer}
            onOpacityChange={onOpacityChange} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
            onReorder={onReorderLayers}
            getLayerCanvas={getLayerCanvas}
          />
        )}
        {showBrushes && (
          <EcliPaintBrushPanel
            brushSettings={brushSettings} brushName={brushName} onBrushSelect={onBrushSelect} brushColor={brushColor}
          />
        )}
        {showColors && (
          <EcliPaintColorPanel color={color} onChange={onColorChange} />
        )}
      </div>
    </div>
  )
}
