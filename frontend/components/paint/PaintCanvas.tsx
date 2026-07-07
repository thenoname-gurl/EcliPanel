"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { type Tool } from "./EcliPaintToolStrip"
import { EcliPaintSidebar } from "./EcliPaintSidebar"
import { EcliPaintTopBar } from "./EcliPaintTopBar"
import { EcliPaintToolStrip } from "./EcliPaintToolStrip"
import { type BrushSettings, PRESET_BRUSHES, renderStamp } from "@/lib/paint-brush-engine"
import {
  PixelEngine, type PaintObject, type PaintObjectType,
  type SerializedPixelLayer, makeObjId,
} from "@/lib/konva-engine"
import type Konva from "konva"
import { Stage, Layer, Group, Image as KonvaImage, Rect, Ellipse, Line, Text, Transformer } from "react-konva"
import { type LayerData } from "./LayersPanel"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Loader2, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface PaintCanvasProps { paintingId: string }

let layerIdCounter = 0
function makeLid() { return `layer_${++layerIdCounter}_${Date.now()}` }
const CLIPBOARD: { objects: PaintObject[] } = { objects: [] }

function parseHex(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: string, tolerance = 30) {
  const w = ctx.canvas.width; const h = ctx.canvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const pi = (Math.round(y) * w + Math.round(x)) * 4
  const tr = data[pi]; const tg = data[pi + 1]; const tb = data[pi + 2]; const ta = data[pi + 3]
  const fill = parseHex(fillColor)
  if (Math.abs(tr - fill.r) <= tolerance && Math.abs(tg - fill.g) <= tolerance && Math.abs(tb - fill.b) <= tolerance) return
  const stack: number[] = [Math.round(x), Math.round(y)]
  const visited = new Set<number>()
  while (stack.length > 0) {
    const py = stack.pop()!; const px = stack.pop()!
    if (px < 0 || px >= w || py < 0 || py >= h) continue
    const key = py * w + px
    if (visited.has(key)) continue; visited.add(key)
    const idx = key * 4
    const dr = Math.abs(data[idx] - tr); const dg = Math.abs(data[idx + 1] - tg); const db = Math.abs(data[idx + 2] - tb)
    if (dr > tolerance || dg > tolerance || db > tolerance) continue
    data[idx] = fill.r; data[idx + 1] = fill.g; data[idx + 2] = fill.b; data[idx + 3] = 255
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1)
  }
  ctx.putImageData(imageData, 0, 0)
}

function smudgeStamp(ctx: CanvasRenderingContext2D, srcX: number, srcY: number, dstX: number, dstY: number, size: number, strength: number) {
  const half = Math.ceil(size / 2)
  const srcLeft = Math.max(0, Math.round(srcX) - half)
  const srcTop = Math.max(0, Math.round(srcY) - half)
  const srcRight = Math.min(ctx.canvas.width, Math.round(srcX) + half)
  const srcBottom = Math.min(ctx.canvas.height, Math.round(srcY) + half)
  const sw = srcRight - srcLeft; const sh = srcBottom - srcTop
  if (sw <= 0 || sh <= 0) return
  const imageData = ctx.getImageData(srcLeft, srcTop, sw, sh)
  for (let i = 3; i < imageData.data.length; i += 4) { imageData.data[i] = Math.min(255, imageData.data[i] * strength) }
  const temp = document.createElement("canvas"); temp.width = sw; temp.height = sh
  const tctx = temp.getContext("2d")!; tctx.putImageData(imageData, 0, 0)
  const dstLeft = Math.max(0, Math.round(dstX) - half)
  const dstTop = Math.max(0, Math.round(dstY) - half)
  ctx.save(); ctx.globalAlpha = strength; ctx.drawImage(temp, dstLeft, dstTop); ctx.restore()
}

