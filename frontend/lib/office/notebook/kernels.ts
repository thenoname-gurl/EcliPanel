import type {
  CellOutput,
  KernelRunOptions,
  KernelRunResult,
  NotebookKernelId,
} from "./types"

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n… (truncated, ${text.length - max} characters removed)`
}

export function formatJsValue(value: unknown, depth = 2, seen = new Set<unknown>()): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  const t = typeof value
  if (t === "string") return value as string
  if (t === "number" || t === "boolean" || t === "bigint" || t === "symbol") return String(value)
  if (t === "function") return `ƒ ${(value as any).name || "anonymous"}()`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (seen.has(value)) return "[Circular]"
  if (depth <= 0) return typeof (value as any).toString === "function" ? String(value) : "[…]"
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value.map((v) => formatJsValue(v, depth - 1, seen)).join(", ")}]`
    }
    if (value instanceof Map) {
      return `Map(${value.size}) { ${Array.from(value.entries())
        .map(([k, v]) => `${formatJsValue(k, depth - 1, seen)} => ${formatJsValue(v, depth - 1, seen)}`)
        .join(", ")} }`
    }
    if (value instanceof Set) {
      return `Set(${value.size}) { ${Array.from(value.values())
        .map((v) => formatJsValue(v, depth - 1, seen))
        .join(", ")} }`
    }
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      return `${value.constructor.name}(${(value as any).byteLength ?? (value as any).length})`
    }
    if (typeof (value as any).toJSON === "function") {
      return formatJsValue((value as any).toJSON(), depth - 1, seen)
    }
    if (value instanceof Object) {
      const entries = Object.entries(value as any)
      if (entries.length === 0) return "{}"
      return `{ ${entries.map(([k, v]) => `${k}: ${formatJsValue(v, depth - 1, seen)}`).join(", ")} }`
    }
  } finally {
    seen.delete(value)
  }
  return String(value)
}

export function toSerializable(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return value
  if (t === "function" || t === "symbol") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (Array.isArray(value)) return value.slice(0, 20).map(toSerializable)
  if (value instanceof Map || value instanceof Set) return toSerializable(Object.fromEntries(value.entries()))
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return `[${value.constructor.name}]`
  if (t === "object") {
    try {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as any)) {
        if (typeof v === "function" || typeof v === "symbol") continue
        out[k] = toSerializable(v)
      }
      return out
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function pushStream(
  tap: CellOutput[],
  name: "stdout" | "stderr",
  text: string,
  totalRef: { n: number; capped: boolean }
): void {
  if (!text) return
  const trimmed = text.length > 10_000 ? truncate(text, 10_000) : text
  totalRef.n += trimmed.length
  if (totalRef.n > 200_000) {
    if (!totalRef.capped) {
      totalRef.capped = true
      tap.push({ type: "stream", name: "stderr", text: "… output truncated (200k chars)" })
    }
    return
  }
  tap.push({ type: "stream", name, text: trimmed })
}

interface FengariModules {
  lua: any
  lauxlib: any
  lualib: any
  to_luastring: (s: string) => Uint8Array
  to_jsstring: (s: Uint8Array) => string
}

let fengariPromise: Promise<FengariModules> | null = null
function loadFengari(): Promise<FengariModules> {
  if (!fengariPromise) {
    fengariPromise = import("fengari")
      .then((m) => ({
        lua: m.lua,
        lauxlib: m.lauxlib,
        lualib: m.lualib,
        to_luastring: m.to_luastring,
        to_jsstring: m.to_jsstring,
      }))
      .catch((e) => {
        fengariPromise = null
        throw e
      })
  }
  return fengariPromise
}

function readLuaValue(F: FengariModules, L: any, idx: number): string {
  if (!F || !L) return ""
  try {
    F.lauxlib.luaL_tolstring(L, idx, null)
    const raw = F.lua.lua_tostring(L, -1)
    const out = raw ? F.to_jsstring(raw) : ""
    F.lua.lua_pop(L, 1)
    return out
  } catch {
    try {
      const s = F.lua.lua_tostring(L, idx)
      return s ? F.to_jsstring(s) : ""
    } catch {
      return "[unreadable value]"
    }
  }
}

function tableToJs(F: FengariModules, L: any, idx: number, depth = 0): unknown {
  const lua = F.lua
  const kind = lua.lua_type(L, idx)
  if (kind === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx)
  if (kind === lua.LUA_TSTRING) {
    const s = lua.lua_tostring(L, idx)
    return s ? F.to_jsstring(s) : ""
  }
  if (kind === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx)
  if (kind !== lua.LUA_TTABLE || depth > 8) return null

  const t = lua.lua_absindex(L, idx)
  const obj: Record<string, unknown> = {}
  let maxIndex = 0
  let count = 0
  let isArray = true
  lua.lua_pushnil(L)
  while (lua.lua_next(L, t) !== 0) {
    const absK = lua.lua_absindex(L, -2)
    const absV = lua.lua_absindex(L, -1)
    const k = tableToJs(F, L, absK, depth + 1)
    const v = tableToJs(F, L, absV, depth + 1)
    if (typeof k === "number" && Number.isInteger(k) && k >= 1) {
      obj[String(k)] = v
      if (k > maxIndex) maxIndex = k
    } else {
      obj[String(k)] = v
      isArray = false
    }
    count++
    lua.lua_pop(L, 1)
  }
  if (isArray && maxIndex === count) {
    const arr: unknown[] = []
    for (let i = 1; i <= maxIndex; i++) arr.push(obj[String(i)])
    return arr
  }
  return obj
}

function asNumbers(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "number")
  return []
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

const SERIES_PALETTE = ["#6366f1", "#f97316", "#10b981", "#ef4444", "#eab308", "#06b6d4", "#a855f7", "#84cc16"]

interface SeriesPoint {
  x: number
  y: number
}

interface ChartSeries {
  xs: number[]
  ys: number[]
  name: string
  color: string
  mode: "line" | "bar" | "scatter" | "area"
  barWidth?: number
}

interface ChartSpec {
  title?: string
  xlabel?: string
  ylabel?: string
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  gridColor?: string
  axisColor?: string
  labelColor?: string
  legendColor?: string
  showGrid?: boolean
  showLegend?: boolean
  multiAxis?: boolean
}

interface GraphNodeData {
  label: string
  color: string
  x?: number
  y?: number
}

interface GraphEdgeData {
  a: string
  b: string
  directed: boolean
  weight?: number
  label?: string
  color: string
}

interface GraphState {
  nodes: Map<string, GraphNodeData>
  edges: GraphEdgeData[]
  mode: "ring" | "grid"
}

interface SurfaceSpec {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  n: number
  elevation: number
  azimuth: number
  zscale: number
  color: string
  fill: boolean
  wire: boolean
}

class DrawingBoard {
  w = 640
  h = 480
  drawn = false
  private el: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private unsupportedWarned = false

  get available(): boolean {
    return this.ctx !== null
  }

  ensure(): void {
    if (this.ctx) return
    try {
      if (typeof document === "undefined") throw new Error("canvas requires a browser (no DOM here)")
      const el = document.createElement("canvas")
      el.width = this.w
      el.height = this.h
      const c = el.getContext("2d")
      if (!c) throw new Error("2d context unavailable")
      this.el = el
      this.ctx = c
      c.fillStyle = "#ffffff"
      c.fillRect(0, 0, this.w, this.h)
    } catch {
      this.ctx = null
    }
  }

  raw(): CanvasRenderingContext2D | null {
    this.ensure()
    return this.ctx
  }

  reset(width: number, height: number): void {
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)))
    this.w = clamp(width || 640, 64, 1600)
    this.h = clamp(height || 480, 64, 1200)
    this.el = null
    this.ctx = null
    this.drawn = false
    this.ensure()
  }

  snapshot(): string | null {
    this.ensure()
    if (!this.ctx || !this.drawn) return null
    try {
      return this.el!.toDataURL("image/png")
    } catch {
      return null
    }
  }
}

