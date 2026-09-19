"use client"

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import * as Y from "yjs"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Play,
  Loader2,
  RotateCcw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eraser,
  Code2,
  Blocks,
  FileText,
  AlertTriangle,
  Eye,
  Pencil,
} from "lucide-react"
import BlockCell, { CodeModeToggle } from "@/components/office/BlockCell"
import NotebookHelpDialog from "@/components/office/NotebookHelpDialog"
import { mapDelete, mapSet, type OfficeProvider } from "@/lib/office/collab"
import { createNotebookRuntime, formatJsValue } from "@/lib/office/notebook/kernels"
import type {
  CellOutput,
  NotebookCell,
  NotebookKernelId,
  NotebookSnapshot,
} from "@/lib/office/notebook/types"
import {
  NOTEBOOK_CELL_LIMIT,
  NOTEBOOK_DEFAULT_KERNEL,
  NOTEBOOK_DEFAULT_TIMEOUT_MS,
  NOTEBOOK_KERNELS,
} from "@/lib/office/notebook/types"
import type { NotebookRuntime } from "@/lib/office/notebook/kernels"
import type { OfficeApiRef } from "@/lib/office/editorApi"

interface Props {
  provider: OfficeProvider
  readOnly?: boolean
  initialContent?: unknown
  apiRef?: OfficeApiRef
  onEditorReady?: () => void
}

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

// ─────────────────────────────────────────────────────────────────────────────
// Yjs schema
// ─────────────────────────────────────────────────────────────────────────────
// One `provider.doc.getMap("notebook")` drives the whole notebook:
//   order       → JSON string[]  of cell ids (left → right = top → bottom)
//   cell:<id>   → JSON of { id, type, language, source, executionCount, metadata }
//   out:<id>    → JSON CellOutput[] (written once per run, kept out of cell:<id>
//                 so per-keystroke writes stay small)
//
// Remote clients observe the map and re-derive the cell list. Outputs ARE
// broadcast (one write per run) so collaborators see results, while live
// source typing only touches `cell:<id>`.

function makeCellId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function toSnapshot(content: unknown): NotebookSnapshot | null {
  if (!content || typeof content !== "object") return null
  const c = content as any
  if (!Array.isArray(c.cells)) return null
  const cells: NotebookCell[] = []
  for (const raw of c.cells) {
    if (!raw || typeof raw !== "object") continue
    const id = typeof raw.id === "string" && raw.id ? raw.id : makeCellId()
    const type = raw.type === "markdown" ? "markdown" : "code"
    cells.push({
      id,
      type,
      language: raw.language === "lua" ? "lua" : NOTEBOOK_DEFAULT_KERNEL,
      source: String(raw.source ?? ""),
      outputs: Array.isArray(raw.outputs) ? raw.outputs.filter((o: any) => o && typeof o === "object") : [],
      executionCount: typeof raw.executionCount === "number" ? raw.executionCount : null,
      metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : undefined,
    })
  }
  return { version: 1, cells }
}

function readOrder(nb: Y.Map<string>): string[] {
  const raw = nb.get("order")
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : []
  } catch {
    return []
  }
}

function cellData(nb: Y.Map<string>, id: string): Partial<NotebookCell> | null {
  const raw = nb.get(`cell:${id}`)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    return d && typeof d === "object" ? (d as Partial<NotebookCell>) : null
  } catch {
    return null
  }
}

function cellOutputs(nb: Y.Map<string>, id: string): CellOutput[] {
  const raw = nb.get(`out:${id}`)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((o) => o && typeof o === "object") : []
  } catch {
    return []
  }
}

function readCells(nb: Y.Map<string>): NotebookCell[] {
  const cells: NotebookCell[] = []
  const seen = new Set<string>()
  const build = (id: string) => {
    const base = cellData(nb, id)
    if (!base) return
    seen.add(id)
    cells.push({
      id,
      type: base.type === "markdown" ? "markdown" : "code",
      language: base.language === "lua" ? "lua" : NOTEBOOK_DEFAULT_KERNEL,
      source: String(base.source ?? ""),
      outputs: cellOutputs(nb, id),
      executionCount: typeof base.executionCount === "number" ? base.executionCount : null,
      metadata: base.metadata && typeof base.metadata === "object" ? base.metadata : undefined,
    })
  }
  for (const id of readOrder(nb)) build(id)
  if (seen.size < 1) {
    // Defensive: pick up any cell keys that never made it into `order`.
    for (const key of Array.from(nb.keys())) {
      if (!key.startsWith("cell:")) continue
      const id = key.slice(5)
      if (!seen.has(id)) build(id)
    }
  }
  return cells
}

