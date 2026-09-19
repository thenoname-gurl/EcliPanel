"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import {
  FileText,
  FolderOpen,
  Table2,
  Presentation,
  NotebookTabs,
  Star,
  Trash2,
  Share2,
  Copy,
  Pencil,
  Search,
  Plus,
  Users,
  ArrowLeft,
  Eye,
  X,
  Loader2,
  Sparkles,
  ImagePlus,
} from "lucide-react"
import type {
  OfficeDocumentDTO,
  OfficeDocType,
  OfficePermission,
  OfficeShareDTO,
} from "@/lib/office/types"
import { SlideFrame } from "@/components/office/SlideFrame"

type Filter = "all" | OfficeDocType | "starred" | "trash"

const TYPE_LABEL: Record<OfficeDocType, string> = {
  document: "document",
  spreadsheet: "spreadsheet",
  presentation: "presentation",
  notebook: "notebook",
}

const TYPE_ICON: Record<OfficeDocType, typeof FileText> = {
  document: FileText,
  spreadsheet: Table2,
  presentation: Presentation,
  notebook: NotebookTabs,
}

const KERNEL_BADGE: Record<string, string> = {
  lua: "bg-violet-400/15 text-violet-400",
}

const KERNEL_SHORT: Record<string, string> = {
  lua: "LUA",
}

function fileName(name: string, type: OfficeDocType): string {
  const ext = type === "document" ? "" : type === "spreadsheet" ? "" : ""
  return `${name}${ext}`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = (now.getTime() - d.getTime()) / 86400000
  if (diffDays < 1) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
}

function colLetter(index: number): string {
  let s = ""
  let i = index
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s
    i = Math.floor(i / 26) - 1
  }
  return s
}

interface SheetStyle {
  b?: number | boolean
  i?: number | boolean
  u?: number | boolean
  s?: number
  a?: "l" | "c" | "r"
  c?: string
  bg?: string
}

function sheetCellCss(st: SheetStyle | undefined): React.CSSProperties {
  const css: React.CSSProperties = {}
  if (!st) return css
  if (st.b) css.fontWeight = 700
  if (st.i) css.fontStyle = "italic"
  if (st.u) css.textDecoration = "underline"
  if (typeof st.s === "number") css.fontSize = Math.max(5, Math.round(st.s * 0.5))
  if (st.a) css.textAlign = st.a === "c" ? "center" : st.a === "r" ? "right" : "left"
  if (st.c) css.color = st.c
  if (st.bg) css.backgroundColor = st.bg
  return css
}

const SHEET_CELL_W = 64
const SHEET_CELL_H = 28
const SHEET_HDR_W = 40
const SHEET_HDR_H = 28
const SHEET_THUMB_COLS = 6
const SHEET_THUMB_ROWS = 6

interface SheetImage {
  id?: string
  col: number
  row: number
  src: string
  w: number
  h: number
}

function parseSheet(content: any): { cells: Record<string, string>; styles: Record<string, SheetStyle>; images: SheetImage[] } {
  const cells: Record<string, string> = {}
  const styles: Record<string, SheetStyle> = {}
  const images: SheetImage[] = []
  const raw = content?.cells
  if (Array.isArray(raw)) {
    raw.forEach((row: any, r: number) => {
      if (!Array.isArray(row)) return
      row.forEach((v: any, c: number) => {
        if (v === null || v === undefined) return
        cells[`${c}:${r}`] = String(v)
      })
    })
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue
      cells[k] = String(v)
    }
  }
  const rawStyles = content?.styles
  if (rawStyles && typeof rawStyles === "object") {
    for (const [k, v] of Object.entries(rawStyles)) {
      if (!v || typeof v !== "object") continue
      styles[k] = v as SheetStyle
    }
  }
  const rawImages = content?.images
  if (Array.isArray(rawImages)) {
    for (const img of rawImages) {
      if (!img || typeof img !== "object" || !img.src) continue
      images.push({
        id: img.id,
        col: Number(img.col) || 0,
        row: Number(img.row) || 0,
        src: String(img.src),
        w: Number(img.w) || 200,
        h: Number(img.h) || 120,
      })
    }
  }
  return { cells, styles, images }
}

