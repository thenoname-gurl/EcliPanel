"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ColorPicker } from "./ColorPicker"
import { BrushSelector } from "./BrushSelector"
import { type BrushSettings } from "@/lib/paint-brush-engine"
import {
  MousePointer2, Pencil, Eraser, Square, Circle, Minus, Triangle,
  Type, Hand, ZoomIn, ZoomOut, Undo2, Redo2, Save, Download,
  Upload, Trash2,
} from "lucide-react"

export type Tool = "select" | "brush" | "eraser" | "rect" | "circle" | "line" | "triangle" | "text" | "pan"

interface ToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  brushColor: string
  onColorChange: (color: string) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  brushOpacity: number
  onBrushOpacityChange: (opacity: number) => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onClear: () => void
  saving: boolean
  // Brush system
  brushSettings: BrushSettings
  brushName: string
  onBrushSelect: (name: string, settings: BrushSettings) => void
}

const TOOLS: { id: Tool; icon: typeof Pencil; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "brush", icon: Pencil, label: "Brush" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "triangle", icon: Triangle, label: "Triangle" },
  { id: "text", icon: Type, label: "Text" },
  { id: "pan", icon: Hand, label: "Pan" },
]

export function Toolbar({
  activeTool, onToolChange, brushColor, onColorChange,
  brushSize, onBrushSizeChange, brushOpacity, onBrushOpacityChange,
  zoom, onZoomIn, onZoomOut, onZoomReset,
  onUndo, onRedo, canUndo, canRedo,
  onSave, onExport, onImport, onClear, saving,
  brushSettings, brushName, onBrushSelect,
}: ToolbarProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border flex-wrap">
        {/* Tools */}
        <ToggleGroup
          type="single"
          value={activeTool}
          onValueChange={(v) => v && onToolChange(v as Tool)}
          className="flex-wrap"
        >
          {TOOLS.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={tool.id} size="sm" className="h-8 w-8 p-0">
                  <tool.icon className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{tool.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <Separator orientation="vertical" className="h-8" />

        {/* Brush Selector (only for brush tool) */}
        {activeTool === "brush" && (
          <>
            <BrushSelector
              currentSettings={brushSettings}
              currentName={brushName}
              onSelect={onBrushSelect}
              currentColor={brushColor}
              onColorChange={onColorChange}
            />
            <Separator orientation="vertical" className="h-8" />
          </>
        )}

        {/* Color */}
        <div className="flex items-center gap-2">
          <ColorPicker color={brushColor} onChange={onColorChange} />
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Brush Size */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <span className="text-xs text-muted-foreground shrink-0">Size</span>
          <Slider
            value={[brushSize]}
            onValueChange={([v]) => onBrushSizeChange(v)}
            min={1}
            max={200}
            step={1}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground w-8 text-right">{brushSize}</span>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Opacity */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <span className="text-xs text-muted-foreground shrink-0">Opacity</span>
          <Slider
            value={[brushOpacity * 100]}
            onValueChange={([v]) => onBrushOpacityChange(v / 100)}
            min={1}
            max={100}
            step={1}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground w-6 text-right">{Math.round(brushOpacity * 100)}</span>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo}>
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Undo</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Redo</p></TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Zoom Out</p></TooltipContent>
          </Tooltip>
          <button
            className="text-xs text-muted-foreground hover:text-foreground min-w-[48px] text-center cursor-pointer"
            onClick={onZoomReset}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Zoom In</p></TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSave} disabled={saving}>
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Save</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExport}>
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Export PNG</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onImport}>
                <Upload className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Import Image</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Clear Canvas</p></TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