// ─────────────────────────────────────────────────────────────────────────────
// output rendering
// ─────────────────────────────────────────────────────────────────────────────

function CellOutputs({ outputs, timedOut }: { outputs: CellOutput[]; timedOut?: boolean }) {
  const t = useTranslations("notebookPage")
  if (!outputs || outputs.length === 0) return null
  return (
    <div className="border-t border-border bg-background/60">
      {outputs.map((o, i) => {
        if (o.type === "stream") {
          return (
            <pre
              key={i}
              className={cn(
                "whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-xs leading-relaxed",
                o.name === "stderr" ? "text-red-400" : "text-foreground"
              )}
            >
              {o.text}
            </pre>
          )
        }
        if (o.type === "error") {
          return (
            <div key={i} className="border-l-2 border-red-500/70 bg-red-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {o.errorType || t("outputs.error")}
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-300">
                {o.traceback}
              </pre>
            </div>
          )
        }
        if (o.type === "image") {
          return (
            <div key={i} className="px-3 py-2">
              <img src={o.dataUrl} alt="" className="max-h-96 max-w-full rounded border border-border" />
            </div>
          )
        }
        if (o.type === "html") {
          return (
            <div
              key={i}
              className="notebook-html px-3 py-2 [&_img]:max-w-full [&_pre]:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: o.html }}
            />
          )
        }
        return (
          <pre key={i} className="whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-xs leading-relaxed text-foreground">
            {formatJsValue(o.data)}
          </pre>
        )
      })}
      {timedOut && (
        <div className="px-3 py-1.5 text-xs text-amber-400">
          {t("outputs.timedOut", { seconds: Math.round(NOTEBOOK_DEFAULT_TIMEOUT_MS / 1000) })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// cell editor bodies
// ─────────────────────────────────────────────────────────────────────────────

const CELL_TOOLBAR_ITEM =
  "rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"

function monacoHeight(source: string): number {
  const lines = (source || "").split("\n").length
  return Math.max(120, Math.min(520, lines * 19 + 28))
}

function CodeCellBody({
  cell,
  readOnly,
  onChange,
}: {
  cell: NotebookCell
  readOnly: boolean
  onChange: (source: string) => void
}) {
  const height = monacoHeight(cell.source)
  return (
    <div className="relative">
      <Suspense
        fallback={
          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Loading editor…
          </div>
        }
      >
        <MonacoEditor
          height={height}
          language="lua"
          theme="vs-dark"
          value={cell.source}
          onChange={(v) => onChange(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 19,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            readOnly,
            renderLineHighlight: "gutter",
            scrollbar: { verticalScrollbarSize: 8 },
          }}
          loading={<div className="text-xs text-muted-foreground">Loading editor…</div>}
          onMount={(editor) => {
            // Never let the browser's spell-check fight with the code editor.
            const node = editor.getDomNode()
            if (node && node.parentElement) node.parentElement.setAttribute("data-spellcheck", "false")
          }}
        />
      </Suspense>
    </div>
  )
}

function MarkdownCellBody({
  cell,
  readOnly,
  preview,
  onChange,
}: {
  cell: NotebookCell
  readOnly: boolean
  preview: boolean
  onChange: (source: string) => void
}) {
  const t = useTranslations("notebookPage")
  if (preview) {
    if (!cell.source.trim()) {
      return (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-6 text-center text-xs text-muted-foreground">
          <FileText className="h-4 w-4" />
          {t("markdown.empty")}
        </div>
      )
    }
    return (
      <div className="prose-notebook px-3 py-2 text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.source}</ReactMarkdown>
      </div>
    )
  }
  return (
    <Textarea
      className="min-h-[96px] resize-y rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed text-foreground outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&:not(:focus)]:ring-0"
      value={cell.source}
      readOnly={readOnly}
      placeholder={t("markdown.placeholder")}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notebook editor
// ─────────────────────────────────────────────────────────────────────────────

export default function NotebookEditor({ provider, readOnly, initialContent, apiRef, onEditorReady }: Props) {
  const t = useTranslations("notebookPage")
  const officeT = useTranslations("officePage")
  const nb = provider.doc.getMap<string>("notebook")
  const nbRef = useRef(nb)
  nbRef.current = nb

  const [synced, setSynced] = useState(provider.isSynced())
  const [seeded, setSeeded] = useState(false)
  const [tick, setTick] = useState(0)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [runAllBusy, setRunAllBusy] = useState(false)
  const [mdPreview, setMdPreview] = useState<Record<string, boolean>>({})
  // In read-only preview the code is hidden — this map lets a viewer reveal it
  const [revealCode, setRevealCode] = useState<Record<string, boolean>>({})

  const runtimeRef = useRef<NotebookRuntime | null>(null)
  const ensureRuntime = useCallback((): NotebookRuntime => {
    if (!runtimeRef.current) runtimeRef.current = createNotebookRuntime()
    return runtimeRef.current
  }, [])

  const cells = useMemo<NotebookCell[]>(
    () => readCells(nb),
    // nb is stable — tick drives re-derivation after map writes/remote events
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb, tick, seeded, synced]
  )

  const anyBusy = runningId != null || runAllBusy

  // ── write helpers (always origin "local" so remote observers skip the echo) ──

  const wcLean = useCallback(
    (cell: NotebookCell) => {
      const map = nbRef.current
      mapSet(
        map,
        `cell:${cell.id}`,
        JSON.stringify({
          id: cell.id,
          type: cell.type,
          language: cell.language,
          source: cell.source,
          executionCount: cell.executionCount,
          metadata: cell.metadata ?? undefined,
        }),
        "local"
      )
    },
    []
  )

  const wcOutputs = useCallback((id: string, outputs: CellOutput[]) => {
    mapSet(nbRef.current, `out:${id}`, JSON.stringify(outputs), "local")
  }, [])

  const writeCells = useCallback((next: NotebookCell[]) => {
    const map = nbRef.current
    const keep = new Set(next.map((c) => c.id))
    for (const key of Array.from(map.keys())) {
      if (!key.startsWith("cell:") && !key.startsWith("out:")) continue
      const id = key.startsWith("cell:") ? key.slice(5) : key.slice(4)
      if (!keep.has(id)) mapDelete(map, key, "local")
    }
    mapSet(map, "order", JSON.stringify(next.map((c) => c.id)), "local")
    for (const c of next) {
      wcLean(c)
      wcOutputs(c.id, c.outputs ?? [])
    }
    setTick((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── collaboration: track remote map changes ──

  useEffect(() => {
    const onSync = () => setSynced(true)
    provider.on("sync", onSync)
    const observer = (event: Y.YMapEvent<string>) => {
      if (event.transaction?.origin === "local") return
      setTick((n) => n + 1)
    }
    nb.observe(observer)
    return () => {
      provider.off("sync", onSync)
      try {
        nb.unobserve(observer)
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  // ── seed from REST snapshot (or a starter cell) once the room is synced ──

  useEffect(() => {
    if (seeded) return
    const hasCollab =
      nb.has("order") || Array.from(nb.keys()).some((k) => k.startsWith("cell:"))
    if (hasCollab) {
      setSeeded(true)
      setTick((n) => n + 1)
      return
    }
    if (!synced) return
    const snap = initialContent ? toSnapshot(initialContent) : null
    if (snap && snap.cells.length) {
      writeCells(snap.cells)
    } else {
      writeCells([
        {
          id: makeCellId(),
          type: "code",
          language: NOTEBOOK_DEFAULT_KERNEL,
          source: 'print("Hello from EcliNotebook!")',
          outputs: [],
          executionCount: null,
          metadata: {},
        },
      ])
    }
    setSeeded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, seeded])

  // ── register the export/import API for the outer shell (thumbnails, REST) ──

  useEffect(() => {
    if (!synced || !seeded) return
    if (apiRef) {
      apiRef.current = {
        kind: "notebook",
        getText: () =>
          readCells(nbRef.current)
            .map((c) => (c.type === "markdown" ? c.source : `In [${c.executionCount ?? " "}]:\n${c.source}`))
            .join("\n\n"),
        getMarkdown: () =>
          readCells(nbRef.current)
            .map((c) =>
              c.type === "markdown"
                ? c.source
                : "```lua\n" + c.source + "\n```"
            )
            .join("\n\n"),
        getJSON: (): NotebookSnapshot => {
          const list = readCells(nbRef.current)
          return { version: 1, cells: list }
        },
        loadJSON: (json) => {
          const snap = toSnapshot(json)
          if (!snap) return
          writeCells(snap.cells)
        },
      }
    }
    onEditorReady?.()
    return () => {
      if (apiRef?.current?.kind === "notebook") apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, seeded])

  useEffect(() => {
    return () => {
      if (apiRef?.current?.kind === "notebook") apiRef.current = null
      try {
        runtimeRef.current?.reset("lua")
      } catch {
        /* ignore */
      }
      runtimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── cell operations ──

  const addCell = useCallback(
    (type: NotebookCell["type"], mode?: "blocks") => {
      if (readOnly) return
      const cell: NotebookCell = {
        id: makeCellId(),
        type,
        language: NOTEBOOK_DEFAULT_KERNEL,
        source: type === "code" ? "" : "",
        outputs: [],
        executionCount: null,
        metadata: mode === "blocks" ? { mode: "blocks", blocks: "[]" } : type === "markdown" ? undefined : {},
      }
      writeCells([...readCells(nbRef.current), cell])
    },
    [readOnly, writeCells]
  )

  const deleteCell = useCallback(
    (id: string) => {
      if (readOnly) return
      writeCells(readCells(nbRef.current).filter((c) => c.id !== id))
      setMdPreview((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
    },
    [readOnly, writeCells]
  )

  const moveCell = useCallback(
    (id: string, dir: -1 | 1) => {
      if (readOnly) return
      const list = readCells(nbRef.current)
      const i = list.findIndex((c) => c.id === id)
      const target = i + dir
      if (i < 0 || target < 0 || target >= list.length) return
      const next = list.slice()
      const [item] = next.splice(i, 1)
      next.splice(target, 0, item)
      writeCells(next)
    },
    [readOnly, writeCells]
  )

  const updateSource = useCallback(
    (id: string, source: string) => {
      if (readOnly) return
      const cell = readCells(nbRef.current).find((c) => c.id === id)
      if (!cell || cell.source === source) return
      wcLean({ ...cell, source })
      setTick((n) => n + 1)
    },
    [readOnly, wcLean]
  )

  const updateMetadata = useCallback(
    (id: string, metadata: Record<string, unknown>) => {
      if (readOnly) return
      const cell = readCells(nbRef.current).find((c) => c.id === id)
      if (!cell) return
      wcLean({ ...cell, metadata })
      setTick((n) => n + 1)
    },
    [readOnly, wcLean]
  )

  const setCellMode = useCallback(
    (id: string, mode: "code" | "blocks") => {
      if (readOnly) return
      const cell = readCells(nbRef.current).find((c) => c.id === id)
      if (!cell || cell.type !== "code") return
      // Blocks are a sub-option of a code cell — flipping the mode keeps the
      // blocks JSON in metadata so the visual stack round-trips.
      updateMetadata(id, { ...(cell.metadata ?? {}), mode })
    },
    [readOnly, updateMetadata]
  )

  const clearCellOutputs = useCallback(
    (id?: string) => {
      if (readOnly) return
      if (id) {
        wcOutputs(id, [])
      } else {
        for (const c of readCells(nbRef.current)) wcOutputs(c.id, [])
      }
      setTick((n) => n + 1)
    },
    [readOnly, wcOutputs]
  )

  const runCellById = useCallback(
    async (id: string) => {
      if (readOnly || anyBusy) return
      const cell = readCells(nbRef.current).find((c) => c.id === id)
      if (!cell || cell.type !== "code") return
      setRunningId(id)
      try {
        const runtime = ensureRuntime()
        const result = await runtime.run(cell.language as NotebookKernelId, cell.source, {
          timeoutMs: NOTEBOOK_DEFAULT_TIMEOUT_MS,
        })
        wcOutputs(id, result.outputs)
        wcLean({ ...cell, outputs: result.outputs, executionCount: (cell.executionCount ?? 0) + 1 })
      } catch (error: any) {
        wcOutputs(id, [
          { type: "error", errorType: error?.name || "Error", traceback: String(error?.message ?? error) },
        ])
      } finally {
        setRunningId(null)
        setTick((n) => n + 1)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, anyBusy, ensureRuntime, wcLean, wcOutputs]
  )

  const runAll = useCallback(async () => {
    if (readOnly || anyBusy) return
    const targets = readCells(nbRef.current).filter((c) => c.type === "code")
    if (!targets.length) return
    setRunAllBusy(true)
    try {
      for (const c of targets) wcOutputs(c.id, [])
      for (const c of targets) {
        const cell = readCells(nbRef.current).find((x) => x.id === c.id)
        if (!cell || cell.type !== "code") continue
        setRunningId(cell.id)
        try {
          const runtime = ensureRuntime()
          const result = await runtime.run(cell.language as NotebookKernelId, cell.source, {
            timeoutMs: NOTEBOOK_DEFAULT_TIMEOUT_MS,
          })
          wcOutputs(cell.id, result.outputs)
          wcLean({ ...cell, outputs: result.outputs, executionCount: (cell.executionCount ?? 0) + 1 })
        } catch (error: any) {
          wcOutputs(cell.id, [
            { type: "error", errorType: error?.name || "Error", traceback: String(error?.message ?? error) },
          ])
        } finally {
          setRunningId(null)
        }
      }
    } finally {
      setRunAllBusy(false)
      setTick((n) => n + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, anyBusy, ensureRuntime, wcLean, wcOutputs])

  const restartKernel = useCallback(() => {
    try {
      ensureRuntime().reset("lua")
    } catch {
      /* ignore */
    }
  }, [ensureRuntime])

  const [restartOpen, setRestartOpen] = useState(false)

  if (!synced) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Connecting to collaborative session…
      </div>
    )
  }

  const canEdit = !readOnly

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Notebook toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("notebook")}</span>
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          {cells.length} {t("cells")}
        </span>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs" onClick={() => runAll()} disabled={!canEdit || anyBusy || cells.filter((c) => c.type === "code").length === 0}>
          {runAllBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {t("toolbar.runAll")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("code")} disabled={!canEdit || cells.length >= NOTEBOOK_CELL_LIMIT}>
          <Code2 className="h-3.5 w-3.5" />
          {t("toolbar.addCode")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("code", "blocks")} disabled={!canEdit || cells.length >= NOTEBOOK_CELL_LIMIT}>
          <Blocks className="h-3.5 w-3.5" />
          {t("toolbar.addBlocks")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("markdown")} disabled={!canEdit || cells.length >= NOTEBOOK_CELL_LIMIT}>
          <FileText className="h-3.5 w-3.5" />
          {t("toolbar.addMarkdown")}
        </Button>

        <span className="mx-0.5 h-4 w-px bg-border" />

        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => clearCellOutputs()} disabled={!canEdit || !cells.some((c) => c.outputs.length > 0)}>
          <Eraser className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{t("toolbar.clearOutputs")}</span>
        </Button>

        <NotebookHelpDialog />

        <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("toolbar.restart")}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("restartConfirm.body")}</AlertDialogTitle>
              <AlertDialogDescription>{t("restartConfirm.description")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{officeT("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setRestartOpen(false)
                  restartKernel()
                }}
              >
                {t("toolbar.restart")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Cells */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cells.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
            <p className="text-xs text-muted-foreground">{t("empty.description")}</p>
            {canEdit && (
              <Button size="sm" variant="outline" className="mt-2 h-7 gap-1 px-2 text-xs" onClick={() => addCell("code")}>
                <Code2 className="h-3.5 w-3.5" /> {t("add.code")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-3 sm:p-4">
            {cells.map((cell, i) => {
              const isBlocks = cell.type === "code" && cell.metadata?.mode === "blocks"
              const running = runningId === cell.id
              const kernelBadge = NOTEBOOK_KERNELS[cell.language as NotebookKernelId]
              // In read-only preview, code/block sources are hidden behind the
              // outputs unless revealed (or there is nothing to show yet).
              const previewCollapsed = cell.type === "code" && !canEdit && cell.outputs.length > 0 && !revealCode[cell.id]
              return (
                <div key={cell.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  {/* Cell chrome header for code + markdown (blocks renders its own) */}
                  {cell.type === "code" && !isBlocks && (
                    <div className="flex items-center gap-1 border-b border-border bg-secondary/20 px-2 py-1">
                      <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                        In [{cell.executionCount ?? " "}]
                      </span>
                      <span className={cn("rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold", NOTEBOOK_KERNELS[cell.language as NotebookKernelId]?.color ?? "text-muted-foreground")}>
                        {NOTEBOOK_KERNELS[cell.language as NotebookKernelId]?.short ?? "LUA"}
                      </span>
                      <CodeModeToggle mode="code" onChange={(m) => setCellMode(cell.id, m)} disabled={!canEdit} />
                      <span className="ml-auto flex items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-2 text-xs"
                          onClick={() => runCellById(cell.id)}
                          disabled={!canEdit || anyBusy}
                        >
                          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          {running ? t("cell.running") : t("cell.run")}
                        </Button>
                        <button className={CELL_TOOLBAR_ITEM} title={t("cell.clearOutputs")} onClick={() => clearCellOutputs(cell.id)} disabled={!canEdit || cell.outputs.length === 0}>
                          <Eraser className="h-3.5 w-3.5" />
                        </button>
                        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveUp")} onClick={() => moveCell(cell.id, -1)} disabled={!canEdit || i === 0}>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveDown")} onClick={() => moveCell(cell.id, 1)} disabled={!canEdit || i === cells.length - 1}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button className={cn(CELL_TOOLBAR_ITEM, "hover:bg-red-500/15 hover:text-red-400")} title={t("cell.delete")} onClick={() => deleteCell(cell.id)} disabled={!canEdit}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Cell body — collapsed to outputs in read-only preview */}
                  {cell.type === "code" && previewCollapsed ? (
                    <>
                      <div className="flex items-center gap-1 border-b border-border bg-secondary/20 px-2 py-1">
                        <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                          In [{cell.executionCount ?? " "}]
                        </span>
                        <span className={cn("rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold", kernelBadge?.color ?? "text-muted-foreground")}>
                          {kernelBadge?.short ?? "LUA"}
                        </span>
                        <span className="ml-auto">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={() => setRevealCode((r) => ({ ...r, [cell.id]: true }))}
                          >
                            <Eye className="h-3 w-3" />
                            {isBlocks ? t("cell.showBlocks") : t("cell.showCode")}
                          </Button>
                        </span>
                      </div>
                      <CellOutputs outputs={cell.outputs} />
                    </>
                  ) : cell.type === "markdown" ? (
                    <>
                      <div className="flex items-center gap-1 border-b border-border bg-secondary/20 px-2 py-1">
                        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                          MD
                        </span>
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={() => setMdPreview((p) => ({ ...p, [cell.id]: !p[cell.id] }))}>
                            {mdPreview[cell.id] ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {mdPreview[cell.id] ? t("markdown.edit") : t("markdown.render")}
                          </Button>
                        )}
                        <span className="ml-auto flex items-center gap-0.5">
                          <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveUp")} onClick={() => moveCell(cell.id, -1)} disabled={!canEdit || i === 0}>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveDown")} onClick={() => moveCell(cell.id, 1)} disabled={!canEdit || i === cells.length - 1}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button className={cn(CELL_TOOLBAR_ITEM, "hover:bg-red-500/15 hover:text-red-400")} title={t("cell.delete")} onClick={() => deleteCell(cell.id)} disabled={!canEdit}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                      <MarkdownCellBody
                        cell={cell}
                        readOnly={!canEdit}
                        preview={!canEdit || !!mdPreview[cell.id]}
                        onChange={(s) => updateSource(cell.id, s)}
                      />
                    </>
                  ) : isBlocks ? (
                    <>
                      <BlockCell
                        cell={cell}
                        readOnly={!canEdit}
                        running={running}
                        runAllBusy={runAllBusy}
                        onRun={() => runCellById(cell.id)}
                        onSource={(s) => updateSource(cell.id, s)}
                        onMetadata={(m) => updateMetadata(cell.id, m)}
                        onClearOutputs={() => clearCellOutputs(cell.id)}
                        onMove={(dir) => moveCell(cell.id, dir)}
                        onDelete={() => deleteCell(cell.id)}
                        onToggleMode={(m) => setCellMode(cell.id, m)}
                      />
                      <CellOutputs outputs={cell.outputs} />
                    </>
                  ) : (
                    <>
                      <CodeCellBody cell={cell} readOnly={!canEdit} onChange={(s) => updateSource(cell.id, s)} />
                      <CellOutputs outputs={cell.outputs} />
                    </>
                  )}
                </div>
              )
            })}

            {canEdit && cells.length < NOTEBOOK_CELL_LIMIT && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5">
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("code")}>
                  <Code2 className="h-3.5 w-3.5" /> {t("add.code")}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("code", "blocks")}>
                  <Blocks className="h-3.5 w-3.5" /> {t("add.blocks")}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => addCell("markdown")}>
                  <FileText className="h-3.5 w-3.5" /> {t("add.markdown")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}