function legacySlideBlocks(s: any): any[] | null {
  const title = String(s?.title || "")
  const subtitle = String(s?.subtitle || "")
  const body = String(s?.body || "")
  if (!title && !subtitle && !body) return null
  const uid = () => Math.random().toString(36).slice(2, 10)
  const blocks: any[] = []
  if (title)
    blocks.push({ id: uid(), type: "text", text: title, x: 60, y: 56, w: 840, h: 100, fontSize: 40, bold: true, align: "center" })
  if (subtitle)
    blocks.push({ id: uid(), type: "text", text: subtitle, x: 80, y: 164, w: 800, h: 60, fontSize: 24, align: "center" })
  if (body)
    blocks.push({ id: uid(), type: "text", text: body, x: 160, y: 256, w: 640, h: 270, fontSize: 20, align: "center" })
  return blocks
}

function toSlideData(s: any): any {
  const raw = Array.isArray(s?.blocks) && s.blocks.length > 0 ? s.blocks : legacySlideBlocks(s)
  return {
    id: String(s?.id || "s1"),
    bg: s?.bg || "#12111f",
    blocks: raw || [],
  }
}

function docBlockText(block: any): string {
  if (!block) return ""
  if (Array.isArray(block.content)) {
    return block.content.map((c: any) => (c && typeof c.text === "string" ? c.text : "")).join("")
  }
  return typeof block.text === "string" ? block.text : ""
}

