"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Type,
  Sparkles,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  ImagePlus,
  Quote,
  Pencil,
  LayoutTemplate,
  Link2,
  SlidersHorizontal,
  Wand2,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { mapSet, type OfficeProvider } from "@/lib/office/collab"
import type { OfficeApiRef } from "@/lib/office/editorApi"
import { FONT_FAMILIES, IMAGE_FILTERS, PRES_TEMPLATES, TEMPLATE_STORAGE_KEY, filterCss, type PresTemplate } from "@/lib/office/editorApi"
import { SlideFrame, SLIDE_H, SLIDE_W } from "@/components/office/SlideFrame"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

interface Props {
  provider: OfficeProvider
  readOnly?: boolean
  initialContent?: unknown
  apiRef?: OfficeApiRef
  onEditorReady?: () => void
}

type BlockType = "text" | "image" | "quote"

interface SlideBlock {
  id: string
  type?: BlockType
  text: string
  author?: string
  src?: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: "left" | "center" | "right"
  font?: string
  filter?: string
}

interface Slide {
  id: string
  bg: string
  blocks: SlideBlock[]
}

interface Suggestion {
  id: string
  blockId: string
  before: string
  after: string
  reason?: string
}

const PALETTE = [
  "#0b0b0d",
  "#12111f",
  "#0f1820",
  "#161a28",
  "#1a1030",
  "#24311f",
  "#381a1a",
]

const TEXT_COLORS = ["#ffffff", "#c4b5fd", "#93c5fd", "#86efac", "#fcd34d", "#fca5a5"]

const P_TITLE = "Click to add title"
const P_SUB = "Click to add subtitle"

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function textBlock(patch: Partial<SlideBlock>): SlideBlock {
  return { id: uid(), type: "text", text: "", x: 80, y: 80, w: 400, h: 80, fontSize: 20, align: "left", bold: false, italic: false, ...patch }
}

function quoteBlock(patch: Partial<SlideBlock>): SlideBlock {
  return { id: uid(), type: "quote", text: "", x: 120, y: 160, w: 720, h: 140, fontSize: 24, italic: true, color: "#c4b5fd", font: "Georgia, 'Times New Roman', serif", align: "left", bold: false, ...patch }
}

function imageBlock(src: string, patch?: Partial<SlideBlock>): SlideBlock {
  return { id: uid(), type: "image", text: "", src, x: 180, y: 130, w: 600, h: 340, fontSize: 20, bold: false, italic: false, filter: "none", ...patch }
}

function blankSlide(bg?: string): Slide {
  return {
    id: uid(),
    bg: bg || PALETTE[1],
    blocks: [
      textBlock({ text: P_TITLE, x: 80, y: 200, w: 800, h: 110, fontSize: 44, bold: true, align: "center" }),
      textBlock({ text: P_SUB, x: 160, y: 324, w: 640, h: 64, fontSize: 24, align: "center" }),
    ],
  }
}

function legacyToBlocks(s: any): SlideBlock[] {
  const blocks: SlideBlock[] = []
  const title = String(s.title || "")
  const subtitle = String(s.subtitle || "")
  const body = String(s.body || "")
  if (title) blocks.push(textBlock({ text: title, x: 60, y: 56, w: 840, h: 100, fontSize: 40, bold: true, align: "center" }))
  if (subtitle) blocks.push(textBlock({ text: subtitle, x: 80, y: 164, w: 800, h: 60, fontSize: 24, align: "center" }))
  if (body) blocks.push(textBlock({ text: body, x: 160, y: 256, w: 640, h: 270, fontSize: 20, align: "center" }))
  return blocks
}

const validFilter = (v: any): v is string => typeof v === "string" && IMAGE_FILTERS.some((f) => f.value === v)

function slidesFromContent(content: unknown): Slide[] {
  if (!content || typeof content !== "object") return []
  const c = content as any
  if (!Array.isArray(c.slides)) return []
  return c.slides.map((s: any) => {
    const bg = String(s.bg || PALETTE[1])
    const raw = Array.isArray(s.blocks) && s.blocks.length > 0 ? s.blocks : null
    if (raw) {
      return {
        id: String(s.id || uid()),
        bg,
        blocks: raw.map((b: any) => {
          const kind = b.type === "image" ? "image" : b.type === "quote" ? "quote" : "text"
          const base: Partial<SlideBlock> = {
            id: String(b.id || uid()),
            text: String(b.text || ""),
            x: Number(b.x) || 0,
            y: Number(b.y) || 0,
            w: Math.max(1, Number(b.w) || 1),
            h: Math.max(1, Number(b.h) || 1),
            fontSize: Math.max(4, Number(b.fontSize) || 20),
            bold: !!b.bold,
            italic: kind === "quote" ? true : !!b.italic,
            color: b.color ? String(b.color) : kind === "quote" ? "#c4b5fd" : undefined,
            align: b.align === "right" ? "right" : b.align === "center" ? "center" : "left",
            font: b.font ? String(b.font) : kind === "quote" ? "Georgia, 'Times New Roman', serif" : undefined,
            filter: validFilter(b.filter) ? b.filter : "none",
          }
          if (kind === "quote") return quoteBlock({ ...base, author: b.author ? String(b.author) : undefined })
          if (kind === "image") {
            const imgBase: Partial<SlideBlock> = { ...base, type: "image" as const, src: b.src ? String(b.src) : "", filter: validFilter(b.filter) ? b.filter : "none" }
            return imageBlock(b.src ? String(b.src) : "", imgBase)
          }
          return textBlock(base)
        }),
      }
    }
    return { id: String(s.id || uid()), bg, blocks: legacyToBlocks(s) }
  })
}

function isPlaceholder(b: SlideBlock): boolean {
  return (b.type === "text" || !b.type) && (b.text === P_TITLE || b.text === P_SUB)
}

