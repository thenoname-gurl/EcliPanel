"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Link2,
  Eraser,
  X,
  Plus,
  PaintBucket,
} from "lucide-react"
import HyperFormula from "hyperformula"
import * as Y from "yjs"
import { toast } from "sonner"
import { mapSet, mapDelete, type OfficeProvider } from "@/lib/office/collab"
import type { OfficeApiRef, SheetCellStyle, SheetImage, SheetSnapshot } from "@/lib/office/editorApi"
import { parseCsv, toCsv } from "@/lib/office/editorApi"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Props {
  provider: OfficeProvider
  readOnly?: boolean
  initialContent?: unknown
  apiRef?: OfficeApiRef
  onEditorReady?: () => void
}

const DEFAULT_COLS = 12
const DEFAULT_ROWS = 40
const CELL_W = 64
const CELL_H = 28
const HEADER_W = 40
const HEADER_H = 28

function colLetter(n: number): string {
  let s = ""
  let i = n
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s
    i = Math.floor(i / 26) - 1
  }
  return s
}

function cellKey(col: number, row: number): string {
  return `cell:${col}:${row}`
}

function fmtKey(col: number, row: number): string {
  return `fmt:${col}:${row}`
}

interface Snap {
  cols: number
  rows: number
  cells: Record<string, string>
  styles?: Record<string, SheetCellStyle>
  images?: SheetImage[]
}

