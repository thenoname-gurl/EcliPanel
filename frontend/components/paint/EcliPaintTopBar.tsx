"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowLeft, Undo2, Redo2, Layers, Brush, Palette,
  MoreHorizontal, Save, Download, Upload, Trash2, ZoomIn, ZoomOut,
  Loader2, RotateCw, MoveHorizontal,
} from "lucide-react"

interface EcliPaintTopBarProps {
  title: string
  saving: boolean
  canvasSize: { width: number; height: number }
  zoom: number
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  showLayers: boolean
  showBrushes: boolean
  showColors: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onClear: () => void
  onRename: () => void
  onBack: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onToggleLayers: () => void
  onToggleBrushes: () => void
  onToggleColors: () => void
  canvasRotation: number
  onRotateCanvas: () => void
  onMirrorCanvas: () => void
}

export function EcliPaintTopBar({
  title, saving, canvasSize, zoom, canUndo, canRedo, undoCount, redoCount,
  showLayers, showBrushes, showColors,
  onUndo, onRedo, onSave, onExport, onImport, onClear, onRename, onBack,
  onZoomIn, onZoomOut, onZoomReset,
  onToggleLayers, onToggleBrushes, onToggleColors,
  canvasRotation, onRotateCanvas, onMirrorCanvas,
}: EcliPaintTopBarProps) {
  return (
    <TooltipProvider>
      <div
        className="relative z-30 flex items-center gap-2 px-3 py-2 shrink-0 select-none"
        style={{
          background: "rgba(20,20,20,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Gallery</TooltipContent>
          </Tooltip>

          <button
            onClick={onRename}
            className="px-2 py-1 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors max-w-[160px] truncate"
          >
            {title}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 relative"
                onClick={onUndo} disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
                {undoCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] text-white/40 tabular-nums">{undoCount}</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Undo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 relative"
                onClick={onRedo} disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
                {redoCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] text-white/40 tabular-nums">{redoCount}</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Redo</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10"
              onClick={onZoomOut}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button
              onClick={onZoomReset}
              className="text-xs text-white/50 hover:text-white min-w-[44px] text-center py-1 rounded hover:bg-white/10 transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10"
              onClick={onZoomIn}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="text-[11px] text-white/25 ml-2">
            {canvasSize.width} &times; {canvasSize.height}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <PanelToggleBtn active={showBrushes} onClick={onToggleBrushes} icon={<Brush className="h-4 w-4" />} label="Brushes" />
          <PanelToggleBtn active={showColors} onClick={onToggleColors} icon={<Palette className="h-4 w-4" />} label="Colors" />
          <PanelToggleBtn active={showLayers} onClick={onToggleLayers} icon={<Layers className="h-4 w-4" />} label="Layers" />

          <div className="w-px h-5 bg-white/10 mx-0.5" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="bg-[#222] border-white/10 text-white min-w-[160px]">
              <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onExport}>
                <Download className="h-4 w-4" /> Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onImport}>
                <Upload className="h-4 w-4" /> Import Image
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onRotateCanvas}>
                <RotateCw className="h-4 w-4" /> Rotate Canvas ({canvasRotation}°)
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onMirrorCanvas}>
                <MoveHorizontal className="h-4 w-4" /> Mirror Canvas
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="gap-2 focus:bg-red-500/20 text-red-400 focus:text-red-400 cursor-pointer" onClick={onClear}>
                <Trash2 className="h-4 w-4" /> Clear Canvas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Save</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

function PanelToggleBtn({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-sm transition-all"
          style={{
            background: active ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)",
            color: active ? "#93c5fd" : "rgba(255,255,255,0.5)",
            border: `1px solid ${active ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          {icon}
          <span className="text-xs hidden sm:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
