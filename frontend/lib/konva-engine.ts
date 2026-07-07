"use client"

export type PaintObjectType = "rect" | "circle" | "line" | "triangle" | "text" | "image"

export interface PaintObject {
  id: string
  type: PaintObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  text?: string
  fontSize?: number
  src?: string
  points?: number[]  // for line: [x1,y1, x2,y2]; triangle: [x1,y1, x2,y2, x3,y3] (relative to x,y)
}

let objIdCounter = 0
export function makeObjId() { return `obj_${++objIdCounter}_${Date.now()}` }

export interface PixelLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  canvas: HTMLCanvasElement
}

export interface SerializedPixelLayer {
  id: string; name: string; visible: boolean; locked: boolean; opacity: number
  dataUrl: string
}

export interface EngineSnapshot {
  layers: SerializedPixelLayer[]
  shapes: Record<string, PaintObject[]>
}

export class PixelEngine {
  private _width = 800
  private _height = 600
  private _layers: PixelLayer[] = []
  private _snapshots: EngineSnapshot[] = []
  private _redos: EngineSnapshot[] = []
  disposed = false

  get width() { return this._width }
  get height() { return this._height }
  get layers(): readonly PixelLayer[] { return this._layers }
  get snapshots() { return this._snapshots }
  get redos() { return this._redos }

  init(w: number, h: number) {
    this._width = w; this._height = h
    if (this._layers.length === 0) {
      this.addLayerInternal("bg", "Background")
      this.addLayerInternal("layer_1", "Layer 1")
    }
  }

  resize(w: number, h: number) {
    this._width = w; this._height = h
    for (const l of this._layers) {
      const old = l.canvas
      const nc = document.createElement("canvas")
      nc.width = w; nc.height = h
      const nctx = nc.getContext("2d")!
      nctx.drawImage(old, 0, 0)
      l.canvas = nc
    }
  }

  private addLayerInternal(id: string, name: string): PixelLayer {
    const canvas = document.createElement("canvas")
    canvas.width = this._width; canvas.height = this._height
    const pl: PixelLayer = { id, name, visible: true, locked: false, opacity: 1, canvas }
    this._layers.push(pl)
    return pl
  }

  addLayer(id: string, name: string) { this.addLayerInternal(id, name) }

  removeLayer(id: string) {
    const idx = this._layers.findIndex(l => l.id === id)
    if (idx > 0) this._layers.splice(idx, 1)
  }

  getLayer(id: string): PixelLayer | undefined { return this._layers.find(l => l.id === id) }
  getLayerIndex(id: string): number { return this._layers.findIndex(l => l.id === id) }

  getLayerCtx(id: string): CanvasRenderingContext2D | null {
    const l = this.getLayer(id)
    return l ? l.canvas.getContext("2d") : null
  }

  setLayerVisibility(id: string, v: boolean) { const l = this.getLayer(id); if (l) l.visible = v }
  setLayerOpacity(id: string, v: number) { const l = this.getLayer(id); if (l) l.opacity = v }
  setLayerLock(id: string, v: boolean) { const l = this.getLayer(id); if (l) l.locked = v }
  renameLayer(id: string, name: string) { const l = this.getLayer(id); if (l) l.name = name }

  reorderLayer(id: string, dir: 1 | -1) {
    const idx = this._layers.findIndex(l => l.id === id)
    if (idx < 1 || this._layers.length < 2) return
    const ni = idx + dir
    if (ni < 1 || ni >= this._layers.length) return
    ;[this._layers[idx], this._layers[ni]] = [this._layers[ni], this._layers[idx]]
  }

  moveLayer(fromIndex: number, toIndex: number) {
    if (fromIndex < 1 || fromIndex >= this._layers.length) return
    if (toIndex < 1) toIndex = 1
    if (toIndex >= this._layers.length) toIndex = this._layers.length - 1
    const [removed] = this._layers.splice(fromIndex, 1)
    this._layers.splice(toIndex, 0, removed)
  }

  clearLayer(id: string) {
    const ctx = this.getLayerCtx(id)
    if (ctx) ctx.clearRect(0, 0, this._width, this._height)
    this.getLayer(id)!.canvas = document.createElement("canvas")
    this.getLayer(id)!.canvas.width = this._width
    this.getLayer(id)!.canvas.height = this._height
  }