function niceTicks(dataMin: number, dataMax: number, count = 5): number[] {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return [0, 1]
  if (dataMax === dataMin) {
    dataMax += 1
    dataMin -= 1
  }
  const rawStep = (dataMax - dataMin) / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const start = Math.ceil(dataMin / step) * step
  const ticks: number[] = []
  for (let v = start; v <= dataMax + step * 1e-9 && ticks.length < 14; v += step) {
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

function fmtTick(v: number): string {
  if (Number.isInteger(v)) return String(v)
  const abs = Math.abs(v)
  if (abs >= 10000 || (abs > 0 && abs < 0.01)) return v.toExponential(1)
  return String(Number(v.toFixed(2)))
}

interface CartesianLayout {
  plotL: number
  plotR: number
  plotT: number
  plotB: number
  plotW: number
  plotH: number
  xTicks: number[]
  yTicks: number[]
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

function layoutCartesian(c: CanvasRenderingContext2D, series: ChartSeries[], spec: ChartSpec = {}): CartesianLayout {
  const W = c.canvas.width
  const H = c.canvas.height
  const scanX = spec.xMin === undefined || spec.xMax === undefined
  const scanY = spec.yMin === undefined || spec.yMax === undefined
  let xMin = spec.xMin ?? Infinity
  let xMax = spec.xMax ?? -Infinity
  let yMin = spec.yMin ?? Infinity
  let yMax = spec.yMax ?? -Infinity
  if (scanX || scanY) {
    for (const s of series) {
      if (scanY) {
        for (const y of s.ys) {
          if (y < yMin) yMin = y
          if (y > yMax) yMax = y
        }
      }
      if (scanX) {
        for (const x of s.xs) {
          if (x < xMin) xMin = x
          if (x > xMax) xMax = x
        }
      }
    }
  }
  if (!Number.isFinite(xMin)) xMin = 0
  if (!Number.isFinite(xMax)) xMax = 1
  if (xMin === xMax) xMax = xMin + 1
  if (!Number.isFinite(yMin)) yMin = 0
  if (!Number.isFinite(yMax)) yMax = 1
  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }

  const plotL = 56
  const plotR = Math.min(24, W * 0.06)
  const plotT = 18
  const plotB = 44
  const plotW = Math.max(80, W - plotL - plotR)
  const plotH = Math.max(80, H - plotT - plotB)
  const yTicks = niceTicks(yMin, yMax)
  const xTicks = niceTicks(xMin, xMax, 6)
  const yLo = yTicks[0] ?? yMin
  const yHi = yTicks[yTicks.length - 1] ?? yMax
  const xLo = xTicks[0] ?? xMin
  const xHi = xTicks[xTicks.length - 1] ?? xMax
  return { plotL, plotR, plotT, plotB, plotW, plotH, xTicks, yTicks, xMin: xLo, xMax: xHi, yMin: yLo, yMax: yHi }
}

function xToPx(l: CartesianLayout, W: number, x: number): number {
  return l.plotL + ((x - l.xMin) / (l.xMax - l.xMin || 1)) * l.plotW
}
function yToPx(l: CartesianLayout, H: number, y: number): number {
  return l.plotT + l.plotH - ((y - l.yMin) / (l.yMax - l.yMin || 1)) * l.plotH
}

function renderChart(c: CanvasRenderingContext2D, series: ChartSeries[], spec: ChartSpec): void {
  const W = c.canvas.width
  const H = c.canvas.height
  c.save()
  c.fillStyle = "#ffffff"
  c.fillRect(0, 0, W, H)
  c.fillStyle = "#18181b"
  if (spec.title) {
    c.font = "bold 13px sans-serif"
    c.textAlign = "center"
    c.textBaseline = "top"
    c.fillText(String(spec.title), W / 2, 6)
  }
  c.restore()

  const l = layoutCartesian(c, series, spec)
  if (spec.showGrid !== false) {
    c.save()
    c.strokeStyle = spec.gridColor ?? "#ececef"
    c.lineWidth = 1
    for (const t of l.yTicks) {
      c.beginPath()
      c.moveTo(l.plotL, yToPx(l, H, t))
      c.lineTo(l.plotL + l.plotW, yToPx(l, H, t))
      c.stroke()
    }
    c.restore()
  }

  c.save()
  c.strokeStyle = spec.axisColor ?? "#52525b"
  c.fillStyle = spec.labelColor ?? "#3f3f46"
  c.font = "11px sans-serif"
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(l.plotL, l.plotT)
  c.lineTo(l.plotL, l.plotT + l.plotH)
  c.lineTo(l.plotL + l.plotW, l.plotT + l.plotH)
  c.stroke()
  c.textAlign = "right"
  c.textBaseline = "middle"
  for (const t of l.yTicks) {
    c.fillText(fmtTick(t), l.plotL - 6, yToPx(l, H, t))
  }
  c.textAlign = "center"
  c.textBaseline = "top"
  for (const t of l.xTicks) {
    c.fillText(fmtTick(t), xToPx(l, W, t), l.plotT + l.plotH + 6)
  }
  if (spec.xlabel) c.fillText(String(spec.xlabel), l.plotL + l.plotW / 2, c.canvas.height - 4)
  if (spec.ylabel) {
    c.save()
    c.translate(12, l.plotT + l.plotH / 2)
    c.rotate(-Math.PI / 2)
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.fillText(String(spec.ylabel), 0, 0)
    c.restore()
  }
  c.restore()

  const showLegend = spec.showLegend === true || (spec.showLegend !== false && series.length > 1)
  if (showLegend) {
    c.save()
    c.font = "11px sans-serif"
    c.textAlign = "left"
    c.textBaseline = "middle"
    let total = 0
    const pieces = series.map((s) => {
      const w = c.measureText(s.name).width + 22
      total += w
      return { s, w }
    })
    let x = Math.max(l.plotL, (W - total) / 2)
    const y = Math.max(18, l.plotT * 0.5 + 6)
    for (const p of pieces) {
      c.fillStyle = p.s.color
      c.fillRect(x, y - 4, 12, 8)
      c.fillStyle = spec.legendColor ?? "#3f3f46"
      c.fillText(p.s.name, x + 16, y)
      x += p.w
    }
    c.restore()
  }

  const areaBase = Math.max(l.plotT, Math.min(l.plotT + l.plotH, yToPx(l, H, 0)))
  for (const s of series) {
    c.save()
    c.strokeStyle = s.color
    c.fillStyle = s.color
    c.lineWidth = 2
    if (s.mode === "bar") {
      const slots = Math.max(1, s.xs.length || 1)
      const slotW = (l.plotW / slots) * (s.barWidth ?? 0.62)
      const bw = Math.max(1, slotW - (s.barWidth === 1 ? 1 : 0))
      s.xs.forEach((xv, i) => {
        const y = s.ys[i] ?? 0
        const y0 = yToPx(l, H, 0)
        const y1 = yToPx(l, H, y)
        c.fillRect(xToPx(l, W, xv) - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0)))
      })
    } else if (s.mode === "scatter") {
      s.xs.forEach((xv, i) => {
        c.beginPath()
        c.arc(xToPx(l, W, xv), yToPx(l, H, s.ys[i] ?? 0), 3.5, 0, Math.PI * 2)
        c.fill()
      })
    } else if (s.mode === "area") {
      c.beginPath()
      s.xs.forEach((xv, i) => {
        const px = xToPx(l, W, xv)
        const py = yToPx(l, H, s.ys[i] ?? 0)
        if (i === 0) c.moveTo(px, py)
        else c.lineTo(px, py)
      })
      c.lineTo(xToPx(l, W, s.xs[s.xs.length - 1]), areaBase)
      c.lineTo(xToPx(l, W, s.xs[0]), areaBase)
      c.closePath()
      c.globalAlpha = 0.28
      c.fill()
      c.globalAlpha = 1
      c.beginPath()
      s.xs.forEach((xv, i) => {
        const px = xToPx(l, W, xv)
        const py = yToPx(l, H, s.ys[i] ?? 0)
        if (i === 0) c.moveTo(px, py)
        else c.lineTo(px, py)
      })
      c.stroke()
    } else {
      c.beginPath()
      s.xs.forEach((xv, i) => {
        const px = xToPx(l, W, xv)
        const py = yToPx(l, H, s.ys[i] ?? 0)
        if (i === 0) c.moveTo(px, py)
        else c.lineTo(px, py)
      })
      c.stroke()
      if (s.xs.length <= 40) {
        c.beginPath()
        s.xs.forEach((xv, i) => {
          c.arc(xToPx(l, W, xv), yToPx(l, H, s.ys[i] ?? 0), 2.5, 0, Math.PI * 2)
        })
        c.fill()
      }
    }
    c.restore()
  }
}

function renderPie(c: CanvasRenderingContext2D, values: number[], labels: string[], title?: string): void {
  const W = c.canvas.width
  const H = c.canvas.height
  c.save()
  c.fillStyle = "#ffffff"
  c.fillRect(0, 0, W, H)
  if (title) {
    c.fillStyle = "#18181b"
    c.font = "bold 13px sans-serif"
    c.textAlign = "center"
    c.textBaseline = "top"
    c.fillText(title, W / 2, 6)
  }
  c.restore()
  c.save()
  const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1
  const legendW = Math.min(170, W * 0.3)
  const cx = (W - legendW) / 2
  const cy = H / 2
  const r = Math.min(W - legendW, H) / 2 - 36
  let angle = -Math.PI / 2
  const slices = values.map((v, i) => ({ v: Math.max(0, v), i }))
  slices.forEach(({ v, i }) => {
    const frac = v / total
    const sweep = frac * Math.PI * 2
    c.fillStyle = SERIES_PALETTE[i % SERIES_PALETTE.length]
    c.beginPath()
    c.moveTo(cx, cy)
    c.arc(cx, cy, r, angle, angle + sweep)
    c.closePath()
    c.fill()
    const mid = angle + sweep / 2
    c.fillStyle = "#ffffff"
    c.font = "bold 11px sans-serif"
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.fillText(`${Math.round(frac * 100)}%`, cx + Math.cos(mid) * r * 0.62, cy + Math.sin(mid) * r * 0.62)
    angle += sweep
  })
  const labelsInfo = values.map((v, i) => ({ label: labels[i] ?? `${i + 1}`, v: Math.max(0, v), i }))
  const lx = W - legendW + 14
  let ly = cy - ((labelsInfo.length - 1) * 18) / 2
  for (const { label, v, i } of labelsInfo) {
    c.fillStyle = SERIES_PALETTE[i % SERIES_PALETTE.length]
    c.fillRect(lx, ly, 10, 10)
    c.fillStyle = "#18181b"
    c.font = "11px sans-serif"
    c.textAlign = "left"
    c.textBaseline = "middle"
    c.fillText(`${label} (${Math.round((v / total) * 100)}%)`, lx + 14, ly + 5)
    ly += 18
  }
  c.restore()
}