function blockRole(b: SlideBlock, blocks: SlideBlock[]): "title" | "body" | "quote" | "image" {
  if (b.type === "quote") return "quote"
  if (b.type === "image") return "image"
  const textBlocks = blocks.filter((x) => x.type !== "image" && x.type !== "quote")
  const maxFont = Math.max(...textBlocks.map((x) => x.fontSize || 0), 0)
  if ((b.fontSize || 0) >= 32 || ((b.fontSize || 0) === maxFont && maxFont >= 32)) return "title"
  return "body"
}

function applyTemplateToSlide(slide: Slide, t: PresTemplate): Slide {
  return {
    ...slide,
    bg: t.bg,
    blocks: slide.blocks.map((b) => {
      const role = blockRole(b, slide.blocks)
      if (role === "image") return b
      if (role === "quote") return { ...b, color: t.quoteColor, font: t.quoteFont || t.bodyFont || undefined }
      if (role === "title") return { ...b, color: t.titleColor, font: t.titleFont || undefined }
      return { ...b, color: t.bodyColor, font: t.bodyFont || undefined }
    }),
  }
}

function loadSavedTemplates(): PresTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, 24) : []
  } catch {
    return []
  }
}

function persistSavedTemplates(list: PresTemplate[]) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function currentSlideAsTemplate(slide: Slide, name: string): PresTemplate {
  const blocks = slide.blocks
  const textBlocks = blocks.filter((b) => b.type !== "image" && b.type !== "quote")
  const maxFont = Math.max(...textBlocks.map((b) => b.fontSize || 0), 0)
  const title = textBlocks.find((b) => (b.fontSize || 0) >= 32 || ((b.fontSize || 0) === maxFont && maxFont >= 32))
  const body = textBlocks.find((b) => b !== title) || textBlocks[0]
  const quote = blocks.find((b) => b.type === "quote")
  return {
    id: uid(),
    name,
    bg: slide.bg,
    titleColor: title?.color || "#ffffff",
    bodyColor: body?.color || "#e6e6f0",
    quoteColor: quote?.color || "#c4b5fd",
    titleFont: title?.font || "",
    bodyFont: body?.font || "",
    quoteFont: quote?.font || "Georgia, 'Times New Roman', serif",
  }
}

