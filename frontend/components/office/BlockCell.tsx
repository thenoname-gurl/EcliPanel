"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LifeBuoy,
  ChevronUp,
  ChevronDown,
  Trash2,
  Play,
  Loader2,
  Blocks,
  Code2,
  Eraser,
  Eye,
  EyeOff,
  Copy,
  RotateCcw,
  Search,
} from "lucide-react"
import {
  BLOCK_CATEGORIES,
  BLOCK_DEFINITIONS,
  blocksToLua,
  getBlockById,
  type BlockDefinition,
  type BlockField,
  type BlockInstance,
} from "@/lib/office/notebook/blocks"

const CELL_TOOLBAR_ITEM =
  "rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"

export function CodeModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: "code" | "blocks"
  onChange: (m: "code" | "blocks") => void
  disabled?: boolean
}) {
  const t = useTranslations("notebookPage")
  const items = [
    { id: "code" as const, label: t("add.code"), icon: <Code2 className="h-3 w-3" /> },
    { id: "blocks" as const, label: t("add.blocks"), icon: <Blocks className="h-3 w-3" /> },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-secondary/70 p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          title={it.label}
          aria-label={it.label}
          onClick={() => !disabled && onChange(it.id)}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-semibold transition",
            !disabled && "hover:text-foreground",
            mode === it.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            disabled && "opacity-60"
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}

function makeBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** Parse the cell source (blocks JSON) into instances; empty/invalid → []. */
export function parseBlocks(source: string): BlockInstance[] {
  const raw = (source ?? "").trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b) => b && typeof b === "object" && typeof b.blockId === "string")
      .map((b) => ({
        id: typeof b.id === "string" ? b.id : makeBlockId(),
        blockId: b.blockId,
        values: b.values && typeof b.values === "object" ? b.values : {},
        enabled: b.enabled === false ? false : true,
      }))
  } catch {
    return []
  }
}

export function blocksToJson(blocks: BlockInstance[]): string {
  return JSON.stringify(blocks)
}