  mirrorLayer(id: string) {
    const ctx = this.getLayerCtx(id)
    const l = this.getLayer(id)
    if (!ctx || !l) return
    const d = ctx.getImageData(0, 0, this._width, this._height)
    ctx.save(); ctx.clearRect(0, 0, this._width, this._height)
    ctx.translate(this._width, 0); ctx.scale(-1, 1)
    ctx.putImageData(d, 0, 0); ctx.restore()
  }

  saveSnapshot(shapes: Record<string, PaintObject[]>) {
    this._redos = []
    this._snapshots.push({
      layers: this._layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity,
        dataUrl: l.canvas.toDataURL(),
      })),
      shapes: JSON.parse(JSON.stringify(shapes)),
    })
    if (this._snapshots.length > 30) this._snapshots.shift()
  }

  undo(shapes: Record<string, PaintObject[]>): EngineSnapshot | null {
    if (this._snapshots.length === 0) return null
    this._redos.push({
      layers: this._layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity,
        dataUrl: l.canvas.toDataURL(),
      })),
      shapes: JSON.parse(JSON.stringify(shapes)),
    })
    return this._snapshots.pop()!
  }

  redo(shapes: Record<string, PaintObject[]>): EngineSnapshot | null {
    if (this._redos.length === 0) return null
    this._snapshots.push({
      layers: this._layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity,
        dataUrl: l.canvas.toDataURL(),
      })),
      shapes: JSON.parse(JSON.stringify(shapes)),
    })
    return this._redos.pop()!
  }

  restoreLayers(layers: SerializedPixelLayer[]) {
    const keep: PixelLayer[] = []
    for (const sl of layers) {
      const existing = this._layers.find(l => l.id === sl.id)
      if (existing) {
        existing.name = sl.name; existing.visible = sl.visible
        existing.locked = sl.locked; existing.opacity = sl.opacity
        const ctx = existing.canvas.getContext("2d")!
        ctx.clearRect(0, 0, this._width, this._height)
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0)
        img.src = sl.dataUrl
        keep.push(existing)
      } else {
        const canvas = document.createElement("canvas")
        canvas.width = this._width; canvas.height = this._height
        const pl: PixelLayer = {
          id: sl.id, name: sl.name, visible: sl.visible, locked: sl.locked, opacity: sl.opacity, canvas,
        }
        const img = new Image()
        img.onload = () => pl.canvas.getContext("2d")!.drawImage(img, 0, 0)
        img.src = sl.dataUrl
        keep.push(pl)
      }
    }
    this._layers = keep
  }

  serialize(shapes: Record<string, PaintObject[]>): SerializedPixelLayer[] {
    return this._layers.map(l => ({
      id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity,
      dataUrl: l.canvas.toDataURL(),
    }))
  }

  async loadFromSerialized(data: SerializedPixelLayer[]) {
    this._layers = []; this._snapshots = []; this._redos = []
    for (const sl of data) {
      const canvas = document.createElement("canvas")
      canvas.width = this._width; canvas.height = this._height
      const pl: PixelLayer = {
        id: sl.id, name: sl.name, visible: sl.visible, locked: sl.locked, opacity: sl.opacity, canvas,
      }
      this._layers.push(pl)
      if (sl.dataUrl) {
        await new Promise<void>(resolve => {
          const img = new Image()
          img.onload = () => { pl.canvas.getContext("2d")!.drawImage(img, 0, 0); resolve() }
          img.onerror = () => resolve()
          img.src = sl.dataUrl
        })
      }
    }
  }

  getColorAt(x: number, y: number, bgCanvas?: HTMLCanvasElement): string {
    const c = document.createElement("canvas")
    c.width = this._width; c.height = this._height
    const ctx = c.getContext("2d")!
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0)
    for (const l of this._layers) {
      if (!l.visible) continue
      ctx.globalAlpha = l.opacity
      ctx.drawImage(l.canvas, 0, 0)
    }
    const px = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
    const hex = (n: number) => n.toString(16).padStart(2, "0")
    return `#${hex(px[0])}${hex(px[1])}${hex(px[2])}`
  }

  dispose() {
    this.disposed = true; this._layers = []; this._snapshots = []; this._redos = []
  }
}