function snapshotFromContent(content: unknown): Snap | null {
  if (!content || typeof content !== "object") return null
  const c = content as any
  if (!Array.isArray(c.cells) && typeof c.cells !== "object") return null
  const cells: Record<string, string> = {}
  let maxCol = -1
  let maxRow = -1
  const raw = c.cells as any
  if (Array.isArray(raw)) {
    raw.forEach((rowArr: any, r: number) => {
      if (!Array.isArray(rowArr)) return
      rowArr.forEach((v: any, col: number) => {
        if (v === null || v === undefined) return
        cells[`cell:${col}:${r}`] = String(v)
        if (col > maxCol) maxCol = col
        if (r > maxRow) maxRow = r
      })
    })
  } else {
    for (const [addr, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue
      const m = /^([A-Z]+)(\d+)$/.exec(addr.toUpperCase())
      if (m) {
        let col = 0
        for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
        const row = parseInt(m[2], 10) - 1
        cells[`cell:${col - 1}:${row}`] = String(v)
        if (col - 1 > maxCol) maxCol = col - 1
        if (row > maxRow) maxRow = row
      } else {
        cells[addr] = String(v)
      }
    }
  }
  const styles: Record<string, SheetCellStyle> = {}
  const rawStyles = c.styles
  if (rawStyles && typeof rawStyles === "object") {
    for (const [k, v] of Object.entries(rawStyles)) {
      if (typeof v === "string") {
        try {
          styles[k] = JSON.parse(v) as SheetCellStyle
        } catch {
          /* skip */
        }
      } else if (v && typeof v === "object") {
        styles[k] = v as SheetCellStyle
      }
    }
  }
  let images: SheetImage[] | undefined
  const rawImages = c.images
  if (Array.isArray(rawImages)) {
    images = rawImages.filter((i: any) => i && i.src).map((i: any) => ({ id: i.id, col: Number(i.col) || 0, row: Number(i.row) || 0, src: i.src, w: Number(i.w) || 200, h: Number(i.h) || 120 }))
  } else if (rawImages && typeof rawImages === "object") {
    images = Object.values(rawImages as any)
      .filter((i: any) => i && i.src)
      .map((i: any) => ({ id: i.id, col: Number(i.col) || 0, row: Number(i.row) || 0, src: i.src, w: Number(i.w) || 200, h: Number(i.h) || 120 }))
  }
  return {
    cols: Math.max(DEFAULT_COLS, maxCol + 1),
    rows: Math.max(DEFAULT_ROWS, maxRow + 1),
    cells,
    styles,
    images,
  }
}

interface Draft {
  col: number
  row: number
  value: string
}

interface Range {
  c0: number
  r0: number
  c1: number
  r1: number
}

function rangeNorm(c0: number, r0: number, c1: number, r1: number): Range {
  return { c0: Math.min(c0, c1), c1: Math.max(c0, c1), r0: Math.min(r0, r1), r1: Math.max(r0, r1) }
}

function cellsToRows(snap: { cols: number; rows: number; cells: Record<string, string> }): (string | number)[][] {
  const matrix: (string | number)[][] = []
  for (let r = 0; r < snap.rows; r++) {
    const rowArr: (string | number)[] = []
    for (let c = 0; c < snap.cols; c++) {
      const v = snap.cells[cellKey(c, r)]
      rowArr.push(v === undefined ? "" : v)
    }
    matrix.push(rowArr)
  }
  return matrix
}

function ToolBtn({ onClick, active, title, disabled, children }: {
  onClick?: () => void
  active?: boolean
  title?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
        active && "border-primary/50 bg-secondary text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ── Resize handles ──────────────────────────────────────────────────────────

type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se"

const RESIZE_POS: [ResizeHandle, string, string][] = [
  ["nw", "cursor-nwse-resize", "-left-2 -top-2"],
  ["n",  "cursor-ns-resize",   "-top-2 left-1/2 -translate-x-1/2"],
  ["ne", "cursor-nesw-resize", "-right-2 -top-2"],
  ["w",  "cursor-ew-resize",   "-left-2 top-1/2 -translate-y-1/2"],
  ["e",  "cursor-ew-resize",   "-right-2 top-1/2 -translate-y-1/2"],
  ["sw", "cursor-nesw-resize", "-bottom-2 -left-2"],
  ["s",  "cursor-ns-resize",   "-bottom-2 left-1/2 -translate-x-1/2"],
  ["se", "cursor-nwse-resize", "-bottom-2 -right-2"],
]

// ── Grid table (memoised — only re-renders when data props change) ──────────

function rangeHas(r: Range | null, c: number, row: number): boolean {
  if (!r) return false
  return c >= r.c0 && c <= r.c1 && row >= r.r0 && row <= r.r1
}

function cellStyleCss(st: SheetCellStyle | undefined): React.CSSProperties {
  const css: React.CSSProperties = {}
  if (!st) return css
  if (st.b) css.fontWeight = 700
  if (st.i) css.fontStyle = "italic"
  if (st.u) css.textDecoration = "underline"
  if (st.s) css.fontSize = `${st.s}px`
  if (st.a) css.textAlign = st.a === "c" ? "center" : st.a === "r" ? "right" : "left"
  if (st.c) css.color = st.c
  if (st.bg) css.backgroundColor = st.bg
  return css
}

interface GridTableProps {
  cols: number
  rows: number
  values: Record<string, string>
  styles: Record<string, SheetCellStyle>
  activeCol: number
  activeRow: number
  draftValue: string
  draftTouched: boolean
  sel: Range | null
  selecting: boolean
  readOnly: boolean
  onCellMouseDown: (c: number, r: number, shiftKey: boolean, button: number) => void
  onCellMouseEnter: (c: number, r: number) => void
  onFocusCell: (c: number, r: number) => void
  onChangeCell: (c: number, r: number, value: string) => void
  onKeyDownCell: (e: React.KeyboardEvent<HTMLInputElement>, c: number, r: number) => void
  onBlurCell: (c: number, r: number) => void
}

const GridTable = memo(function GridTable(props: GridTableProps) {
  const {
    cols, rows, values, styles, activeCol, activeRow, draftValue, draftTouched,
    sel, selecting, readOnly,
    onCellMouseDown, onCellMouseEnter, onFocusCell, onChangeCell, onKeyDownCell, onBlurCell,
  } = props

  return (
    <table className="border-collapse font-mono text-[13px]">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-20 h-7 w-10 border border-border bg-secondary text-xs font-medium text-muted-foreground" />
          {Array.from({ length: cols }).map((_, c) => (
            <th
              key={c}
              className="sticky top-0 z-10 h-7 min-w-14 border border-border bg-secondary px-1 text-xs font-medium text-muted-foreground sm:min-w-16"
            >
              {colLetter(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            <td className="sticky left-0 z-10 border border-border bg-secondary px-2 text-right text-xs text-muted-foreground select-none">
              {r + 1}
            </td>
            {Array.from({ length: cols }).map((_, c) => {
              const key = cellKey(c, r)
              const isActive = activeCol === c && activeRow === r
              return (
                <td
                  key={c}
                  className={cn("border border-border p-0", !readOnly && "cursor-cell")}
                  onMouseDown={(e) => onCellMouseDown(c, r, e.shiftKey, e.button)}
                  onMouseEnter={() => onCellMouseEnter(c, r)}
                >
                  <input
                    className={cn(
                      "h-7 w-full min-w-14 px-2 outline-none sm:min-w-16",
                      isActive ? "bg-secondary/80" : "bg-transparent",
                      rangeHas(sel, c, r) && "shadow-[inset_0_0_0_1px_var(--primary)]",
                      readOnly ? "cursor-default" : "cursor-cell",
                      selecting && "select-none text-transparent"
                    )}
                    style={cellStyleCss(styles[key])}
                    value={isActive && draftTouched ? draftValue : (values[key] ?? "")}
                    readOnly={readOnly || selecting || !isActive}
                    onChange={(e) => onChangeCell(c, r, e.target.value)}
                    onFocus={() => onFocusCell(c, r)}
                    onKeyDown={(e) => onKeyDownCell(e, c, r)}
                    onBlur={() => onBlurCell(c, r)}
                  />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
})

export default function SpreadsheetEditor({ provider, readOnly, initialContent, apiRef, onEditorReady }: Props) {
  const sheetMap = provider.doc.getMap("sheet")
  const hfRef = useRef<HyperFormula | null>(null)
  const [dim, setDim] = useState<{ cols: number; rows: number }>({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS })
  const [draft, setDraft] = useState<Draft>({ col: 0, row: 0, value: "" })
  const touchedRef = useRef(false)
  const [synced, setSynced] = useState(provider.isSynced())
  const [seeded, setSeeded] = useState(false)
  const [tick, setTick] = useState(0)

  const allCellsRef = useRef<Record<string, string>>({})

  const allCells = useMemo(() => {
    const cells: Record<string, string> = {}
    for (const [key, value] of sheetMap.entries()) {
      if (key.startsWith("cell:") && typeof value === "string") cells[key] = value
    }
    return cells
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMap, tick])

  useEffect(() => {
    allCellsRef.current = allCells
  }, [allCells])

  // Selection (range select via drag + shift+click).
  const [selAnchor, setSelAnchor] = useState<{ c: number; r: number } | null>(null)
  const [sel, setSel] = useState<Range | null>(null)
  const selectingRef = useRef(false)
  const [selecting, setSelecting] = useState(false)

  // Floating images (live pixel geometry during move/resize; committed on mouseup).
  const [selectedImg, setSelectedImg] = useState<string | null>(null)
  const [imgLive, setImgLive] = useState<{ id: string; left: number; top: number; w: number; h: number } | null>(null)
  const imgInputRef = useRef<HTMLInputElement | null>(null)
  const imgDragRef = useRef<{
    id: string
    mode: "move" | "resize"
    handle: ResizeHandle | null
    pointerId: number
    startX: number
    startY: number
    origLeft: number
    origTop: number
    origW: number
    origH: number
  } | null>(null)
  const pendingRef = useRef<{ id: string; left: number; top: number; w: number; h: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const undoManagerRef = useRef<Y.UndoManager | null>(null)

  // Refs mirrored from state so memo-stable callbacks never read stale values.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const selAnchorRef = useRef(selAnchor)
  selAnchorRef.current = selAnchor
  const dimRef = useRef(dim)
  dimRef.current = dim

  const imagesById = useMemo(() => {
    const byId: Record<string, SheetImage> = {}
    const list: { id: string; data: SheetImage }[] = []
    for (const [key, value] of sheetMap.entries()) {
      if (!key.startsWith("img:") || typeof value !== "string") continue
      try {
        const d = JSON.parse(value) as SheetImage
        if (d?.src && typeof d.col === "number") {
          byId[key] = d
          list.push({ id: key, data: d })
        }
      } catch {
        /* skip */
      }
    }
    return { byId, list }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMap, tick])

  const hf = useCallback(() => {
    if (!hfRef.current) {
      hfRef.current = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" })
      try {
        hfRef.current.addSheet("Sheet1")
      } catch {
        /* already exists */
      }
    }
    return hfRef.current
  }, [])

  // Formula-evaluated display values + style map for the memoised grid.
  const displayed = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [key, raw] of Object.entries(allCells)) {
      if (!raw) {
        out[key] = ""
        continue
      }
      const m = /^cell:(\d+):(\d+)$/.exec(key)
      if (!m) {
        out[key] = raw
        continue
      }
      try {
        const sheetId = hf().getSheetId("Sheet1")
        if (sheetId === undefined) {
          out[key] = raw
        } else {
          const v = hf().getCellValue({ sheet: sheetId, row: Number(m[2]), col: Number(m[1]) })
          out[key] = v === null || v === undefined ? raw : String(v)
        }
      } catch {
        out[key] = raw
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCells])

  const stylesAll = useMemo(() => {
    const out: Record<string, SheetCellStyle> = {}
    for (const [key, value] of sheetMap.entries()) {
      if (typeof value !== "string" || !key.startsWith("fmt:")) continue
      const m = /^fmt:(\d+):(\d+)$/.exec(key)
      if (!m) continue
      try {
        out[cellKey(Number(m[1]), Number(m[2]))] = JSON.parse(value) as SheetCellStyle
      } catch {
        /* skip */
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMap, tick])

  const rebuildHf = (cells: Record<string, string>) => {
    const engine = hf()
    const sheetId = engine.getSheetId("Sheet1")
    if (sheetId === undefined) return
    for (const [key, raw] of Object.entries(cells)) {
      const parts = key.split(":")
      if (parts.length !== 3) continue
      const col = Number(parts[1])
      const row = Number(parts[2])
      if (Number.isFinite(col) && Number.isFinite(row)) {
        try {
          engine.setCellContents({ sheet: sheetId, row, col }, raw)
        } catch {
          /* invalid formula — raw stays, display falls back to raw */
        }
      }
    }
  }

  const seedStylesAndImages = (snap: Snap) => {
    if (snap.styles) {
      for (const [k, v] of Object.entries(snap.styles)) {
        const m = /^cell:(\d+):(\d+)$/.exec(k)
        if (!m || !v || Object.keys(v).length === 0) continue
        try {
          mapSet(sheetMap, `fmt:${m[1]}:${m[2]}`, JSON.stringify(v), "local")
        } catch {
          /* skip */
        }
      }
    }
    if (snap.images) {
      snap.images.forEach((img, i) => {
        try {
          mapSet(sheetMap, `img:${img.id || "i" + i}`, JSON.stringify(img), "local")
        } catch {
          /* skip */
        }
      })
    }
  }

  // Initial hydration: after the room syncs (or if there's no collab state yet),
  // seed the Y.Map from REST content when empty.
  useEffect(() => {
    if (seeded) return
    if (sheetMap.has("rows") || sheetMap.has("cols")) {
      setDim({ cols: Number(sheetMap.get("cols") || DEFAULT_COLS), rows: Number(sheetMap.get("rows") || DEFAULT_ROWS) })
      rebuildHf(allCellsRef.current)
      setSeeded(true)
      setTick((n) => n + 1)
      return
    }
    if (!synced) return
    const snap = initialContent ? snapshotFromContent(initialContent) : null
    if (snap) {
      mapSet(sheetMap, "rows", snap.rows, "local")
      mapSet(sheetMap, "cols", snap.cols, "local")
      for (const [addr, v] of Object.entries(snap.cells)) {
        mapSet(sheetMap, addr, v, "local")
      }
      seedStylesAndImages(snap)
      setDim({ cols: snap.cols, rows: snap.rows })
      rebuildHf(snap.cells)
    } else {
      mapSet(sheetMap, "rows", dim.rows, "local")
      mapSet(sheetMap, "cols", dim.cols, "local")
    }
    setSeeded(true)
    setTick((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced])

  // Live collaboration: dimension + cell changes from remote clients.
  useEffect(() => {
    const onSync = () => setSynced(true)
    provider.on("sync", onSync)
    const observer = (event: any) => {
      if (event.transaction && event.transaction.origin === "local") return
      setDim({ cols: Number(sheetMap.get("cols") || DEFAULT_COLS), rows: Number(sheetMap.get("rows") || DEFAULT_ROWS) })
      rebuildHf(allCellsRef.current)
      setTick((n) => n + 1)
    }
    sheetMap.observe(observer)
    return () => {
      setSynced(false)
      provider.off("sync", onSync)
      try {
        sheetMap.unobserve(observer)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  // End range selection on mouseup anywhere. (Image move/resize uses Pointer
  // events with pointer capture — no global listeners needed.)
  useEffect(() => {
    const onMouseUp = () => {
      if (selectingRef.current) {
        selectingRef.current = false
        setSelecting(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedImg(null)
    }
    window.addEventListener("mouseup", onMouseUp)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("keydown", onKey)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Undo/redo (Yjs UndoManager) — created only after the room has synced and the
  // local seed is complete, so the initial REST hydration can never be undone.
  useEffect(() => {
    if (!seeded || !synced || undoManagerRef.current) return
    try {
      const um = new Y.UndoManager(sheetMap, {
        trackedOrigins: new Set(["local"]),
        captureTimeout: 300,
      })
      um.clear()
      undoManagerRef.current = um
    } catch {
      /* undo unavailable */
    }
    return () => {
      try {
        undoManagerRef.current?.destroy()
      } catch {
        /* ignore */
      }
      undoManagerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, synced])

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts for the spreadsheet.
  useEffect(() => {
    if (readOnly || !undoManagerRef.current) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === "z") {
        const um = undoManagerRef.current
        if (!um) return
        if (e.shiftKey) {
          e.preventDefault()
          um.redo()
        } else {
          e.preventDefault()
          commitDraftRef.current?.()
          um.undo()
        }
        setTick((n) => n + 1)
      } else if (key === "y") {
        e.preventDefault()
        undoManagerRef.current?.redo()
        setTick((n) => n + 1)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, seeded, synced])

  // Register export/import API once seeded+synced.
  useEffect(() => {
    if (!synced || !seeded) return
    const buildSnapshot = (): SheetSnapshot => {
      const cols = Number(sheetMap.get("cols") || DEFAULT_COLS)
      const rows = Number(sheetMap.get("rows") || DEFAULT_ROWS)
      const cells: Record<string, string> = {}
      const styles: Record<string, SheetCellStyle> = {}
      for (const [key, value] of sheetMap.entries()) {
        if (typeof value !== "string") continue
        if (key.startsWith("cell:")) cells[key] = value
        else if (key.startsWith("fmt:")) {
          const parts = key.split(":")
          const c = Number(parts[1])
          const r = Number(parts[2])
          if (!Number.isFinite(c) || !Number.isFinite(r)) continue
          try {
            styles[cellKey(c, r)] = JSON.parse(value) as SheetCellStyle
          } catch {
            /* skip */
          }
        }
      }
      return { cols, rows, cells, styles, images: imagesById.list.map((i) => i.data) }
    }
    const writeMatrix = (matrix: (string | number)[][]) => {
      for (const key of Array.from(sheetMap.keys())) {
        if (key.startsWith("cell:")) mapDelete(sheetMap, key, "local")
      }
      mapSet(sheetMap, "rows", Math.max(DEFAULT_ROWS, matrix.length), "local")
      const width = Math.max(DEFAULT_COLS, ...matrix.map((r) => r.length))
      mapSet(sheetMap, "cols", Math.min(width, 52), "local")
      matrix.forEach((rowArr, r) => {
        rowArr.forEach((v, c) => {
          const s = String(v ?? "")
          if (s !== "") mapSet(sheetMap, cellKey(c, r), s, "local")
        })
      })
      setDim({ cols: Number(sheetMap.get("cols") || DEFAULT_COLS), rows: Number(sheetMap.get("rows") || DEFAULT_ROWS) })
      rebuildHf(allCellsRef.current)
      setTick((n) => n + 1)
    }
    const loadJSON = (json: unknown) => {
      const snap = snapshotFromContent(json)
      if (!snap) return
      writeMatrix(cellsToRows(snap))
      for (const key of Array.from(sheetMap.keys())) {
        if (key.startsWith("fmt:") || key.startsWith("img:")) mapDelete(sheetMap, key, "local")
      }
      seedStylesAndImages(snap)
      setTick((n) => n + 1)
    }
    if (apiRef) {
      apiRef.current = {
        kind: "spreadsheet",
        getText: () => {
          const snap = buildSnapshot()
          return toCsv(cellsToRows(snap))
        },
        getMarkdown: () => {
          const snap = buildSnapshot()
          return toCsv(cellsToRows(snap))
        },
        getJSON: () => buildSnapshot(),
        getCSV: () => {
          const snap = buildSnapshot()
          return toCsv(cellsToRows(snap))
        },
        loadJSON,
        loadCSV: (csv) => writeMatrix(parseCsv(csv)),
        undo: () => undoManagerRef.current?.undo(),
        redo: () => undoManagerRef.current?.redo(),
      }
    }
    onEditorReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, seeded])

  // Null the registered API only on actual unmount.
  useEffect(() => {
    return () => {
      if (apiRef?.current?.kind === "spreadsheet") apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const writeCell = useCallback(
    (col: number, row: number, value: string) => {
      const key = cellKey(col, row)
      const prev = sheetMap.get(key)
      if (prev === value) return
      if (value === "" || value == null) mapDelete(sheetMap, key, "local")
      else mapSet(sheetMap, key, value, "local")
      try {
        const sheetId = hf().getSheetId("Sheet1")
        if (sheetId != null) hf().setCellContents({ sheet: sheetId, row, col }, value)
      } catch {
        /* ignore */
      }
      setTick((n) => n + 1)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetMap, hf]
  )

  const commitDraft = useCallback(() => {
    const d = draftRef.current
    if (readOnly || !touchedRef.current) return
    writeCell(d.col, d.row, d.value)
    touchedRef.current = false
  }, [readOnly, writeCell])

  const commitDraftRef = useRef(commitDraft)
  commitDraftRef.current = commitDraft

  const commitAndAdvance = useCallback(
    (col: number, row: number) => {
      const d = draftRef.current
      if (!readOnly && touchedRef.current) writeCell(d.col, d.row, d.value)
      touchedRef.current = false
      const value = String(sheetMap.get(cellKey(col, row)) || "")
      setDraft({ col, row, value })
    },
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [readOnly, writeCell, sheetMap]
  )

  const moveActive = (c: number, r: number, extend: boolean) => {
    commitAndAdvance(c, r)
    if (extend) {
      const anchor = selAnchorRef.current ?? { c: draftRef.current.col, r: draftRef.current.row }
      setSelAnchor(anchor)
      setSel(rangeNorm(anchor.c, anchor.r, c, r))
    } else {
      setSel(null)
      setSelAnchor({ c, r })
    }
  }

  const handleCellMouseDown = useCallback(
    (c: number, r: number, shiftKey: boolean, button: number) => {
      if (readOnly || button !== 0) return
      setSelectedImg(null)
      commitDraft()
      if (shiftKey) {
        const anchor = selAnchorRef.current ?? { c: draftRef.current.col, r: draftRef.current.row }
        setSelAnchor(anchor)
        setSel(rangeNorm(anchor.c, anchor.r, c, r))
      } else {
        setSelAnchor({ c, r })
        setSel(rangeNorm(c, r, c, r))
        selectingRef.current = true
        setSelecting(true)
      }
    },
    [readOnly, commitDraft]
  )

  const handleCellMouseEnter = useCallback((c: number, r: number) => {
    if (selectingRef.current && selAnchorRef.current) {
      setSel(rangeNorm(selAnchorRef.current.c, selAnchorRef.current.r, c, r))
    }
  }, [])

  const handleFocusCell = useCallback(
    (c: number, r: number) => {
      commitDraft()
      const value = String(sheetMap.get(cellKey(c, r)) || "")
      setDraft({ col: c, row: r, value })
      touchedRef.current = false
      if (!selectingRef.current) {
        setSelAnchor({ c, r })
        setSel(null)
      }
    },
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [commitDraft, sheetMap]
  )

  const handleChangeCell = useCallback((c: number, r: number, value: string) => {
    const d = draftRef.current
    if (d.col === c && d.row === r) {
      touchedRef.current = true
      setDraft((old) => (old.col === c && old.row === r ? { ...old, value } : old))
    } else {
      setDraft({ col: c, row: r, value })
      touchedRef.current = false
    }
  }, [])

  const handleKeyDownCell = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, c: number, r: number) => {
      const { cols, rows } = dimRef.current
      if (e.key === "ArrowRight" && c < cols - 1) {
        e.preventDefault()
        moveActive(c + 1, r, e.shiftKey)
      } else if (e.key === "ArrowLeft" && c > 0) {
        e.preventDefault()
        moveActive(c - 1, r, e.shiftKey)
      } else if (e.key === "ArrowDown" && r < rows - 1) {
        e.preventDefault()
        moveActive(c, r + 1, e.shiftKey)
      } else if (e.key === "ArrowUp" && r > 0) {
        e.preventDefault()
        moveActive(c, r - 1, e.shiftKey)
      } else if (e.key === "Enter") {
        e.preventDefault()
        moveActive(c, Math.min(r + 1, rows - 1), e.shiftKey)
      }
    },
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [commitAndAdvance]
  )

  const handleBlurCell = useCallback(
    (c: number, r: number) => {
      const d = draftRef.current
      if (!readOnly && touchedRef.current && d.col === c && d.row === r) {
        writeCell(c, r, d.value)
        touchedRef.current = false
      }
    },
    [readOnly, writeCell]
  )

  if (!synced) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Connecting to collaborative session…
      </div>
    )
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const getStyle = (col: number, row: number): SheetCellStyle => {
    const raw = sheetMap.get(fmtKey(col, row))
    if (!raw) return {}
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as SheetCellStyle) : {}
    } catch {
      return {}
    }
  }

  const persistStyle = (col: number, row: number, st: SheetCellStyle) => {
    const clean: SheetCellStyle = {}
    if (st.b) clean.b = 1
    if (st.i) clean.i = 1
    if (st.u) clean.u = 1
    if (st.s) clean.s = st.s
    if (st.a) clean.a = st.a
    if (st.c) clean.c = st.c
    if (st.bg) clean.bg = st.bg
    const key = fmtKey(col, row)
    if (Object.keys(clean).length) mapSet(sheetMap, key, JSON.stringify(clean), "local")
    else mapDelete(sheetMap, key, "local")
  }

  const selectedRange = (): Range => {
    const cur = sel ?? { c0: draft.col, r0: draft.row, c1: draft.col, r1: draft.row }
    return rangeNorm(cur.c0, cur.r0, cur.c1, cur.r1)
  }

  const rangeCells = (): [number, number][] => {
    const rg = selectedRange()
    const out: [number, number][] = []
    for (let r = rg.r0; r <= rg.r1; r++) for (let c = rg.c0; c <= rg.c1; c++) out.push([c, r])
    return out
  }

  const applyStyle = (mutator: (st: SheetCellStyle) => SheetCellStyle) => {
    if (readOnly) return
    const next = mutator(getStyle(draft.col, draft.row))
    for (const [c, r] of rangeCells()) persistStyle(c, r, next)
    setTick((n) => n + 1)
  }

  // ── Images ────────────────────────────────────────────────────────────────

  const insertImage = (src: string) => {
    if (readOnly) return
    const probe = new Image()
    probe.onload = () => {
      const maxW = 420
      const scale = Math.max(0.05, Math.min(1, maxW / ((probe.naturalWidth || 1) * 1)))
      const w = Math.max(32, Math.round((probe.naturalWidth || 64) * scale))
      const h = Math.max(24, Math.round((probe.naturalHeight || 48) * scale))
      const rg = selectedRange()
      const uid = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const data: SheetImage = { id: uid, col: rg.c0, row: rg.r0, src, w, h }
      mapSet(sheetMap, `img:${uid}`, JSON.stringify(data), "local")
      setSelectedImg(`img:${uid}`)
      setTick((n) => n + 1)
    }
    probe.onerror = () => toast.error("Could not load image")
    probe.src = src
  }

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ""
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image too large (max 15 MB)")
      return
    }
    const reader = new FileReader()
    reader.onload = () => insertImage(String(reader.result))
    reader.onerror = () => toast.error("Could not read image file")
    reader.readAsDataURL(file)
  }

  const addImageFromUrl = () => {
    if (readOnly) return
    const url = window.prompt("Image URL (must be accessible from the browser)")
    if (!url || !url.trim()) return
    insertImage(url.trim())
  }

  const deleteImage = (id: string) => {
    mapDelete(sheetMap, id, "local")
    if (selectedImg === id) setSelectedImg(null)
    setTick((n) => n + 1)
  }

  const startImgGesture = (id: string, mode: "move" | "resize", handle: ResizeHandle | null, e: React.PointerEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedImg(id)
    const data = imagesById.byId[id]
    if (!data) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    imgDragRef.current = {
      id,
      mode,
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: HEADER_W + data.col * CELL_W,
      origTop: HEADER_H + data.row * CELL_H,
      origW: data.w,
      origH: data.h,
    }
  }

  // Pixel-smooth live preview (throttled to one render per frame). Movement is
  // grid-snapped to cells (hold Alt for free positioning) so release never jumps.
  const handleImgPointerMove = (e: React.PointerEvent) => {
    const d = imgDragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    let left = d.origLeft
    let top = d.origTop
    let w = d.origW
    let h = d.origH
    if (d.mode === "move") {
      const rawLeft = Math.max(0, d.origLeft + dx)
      const rawTop = Math.max(0, d.origTop + dy)
      if (e.altKey) {
        left = rawLeft
        top = rawTop
      } else {
        left = HEADER_W + Math.round((rawLeft - HEADER_W) / CELL_W) * CELL_W
        top = HEADER_H + Math.round((rawTop - HEADER_H) / CELL_H) * CELL_H
      }
    } else if (d.handle) {
      const min = 24
      if (d.handle.includes("e")) w = Math.max(min, d.origW + dx)
      if (d.handle.includes("s")) h = Math.max(min, d.origH + dy)
      if (d.handle.includes("w")) {
        w = Math.max(min, d.origW - dx)
        left = d.origLeft + (d.origW - w)
      }
      if (d.handle.includes("n")) {
        h = Math.max(min, d.origH - dy)
        top = d.origTop + (d.origH - h)
      }
      left = Math.max(0, left)
      top = Math.max(0, top)
    }
    pendingRef.current = { id: d.id, left, top, w, h }
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const p = pendingRef.current
        if (p) setImgLive(p)
      })
    }
  }

  const handleImgPointerEnd = (e: React.PointerEvent) => {
    const d = imgDragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    const p = pendingRef.current
    const data = imagesById.byId[d.id]
    if (data && p) {
      const col = Math.max(0, Math.round((p.left - HEADER_W) / CELL_W))
      const row = Math.max(0, Math.round((p.top - HEADER_H) / CELL_H))
      const next: SheetImage = { ...data, col, row }
      if (d.mode === "resize") {
        next.w = Math.round(Math.max(24, p.w))
        next.h = Math.round(Math.max(24, p.h))
      }
      if (next.col !== data.col || next.row !== data.row || next.w !== data.w || next.h !== data.h) {
        mapSet(sheetMap, d.id, JSON.stringify(next), "local")
        setTick((n) => n + 1)
      }
    }
    imgDragRef.current = null
    pendingRef.current = null
    setImgLive(null)
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const addRow = () => {
    if (readOnly) return
    const next = dim.rows + 10
    mapSet(sheetMap, "rows", next, "local")
    setDim((d) => ({ ...d, rows: next }))
  }

  const addCol = () => {
    if (readOnly) return
    const next = Math.min(dim.cols + 5, 52)
    mapSet(sheetMap, "cols", next, "local")
    setDim((d) => ({ ...d, cols: next }))
  }

  const activeStyle = getStyle(draft.col, draft.row)

  /* eslint-disable jsx-a11y/no-static-element-interactions */
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Format toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <ToolBtn active={!!activeStyle.b} onClick={() => applyStyle((s) => ({ ...s, b: s.b ? undefined : 1 }))} disabled={readOnly} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={!!activeStyle.i} onClick={() => applyStyle((s) => ({ ...s, i: s.i ? undefined : 1 }))} disabled={readOnly} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={!!activeStyle.u} onClick={() => applyStyle((s) => ({ ...s, u: s.u ? undefined : 1 }))} disabled={readOnly} title="Underline">
          <Underline className="h-3.5 w-3.5" />
        </ToolBtn>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <select
          className="h-6 rounded border border-border bg-transparent px-1 text-xs text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-40"
          value={String(activeStyle.s || 12)}
          disabled={readOnly}
          title="Font size"
          onChange={(e) => applyStyle((s) => ({ ...s, s: Number(e.target.value) }))}
        >
          {[9, 10, 11, 12, 14, 16, 18, 20, 24].map((v) => (
            <option key={v} value={v}>
              {v}px
            </option>
          ))}
        </select>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <ToolBtn
          active={activeStyle.a === "l"}
          onClick={() => applyStyle((s) => ({ ...s, a: "l" }))}
          disabled={readOnly}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={activeStyle.a === "c"}
          onClick={() => applyStyle((s) => ({ ...s, a: "c" }))}
          disabled={readOnly}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={activeStyle.a === "r"}
          onClick={() => applyStyle((s) => ({ ...s, a: "r" }))}
          disabled={readOnly}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <span
          className="relative flex h-6 w-6 shrink-0 select-none items-center justify-center rounded border border-border text-[12px] font-bold text-foreground"
          title="Text color"
        >
          A
          <input
            type="color"
            value={activeStyle.c || "#e2e8f0"}
            disabled={readOnly}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(e) => applyStyle((s) => ({ ...s, c: e.target.value }))}
          />
        </span>
        <span
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-foreground"
          title="Fill color"
        >
          <PaintBucket className="h-3.5 w-3.5" />
          <input
            type="color"
            value={activeStyle.bg || "#334155"}
            disabled={readOnly}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(e) => applyStyle((s) => ({ ...s, bg: e.target.value }))}
          />
        </span>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <ToolBtn onClick={() => applyStyle(() => ({}))} disabled={readOnly} title="Clear formatting">
          <Eraser className="h-3.5 w-3.5" />
        </ToolBtn>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={readOnly}
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title="Insert"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Insert</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Insert into sheet</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => imgInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4" />
              Image… <span className="ml-1.5 text-[11px] text-muted-foreground">from file</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addImageFromUrl()}>
              <Link2 className="h-4 w-4" />
              Image from URL
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={addRow}>
              <Plus className="h-4 w-4" />
              Rows (+10)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={addCol}>
              <Plus className="h-4 w-4" />
              Columns (+5)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="w-20 shrink-0 rounded border border-border bg-secondary px-2 py-1 font-mono text-xs text-foreground">
          {colLetter(draft.col)}
          {draft.row + 1}
        </div>
        <input
          className="flex-1 rounded border border-border bg-secondary px-2 py-1 font-mono text-sm text-foreground outline-none focus:border-primary"
          value={draft.value}
          disabled={readOnly}
          onChange={(e) => {
            touchedRef.current = true
            setDraft((d) => ({ ...d, value: e.target.value }))
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              const row = Math.min(draft.row + 1, dim.rows - 1)
              moveActive(draft.col, row, false)
            } else if (e.key === "Escape") {
              touchedRef.current = false
              setDraft((d) => ({ ...d, value: String(sheetMap.get(cellKey(d.col, d.row)) || "") }))
            }
          }}
          placeholder="ƒx"
        />
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto" onMouseDown={() => setSelectedImg(null)}>
        <div className="relative inline-block min-w-full align-top">
          <GridTable
            cols={dim.cols}
            rows={dim.rows}
            values={displayed}
            styles={stylesAll}
            activeCol={draft.col}
            activeRow={draft.row}
            draftValue={draft.value}
            draftTouched={touchedRef.current}
            sel={sel}
            selecting={selecting}
            readOnly={!!readOnly}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseEnter={handleCellMouseEnter}
            onFocusCell={handleFocusCell}
            onChangeCell={handleChangeCell}
            onKeyDownCell={handleKeyDownCell}
            onBlurCell={handleBlurCell}
          />

          {/* Floating images (anchored to cells, pixel-smooth move/resize) */}
          {imagesById.list.map(({ id, data }) => {
            const live = imgLive && imgLive.id === id ? imgLive : null
            const left = live ? live.left : HEADER_W + data.col * CELL_W
            const top = live ? live.top : HEADER_H + data.row * CELL_H
            const w = live ? live.w : data.w
            const h = live ? live.h : data.h
            const isSel = selectedImg === id
            return (
              <div
                key={id}
                className={cn(
                  "absolute z-10 touch-none select-none border",
                  isSel ? "cursor-move border-primary" : "cursor-grab border-transparent hover:border-primary/60"
                )}
                style={{ left, top, width: w, height: h }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => startImgGesture(id, "move", null, e)}
                onPointerMove={handleImgPointerMove}
                onPointerUp={handleImgPointerEnd}
                onPointerCancel={handleImgPointerEnd}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImg(id)
                }}
                title="Drag to move (hold Alt for free positioning)"
              >
                <img src={data.src} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                {isSel && (
                  <>
                    <div className="pointer-events-none absolute -top-6 right-0 rounded bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow ring-1 ring-border">
                      {Math.round(w)}×{Math.round(h)} px
                    </div>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteImage(id)
                      }}
                      className="absolute -right-2 -top-2 z-20 flex h-6 w-6 touch-none items-center justify-center rounded-full bg-destructive text-white shadow-lg"
                      title="Delete image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {RESIZE_POS.map(([handle, cursor, pos]) => (
                      <div
                        key={handle}
                        className={cn("absolute z-20 h-4 w-4 touch-none rounded-sm border-2 border-background bg-primary/90", cursor, pos)}
                        onPointerDown={(e) => startImgGesture(id, "resize", handle, e)}
                        title={`Resize ${handle}`}
                      />
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          Sheet1 · {dim.rows} rows × {dim.cols} cols{imagesById.list.length > 0 && ` · ${imagesById.list.length} image${imagesById.list.length > 1 ? "s" : ""}`}
        </span>
        {!readOnly && (
          <span className="flex gap-2">
            <button onClick={addRow} className="rounded border border-border px-2 py-0.5 hover:bg-secondary">
              + Row
            </button>
            <button onClick={addCol} className="rounded border border-border px-2 py-0.5 hover:bg-secondary">
              + Col
            </button>
          </span>
        )}
      </div>
    </div>
  )
  /* eslint-enable jsx-a11y/no-static-element-interactions */
}