export default function PresentationEditor({ provider, readOnly, initialContent, apiRef, onEditorReady }: Props) {
  const slidesMap = provider.doc.getMap("presentation")
  const [slides, setSlides] = useState<Slide[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [synced, setSynced] = useState(provider.isSynced())
  const [presenting, setPresenting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const slidesRef = useRef(slides)
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex
  const editingIdRef = useRef(editingId)
  editingIdRef.current = editingId
  const loadedRef = useRef(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<null | {
    id: string
    mode: "move" | "resize"
    startX: number
    startY: number
    orig: { x: number; y: number; w: number; h: number }
  }>(null)
  const undoTypingRef = useRef<{ id: string; placeholder: string } | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingImageRef = useRef<string | null>(null)
  // Double-tap detection for touch devices (no dblclick on mobile).
  const lastTapRef = useRef<{ id: string; at: number } | null>(null)
  const suppressDblRef = useRef<string | null>(null)

  const [showTemplates, setShowTemplates] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState<PresTemplate[]>([])
  const [tplName, setTplName] = useState("")
  const [showImgUrl, setShowImgUrl] = useState(false)
  const [imgUrlValue, setImgUrlValue] = useState("")
  const [imgUrlMode, setImgUrlMode] = useState<"add" | "replace">("add")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const slide = slides[activeIndex]
  const canEdit = !readOnly

  const liveSuggestions = useMemo(() => {
    const s = slides[activeIndex]
    if (!s) return []
    return suggestions.filter((x) => {
      if (x.blockId === editingId) return false
      const b = s.blocks.find((bl) => bl.id === x.blockId)
      return !!b && b.type !== "image" && b.text.includes(x.before)
    })
  }, [suggestions, slides, activeIndex, editingId])

  useEffect(() => {
    setSavedTemplates(loadSavedTemplates())
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / SLIDE_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onSync = () => setSynced(true)
    provider.on("sync", onSync)
    const loaded = slidesMap.get("data")
    if (Array.isArray(loaded) && loaded.length > 0 && !loadedRef.current) {
      const mapped = slidesFromContent({ slides: loaded })
      if (mapped.length > 0) {
        setSlides(mapped)
        loadedRef.current = true
      }
    } else if (synced && !loadedRef.current) {
      const init = slidesFromContent(initialContent)
      const next = init.length > 0 ? init : [blankSlide()]
      loadedRef.current = true
      mapSet(slidesMap, "data", next, "local")
      setSlides(next)
    }
    return () => {
      provider.off("sync", onSync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced])

  useEffect(() => {
    slidesRef.current = slides
    if (!loadedRef.current) return
    mapSet(slidesMap, "data", slides, "local")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides])

  useEffect(() => {
    const observer = (event: any) => {
      if (event.transaction && event.transaction.origin === "local") return
      if (!event.keysChanged.has("data")) return
      const next = slidesMap.get("data")
      if (Array.isArray(next) && next !== slidesRef.current) {
        const mapped = slidesFromContent({ slides: next })
        if (mapped.length > 0) setSlides(mapped)
      }
    }
    slidesMap.observe(observer)
    return () => {
      try {
        slidesMap.unobserve(observer)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateSlide = (index: number, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const slideIndexForId = (id: string | null): number => slidesRef.current.findIndex((s) => s.blocks.some((b) => b.id === id))

  const updateBlock = (slideIndex: number, blockId: string, patch: Partial<SlideBlock>) => {
    if (!canEdit) return
    setSlides((prev) =>
      prev.map((s, i) =>
        i === slideIndex ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } : s
      )
    )
  }

  const selectedBlock = (): SlideBlock | null => {
    if (!selectedId) return null
    const idx = slideIndexForId(selectedId)
    return idx === -1 ? null : slidesRef.current[idx].blocks.find((b) => b.id === selectedId) || null
  }

  const patchSelected = (patch: Partial<SlideBlock>) => {
    const idx = slideIndexForId(selectedId)
    if (idx === -1 || !selectedId) return
    updateBlock(idx, selectedId, patch)
  }

  const doApplySuggestions = (rows: { before: string; after: string }[]): number => {
    if (!canEdit) return 0
    const idx = activeIndexRef.current
    const s = slidesRef.current[idx]
    let count = 0
    for (const r of rows) {
      if (!r.before) continue
      const b = s?.blocks.find((bl) => bl.type !== "image" && !isPlaceholder(bl) && bl.text.includes(r.before))
      if (b) count++
    }
    setSlides((prev) =>
      prev.map((sl, i) => {
        if (i !== idx) return sl
        let blocks = sl.blocks
        for (const r of rows) {
          if (!r.before) continue
          blocks = blocks.map((b) => {
            if (b.type === "image" || isPlaceholder(b) || !b.text.includes(r.before) || b.id === editingIdRef.current) return b
            return { ...b, text: b.text.split(r.before).join(r.after) }
          })
        }
        return { ...sl, blocks }
      })
    )
    setSuggestions((prev) => prev.filter((x) => !rows.some((r) => r.before === x.before)))
    return count
  }

  const toSlideCoords = (e: ReactPointerEvent<HTMLElement> | { clientX: number; clientY: number }) => {
    const el = canvasRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * SLIDE_W,
      y: ((e.clientY - rect.top) / rect.height) * SLIDE_H,
    }
  }

  const onBlockPointerDown = (e: ReactPointerEvent<HTMLDivElement>, block: SlideBlock) => {
    if (!canEdit || editingId) return
    e.stopPropagation()
    setSelectedId(block.id)
    const el = canvasRef.current
    if (!el) return
    const pos = toSlideCoords(e)
    if (!pos) return
    dragRef.current = { id: block.id, mode: "move", startX: e.clientX, startY: e.clientY, orig: { x: block.x, y: block.y, w: block.w, h: block.h } }
    try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>, block: SlideBlock) => {
    if (!canEdit || editingId) return
    e.stopPropagation()
    setSelectedId(block.id)
    const el = canvasRef.current
    if (!el) return
    dragRef.current = { id: block.id, mode: "resize", startX: e.clientX, startY: e.clientY, orig: { x: block.x, y: block.y, w: block.w, h: block.h } }
    try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = ((e.clientX - d.startX) / rect.width) * SLIDE_W
    const dy = ((e.clientY - d.startY) / rect.height) * SLIDE_H
    const idx = slideIndexForId(d.id)
    if (idx === -1) return
    if (d.mode === "move") {
      updateBlock(idx, d.id, { x: clamp(d.orig.x + dx, 0, Math.max(0, SLIDE_W - d.orig.w)), y: clamp(d.orig.y + dy, 0, Math.max(0, SLIDE_H - d.orig.h)) })
    } else {
      const b = slidesRef.current[idx]?.blocks.find((bl) => bl.id === d.id)
      if (!b) return
      updateBlock(idx, d.id, { w: clamp(d.orig.w + dx, 60, SLIDE_W - b.x), h: clamp(d.orig.h + dy, 30, SLIDE_H - b.y) })
    }
  }

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || !canEdit || d.mode !== "move") return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return
    if (e.pointerType === "mouse") return
    // A stationary touch on a block: first tap selects, second tap edits
    // (or offers to replace the image). Mobile has no double-click.
    const idx = slideIndexForId(d.id)
    const b = idx === -1 ? null : slidesRef.current[idx]?.blocks.find((bl) => bl.id === d.id)
    if (!b) {
      lastTapRef.current = null
      return
    }
    const now = Date.now()
    const prev = lastTapRef.current
    if (prev && prev.id === d.id && now - prev.at < 600) {
      lastTapRef.current = null
      suppressDblRef.current = b.id
      if (b.type === "image") {
        pendingImageRef.current = b.id
        imageInputRef.current?.click()
      } else {
        startEditing(null, b)
      }
    } else {
      lastTapRef.current = { id: d.id, at: now }
    }
  }

  const startEditing = (e: { stopPropagation?: () => void } | null | undefined, block: SlideBlock) => {
    if (!canEdit || block.type === "image") return
    e?.stopPropagation?.()
    setSelectedId(block.id)
    undoTypingRef.current = isPlaceholder(block) ? { id: block.id, placeholder: block.text } : null
    if (isPlaceholder(block)) updateBlock(slideIndexForId(block.id), block.id, { text: "" })
    setEditingId(block.id)
  }

  const commitEditing = () => {
    if (!editingId) return
    if (undoTypingRef.current) {
      const { id, placeholder } = undoTypingRef.current
      const idx = slideIndexForId(id)
      const b = slidesRef.current[idx]?.blocks.find((bl) => bl.id === id)
      if (b && b.text.trim() === "") updateBlock(idx, id, { text: placeholder })
    }
    undoTypingRef.current = null
    setEditingId(null)
  }

  const replaceImage = (blockId: string, dataUrl: string) => {
    updateBlock(slideIndexForId(blockId), blockId, { src: dataUrl })
  }

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image too large (max 15 MB)")
      if (e.target) e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      if (pendingImageRef.current) {
        replaceImage(pendingImageRef.current, src)
      } else {
        addImage(src)
      }
      pendingImageRef.current = null
    }
    reader.readAsDataURL(file)
    if (e.target) e.target.value = ""
  }

  const addTextBox = () => {
    if (!canEdit || activeIndex == null) return
    const box = textBlock({ x: 200, y: 200, w: 300, h: 80, fontSize: 20 })
    updateSlide(activeIndex, { blocks: [...(slidesRef.current[activeIndex]?.blocks || []), box] })
    setSelectedId(box.id)
  }

  const addImage = (src: string, patch?: Partial<SlideBlock>) => {
    if (!canEdit || activeIndex == null) return
    const b = imageBlock(src, patch)
    updateSlide(activeIndex, { blocks: [...(slidesRef.current[activeIndex]?.blocks || []), b] })
    setSelectedId(b.id)
  }

  const addQuote = () => {
    if (!canEdit || activeIndex == null) return
    const b = quoteBlock({ x: 120, y: 160, w: 720, h: 140, fontSize: 24, text: "" })
    updateSlide(activeIndex, { blocks: [...(slidesRef.current[activeIndex]?.blocks || []), b] })
    setSelectedId(b.id)
  }

  const duplicateBlock = () => {
    const idx = slideIndexForId(selectedId)
    const b = selectedBlock()
    if (idx === -1 || !b) return
    const copy = { ...b, id: uid(), x: b.x + 28, y: b.y + 28 }
    updateSlide(idx, { blocks: [...slidesRef.current[idx].blocks, copy] })
    setSelectedId(copy.id)
  }

  const removeBlock = () => {
    const idx = slideIndexForId(selectedId)
    if (idx === -1) return
    updateSlide(idx, { blocks: slidesRef.current[idx].blocks.filter((b) => b.id !== selectedId) })
    setSelectedId(null)
  }

  const moveBlockZ = (dir: -1 | 1) => {
    const idx = slideIndexForId(selectedId)
    const arr = slidesRef.current[idx]?.blocks || []
    const i = arr.findIndex((b) => b.id === selectedId)
    if (idx === -1 || i === -1) return
    const next = [...arr]
    const target = i + dir
    if (target < 0 || target >= next.length) return
    ;[next[i], next[target]] = [next[target], next[i]]
    updateSlide(idx, { blocks: next })
  }

  useEffect(() => {
    if (presenting) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const tag = t?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (editingId) {
        return
      }
      if (!selectedId) return
      const b = selectedBlock()
      if (!b) return
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        removeBlock()
      } else if (e.key === "Enter") {
        e.preventDefault()
        startEditing(null, b)
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault()
        const step = e.shiftKey ? 8 : 2
        const nd: [number, number] = e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : e.key === "ArrowLeft" ? [-step, 0] : [step, 0]
        patchSelected({ x: clamp(b.x + nd[0], 0, SLIDE_W), y: clamp(b.y + nd[1], 0, SLIDE_H) })
      } else if (e.key === "Escape") {
        setSelectedId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, editingId, selectedId])

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, slidesRef.current.length - 1))
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Home") {
        e.preventDefault()
        setActiveIndex(0)
      } else if (e.key === "End") {
        e.preventDefault()
        setActiveIndex(slidesRef.current.length - 1)
      } else if (e.key === "Escape") {
        setPresenting(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [presenting])

  useEffect(() => {
    if (!synced || !loadedRef.current) return
    const current = () => (slidesRef.current.length > 0 ? slidesRef.current : [blankSlide()])
    const esc = (s: string) => s.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] as string)
    if (apiRef) {
      apiRef.current = {
        kind: "presentation",
        getText: () =>
          current()
            .map((s) =>
              s.blocks
                .filter((b) => b.type !== "image")
                .map((b) => (isPlaceholder(b) ? "" : b.text))
                .filter(Boolean)
                .join("\n")
            )
            .filter(Boolean)
            .join("\n\n---\n\n"),
        getMarkdown: () =>
          current()
            .map(
              (s, i) =>
                `## Slide ${i + 1}\n\n` +
                s.blocks
                  .filter((b) => !isPlaceholder(b))
                  .map((b) => {
                    if (b.type === "quote") return `> ${b.text}${b.author ? `\n> \u2014 ${b.author}` : ""}`
                    if (b.type === "image") return `[Image: ${b.src ? "embedded" : "empty"}]`
                    return b.text.trim()
                  })
                  .filter(Boolean)
                  .join("\n\n") +
                "\n\n---\n"
            )
            .join("\n\n"),
        getJSON: () => ({ slides: current() }),
        getHTML: () =>
          current()
            .map(
              (s) =>
                `<section style="page-break-after:always;background:${s.bg}">${s.blocks
                  .filter((b) => !isPlaceholder(b))
                  .map((b) => {
                    if (b.type === "image") return `<div><img src="${esc(b.src || "")}" style="max-width:100%;${b.filter && b.filter !== "none" ? `filter:${filterCss(b.filter)}` : ""}"/></div>`
                    return `<div style="white-space:pre-wrap;${b.font ? `font-family:${b.font}` : ""}${b.color ? `;color:${b.color}` : ""}">${esc(b.text)}</div>`
                  })
                  .join("")}</section>`
            )
            .join(""),
        loadJSON: (json) => {
          const parsed = slidesFromContent(json)
          if (parsed.length > 0) {
            loadedRef.current = true
            mapSet(slidesMap, "data", parsed, "local")
            setSlides(parsed)
            setActiveIndex(0)
            setSelectedId(parsed[0].blocks[0]?.id || null)
          }
        },
        loadMarkdown: (md) => {
          const blocks = md.split(/\r?\n(?=#)/).filter((b) => b.trim())
          const next: Slide[] = blocks.map((b) => {
            const titleMatch = /^#{1,6}\s+(.*)$/m.exec(b)
            const title = titleMatch ? titleMatch[1].trim() : ""
            const body = b.replace(/^#{1,6}\s+.*$/m, "").trim()
            const slideBlocks: SlideBlock[] = []
            if (title) slideBlocks.push(textBlock({ text: title, x: 80, y: 80, w: 800, h: 100, fontSize: 36, bold: true }))
            slideBlocks.push(textBlock({ text: body, x: 120, y: 220, w: 720, h: 300, fontSize: 20 }))
            return { id: uid(), bg: PALETTE[1], blocks: slideBlocks }
          })
          if (next.length === 0) return
          loadedRef.current = true
          mapSet(slidesMap, "data", next, "local")
          setSlides(next)
          setActiveIndex(0)
          setSelectedId(null)
        },
        setSuggestions: (rows) => {
          const s = slidesRef.current[activeIndexRef.current]
          if (!s) {
            setSuggestions([])
            return
          }
          const live: Suggestion[] = []
          for (const r of rows) {
            if (!r.before || !r.after) continue
            const block = s.blocks.find((b) => b.type !== "image" && !isPlaceholder(b) && b.text.includes(r.before))
            if (block) live.push({ id: uid(), blockId: block.id, before: r.before, after: r.after, reason: r.reason })
          }
          setSuggestions(live)
        },
        applySuggestions: (rows) => doApplySuggestions(rows),
      }
    }
    onEditorReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced])

  useEffect(() => {
    return () => {
      if (apiRef?.current?.kind === "presentation") apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePresent = () => {
    if (!presenting) {
      document.documentElement.requestFullscreen?.().catch(() => {})
      setPresenting(true)
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      setPresenting(false)
    }
  }

  const applyTemplate = (t: PresTemplate, allSlides: boolean) => {
    if (activeIndex == null) return
    if (allSlides) {
      setSlides((prev) => prev.map((s) => applyTemplateToSlide(s, t)))
    } else {
      setSlides((prev) => prev.map((s, i) => (i === activeIndex ? applyTemplateToSlide(s, t) : s)))
    }
    setShowTemplates(false)
  }

  const handleImgUrlConfirm = () => {
    const url = imgUrlValue.trim()
    if (!url) { toast.error("Enter an image URL"); return }
    const probe = new Image()
    probe.onload = () => {
      if (imgUrlMode === "replace" && selectedId) {
        replaceImage(selectedId, url)
      } else {
        addImage(url)
      }
      setShowImgUrl(false)
      setImgUrlValue("")
    }
    probe.onerror = () => toast.error("Could not load image from that URL")
    probe.src = url
  }

  if (presenting) {
    const ps = slides[activeIndex]
    if (!ps) return null
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black"
        style={{ background: ps.bg }}
        onClick={(e) => {
          const x = e.nativeEvent.offsetX
          const w = e.currentTarget.clientWidth
          if (x > w * 0.7) setActiveIndex((i) => Math.min(i + 1, slides.length - 1))
          else if (x < w * 0.3) setActiveIndex((i) => Math.max(i - 1, 0))
        }}
      >
        <div className="relative h-full w-full max-w-[177vh]" style={{ aspectRatio: "16 / 10" }}>
          <SlideFrame slide={ps} />
        </div>
        <div
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-white opacity-0 transition-opacity hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => setActiveIndex((i) => Math.max(i - 1, 0))} disabled={activeIndex === 0} className="rounded-full p-1 hover:bg-white/20 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
          <span className="text-sm font-medium">{activeIndex + 1} / {slides.length}</span>
          <button onClick={() => setActiveIndex((i) => Math.min(i + 1, slides.length - 1))} disabled={activeIndex === slides.length - 1} className="rounded-full p-1 hover:bg-white/20 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
          <button onClick={togglePresent} className="ml-2 rounded-full p-1 hover:bg-white/20" title="Exit"><X className="h-5 w-5" /></button>
        </div>
      </div>
    )
  }

  if (!synced) {
    return <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Connecting to collaborative session…</div>
  }

  const addSlide = () => {
    if (!canEdit) return
    const next = [...slides, blankSlide(slide?.bg)]
    setSlides(next)
    setActiveIndex(next.length - 1)
    setSelectedId(null)
  }

  const removeSlide = (index: number) => {
    if (!canEdit || slides.length <= 1) return
    const next = slides.filter((_, i) => i !== index)
    setSlides(next)
    setActiveIndex(Math.min(activeIndex, next.length - 1))
    setSelectedId(null)
  }

  const duplicateSlide = (index: number) => {
    if (!canEdit) return
    const next = [...slides]
    next.splice(index + 1, 0, { ...slides[index], id: uid(), blocks: slides[index].blocks.map((b) => ({ ...b, id: uid() })) })
    setSlides(next)
    setActiveIndex(index + 1)
    setSelectedId(null)
  }

  const moveSlide = (index: number, dir: -1 | 1) => {
    if (!canEdit) return
    const target = index + dir
    if (target < 0 || target >= slides.length) return
    const next = [...slides]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSlides(next)
    setActiveIndex(target)
  }

  if (slides.length === 0) return null
  const sb = selectedBlock()

  const words = (text: string, block: SlideBlock): ReactNode[] => {
    const sugs = liveSuggestions.filter((x) => x.blockId === block.id && text.includes(x.before))
    if (sugs.length === 0) return [text]
    let parts: ReactNode[] = [text]
    for (const sug of sugs) {
      parts = parts.flatMap((p) => {
        if (typeof p !== "string") return [p]
        const out: ReactNode[] = []
        p.split(sug.before).forEach((seg, i) => {
          if (i > 0) {
            out.push(
              <button
                key={`${sug.id}-${i}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (canEdit) doApplySuggestions([{ before: sug.before, after: sug.after }]) }}
                className="rounded-sm decoration-red-400 underline decoration-wavy underline-offset-4 transition-colors hover:text-red-300"
                title={`Correct to “${sug.after}”`}
              >
                {sug.before}
              </button>
            )
          }
          if (seg) out.push(seg)
        })
        return out
      })
    }
    return parts
  }

  const ThumbSidebar = (
    <div className="hidden w-20 shrink-0 flex-col gap-2 overflow-y-auto pr-1 sm:flex sm:w-28 lg:w-36">
      {slides.map((s, i) => {
        const first = s.blocks.find((b) => !isPlaceholder(b)) || s.blocks[0]
        return (
          <div key={s.id} className="flex flex-col gap-1">
            <div onClick={() => { setActiveIndex(i); setSelectedId(null) }} className={`relative cursor-pointer overflow-hidden rounded border-2 transition ${i === activeIndex ? "border-primary" : "border-border hover:border-border/60"}`} style={{ aspectRatio: "16 / 10", background: s.bg }}>
              <div className="absolute inset-0 p-2">
                {first?.type === "image" ? <div className="flex h-full items-center justify-center text-[10px] text-white/60"><ImagePlus className="h-3 w-3" /></div> : <div className="truncate text-[10px] font-semibold text-white/90" style={{ lineHeight: 1.3 }}>{first ? (isPlaceholder(first) ? "Untitled slide" : first.text.split("\n")[0]) : "Empty slide"}</div>}
              </div>
            </div>
            {canEdit && i === activeIndex && (
              <div className="flex justify-center gap-1">
                <button onClick={() => moveSlide(i, -1)} disabled={i === 0} className="rounded border border-border p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30" title="Move up"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} className="rounded border border-border p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30" title="Move down"><ArrowDown className="h-3 w-3" /></button>
                <button onClick={() => duplicateSlide(i)} className="rounded border border-border p-0.5 text-muted-foreground hover:text-primary" title="Duplicate slide"><Copy className="h-3 w-3" /></button>
                <button onClick={() => removeSlide(i)} disabled={slides.length <= 1} className="rounded border border-border p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-30" title="Delete slide"><Trash2 className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        )
      })}
      {canEdit && (
        <button onClick={addSlide} className="flex items-center justify-center gap-1 rounded border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary"><Plus className="h-3.5 w-3.5" /> Add slide</button>
      )}
    </div>
  )

  const MobileSlideBar = (
    <div className="flex items-center justify-between gap-2 sm:hidden">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => setActiveIndex((i) => Math.max(0, i - 1))} disabled={activeIndex === 0} className="rounded border border-border px-1 py-0.5 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="min-w-[48px] text-center">{activeIndex + 1} / {slides.length}</span>
        <button onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))} disabled={activeIndex === slides.length - 1} className="rounded border border-border px-1 py-0.5 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <button onClick={addSlide} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-primary"><Plus className="inline h-3 w-3" /> Add</button>
          <button onClick={() => duplicateSlide(activeIndex)} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-primary"><Copy className="inline h-3 w-3" /></button>
          <button onClick={() => removeSlide(activeIndex)} disabled={slides.length <= 1} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="inline h-3 w-3" /></button>
        </div>
      )}
    </div>
  )

  const isTextBlock = sb && sb.type !== "image"
  const canAlign = !!sb && sb.type !== "image"

  const Toolbar = canEdit && (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-card/40 p-1.5 sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />

      <button onClick={addTextBox} className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20" title="Add text box"><Type className="h-3.5 w-3.5" /><span className="hidden sm:inline">Text</span></button>

      <button onClick={() => { pendingImageRef.current = null; imageInputRef.current?.click() }} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary" title="Upload image"><ImagePlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Upload</span></button>
      <button onClick={() => { setImgUrlMode(selectedBlock()?.type === "image" ? "replace" : "add"); setImgUrlValue(""); setShowImgUrl(true) }} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary" title="Image from URL"><Link2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">URL</span></button>

      <button onClick={addQuote} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary" title="Add quote"><Quote className="h-3.5 w-3.5" /><span className="hidden sm:inline">Quote</span></button>

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      <button onClick={() => { if (sb && isTextBlock) startEditing(null, sb) }} disabled={!sb || !isTextBlock} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Edit text"><Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">Edit</span></button>
      <button onClick={duplicateBlock} disabled={!sb} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
      <button onClick={removeBlock} disabled={!sb} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-destructive disabled:opacity-30" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      <button onClick={() => patchSelected({ bold: !(sb?.bold ?? false) })} disabled={!isTextBlock} className={`shrink-0 rounded-md border px-2 py-1 transition disabled:opacity-30 ${sb?.bold ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`} title="Bold"><Bold className="h-3.5 w-3.5" /></button>
      <button onClick={() => patchSelected({ italic: !(sb?.italic ?? false) })} disabled={!isTextBlock} className={`shrink-0 rounded-md border px-2 py-1 transition disabled:opacity-30 ${sb?.italic ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`} title="Italic"><Italic className="h-3.5 w-3.5" /></button>
      <button onClick={() => patchSelected({ fontSize: Math.max(6, (sb?.fontSize || 20) - 2) })} disabled={!isTextBlock} className="shrink-0 rounded-md border border-border px-1.5 py-1 text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Smaller font"><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-8 shrink-0 text-center text-xs tabular-nums text-foreground">{isTextBlock ? sb?.fontSize || "–" : ""}</span>
      <button onClick={() => patchSelected({ fontSize: Math.min(160, (sb?.fontSize || 20) + 2) })} disabled={!isTextBlock} className="shrink-0 rounded-md border border-border px-1.5 py-1 text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Bigger font"><Plus className="h-3.5 w-3.5" /></button>

      {/* Font / Filter picker (context-sensitive) */}
      {isTextBlock && (
        <Select value={sb?.font || "__default__"} onValueChange={(v) => patchSelected({ font: v === "__default__" ? undefined : v })}>
          <SelectTrigger className="h-7 w-[120px] shrink-0 gap-1 px-2 text-xs"><Type className="h-3 w-3 text-muted-foreground" /><SelectValue placeholder="Font" /></SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={`font-${f.value}`} value={f.value || "__default__"} style={{ fontFamily: f.value || undefined }}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {sb?.type === "image" && (
        <Select value={sb?.filter || "none"} onValueChange={(v) => patchSelected({ filter: v })}>
          <SelectTrigger className="h-7 w-[110px] shrink-0 gap-1 px-2 text-xs"><SlidersHorizontal className="h-3 w-3 text-muted-foreground" /><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            {IMAGE_FILTERS.map((f) => (
              <SelectItem key={`filter-${f.value}`} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      {(["left", "center", "right"] as const).map((a) => (
        <button key={a} onClick={() => patchSelected({ align: a })} disabled={!canAlign} className={`shrink-0 rounded-md border px-2 py-1 transition disabled:opacity-30 ${sb?.align === a ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`} title={`Align ${a}`}>
          {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
        </button>
      ))}

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      <button onClick={() => moveBlockZ(-1)} disabled={!sb} className="shrink-0 rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Bring backward"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button onClick={() => moveBlockZ(1)} disabled={!sb} className="shrink-0 rounded-md border border-border px-2 py-1 text-muted-foreground transition hover:text-primary disabled:opacity-30" title="Bring forward"><ArrowUp className="h-3.5 w-3.5" /></button>

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      {TEXT_COLORS.map((c) => (
        <button key={c} onClick={() => patchSelected({ color: c })} disabled={!isTextBlock} className={`h-4 w-4 shrink-0 rounded-full border transition hover:scale-110 disabled:opacity-30 ${sb?.color === c ? "border-primary ring-2 ring-primary/50" : "border-white/20"}`} style={{ background: c }} aria-label={`text color ${c}`} />
      ))}
      <label className="relative inline-flex shrink-0 items-center" title="Custom text color">
        <input type="color" value={sb?.color && sb.type !== "image" ? sb.color : "#ffffff"} disabled={!isTextBlock} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default" onChange={(e) => patchSelected({ color: e.target.value })} />
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-red-500 via-yellow-400 to-blue-500 disabled:opacity-30" />
      </label>

      <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

      <button onClick={() => setShowTemplates(true)} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-primary" title="Templates"><LayoutTemplate className="h-3.5 w-3.5" /><span className="hidden sm:inline">Style</span></button>

      <span className="hidden shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground sm:flex">BG</span>
      {PALETTE.map((c) => (
        <button key={c} onClick={() => activeIndex != null && updateSlide(activeIndex, { bg: c })} className={`h-4 w-4 shrink-0 rounded-full border transition hover:scale-110 ${slide?.bg === c ? "border-primary ring-2 ring-primary/50" : "border-white/20"}`} style={{ background: c }} aria-label={`slide bg ${c}`} />
      ))}
      <label className="relative inline-flex shrink-0 items-center" title="Custom background color">
        <input type="color" value={slide?.bg || "#12111f"} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => activeIndex != null && updateSlide(activeIndex, { bg: e.target.value })} />
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-orange-500 via-pink-400 to-purple-600" />
      </label>

      </div>
  )

  return (
    <div className="flex h-full flex-col gap-2 sm:flex-row sm:gap-3">
      {ThumbSidebar}

      <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2 sm:gap-3">
        {MobileSlideBar}
        {Toolbar}

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border">
          <div
            ref={canvasRef}
            className="relative shrink-0 cursor-default overflow-hidden"
            style={{ aspectRatio: "16 / 10", width: "100%", maxHeight: "100%", background: slide?.bg || PALETTE[1], touchAction: "none" }}
            onPointerDown={() => {
              if (!editingId && !dragRef.current) setSelectedId(null)
            }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            {liveSuggestions.length > 0 && (
              <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs shadow-lg">
                <Wand2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="font-medium text-foreground"><b className="text-amber-300">{liveSuggestions.length}</b> {liveSuggestions.length === 1 ? "fix" : "fixes"}</span>
                <button
                  onClick={() => { const n = doApplySuggestions(liveSuggestions.map((x) => ({ before: x.before, after: x.after }))); if (n > 0) toast.success(`Applied ${n} correction(s)`); }}
                  className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400 transition hover:bg-emerald-500/25"
                >
                  <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Accept all</span>
                </button>
                <button
                  onClick={() => setSuggestions([])}
                  className="rounded-md px-2 py-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            )}
            {slide?.blocks.length === 0 && (
              <button onClick={addTextBox} className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-dashed border-white/25 px-4 py-2 text-sm text-white/50 transition hover:border-white/60 hover:text-white">
                <Type className="h-4 w-4" /> Add content
              </button>
            )}
            {slide?.blocks.map((b) => {
              const selected = !readOnly && b.id === selectedId
              const isEditing = b.id === editingId
              const isImg = b.type === "image"
              const imgFilter = isImg ? filterCss(b.filter) : undefined
              const blkFont = !isImg ? (b.type === "quote" ? (b.font || "Georgia, 'Times New Roman', serif") : b.font || undefined) : undefined
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => onBlockPointerDown(e, b)}
                  onDoubleClick={(e) => {
                    if (suppressDblRef.current === b.id) { suppressDblRef.current = null; return }
                    if (isImg) { pendingImageRef.current = b.id; imageInputRef.current?.click() }
                    else startEditing(e, b)
                  }}
                  className={`group absolute cursor-grab select-none rounded-sm transition-shadow ${selected ? "z-10 ring-2 ring-primary" : ""} ${isEditing ? "z-20 cursor-text" : ""}`}
                  style={{ left: `${(b.x / SLIDE_W) * 100}%`, top: `${(b.y / SLIDE_H) * 100}%`, width: `${(b.w / SLIDE_W) * 100}%`, height: `${(b.h / SLIDE_H) * 100}%` }}
                  tabIndex={0}
                >
                  {isImg ? (
                    <>
                      {b.src ? <img src={b.src} draggable={false} className="pointer-events-none h-full w-full select-none object-contain" style={{ filter: imgFilter }} /> : <div className="flex h-full w-full items-center justify-center border border-dashed border-white/20 text-[11px] text-white/50">No image</div>}
                      {selected && !readOnly && <div onPointerDown={(e) => onResizePointerDown(e, b)} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-white/70 bg-primary" title="Resize" />}
                    </>
                  ) : isEditing ? (
                    <textarea
                      autoFocus
                      value={b.text}
                      onChange={(e) => updateBlock(activeIndex, b.id, { text: e.target.value })}
                      onBlur={commitEditing}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); commitEditing() } }}
                      placeholder="Type here…"
                      className="h-full w-full resize-none overflow-hidden bg-transparent outline-none"
                      style={{ fontSize: `${b.fontSize * scale}px`, fontWeight: b.bold ? 700 : 400, fontStyle: b.italic ? "italic" : "normal", color: isPlaceholder(b) ? "rgba(255,255,255,0.4)" : b.color || "#fff", textAlign: b.align || "left", fontFamily: b.font || undefined, lineHeight: 1.25 }}
                    />
                  ) : (
                    <>
                      {b.type === "quote" ? (
                        <div className="flex h-full w-full">
                          <div className="h-full w-1.5 shrink-0 rounded-full" style={{ background: b.color || "#c4b5fd" }} />
                          <div className="flex-1 overflow-hidden px-3 pt-1" style={{ fontFamily: b.font || 'Georgia, "Times New Roman", serif', fontSize: `${b.fontSize * scale}px`, fontStyle: "italic", color: b.color || "#c4b5fd", textAlign: b.align || "left", lineHeight: 1.3 }}>
                            <div className="whitespace-pre-wrap break-words">{words(b.text, b)}</div>
                            {!b.text && !isPlaceholder(b) && <span className="opacity-40">Quote…</span>}
                            {b.author ? <div className="mt-1 text-right text-[0.7em] not-italic opacity-70">&mdash; {b.author}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`h-full w-full whitespace-pre-wrap break-words ${b.bold ? "font-bold" : ""} ${b.italic ? "italic" : ""} ${!b.text ? "opacity-40" : ""}`}
                          style={{ fontSize: `${b.fontSize * scale}px`, color: isPlaceholder(b) ? "rgba(255,255,255,0.4)" : b.color || "#fff", textAlign: b.align || "left", fontFamily: blkFont, lineHeight: 1.25 }}
                        >
                          {isPlaceholder(b) ? b.text : words(b.text, b)}
                        </div>
                      )}
                    </>
                  )}
                  {selected && !readOnly && (
                    <>
                      <div className="pointer-events-none absolute -top-2 left-0 h-0.5 w-full bg-primary" />
                      <div className="pointer-events-none absolute -left-2 top-0 h-full w-0.5 bg-primary" />
                      <div className="pointer-events-none absolute -bottom-2 left-0 h-0.5 w-full bg-primary" />
                      <div className="pointer-events-none absolute -right-2 top-0 h-full w-0.5 bg-primary" />
                      {!isEditing && (
                        <div
                          onPointerDown={(e) => onResizePointerDown(e, b)}
                          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-white/70 bg-primary"
                          title="Resize"
                        />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Edits sync live with collaborators.
          <span className="ml-auto flex items-center gap-1"><Type className="h-3.5 w-3.5" />{canEdit ? "Editing" : "Read only"}</span>
        </div>
      </div>

      {/* ── Templates dialog ────────────────────────────────────────── */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-h-[85vh] w-[min(520px,92vw)] overflow-y-auto p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-sm">Templates &amp; Styles</DialogTitle>
            <DialogDescription className="text-xs">Apply a preset to the current slide or every slide in the deck.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            {[...PRES_TEMPLATES, ...savedTemplates].map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <div className="h-7 w-10 shrink-0 rounded-sm" style={{ background: t.bg, color: t.titleColor, fontFamily: t.titleFont || undefined, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>Aa</div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
                <button onClick={() => applyTemplate(t, false)} disabled={activeIndex == null} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-primary disabled:opacity-30">This slide</button>
                <button onClick={() => applyTemplate(t, true)} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-primary">All slides</button>
                {savedTemplates.some((s) => s.id === t.id) && (
                  <button
                    onClick={() => {
                      const next = savedTemplates.filter((s) => s.id !== t.id)
                      setSavedTemplates(next)
                      persistSavedTemplates(next)
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:text-destructive"
                    title="Delete template"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="mt-3 flex flex-row items-center gap-2 sm:flex-row sm:justify-end">
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="New template name"
              className="h-8 w-[180px] text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (!tplName.trim()) { toast.error("Enter a name"); return }
                  if (activeIndex == null) return
                  const tpl = currentSlideAsTemplate(slides[activeIndex], tplName.trim())
                  const next = [...savedTemplates, tpl]
                  setSavedTemplates(next)
                  persistSavedTemplates(next)
                  setTplName("")
                  toast.success("Template saved")
                }
              }}
            />
            <button
              onClick={() => {
                if (!tplName.trim()) { toast.error("Enter a name"); return }
                if (activeIndex == null) return
                const tpl = currentSlideAsTemplate(slides[activeIndex], tplName.trim())
                const next = [...savedTemplates, tpl]
                setSavedTemplates(next)
                persistSavedTemplates(next)
                setTplName("")
                toast.success("Template saved")
              }}
              disabled={activeIndex == null}
              className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-30"
            >
              Save current slide
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Image URL dialog ────────────────────────────────────────── */}
      <Dialog open={showImgUrl} onOpenChange={setShowImgUrl}>
        <DialogContent className="max-h-[85vh] w-[min(480px,92vw)] overflow-y-auto p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-sm">Image from URL</DialogTitle>
            <DialogDescription className="text-xs">Paste a link to an image on the web.</DialogDescription>
          </DialogHeader>
          <Input
            value={imgUrlValue}
            onChange={(e) => setImgUrlValue(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-9 w-full text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleImgUrlConfirm() } }}
          />
          {imgUrlValue.trim() && (
            <div className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-black/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgUrlValue.trim()}
                alt="Preview"
                className="max-h-48 w-full object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0" }}
              />
            </div>
          )}
          <DialogFooter className="mt-2 flex flex-row items-center gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => { setShowImgUrl(false); setImgUrlValue("") }} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground">Cancel</button>
            <button onClick={handleImgUrlConfirm} className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20">
              {imgUrlMode === "replace" ? "Replace image" : "Add image"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