export function PaintCanvas({ paintingId }: PaintCanvasProps) {
  const router = useRouter()
  const engineRef = useRef<PixelEngine | null>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const layerRefs = useRef<Map<string, Konva.Layer>>(new Map())
  const shapeNodeRefs = useRef<Map<string, Konva.Shape | Konva.Node>>(new Map())
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  const isDrawingRef = useRef(false)
  const isPointerDownRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const hasDrawnRef = useRef(false)
  const lastDrawingToolRef = useRef<Tool>("brush")
  const lastPointerTypeRef = useRef("mouse")
  const gradStartRef = useRef({ x: 0, y: 0 })
  const gradEndRef = useRef({ x: 0, y: 0 })
  const shapeStartRef = useRef({ x: 0, y: 0 })
  const tempShapeRef = useRef<PaintObject | null>(null)
  const strokePointsRef = useRef<{ x: number; y: number }[]>([])
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isNew = paintingId === "new"

  const [paintingTitle, setPaintingTitle] = useState("Untitled")
  const [dataLoading, setDataLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })

  const [activeTool, setActiveTool] = useState<Tool>("brush")
  const [brushColor, setBrushColor] = useState("#000000")
  const [brushSize, setBrushSize] = useState(12)
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [brushSettings, setBrushSettings] = useState<BrushSettings>(PRESET_BRUSHES[0].settings as BrushSettings)
  const [brushName, setBrushName] = useState(PRESET_BRUSHES[0].name)
  const [zoom, setZoom] = useState(1)
  const [canvasRotation, setCanvasRotation] = useState(0)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [pressureSensitive, setPressureSensitive] = useState(true)
  const [pressureIntensity, setPressureIntensity] = useState(1)
  const [pressureMin, setPressureMin] = useState(0.1)

  const [layerUI, setLayerUI] = useState<LayerData[]>([
    { id: makeLid(), name: "Layer 1", visible: true, opacity: 1, locked: false },
  ])
  const [activeLayerId, setActiveLayerId] = useState("")
  const [shapes, setShapes] = useState<Record<string, PaintObject[]>>({})
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [tempShape, setTempShape] = useState<PaintObject | null>(null)
  const [undoAvailable, setUndoAvailable] = useState(false)
  const [redoAvailable, setRedoAvailable] = useState(false)

  const [showLayers, setShowLayers] = useState(false)
  const [showBrushes, setShowBrushes] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [showTitleDialog, setShowTitleDialog] = useState(false)
  const [titleInput, setTitleInput] = useState("")
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // ── Container resize → Stage fills full area so pointer events work outside canvas ──
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width: Math.round(width), height: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const centerX = Math.max(0, (containerSize.width - canvasSize.width * zoom) / 2)
  const centerY = Math.max(0, (containerSize.height - canvasSize.height * zoom) / 2)

  // ── Checkerboard pattern for background Layer ──
  const [checkerboardImg, setCheckerboardImg] = useState<HTMLImageElement | undefined>(undefined)
  useEffect(() => {
    const c = document.createElement("canvas")
    c.width = 20; c.height = 20
    const ctx = c.getContext("2d")!
    ctx.fillStyle = "#2a2a2a"
    ctx.fillRect(0, 0, 10, 10)
    ctx.fillRect(10, 10, 10, 10)
    const img = new Image()
    img.onload = () => setCheckerboardImg(img)
    img.src = c.toDataURL()
  }, [])

  // ── Sync layer UI ──
  const syncLayers = useCallback(() => {
    const e = engineRef.current
    if (!e) return
    setLayerUI(e.layers.map(l => ({
      id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked,
    })))
    setActiveLayerId(prev => {
      if (prev && e.layers.some(l => l.id === prev)) return prev
      return e.layers.find(l => l.id !== "bg")?.id || e.layers[0]?.id || ""
    })
    setUndoAvailable(e.snapshots.length > 0)
    setRedoAvailable(e.redos.length > 0)
  }, [])

  // ── Canvas position (inverse of Layer + Group transforms) ──
  const getCanvasPos = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const pos = stage.getPointerPosition()
    if (!pos) return { x: 0, y: 0 }
    // Stage → Layer space: subtract centering/pan, divide by zoom
    const lx = centerX + panOffset.x
    const ly = centerY + panOffset.y
    const rx = (pos.x - lx) / zoom
    const ry = (pos.y - ly) / zoom
    // Layer → canvas space: Group has x/y=cw/2, offsetX/Y=cw/2, rotation=r
    // Canvas = R(-r) * (layer - groupPos) + offset
    const hw = canvasSize.width / 2
    const hh = canvasSize.height / 2
    const relX = rx - hw
    const relY = ry - hh
    const rad = (canvasRotation * Math.PI) / 180
    const c = Math.cos(-rad)
    const s = Math.sin(-rad)
    return {
      x: relX * c - relY * s + hw,
      y: relX * s + relY * c + hh,
    }
  }, [centerX, centerY, panOffset, zoom, canvasRotation, canvasSize])

  // ── Refresh layer rendering ──
  const refreshLayers = useCallback(() => {
    layerRefs.current.forEach(l => l.batchDraw())
  }, [])

  // ── Settings ──
  const getSettings = useCallback((): BrushSettings & { color: string } =>
    ({ ...brushSettings, size: brushSize, opacity: brushOpacity, color: brushColor }),
  [brushSettings, brushSize, brushOpacity, brushColor])

  const getEffSize = useCallback((base: number, pressure: number, pt: string) => {
    if (!pressureSensitive || pt === "mouse") return base
    const factor = pressureMin + (1 - pressureMin) * pressure * pressureIntensity
    return base * factor
  }, [pressureSensitive, pressureIntensity, pressureMin])

  // ── Cancel hold timer ──
  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
  }, [])

  // ── Shape detection from freehand stroke ──
  const detectShape = useCallback((): PaintObject | null => {
    const pts = strokePointsRef.current
    if (pts.length < 10) return null
    const first = pts[0]; const last = pts[pts.length - 1]
    const closed = Math.hypot(last.x - first.x, last.y - first.y) < 30
    const n = pts.length

    // Helper: distance from point to line segment
    const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax; const dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) return Math.hypot(px - ax, py - ay)
      let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }

    // ── Line detection ──
    const lineDev = pts.reduce((max, p) => Math.max(max, distToSeg(p.x, p.y, first.x, first.y, last.x, last.y)), 0)
    if (lineDev < 15) {
      const len = Math.hypot(last.x - first.x, last.y - first.y)
      if (len > 30) {
        const left = Math.min(first.x, last.x); const top = Math.min(first.y, last.y)
        return {
          id: makeObjId(), type: "line",
          x: left, y: top, width: Math.abs(last.x - first.x), height: Math.abs(last.y - first.y),
          rotation: 0, fill: "", stroke: brushColor, strokeWidth: brushSize, opacity: brushOpacity,
          points: [first.x - left, first.y - top, last.x - left, last.y - top],
        }
      }
    }

    // ── Circle detection ──
    if (closed) {
      let cx = 0, cy = 0
      for (const p of pts) { cx += p.x; cy += p.y }
      cx /= n; cy /= n
      const radii = pts.map(p => Math.hypot(p.x - cx, p.y - cy))
      const avgR = radii.reduce((a, b) => a + b, 0) / n
      const dev = radii.reduce((max, r) => Math.max(max, Math.abs(r - avgR)), 0)
      if (dev / Math.max(avgR, 1) < 0.3 && avgR > 15) {
        return {
          id: makeObjId(), type: "circle",
          x: cx - avgR, y: cy - avgR, width: avgR * 2, height: avgR * 2,
          rotation: 0, fill: brushColor, stroke: "", strokeWidth: 0, opacity: brushOpacity,
        }
      }
    }

    // ── Rectangle detection ──
    if (closed) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
      const rw = maxX - minX; const rh = maxY - minY
      if (rw > 20 && rh > 20) {
        const edgeDev = pts.reduce((max, p) => {
          const dLeft = Math.abs(p.x - minX); const dRight = Math.abs(p.x - maxX)
          const dTop = Math.abs(p.y - minY); const dBot = Math.abs(p.y - maxY)
          const minD = Math.min(dLeft, dRight, dTop, dBot)
          return Math.max(max, minD)
        }, 0)
        if (edgeDev < rw * 0.25 && edgeDev < rh * 0.25) {
          return {
            id: makeObjId(), type: "rect",
            x: minX, y: minY, width: rw, height: rh,
            rotation: 0, fill: brushColor, stroke: "", strokeWidth: 0, opacity: brushOpacity,
          }
        }
      }
    }

    return null
  }, [brushColor, brushSize, brushOpacity])

  // ── Shape helpers ──
  function addShape(layerId: string, shape: PaintObject) {
    setShapes(prev => ({
      ...prev, [layerId]: [...(prev[layerId] || []), shape],
    }))
  }

  function updateShape(layerId: string, shapeId: string, attrs: Partial<PaintObject>) {
    setShapes(prev => {
      const arr = prev[layerId]
      if (!arr) return prev
      const idx = arr.findIndex(s => s.id === shapeId)
      if (idx < 0) return prev
      const next = [...arr]
      next[idx] = { ...next[idx], ...attrs }
      return { ...prev, [layerId]: next }
    })
  }

  function deleteShape(layerId: string, shapeId: string) {
    setShapes(prev => {
      const arr = prev[layerId]?.filter(s => s.id !== shapeId)
      return { ...prev, [layerId]: arr || [] }
    })
    setSelectedShapeId(prev => prev === shapeId ? null : prev)
  }

  // ── Konva events ──
  const handlePointerDown = useCallback((kEvt: Konva.KonvaEventObject<PointerEvent>) => {
    const e = engineRef.current; if (!e) return
    const pt = kEvt.evt.pointerType; lastPointerTypeRef.current = pt
    const pressure = kEvt.evt.pressure
    const pos = getCanvasPos()
    const { x, y } = pos
    const lid = activeLayerId
    if (!lid) return
    const ui = layerUI.find(l => l.id === lid)
    if (ui?.locked) return

    isPointerDownRef.current = true

    if (activeTool === "pan") {
      isDrawingRef.current = true
      const sp = stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
      lastPosRef.current = { x: sp.x, y: sp.y }
      return
    }

    if (activeTool === "brush" || activeTool === "eraser") {
      cancelHold()
      isDrawingRef.current = true
      lastPosRef.current = { x, y }; hasDrawnRef.current = false
      strokePointsRef.current = activeTool === "brush" ? [{ x, y }] : []
      const ctx = e.getLayerCtx(lid)
      if (ctx) {
        ctx.save()
        if (activeTool === "eraser") ctx.globalCompositeOperation = "destination-out"
        const s = getSettings(); s.size = getEffSize(s.size, pressure, pt)
        renderStamp(ctx, x, y, s)
        ctx.restore(); hasDrawnRef.current = true; refreshLayers()
      }
      return
    }

    if (activeTool === "smudge") {
      isDrawingRef.current = true
      lastPosRef.current = { x, y }; hasDrawnRef.current = false
      return
    }

    if (activeTool === "fill") {
      const ctx = e.getLayerCtx(lid)
      if (ctx) { floodFill(ctx, x, y, brushColor, 30); e.saveSnapshot(shapes); syncLayers(); refreshLayers() }
      return
    }

    if (activeTool === "eyedropper") {
      // Composite pixel data + shapes by rendering to a temp canvas
      const color = e.getColorAt(x, y)
      setBrushColor(color)
      setActiveTool(lastDrawingToolRef.current)
      return
    }

    if (activeTool === "gradient") {
      isDrawingRef.current = true; hasDrawnRef.current = false
      gradStartRef.current = { x, y }; gradEndRef.current = { x, y }
      return
    }

    if (activeTool === "text") {
      const obj: PaintObject = {
        id: makeObjId(), type: "text", x, y, width: 100, height: 28,
        rotation: 0, fill: brushColor, stroke: "", strokeWidth: 0, opacity: brushOpacity,
        text: "Text", fontSize: brushSize * 2,
      }
      addShape(lid, obj); e.saveSnapshot(shapes); syncLayers()
      return
    }

    if (["rect", "circle", "line", "triangle"].includes(activeTool)) {
      isDrawingRef.current = true
      shapeStartRef.current = { x, y }
      const type = activeTool as PaintObjectType
      const obj: PaintObject = {
        id: makeObjId(), type,
        x, y, width: 0, height: 0,
        rotation: 0, fill: brushColor, stroke: "", strokeWidth: 0, opacity: brushOpacity,
      }
      if (type === "line") {
        obj.stroke = brushColor; obj.strokeWidth = brushSize; obj.fill = ""
        obj.points = [0, 0, 0, 0]
      }
      if (type === "triangle") {
        obj.points = [0, 0, 0, 0, 0, 0]
      }
      tempShapeRef.current = obj; setTempShape(obj)
    }
  }, [activeTool, brushColor, brushSize, brushOpacity, brushSettings, getCanvasPos, getSettings, getEffSize, layerUI, activeLayerId, shapes, syncLayers, refreshLayers, cancelHold])

  const handlePointerMove = useCallback((kEvt: Konva.KonvaEventObject<PointerEvent>) => {
    if (!isPointerDownRef.current || !isDrawingRef.current) return
    const e = engineRef.current; if (!e) return
    const pt = kEvt.evt.pointerType; lastPointerTypeRef.current = pt
    const pressure = kEvt.evt.pressure
    const pos = getCanvasPos()
    const { x, y } = pos
    const lid = activeLayerId
    if (!lid) return

    if (activeTool === "pan") {
      const sp = stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
      const prev = lastPosRef.current
      setPanOffset(p => ({ x: p.x + (sp.x - prev.x), y: p.y + (sp.y - prev.y) }))
      lastPosRef.current = { x: sp.x, y: sp.y }
      return
    }

    if (activeTool === "brush" || activeTool === "eraser") {
      const dx = x - lastPosRef.current.x; const dy = y - lastPosRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const spacing = Math.max(1, brushSettings.spacing || 5)
      if (dist >= spacing) {
        const steps = Math.max(1, Math.floor(dist / spacing))
        const ctx = e.getLayerCtx(lid)
        if (ctx) {
          ctx.save()
          if (activeTool === "eraser") ctx.globalCompositeOperation = "destination-out"
          const base = getSettings()
          for (let i = 0; i < steps; i++) {
            const t = (i + 1) / steps
            const px = lastPosRef.current.x + dx * t
            const py = lastPosRef.current.y + dy * t
            const s = { ...base, size: getEffSize(base.size, pressure, pt) }
            renderStamp(ctx, px, py, s)
            if (activeTool === "brush") strokePointsRef.current.push({ x: px, y: py })
          }
          ctx.restore(); hasDrawnRef.current = true; refreshLayers()
        }
        lastPosRef.current = { x, y }
      }
      // Reset hold timer — if pen stays still for 400ms, detect shape
      if (activeTool === "brush") {
        cancelHold()
        holdTimerRef.current = setTimeout(() => {
          if (!isPointerDownRef.current) return
          const shape = detectShape()
          if (shape) {
            const eng = engineRef.current
            if (eng) {
              eng.saveSnapshot(shapes)
              eng.clearLayer(lid)
              addShape(lid, shape)
              syncLayers(); refreshLayers()
            }
          }
          strokePointsRef.current = []
          holdTimerRef.current = null
        }, 400)
      }
      return
    }

    if (activeTool === "smudge") {
      const dx = x - lastPosRef.current.x; const dy = y - lastPosRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const spacing = Math.max(1, brushSettings.spacing || 5)
      if (dist >= spacing) {
        const steps = Math.max(1, Math.floor(dist / spacing))
        const ctx = e.getLayerCtx(lid)
        if (ctx) {
          const effSize = getEffSize(brushSize, pressure, pt)
          for (let i = 0; i < steps; i++) {
            const t = (i + 1) / steps
            const cx = lastPosRef.current.x + dx * t
            const cy = lastPosRef.current.y + dy * t
            const sx2 = lastPosRef.current.x + dx * (i / steps)
            const sy2 = lastPosRef.current.y + dy * (i / steps)
            smudgeStamp(ctx, sx2, sy2, cx, cy, effSize, 0.4)
          }
          hasDrawnRef.current = true; refreshLayers()
        }
        lastPosRef.current = { x, y }
      }
      return
    }

    if (activeTool === "gradient") {
      gradEndRef.current = { x, y }; hasDrawnRef.current = true
      const gs = { x: gradStartRef.current.x, y: gradStartRef.current.y }
      const preview: PaintObject = {
        id: "gradient-preview", type: "line", x: gs.x, y: gs.y,
        width: x - gs.x, height: y - gs.y,
        rotation: 0, fill: "", stroke: brushColor, strokeWidth: 2, opacity: 0.6,
      }
      tempShapeRef.current = preview; setTempShape(preview)
      return
    }

    if (["rect", "circle", "line", "triangle"].includes(activeTool)) {
      const sx = shapeStartRef.current.x; const sy = shapeStartRef.current.y
      const left = Math.min(sx, x); const top = Math.min(sy, y)
      const w = Math.abs(x - sx); const h = Math.abs(y - sy)
      const prev = tempShapeRef.current
      if (!prev) return
      if (activeTool === "line") {
        const dx = x - sx; const dy = y - sy
        prev.points = [0, 0, dx, dy]
        prev.x = sx; prev.y = sy
        prev.width = Math.abs(dx); prev.height = Math.abs(dy)
      } else if (activeTool === "triangle") {
        // Apex at start corner, base on opposite edge
        const startIsLeft = sx <= x; const startIsTop = sy <= y
        const hw = w; const hh = Math.max(h, 1)
        if (startIsLeft && startIsTop)      prev.points = [0, 0, hw, hh, 0, hh]       // apex top-left
        else if (!startIsLeft && startIsTop) prev.points = [hw, 0, 0, hh, hw, hh]     // apex top-right
        else if (startIsLeft && !startIsTop) prev.points = [0, hh, hw, 0, 0, 0]       // apex bottom-left
        else                                 prev.points = [hw, hh, 0, 0, hw, 0]       // apex bottom-right
        prev.x = left; prev.y = top
        prev.width = hw; prev.height = hh
      } else {
        prev.x = left; prev.y = top
        prev.width = w; prev.height = Math.max(h, 1)
      }
      tempShapeRef.current = { ...prev }; setTempShape({ ...prev })
      return
    }
  }, [activeTool, brushSize, brushOpacity, brushColor, brushSettings, getCanvasPos, getSettings, getEffSize, zoom, activeLayerId, refreshLayers, cancelHold, detectShape])

  const handlePointerUp = useCallback((kEvt: Konva.KonvaEventObject<PointerEvent>) => {
    if (!isPointerDownRef.current) return
    const e = engineRef.current; if (!e) return
    const lid = activeLayerId
    if (!lid) return

    isPointerDownRef.current = false; isDrawingRef.current = false

    if (activeTool === "brush" || activeTool === "eraser") {
      cancelHold()
      strokePointsRef.current = []
      if (hasDrawnRef.current) { e.saveSnapshot(shapes); hasDrawnRef.current = false; syncLayers() }
      return
    }

    if (activeTool === "smudge") {
      if (hasDrawnRef.current) { e.saveSnapshot(shapes); hasDrawnRef.current = false; syncLayers() }
      return
    }

    if (activeTool === "gradient" && hasDrawnRef.current) {
      const ctx = e.getLayerCtx(lid)
      if (ctx) {
        const { x: sx, y: sy } = gradStartRef.current
        const { x: ex, y: ey } = gradEndRef.current
        if (Math.abs(ex - sx) > 5 || Math.abs(ey - sy) > 5) {
          const grad = ctx.createLinearGradient(sx, sy, ex, ey)
          grad.addColorStop(0, brushColor)
          grad.addColorStop(1, "transparent")
          ctx.save(); ctx.fillStyle = grad; ctx.globalAlpha = brushOpacity
          ctx.fillRect(0, 0, e.width, e.height); ctx.restore()
          e.saveSnapshot(shapes); syncLayers(); refreshLayers()
        }
      }
      tempShapeRef.current = null; setTempShape(null); return
    }

    if (["rect", "circle", "line", "triangle"].includes(activeTool)) {
      const temp = tempShapeRef.current
      if (temp) {
        const tooSmall = activeTool === "line"
          ? (Math.abs(temp.width) < 3 && Math.abs(temp.height) < 3)
          : (temp.width < 3 && temp.height < 3)
        if (!tooSmall) {
          addShape(lid, { ...temp, id: makeObjId() })
          e.saveSnapshot(shapes); syncLayers()
        }
      }
      tempShapeRef.current = null; setTempShape(null); refreshLayers(); return
    }
  }, [activeTool, brushColor, brushOpacity, activeLayerId, shapes, syncLayers, refreshLayers])

  const handleStageClick = useCallback(() => {
    if (activeTool === "select") {
      setSelectedShapeId(null)
      transformerRef.current?.nodes([])
    }
  }, [activeTool])

  // ── Undo/Redo ──
  const handleUndo = useCallback(() => {
    const e = engineRef.current; if (!e) return
    const snap = e.undo(shapes)
    if (!snap) return
    e.restoreLayers(snap.layers)
    setShapes(JSON.parse(JSON.stringify(snap.shapes)))
    setSelectedShapeId(null)
    transformerRef.current?.nodes([])
    syncLayers(); refreshLayers()
  }, [shapes, syncLayers, refreshLayers])

  const handleRedo = useCallback(() => {
    const e = engineRef.current; if (!e) return
    const snap = e.redo(shapes)
    if (!snap) return
    e.restoreLayers(snap.layers)
    setShapes(JSON.parse(JSON.stringify(snap.shapes)))
    setSelectedShapeId(null)
    transformerRef.current?.nodes([])
    syncLayers(); refreshLayers()
  }, [shapes, syncLayers, refreshLayers])

  // ── Data loading ──
  const loadData = useCallback(async (id: string) => {
    if (!id || id === "new") return
    setDataLoading(true)
    try {
      const d = await apiFetch(API_ENDPOINTS.paint.replace(":id", id))
      if (!d) { toast.error("Failed to load"); router.push("/dashboard/paint"); return }
      setPaintingTitle(d.title || "Untitled")
      const w = d.width || 800, h = d.height || 600
      setCanvasSize({ width: w, height: h })
      const e = engineRef.current
      if (e) {
        e.resize(w, h)
        if (d.canvasData) {
          const p = JSON.parse(d.canvasData)
          if (p.pixel) await e.loadFromSerialized(p.pixel as SerializedPixelLayer[])
          if (p.shapes) setShapes(p.shapes)
        }
        syncLayers()
      }
    } catch { toast.error("Failed to load"); router.push("/dashboard/paint") }
    finally { setDataLoading(false) }
  }, [router, syncLayers])

  // ── Engine init ──
  useEffect(() => {
    if (engineRef.current) return
    const e = new PixelEngine()
    engineRef.current = e
    e.init(canvasSize.width, canvasSize.height)
    syncLayers()
    if (!isNew) loadData(paintingId)
    return () => { e.dispose(); engineRef.current = null }
  }, [])

  useEffect(() => {
    if (!engineRef.current || isNew) return
    loadData(paintingId)
  }, [paintingId, loadData])

  // ── Zoom / Pan / Rotate ──
  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 10)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.1)), [])
  const zoomReset = useCallback(() => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }, [])
  const handleRotateCanvas = useCallback(() => setCanvasRotation(r => (r + 90) % 360), [])

  const handleMirrorCanvas = useCallback(() => {
    const e = engineRef.current; if (!e) return
    for (const l of e.layers) e.mirrorLayer(l.id)
    refreshLayers(); e.saveSnapshot(shapes); syncLayers()
  }, [shapes, syncLayers, refreshLayers])

  // ── Scroll to pan/zoom ──
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      setZoom(z => Math.max(0.1, Math.min(10, z + delta)))
    } else {
      setPanOffset(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Multi-touch gestures: 2-finger pan, pinch zoom, 2-finger rotate + tap shortcuts ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let activeTouches = 0
    let startDist = 0
    let startAngle = 0
    let startZoom = zoom
    let startRotation = canvasRotation
    let startPan = panOffset
    let centroid = { x: 0, y: 0 }
    let tapCount = 0
    let tapTimer: ReturnType<typeof setTimeout>

    const getDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    const getAngle = (t1: Touch, t2: Touch) =>
      Math.atan2(t1.clientY - t2.clientY, t1.clientX - t2.clientX) * (180 / Math.PI)

    const onTouchStart = (e: TouchEvent) => {
      if (isPointerDownRef.current) return
      activeTouches = e.touches.length
      if (activeTouches === 1) return
      startZoom = zoom
      startRotation = canvasRotation
      startPan = panOffset
      if (activeTouches === 2) {
        startDist = getDist(e.touches[0], e.touches[1])
        startAngle = getAngle(e.touches[0], e.touches[1])
        centroid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (activeTouches < 2) return
      e.preventDefault()
      if (e.touches.length === 2) {
        const dist = getDist(e.touches[0], e.touches[1])
        const angle = getAngle(e.touches[0], e.touches[1])
        const newCentroid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
        setZoom(Math.max(0.1, Math.min(10, startZoom * (dist / startDist))))
        setCanvasRotation((startRotation + (angle - startAngle)) % 360)
        setPanOffset(p => ({
          x: startPan.x + (newCentroid.x - centroid.x),
          y: startPan.y + (newCentroid.y - centroid.y),
        }))
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (activeTouches === 0) return
      const prev = activeTouches
      activeTouches = e.touches.length
      if (prev >= 2 && activeTouches < 2) {
        if (e.changedTouches.length === prev) {
          tapCount++
          clearTimeout(tapTimer)
          tapTimer = setTimeout(() => tapCount = 0, 500)
          if (tapCount === 1 && prev === 2) { tapCount = 0; handleUndo() }
          else if (tapCount === 1 && prev === 3) { tapCount = 0; handleRedo() }
        }
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleUndo, handleRedo, zoom, canvasRotation, panOffset])

  // ── Brush select ──
  const handleBrushSelect = useCallback((name: string, s: BrushSettings) => {
    setBrushName(name); setBrushSettings(s); setBrushSize(s.size || 12); setBrushOpacity(s.opacity ?? 1)
  }, [])

  // ── Save / Export / Import / Clear ──
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const e = engineRef.current; if (!e) { setSaving(false); return }
      const pixel = e.serialize(shapes)
      const payload = {
        title: paintingTitle, width: e.width, height: e.height,
        canvasData: JSON.stringify({ pixel, shapes }),
        thumbnail: "",
      }
      const opts = { method: "POST" as const, body: JSON.stringify(payload), timeout: 30000, retries: 1 }
      if (isNew) {
        const res = await apiFetch(API_ENDPOINTS.paints, opts)
        if (res?.id) {
          router.replace(`/dashboard/paint/${res.id}`)
        } else {
          throw new Error("No id returned")
        }
      } else {
        await apiFetch(API_ENDPOINTS.paint.replace(":id", paintingId), { ...opts, method: "PUT" })
      }
      toast.success("Saved!")
    } catch (err: any) {
      toast.error(err?.message || "Failed to save")
      console.error("[paint save]", err)
    } finally { setSaving(false) }
  }, [paintingId, paintingTitle, isNew, shapes, router])

  const handleExport = useCallback(() => {
    const s = stageRef.current
    if (!s) return
    const a = document.createElement("a")
    a.download = `${paintingTitle || "painting"}.png`
    a.href = s.toDataURL({ mimeType: "image/png", pixelRatio: 1 }); a.click()
  }, [paintingTitle])

  const handleImport = useCallback(() => {
    const inp = document.createElement("input")
    inp.type = "file"; inp.accept = "image/*"
    inp.onchange = (ev: any) => {
      const file = ev.target?.files?.[0]; if (!file) return
      const r = new FileReader()
      r.onload = (re) => {
        const e = engineRef.current; if (!e) return
        const lid = activeLayerId; if (!lid) return
        const img = new Image()
        img.onload = () => {
          imageCache.current.set(img.src, img)
          const cx = (canvasSize.width - img.width) / 2
          const cy = (canvasSize.height - img.height) / 2
          const obj: PaintObject = {
            id: makeObjId(), type: "image",
            x: Math.max(0, cx), y: Math.max(0, cy),
            width: img.width, height: img.height, rotation: 0,
            fill: "", stroke: "", strokeWidth: 0, opacity: 1, src: img.src,
          }
          addShape(lid, obj); e.saveSnapshot(shapes); syncLayers(); refreshLayers()
          toast.success("Image imported")
        }
        img.src = r.result as string
      }
      r.readAsDataURL(file)
    }
    inp.click()
  }, [activeLayerId, canvasSize, shapes, syncLayers, refreshLayers])

  const confirmClear = useCallback(() => {
    const e = engineRef.current; if (!e) return
    const lid = activeLayerId
    if (lid) {
      e.clearLayer(lid)
      setShapes(prev => ({ ...prev, [lid]: [] }))
    }
    e.saveSnapshot(shapes); syncLayers()
    setSelectedShapeId(null); setShowClearDialog(false); toast.success("Layer cleared")
  }, [activeLayerId, shapes, syncLayers])

  // ── Layer ops ──
  const addLayer = useCallback(() => {
    const e = engineRef.current; if (!e) return
    e.saveSnapshot(shapes)
    e.addLayer(makeLid(), `Layer ${e.layers.length}`)
    syncLayers()
  }, [shapes, syncLayers])
  const deleteLayer = useCallback((id: string) => {
    const e = engineRef.current; if (!e || e.layers.length <= 1) return
    e.saveSnapshot(shapes)
    e.removeLayer(id)
    setShapes(prev => { const n = { ...prev }; delete n[id]; return n })
    syncLayers()
    refreshLayers()
  }, [shapes, syncLayers, refreshLayers])
  const toggleVisibility = useCallback((id: string) => {
    const e = engineRef.current; if (!e) return
    e.setLayerVisibility(id, !e.getLayer(id)?.visible); refreshLayers(); syncLayers()
  }, [syncLayers, refreshLayers])
  const toggleLock = useCallback((id: string) => {
    const e = engineRef.current; if (!e) return
    e.setLayerLock(id, !e.getLayer(id)?.locked); syncLayers()
  }, [syncLayers])
  const renameLayer = useCallback((id: string, name: string) => {
    engineRef.current?.renameLayer(id, name); syncLayers()
  }, [syncLayers])
  const changeOpacity = useCallback((id: string, opacity: number) => {
    const e = engineRef.current; if (!e) return
    e.setLayerOpacity(id, opacity); refreshLayers(); syncLayers()
  }, [syncLayers, refreshLayers])
  const moveLayerUp = useCallback((id: string) => {
    const e = engineRef.current; if (!e) return
    e.saveSnapshot(shapes)
    e.reorderLayer(id, 1)
    syncLayers()
    refreshLayers()
  }, [shapes, syncLayers, refreshLayers])
  const moveLayerDown = useCallback((id: string) => {
    const e = engineRef.current; if (!e) return
    e.saveSnapshot(shapes)
    e.reorderLayer(id, -1)
    syncLayers()
    refreshLayers()
  }, [shapes, syncLayers, refreshLayers])

  const reorderLayers = useCallback((fromIdx: number, toIdx: number) => {
    const e = engineRef.current; if (!e) return
    e.saveSnapshot(shapes)
    e.moveLayer(fromIdx, toIdx)
    syncLayers()
    refreshLayers()
  }, [shapes, syncLayers, refreshLayers])

  // ── Track last drawing tool ──
  useEffect(() => {
    if (!["eyedropper", "fill", "gradient"].includes(activeTool)) {
      lastDrawingToolRef.current = activeTool
    }
  }, [activeTool])

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e2: KeyboardEvent) => {
      if (e2.target instanceof HTMLInputElement || e2.target instanceof HTMLTextAreaElement) return
      const eng = engineRef.current
      if ((e2.ctrlKey || e2.metaKey) && e2.key === 'z') { e2.preventDefault(); e2.shiftKey ? handleRedo() : handleUndo(); return }
      if ((e2.ctrlKey || e2.metaKey) && e2.key === 's') { e2.preventDefault(); handleSave(); return }
      if ((e2.ctrlKey || e2.metaKey) && e2.key === 'c') {
        if (selectedShapeId) {
          const allShapes = Object.values(shapes).flat()
          const found = allShapes.find(s => s.id === selectedShapeId)
          if (found) CLIPBOARD.objects = [JSON.parse(JSON.stringify(found))]
        }
        return
      }
      if ((e2.ctrlKey || e2.metaKey) && e2.key === 'x') {
        if (selectedShapeId) {
          const allShapes = Object.values(shapes).flat()
          const found = allShapes.find(s => s.id === selectedShapeId)
          if (found) CLIPBOARD.objects = [JSON.parse(JSON.stringify(found))]
          const lid = Object.entries(shapes).find(([, arr]) => arr.some(s => s.id === selectedShapeId))?.[0]
          if (lid) { deleteShape(lid, selectedShapeId); eng?.saveSnapshot(shapes); syncLayers() }
        }
        return
      }
      if ((e2.ctrlKey || e2.metaKey) && e2.key === 'v') {
        if (CLIPBOARD.objects.length > 0) {
          const lid = activeLayerId; if (!lid) return
          const copy = JSON.parse(JSON.stringify(CLIPBOARD.objects[0]))
          copy.id = makeObjId(); copy.x += 20; copy.y += 20
          addShape(lid, copy); eng?.saveSnapshot(shapes); setSelectedShapeId(copy.id); syncLayers()
        }
        return
      }
      if (e2.key === 'b') setActiveTool('brush')
      if (e2.key === 'e') setActiveTool('eraser')
      if (e2.key === 's') setActiveTool('smudge')
      if (e2.key === 'v') setActiveTool('select')
      if (e2.key === 'h') setActiveTool('pan')
      if (e2.key === 'g') setActiveTool('fill')
      if (e2.key === 'i') setActiveTool('eyedropper')
      if ((e2.key === 'Delete' || e2.key === 'Backspace') && selectedShapeId) {
        const lid = Object.entries(shapes).find(([, arr]) => arr.some(s => s.id === selectedShapeId))?.[0]
        if (lid) { deleteShape(lid, selectedShapeId); eng?.saveSnapshot(shapes); syncLayers() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo, handleSave, selectedShapeId, shapes, activeLayerId, syncLayers])

  // ── Shape renderer helper ──
  function ShapeRenderer({ s, isSelected, isTemp }: { s: PaintObject; isSelected?: boolean; isTemp?: boolean }) {
    const nodeRef = useRef<any>(null)
    useEffect(() => {
      if (nodeRef.current && !isTemp) shapeNodeRefs.current.set(s.id, nodeRef.current)
      return () => { if (!isTemp) shapeNodeRefs.current.delete(s.id) }
    }, [s.id, isTemp])
    useEffect(() => {
      if (isSelected && nodeRef.current && transformerRef.current) {
        transformerRef.current.nodes([nodeRef.current])
        transformerRef.current.getLayer()?.batchDraw()
      }
    }, [isSelected])
    const attrs: any = {
      id: s.id,
      name: "shape",
      x: s.x, y: s.y,
      rotation: s.rotation,
      opacity: s.opacity,
      draggable: activeTool === "select" && !isTemp,
      onClick: (evt: any) => {
        if (activeTool !== "select") return
        evt.cancelBubble = true
        setSelectedShapeId(s.id)
      },
      onTap: (evt: any) => {
        if (activeTool !== "select") return
        evt.cancelBubble = true
        setSelectedShapeId(s.id)
      },
      onDragEnd: (evt: any) => {
        if (!isTemp) updateShape(activeLayerId, s.id, { x: evt.target.x(), y: evt.target.y() })
      },
      onTransformEnd: (evt: any) => {
        if (isTemp) return
        const node = evt.target
        const sx = node.scaleX(), sy = node.scaleY()
        const updates: any = {
          x: node.x(), y: node.y(), rotation: node.rotation(),
        }
        if (s.points && (s.type === "line" || s.type === "triangle")) {
          updates.points = s.points.map((v, i) => i % 2 === 0 ? v * sx : v * sy)
          const xs: number[] = []; const ys: number[] = []
          for (let i = 0; i < updates.points.length; i += 2) { xs.push(updates.points[i]); ys.push(updates.points[i + 1]) }
          updates.width = Math.max(5, Math.max(...xs) - Math.min(...xs))
          updates.height = Math.max(5, Math.max(...ys) - Math.min(...ys))
        } else {
          updates.width = Math.max(5, node.width() * sx)
          updates.height = Math.max(5, node.height() * sy)
        }
        updateShape(activeLayerId, s.id, updates)
        node.scaleX(1); node.scaleY(1)
      },
    }
    switch (s.type) {
      case "rect":
        return <Rect ref={nodeRef} {...attrs} width={s.width} height={s.height} fill={s.fill} stroke={s.stroke || undefined} strokeWidth={s.strokeWidth || 0} />
      case "circle":
        return <Ellipse ref={nodeRef} {...attrs} radiusX={s.width / 2} radiusY={s.height / 2} fill={s.fill} stroke={s.stroke || undefined} strokeWidth={s.strokeWidth || 0} />
      case "line":
        return <Line ref={nodeRef} {...attrs} points={s.points || [0, s.height / 2, s.width, s.height / 2]} stroke={s.stroke || s.fill} strokeWidth={s.strokeWidth || 2} lineCap="round" />
      case "triangle":
        return <Line ref={nodeRef} {...attrs} points={s.points || [s.width / 2, 0, s.width, s.height, 0, s.height]} closed fill={s.fill} stroke={s.stroke || undefined} strokeWidth={s.strokeWidth || 0} />
      case "text":
        return <Text ref={nodeRef} {...attrs} text={s.text || "Text"} fontSize={s.fontSize || 24} fill={s.fill || "#000"} width={s.width} />
      case "image": {
        const cached = s.src ? imageCache.current.get(s.src) : undefined
        return <KonvaImage ref={nodeRef} {...attrs} image={cached} width={s.width} height={s.height} />
      }
      default: return null
    }
  }

  // ── Render ──
  return (
    <div className="relative flex flex-col overflow-hidden" style={{ height: "calc(100vh - 4rem)", background: "#0a0a12" }}>
      <EcliPaintTopBar
        title={paintingTitle} saving={saving} canvasSize={canvasSize} zoom={zoom}
        canUndo={undoAvailable} canRedo={redoAvailable}
        undoCount={undoAvailable ? 1 : 0} redoCount={redoAvailable ? 1 : 0}
        onUndo={handleUndo} onRedo={handleRedo}
        onSave={handleSave} onExport={handleExport} onImport={handleImport}
        onClear={() => setShowClearDialog(true)}
        onRename={() => { setTitleInput(paintingTitle); setShowTitleDialog(true) }}
        onBack={() => router.push("/dashboard/paint")}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset}
        showLayers={showLayers} showBrushes={showBrushes} showColors={showColors}
        onToggleLayers={() => { setShowLayers(v => !v); setShowBrushes(false); setShowColors(false) }}
        onToggleBrushes={() => { setShowBrushes(v => !v); setShowLayers(false); setShowColors(false) }}
        onToggleColors={() => { setShowColors(v => !v); setShowLayers(false); setShowBrushes(false) }}
        canvasRotation={canvasRotation} onRotateCanvas={handleRotateCanvas} onMirrorCanvas={handleMirrorCanvas}
      />

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleStageClick}
          style={{
            background: "#1a1a1a",
            cursor: activeTool === "select" ? "default" : activeTool === "pan" ? "grab" : "crosshair",
          }}
          className="relative touch-none"
        >
          {/* Checkerboard background - moves with pan/zoom, doesn't rotate */}
          <Layer
            x={centerX + panOffset.x}
            y={centerY + panOffset.y}
            scaleX={zoom}
            scaleY={zoom}
            listening={false}
          >
            <Rect
              x={0} y={0} width={canvasSize.width} height={canvasSize.height}
              fillPatternImage={checkerboardImg}
              fillPatternRepeat="repeat"
              listening={false}
            />
          </Layer>

          {layerUI.map((l) => {
            const layerShapes = shapes[l.id] || []
            return (
              <Layer
                key={l.id}
                x={centerX + panOffset.x}
                y={centerY + panOffset.y}
                scaleX={zoom}
                scaleY={zoom}
                opacity={l.opacity}
                visible={l.visible}
                clipX={0} clipY={0}
                clipWidth={canvasSize.width}
                clipHeight={canvasSize.height}
                ref={(node: any) => {
                  if (node) layerRefs.current.set(l.id, node)
                  else layerRefs.current.delete(l.id)
                }}
              >
                <Group
                  x={canvasSize.width / 2}
                  y={canvasSize.height / 2}
                  rotation={canvasRotation}
                  offsetX={canvasSize.width / 2}
                  offsetY={canvasSize.height / 2}
                >
                  <KonvaImage
                    image={engineRef.current?.getLayer(l.id)?.canvas || undefined}
                    listening={false}
                  />
                  {layerShapes.map(s => (
                    <ShapeRenderer key={s.id} s={s} isSelected={selectedShapeId === s.id} />
                  ))}
                </Group>
              </Layer>
            )
          })}

          {/* Transformer - same transform chain so handles align */}
          <Layer
            x={centerX + panOffset.x}
            y={centerY + panOffset.y}
            scaleX={zoom}
            scaleY={zoom}
            listening={false}
          >
            <Group
              x={canvasSize.width / 2}
              y={canvasSize.height / 2}
              rotation={canvasRotation}
              offsetX={canvasSize.width / 2}
              offsetY={canvasSize.height / 2}
            >
              {selectedShapeId && (
                <Transformer
                  ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 5 || newBox.height < 5) return oldBox
                    return newBox
                  }}
                  rotateEnabled
                  keepRatio={false}
                  enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
                />
              )}
            </Group>
          </Layer>

          {tempShape && (
            <Layer
              x={centerX + panOffset.x}
              y={centerY + panOffset.y}
              scaleX={zoom}
              scaleY={zoom}
              clipX={0} clipY={0}
              clipWidth={canvasSize.width}
              clipHeight={canvasSize.height}
              listening={false}
            >
              <Group
                x={canvasSize.width / 2}
                y={canvasSize.height / 2}
                rotation={canvasRotation}
                offsetX={canvasSize.width / 2}
                offsetY={canvasSize.height / 2}
              >
                <ShapeRenderer s={tempShape} isTemp />
              </Group>
            </Layer>
          )}
        </Stage>

        <EcliPaintToolStrip
          activeTool={activeTool} onToolChange={setActiveTool}
          brushSize={brushSize} onBrushSizeChange={setBrushSize}
          brushOpacity={brushOpacity} onBrushOpacityChange={setBrushOpacity}
          pressureSensitive={pressureSensitive}
          onPressureToggle={() => setPressureSensitive(v => !v)}
          onOpenSettings={() => setShowSettings(true)}
        />

        <EcliPaintSidebar
          showLayers={showLayers} showBrushes={showBrushes} showColors={showColors}
          layers={layerUI} activeLayerId={activeLayerId}
          onActiveLayerChange={(id) => {
            setActiveLayerId(id)
            const e = engineRef.current
            if (e && e.getLayer(id)) syncLayers()
          }}
          onAddLayer={addLayer} onDeleteLayer={deleteLayer}
          onToggleVisibility={toggleVisibility} onToggleLock={toggleLock}
          onRenameLayer={renameLayer} onOpacityChange={changeOpacity}
          onMoveUp={moveLayerUp} onMoveDown={moveLayerDown}
          onReorderLayers={reorderLayers}
          brushSettings={brushSettings} brushName={brushName}
          onBrushSelect={handleBrushSelect} brushColor={brushColor}
          color={brushColor} onColorChange={setBrushColor}
          getLayerCanvas={(id) => engineRef.current?.getLayer(id)?.canvas}
        />
      </div>

      {/* ── Bottom bar ── */}
      <div
        className="flex items-center gap-4 px-4 py-2 z-20"
        style={{
          background: "rgba(18,18,18,0.92)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          onClick={() => setShowColors(v => !v)}
          className="h-8 w-8 rounded-full border-2 border-white/20 shrink-0 transition-transform hover:scale-110"
          style={{ background: brushColor }}
        />

        <div className="flex items-center gap-2 flex-1 max-w-[300px]">
          <span className="text-[10px] text-white/30 uppercase tracking-wider w-6">Sz</span>
          <input
            type="range" min={1} max={200} value={brushSize}
            onChange={e2 => setBrushSize(Number(e2.target.value))}
            className="w-full h-1 appearance-none rounded-full cursor-pointer"
            style={{
              background: `linear-gradient(to right, #8b5cf6 ${(brushSize / 200) * 100}%, rgba(255,255,255,0.12) ${(brushSize / 200) * 100}%)`,
              accentColor: "#8b5cf6",
            }}
          />
          <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">{brushSize}</span>
        </div>

        <div className="w-px h-5 bg-white/10" />

        <div className="flex items-center gap-2 flex-1 max-w-[300px]">
          <span className="text-[10px] text-white/30 uppercase tracking-wider w-5">Op</span>
          <input
            type="range" min={1} max={100} value={Math.round(brushOpacity * 100)}
            onChange={e2 => setBrushOpacity(Number(e2.target.value) / 100)}
            className="w-full h-1 appearance-none rounded-full cursor-pointer"
            style={{
              background: `linear-gradient(to right, #a78bfa ${brushOpacity * 100}%, rgba(255,255,255,0.12) ${brushOpacity * 100}%)`,
              accentColor: "#a78bfa",
            }}
          />
          <span className="text-[10px] text-white/40 tabular-nums w-9 text-right">{Math.round(brushOpacity * 100)}%</span>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-[#1e1e1e] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-white/50" />
              <DialogTitle className="text-white/80">Settings</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white/70 text-sm">Pressure Sensitivity</Label>
                <p className="text-[11px] text-white/30 mt-0.5">Modulate brush size by stylus pressure</p>
              </div>
              <Switch
                checked={pressureSensitive}
                onCheckedChange={setPressureSensitive}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            <div className={cn("space-y-2 transition-opacity", !pressureSensitive && "opacity-30 pointer-events-none")}>
              <div className="flex items-center justify-between">
                <Label className="text-white/70 text-xs">Intensity</Label>
                <span className="text-[11px] text-white/40 tabular-nums">{Math.round(pressureIntensity * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.05} value={pressureIntensity}
                onChange={e => setPressureIntensity(Number(e.target.value))}
                className="w-full h-1 appearance-none rounded-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${pressureIntensity * 100}%, rgba(255,255,255,0.12) ${pressureIntensity * 100}%)`,
                  accentColor: "#8b5cf6",
                }}
              />
              <p className="text-[10px] text-white/20">How much pressure affects brush size</p>
            </div>

            <div className={cn("space-y-2 transition-opacity", !pressureSensitive && "opacity-30 pointer-events-none")}>
              <div className="flex items-center justify-between">
                <Label className="text-white/70 text-xs">Min Size</Label>
                <span className="text-[11px] text-white/40 tabular-nums">{Math.round(pressureMin * 100)}%</span>
              </div>
              <input
                type="range" min={0.05} max={0.5} step={0.05} value={pressureMin}
                onChange={e => setPressureMin(Number(e.target.value))}
                className="w-full h-1 appearance-none rounded-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${((pressureMin - 0.05) / 0.45) * 100}%, rgba(255,255,255,0.12) ${((pressureMin - 0.05) / 0.45) * 100}%)`,
                  accentColor: "#8b5cf6",
                }}
              />
              <p className="text-[10px] text-white/20">Brush size at lightest touch</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSettings(false)} className="text-white/50">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTitleDialog} onOpenChange={setShowTitleDialog}>
        <DialogContent className="bg-[#1e1e1e] border-white/10 text-white">
          <DialogHeader><DialogTitle>Rename Artwork</DialogTitle></DialogHeader>
          <Input value={titleInput} onChange={e2 => setTitleInput(e2.target.value)}
            onKeyDown={e2 => { if (e2.key === 'Enter') { setPaintingTitle(titleInput); setShowTitleDialog(false) } }}
            className="bg-white/5 border-white/10 text-white" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTitleDialog(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { setPaintingTitle(titleInput); setShowTitleDialog(false) }}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="bg-[#1e1e1e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Clear Layer</DialogTitle>
            <DialogDescription className="text-white/50">Remove all content from the current layer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmClear}>Clear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dataLoading && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
            <p className="text-white/40 text-sm">Loading artwork…</p>
          </div>
        </div>
      )}
    </div>
  )
}