function defaultsFor(def: BlockDefinition | undefined): Record<string, any> {
  const values: Record<string, any> = {}
  if (!def) return values
  for (const f of def.fields) values[f.key] = f.default ?? ""
  return values
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: BlockField
  value: any
  onChange: (v: any) => void
}) {
  if (field.type === "select" && field.options) {
    return (
      <Select value={String(value ?? field.options[0]?.value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === "boolean") {
    return (
      <Checkbox
        checked={value === true || value === "true"}
        onCheckedChange={(v) => onChange(v === true)}
        className="h-4 w-4"
      />
    )
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        className="h-8 text-xs"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    )
  }
  const isBody = field.key === "body" || field.key === "then_blocks" || field.key === "else_blocks"
  if (isBody) {
    return (
      <Textarea
        className="min-h-[64px] resize-y font-mono text-[11px] leading-relaxed"
        value={value !== null && value !== undefined ? String(value) : "[]"}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    )
  }
  return (
    <Input
      className="h-8 text-xs"
      value={value !== null && value !== undefined ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
    />
  )
}

function BlockRow({
  block,
  index,
  onChange,
  onMove,
  onDelete,
  onDuplicate,
  onReset,
  onToggleEnabled,
}: {
  block: BlockInstance
  index: number
  onChange: (values: Record<string, any>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onDuplicate?: () => void
  onReset?: () => void
  onToggleEnabled?: () => void
}) {
  const t = useTranslations("notebookPage")
  const def = getBlockById(block.blockId)
  const actions = onDuplicate && onReset && onToggleEnabled
  if (!def) return null

  const emitted = def.toLua(block.values ?? {}, 0).filter(Boolean).join("   ")
  const disabled = block.enabled === false

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card transition", disabled ? "border-border opacity-55" : "border-border")}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: disabled ? "#64748b" : def.color }}>
        <span className={cn("h-2 w-2 rounded-full bg-white/80", disabled && "bg-white/40")} />
        <span className={cn(disabled && "line-through")}>{def.name}</span>
        <span className="hidden text-[10px] font-normal text-white/70 sm:inline">· {def.description}</span>
        <span className="ml-auto font-mono text-[10px] font-normal text-white/70">#{index + 1}</span>
      </div>
      <div className="space-y-1.5 px-3 py-2">
        {def.fields.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <label className="w-28 shrink-0 text-[11px] font-medium text-muted-foreground">{f.label}</label>
            <div className="min-w-0 flex-1">
              <FieldInput
                field={f}
                value={block.values[f.key]}
                onChange={(v) => onChange({ ...block.values, [f.key]: v })}
              />
            </div>
          </div>
        ))}

        {/* Live Lua preview — shows exactly what this one block emits */}
        <div className="flex items-center gap-1.5 rounded bg-secondary/30 px-2 py-1">
          <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
            Lua
          </span>
          <code
            className={cn("min-w-0 flex-1 truncate font-mono text-[10px] leading-relaxed", disabled ? "text-muted-foreground/60 line-through" : "text-muted-foreground")}
            title={emitted}
          >
            {disabled ? `-- ${emitted}` : emitted}
          </code>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border bg-secondary/20 px-2 py-1">
        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveUp")} onClick={() => onMove(-1)} disabled={index === 0}>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveDown")} onClick={() => onMove(1)}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {actions && (
          <>
            <span className="mx-1 h-3.5 w-px bg-border" />
            <button
              className={cn(CELL_TOOLBAR_ITEM, disabled && "text-foreground")}
              title={disabled ? t("blocks.enable") : t("blocks.disable")}
              onClick={onToggleEnabled}
            >
              {disabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button className={CELL_TOOLBAR_ITEM} title={t("blocks.duplicate")} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button className={CELL_TOOLBAR_ITEM} title={t("blocks.reset")} onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          className={cn(CELL_TOOLBAR_ITEM, "ml-auto hover:bg-red-500/15 hover:text-red-400")}
          title={t("cell.delete")}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

interface BlockCellProps {
  cell: { id: string; type: string; language: string; source: string; outputs?: unknown[]; metadata?: Record<string, unknown> }
  readOnly: boolean
  running: boolean
  runAllBusy: boolean
  onRun: () => void
  onSource: (s: string) => void
  onMetadata: (m: Record<string, unknown>) => void
  onClearOutputs: () => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onToggleMode?: (m: "code" | "blocks") => void
}

export default function BlockCell({
  cell,
  readOnly,
  running,
  runAllBusy,
  onRun,
  onSource,
  onMetadata,
  onClearOutputs,
  onMove,
  onDelete,
  onToggleMode,
}: BlockCellProps) {
  const t = useTranslations("notebookPage")
  // ONE palette state — the visual block stack lives here and is the source of
  // truth for both the Lua we persist into `source` and the JSON we persist into
  // `metadata.blocks`. Seeded from persisted metadata (blocks sub-option of a
  // normal code cell) and kept in sync with the cell.
  const [blocks, setBlocks] = useState<BlockInstance[]>(
    () => (cell.metadata?.blocks !== undefined ? parseBlocks(String(cell.metadata.blocks)) : parseBlocks(cell.source))
  )
  const [showLua, setShowLua] = useState(false)
  const [activeCat, setActiveCat] = useState<string>(BLOCK_CATEGORIES[0]?.id ?? "basics")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (cell.metadata?.blocks !== undefined) setBlocks(parseBlocks(String(cell.metadata.blocks)))
  }, [cell.metadata?.blocks])

  const lua = useMemo(() => blocksToLua(blocks), [blocks])

  // Generate Lua into the cell's `source` + persist block JSON into metadata so
  // the visual stack round-trips (reload / collab / REST snapshot). The generated
  // Lua is REAL Lua: it runs through the exact same kernel path as hand-written
  // code — blocks are just a visual *sub-option* of a normal code cell.
  const update = (next: BlockInstance[]) => {
    setBlocks(next)
    onSource(blocksToLua(next))
    const md = { mode: "blocks", blocks: blocksToJson(next) } as Record<string, unknown>
    onMetadata?.({ ...cell.metadata, ...md })
  }
  const setBlockValues = (id: string, values: Record<string, any>) => {
    update(blocks.map((b) => (b.id === id ? { ...b, values } : b)))
  }
  const moveBlock = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id)
    const target = i + dir
    if (i < 0 || target < 0 || target >= blocks.length) return
    const next = blocks.slice()
    const [item] = next.splice(i, 1)
    next.splice(target, 0, item)
    update(next)
  }
  const deleteBlock = (id: string) => update(blocks.filter((b) => b.id !== id))
  const addBlock = (blockId: string) => {
    const def = getBlockById(blockId)
    if (!def) return
    update([...blocks, { id: makeBlockId(), blockId, values: defaultsFor(def), enabled: true }])
  }
  const duplicateBlock = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    const src = blocks[i]
    const copy: BlockInstance = {
      id: makeBlockId(),
      blockId: src.blockId,
      values: { ...src.values },
      enabled: src.enabled,
    }
    const next = blocks.slice()
    next.splice(i + 1, 0, copy)
    update(next)
  }
  const resetBlock = (id: string) => {
    const b = blocks.find((x) => x.id === id)
    if (!b) return
    update(blocks.map((x) => (x.id === id ? { ...x, values: defaultsFor(getBlockById(b.blockId)) } : x)))
  }
  const toggleBlockEnabled = (id: string) => {
    update(blocks.map((b) => (b.id === id ? { ...b, enabled: b.enabled === false ? true : false } : b)))
  }

  const trimmed = query.trim().toLowerCase()
  const palette = trimmed
    ? BLOCK_DEFINITIONS.filter(
        (d) => d.name.toLowerCase().includes(trimmed) || d.description.toLowerCase().includes(trimmed)
      )
    : BLOCK_DEFINITIONS.filter((d) => d.category === activeCat)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/30 px-2 py-1">
        <CodeModeToggle mode="blocks" onChange={(m) => onToggleMode?.(m)} disabled={readOnly} />
        <span className="ml-1 text-[11px] font-semibold text-muted-foreground">{t("cell.blocks")}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs"
          onClick={onRun}
          disabled={running || runAllBusy}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? t("cell.running") : t("cell.run")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={() => setShowLua((v) => !v)} disabled={readOnly}>
          {showLua ? t("blocks.hideLua") : t("blocks.showLua")}
        </Button>
        <button className={CELL_TOOLBAR_ITEM} title={t("cell.clearOutputs")} onClick={onClearOutputs} disabled={(cell.outputs?.length ?? 0) === 0}>
          <Eraser className="h-3.5 w-3.5" />
        </button>
        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveUp")} onClick={() => onMove(-1)}>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button className={CELL_TOOLBAR_ITEM} title={t("cell.moveDown")} onClick={() => onMove(1)}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button className={cn(CELL_TOOLBAR_ITEM, "hover:bg-red-500/15 hover:text-red-400")} title={t("cell.delete")} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {readOnly ? (
        blocks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("blocks.empty")}</div>
        ) : (
          <div className="space-y-2 px-3 py-3">
            {blocks.map((b, i) => (
              <BlockRow
                key={b.id}
                block={b}
                index={i}
                onChange={() => undefined}
                onMove={() => undefined}
                onDelete={() => undefined}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-0 sm:grid-cols-[230px_1fr]">
          {/* palette */}
          <div className="border-b border-border bg-secondary/20 sm:border-b-0 sm:border-r">
            <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
              {BLOCK_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-semibold transition",
                    !trimmed && activeCat === c.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                  onClick={() => {
                    setActiveCat(c.id)
                    setQuery("")
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("blocks.search")}
                  className="h-7 pl-7 text-[11px]"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {palette.length === 0 && (
                <div className="flex items-center gap-1.5 px-1 py-2 text-[11px] text-muted-foreground">
                  <LifeBuoy className="h-3.5 w-3.5" /> {trimmed ? t("blocks.noMatch") : t("blocks.noBlocks")}
                </div>
              )}
              {palette.map((b) => (
                <button
                  key={b.id}
                  title={`${b.name} — ${b.description}`}
                  className="mb-1 block w-full rounded-md border border-border bg-card px-2 py-1.5 text-left transition hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => addBlock(b.id)}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="truncate text-[11px] font-semibold text-foreground">{b.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate pl-3.5 text-[10px] leading-tight text-muted-foreground">
                    {b.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* stack */}
          <div className="space-y-2 p-3">
            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                {t("blocks.empty")}
              </div>
            ) : (
              blocks.map((b, i) => (
                <BlockRow
                  key={b.id}
                  block={b}
                  index={i}
                  onChange={(values) => setBlockValues(b.id, values)}
                  onMove={(dir) => moveBlock(b.id, dir)}
                  onDelete={() => deleteBlock(b.id)}
                  onDuplicate={() => duplicateBlock(b.id)}
                  onReset={() => resetBlock(b.id)}
                  onToggleEnabled={() => toggleBlockEnabled(b.id)}
                />
              ))
            )}

            {showLua && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border bg-secondary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("blocks.generatedLua")}
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {lua || "-- (no blocks yet)"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}