function RenderDocBlocks({ blocks, depth = 0 }: { blocks: any[]; depth?: number }) {
  return (
    <>
      {blocks.map((b: any, i: number) => {
        if (!b || typeof b !== "object") return null
        const text = docBlockText(b)
        const type = b?.type
        const indent = depth > 0 ? <span className="inline-block w-3" /> : null
        let body: React.ReactNode
        if (type === "heading") {
          const level = Math.min(3, Number(b.props?.level) || 1)
          body = (
            <div className={level === 1 ? "text-sm font-bold" : "text-xs font-semibold"}>
              {text || <>&nbsp;</>}
            </div>
          )
        } else if (type === "bulletListItem" || type === "checkListItem") {
          body = (
            <div className="flex gap-1">
              <span className="shrink-0 select-none">•</span>
              <span>{text || <>&nbsp;</>}</span>
            </div>
          )
        } else if (type === "numberedListItem") {
          body = (
            <div className="flex gap-1">
              <span className="shrink-0 select-none tabular-nums">{i + 1}.</span>
              <span>{text || <>&nbsp;</>}</span>
            </div>
          )
        } else if (type === "quote") {
          body = (
            <div className="border-l-2 border-primary/50 pl-1.5 italic">
              {text || <>&nbsp;</>}
            </div>
          )
        } else if (type === "codeBlock") {
          body = <div className="truncate font-mono text-[11px]">{text || <>&nbsp;</>}</div>
        } else if (type === "image") {
          body = (
            <div className="flex items-center gap-1 text-muted-foreground">
              <ImagePlus className="h-3 w-3" /> image
            </div>
          )
        } else {
          body = <div>{text || <>&nbsp;</>}</div>
        }
        return (
          <div key={b.id ?? i} className="flex gap-0.5">
            {indent}
            <div className="min-w-0 flex-1">
              {body}
              {Array.isArray(b.children) && b.children.length > 0 ? (
                <div className="mt-0.5">
                  <RenderDocBlocks blocks={b.children} depth={depth + 1} />
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </>
  )
}

function DocThumbnail({ doc }: { doc: OfficeDocumentDTO }) {
  const content = doc.content as any
  const hostRef = "absolute inset-0"

  if (doc.type === "notebook") {
    const cells: any[] = Array.isArray(content?.cells)
      ? content.cells
      : Array.isArray(content)
        ? content
        : []
    const codeCells = cells.filter((c: any) => c?.type === "code")
    const kernels: string[] = Array.from(new Set(codeCells.map((c: any) => c?.language).filter(Boolean)))
    const firstCode = codeCells[0]
    const hasMarkdown = cells.some((c: any) => c?.type === "markdown")
    return (
      <div className={`relative w-full overflow-hidden rounded-md ${hostRef}`}>
        <div className="flex h-full flex-col bg-card p-2">
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            {kernels.map((k) => (
              <span key={k} className={cn("rounded px-1 py-0.5 text-[8px] font-bold", KERNEL_BADGE[k] ?? "text-muted-foreground")}>
                {KERNEL_SHORT[k] ?? k}
              </span>
            ))}
            {hasMarkdown && (
              <span className="rounded bg-secondary px-1 py-0.5 text-[8px] font-bold text-muted-foreground">MD</span>
            )}
            <span className="ml-auto text-[8px] font-medium text-muted-foreground">
              {cells.length} {cells.length === 1 ? "cell" : "cells"}
            </span>
          </div>
          {firstCode ? (
            <pre className="flex-1 overflow-hidden whitespace-pre-wrap text-[9px] leading-4 text-muted-foreground">
              {(firstCode.source || "").slice(0, 240)}
            </pre>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center text-[9px] italic text-muted-foreground">
              No cells yet
            </div>
          )}
        </div>
      </div>
    )
  }

  if (doc.type === "presentation") {
    const slides = Array.isArray(content?.slides) ? content.slides.map(toSlideData) : []
    const slide = slides[0]
    return (
      <div className={`relative w-full overflow-hidden rounded-md ${hostRef}`}>
        {slide ? <SlideFrame slide={slide} /> : <div className="h-full w-full" style={{ background: "#12111f" }} />}
        {slides.length > 1 && (
          <div className="absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {slides.length}
          </div>
        )}
      </div>
    )
  }

  if (doc.type === "spreadsheet") {
    const { cells, styles, images } = parseSheet(content)
    const getCell = (c: number, r: number) => {
      const v = cells[`cell:${c}:${r}`] ?? cells[`${c}:${r}`]
      return v !== undefined ? v : ""
    }
    const getStyle = (c: number, r: number): SheetStyle => styles[`cell:${c}:${r}`] ?? styles[`${c}:${r}`]
    const gridW = SHEET_HDR_W + SHEET_THUMB_COLS * SHEET_CELL_W
    const gridH = SHEET_HDR_H + SHEET_THUMB_ROWS * SHEET_CELL_H
    return (
      <div className={`${hostRef} overflow-hidden rounded-md border border-border bg-card p-0.5`}>
        <div className="relative h-full w-full">
          <table className="h-full w-full table-fixed border-collapse font-mono leading-none">
            <thead>
              <tr>
                <th className="w-3 border border-border bg-secondary/80 px-0 text-[7px] font-medium text-muted-foreground" />
                {Array.from({ length: 6 }).map((_, c) => (
                  <th
                    key={c}
                    className="border border-border bg-secondary/80 px-0 text-center text-[7px] font-medium text-muted-foreground"
                  >
                    {colLetter(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r}>
                  <td className="border border-border bg-secondary/80 px-0 text-right text-[7px] text-muted-foreground">
                    {r + 1}
                  </td>
                  {Array.from({ length: 6 }).map((_, c) => (
                    <td
                      key={c}
                      className="overflow-hidden border border-border px-0.5 text-[8px] leading-4"
                      style={sheetCellCss(getStyle(c, r))}
                    >
                      {getCell(c, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {images.map((img) => (
            <img
              key={img.id ?? `${img.col}:${img.row}`}
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none object-contain"
              style={{
                left: `${((SHEET_HDR_W + img.col * SHEET_CELL_W) / gridW) * 100}%`,
                top: `${((SHEET_HDR_H + img.row * SHEET_CELL_H) / gridH) * 100}%`,
                width: `${(img.w / gridW) * 100}%`,
                height: `${(img.h / gridH) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`${hostRef} overflow-hidden rounded-md border border-border bg-secondary/40 p-2.5`}>
      <div className="flex h-full flex-col gap-0.5 text-xs leading-4 text-muted-foreground">
        {Array.isArray(content) && content.length ? (
          <div className="line-clamp-8 overflow-hidden">
            <RenderDocBlocks blocks={content} />
          </div>
        ) : doc.description ? (
          <div className="line-clamp-4">{doc.description}</div>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/80">
            <FileText className="h-4 w-4" />
            Empty document
          </span>
        )}
      </div>
    </div>
  )
}

function OfficePage() {
  const t = useTranslations("officePage")
  const router = useRouter()
  const { user } = useAuth()

  const [docs, setDocs] = useState<OfficeDocumentDTO[] | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<OfficeDocType>("document")
  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)

  const [renameTarget, setRenameTarget] = useState<OfficeDocumentDTO | null>(null)
  const [renameName, setRenameName] = useState("")
  const [shareTarget, setShareTarget] = useState<OfficeDocumentDTO | null>(null)
  const [trashTarget, setTrashTarget] = useState<OfficeDocumentDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OfficeDocumentDTO | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async (trashed?: boolean) => {
    const showTrash = trashed ?? filter === "trash"
    try {
      const data = await apiFetch(
        API_ENDPOINTS.officeList + (showTrash ? "?trashed=true" : "")
      )
      setDocs(Array.isArray(data) ? data : [])
    } catch {
      setDocs([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const trimmedSearch = search.trim().toLowerCase()

  const visible = useMemo(
    () => {
      if (!docs) return []
      let list = docs
      switch (filter) {
        case "document":
        case "spreadsheet":
        case "presentation":
          list = list.filter((d) => d.type === filter)
          break
        case "starred":
          list = list.filter((d) => d.isStarred)
          break
        case "trash":
          list = list // docs already only contain trashed docs
          break
        default:
          break
      }
      if (trimmedSearch) {
        list = list.filter(
          (d) => d.name.toLowerCase().includes(trimmedSearch) || (d.description || "").toLowerCase().includes(trimmedSearch)
        )
      }
      return list
    },
    [docs, filter, trimmedSearch]
  )

  const createDoc = async () => {
    if (creating) return
    setCreating(true)
    try {
      const doc = await apiFetch(API_ENDPOINTS.officeCreate, {
        method: "POST",
        body: { type: createType, name: createName.trim() || undefined },
      })
      if (doc?.id) {
        setCreateOpen(false)
        setCreateName("")
        router.push(`/dashboard/office/${doc.id}`)
      }
    } catch {
      /* ignore */
    } finally {
      setCreating(false)
    }
  }

  const toggleStar = async (doc: OfficeDocumentDTO) => {
    if (doc.role !== "owner") return
    setBusyId(doc.id)
    try {
      await apiFetch(API_ENDPOINTS.officeUpdate.replace(":id", String(doc.id)), {
        method: "PATCH",
        body: { isStarred: !doc.isStarred },
      })
      setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, isStarred: !doc.isStarred } : d)) ?? null)
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const duplicateDoc = async (doc: OfficeDocumentDTO) => {
    setBusyId(doc.id)
    try {
      await apiFetch(API_ENDPOINTS.officeDuplicate.replace(":id", String(doc.id)), {
        method: "POST",
      })
      await load()
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const trashDoc = async (doc: OfficeDocumentDTO) => {
    setBusyId(doc.id)
    try {
      await apiFetch(API_ENDPOINTS.officeTrash.replace(":id", String(doc.id)), { method: "POST" })
      setTrashTarget(null)
      await load()
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const restoreDoc = async (doc: OfficeDocumentDTO) => {
    setBusyId(doc.id)
    try {
      await apiFetch(API_ENDPOINTS.officeRestore.replace(":id", String(doc.id)), { method: "POST" })
      await load()
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const deleteDoc = async (doc: OfficeDocumentDTO) => {
    setBusyId(doc.id)
    try {
      await apiFetch(API_ENDPOINTS.officeDelete.replace(":id", String(doc.id)), { method: "DELETE" })
      setDeleteTarget(null)
      await load()
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const renameDoc = async () => {
    if (!renameTarget) return
    setBusyId(renameTarget.id)
    try {
      await apiFetch(API_ENDPOINTS.officeUpdate.replace(":id", String(renameTarget.id)), {
        method: "PATCH",
        body: { name: renameName.trim() || renameTarget.name },
      })
      setDocs((prev) =>
        prev?.map((d) => (d.id === renameTarget.id ? { ...d, name: renameName.trim() || d.name } : d)) ?? null
      )
      setRenameTarget(null)
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "document", label: t("documents") },
    { key: "spreadsheet", label: t("spreadsheets") },
    { key: "presentation", label: t("presentations") },
    { key: "notebook", label: t("notebooks") },
    { key: "starred", label: t("starred") },
    { key: "trash", label: t("trash") },
  ]

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => { setCreateType("document"); setCreateOpen(true) }}>
            <FileText className="mr-1.5 h-4 w-4" /> {t("newDocument")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setCreateType("spreadsheet"); setCreateOpen(true) }}>
            <Table2 className="mr-1.5 h-4 w-4" /> {t("newSpreadsheet")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setCreateType("presentation"); setCreateOpen(true) }}>
            <Presentation className="mr-1.5 h-4 w-4" /> {t("newPresentation")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setCreateType("notebook"); setCreateOpen(true) }}>
            <NotebookTabs className="mr-1.5 h-4 w-4" /> {t("newNotebook")}
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1">
          {filterTabs.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                filter === f.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {docs === null ? (
          <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
            <div className="rounded-full bg-secondary p-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <p className="mt-2 font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((doc) => {
              const Icon = TYPE_ICON[doc.type] ?? FolderOpen
              const isOwner = doc.role === "owner"
              return (
                <Link
                  key={doc.id}
                  href={`/dashboard/office/${doc.id}`}
                  className="group relative rounded-lg border border-border bg-card p-3 transition hover:border-primary/50"
                >
                  {/* Thumbnail preview */}
                  <div className="relative w-full overflow-hidden rounded-md bg-secondary/30" style={{ aspectRatio: "16 / 10" }}>
                    <DocThumbnail doc={doc} />
                    <div className="absolute left-1.5 top-1.5 rounded-md bg-background/80 p-1 text-primary backdrop-blur">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="absolute right-1.5 top-1.5 flex gap-0.5" onClick={(e) => e.preventDefault()}>
                      <button
                        onClick={() => router.push(`/dashboard/office/${doc.id}?preview=1`)}
                        className="rounded bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur transition hover:text-foreground group-hover:opacity-100"
                        title={t("actions.preview")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-1">
                    <div className="flex gap-0.5" onClick={(e) => e.preventDefault()}>
                      {filter === "trash" ? (
                        <>
                          <button
                            onClick={() => restoreDoc(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.restore")}
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive hover:text-white"
                            title={t("actions.deleteForever")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : isOwner ? (
                        <>
                          <button
                            onClick={() => toggleStar(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={doc.isStarred ? t("actions.unstar") : t("actions.star")}
                          >
                            <Star className={cn("h-4 w-4", doc.isStarred && "fill-amber-400 text-amber-400")} />
                          </button>
                          <button
                            onClick={() => {
                              setRenameTarget(doc)
                              setRenameName(doc.name)
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.rename")}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShareTarget(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.share")}
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => duplicateDoc(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.duplicate")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setTrashTarget(doc)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.moveToTrash")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/dashboard/office/${doc.id}?preview=1`)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            title={t("actions.preview")}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => router.push(`/dashboard/office/${doc.id}?preview=1`)}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary"
                          title={t("actions.preview")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="truncate font-medium text-foreground">{fileName(doc.name, doc.type)}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t(`lastEditedBy`, { date: shortDate(doc.updatedAt) })}</span>
                    {doc.shared && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {t("sharedWithYou")}
                        </Badge>
                      </span>
                    )}
                    {!isOwner && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
                        {doc.role}
                      </Badge>
                    )}
                  </div>
                  {busyId === doc.id && (
                    <Loader2 className="absolute bottom-2.5 right-3 h-4 w-4 animate-spin text-primary" />
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.createTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.createSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["document", "spreadsheet", "presentation", "notebook"] as OfficeDocType[]).map((type) => {
              const Icon = TYPE_ICON[type] ?? FolderOpen
              return (
                <button
                  key={type}
                  onClick={() => setCreateType(type)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition",
                    createType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-border/60"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(TYPE_LABEL[type])}
                </button>
              )
            })}
          </div>
          <Input
            placeholder={t("dialogs.createNamePlaceholder")}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void createDoc()}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("actions.cancel")}</Button>
            </DialogClose>
            <Button onClick={() => void createDoc()} disabled={creating}>
              {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("dialogs.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("dialogs.renamePlaceholder")}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void renameDoc()}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("actions.cancel")}</Button>
            </DialogClose>
            <Button onClick={() => void renameDoc()}>{t("dialogs.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trash confirm */}
      <Dialog open={!!trashTarget} onOpenChange={(o) => !o && setTrashTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.trashTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.trashDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("actions.cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => trashTarget && void trashDoc(trashTarget)}>
              {t("dialogs.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete forever confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("actions.cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => deleteTarget && void deleteDoc(deleteTarget)}>
              {t("dialogs.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      {shareTarget && <ShareDialog t={t} doc={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  )
}

function ShareDialog({
  t,
  doc,
  onClose,
}: {
  t: (key: string, values?: any) => string
  doc: OfficeDocumentDTO
  onClose: () => void
}) {
  const [shares, setShares] = useState<OfficeShareDTO[] | null>(null)
  const [email, setEmail] = useState("")
  const [permission, setPermission] = useState<OfficePermission>("edit")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.officeShares.replace(":id", String(doc.id)))
      setShares(Array.isArray(data) ? data : [])
    } catch {
      setShares([])
    }
  }, [doc.id])

  useEffect(() => {
    void load()
  }, [load])

  const addShare = async () => {
    if (!email.trim() || saving) return
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.officeShareCreate.replace(":id", String(doc.id)), {
        method: "POST",
        body: { email: email.trim(), permission },
      })
      setEmail("")
      await load()
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  const removeShare = async (shareId: number) => {
    try {
      await apiFetch(
        API_ENDPOINTS.officeShareDelete.replace(":id", String(doc.id)).replace(":shareId", String(shareId)),
        { method: "DELETE" }
      )
      await load()
    } catch {
      /* ignore */
    }
  }

  const permKey: Record<OfficePermission, string> = {
    view: "canView",
    comment: "canComment",
    edit: "canEdit",
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.shareTitle")}</DialogTitle>
          <DialogDescription>{t("dialogs.shareSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Input
              placeholder={t("dialogs.shareEmailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addShare()}
            />
            <Select value={permission} onValueChange={(v) => setPermission(v as OfficePermission)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{t("canView")}</SelectItem>
                <SelectItem value="comment">{t("canComment")}</SelectItem>
                <SelectItem value="edit">{t("canEdit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void addShare()} disabled={saving || !email.trim()}>
            {t("dialogs.shareAdd")}
          </Button>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {shares === null ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
          ) : shares.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">{t("dialogs.shareEmpty")}</div>
          ) : (
            shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    {(s.user?.displayName || s.user?.email || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {s.user?.displayName || s.user?.email || `#${s.userId}`}
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">{t(permKey[s.permission])}</div>
                  </div>
                </div>
                <button onClick={() => void removeShare(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function OfficeIndexPage() {
  return (
    <FeatureGuard feature="office">
      <OfficePage />
    </FeatureGuard>
  )
}