function renderGraph(c: CanvasRenderingContext2D, g: GraphState): void {
  const W = c.canvas.width
  const H = c.canvas.height
  c.save()
  c.fillStyle = "#ffffff"
  c.fillRect(0, 0, W, H)
  const ids = Array.from(g.nodes.keys())
  if (ids.length === 0) return

  const pad = 48
  const pos = new Map<string, { x: number; y: number }>()
  const manualIds: string[] = []
  for (const id of ids) {
    const n = g.nodes.get(id)!
    if (typeof n.x === "number" && typeof n.y === "number") {
      pos.set(id, { x: pad + (W - 2 * pad) * n.x, y: pad + (H - 2 * pad) * n.y })
      manualIds.push(id)
    }
  }
  const autoIds = ids.filter((id) => !manualIds.includes(id))
  if (autoIds.length > 0) {
    if (g.mode === "grid") {
      const cols = Math.max(1, Math.ceil(Math.sqrt(autoIds.length)))
      const rows = Math.ceil(autoIds.length / cols)
      const cellW = (W - 2 * pad) / cols
      const cellH = (H - 2 * pad) / rows
      autoIds.forEach((id, i) => {
        pos.set(id, { x: pad + cellW * (i % cols) + cellW / 2, y: pad + cellH * Math.floor(i / cols) + cellH / 2 })
      })
    } else {
      const cx = W / 2
      const cy = H / 2
      const r = Math.min(W, H) / 2 - Math.max(pad, 36)
      autoIds.forEach((id, i) => {
        const a = (i / autoIds.length) * Math.PI * 2 - Math.PI / 2
        pos.set(id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
      })
    }
  }

  for (const e of g.edges) {
    const p1 = pos.get(e.a)
    const p2 = pos.get(e.b)
    if (!p1 || !p2) continue
    c.strokeStyle = e.color
    c.fillStyle = e.color
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(p1.x, p1.y)
    c.lineTo(p2.x, p2.y)
    c.stroke()
    if (e.directed) {
      const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const ah = 12
      c.beginPath()
      c.moveTo(p2.x, p2.y)
      c.lineTo(p2.x - ah * Math.cos(ang - 0.42), p2.y - ah * Math.sin(ang - 0.42))
      c.lineTo(p2.x - ah * Math.cos(ang + 0.42), p2.y - ah * Math.sin(ang + 0.42))
      c.closePath()
      c.fill()
    }
    if (e.weight !== undefined || e.label) {
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      c.font = "11px sans-serif"
      c.textAlign = "center"
      c.textBaseline = "middle"
      c.fillStyle = "#52525b"
      const label = e.label ?? String(e.weight)
      const tw = c.measureText(label).width + 10
      c.fillStyle = "#ffffff"
      c.fillRect(mx - tw / 2, my - 16, tw, 15)
      c.fillStyle = "#52525b"
      c.fillText(label, mx, my - 9)
    }
  }

  const nodeR = Math.max(14, Math.min(24, Math.min(W, H) / (Math.max(6, ids.length) + 2)))
  for (const id of ids) {
    const p = pos.get(id)
    if (!p) continue
    const n = g.nodes.get(id)!
    c.save()
    c.shadowColor = "rgba(0,0,0,0.25)"
    c.shadowBlur = 8
    c.fillStyle = n.color
    c.beginPath()
    c.arc(p.x, p.y, nodeR, 0, Math.PI * 2)
    c.fill()
    c.restore()
    c.strokeStyle = "#ffffff"
    c.lineWidth = 2.5
    c.beginPath()
    c.arc(p.x, p.y, nodeR, 0, Math.PI * 2)
    c.stroke()
    c.fillStyle = "#ffffff"
    c.font = `bold ${Math.max(10, Math.floor(nodeR * 0.62))}px sans-serif`
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.fillText(n.label, p.x, p.y + 0.5)
  }
  c.restore()
}

function renderSurface(c: CanvasRenderingContext2D, f: (x: number, y: number) => number, spec: SurfaceSpec): void {
  const W = c.canvas.width
  const H = c.canvas.height
  c.save()
  c.fillStyle = "#ffffff"
  c.fillRect(0, 0, W, H)

  const N = Math.max(2, Math.min(80, Math.round(spec.n)))
  const z: number[][] = []
  let zMin = Infinity
  let zMax = -Infinity
  for (let i = 0; i <= N; i++) {
    const x = spec.xmin + ((spec.xmax - spec.xmin) * i) / N
    const row: number[] = []
    for (let j = 0; j <= N; j++) {
      const y = spec.ymin + ((spec.ymax - spec.ymin) * j) / N
      const v = Number(f(x, y))
      if (!Number.isFinite(v)) {
        row.push(0)
      } else {
        row.push(v)
        if (v < zMin) zMin = v
        if (v > zMax) zMax = v
      }
    }
    z.push(row)
  }
  if (!Number.isFinite(zMin)) {
    zMin = 0
    zMax = 1
  }
  const zMid = (zMin + zMax) / 2
  const zRange = (zMax - zMin) / 2 || 1

  const elev = (spec.elevation * Math.PI) / 180
  const azim = (spec.azimuth * Math.PI) / 180
  const cx = W / 2
  const cy = H / 2
  const scale = Math.min(W, H) / 2 - 36

  const xMid = (spec.xmin + spec.xmax) / 2
  const yMid = (spec.ymin + spec.ymax) / 2
  const xRange = (spec.xmax - spec.xmin) / 2 || 1
  const yRange = (spec.ymax - spec.ymin) / 2 || 1

  const proj = (i: number, j: number) => {
    const nx = ((spec.xmin + ((spec.xmax - spec.xmin) * i) / N - xMid) / xRange) * 2
    const ny = ((spec.ymin + ((spec.ymax - spec.ymin) * j) / N - yMid) / yRange) * 2
    const nz = ((z[i][j] - zMid) / zRange) * spec.zscale
    const z1 = ny * Math.sin(elev) + nz * Math.cos(elev)
    const y1 = ny * Math.cos(elev) - nz * Math.sin(elev)
    const x2 = nx * Math.cos(azim) + z1 * Math.sin(azim)
    const z2 = -nx * Math.sin(azim) + z1 * Math.cos(azim)
    return { x: cx + x2 * scale, y: cy - y1 * scale, z: z2 }
  }

  const hexToRgb = (hex: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return [99, 102, 241]
    const v = parseInt(m[1], 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const [cr, cg, cb] = hexToRgb(spec.color)

  const quads: { depth: number; pts: { x: number; y: number }[] }[] = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p00 = proj(i, j)
      const p10 = proj(i + 1, j)
      const p01 = proj(i, j + 1)
      const p11 = proj(i + 1, j + 1)
      const depth = (p00.z + p10.z + p01.z + p11.z) / 4
      quads.push({
        depth,
        pts: [
          { x: p00.x, y: p00.y },
          { x: p10.x, y: p10.y },
          { x: p11.x, y: p11.y },
          { x: p01.x, y: p01.y },
        ],
      })
    }
  }
  quads.sort((a, b) => b.depth - a.depth)

  for (const q of quads) {
    if (spec.fill) {
      c.fillStyle = `rgba(${cr},${cg},${cb},0.22)`
      c.beginPath()
      c.moveTo(q.pts[0].x, q.pts[0].y)
      q.pts.slice(1).forEach((p) => c.lineTo(p.x, p.y))
      c.closePath()
      c.fill()
    }
    if (spec.wire) {
      c.strokeStyle = `rgba(${cr},${cg},${cb},0.55)`
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(q.pts[0].x, q.pts[0].y)
      q.pts.slice(1).forEach((p) => c.lineTo(p.x, p.y))
      c.closePath()
      c.stroke()
    }
  }
  c.restore()
}

let activeLuaTap: CellOutput[] | null = null
let activeLuaTotal: { n: number; capped: boolean } = { n: 0, capped: false }

class LuaKernel {
  private F: FengariModules | null = null
  private L: any = null
  private board = new DrawingBoard()
  private chartSeries: ChartSeries[] = []
  private chartSpec: ChartSpec = {}
  private pie: { values: number[]; labels: string[] } | null = null
  private graph: GraphState = { nodes: new Map(), edges: [], mode: "ring" }
  private sprites = new Map<string, HTMLCanvasElement>()

  private async ensure(): Promise<FengariModules> {
    if (this.F && this.L) return this.F
    this.F = await loadFengari()
    this.L = this.F.lauxlib.luaL_newstate()
    this.F.lualib.luaL_openlibs(this.L)
    this.installHelpers()
    return this.F
  }

  private cfn(fn: (L: any) => number): any {
    const F = this.F!
    return (L: any) => {
      try {
        return fn(L)
      } catch (error: any) {
        if (error && error.status !== undefined) throw error
        F.lauxlib.luaL_error(L, F.to_luastring(String(error?.message ?? error)))
        return 0
      }
    }
  }

  private raiseError(msg: string): void {
    if (this.F && this.L) {
      this.F.lauxlib.luaL_error(this.L, this.F.to_luastring(msg))
    }
  }

  private warnStream(msg: string): void {
    if (activeLuaTap) pushStream(activeLuaTap, "stderr", msg, activeLuaTotal)
  }

  private clearBoard(): void {
    this.chartSeries = []
    this.chartSpec = {}
    this.pie = null
    this.board.reset(this.board.w, this.board.h)
  }

  private resetRunState(): void {
    this.chartSeries = []
    this.chartSpec = {}
    this.pie = null
    this.graph = { nodes: new Map(), edges: [], mode: "ring" }
    this.sprites.clear()
    this.board.reset(this.board.w, this.board.h)
  }

  private withCtx(cb: (c: CanvasRenderingContext2D) => void): void {
    this.board.ensure()
    if (!this.board.available) {
      this.warnStream("canvas/chart need a browser — the 2d drawing board is unavailable here")
      return
    }
    const c = this.board.raw()!
    this.board.drawn = true
    cb(c)
  }

  private renderChartState(): void {
    this.withCtx((c) => {
      if (this.pie) {
        renderPie(c, this.pie.values, this.pie.labels, this.chartSpec.title)
        return
      }
      if (this.chartSeries.length === 0) return
      renderChart(c, this.chartSeries, this.chartSpec)
    })
  }

  private renderGraphState(): void {
    if (this.graph.nodes.size === 0 && this.graph.edges.length === 0) {
      this.board.reset(this.board.w, this.board.h)
      return
    }
    this.withCtx((c) => renderGraph(c, this.graph))
  }

  private installHelpers(): void {
    if (!this.F || !this.L) return
    const { lua, lauxlib } = this.F
    const L = this.L
    const F = this.F
    const kernel = this

    lua.lua_pushcfunction(L, (L: any) => {
      if (!activeLuaTap) return 0
      const n = lua.lua_gettop(L)
      const parts: string[] = []
      for (let i = 1; i <= n; i++) {
        lua.lua_pushvalue(L, i)
        const s = readLuaValue(F, L, -1)
        lua.lua_pop(L, 1)
        parts.push(s)
      }
      pushStream(activeLuaTap, "stdout", parts.join("\t"), activeLuaTotal)
      return 0
    })
    lua.lua_setglobal(L, "print")
    lua.lua_newtable(L)
    lua.lua_pushstring(L, "1.0.0")
    lua.lua_setfield(L, -2, "version")
    lua.lua_pushcfunction(L, (L: any) => {
      lua.lua_pushnumber(L, Date.now())
      return 1
    })
    lua.lua_setfield(L, -2, "now")
    lua.lua_pushcfunction(L, (L: any) => {
      const ms = Math.min(Math.max(Number(lua.lua_tonumber(L, 1)) || 0, 0), 5000)
      const until = Date.now() + ms
      while (Date.now() < until) { /* busy bea */ }
      return 0
    })
    lua.lua_setfield(L, -2, "sleep")
    lua.lua_setglobal(L, "NB")

    const num = (L: any, i: number, d = 0): number => {
      const v = lua.lua_tonumber(L, i)
      return Number.isFinite(Number(v)) ? Number(v) : d
    }

    const mathGlobals: Array<[string, number | ((...args: number[]) => number)]> = [
      ["pi", Math.PI],
      ["e", Math.E],
      ["tau", Math.PI * 2],
      ["abs", Math.abs],
      ["sqrt", Math.sqrt],
      ["floor", Math.floor],
      ["ceil", Math.ceil],
      ["round", Math.round],
      ["sin", Math.sin],
      ["cos", Math.cos],
      ["tan", Math.tan],
      ["asin", Math.asin],
      ["acos", Math.acos],
      ["atan", Math.atan],
      ["atan2", Math.atan2],
      ["sinh", Math.sinh],
      ["cosh", Math.cosh],
      ["tanh", Math.tanh],
      ["exp", Math.exp],
      ["ln", Math.log],
      ["log", Math.log10],
      ["log2", Math.log2],
      ["min", Math.min],
      ["max", Math.max],
      ["sign", (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)],
      ["deg", (x: number) => (x * 180) / Math.PI],
      ["rad", (x: number) => (x * Math.PI) / 180],
    ]
    for (const [gname, fnOrNum] of mathGlobals) {
      if (typeof fnOrNum === "number") {
        lua.lua_pushnumber(L, fnOrNum)
      } else {
        lua.lua_pushcfunction(L, kernel.cfn((LL: any) => {
          const top = lua.lua_gettop(LL)
          const args: number[] = []
          for (let i = 1; i <= top; i++) args.push(num(LL, i))
          lua.lua_pushnumber(LL, fnOrNum(...args))
          return 1
        }))
      }
      lua.lua_setglobal(L, gname)
    }

    lua.lua_newtable(L)
    const pushCanvas = (name: string, fn: (L: any) => number) => {
      lua.lua_pushcfunction(L, kernel.cfn(fn))
      lua.lua_setfield(L, -2, name)
    }
    pushCanvas("new", (L: any) => {
      kernel.clearBoard()
      kernel.board.reset(num(L, 1, 640), num(L, 2, 480))
      return 0
    })
    pushCanvas("resize", (L: any) => {
      kernel.board.reset(num(L, 1, kernel.board.w), num(L, 2, kernel.board.h))
      kernel.withCtx((c) => {
        c.fillStyle = "#ffffff"
        c.fillRect(0, 0, c.canvas.width, c.canvas.height)
      })
      return 0
    })
    pushCanvas("clear", () => {
      kernel.clearBoard()
      return 0
    })
    pushCanvas("bg", (L: any) => {
      kernel.withCtx((c) => {
        c.fillStyle = readLuaValue(F, L, 1) || "#ffffff"
        c.fillRect(0, 0, c.canvas.width, c.canvas.height)
      })
      return 0
    })
    pushCanvas("color", (L: any) => {
      const r = Math.round(num(L, 1, 0))
      const g = Math.round(num(L, 2, 0))
      const b = Math.round(num(L, 3, 0))
      const a = num(L, 4, 1)
      lua.lua_pushstring(L, F.to_luastring(`rgba(${r},${g},${b},${a})`))
      return 1
    })
    pushCanvas("stroke", (L: any) => {
      kernel.withCtx((c) => {
        c.strokeStyle = readLuaValue(F, L, 1) || "#111111"
        c.lineWidth = num(L, 2, 1)
      })
      return 0
    })
    pushCanvas("fill", (L: any) => {
      kernel.withCtx((c) => {
        c.fillStyle = readLuaValue(F, L, 1) || "#111111"
      })
      return 0
    })
    pushCanvas("line", (L: any) => {
      kernel.withCtx((c) => {
        c.strokeStyle = readLuaValue(F, L, 5) || c.strokeStyle
        c.lineWidth = num(L, 6, c.lineWidth)
        c.beginPath()
        c.moveTo(num(L, 1), num(L, 2))
        c.lineTo(num(L, 3), num(L, 4))
        c.stroke()
      })
      return 0
    })
    pushCanvas("rect", (L: any) => {
      kernel.withCtx((c) => {
        c.strokeRect(num(L, 1), num(L, 2), num(L, 3), num(L, 4))
      })
      return 0
    })
    pushCanvas("fillRect", (L: any) => {
      kernel.withCtx((c) => {
        c.fillRect(num(L, 1), num(L, 2), num(L, 3), num(L, 4))
      })
      return 0
    })
    pushCanvas("circle", (L: any) => {
      kernel.withCtx((c) => {
        c.beginPath()
        c.arc(num(L, 1), num(L, 2), num(L, 3), 0, Math.PI * 2)
        c.stroke()
      })
      return 0
    })
    pushCanvas("fillCircle", (L: any) => {
      kernel.withCtx((c) => {
        c.beginPath()
        c.arc(num(L, 1), num(L, 2), num(L, 3), 0, Math.PI * 2)
        c.fill()
      })
      return 0
    })
    pushCanvas("polyline", (L: any) => {
      const points = tableToJs(F, L, 1)
      if (!Array.isArray(points)) return 0
      kernel.withCtx((c) => {
        c.beginPath()
        points.forEach((p: any, i: number) => {
          const xy = Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null
          if (!xy) return
          if (i === 0) c.moveTo(xy[0], xy[1])
          else c.lineTo(xy[0], xy[1])
        })
        c.stroke()
      })
      return 0
    })
    pushCanvas("polygon", (L: any) => {
      const points = tableToJs(F, L, 1)
      if (!Array.isArray(points)) return 0
      kernel.withCtx((c) => {
        c.beginPath()
        points.forEach((p: any, i: number) => {
          const xy = Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null
          if (!xy) return
          if (i === 0) c.moveTo(xy[0], xy[1])
          else c.lineTo(xy[0], xy[1])
        })
        c.closePath()
        c.fill()
        c.stroke()
      })
      return 0
    })
    pushCanvas("text", (L: any) => {
      const size = num(L, 4, 14)
      kernel.withCtx((c) => {
        c.font = `${size}px sans-serif`
        c.fillStyle = readLuaValue(F, L, 5) || c.fillStyle
        c.textAlign = readLuaValue(F, L, 6) as CanvasTextAlign || "left"
        c.textBaseline = "alphabetic"
        c.fillText(readLuaValue(F, L, 1), num(L, 2), num(L, 3))
      })
      return 0
    })
    pushCanvas("pixel", (L: any) => {
      kernel.withCtx((c) => {
        c.save()
        c.fillStyle = readLuaValue(F, L, 3) || "#111111"
        c.fillRect(num(L, 1), num(L, 2), 1, 1)
        c.restore()
      })
      return 0
    })

    pushCanvas("ellipse", (L: any) => {
      const cx = num(L, 1)
      const cy = num(L, 2)
      const rx = num(L, 3, 10)
      const ry = num(L, 4, rx)
      const rot = (num(L, 5, 0) * Math.PI) / 180
      const fill = lua.lua_toboolean(L, 6)
      kernel.withCtx((c) => {
        c.save()
        c.translate(cx, cy)
        c.rotate(rot)
        c.beginPath()
        c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        c.restore()
        if (fill) c.fill()
        else c.stroke()
      })
      return 0
    })
    pushCanvas("arc", (L: any) => {
      const cx = num(L, 1)
      const cy = num(L, 2)
      const r = num(L, 3, 20)
      const deg2rad = Math.PI / 180
      const start = num(L, 4, 0) * deg2rad
      const end = num(L, 5, 360) * deg2rad
      const filled = lua.lua_toboolean(L, 6)
      const close = lua.lua_toboolean(L, 7)
      kernel.withCtx((c) => {
        c.beginPath()
        if (close) c.moveTo(cx, cy)
        c.arc(cx, cy, r, start, end)
        if (close) c.closePath()
        if (filled) c.fill()
        else c.stroke()
      })
      return 0
    })
    pushCanvas("bezier", (L: any) => {
      kernel.withCtx((c) => {
        c.beginPath()
        c.moveTo(num(L, 1), num(L, 2))
        c.bezierCurveTo(num(L, 3), num(L, 4), num(L, 5), num(L, 6), num(L, 7), num(L, 8))
        c.stroke()
      })
      return 0
    })
    pushCanvas("save", () => {
      kernel.withCtx((c) => c.save())
      return 0
    })
    pushCanvas("restore", () => {
      kernel.withCtx((c) => c.restore())
      return 0
    })
    pushCanvas("rotate", (L: any) => {
      kernel.withCtx((c) => {
        c.rotate((num(L, 1, 0) * Math.PI) / 180)
      })
      return 0
    })
    pushCanvas("translate", (L: any) => {
      kernel.withCtx((c) => {
        c.translate(num(L, 1, 0), num(L, 2, 0))
      })
      return 0
    })
    pushCanvas("strokeWidth", (L: any) => {
      kernel.withCtx((c) => {
        c.lineWidth = num(L, 1, 1)
      })
      return 0
    })
    pushCanvas("alpha", (L: any) => {
      kernel.withCtx((c) => {
        c.globalAlpha = Math.max(0, Math.min(1, num(L, 1, 1)))
      })
      return 0
    })
    pushCanvas("roundRect", (L: any) => {
      const x = num(L, 1)
      const y = num(L, 2)
      const w = num(L, 3)
      const h = num(L, 4)
      const r = Math.min(num(L, 5, 8), Math.abs(w) / 2, Math.abs(h) / 2)
      const fill = lua.lua_toboolean(L, 6)
      kernel.withCtx((c) => {
        c.beginPath()
        c.moveTo(x + r, y)
        c.arcTo(x + w, y, x + w, y + h, r)
        c.arcTo(x + w, y + h, x, y + h, r)
        c.arcTo(x, y + h, x, y, r)
        c.arcTo(x, y, x + w, y, r)
        c.closePath()
        if (fill) c.fill()
        else c.stroke()
      })
      return 0
    })
    pushCanvas("linearGradient", (L: any) => {
      const x0 = num(L, 1)
      const y0 = num(L, 2)
      const x1 = num(L, 3, x0 + 100)
      const y1 = num(L, 4, y0)
      const c0 = readLuaValue(F, L, 5) || "#000000"
      const c1 = readLuaValue(F, L, 6) || "#ffffff"
      kernel.withCtx((c) => {
        const g = c.createLinearGradient(x0, y0, x1, y1)
        g.addColorStop(0, c0)
        g.addColorStop(1, c1)
        c.fillStyle = g
      })
      return 0
    })
    pushCanvas("radialGradient", (L: any) => {
      const x0 = num(L, 1)
      const y0 = num(L, 2)
      const r0 = num(L, 3, 0)
      const x1 = num(L, 4, x0)
      const y1 = num(L, 5, y0)
      const r1 = num(L, 6, 100)
      const c0 = readLuaValue(F, L, 7) || "#000000"
      const c1 = readLuaValue(F, L, 8) || "#ffffff"
      kernel.withCtx((c) => {
        const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1)
        g.addColorStop(0, c0)
        g.addColorStop(1, c1)
        c.fillStyle = g
      })
      return 0
    })
    pushCanvas("font", (L: any) => {
      const size = num(L, 1, 14)
      const weight = readLuaValue(F, L, 2) || "normal"
      const family = readLuaValue(F, L, 3) || "sans-serif"
      kernel.withCtx((c) => {
        c.font = `${weight} ${size}px ${family}`
      })
      return 0
    })
    pushCanvas("textAlign", (L: any) => {
      const a = readLuaValue(F, L, 1) as CanvasTextAlign || "left"
      kernel.withCtx((c) => {
        c.textAlign = a
      })
      return 0
    })
    pushCanvas("textBaseline", (L: any) => {
      const b = readLuaValue(F, L, 1) as CanvasTextBaseline || "alphabetic"
      kernel.withCtx((c) => {
        c.textBaseline = b
      })
      return 0
    })
    pushCanvas("lineDash", (L: any) => {
      const data = tableToJs(F, L, 1)
      const segs = Array.isArray(data) ? (data.map((v: any) => Number(v)).filter((v: any) => Number.isFinite(v)) as number[]) : []
      kernel.withCtx((c) => {
        c.setLineDash(segs.length ? segs : [])
      })
      return 0
    })
    pushCanvas("store", (L: any) => {
      const name = readLuaValue(F, L, 1) || "img"
      kernel.withCtx((c) => {
        const el = document.createElement("canvas")
        el.width = c.canvas.width
        el.height = c.canvas.height
        el.getContext("2d")!.drawImage(c.canvas, 0, 0)
        kernel.sprites.set(name, el)
      })
      return 0
    })
    pushCanvas("blit", (L: any) => {
      const name = readLuaValue(F, L, 1) || "img"
      const el = kernel.sprites.get(name)
      if (!el) {
        kernel.raiseError(`canvas.blit: unknown image "${name}" — call canvas.store(name) first`)
        return 0
      }
      kernel.withCtx((c) => {
        const w = num(L, 4, el.width)
        const h = num(L, 5, el.height)
        c.drawImage(el, num(L, 2, 0), num(L, 3, 0), w, h)
      })
      return 0
    })
    lua.lua_setglobal(L, "canvas")

    lua.lua_newtable(L)
    const pushChart = (name: string, fn: (L: any) => number) => {
      lua.lua_pushcfunction(L, kernel.cfn(fn))
      lua.lua_setfield(L, -2, name)
    }
    const readOpts = (L: any, i: number): Record<string, any> => {
      const o = tableToJs(F, L, i)
      return o && typeof o === "object" ? (o as Record<string, any>) : {}
    }
    const serieFromData = (L: any, dataArg: number, mode: ChartSeries["mode"], opts: Record<string, any>): ChartSeries | null => {
      const data = tableToJs(F, L, dataArg)
      let xs: number[] = []
      let ys: number[] = []
      if (Array.isArray(data)) {
        if (data.every((d) => Array.isArray(d) && d.length >= 2)) {
          xs = data.map((d: any) => Number(d[0]))
          ys = data.map((d: any) => Number(d[1]))
        } else if (data.every((d) => d && typeof d === "object" && "x" in d && "y" in d)) {
          xs = data.map((d: any) => Number(d.x))
          ys = data.map((d: any) => Number(d.y))
        } else {
          ys = data.filter((d) => typeof d === "number")
          xs = ys.map((_, i) => i + 1)
        }
      } else if (data && typeof data === "object") {
        xs = asNumbers((data as any).x)
        ys = asNumbers((data as any).y)
      }
      if (ys.length === 0) {
        kernel.raiseError(
          "chart: no numeric data — use {1,2,3}, {{x,y},…}, {x=…, y=…} or [{x=…,y=…}, …]"
        )
        return null
      }
      return {
        xs: xs.length === ys.length ? xs : ys.map((_, i) => i + 1),
        ys,
        mode,
        name: asString(opts.name, `series ${kernel.chartSeries.length + 1}`),
        color: asString(opts.color, SERIES_PALETTE[kernel.chartSeries.length % SERIES_PALETTE.length]),
      }
    }
    const applySpec = (opts: Record<string, any>) => {
      if (typeof opts.title === "string") kernel.chartSpec.title = opts.title
      if (typeof opts.xlabel === "string") kernel.chartSpec.xlabel = opts.xlabel
      if (typeof opts.ylabel === "string") kernel.chartSpec.ylabel = opts.ylabel
      if (typeof opts.gridColor === "string") kernel.chartSpec.gridColor = opts.gridColor
      if (typeof opts.axisColor === "string") kernel.chartSpec.axisColor = opts.axisColor
      if (typeof opts.labelColor === "string") kernel.chartSpec.labelColor = opts.labelColor
      if (typeof opts.legendColor === "string") kernel.chartSpec.legendColor = opts.legendColor
      if (typeof opts.showGrid === "boolean") kernel.chartSpec.showGrid = opts.showGrid
      if (typeof opts.showLegend === "boolean") kernel.chartSpec.showLegend = opts.showLegend
      if (typeof opts.xMin === "number") kernel.chartSpec.xMin = opts.xMin
      if (typeof opts.xMax === "number") kernel.chartSpec.xMax = opts.xMax
      if (typeof opts.yMin === "number") kernel.chartSpec.yMin = opts.yMin
      if (typeof opts.yMax === "number") kernel.chartSpec.yMax = opts.yMax
      if (typeof opts.width === "number") kernel.board.reset(opts.width, typeof opts.height === "number" ? opts.height : kernel.board.h)
    }
    const addSeries = (s: ChartSeries | null) => {
      if (!s) return
      kernel.chartSeries.push(s)
      kernel.pie = null
      kernel.renderChartState()
    }

    pushChart("clear", () => {
      kernel.clearBoard()
      return 0
    })
    pushChart("line", (L: any) => {
      applySpec(readOpts(L, 2))
      addSeries(serieFromData(L, 1, "line", readOpts(L, 2)))
      return 0
    })
    pushChart("scatter", (L: any) => {
      applySpec(readOpts(L, 2))
      addSeries(serieFromData(L, 1, "scatter", readOpts(L, 2)))
      return 0
    })
    pushChart("bar", (L: any) => {
      applySpec(readOpts(L, 2))
      addSeries(serieFromData(L, 1, "bar", readOpts(L, 2)))
      return 0
    })
    pushChart("pie", (L: any) => {
      const values = asNumbers(tableToJs(F, L, 1))
      if (values.length === 0) {
        kernel.raiseError("chart.pie: expected a numeric table")
        return 0
      }
      const opts = readOpts(L, 2)
      applySpec(opts)
      const labels = Array.isArray(opts.labels) ? opts.labels.map((x: any) => String(x)) : []
      kernel.pie = { values, labels }
      kernel.chartSeries = []
      kernel.renderChartState()
      return 0
    })
    pushChart("fn", (L: any) => {
      if (lua.lua_type(L, 1) !== lua.LUA_TFUNCTION) {
        kernel.raiseError("chart.fn: first argument must be a function y = f(x)")
        return 0
      }
      const opts = readOpts(L, 2)
      const xmin = Number(opts.xmin ?? opts.xMin ?? -10)
      const xmax = Number(opts.xmax ?? opts.xMax ?? 10)
      const n = Math.max(2, Math.min(400, Math.floor(Number(opts.n ?? 80))))
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i <= n; i++) {
        const x = xmin + ((xmax - xmin) * i) / n
        lua.lua_pushvalue(L, 1)
        lua.lua_pushnumber(L, x)
        const st = lua.lua_pcall(L, 1, 1, 0)
        if (st !== lua.LUA_OK) {
          const msg = readLuaValue(F, L, -1)
          lua.lua_pop(L, 1)
          kernel.raiseError(`chart.fn: ${msg}`)
          return 0
        }
        const y = lua.lua_tonumber(L, -1)
        lua.lua_pop(L, 1)
        if (typeof y !== "number" || !Number.isFinite(y)) continue
        xs.push(x)
        ys.push(y)
      }
      if (xs.length === 0) {
        kernel.raiseError("chart.fn: function returned no finite values over the domain")
        return 0
      }
      applySpec(opts)
      kernel.chartSeries.push({
        xs,
        ys,
        mode: "line",
        name: asString(opts.name, "f(x)"),
        color: asString(opts.color, SERIES_PALETTE[kernel.chartSeries.length % SERIES_PALETTE.length]),
      })
      kernel.pie = null
      kernel.renderChartState()
      return 0
    })
    pushChart("area", (L: any) => {
      const opts = readOpts(L, 2)
      applySpec(opts)
      addSeries(serieFromData(L, 1, "area", opts))
      return 0
    })
    pushChart("setArea", (L: any) => {
      const opts = readOpts(L, 2)
      applySpec(opts)
      kernel.chartSeries.forEach((s) => (s.mode = "area"))
      kernel.renderChartState()
      return 0
    })
    pushChart("histogram", (L: any) => {
      const data = tableToJs(F, L, 1)
      const values = Array.isArray(data) ? (data.filter((v: any) => typeof v === "number") as number[]) : []
      if (values.length === 0) {
        kernel.raiseError("chart.histogram: expected a numeric table")
        return 0
      }
      const opts = readOpts(L, 2)
      const bins = Math.max(1, Math.min(100, Math.floor(Number(opts.bins ?? 10))))
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const span = hi - lo
      const counts = new Array(bins).fill(0) as number[]
      for (const v of values) {
        const idx = span === 0 ? 0 : Math.min(bins - 1, Math.floor(((v - lo) / span) * bins))
        counts[idx] += 1
      }
      const xs = counts.map((_, i) => (span === 0 ? lo : lo + (span * (i + 0.5)) / bins))
      applySpec(opts)
      if (opts.xMin === undefined && opts.xMax === undefined && span !== 0) {
        kernel.chartSpec.xMin = lo
        kernel.chartSpec.xMax = hi
      }
      kernel.chartSeries.push({
        xs,
        ys: counts,
        mode: "bar",
        barWidth: 1,
        name: asString(opts.name, "histogram"),
        color: asString(opts.color, SERIES_PALETTE[0]),
      })
      kernel.pie = null
      kernel.renderChartState()
      return 0
    })
    lua.lua_setglobal(L, "chart")

    type ExprSampler = ((x: number) => number | undefined) & { close?: () => void }
    const exprSamplerFrom = (src: string, setFail: (m: string) => void): ExprSampler | null => {
      const chunkSrc = "local x = ...; return (" + src + ")"
      const ls = lauxlib.luaL_loadstring(L, F.to_luastring(chunkSrc))
      if (ls !== lua.LUA_OK) {
        setFail(String(readLuaValue(F, L, -1)))
        lua.lua_pop(L, 1)
        return null
      }
      const slot = lua.lua_gettop(L)
      const sample = ((x: number): number | undefined => {
        lua.lua_pushvalue(L, slot)
        lua.lua_pushnumber(L, x)
        let st = lua.lua_pcall(L, 1, 1, 0)
        if (st !== lua.LUA_OK) {
          setFail(String(readLuaValue(F, L, -1)))
          lua.lua_pop(L, 1)
          return undefined
        }
        let v = lua.lua_tonumber(L, -1)
        if (typeof v === "function") {
          lua.lua_pushvalue(L, -1)
          lua.lua_pushnumber(L, x)
          st = lua.lua_pcall(L, 1, 1, 0)
          if (st !== lua.LUA_OK) {
            setFail(String(readLuaValue(F, L, -1)))
            lua.lua_pop(L, 1)
            lua.lua_pop(L, 1)
            return undefined
          }
          v = lua.lua_tonumber(L, -1)
        }
        lua.lua_pop(L, 1)
        return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e7 ? v : undefined
      }) as ExprSampler
      sample.close = () => lua.lua_pop(L, 1)
      return sample
    }
    const sampleRange = (
      sample: (x: number) => number | undefined,
      xmin: number,
      xmax: number,
      n: number
    ): { xs: number[]; ys: number[] } => {
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i <= n; i++) {
        const x = xmin + ((xmax - xmin) * i) / n
        const y = sample(x)
        if (y !== undefined) {
          xs.push(x)
          ys.push(y)
        }
      }
      return { xs, ys }
    }
    const shadedArea = (xs: number[], ys: number[]): number => {
      let acc = 0
      for (let i = 1; i < xs.length; i++) {
        acc += ((ys[i] + ys[i - 1]) / 2) * (xs[i] - xs[i - 1])
      }
      return acc
    }
    const fmtNum = (v: number): string => {
      if (!Number.isFinite(v)) return "∞"
      const a = Math.abs(v)
      if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(2)
      return String(Number(v.toPrecision(5)))
    }
    const FUNC_NAMES_RESERVED = new Set([
      "x", "pi", "e", "tau", "abs", "sqrt", "floor", "ceil", "round",
      "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
      "sinh", "cosh", "tanh", "exp", "ln", "log", "log2", "min", "max",
      "sign", "deg", "rad", "print", "type", "tostring", "tonumber",
      "string", "table", "math", "os", "io", "NB", "canvas", "chart",
      "graph", "plot3d", "sprites", "board",
    ])
    const registerNamedFn = (name: string, src: string): boolean => {
      if (!/^[a-zA-Z_]\w*$/.test(name) || FUNC_NAMES_RESERVED.has(name)) return false
      const chunk = `if type(_G['${name}']) ~= 'number' then _G['${name}'] = function(x) return (${src}) end end`
      const ls = lauxlib.luaL_loadstring(L, F.to_luastring(chunk))
      if (ls !== lua.LUA_OK) {
        lua.lua_pop(L, 1)
        return false
      }
      const st = lua.lua_pcall(L, 0, 0, 0)
      lua.lua_pop(L, st === lua.LUA_OK ? 0 : 1)
      return st === lua.LUA_OK
    }
    const parseNamedExpr = (raw: string): { label: string; src: string; name?: string } => {
      const named = /^\s*([a-zA-Z_]\w*)\s*\(\s*x\s*\)\s*=\s*([\s\S]+?)\s*$/.exec(raw.trim())
      const yform = /^y\s*=\s*([\s\S]+)\s*$/i.exec(raw.trim())
      if (named) return { label: `${named[1]}(x)`, src: named[2].trim(), name: named[1] }
      if (yform) return { label: yform[1].trim(), src: yform[1].trim() }
      return { label: raw.trim(), src: raw.trim() }
    }

    lua.lua_newtable(L)
    const pushGraph = (name: string, fn: (L: any) => number) => {
      lua.lua_pushcfunction(L, kernel.cfn(fn))
      lua.lua_setfield(L, -2, name)
    }
    const graphNodeId = (L: any, i: number): string => {
      const v = readLuaValue(F, L, i)
      return String(v ?? "").trim()
    }
    const graphColor = (opts: Record<string, any>, fallback: string): string => {
      return typeof opts.color === "string" ? opts.color : fallback
    }
    const graphOpts = (L: any, i: number): Record<string, any> => readOpts(L, i)
    pushGraph("clear", () => {
      kernel.graph = { nodes: new Map(), edges: [], mode: "ring" }
      kernel.clearBoard()
      return 0
    })
    pushGraph("addNode", (L: any) => {
      const id = graphNodeId(L, 1)
      if (!id) {
        kernel.raiseError("graph.addNode: node id cannot be empty")
        return 0
      }
      const opts = graphOpts(L, 2)
      const label = typeof opts.label === "string" ? opts.label : id
      kernel.graph.nodes.set(id, {
        label,
        color: graphColor(opts, SERIES_PALETTE[(kernel.graph.nodes.size) % SERIES_PALETTE.length]),
        x: typeof opts.x === "number" ? opts.x : undefined,
        y: typeof opts.y === "number" ? opts.y : undefined,
      })
      kernel.renderGraphState()
      return 0
    })
    pushGraph("removeNode", (L: any) => {
      const id = graphNodeId(L, 1)
      kernel.graph.nodes.delete(id)
      kernel.graph.edges = kernel.graph.edges.filter((e) => e.a !== id && e.b !== id)
      kernel.renderGraphState()
      return 0
    })
    pushGraph("addEdge", (L: any) => {
      const a = graphNodeId(L, 1)
      const b = graphNodeId(L, 2)
      if (!a || !b) {
        kernel.raiseError("graph.addEdge: both endpoints are required")
        return 0
      }
      if (!kernel.graph.nodes.has(a) || !kernel.graph.nodes.has(b)) {
        kernel.raiseError(`graph.addEdge: unknown node "${!kernel.graph.nodes.has(a) ? a : b}" — addNode first`)
        return 0
      }
      const opts = graphOpts(L, 3)
      kernel.graph.edges.push({
        a,
        b,
        directed: lua.lua_toboolean(L, 4) || opts.directed === true,
        weight: typeof opts.weight === "number" ? opts.weight : undefined,
        label: typeof opts.label === "string" ? opts.label : undefined,
        color: graphColor(opts, "#a1a1aa"),
      })
      kernel.renderGraphState()
      return 0
    })
    pushGraph("layout", (L: any) => {
      const mode = readLuaValue(F, L, 1)
      kernel.graph.mode = mode === "grid" ? "grid" : "ring"
      kernel.renderGraphState()
      return 0
    })
    pushGraph("fn", (L: any) => {
      const t1 = lua.lua_type(L, 1)
      const opts = graphOpts(L, 2)
      if (t1 !== lua.LUA_TSTRING && t1 !== lua.LUA_TFUNCTION) {
        kernel.raiseError('graph.fn: expected an expression like "x^2" or a named "f(x) = x^2"')
        return 0
      }
      let fail = ""
      const setFail = (m: string) => { fail = m }
      let exprLabel = "f(x)"
      let sample: ExprSampler | null = null
      if (t1 === lua.LUA_TSTRING) {
        const raw = readLuaValue(F, L, 1)
        const parsed = parseNamedExpr(raw)
        if (!parsed.src) {
          kernel.raiseError("graph.fn: empty expression")
          return 0
        }
        exprLabel = parsed.label
        const s = exprSamplerFrom(parsed.src, setFail)
        if (!s) {
          const gm = /\(global '(.+?)'\)/.exec(fail)
          kernel.raiseError(
            gm
              ? `graph.fn: '${gm[1]}' is not defined — run a cell that assigns ${gm[1]} = <value> first (globals persist across cells)`
              : "graph.fn: " + fail
          )
          return 0
        }
        sample = s
        if (parsed.name) registerNamedFn(parsed.name, parsed.src)
      } else {
        sample = ((x: number): number | undefined => {
          lua.lua_pushvalue(L, 1)
          lua.lua_pushnumber(L, x)
          const st = lua.lua_pcall(L, 1, 1, 0)
          if (st !== lua.LUA_OK) {
            setFail(String(readLuaValue(F, L, -1)))
            lua.lua_pop(L, 1)
            return undefined
          }
          const v = lua.lua_tonumber(L, -1)
          lua.lua_pop(L, 1)
          return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e7 ? v : undefined
        }) as ExprSampler
      }
      applySpec(opts)
      const color = asString(opts.color, SERIES_PALETTE[0])
      const n = Math.max(2, Math.min(800, Math.floor(Number(opts.n ?? 200))))
      const xmin = Number(opts.xmin ?? opts.xMin ?? -10)
      const xmax = Number(opts.xmax ?? opts.xMax ?? 10)

      const intervalArea =
        opts.area && typeof opts.area === "object" && typeof opts.area.a === "number"
          ? { lo: Math.max(Number(opts.area.a), xmin), hi: Math.min(Number(opts.area.b ?? xmax), xmax) }
          : null
      const fullArea = opts.area === true

      const strip = intervalArea
        ? sampleRange(sample, intervalArea.lo, intervalArea.hi, n)
        : null
      let full = sampleRange(sample, xmin, xmax, n)
      if (sample.close) sample.close()

      if (full.xs.length === 0 && !intervalArea) {
        const gm = /\(global '(.+?)'\)/.exec(fail)
        kernel.raiseError(
          gm
            ? `graph.fn: '${gm[1]}' is not defined — run a cell that assigns ${gm[1]} = <value> first (globals persist across cells)`
            : "graph.fn: " + (fail || "no finite values over the domain")
        )
        return 0
      }
      if (intervalArea && strip && strip.xs.length === 0 && full.xs.length === 0) {
        const gm = /\(global '(.+?)'\)/.exec(fail)
        kernel.raiseError(
          gm
            ? `graph.fn: '${gm[1]}' is not defined — run a cell that assigns ${gm[1]} = <value> first (globals persist across cells)`
            : "graph.fn: " + (fail || "no finite values over [" + intervalArea.lo + ", " + intervalArea.hi + "]")
        )
        return 0
      }

      if (intervalArea && strip && strip.xs.length > 0) {
        const sLo = strip.xs[0]
        const sHi = strip.xs[strip.xs.length - 1]
        if (opts.xMin === undefined && opts.xMax === undefined) {
          const pad = (sHi - sLo) * 0.15
          kernel.chartSpec.xMin = sLo - pad
          kernel.chartSpec.xMax = sHi + pad
        }
        if (full.xs.length > 0) {
          kernel.chartSeries.push({ xs: full.xs, ys: full.ys, mode: "line", name: asString(opts.name, exprLabel), color })
        }
        const value = shadedArea(strip.xs, strip.ys)
        const named =
          typeof opts.name === "string" && opts.name.trim() !== ""
            ? asString(opts.name, "")
            : `∫ ${exprLabel} = ${fmtNum(value)}`
        kernel.chartSeries.push({ xs: strip.xs, ys: strip.ys, mode: "area", name: named, color })
      } else {
        kernel.chartSeries.push({
          xs: full.xs,
          ys: full.ys,
          mode: fullArea ? "area" : "line",
          name: asString(opts.name, exprLabel),
          color,
        })
      }
      kernel.pie = null
      kernel.renderChartState()
      return 0
    })
    pushGraph("integral", (L: any) => {
      const t1 = lua.lua_type(L, 1)
      if (t1 !== lua.LUA_TSTRING && t1 !== lua.LUA_TFUNCTION) {
        kernel.raiseError('graph.integral: expected an expression like "x^2"')
        return 0
      }
      const a = num(L, 2)
      const b = num(L, 3)
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-9) {
        kernel.raiseError("graph.integral: need two distinct numbers for the interval")
        return 0
      }
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const opts = graphOpts(L, 4)
      let fail = ""
      const setFail = (m: string) => { fail = m }
      let exprLabel = "f(x)"
      let sample: ExprSampler | null = null
      if (t1 === lua.LUA_TSTRING) {
        const raw = readLuaValue(F, L, 1)
        const parsed = parseNamedExpr(raw)
        if (!parsed.src) {
          kernel.raiseError("graph.integral: empty expression")
          return 0
        }
        exprLabel = parsed.label
        const s = exprSamplerFrom(parsed.src, setFail)
        if (!s) {
          const gm = /\(global '(.+?)'\)/.exec(fail)
          kernel.raiseError(
            gm
              ? `graph.integral: '${gm[1]}' is not defined — run a cell that assigns ${gm[1]} = <value> first`
              : "graph.integral: " + fail
          )
          return 0
        }
        sample = s
        if (parsed.name) registerNamedFn(parsed.name, parsed.src)
      } else {
        sample = ((x: number): number | undefined => {
          lua.lua_pushvalue(L, 1)
          lua.lua_pushnumber(L, x)
          const st = lua.lua_pcall(L, 1, 1, 0)
          if (st !== lua.LUA_OK) {
            setFail(String(readLuaValue(F, L, -1)))
            lua.lua_pop(L, 1)
            return undefined
          }
          const v = lua.lua_tonumber(L, -1)
          lua.lua_pop(L, 1)
          return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e7 ? v : undefined
        }) as ExprSampler
      }
      applySpec(opts)
      const n = Math.max(2, Math.min(800, Math.floor(Number(opts.n ?? 200))))
      const strip = sampleRange(sample, lo, hi, n)
      let curve: { xs: number[]; ys: number[] } | null = null
      if (opts.curve !== false) {
        const pad = (hi - lo) * 0.2
        curve = sampleRange(sample, Number(opts.xmin ?? opts.xMin ?? lo - pad), Number(opts.xmax ?? opts.xMax ?? hi + pad), n)
      }
      if (sample.close) sample.close()
      if (strip.xs.length === 0) {
        const gm = /\(global '(.+?)'\)/.exec(fail)
        kernel.raiseError(
          gm
            ? `graph.integral: '${gm[1]}' is not defined — run a cell that assigns ${gm[1]} = <value> first`
            : "graph.integral: " + (fail || "no finite values over [" + lo + ", " + hi + "]")
        )
        return 0
      }
      const value = shadedArea(strip.xs, strip.ys)
      if (opts.xMin === undefined && opts.xMax === undefined) {
        const pad = (hi - lo) * 0.15
        kernel.chartSpec.xMin = lo - pad
        kernel.chartSpec.xMax = hi + pad
      }
      const color = asString(opts.color, SERIES_PALETTE[0])
      if (curve && curve.xs.length > 0) {
        kernel.chartSeries.push({ xs: curve.xs, ys: curve.ys, mode: "line", name: asString(opts.name, exprLabel), color })
      }
      kernel.chartSeries.push({
        xs: strip.xs,
        ys: strip.ys,
        mode: "area",
        name:
          typeof opts.name === "string" && opts.name.trim() !== ""
            ? asString(opts.name, "")
            : `∫ ${exprLabel} = ${fmtNum(value)}`,
        color,
      })
      kernel.pie = null
      kernel.renderChartState()
      return 0
    })
    pushGraph("draw", () => {
      kernel.withCtx((c) => {
        renderGraph(c, kernel.graph)
      })
      return 0
    })
    lua.lua_setglobal(L, "graph")

    lua.lua_newtable(L)
    const pushPlot3d = (name: string, fn: (L: any) => number) => {
      lua.lua_pushcfunction(L, kernel.cfn(fn))
      lua.lua_setfield(L, -2, name)
    }
    pushPlot3d("fn", (L: any) => {
      if (lua.lua_type(L, 1) !== lua.LUA_TFUNCTION) {
        kernel.raiseError("plot3d.fn: first argument must be a function z = f(x, y)")
        return 0
      }
      const opts = readOpts(L, 2)
      const spec: SurfaceSpec = {
        xmin: Number(opts.xmin ?? -2),
        xmax: Number(opts.xmax ?? 2),
        ymin: Number(opts.ymin ?? -2),
        ymax: Number(opts.ymax ?? 2),
        n: Math.max(2, Math.min(60, Math.floor(Number(opts.n ?? 24)))),
        elevation: Number(opts.elevation ?? 35),
        azimuth: Number(opts.azimuth ?? 35),
        zscale: Number(opts.zscale ?? 1),
        color: typeof opts.color === "string" ? opts.color : "#6366f1",
        fill: opts.fill !== false,
        wire: opts.wire !== false,
      }
      kernel.withCtx((c) => {
        const f = (x: number, y: number): number => {
          lua.lua_pushvalue(L, 1)
          lua.lua_pushnumber(L, x)
          lua.lua_pushnumber(L, y)
          const st = lua.lua_pcall(L, 2, 1, 0)
          if (st !== lua.LUA_OK) {
            const msg = readLuaValue(F, L, -1)
            lua.lua_pop(L, 1)
            kernel.raiseError(`plot3d.fn: ${msg}`)
            return 0
          }
          const v = lua.lua_tonumber(L, -1)
          lua.lua_pop(L, 1)
          return typeof v === "number" ? v : 0
        }
        if (opts.width) kernel.board.reset(Number(opts.width), Number(opts.height) || kernel.board.h)
        renderSurface(c, f, spec)
      })
      return 0
    })
    pushPlot3d("clear", () => {
      kernel.clearBoard()
      return 0
    })
    lua.lua_setglobal(L, "plot3d")
  }

  async run(source: string, opts: KernelRunOptions = {}): Promise<KernelRunResult> {
    const { lua, lauxlib } = await this.ensure()
    const L = this.L
    const tap: CellOutput[] = []
    const total = { n: 0, capped: false }
    const started = performance.now()
    const timeoutMs = opts.timeoutMs ?? 10_000
    const F = this.F!

    activeLuaTap = tap
    activeLuaTotal = total
    this.resetRunState()
    let errored = false
    try {
      const loadStatus = lauxlib.luaL_loadstring(L, F.to_luastring(source))
      if (loadStatus !== lua.LUA_OK) {
        const msg = readLuaValue(F, L, -1)
        lua.lua_pop(L, 1)
        tap.push({ type: "error", errorType: "Syntax error", traceback: msg })
        errored = true
      } else {
        const callStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0)
        if (callStatus !== lua.LUA_OK) {
          const msg = readLuaValue(F, L, -1)
          lua.lua_pop(L, 1)
          tap.push({ type: "error", errorType: "Runtime error", traceback: msg })
          errored = true
        }
      }
    } catch (error: any) {
      tap.push({ type: "error", errorType: error?.name || "Error", traceback: String(error?.message ?? error) })
      errored = true
    } finally {
      activeLuaTap = null
      activeLuaTotal = { n: 0, capped: false }
      if (!errored) {
        const img = this.board.snapshot()
        if (img) tap.push({ type: "image", mimeType: "image/png", dataUrl: img })
      }
      this.board.reset(this.board.w, this.board.h)
      this.chartSeries = []
      this.chartSpec = {}
      this.pie = null
    }

    const elapsed = performance.now() - started
    return { durationMs: elapsed, outputs: tap, aborted: elapsed > timeoutMs }
  }

  reset(): void {
    if (this.F && this.L) {
      try {
        this.F.lua.lua_close(this.L)
      } catch {
        /* ignore */
      }
    }
    this.L = null
    this.board.reset(this.board.w, this.board.h)
    this.chartSeries = []
    this.chartSpec = {}
    this.pie = null
    this.graph = { nodes: new Map(), edges: [], mode: "ring" }
    this.sprites.clear()
  }
}

export interface NotebookRuntime {
  run: (language: NotebookKernelId, source: string, opts?: KernelRunOptions) => Promise<KernelRunResult>
  reset: (language: NotebookKernelId) => Promise<void>
}

export function createNotebookRuntime(): NotebookRuntime {
  const luaKernel = new LuaKernel()
  return {
    run: (language, source, opts) => luaKernel.run(source, opts),
    reset: () => {
      luaKernel.reset()
      return Promise.resolve()
    },
  }
}

export type { KernelRunResult, NotebookKernelId }