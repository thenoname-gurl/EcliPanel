"use client"

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  Braces, Settings, PlusCircle as AddIcon, MinusCircle, X, Copy, Check, Loader2, Save,
  FileCode, Sparkles, PlayIcon, Trash2, Moon, GripVertical, Maximize2, FolderOpen,
  MessageSquare, Box, GitBranch, Repeat, Puzzle, Globe, Database, Folder, Cpu, Square,
  Code as CodeIcon, Play, CornerDownLeft, Shield, AlertCircle, Server, Route, Send, Download,
  Mail, Plus, FileText, Save as SaveIcon, Terminal, Calendar, Key, Package, Share2,
  StickyNote, Clock, RefreshCw, List, Search, Eye, Calculator, Link, Shuffle, GitMerge, Layers,
  Tag, MoreHorizontal, ListOrdered, StopCircle, SkipForward, ChevronUp, ChevronDown, ChevronRight,
  Lock, KeyRound, Signature, Dice5, Radio, LogIn, LogOut, Users, ShieldCheck, ClipboardCopy, Library,
  Compass, ArrowRight, CheckCircle, ChevronLeft, Fingerprint,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createPortal } from "react-dom"

// ─── Types ────────────────────────────────────────────────────────────
type BlockField = {
  name: string; label: string; type: "text" | "number" | "select" | "boolean" | "variable" | "expression" | "json"
  default?: string | number | boolean; options?: { label: string; value: string }[]
  placeholder?: string; required?: boolean; helpText?: string
}

type BlockDef = {
  type: string; category: string; name: string; description: string
  color: string; icon: string; canHaveChildren: boolean; childrenLabel?: string
  fields: BlockField[]
}

type Block = {
  id: string; type: string; name: string; config: Record<string, unknown>
  children: Block[]; position: { x: number; y: number }
  collapsed?: boolean
}

type ProjectFile = { id: string; name: string; blocks: Block[] }
type Category = { id: string; name: string; icon: string; color: string; description: string }
type Blueprint = {
  id: number; name: string; description: string
  projectData?: { files: ProjectFile[] }
  latestGeneratedCode: string | null; updatedAt: string
}

type LibraryItem = {
  id: number
  name: string
  description: string | null
  blocks: Block[]
  createdAt: string
  updatedAt: string
}

type DefinitionsResponse = { categories: Category[]; blocks: BlockDef[] }
type GenerateMultiResponse = { files: { name: string; code: string }[] }

// ─── Helpers ──────────────────────────────────────────────────────────
const uid = () => {
  try { return crypto.randomUUID() } catch { return `b${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
}
let _defsCache: BlockDef[] = []
let _catsCache: Category[] = []

const safeArr = <T,>(a: T[] | null | undefined): T[] => (Array.isArray(a) ? a : [])

const DROP_ROOT = "__root__"

const MAX_DEPTH = 200;

function treeFind(blocks: Block[], id: string, _depth = 0): { block: Block; parent: Block | null; index: number } | null {
  if (_depth > MAX_DEPTH) return null
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { block: blocks[i], parent: null, index: i }
    const f = treeFind(safeArr(blocks[i].children), id, _depth + 1)
    if (f) return { ...f, parent: blocks[i] }
  }
  return null
}

function treeRemove(blocks: Block[], id: string, _depth = 0): Block[] {
  if (_depth > MAX_DEPTH) return blocks
  return safeArr(blocks).filter(b => b.id !== id).map(b => ({ ...b, children: treeRemove(safeArr(b.children), id, _depth + 1) }))
}

function treeUpdate(blocks: Block[], id: string, fn: (b: Block) => Block, _depth = 0): Block[] {
  if (_depth > MAX_DEPTH) return blocks
  return safeArr(blocks).map(b => b.id === id ? fn(b) : ({ ...b, children: treeUpdate(safeArr(b.children), id, fn, _depth + 1) }))
}

function treeExtract(blocks: Block[], id: string, _depth = 0): { block: Block | null; tree: Block[] } {
  let found: Block | null = null
  const walk = (list: Block[], d: number): Block[] => {
    if (d > MAX_DEPTH) return list
    const r: Block[] = []
    for (const b of list) {
      if (b.id === id) { found = b; continue }
      r.push({ ...b, children: walk(b.children, d + 1) })
    }
    return r
  }
  return { block: found, tree: walk(blocks, _depth) }
}

function treeMove(blocks: Block[], blockId: string, toParentId: string | null, toIndex: number): Block[] {
  const { block, tree } = treeExtract(blocks, blockId)
  if (!block) return blocks
  const ins = (list: Block[], parentId: string | null, idx: number): Block[] => {
    if (!parentId || parentId === DROP_ROOT) {
      const r = [...list]; r.splice(idx, 0, block); return r
    }
    return list.map(b => b.id === parentId
      ? { ...b, children: ins(b.children, null, idx) }
      : { ...b, children: ins(b.children, parentId, idx) })
  }
  return ins(tree, toParentId, toIndex)
}

function treeUpdateAll(blocks: Block[], fn: (b: Block) => Block): Block[] {
  return safeArr(blocks).map(b => ({ ...fn(b), children: treeUpdateAll(safeArr(b.children), fn) }))
}

function treeSwapChildren(blocks: Block[], parentId: string | null, i: number, j: number): Block[] {
  if (i === j) return blocks
  if (!parentId) {
    const r = [...blocks]
    const tmp = r[i]; r[i] = r[j]; r[j] = tmp
    return r
  }
  return treeUpdate(blocks, parentId, p => {
    const c = [...safeArr(p.children)]
    const tmp = c[i]; c[i] = c[j]; c[j] = tmp
    return { ...p, children: c }
  })
}

function mkBlock(type: string, defs: BlockDef[]): Block {
  const d = defs.find(x => x.type === type)
  const cfg: Record<string, unknown> = {}
  if (d) for (const f of d.fields) if (f.default !== undefined) cfg[f.name] = f.default
  return { id: uid(), type, name: d?.name || type, config: cfg, children: [], position: { x: 100, y: 100 } }
}

// ─── Guide Templates ────────────────────────────────────────────────────
function getBlockExample(type: string, cfg: Record<string, unknown>): string {
  const ex: Record<string, (c: Record<string, unknown>) => string> = {
    print: c => `console.log(${c.label ? `"${c.label}", ` : ''}${c.message ?? '"Hello"'});`,
    wait: c => `await new Promise(r => setTimeout(r, ${(Number(c.seconds) || 1) * 1000}));`,
    create_variable: c => `${c.global ? 'const' : 'let'} ${c.name || 'myVar'}${c.type ? `: ${c.type}` : ''} = ${c.value ?? '0'};`,
    change_variable: c => `${c.name || 'myVar'} = ${c.value ?? 'newValue'};`,
    create_list: c => `${c.global ? 'const' : 'let'} ${c.name || 'myList'} = [${c.items || ''}];`,
    if: c => `if (${c.left ?? 'value'} ${c.comparison === 'equals' ? '==' : c.comparison} ${c.right ?? 'true'}) { ... }`,
    for_each: c => `for (const ${c.itemName || 'item'} of ${c.list || 'myList'}) { ... }`,
    start_server: c => `Bun.serve({ port: ${Number(c.port) || 3000}, fetch(req) { ... } });`,
    fetch_url: c => `const response = await fetch(${c.url ?? '"https://..."'});`,
    hash_text: c => {
      const alg = String(c.algorithm || 'sha256')
      if (alg === 'wyhash') return `const hash = Bun.hash(${c.input ?? 'data'});`
      if (alg === 'bun_password') return `const hash = await Bun.password.hash(${c.input ?? 'data'});`
      return `const hash = new Bun.CryptoHasher("${alg}").update(${c.input ?? 'data'}).digest("hex");`
    },
    encrypt_text: c => `const encrypted = createCipheriv("aes-256-cbc", key, iv).update(${c.input ?? 'data'});`,
    send_email: c => `await ${c.transport || 'transporter'}.sendMail({ to: ${c.to ?? '"user@..."'}, ... });`,
    connect_database: c => `const ${c.name || 'db'} = new Database("${c.connection || './data.db'}");`,
    db_find: c => `const results = db.query("SELECT * FROM ${c.table || 'table'}").all();`,
    start_ws_server: c => `Bun.serve({ port: ${Number(c.port) || 8080}, websocket: { ... } });`,
    csrf_token: c => `const token = Bun.CSRF.generate("${c.secret || 'secret'}");`,
    custom_code: () => `// Your custom TypeScript code goes here`,
    comment: c => `// ${c.text || 'Your comment'}`,
  }
  const fn = ex[type]
  return fn ? fn(cfg) : `// ${type} → generates Bun/TypeScript code`
}
type GuideStep = {
  title: string
  description: string
  action: string
  target: string
  blocks: { type: string; cfg?: Record<string, unknown>; children?: { type: string; cfg?: Record<string, unknown> }[] }[]
}

type GuideTemplate = {
  id: string
  name: string
  description: string
  icon: string
  color: string
  steps: GuideStep[]
}

const GUIDE_TEMPLATES: GuideTemplate[] = [
  {
    id: "rest-api", name: "REST API Server", description: "HTTP server with JSON routes",
    icon: "Server", color: "#0ea5e9",
    steps: [
      { title: "Start HTTP Server", description: "This block creates a Bun.serve web server listening on a port.", action: "Click the block below to add it to your canvas", target: "palette-block-start_server", blocks: [{ type: "start_server", cfg: { port: 3000 } }] },
      { title: "Add a GET Route", description: "A route handles incoming HTTP requests by method + path.", action: "Drag a Route block into the server block on the canvas", target: "canvas-dropzone", blocks: [{ type: "route", cfg: { method: "GET", path: "/hello" } }] },
      { title: "Send JSON Response", description: "Reply to the client with a JSON payload.", action: "Add a Send Response block inside the route", target: "canvas-dropzone", blocks: [{ type: "send_response", cfg: { type: "json", data: '{ message: "Hello World" }', status: "200" } }] },
      { title: "Generate Code", description: "Click Generate to compile your blocks into runnable Bun code.", action: "Press the Generate button in the toolbar", target: "btn-generate", blocks: [] },
    ],
  },
  {
    id: "ws-chat", name: "WebSocket Chat", description: "Real-time bidirectional messaging",
    icon: "Radio", color: "#06b6d4",
    steps: [
      { title: "Start WebSocket Server", description: "Create a Bun WS server that handles real-time connections.", action: "Add a WebSocket Server block to the canvas", target: "palette-block-start_ws_server", blocks: [{ type: "start_ws_server", cfg: { port: 8080 } }] },
      { title: "Handle Messages", description: "Listen for incoming WS messages from clients.", action: "Drag an On Message handler inside the WS server", target: "canvas-dropzone", blocks: [{ type: "ws_on_message" }] },
      { title: "Broadcast Replies", description: "Send the received message to all connected clients.", action: "Add a Broadcast block inside On Message", target: "canvas-dropzone", blocks: [{ type: "ws_broadcast", cfg: { server: "server", data: "message" } }] },
      { title: "Generate Code", description: "Build your WebSocket server code.", action: "Press Generate in the toolbar", target: "btn-generate", blocks: [] },
    ],
  },
  {
    id: "db-crud", name: "Database CRUD", description: "SQLite with create, read, update, delete",
    icon: "Database", color: "#f97316",
    steps: [
      { title: "Connect Database", description: "Open a SQLite database file so you can run queries.", action: "Add a Connect Database block", target: "palette-block-connect_database", blocks: [{ type: "connect_database", cfg: { type: "sqlite", connection: "./data.db", name: "db" } }] },
      { title: "Insert Data", description: "Add a record to the users table.", action: "Add an Insert block after the connection", target: "canvas-dropzone", blocks: [{ type: "db_add", cfg: { driver: "sqlite", db: "db", table: "users", data: '{ name: "Alice", age: 30 }' } }] },
      { title: "Query Data", description: "Retrieve all records from the table.", action: "Add a Find block to read the data back", target: "canvas-dropzone", blocks: [{ type: "db_find", cfg: { driver: "sqlite", db: "db", table: "users", where: "", saveTo: "users" } }] },
      { title: "Generate Code", description: "Compile your database CRUD operations.", action: "Click Generate", target: "btn-generate", blocks: [] },
    ],
  },
  {
    id: "email", name: "Email Notifier", description: "Send emails via SMTP",
    icon: "Mail", color: "#ec4899",
    steps: [
      { title: "Create SMTP Transport", description: "Configure your SMTP server connection once, reuse everywhere.", action: "Add a Create SMTP Transport block", target: "palette-block-create_smtp_transport", blocks: [{ type: "create_smtp_transport", cfg: { name: "transporter", host: "smtp.gmail.com", port: 587, secure: false, user: "you@gmail.com", pass: "app-password" } }] },
      { title: "Send an Email", description: "Reference the shared transport to send a message.", action: "Add a Send Email block below the transport", target: "canvas-dropzone", blocks: [{ type: "send_email", cfg: { transport: "transporter", to: '"user@example.com"', subject: '"Hello"', body: '"Message"' } }] },
      { title: "Generate Code", description: "Compile your email sender.", action: "Click Generate", target: "btn-generate", blocks: [] },
    ],
  },
  {
    id: "scheduled", name: "Scheduled Worker", description: "Run code on a timer",
    icon: "Clock", color: "#f59e0b",
    steps: [
      { title: "Add Schedule Block", description: "Run code on an interval — useful for background tasks.", action: "Add a Schedule block to the canvas", target: "palette-block-schedule", blocks: [{ type: "schedule", cfg: { type: "interval", seconds: 60 } }] },
      { title: "Add Work Block", description: "Drag a Print or other action block inside the schedule.", action: "Drag blocks into the Schedule container on the canvas", target: "canvas-dropzone", blocks: [{ type: "print", cfg: { message: '"Scheduled task running..."' } }] },
      { title: "Generate Code", description: "Compile your scheduled worker.", action: "Click Generate", target: "btn-generate", blocks: [] },
    ],
  },
  {
    id: "crypto", name: "Encryption & Hashing", description: "Hash passwords, encrypt data, sign messages",
    icon: "Shield", color: "#06b6d4",
    steps: [
      { title: "Hash a Password", description: "Use Bun's built-in password hashing (argon2id).", action: "Add a Hash Text block and choose 'Bun Password'", target: "palette-block-hash_text", blocks: [{ type: "hash_text", cfg: { algorithm: "bun_password", input: '"my-secret-password"', saveTo: "hash" } }] },
      { title: "Generate Encryption Key", description: "Create a random AES-256 key + IV for encryption.", action: "Add a Generate Key block", target: "palette-block-generate_key", blocks: [{ type: "generate_key", cfg: { saveKeyTo: "encKey", saveIvTo: "encIv" } }] },
      { title: "Encrypt Text", description: "Encrypt sensitive data with the generated key.", action: "Add an Encrypt Text block referencing the key", target: "palette-block-encrypt_text", blocks: [{ type: "encrypt_text", cfg: { input: '"sensitive data"', saveTo: "encrypted" } }] },
      { title: "Generate Code", description: "Compile your crypto pipeline.", action: "Click Generate", target: "btn-generate", blocks: [] },
    ],
  },
]

function GuideOverlay({ open, onOpenChange, defs, onBuild }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  defs: BlockDef[]
  onBuild: (blocks: Block[]) => void
}) {
  const [step, setStep] = useState(0)
  const [tmplIdx, setTmplIdx] = useState<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback((targetId: string) => {
    // If targeting a palette block, dispatch event so main page navigates to it
    const blockMatch = targetId.match(/^palette-block-(.+)$/)
    if (blockMatch) {
      window.dispatchEvent(new CustomEvent("guide-navigate", { detail: { type: blockMatch[1] } }))
    }
    const el = document.querySelector(`[data-guide-id="${targetId}"]`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  useEffect(() => {
    if (!open || tmplIdx === null) return
    const target = GUIDE_TEMPLATES[tmplIdx].steps[step]?.target
    if (target) {
      const timer = setTimeout(() => updatePosition(target), 100)
      return () => clearTimeout(timer)
    }
  }, [open, tmplIdx, step, updatePosition])

  useEffect(() => {
    if (!open || tmplIdx === null) return
    const handleResize = () => {
      const target = GUIDE_TEMPLATES[tmplIdx].steps[step]?.target
      if (target) updatePosition(target)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [open, tmplIdx, step, updatePosition])

  const buildTemplate = () => {
    if (tmplIdx === null) return
    const tmpl = GUIDE_TEMPLATES[tmplIdx]
    const blocks: Block[] = []
    for (const s of tmpl.steps) {
      for (const b of s.blocks) {
        const d = defs.find(x => x.type === b.type)
        if (!d) continue
        const block = mkBlock(b.type, defs)
        if (b.cfg) Object.assign(block.config, b.cfg)
        if (b.children) {
          for (const ch of b.children) {
            const cd = defs.find(x => x.type === ch.type)
            if (!cd) continue
            const child = mkBlock(ch.type, defs)
            if (ch.cfg) Object.assign(child.config, ch.cfg)
            block.children.push(child)
          }
        }
        blocks.push(block)
      }
    }
    onBuild(blocks)
    onOpenChange(false)
  }

  if (!open) return null

  // Template picker (shown before tour starts)
  if (tmplIdx === null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-purple-400" />
              Interactive Guide
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {GUIDE_TEMPLATES.map((t, i) => (
              <button key={t.id} onClick={() => { setTmplIdx(i); setStep(0); setCompleted(false) }}
                className="flex flex-col items-start gap-1.5 p-3 border border-border/30 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-left">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center text-xs font-bold" style={{ backgroundColor: t.color + "20", color: t.color }}>
                    <BlockIcon icon={t.icon} className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium">{t.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{t.description}</p>
                <span className="text-[9px] text-muted-foreground/50">{t.steps.length} steps</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Tour overlay
  const tmpl = GUIDE_TEMPLATES[tmplIdx]
  const s = tmpl.steps[step]
  const isLast = step === tmpl.steps.length - 1
  const hasBlocks = s.blocks.length > 0

  const tooltipW = 320
  const tooltipH = 220
  const gap = 10
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Determine best side: right, left, below, above (in order of preference)
  const fitsRight = pos.left + pos.width + gap + tooltipW + 16 <= vw
  const fitsLeft = pos.left - gap - tooltipW >= 16
  const fitsBelow = pos.top + pos.height + gap + tooltipH <= vh
  const fitsAbove = pos.top - gap - tooltipH >= 0

  let side: "right" | "left" | "below" | "above"
  if (fitsRight) side = "right"
  else if (fitsLeft) side = "left"
  else if (fitsBelow) side = "below"
  else if (fitsAbove) side = "above"
  else side = "right"

  let tp = 0, lf = 0
  switch (side) {
    case "right":
      tp = Math.min(pos.top + pos.height / 2 - tooltipH / 2, vh - tooltipH - 16)
      tp = Math.max(16, tp)
      lf = pos.left + pos.width + gap
      break
    case "left":
      tp = Math.min(pos.top + pos.height / 2 - tooltipH / 2, vh - tooltipH - 16)
      tp = Math.max(16, tp)
      lf = pos.left - gap - tooltipW
      break
    case "below":
      tp = pos.top + pos.height + gap
      lf = pos.left + pos.width / 2 - tooltipW / 2
      break
    case "above":
      tp = pos.top - gap - tooltipH
      lf = pos.left + pos.width / 2 - tooltipW / 2
      break
  }
  // Clamp to viewport
  lf = Math.max(8, Math.min(lf, vw - tooltipW - 8))

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[9999]" style={{ pointerEvents: "none" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" style={{ pointerEvents: "auto" }} onClick={() => onOpenChange(false)} />
      {/* Highlight ring around target */}
      {pos.width > 0 && (
        <div className="absolute border-2 border-purple-500 shadow-[0_0_0_4px_rgba(168,85,247,0.3),0_0_20px_rgba(168,85,247,0.15)] transition-all duration-300"
          style={{ top: pos.top - 4, left: pos.left - 4, width: pos.width + 8, height: pos.height + 8, pointerEvents: "none" }} />
      )}
      {/* Tooltip */}
      <div ref={tooltipRef} className="absolute bg-background border border-border/50 shadow-2xl p-4 transition-all duration-200"
        style={{ top: tp, left: lf, width: tooltipW, pointerEvents: "auto" }}>
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[9px] font-bold">
              {step + 1}
            </div>
            <span className="text-[10px] text-muted-foreground/70">Step {step + 1} of {tmpl.steps.length}</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-0.5 rounded hover:bg-muted/30 text-muted-foreground/50 hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1 bg-muted/30 rounded-full mb-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${completed ? "bg-green-500" : "bg-purple-500"}`}
            style={{ width: completed ? "100%" : `${((step + 1) / tmpl.steps.length) * 100}%` }}
          />
        </div>
        {completed ? (
          <div className="py-1 text-center space-y-2">
            <CheckCircle className="h-8 w-8 mx-auto text-green-400" />
            <h4 className="text-sm font-semibold">Guide Complete!</h4>
            <p className="text-[11px] text-muted-foreground">You finished the "{tmpl.name}" walkthrough.</p>
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => { setTmplIdx(null); setCompleted(false); setStep(0) }}>
                <Compass className="h-3 w-3 mr-1" />Pick Another Guide
              </Button>
            </div>
          </div>
        ) : (
        <><h4 className="text-sm font-semibold mb-1">{s.title}</h4>
        {/* Description */}
        <p className="text-[11px] text-muted-foreground mb-2">{s.description}</p>
        {/* Action callout */}
        <div className="flex items-start gap-1.5 p-2 bg-purple-500/5 border border-purple-500/15 mb-3">
          <ArrowRight className="h-3 w-3 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-purple-300/90 leading-relaxed">{s.action}</p>
        </div>
        {/* Block badges */}
        {hasBlocks && (
          <div className="flex flex-wrap gap-1 mb-3">
            {s.blocks.map((b, bi) => {
              const d = defs.find(x => x.type === b.type)
              return (
                <span key={bi} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/20 text-[9px] text-muted-foreground/70 border border-border/20">
                  {d && <BlockIcon icon={d.icon} className="h-2.5 w-2.5" />}
                  {d?.name || b.type}
                </span>
              )
            })}
          </div>
        )}</>
        )}
        {/* Navigation */}
        <div className="flex items-center justify-between pt-1 border-t border-border/20">
          <div className="flex gap-1">
            {step > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-3 w-3 mr-1" />Back
              </Button>
            )}
          </div>
          <div className="flex gap-1">
            {hasBlocks && (
              <Button variant="outline" size="sm" className="h-7 text-[10px] px-2"
                onClick={() => { buildTemplate(); onOpenChange(false) }}>
                <Sparkles className="h-3 w-3 mr-1" />Build
              </Button>
            )}
            {isLast ? (
              completed ? (
                <Button size="sm" className="h-7 text-[10px] px-3" onClick={() => onOpenChange(false)}>
                  <X className="h-3 w-3 mr-1" />Close
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-[10px] px-3" onClick={() => setCompleted(true)}>
                  <CheckCircle className="h-3 w-3 mr-1" />Finish
                </Button>
              )
            ) : (
              <Button size="sm" className="h-7 text-[10px] px-3" onClick={() => setStep(step + 1)}>
                Next <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

type ValidationSeverity = "error" | "warning"

type ValidationIssue = {
  severity: ValidationSeverity
  message: string
  blockId?: string
  field?: string
}

type ValidationReport = {
  issues: ValidationIssue[]
  blockIssues: Record<string, ValidationIssue[]>
  hasErrors: boolean
}

const EMPTY_VALIDATION: ValidationReport = {
  issues: [],
  blockIssues: {},
  hasErrors: false,
}

type ParsedParam = {
  name: string
  type?: string
}

type ParsedHandlerParam = ParsedParam & {
  optional?: boolean
}

const IDENTIFIER_RE = /^[$A-Z_a-z][$\w$]*$/
const TOP_LEVEL_RESERVED = new Set([
  "Bun",
  "Buffer",
  "crypto",
  "nodemailer",
  "server",
  "transporter",
  "request",
  "url",
  "method",
])

function addValidationIssue(target: ValidationIssue[], issue: ValidationIssue, blockIssues: Record<string, ValidationIssue[]>) {
  target.push(issue)
  if (issue.blockId) {
    if (!blockIssues[issue.blockId]) blockIssues[issue.blockId] = []
    blockIssues[issue.blockId].push(issue)
  }
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "").trim()
}

function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_RE.test(value)
}

function splitTopLevelArgs(raw: string): string[] {
  const out: string[] = []
  let current = ""
  let depth = 0
  let quote: string | null = null

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const prev = raw[i - 1]

    if (quote) {
      current += ch
      if (ch === quote && prev !== "\\") quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      current += ch
      continue
    }

    if (ch === "(" || ch === "[" || ch === "{") depth++
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1)

    if (ch === "," && depth === 0) {
      if (current.trim()) out.push(current.trim())
      current = ""
      continue
    }

    current += ch
  }

  if (current.trim()) out.push(current.trim())
  return out
}

function inferLiteralType(expr: string): string | null {
  const value = expr.trim()
  if (!value) return null
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith("`") && value.endsWith("`"))) return "string"
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number"
  if (value === "true" || value === "false") return "boolean"
  if (value === "null") return "null"
  if (value === "undefined") return "undefined"
  if (value.startsWith("[") && value.endsWith("]")) return "array"
  if (value.startsWith("{") && value.endsWith("}")) return "object"
  if (/^new\s+\w+\(/.test(value)) return "object"
  return null
}

function normalizeExpectedToken(token: string): string {
  return token.trim().toLowerCase()
}

function isTypeCompatible(actual: string | null, expectedRaw: string): boolean {
  if (!expectedRaw.trim()) return true
  if (!actual) return true
  const tokens = expectedRaw.split("|").map(normalizeExpectedToken).filter(Boolean)
  if (tokens.length === 0) return true

  return tokens.some(token => {
    if (token === "any" || token === "unknown" || token === "never") return true
    if (token === actual) return true
    if (token.endsWith("[]")) return actual === "array"
    if (token === "string") return actual === "string"
    if (token === "number") return actual === "number"
    if (token === "boolean") return actual === "boolean"
    if (token === "array") return actual === "array"
    if (token === "object") return actual === "object"
    if (token === "null") return actual === "null"
    if (token === "undefined") return actual === "undefined"
    return false
  })
}

function parseFunctionParams(raw: string): ParsedParam[] {
  return splitTopLevelArgs(raw)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const colonIdx = part.indexOf(":")
      if (colonIdx > 0) {
        return {
          name: part.slice(0, colonIdx).trim(),
          type: part.slice(colonIdx + 1).trim() || undefined,
        }
      }
      return { name: part }
    })
}

function parseHandlerParams(raw: unknown): ParsedHandlerParam[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item: any) => ({
        name: String(item?.name ?? "").trim(),
        type: String(item?.type ?? "").trim() || undefined,
        optional: Boolean(item?.optional),
      }))
      .filter(item => item.name)
  } catch {
    return []
  }
}

function getDeclaredNames(block: Block): Array<{ name: string; kind: "const" | "let" | "function" | "import" }> {
  const cfg = block.config || {}
  const names: Array<{ name: string; kind: "const" | "let" | "function" | "import" }> = []

  switch (block.type) {
    case "create_variable":
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: cfg.global ? "const" : "let" })
      break
    case "create_list":
    case "create_object":
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: cfg.global ? "const" : "let" })
      break
    case "create_function":
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: "function" })
      break
    case "define_handler":
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: "function" })
      break
    case "create_smtp_transport":
      names.push({ name: normalizeIdentifier(cfg.name || "transporter"), kind: "const" })
      break
    case "connect_database":
    case "connect_redis":
    case "connect_mongodb":
    case "connect_typeorm":
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: "const" })
      break
    case "get_from_list":
    case "math":
    case "text_join":
    case "random_number":
    case "run_function":
    case "invoke_handler":
    case "fetch_url":
    case "get_env":
    case "read_file":
    case "write_file":
    case "list_files":
    case "generate_uuid":
    case "hash_text":
    case "hash_verify":
    case "random_bytes":
    case "encrypt_text":
    case "decrypt_text":
    case "generate_key":
    case "sign_hmac":
    case "verify_hmac":
    case "csrf_token":
    case "csrf_verify":
    case "redis_get":
    case "mongo_find":
    case "orm_find":
    case "orm_save":
    case "orm_update":
    case "orm_delete":
      for (const key of ["saveTo", "saveKeyTo", "saveIvTo"] as const) {
        if (cfg[key]) names.push({ name: normalizeIdentifier(cfg[key]), kind: "const" })
      }
      break
  }

  if (block.type === "import_file") {
    const importType = String(cfg.importType || "named")
    if (importType !== "side-effect" && cfg.what) {
      const whatStr = String(cfg.what)
      const importNames = whatStr.split(",").map(s => normalizeIdentifier(s.trim())).filter(Boolean)
      importNames.forEach(name => names.push({ name, kind: "import" }))
    }
  }

  return names.filter(item => item.name)
}

function getReservedNamesForBlock(block: Block): string[] {
  const cfg = block.config || {}
  switch (block.type) {
    case "run_in_background":
      return []
    case "start_server":
    case "start_ws_server":
      return ["server"]
    case "send_email":
      return ["transporter"]
    case "connect_database": {
      const type = String(cfg.type || "sqlite")
      if (type === "sqlite") return ["Database"]
      if (type === "postgres") return ["postgres"]
      return ["mysql"]
    }
    case "connect_redis":
      return ["Redis"]
    case "connect_mongodb":
      return ["MongoClient"]
    case "connect_typeorm":
      return ["DataSource"]
    default:
      return []
  }
}

function collectValidation(files: ProjectFile[]): ValidationReport {
  const issues: ValidationIssue[] = []
  const blockIssues: Record<string, ValidationIssue[]> = {}
  const seenTopLevelPerFile = new Map<string, Map<string, { blockId: string; kind: string }>>()
  const functionDefs = new Map<string, { blockId: string; params: ParsedParam[]; fileId?: string }>()
  const handlerDefs = new Map<string, { blockId: string; params: ParsedHandlerParam[]; fileId?: string }>()
  const functionLocalScopes = new Map<string, Set<string>>()
  const handlerLocalScopes = new Map<string, Set<string>>()
  const transportVars = new Set<string>()
  const dbConnectors = new Set<string>()
  const redisConnectors = new Set<string>()
  const mongoConnectors = new Set<string>()
  const ormConnectors = new Set<string>()
  const blockToFile = new Map<string, string>()

  const visit = (block: Block, currentFileId: string, parentFunctionId?: string, parentHandlerId?: string) => {
    blockToFile.set(block.id, currentFileId)
    const declared = getDeclaredNames(block)
    const reserved = new Set<string>([...TOP_LEVEL_RESERVED, ...getReservedNamesForBlock(block)])

    for (const declaredItem of declared) {
      const name = declaredItem.name
      const kind = declaredItem.kind

      if (!isValidIdentifier(name)) {
        addValidationIssue(issues, {
          severity: "error",
          blockId: block.id,
          field: "name",
          message: `"${name}" is not a valid JavaScript identifier.`,
        }, blockIssues)
        continue
      }

      if (reserved.has(name)) {
        addValidationIssue(issues, {
          severity: "error",
          blockId: block.id,
          field: "name",
          message: `"${name}" is reserved by generated imports or runtime code.`,
        }, blockIssues)
      }

      if (parentFunctionId) {
        const funcScope = functionLocalScopes.get(parentFunctionId)
        if (funcScope?.has(name)) {
          addValidationIssue(issues, {
            severity: "error",
            blockId: block.id,
            field: "name",
            message: `"${name}" is already used by a declaration within this function scope.`,
          }, blockIssues)
        } else if (kind !== "function") {
          functionLocalScopes.get(parentFunctionId)?.add(name)
        }
      } else if (parentHandlerId) {
        const handlerScope = handlerLocalScopes.get(parentHandlerId)
        if (handlerScope?.has(name)) {
          addValidationIssue(issues, {
            severity: "error",
            blockId: block.id,
            field: "name",
            message: `"${name}" is already used by a declaration within this handler scope.`,
          }, blockIssues)
        } else if (kind !== "function") {
          handlerLocalScopes.get(parentHandlerId)?.add(name)
        }
      } else {
        if (!seenTopLevelPerFile.has(currentFileId)) {
          seenTopLevelPerFile.set(currentFileId, new Map())
        }
        const fileScope = seenTopLevelPerFile.get(currentFileId)!

        if (kind === "import") {
          fileScope.set(name, { blockId: block.id, kind })
        } else {
          const prev = fileScope.get(name)
          if (prev) {
            addValidationIssue(issues, {
              severity: "error",
              blockId: block.id,
              field: "name",
              message: `"${name}" is already used by a ${prev.kind} declaration.`,
            }, blockIssues)
            addValidationIssue(issues, {
              severity: "error",
              blockId: prev.blockId,
              field: "name",
              message: `"${name}" conflicts with another declaration.`,
            }, blockIssues)
          } else {
            fileScope.set(name, { blockId: block.id, kind })
          }
        }
      }
    }

    if (block.type === "create_function") {
      const name = normalizeIdentifier(block.config.name)
      if (name) {
        functionDefs.set(name, { blockId: block.id, params: parseFunctionParams(String(block.config.inputs || "")), fileId: currentFileId })
        functionLocalScopes.set(block.id, new Set())
      }
    }

    if (block.type === "define_handler") {
      const name = normalizeIdentifier(block.config.name)
      if (name) {
        handlerDefs.set(name, { blockId: block.id, params: parseHandlerParams(block.config.params), fileId: currentFileId })
        handlerLocalScopes.set(block.id, new Set())
      }
    }

    if (block.type === "create_smtp_transport") {
      transportVars.add(currentFileId + ":" + normalizeIdentifier(block.config.name || "transporter"))
    }

    if (block.type === "connect_database") {
      dbConnectors.add(currentFileId + ":" + normalizeIdentifier(block.config.name || "db"))
    }
    if (block.type === "connect_redis") {
      redisConnectors.add(currentFileId + ":" + normalizeIdentifier(block.config.name || "redis"))
    }
    if (block.type === "connect_mongodb") {
      mongoConnectors.add(currentFileId + ":" + normalizeIdentifier(block.config.name || "mongo"))
    }
    if (block.type === "connect_typeorm") {
      ormConnectors.add(currentFileId + ":" + normalizeIdentifier(block.config.name || "AppDataSource"))
    }

    const nextFnId = block.type === "create_function" ? block.id : parentFunctionId
    const nextHandlerId = block.type === "define_handler" ? block.id : parentHandlerId
    safeArr(block.children).forEach(child => visit(child, currentFileId, nextFnId, nextHandlerId))
  }

  files.forEach(file => safeArr(file.blocks).forEach(block => visit(block, file.id)))

  const validateCall = (block: Block) => {
    if (block.type === "run_function") {
      const fnName = normalizeIdentifier(block.config.name)
      const fn = functionDefs.get(fnName)
      if (!fn) {
        addValidationIssue(issues, {
          severity: "error",
          blockId: block.id,
          field: "name",
          message: `Function "${fnName}" is not defined.`,
        }, blockIssues)
      } else {
        const args = splitTopLevelArgs(String(block.config.inputs || "")).filter(Boolean)
        if (args.length !== fn.params.length) {
          addValidationIssue(issues, {
            severity: "error",
            blockId: block.id,
            field: "inputs",
            message: `Function "${fnName}" expects ${fn.params.length} argument(s), got ${args.length}.`,
          }, blockIssues)
        }
        fn.params.forEach((param, index) => {
          if (!param.type) return
          const argExpr = args[index]
          if (!argExpr) return
          const actual = inferLiteralType(argExpr)
          if (!isTypeCompatible(actual, param.type || "")) {
            addValidationIssue(issues, {
              severity: "error",
              blockId: block.id,
              field: "inputs",
              message: `Argument ${index + 1} for "${fnName}" expects ${param.type}, got ${actual || "an unknown expression"}.`,
            }, blockIssues)
          }
        })
      }
    }

    if (block.type === "invoke_handler") {
      const handlerName = normalizeIdentifier(block.config.name)
      const handler = handlerDefs.get(handlerName)
      if (!handler) {
        addValidationIssue(issues, {
          severity: "error",
          blockId: block.id,
          field: "name",
          message: `Handler "${handlerName}" is not defined.`,
        }, blockIssues)
      } else {
        handler.params.forEach((param, index) => {
          const argExpr = block.config[`arg_${param.name}`]
          if ((argExpr === undefined || argExpr === "") && !param.optional) {
            addValidationIssue(issues, {
              severity: "error",
              blockId: block.id,
              field: `arg_${param.name}`,
              message: `Missing argument "${param.name}" for handler "${handlerName}".`,
            }, blockIssues)
            return
          }
          if (!param.type || argExpr === undefined || argExpr === "") return
          const actual = inferLiteralType(String(argExpr))
          if (!isTypeCompatible(actual, param.type || "")) {
            addValidationIssue(issues, {
              severity: "error",
              blockId: block.id,
              field: `arg_${param.name}`,
              message: `Argument "${param.name}" expects ${param.type}, got ${actual || "an unknown expression"}.`,
            }, blockIssues)
          }
        })
      }
    }

    if (block.type === "create_variable") {
      const expected = String(block.config.type || "").trim()
      const value = String(block.config.value ?? "")
      const actual = inferLiteralType(value)
      if (expected && actual && !isTypeCompatible(actual, expected)) {
        addValidationIssue(issues, {
          severity: "error",
          blockId: block.id,
          field: "value",
          message: `Variable "${String(block.config.name || "")}" expects ${expected}, got ${actual}.`,
        }, blockIssues)
      }
    }

    safeArr(block.children).forEach(validateCall)
  }

  const checkTransport = (block: Block) => {
    if (block.type === "send_email" && !String(block.config.smtpHost || "").trim()) {
      const transportName = normalizeIdentifier(block.config.transport || "transporter")
      const fileId = blockToFile.get(block.id) || ""
      if (!transportVars.has(fileId + ":" + transportName)) {
        addValidationIssue(issues, {
          severity: "warning",
          blockId: block.id,
          field: "transport",
          message: `Transport "${transportName}" is not defined. Add a "Create SMTP Transport" block with name "${transportName}".`,
        }, blockIssues)
      }
    }
    safeArr(block.children).forEach(checkTransport)
  }

  const checkDatabaseRefs = (block: Block) => {
    if (block.type === "db_find" || block.type === "db_add" || block.type === "db_update" || block.type === "db_delete") {
      const dbName = normalizeIdentifier(block.config.db || "db")
      const fileId = blockToFile.get(block.id) || ""
      if (!dbConnectors.has(fileId + ":" + dbName)) {
        addValidationIssue(issues, {
          severity: "warning",
          blockId: block.id,
          field: "db",
          message: `Database connector "${dbName}" not found. Add a "Connect to Database" block with name "${dbName}".`,
        }, blockIssues)
      }
    }
    safeArr(block.children).forEach(checkDatabaseRefs)
  }

  const checkRedisRefs = (block: Block) => {
    if (block.type === "redis_set" || block.type === "redis_get" || block.type === "redis_del") {
      const clientName = normalizeIdentifier(block.config.client || "redis")
      const fileId = blockToFile.get(block.id) || ""
      if (!redisConnectors.has(fileId + ":" + clientName)) {
        addValidationIssue(issues, {
          severity: "warning",
          blockId: block.id,
          field: "client",
          message: `Redis client "${clientName}" not found. Add a "Connect to Redis" block with name "${clientName}".`,
        }, blockIssues)
      }
    }
    safeArr(block.children).forEach(checkRedisRefs)
  }

  const checkMongoRefs = (block: Block) => {
    if (block.type === "mongo_find" || block.type === "mongo_insert" || block.type === "mongo_update" || block.type === "mongo_delete") {
      const clientName = normalizeIdentifier(block.config.client || "mongo")
      const fileId = blockToFile.get(block.id) || ""
      if (!mongoConnectors.has(fileId + ":" + clientName)) {
        addValidationIssue(issues, {
          severity: "warning",
          blockId: block.id,
          field: "client",
          message: `MongoDB client "${clientName}" not found. Add a "Connect to MongoDB" block with name "${clientName}".`,
        }, blockIssues)
      }
    }
    safeArr(block.children).forEach(checkMongoRefs)
  }

  const checkOrmRefs = (block: Block) => {
    if (block.type === "orm_find" || block.type === "orm_save" || block.type === "orm_update" || block.type === "orm_delete") {
      const dsName = normalizeIdentifier(block.config.ds || "AppDataSource")
      const fileId = blockToFile.get(block.id) || ""
      if (!ormConnectors.has(fileId + ":" + dsName)) {
        addValidationIssue(issues, {
          severity: "warning",
          blockId: block.id,
          field: "ds",
          message: `TypeORM DataSource "${dsName}" not found. Add a "Connect with TypeORM" block with name "${dsName}".`,
        }, blockIssues)
      }
    }
    safeArr(block.children).forEach(checkOrmRefs)
  }

  files.forEach(file => safeArr(file.blocks).forEach(validateCall))
  files.forEach(file => safeArr(file.blocks).forEach(checkTransport))
  files.forEach(file => safeArr(file.blocks).forEach(checkDatabaseRefs))
  files.forEach(file => safeArr(file.blocks).forEach(checkRedisRefs))
  files.forEach(file => safeArr(file.blocks).forEach(checkMongoRefs))
  files.forEach(file => safeArr(file.blocks).forEach(checkOrmRefs))

  return {
    issues,
    blockIssues,
    hasErrors: issues.some(issue => issue.severity === "error"),
  }
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Code: CodeIcon, MessageSquare, Box, GitBranch, Repeat, Puzzle, Globe, Database, Folder, Cpu,
  Play, CornerDownLeft, Shield, AlertCircle, Server, Route, Send, Download, Mail,
  Plus, FileText, Save: SaveIcon, Terminal, Calendar, Key, Package, Share2, Sparkles,
  StickyNote, Clock, RefreshCw, List, Search, Eye, Calculator, Link, Shuffle, GitMerge, Layers,
  Tag, MoreHorizontal, ListOrdered, StopCircle, SkipForward,
  Lock, KeyRound, Signature, Dice5, Radio, LogIn, LogOut, Users, ShieldCheck, ClipboardCopy, Library,
  Compass, ArrowRight, CheckCircle, PlusCircle: AddIcon, MinusCircle, Fingerprint, Braces, Trash2,
}
function BlockIcon({ icon, className, ...props }: { icon: string; className?: string; style?: React.CSSProperties }) {
  const Icon = iconMap[icon]
  return Icon ? <Icon className={className} {...props} /> : <Square className={className} {...props} />
}

// ─── Error Boundary ──────────────────────────────────────────────────────
class VEErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(e: Error) { return { hasError: true, error: e.message } }
  render() {
    if (this.state.hasError) return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400 mb-1">Visual Editor crashed</p>
          <p className="text-xs text-muted-foreground mb-3">{this.state.error}</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => this.setState({ hasError: false, error: null })}>Try again</Button>
        </Card>
      </div>
    )
    return this.props.children
  }
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function VisualEditorPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [defs, setDefs] = useState<BlockDef[]>(() => _defsCache)
  const [categories, setCategories] = useState<Category[]>(() => _catsCache)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>(() => [{ id: "main", name: "main.ts", blocks: [] }])
  const [activeFileId, setActiveFileId] = useState("main")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<string>("basics")
  const [searchQuery, setSearchQuery] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDesc, setSaveDesc] = useState("")
  const [renamingBp, setRenamingBp] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [showBps, setShowBps] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [selectedBpToOverwrite, setSelectedBpToOverwrite] = useState<number | null>(null)
  const [dropZoneHover, setDropZoneHover] = useState<string | null>(null)
  const [dragBlockId, setDragBlockId] = useState<string | null>(null)
  const [popupEditorOpen, setPopupEditorOpen] = useState(false)
  const [popupCode, setPopupCode] = useState("")
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameFileVal, setRenameFileVal] = useState("")
  const [canvasSearch, setCanvasSearch] = useState("")
  const [mobileView, setMobileView] = useState<string | null>(null)
  const [quickAddParent, setQuickAddParent] = useState<string | null>(null)
  const [quickAddFilter, setQuickAddFilter] = useState("")
  const quickAddRef = useRef<HTMLDivElement>(null)
  const popupBlockRef = useRef<string | null>(null)
  const blocksRef = useRef<Block[]>([])
  const undoStackRef = useRef<ProjectFile[][]>([])
  const redoStackRef = useRef<ProjectFile[][]>([])
  const skipHistoryRef = useRef(false)
  const prevFilesRef = useRef<ProjectFile[]>(files)
  const historyReadyRef = useRef(false)

  const activeFile = files.find(f => f.id === activeFileId) || files[0]
  const activeBlocks = activeFile?.blocks || []
  blocksRef.current = activeBlocks
  const [validation, setValidation] = useState<ValidationReport>(EMPTY_VALIDATION)
  const validationByBlockId = validation.blockIssues

  useEffect(() => {    if (!user) return
    ;(async () => {
      try {
        const data = (await apiFetch("/api/infrastructure/visual-editor/block-definitions")) as DefinitionsResponse | null
        const b = safeArr(data?.blocks)
        const c = safeArr(data?.categories)
        _defsCache = b; _catsCache = c
        setDefs(b); setCategories(c)
        const starter = b.find(x => x.type === 'print')
        const initial = starter ? [mkBlock('print', b)] : []
        updateFiles(initial)
        await loadLibrary()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load"
        setInitError(msg)
        toast({ title: "Failed to load", description: msg, variant: "destructive" })
      } finally { setLoading(false) }
    })()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || loading || initError || defs.length === 0) return

    const timer = window.setTimeout(async () => {
      try {
        const next = (await apiFetch("/api/infrastructure/visual-editor/validate", {
          method: "POST",
          body: JSON.stringify({ files }),
          timeout: 8000,
          retries: 0,
        })) as ValidationReport
        setValidation({
          issues: Array.isArray(next?.issues) ? next.issues : [],
          blockIssues: next?.blockIssues && typeof next.blockIssues === "object" ? next.blockIssues : {},
          hasErrors: Boolean(next?.hasErrors),
        })
      } catch {
        setValidation(EMPTY_VALIDATION)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [user, loading, initError, defs.length, files])

  useEffect(() => { setSelectedId(null) }, [activeFileId])

  // Guide navigation: listen for palette block targeting
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string }
      const bd = defs.find(d => d.type === detail.type)
      if (bd && bd.category) setActiveCat(bd.category)
      setSearchQuery("")
    }
    window.addEventListener("guide-navigate", handler)
    return () => window.removeEventListener("guide-navigate", handler)
  }, [defs])

  // ── Undo/redo history tracking ────────────────────────────────────
  useEffect(() => {
    if (!historyReadyRef.current) {
      historyReadyRef.current = true
      prevFilesRef.current = files
      return
    }
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      prevFilesRef.current = files
      return
    }
    undoStackRef.current.push(prevFilesRef.current)
    redoStackRef.current = []
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
    prevFilesRef.current = files
  }, [files])

  // ── Close quick-add popover on outside click ──────────────────────
  useEffect(() => {
    if (!quickAddParent) return
    function onPointer(e: PointerEvent) {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddParent(null); setQuickAddFilter("")
      }
    }
    document.addEventListener('pointerdown', onPointer, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointer, { capture: true })
  }, [quickAddParent])

  // ── Auto-save to localStorage ─────────────────────────────────────
  useEffect(() => {
    if (!historyReadyRef.current) return
    try {
      const data = JSON.stringify({ files, activeFileId })
      localStorage.setItem('ve_autosave', data)
    } catch {}
  }, [files, activeFileId])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ve_autosave')
      if (saved && !loading) {
        const data = JSON.parse(saved)
        if (data?.files?.length > 0) {
          setFiles(data.files)
          if (data.activeFileId) setActiveFileId(data.activeFileId)
        }
      }
    } catch {}
  }, [loading])

  function handleUndo() {
    if (undoStackRef.current.length === 0) return
    const prev = undoStackRef.current.pop()!
    redoStackRef.current.push(JSON.parse(JSON.stringify(files)))
    skipHistoryRef.current = true
    setFiles(prev)
  }

  function handleRedo() {
    if (redoStackRef.current.length === 0) return
    const next = redoStackRef.current.pop()!
    undoStackRef.current.push(JSON.parse(JSON.stringify(files)))
    skipHistoryRef.current = true
    setFiles(next)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const renamingFileIdRef = useRef(renamingFileId)
  renamingFileIdRef.current = renamingFileId
  const renamingBpRef = useRef(renamingBp)
  renamingBpRef.current = renamingBp

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const isRenaming = renamingFileIdRef.current !== null || renamingBpRef.current !== null
      const sid = selectedIdRef.current

      if (e.key === 'Escape' && !isInput && !isRenaming) {
        setSelectedId(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isInput || isRenaming) return
        if (sid && !e.repeat) removeBlock(sid)
        return
      }

      if ((e.ctrlKey || e.metaKey) && !isInput) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) handleRedo(); else handleUndo()
            break
          case 'c':
            e.preventDefault()
            if (sid) {
              const found = treeFind(blocksRef.current, sid)
              if (found) copyBlock(found.block)
            }
            break
          case 'v':
            e.preventDefault()
            if (clipboardRef.current) pasteBlock()
            break
          case 'g':
            e.preventDefault()
            handleGenerate()
            break
          case 's':
            e.preventDefault()
            handleSave()
            break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const syncBlocks = (blocks: Block[]) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, blocks } : f))
  }

  const updateFiles = (blocks: Block[]) => {
    const f: ProjectFile = { id: activeFileId, name: activeFile?.name || "main.ts", blocks }
    setFiles(prev => {
      const idx = prev.findIndex(x => x.id === activeFileId)
      const next = [...prev]
      if (idx >= 0) next[idx] = f; else next.push(f)
      return next
    })
  }

  const sel = selectedId ? treeFind(activeBlocks, selectedId)?.block ?? null : null
  const selDef = sel ? defs.find(d => d.type === sel.type) : null

  const addBlock = (type: string, parentId?: string | null) => {
    const d = defs.find(x => x.type === type); if (!d) return
    const nb = mkBlock(type, defs)
    const next = parentId
      ? treeUpdate(activeBlocks, parentId, p => ({ ...p, children: [...safeArr(p.children), nb] }))
      : [...activeBlocks, nb]
    updateFiles(next)
    setSelectedId(nb.id)
  }

  const removeBlock = (id: string) => {
    const next = treeRemove(activeBlocks, id)
    updateFiles(next)
    if (selectedId === id) setSelectedId(null)
  }

  const updConfig = (id: string, key: string, val: unknown) =>
    updateFiles(treeUpdate(activeBlocks, id, b => ({ ...b, config: { ...b.config, [key]: val } })))

  const handleCanvasDragStart = (e: React.DragEvent, blockId: string) => {
    e.dataTransfer.setData("text/plain", blockId)
    e.dataTransfer.effectAllowed = "move"
    setDragBlockId(blockId)
  }

  const zoneKey = (parentId: string | null, index: number) => `${parentId ?? DROP_ROOT}:${index}`

  const dropAt = (parentId: string | null, index: number, type: string) => {
    const current = blocksRef.current
    const d = defs.find(x => x.type === type); if (!d) return
    const nb = mkBlock(type, defs)
    const next = !parentId || parentId === DROP_ROOT
      ? (() => { const r = [...current]; r.splice(index, 0, nb); return r })()
      : treeUpdate(current, parentId, p => {
        const c = [...safeArr(p.children)]; c.splice(index, 0, nb); return { ...p, children: c }
      })
    updateFiles(next)
    setSelectedId(nb.id)
  }

  const moveTo = (blockId: string, parentId: string | null, index: number) => {
    const current = blocksRef.current
    const found = treeFind(current, blockId)
    if (found) {
      const sameRoot = !found.parent && (!parentId || parentId === DROP_ROOT)
      const sameContainer = found.parent && found.parent.id === parentId
      if ((sameRoot || sameContainer) && found.index < index) {
        index--
      }
    }
    updateFiles(treeMove(current, blockId, parentId, index))
  }

  const handleMoveBlock = (id: string, direction: -1 | 1) => {
    const current = blocksRef.current
    const found = treeFind(current, id)
    if (!found) return
    const pid = found.parent?.id ?? null
    const siblings = found.parent ? safeArr(found.parent.children) : current
    const idx = found.index
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= siblings.length) return
    const next = treeSwapChildren(current, pid, idx, targetIdx)
    updateFiles(next)
  }

  const dragCtx = useRef({ parentId: null as string | null, index: 0 })
  const dragRafRef = useRef<number | null>(null)

  const onDragOverZone = (e: React.DragEvent, parentId: string | null, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragCtx.current = { parentId, index }
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "copy" ? "copy" : "move"
    if (dragRafRef.current == null) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null
        setDropZoneHover(zoneKey(dragCtx.current.parentId, dragCtx.current.index))
      })
    }
  }

  const onDragLeaveZone = (key: string) => {
    if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null }
    if (dropZoneHover === key) setDropZoneHover(null)
  }

  const onDropZone = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropZoneHover(null)

    const { parentId, index } = dragCtx.current
    const data = e.dataTransfer.getData("text/plain")
    if (!data) return

    // Dragging a new block from palette (data is a block type string)
    if (defs.some(d => d.type === data)) {
      dropAt(parentId, index, data)
      return
    }

    // Dragging an existing block from canvas (data is a block ID)
    setDragBlockId(null)
    moveTo(data, parentId, index)
  }

  const DropZone = ({ parentId, index }: { parentId: string | null; index: number }) => {
    const key = zoneKey(parentId, index)
    const over = dropZoneHover === key
    const isDragging = dragBlockId !== null
    return (
      <div
        onDragOver={(e) => onDragOverZone(e, parentId, index)}
        onDragLeave={() => onDragLeaveZone(key)}
        onDrop={onDropZone}
        className={`border border-dashed transition-all duration-150
          ${over
            ? 'h-8 border-purple-400/50 bg-purple-500/20 my-2 ring-1 ring-purple-500/20'
            : isDragging
              ? 'h-5 border-purple-500/15 bg-purple-500/5 my-1.5 hover:border-purple-400/30 hover:bg-purple-500/10'
              : 'h-2 border-transparent my-1 hover:border-purple-500/20 hover:bg-purple-500/5'}`}
      >
        {over && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[9px] text-purple-400/60 font-medium">drop here</span>
          </div>
        )}
      </div>
    )
  }

  // ── generate ─────────────────────────────────────────────────────
  const genQueueRef = useRef<(() => void)[]>([])
  const clipboardRef = useRef<Block | null>(null)

  const [savedBlocks, setSavedBlocks] = useState<LibraryItem[]>([])
  const [showLib, setShowLib] = useState(false)
  const [libName, setLibName] = useState("")

  const loadLibrary = async () => {
    try {
      setSavedBlocks(safeArr(await apiFetch("/api/infrastructure/visual-editor/library")) as LibraryItem[])
    } catch {
      toast({ title: "Failed to load library", variant: "destructive" })
    }
  }

  const handleGenerate = () => {
    if (validation.hasErrors) {
      toast({
        title: "Fix validation errors first",
        description: "There are conflicting names or type mismatches in the editor.",
        variant: "destructive",
      })
      return
    }

    const snap = files.map(f => ({ name: f.name, blocks: f.blocks }))
    const run = async () => {
      setGenerating(true)
      try {
        const res = (await apiFetch("/api/infrastructure/visual-editor/generate-multi", {
          method: "POST",
          body: JSON.stringify({ files: snap }),
        })) as GenerateMultiResponse
        const generatedFiles = safeArr(res?.files)
        let output = ""
        for (const gf of generatedFiles) {
          output += `// === ${gf.name} ===\n${gf.code}\n\n`
        }
        setCode(output.trim() || "// No code generated")
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Generation failed"
        toast({ title: "Generation failed", description: msg, variant: "destructive" })
      } finally {
        setGenerating(false)
        const next = genQueueRef.current.shift()
        if (next) next()
      }
    }
    if (generating) {
      genQueueRef.current.push(run)
      return
    }
    run()
  }

  const handleCopy = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code); setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const deepCloneBlocks = (blocks: Block[]): Block[] => blocks.map(b => ({ ...b, config: { ...b.config }, children: deepCloneBlocks(b.children || []) }))

  const copyBlock = (b: Block) => {
    clipboardRef.current = { ...b, config: { ...b.config }, children: deepCloneBlocks(b.children || []), id: uid() }
    toast({ title: "Copied", description: `"${b.config.blockName || b.name}" copied to clipboard` })
  }

  const pasteBlock = (intoContainerId?: string) => {
    const src = clipboardRef.current
    if (!src) return
    const pasted = { ...src, id: uid(), collapsed: false }
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFileId) return f
      if (intoContainerId) {
        return { ...f, blocks: treeUpdate(f.blocks, intoContainerId, node => ({ ...node, children: [...(node.children || []), pasted] })) }
      }
      return { ...f, blocks: [...f.blocks, pasted] }
    }))
    toast({ title: "Pasted", description: `"${src.config.blockName || src.name}" added to canvas` })
  }

  const saveToLibrary = () => {
    const sel = selectedId ? activeBlocks.find(b => b.id === selectedId) : null
    const blocks = sel ? [sel] : activeBlocks
    if (blocks.length === 0) return
    const name = libName.trim() || `Snippet ${savedBlocks.length + 1}`
    apiFetch("/api/infrastructure/visual-editor/library", {
      method: "POST",
      body: JSON.stringify({ name, blocks: deepCloneBlocks(blocks) }),
    })
      .then(async () => {
        setLibName("")
        await loadLibrary()
        toast({ title: "Saved to Library", description: `"${name}" added to your block library` })
      })
      .catch(() => toast({ title: "Save failed", variant: "destructive" }))
  }

  const removeFromLib = (id: number) => {
    apiFetch(`/api/infrastructure/visual-editor/library/${id}`, { method: "DELETE" })
      .then(() => setSavedBlocks(prev => prev.filter(s => s.id !== id)))
      .catch(() => toast({ title: "Delete failed", variant: "destructive" }))
  }

  const insertFromLib = (blocks: Block[]) => {
    const cloned = deepCloneBlocks(blocks)
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, blocks: [...f.blocks, ...cloned] } : f))
    setShowLib(false)
    toast({ title: "Inserted", description: `Added ${blocks.length} block(s) from library` })
  }

  // ── blueprints (user-scoped save) ─────────────────────────────────
  const handleSave = async () => {
    const finalName = saveName?.trim() || "Untitled Blueprint"
    setSaving(true)
    try {
      const payload = {
        name: finalName,
        description: saveDesc?.trim() || undefined,
        projectData: { files: files.map(f => ({ id: f.id, name: f.name, blocks: f.blocks })) },
        latestGeneratedCode: code || "",
      }
      const serialized = JSON.stringify(payload)
      if (serialized.length > 10 * 1024 * 1024) {
        throw new Error(`Project too large (${(serialized.length / 1024 / 1024).toFixed(1)}MB). Max 10MB. Try removing some blocks.`)
      }
      const method = selectedBpToOverwrite ? "PUT" : "POST"
      const endpoint = selectedBpToOverwrite 
        ? `/api/infrastructure/visual-editor/blueprints/${selectedBpToOverwrite}`
        : "/api/infrastructure/visual-editor/blueprints"
      await apiFetch(endpoint, { method, body: serialized })
      const action = selectedBpToOverwrite ? "Updated" : "Saved"
      toast({ title: action, description: `"${finalName}" ${action.toLowerCase()}` })
      await loadBlueprints()
      setShowBps(true)
      setSaveName("")
      setSaveDesc("")
      setSelectedBpToOverwrite(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed"
      toast({ title: "Save failed", description: msg, variant: "destructive" })
    } finally { setSaving(false) }
  }

  const handleRename = async (id: number, name: string) => {
    try {
      await apiFetch(`/api/infrastructure/visual-editor/blueprints/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim() }),
      })
      setBlueprints(prev => prev.map(b => b.id === id ? { ...b, name: name.trim() } : b))
      toast({ title: "Renamed" })
    } catch {
      toast({ title: "Rename failed", variant: "destructive" })
    }
    setRenamingBp(null)
  }

  const loadBlueprints = async () => {
    try {
      setBlueprints(safeArr(await apiFetch("/api/infrastructure/visual-editor/blueprints")) as Blueprint[])
      setShowBps(true)
    } catch {
      toast({ title: "Failed to load blueprints", variant: "destructive" })
    }
  }

  const loadBp = async (id: number) => {
    try {
      const d = (await apiFetch(`/api/infrastructure/visual-editor/blueprints/${id}`)) as Blueprint | null
      const f = safeArr(d?.projectData?.files)
      if (f.length > 0) {
        setFiles(f); setActiveFileId(f[0].id); setCode(d?.latestGeneratedCode || null); setShowBps(false)
        toast({ title: "Blueprint loaded" })
      }
    } catch {
      toast({ title: "Failed to load", variant: "destructive" })
    }
  }

  const delBp = async (id: number) => {
    try {
      await apiFetch(`/api/infrastructure/visual-editor/blueprints/${id}`, { method: "DELETE" })
      setBlueprints(prev => prev.filter(b => b.id !== id))
    } catch {
      toast({ title: "Delete failed", variant: "destructive" })
    }
  }

  const exportBlueprintZip = async (id: number) => {
    try {
      const bp = blueprints.find(b => b.id === id)
      if (!bp) return
      const response = await fetch(`/api/infrastructure/visual-editor/blueprints/${id}/export`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${bp.name.replace(/\s+/g, '-')}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Downloaded", description: `${bp.name}.zip` })
    } catch {
      toast({ title: "Export failed", variant: "destructive" })
    }
  }

  const addFile = () => {
    const id = uid(); const name = `file${files.length + 1}.ts`
    setFiles(prev => [...prev, { id, name, blocks: [] }]); setActiveFileId(id)
  }

  const delFile = (id: string) => {
    if (files.length <= 1) return
    setFiles(prev => { const n = prev.filter(f => f.id !== id); return n })
    if (activeFileId === id) { const f = files.find(f => f.id !== id); if (f) setActiveFileId(f.id) }
  }

  const renameFile = (id: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: trimmed } : f))
    setRenamingFileId(null)
    setRenameFileVal("")
  }

  // ── render block tree ────────────────────────────────────────────
  function blockMatchesSearch(b: Block): boolean {
    if (!canvasSearch.trim()) return true
    const q = canvasSearch.toLowerCase().trim()
    const d = defs.find(x => x.type === b.type)
    if (d?.name.toLowerCase().includes(q)) return true
    if (b.type.toLowerCase().includes(q)) return true
    if (String(b.config.blockName || '').toLowerCase().includes(q)) return true
    if (safeArr(b.children).some(child => blockMatchesSearch(child))) return true
    return false
  }

  const renderBlock = (b: Block, depth = 0, parentId: string | null = null, orderNum?: number) => {
    const d = defs.find(x => x.type === b.type)
    const isSel = b.id === selectedId
    const c = d?.color || "#6b7280"
    const isDragging = dragBlockId === b.id
    const isGroup = b.type === 'group'
    const blockIssues = validationByBlockId[b.id] || []
    const hasBlockError = blockIssues.some(issue => issue.severity === 'error')
    const hasBlockWarning = blockIssues.some(issue => issue.severity === 'warning')
    const matchesSearch = blockMatchesSearch(b)
    const hasCanvasSearch = canvasSearch.trim().length > 0

    return (
      <div key={b.id} data-guide-id={`canvas-block-${b.id}`} className={`group select-none ${isDragging ? 'opacity-30' : ''} ${hasCanvasSearch && !matchesSearch ? 'opacity-20' : ''}`} style={{ marginLeft: Math.min(depth * 14, 56) }}>
        <div
          draggable
          onDragStart={(e) => handleCanvasDragStart(e, b.id)}
          onDragEnd={() => { setDropZoneHover(null); setDragBlockId(null) }}
          onClick={() => setSelectedId(b.id)}
          className={`flex items-center gap-1.5 p-1.5 border cursor-pointer transition-all text-xs
            ${isGroup ? "border-dashed border-border/40 bg-muted/10" : ""}
            ${d?.canHaveChildren && !isGroup ? "bg-gradient-to-r from-transparent to-transparent hover:to-purple-500/[0.03]" : ""}
            ${hasBlockError ? "border-red-500/60 bg-red-500/10 ring-1 ring-red-500/20" : hasBlockWarning ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/20" : isSel ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/20" : "border-border/30 bg-card/40 hover:border-border/60"}
            ${dropZoneHover?.startsWith(b.id + ":") ? "ring-2 ring-purple-400/40 bg-purple-500/5" : ""}
            ${hasCanvasSearch && matchesSearch ? "ring-1 ring-purple-400/30" : ""}`}
          style={{ borderLeftColor: isGroup ? '#6b7280' : c, borderLeftWidth: 2.5 }}>
          <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
          {isGroup ? (
            <FolderOpen className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          ) : d?.canHaveChildren ? (
            <span className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-inset" style={{ backgroundColor: c + '40', borderColor: c, borderWidth: 1 }} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
          )}
          {d?.canHaveChildren && (
            <button onClick={(e) => { e.stopPropagation(); setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, blocks: treeUpdate(f.blocks, b.id, node => ({ ...node, collapsed: !node.collapsed })) } : f)) }}
              className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 lg:p-0.5 hover:text-purple-400 transition-all">
              <ChevronRight className={`h-3 w-3 transition-transform ${b.collapsed ? "" : "rotate-90"}`} />
            </button>
          )}
          {orderNum !== undefined && (
            <span className="text-[9px] text-muted-foreground/30 font-mono w-4 text-right shrink-0">{orderNum}</span>
          )}
          <span className="font-medium truncate flex-1">{String(b.config.blockName || (b.type === 'group' && b.config.name ? b.config.name : b.name) || '')}</span>
          {blockIssues.length > 0 && (
            <span title={blockIssues.map(i => i.message).join(' | ')}
              className={`text-[9px] px-1 rounded shrink-0 cursor-help ${hasBlockError ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>
              {blockIssues.length} issue{blockIssues.length > 1 ? 's' : ''}
            </span>
          )}
          {d?.canHaveChildren && b.collapsed && safeArr(b.children).length > 0 && (
            <span className="text-[9px] text-muted-foreground/50 bg-muted/40 px-1 rounded">{safeArr(b.children).length} blocks</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); copyBlock(b) }}
            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 lg:p-0.5 hover:text-purple-400 transition-opacity">
            <Copy className="h-3 w-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleMoveBlock(b.id, -1) }}
            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 lg:p-0.5 hover:text-purple-400 transition-opacity">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleMoveBlock(b.id, 1) }}
            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 lg:p-0.5 hover:text-purple-400 transition-opacity">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); removeBlock(b.id) }}
            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 lg:p-0.5 hover:text-red-400 transition-opacity">
            <X className="h-3 w-3" />
          </button>
        </div>
        {d?.canHaveChildren && !b.collapsed && (
          <div
            className={`ml-3 mt-0.5 pl-2 min-h-[2rem] ${isGroup ? "border-l-2 border-dashed border-border/20" : "border-l border-border/20"}`}
            style={!isGroup ? { borderLeftColor: c + '40' } : undefined}
            onDragOver={(e) => onDragOverZone(e, b.id, safeArr(b.children).length)}
            onDragLeave={() => onDragLeaveZone(zoneKey(b.id, safeArr(b.children).length))}
            onDrop={onDropZone}>
            {safeArr(b.children).length === 0 && (
              <div className="text-[9px] text-muted-foreground/30 italic px-1 py-0.5 select-none">{d?.childrenLabel || 'Drop blocks here'}</div>
            )}
            <DropZone parentId={b.id} index={0} />
            {safeArr(b.children).map((ch, ci) => (
              <div key={ch.id} className="space-y-0.5 group">
                {renderBlock(ch, depth + 1, b.id, ci + 1)}
                <DropZone parentId={b.id} index={ci + 1} />
              </div>
            ))}
            <div className="flex items-center gap-1 mt-1">
              <div
                onDragOver={(e) => onDragOverZone(e, b.id, safeArr(b.children).length)}
                onDragLeave={() => onDragLeaveZone(zoneKey(b.id, safeArr(b.children).length))}
                onDrop={onDropZone}
                className={`flex-1 flex items-center justify-center gap-1.5 p-2 border-2 border-dashed text-[10px] transition-colors cursor-default
                  ${dropZoneHover === zoneKey(b.id, safeArr(b.children).length) ? "border-purple-400/40 bg-purple-500/10 text-purple-400/60" : "border-border/10 text-muted-foreground/20 hover:border-purple-500/30 hover:text-purple-400/40"}`}>
                <AddIcon className="h-2.5 w-2.5" /> {safeArr(b.children).length > 0 ? 'drop here' : 'drop blocks here'}
              </div>
              <div className="relative" ref={quickAddParent === b.id ? quickAddRef : undefined}>
                <button onClick={(e) => { e.stopPropagation(); setQuickAddParent(quickAddParent === b.id ? null : b.id) }}
                  className="p-1.5 lg:p-1 border border-dashed border-border/20 text-muted-foreground/30 hover:text-purple-400/60 hover:border-purple-400/30 transition-colors text-[10px]">
                  <Plus className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
                </button>
                {quickAddParent === b.id && (
                  <div className="absolute bottom-full right-0 mb-1 z-50 w-44 border border-border/30 bg-popover shadow-xl backdrop-blur-md p-1 max-h-52 overflow-y-auto">
                    <input type="text" placeholder="Search..."
                      onChange={e => { const q = e.target.value.toLowerCase(); setQuickAddFilter(q) }}
                      className="w-full h-6 px-1.5 text-[10px] border border-border/20 bg-background/50 focus:outline-none mb-1"
                      onClick={e => e.stopPropagation()} autoFocus />
                    {defs.filter(d => {
                      if (d.type === 'otherwise' || d.type === 'otherwise_if' || d.type === 'default_case' || d.type === 'case') return false
                      if (d.type === 'ws_on_open' || d.type === 'ws_on_message' || d.type === 'ws_on_close') return false
                      const q = quickAddFilter.toLowerCase()
                      return !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
                    }).map(d => (
                      <button key={d.type}
                        onClick={(e) => { e.stopPropagation(); addBlock(d.type, b.id); setQuickAddParent(null); setQuickAddFilter("") }}
                        className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] hover:bg-accent/50 transition-colors text-left">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="truncate">{d.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── loading / error ──────────────────────────────────────────────
  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-3">
        <Skeleton className="hidden lg:block h-[500px] rounded-lg" />
        <Skeleton className="h-[500px] rounded-lg" />
        <Skeleton className="hidden lg:block h-[500px] rounded-lg" />
      </div>
    </div>
  )

  if (initError) return (
    <div className="p-6">
      <Card className="p-8 text-center">
        <p className="text-red-400 text-sm mb-2">Failed to initialize Visual Editor</p>
        <p className="text-xs text-muted-foreground">{initError}</p>
      </Card>
    </div>
  )

  const filtered = safeArr(defs).filter(d => {
    const q = searchQuery.toLowerCase().trim()
    if (q) return d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.type.toLowerCase().includes(q)
    return d.category === activeCat
  })

  return (
    <RolloutGuard rolloutKey="visualeditor_feature" fallback={
      <div className="p-6"><Card className="p-12 text-center">
        <Braces className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
        <h2 className="font-semibold mb-1">Not Available Yet</h2>
        <p className="text-sm text-muted-foreground">This feature is being rolled out gradually.</p></Card></div>
    }>
      <VEErrorBoundary>
      <div className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3 gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Visual Editor</h1>
            <p className="text-xs text-muted-foreground">Create powerfull applications in TypeScript (Bun) via visual code editor</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="h-7 text-[10px] lg:text-xs" onClick={loadBlueprints}>
              <FileCode className="h-3.5 w-3.5 mr-1" />Blueprints
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              const b = defs.find(x => x.type === 'print')
              const init = b ? [mkBlock('print', defs)] : []
              updateFiles(init); setCode(null); setSelectedId(null)
              try { localStorage.removeItem('ve_autosave') } catch {}
            }}>
              <Moon className="h-3.5 w-3.5 mr-1" />New
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleUndo} disabled={undoStackRef.current.length === 0} title="Undo (Ctrl+Z)">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRedo} disabled={redoStackRef.current.length === 0} title="Redo (Ctrl+Shift+Z)">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border/30 mx-0.5" />
            {safeArr(activeBlocks).some(b => b.collapsed) ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, blocks: treeUpdateAll(f.blocks, b => ({ ...b, collapsed: false })) } : f))} title="Expand all">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : safeArr(activeBlocks).some(b => b.children?.length > 0) ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, blocks: treeUpdateAll(f.blocks, b => b.children?.length ? { ...b, collapsed: true } : b) } : f))} title="Collapse all">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <div className="w-px h-5 bg-border/30 mx-0.5" />
            <Button size="sm" className="h-7 text-xs" data-guide-id="btn-generate" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 rounded-full animate-spin" /> : <PlayIcon className="h-3.5 w-3.5 mr-1" />}
              {generating ? "Generating..." : validation.hasErrors ? "Fix Errors" : "Generate"}
            </Button>
            {clipboardRef.current && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => pasteBlock()}>
                <ClipboardCopy className="h-3.5 w-3.5 mr-1" />Paste
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" data-guide-id="btn-library" onClick={() => setShowLib(true)}>
              <Library className="h-3.5 w-3.5 mr-1" />Library
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-guide-id="btn-guide" onClick={() => setShowGuide(true)}>
              <Compass className="h-3.5 w-3.5 mr-1" />Guide
            </Button>
          </div>
        </div>

        {validation.issues.length > 0 && (
          <Card className={`p-3 mb-3 border ${validation.hasErrors ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className={`h-4 w-4 ${validation.hasErrors ? "text-red-400" : "text-amber-400"}`} />
                <h3 className="text-xs font-semibold">Validation</h3>
                <span className="text-[10px] text-muted-foreground">{validation.issues.length} issue(s)</span>
              </div>
              <span className={`text-[10px] font-medium ${validation.hasErrors ? "text-red-400" : "text-amber-400"}`}>
                {validation.hasErrors ? "Blocking" : "Warnings"}
              </span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {validation.issues.map((issue, index) => (
                <button
                  key={`${issue.blockId || "global"}-${index}`}
                  onClick={() => issue.blockId && setSelectedId(issue.blockId)}
                  className={`w-full text-left border px-2 py-1.5 text-xs transition-colors ${
                    issue.severity === "error"
                      ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                      : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                  }`}
                >
                  <span className={issue.severity === "error" ? "text-red-300" : "text-amber-300"}>
                    {issue.message}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {showBps && (
          <Card className="p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold">Saved Blueprints</h3>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowBps(false)}><X className="h-3 w-3" /></Button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Blueprint name"
                maxLength={512}
                className="h-7 text-xs"
              />
              <Input
                value={saveDesc}
                onChange={e => setSaveDesc(e.target.value)}
                placeholder="Description (optional)"
                maxLength={4096}
                className="h-7 text-xs"
              />
              <Select
                value={selectedBpToOverwrite ? String(selectedBpToOverwrite) : "new"}
                onValueChange={(v) => setSelectedBpToOverwrite(v === "new" ? null : Number(v))}
              >
                <SelectTrigger className="h-7 w-44 text-xs">
                  <SelectValue placeholder="Save mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new" className="text-xs">Save as new</SelectItem>
                  {blueprints.map(bp => (
                    <SelectItem key={bp.id} value={String(bp.id)} className="text-xs">Overwrite: {bp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 text-xs whitespace-nowrap" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 rounded-full animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {selectedBpToOverwrite ? "Overwrite" : "Save current"}
              </Button>
            </div>
            {blueprints.length === 0 ? <p className="text-xs text-muted-foreground">None saved yet.</p> : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {blueprints.map((bp: Blueprint) => (
                  <div key={bp.id} className="flex items-center justify-between p-1.5 border border-border/30 hover:bg-accent/30 text-xs">
                    <button onClick={() => loadBp(bp.id)} className="flex items-center gap-1.5 font-medium">
                      <FileCode className="h-3.5 w-3.5 text-purple-400" />{bp.name}
                      <span className="text-muted-foreground font-normal">{(bp.updatedAt || "").slice(0, 10)}</span>
                    </button>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => exportBlueprintZip(bp.id)} title="Export as ZIP">
                        <Download className="h-3 w-3 text-blue-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => delBp(bp.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Library dialog */}
        {showLib && (
          <Card className="p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold">My Library</h3>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowLib(false)}><X className="h-3 w-3" /></Button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={libName}
                onChange={e => setLibName(e.target.value)}
                placeholder="Library item name"
                maxLength={512}
                className="h-7 text-xs"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs whitespace-nowrap" onClick={saveToLibrary}>
                <Save className="h-3.5 w-3.5 mr-1" />Save current
              </Button>
            </div>
            {savedBlocks.length === 0 ? <p className="text-xs text-muted-foreground">No saved snippets yet.</p> : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {savedBlocks.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-1.5 border border-border/30 hover:bg-accent/30 text-xs">
                    <button onClick={() => insertFromLib(s.blocks)} className="flex items-center gap-1.5 font-medium">
                      <Library className="h-3.5 w-3.5 text-purple-400" />{s.name}
                      <span className="text-muted-foreground font-normal">({s.blocks.length} blocks)</span>
                    </button>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFromLib(s.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* File tabs */}
        <div className="flex items-center gap-0.5 mb-2 overflow-x-auto">
          {files.map(f => (
            <div key={f.id}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-t-md text-xs border-b-2 cursor-pointer transition-colors
                ${f.id === activeFileId ? "border-purple-500 bg-muted/40 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => { if (renamingFileId !== f.id) setActiveFileId(f.id) }}>
              <FileCode className="h-3 w-3" />
              {renamingFileId === f.id ? (
                <input
                  value={renameFileVal}
                  onChange={e => setRenameFileVal(e.target.value)}
                  onBlur={() => renameFile(f.id, renameFileVal)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameFile(f.id, renameFileVal)
                    if (e.key === 'Escape') setRenamingFileId(null)
                  }}
                  autoFocus
                  className="w-32 h-5 px-1.5 text-xs border border-purple-500/30 bg-background focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span onDoubleClick={(e) => { e.stopPropagation(); setRenamingFileId(f.id); setRenameFileVal(f.name) }}>{f.name}</span>
              )}
              {files.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); delFile(f.id) }} className="ml-0.5 hover:text-red-400"><X className="h-2.5 w-2.5" /></button>
              )}
            </div>
          ))}
          <button onClick={addFile} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground border-b-2 border-transparent">
            + Add File
          </button>
        </div>

        {/* Mobile bottom tab bar */}
        <div className="flex lg:hidden items-center justify-around border-t border-border/20 bg-card/95 backdrop-blur-md fixed bottom-0 left-0 right-0 z-40 pb-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
          <button onClick={() => setMobileView(mobileView === 'palette' ? null : 'palette')}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] transition-colors ${mobileView === 'palette' ? 'text-purple-400' : 'text-muted-foreground/60'}`}>
            <Sparkles className="h-4 w-4" />
            <span>Blocks</span>
          </button>
          <button onClick={() => { setMobileView(null) }}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] transition-colors ${!mobileView ? 'text-emerald-400' : 'text-muted-foreground/60'}`}>
            <Braces className="h-4 w-4" />
            <span>Canvas</span>
          </button>
          <button onClick={() => setMobileView(mobileView === 'config' ? null : 'config')}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] transition-colors ${mobileView === 'config' ? 'text-blue-400' : 'text-muted-foreground/60'}`}>
            <Settings className="h-4 w-4" />
            <span>Config</span>
          </button>
        </div>

        {/* Mobile overlay backdrop */}
        {mobileView && (
          <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileView(null)} />
        )}

        {/* Mobile overlay: Palette */}
        {mobileView === 'palette' && (
          <div className="fixed inset-x-0 bottom-[49px] top-0 z-30 lg:hidden animate-in slide-in-from-bottom-2 duration-200">
            <div className="h-full bg-card/98 backdrop-blur-md flex flex-col overflow-hidden border-r border-border/20 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs font-semibold">Blocks</span>
                </div>
                <button onClick={() => setMobileView(null)} className="p-1 hover:text-foreground text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-0.5 p-1.5 border-b border-border/10 overflow-x-auto">
                {safeArr(categories).map(cat => (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                    className={`px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap font-medium transition-colors
                      ${activeCat === cat.id ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/30"}`}>
                    {cat.name}
                  </button>
                ))}
              </div>
              <div className="px-1.5 py-1 border-b border-border/10">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40 pointer-events-none" />
                  <input type="text" placeholder="Search blocks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full h-8 pl-6 pr-2 text-xs border border-border/20 bg-background/50 focus:outline-none focus:border-purple-500/40 placeholder:text-muted-foreground/30" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 min-h-0">
                {filtered.map(d => (
                  <div key={d.type} onClick={() => { addBlock(d.type); setMobileView(null) }}
                    className="flex items-center gap-2 p-2 border border-border/20 bg-card/20 hover:bg-accent/30 hover:border-border/40 transition-all text-xs cursor-pointer active:scale-[0.98]">
                    <span className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: d.color + "25" }}>
                      <BlockIcon icon={d.icon} className="h-3.5 w-3.5" style={{ color: d.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{d.name}</div>
                      <div className="text-[9px] text-muted-foreground/50 truncate">{d.description}</div>
                    </div>
                    {d.canHaveChildren && <span className="text-[8px] text-muted-foreground/30 border border-border/10 rounded px-0.5">[]</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile overlay: Config */}
        {mobileView === 'config' && (
          <div className="fixed inset-x-0 bottom-[49px] top-0 z-30 lg:hidden animate-in slide-in-from-bottom-2 duration-200">
            <div className="h-full bg-card/98 backdrop-blur-md flex flex-col overflow-hidden border-l border-border/20 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-semibold">{sel ? "Config" : "Properties"}</span>
                </div>
                <button onClick={() => setMobileView(null)} className="p-1 hover:text-foreground text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {sel && selDef ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/40">
                      <span className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: selDef!.color + "25" }}>
                        <BlockIcon icon={selDef!.icon} className="h-3.5 w-3.5" style={{ color: selDef!.color }} />
                      </span>
                      <div>
                        <div className="text-xs font-medium">{selDef!.name}</div>
                        <div className="text-[10px] text-muted-foreground">{selDef!.description}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium flex items-center gap-0.5">
                        Block name <span className="text-[9px] text-muted-foreground/50">(optional)</span>
                      </Label>
                      <Input value={String(sel!.config.blockName ?? '')}
                        onChange={e => updConfig(sel!.id, 'blockName', e.target.value)}
                        placeholder={selDef!.name}
                        className="h-7 text-[10px]" />
                    </div>
                    {selDef!.fields.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/50 text-center py-2">No settings needed.</p>
                    )}
                    {selDef!.fields.map(f => {
                      const useMonaco = sel!.type === 'custom_code' && f.name === 'code'
                      const skipConditions = (sel!.type === 'if' || sel!.type === 'otherwise_if') && f.name === 'conditions'
                      if (skipConditions) return null
                      const fieldIssues = (validationByBlockId[sel!.id] || []).filter(i => i.field === f.name)
                      const hasFieldError = fieldIssues.some(i => i.severity === 'error')
                      const hasFieldWarning = fieldIssues.some(i => i.severity === 'warning')
                      return (
                        <div key={f.name} className="space-y-1">
                          <Label className="text-[10px] font-medium flex items-center gap-0.5">
                            {f.label}{f.required && <span className="text-red-400">*</span>}
                            {fieldIssues.length > 0 && (
                              <span className={`ml-auto text-[9px] ${hasFieldError ? "text-red-400" : "text-amber-400"}`}>
                                {hasFieldError ? "error" : "warning"}
                              </span>
                            )}
                          </Label>
                          {useMonaco ? (
                            <div className="h-32 w-full border overflow-hidden border-border/30">
                              <Suspense fallback={<div className="p-3 text-xs text-muted-foreground/50">Loading...</div>}>
                                <MonacoEditor
                                  height="100%"
                                  language="typescript"
                                  theme="vs-dark"
                                  value={String(sel!.config.code ?? '')}
                                  onChange={(v) => updConfig(sel!.id, 'code', v ?? '')}
                                  options={{
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 11,
                                    lineNumbers: "off",
                                    renderLineHighlight: "none",
                                    padding: { top: 4, bottom: 4 },
                                    automaticLayout: true,
                                    wordWrap: "on",
                                    scrollbar: { vertical: "visible", horizontal: "visible", verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                  }}
                                />
                              </Suspense>
                            </div>
                          ) : (
                            <FieldInput field={f} block={sel!} onUpdate={updConfig} fieldIssues={fieldIssues} />
                          )}
                          {f.helpText && <p className="text-[9px] text-muted-foreground/40">{f.helpText}</p>}
                        </div>
                      )
                    })}
                    <div className="pt-2 border-t border-border/20">
                      <p className="text-[9px] text-muted-foreground/40 mb-1">Example output:</p>
                      <pre className="text-[9px] font-mono text-emerald-400/60 bg-background/30 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                        {getBlockExample(sel!.type, sel!.config)}
                      </pre>
                    </div>
                    {(sel!.type === 'if' || sel!.type === 'otherwise_if') && (
                      <ConditionsBuilder block={sel!} onUpdate={updConfig} />
                    )}
                    {sel!.type === 'invoke_handler' && (
                      <HandlerParamsFields handlerName={String(sel!.config.name || '')} block={sel!} blocks={activeBlocks} onUpdate={updConfig} />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Settings className="h-6 w-6 text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground/50">Select a block to configure</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main 3-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-3 h-auto lg:h-[calc(100vh-280px)] min-h-[400px]">
          {/* Palette */}
          <Card className="hidden lg:flex flex-col overflow-hidden" data-guide-id="palette">
            <div className="px-2.5 py-1.5 border-b border-border/30 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-semibold">Blocks</span>
            </div>
            <div className="flex gap-0.5 p-1.5 border-b border-border/10 overflow-x-auto">
              {safeArr(categories).map(cat => (
                <button key={cat.id} onClick={() => setActiveCat(cat.id)}
                  className={`px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap font-medium transition-colors
                    ${activeCat === cat.id ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/30"}`}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="px-1.5 py-1 border-b border-border/10">
              <div className="relative">
                <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40 pointer-events-none" />
                <input
                  data-guide-id="palette-search"
                  type="text" placeholder="Search blocks..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-7 pl-6 pr-2 text-[11px] border border-border/20 bg-background/50 focus:outline-none focus:border-purple-500/40 placeholder:text-muted-foreground/30"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 min-h-0" data-guide-id="palette-list">
              {filtered.map(d => (
                <div key={d.type} data-guide-id={`palette-block-${d.type}`} draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.type); e.dataTransfer.effectAllowed = "copy" }}
                  onClick={() => addBlock(d.type)}
                  className="flex items-center gap-2 p-1.5 border border-border/20 bg-card/20 hover:bg-accent/30 hover:border-border/40 transition-all cursor-grab active:cursor-grabbing text-xs touch-none">
                  <span className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: d.color + "25" }}>
                    <BlockIcon icon={d.icon} className="h-3 w-3" style={{ color: d.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-[9px] text-muted-foreground/50 truncate">{d.description}</div>
                  </div>
                  {d.canHaveChildren && <span className="text-[8px] text-muted-foreground/30 border border-border/10 rounded px-0.5">[]</span>}
                </div>
              ))}
            </div>
          </Card>

          {/* Canvas */}
          <Card className="flex flex-col overflow-hidden lg:pb-0 pb-[50px]" data-guide-id="canvas">
            <div className="px-2.5 py-1.5 border-b border-border/30 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Braces className="h-3.5 w-3.5 text-emerald-500" />Canvas
              </span>
              <span className="text-[10px] text-muted-foreground">{safeArr(activeBlocks).length} blocks</span>
            </div>
            {safeArr(activeBlocks).length > 0 && (
              <div className="px-2 py-1 border-b border-border/10">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30 pointer-events-none" />
                  <input type="text" placeholder="Find blocks on canvas..."
                    value={canvasSearch} onChange={e => setCanvasSearch(e.target.value)}
                    className="w-full h-6 pl-6 pr-2 text-[10px] border border-border/20 bg-background/50 focus:outline-none focus:border-purple-500/30 placeholder:text-muted-foreground/30" />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto min-h-0 p-2" data-guide-id="canvas-dropzone" onDragOver={(e) => e.preventDefault()}>
              <DropZone parentId={null} index={0} />
              {safeArr(activeBlocks).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Braces className="h-8 w-8 text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground/50 mb-2">Tap + below or open Blocks to add</p>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
                    {['print', 'create_variable', 'if', 'fetch_url', 'start_server'].map(t => {
                      const d = defs.find(x => x.type === t)
                      if (!d) return null
                      return (
                        <button key={t} onClick={() => addBlock(t)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] border border-border/20 bg-card/30 hover:bg-accent/40 hover:border-border/40 transition-colors">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 mt-3">Tap Guide in toolbar for a walkthrough</p>
                </div>
              ) : (
                <div className="space-y-0.5 group">
                  {safeArr(activeBlocks).map((b, i) => (
                    <div key={b.id} className="space-y-0.5 group">
                      {renderBlock(b, 0, null, i + 1)}
                      <DropZone parentId={null} index={i + 1} />
                    </div>
                  ))}
                </div>
              )}
              <div
                onDragOver={(e) => onDragOverZone(e, null, safeArr(activeBlocks).length)}
                onDragLeave={() => onDragLeaveZone(zoneKey(null, safeArr(activeBlocks).length))}
                onDrop={onDropZone}
                className={`mt-1 flex items-center justify-center gap-1 p-2 border-2 border-dashed text-[10px] transition-colors cursor-default
                  ${dropZoneHover === zoneKey(null, safeArr(activeBlocks).length) ? "border-purple-400/40 bg-purple-500/10 text-purple-400/60" : "border-border/10 text-muted-foreground/20 hover:border-purple-500/30 hover:text-purple-400/40"}`}>
                <AddIcon className="h-3 w-3" /> drop here
              </div>
            </div>
          </Card>

          {/* Config */}
          <Card className="hidden lg:flex flex-col overflow-hidden" data-guide-id="config">
            <div className="px-2.5 py-1.5 border-b border-border/30 flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-semibold">{sel ? "Config" : "Properties"}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 min-h-0">
              {sel && selDef ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/40">
                    <span className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: selDef!.color + "25" }}>
                      <BlockIcon icon={selDef!.icon} className="h-3.5 w-3.5" style={{ color: selDef!.color }} />
                    </span>
                    <div>
                      <div className="text-xs font-medium">{selDef!.name}</div>
                      <div className="text-[10px] text-muted-foreground">{selDef!.description}</div>
                    </div>
                  </div>
                  {/* Block name override */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium flex items-center gap-0.5">
                      Block name <span className="text-[9px] text-muted-foreground/50">(optional)</span>
                    </Label>
                    <Input
                      value={String(sel!.config.blockName ?? '')}
                      onChange={e => updConfig(sel!.id, 'blockName', e.target.value)}
                      placeholder={selDef!.name}
                      className="h-6 text-[10px]"
                    />
                  </div>
                  {selDef!.fields.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center py-2">No settings needed.</p>
                  )}
                  {selDef!.fields.map(f => {
                    const useMonaco = sel!.type === 'custom_code' && f.name === 'code'
                    const skipConditions = (sel!.type === 'if' || sel!.type === 'otherwise_if') && f.name === 'conditions'
                    if (skipConditions) return null
                    const fieldIssues = (validationByBlockId[sel!.id] || []).filter(i => i.field === f.name)
                    const hasFieldError = fieldIssues.some(i => i.severity === 'error')
                    const hasFieldWarning = fieldIssues.some(i => i.severity === 'warning')
                    return (
                      <div key={f.name} className="space-y-1">
                        <Label className="text-[10px] font-medium flex items-center gap-0.5">
                          {f.label}{f.required && <span className="text-red-400">*</span>}
                          {fieldIssues.length > 0 && (
                            <span className={`ml-auto text-[9px] ${hasFieldError ? "text-red-400" : "text-amber-400"}`}>
                              {hasFieldError ? "error" : "warning"}
                            </span>
                          )}
                        </Label>
                        {useMonaco ? (
                          <div className="space-y-1">
                            <div className={`h-32 w-full border overflow-hidden ${hasFieldError ? "border-red-500/40" : hasFieldWarning ? "border-amber-500/30" : "border-border/30"}`}>
                              <Suspense fallback={<div className="p-3 text-xs text-muted-foreground/50">Loading editor...</div>}>
                                <MonacoEditor
                                  height="100%"
                                  language="typescript"
                                  theme="vs-dark"
                                  value={String(sel!.config.code ?? '')}
                                  onChange={(v) => updConfig(sel!.id, 'code', v ?? '')}
                                  options={{
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 11,
                                    lineNumbers: "off",
                                    renderLineHighlight: "none",
                                    padding: { top: 4, bottom: 4 },
                                    automaticLayout: true,
                                    wordWrap: "on",
                                    scrollbar: { vertical: "visible", horizontal: "visible", verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                  }}
                                />
                              </Suspense>
                            </div>
                            <Dialog open={popupEditorOpen} onOpenChange={(o) => { if (!o) { updConfig(sel!.id, 'code', popupCode); }; setPopupEditorOpen(o) }}>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] w-full"
                                  onClick={() => { setPopupCode(String(sel!.config.code ?? '')); popupBlockRef.current = sel!.id }}>
                                  <Maximize2 className="h-3 w-3 mr-1" />Full Editor
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[90vw] max-h-[85vh] h-[85vh] flex flex-col">
                                <DialogHeader>
                                  <DialogTitle className="text-sm">Edit Custom Code</DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 min-h-0 border border-border/30 overflow-hidden">
                                  <Suspense fallback={<div className="p-4 text-xs text-muted-foreground/50">Loading editor...</div>}>
                                    <MonacoEditor
                                      height="100%"
                                      language="typescript"
                                      theme="vs-dark"
                                      value={popupCode}
                                      onChange={(v) => setPopupCode(v ?? '')}
                                      options={{
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        fontSize: 13,
                                        lineNumbers: "on",
                                        renderLineHighlight: "line",
                                        padding: { top: 8 },
                                        automaticLayout: true,
                                        wordWrap: "on",
                                        scrollbar: { vertical: "visible", horizontal: "visible", verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                                      }}
                                    />
                                  </Suspense>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        ) : (
                          <FieldInput field={f} block={sel!} onUpdate={updConfig} fieldIssues={fieldIssues} />
                        )}
                        {f.helpText && <p className="text-[9px] text-muted-foreground/40">{f.helpText}</p>}
                      </div>
                    )
                  })}
                  {/* Usage example */}
                  <div className="pt-2 border-t border-border/20">
                    <p className="text-[9px] text-muted-foreground/40 mb-1">Example output:</p>
                    <pre className="text-[9px] font-mono text-emerald-400/60 bg-background/30 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                      {getBlockExample(sel!.type, sel!.config)}
                    </pre>
                  </div>
                  {(sel!.type === 'if' || sel!.type === 'otherwise_if') && (
                    <ConditionsBuilder block={sel!} onUpdate={updConfig} />
                  )}
                  {/* Dynamic handler parameters for invoke_handler */}
                  {sel!.type === 'invoke_handler' && (
                    <HandlerParamsFields
                      handlerName={String(sel!.config.name || '')}
                      block={sel!}
                      blocks={activeBlocks}
                      onUpdate={updConfig}
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <Settings className="h-6 w-6 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground/50">Select a block to configure</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Generated code */}
        {code && (
          <Card className="mt-3 overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-border/30 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-amber-500" />Generated Bun Code
              </span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleCopy}>
                  {copied ? <Check className="h-3 w-3 mr-0.5 text-green-500" /> : <Copy className="h-3 w-3 mr-0.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="h-64 w-full overflow-hidden">
              <Suspense fallback={<div className="p-4 text-xs text-muted-foreground/50">Loading editor...</div>}>
                <MonacoEditor
                  height="100%"
                  language="typescript"
                  theme="vs-dark"
                  value={code ?? ""}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    lineNumbers: "on",
                    renderLineHighlight: "none",
                    padding: { top: 8 },
                    automaticLayout: true,
                    wordWrap: "on",
                    scrollbar: {
                      vertical: "visible",
                      horizontal: "visible",
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8,
                    },
                  }}
                />
              </Suspense>
            </div>
          </Card>
        )}
      </div>
      <GuideOverlay open={showGuide} onOpenChange={setShowGuide} defs={defs} onBuild={(blocks) => {
        const init = [...safeArr(activeBlocks), ...blocks]
        updateFiles(init); setCode(null); setSelectedId(null)
      }} />
      </VEErrorBoundary>
    </RolloutGuard>
  )
}

// ─── FieldInput ──────────────────────────────────────────────────────────
function FieldInput({ field, block, onUpdate, fieldIssues }: {
  field: BlockField; block: Block; onUpdate: (id: string, k: string, v: unknown) => void; fieldIssues?: ValidationIssue[]
}) {
  const val = block.config[field.name] ?? field.default ?? ""
  const hasError = fieldIssues?.some(i => i.severity === 'error')
  const hasWarning = fieldIssues?.some(i => i.severity === 'warning')
  const issueMsg = fieldIssues?.[0]?.message
  const inputCls = `h-6 text-[10px] ${hasError ? "border-red-500/60 ring-1 ring-red-500/20" : hasWarning ? "border-amber-500/50 ring-1 ring-amber-500/20" : ""}`
  switch (field.type) {
    case "text": case "expression": case "variable":
      return (
        <div>
          <Input value={String(val)} onChange={e => onUpdate(block.id, field.name, e.target.value)} placeholder={field.placeholder} className={inputCls} />
          {issueMsg && <p className={`text-[9px] mt-0.5 ${hasError ? "text-red-400/70" : "text-amber-400/70"}`}>{issueMsg}</p>}
        </div>
      )
    case "number":
      return (
        <div>
          <Input type="number" value={String(val)} onChange={e => onUpdate(block.id, field.name, Number(e.target.value))} className={inputCls} />
          {issueMsg && <p className={`text-[9px] mt-0.5 ${hasError ? "text-red-400/70" : "text-amber-400/70"}`}>{issueMsg}</p>}
        </div>
      )
    case "boolean":
      return <div className="flex items-center gap-1.5"><Switch checked={Boolean(val)} onCheckedChange={v => onUpdate(block.id, field.name, v)} /><span className="text-[10px] text-muted-foreground">{String(val)}</span></div>
    case "select":
      return (
        <Select value={String(val)} onValueChange={v => onUpdate(block.id, field.name, v)}>
          <SelectTrigger className={`h-6 text-[10px] ${hasError ? "border-red-500/60 ring-1 ring-red-500/20" : hasWarning ? "border-amber-500/50 ring-1 ring-amber-500/20" : ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{safeArr(field.options).map(o => <SelectItem key={o.value} value={o.value} className="text-[10px]">{o.label}</SelectItem>)}</SelectContent>
        </Select>
      )
    case "json":
      return (
        <div>
          <div className={`h-32 w-full border overflow-hidden ${hasError ? "border-red-500/40" : hasWarning ? "border-amber-500/30" : "border-border/30"}`}>
            <Suspense fallback={<div className="p-2 text-[10px] text-muted-foreground/50">Loading editor...</div>}>
              <MonacoEditor
                height="100%"
                language="json"
                theme="vs-dark"
                value={String(val)}
                onChange={(v) => onUpdate(block.id, field.name, v ?? '')}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 11,
                  lineNumbers: "off",
                  renderLineHighlight: "none",
                  padding: { top: 4, bottom: 4 },
                  automaticLayout: true,
                  wordWrap: "on",
                  scrollbar: { vertical: "visible", horizontal: "visible", verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                }}
              />
            </Suspense>
          </div>
          {issueMsg && <p className={`text-[9px] mt-0.5 ${hasError ? "text-red-400/70" : "text-amber-400/70"}`}>{issueMsg}</p>}
        </div>
      )
    default:
      return <Input value={String(val)} onChange={e => onUpdate(block.id, field.name, e.target.value)} className="h-6 text-[10px]" />
  }
}

// ─── HandlerParamsFields ─────────────────────────────────────────────────
function HandlerParamsFields({
  handlerName, block, blocks, onUpdate,
}: {
  handlerName: string; block: Block; blocks: Block[]; onUpdate: (id: string, k: string, v: unknown) => void
}) {
  const handlerBlock = blocks.find(b => b.type === 'define_handler' && b.config.name === handlerName)
  const paramsRaw = String(handlerBlock?.config?.params || '[]')
  let params: { name: string; type: string; optional?: boolean }[] = []
  try { const p = JSON.parse(paramsRaw); if (Array.isArray(p)) params = p } catch {}

  if (!handlerBlock) {
    return (
      <div className="p-2 border border-amber-500/20 bg-amber-500/5">
        <p className="text-[10px] text-amber-400/70">Define a "<span className="font-mono">{handlerName}</span>" handler block in the canvas to configure arguments.</p>
      </div>
    )
  }

  if (params.length === 0) {
    return (
      <div className="p-2 border border-border/20 bg-muted/20">
        <p className="text-[9px] text-muted-foreground/50">No parameters for this handler.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-1 border-t border-border/20">
      <p className="text-[10px] font-medium text-muted-foreground/70">Arguments</p>
      {params.map(p => {
        const key = `arg_${p.name}`
        const val = block.config[key] ?? ""
        return (
          <div key={p.name} className="space-y-0.5">
            <Label className="text-[10px] font-medium flex items-center gap-1">
              {p.name}<span className="text-[9px] text-muted-foreground/50">({p.type || 'any'}{p.optional ? ', optional' : ''})</span>
            </Label>
            <Input
              value={String(val)}
              onChange={e => onUpdate(block.id, key, e.target.value)}
              placeholder={p.optional ? `Optional ${p.name}...` : `Enter ${p.name}...`}
              className="h-6 text-[10px]"
            />
          </div>
        )
      })}
    </div>
  )
}

interface ConditionRow {
  op: string
  left: string
  comparison: string
  right: string
}

const COMPARISON_OPTIONS = [
  { label: 'equals (==)', value: 'equals' },
  { label: 'does not equal (!=)', value: 'notEquals' },
  { label: 'is greater than (>)', value: 'greater' },
  { label: 'is less than (<)', value: 'less' },
  { label: 'is greater or equal (>=)', value: 'greaterEqual' },
  { label: 'is less or equal (<=)', value: 'lessEqual' },
  { label: 'contains', value: 'contains' },
  { label: 'is empty', value: 'isEmpty' },
  { label: 'is not empty', value: 'isNotEmpty' },
]

// ─── ConditionsBuilder ──────────────────────────────────────────────
function ConditionsBuilder({ block, onUpdate }: { block: Block; onUpdate: (id: string, k: string, v: unknown) => void }) {
  const raw = String(block.config.conditions || '[]')
  let conditions: ConditionRow[] = []
  try { const p = JSON.parse(raw); if (Array.isArray(p)) conditions = p } catch {}

  const setConditions = (next: ConditionRow[]) => {
    onUpdate(block.id, 'conditions', JSON.stringify(next))
  }

  const addCondition = () => {
    setConditions([...conditions, { op: 'and', left: '', comparison: 'equals', right: '' }])
  }

  const removeCondition = (i: number) => {
    setConditions(conditions.filter((_, idx) => idx !== i))
  }

  const updateCondition = (i: number, key: keyof ConditionRow, value: string) => {
    setConditions(conditions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)))
  }

  return (
    <div className="space-y-3 pt-2 border-t border-border/20">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-muted-foreground/70">Extra conditions</p>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={addCondition}>
          <Plus className="h-3 w-3" /> Add condition
        </Button>
      </div>
      {conditions.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center py-2">No extra conditions yet.</p>
      )}
      {conditions.map((c, i) => (
        <div key={i} className="space-y-1.5 p-2 rounded bg-muted/15 border border-border/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground/50">Condition #{i + 1}</span>
            <Button size="sm" variant="ghost" className="h-5 w-5 text-muted-foreground/50 hover:text-red-400" onClick={() => removeCondition(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            {i === 0 ? (
              <span className="text-[10px] text-muted-foreground/50 w-12 shrink-0">AND/OR</span>
            ) : (
              <Select value={c.op} onValueChange={v => updateCondition(i, 'op', v)}>
                <SelectTrigger className="h-6 w-14 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="and" className="text-[10px]">AND</SelectItem>
                  <SelectItem value="or" className="text-[10px]">OR</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input value={c.left} onChange={e => updateCondition(i, 'left', e.target.value)} placeholder="field" className="h-6 text-[10px] flex-1 min-w-0" />
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={c.comparison} onValueChange={v => updateCondition(i, 'comparison', v)}>
              <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPARISON_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-[10px]">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={c.right} onChange={e => updateCondition(i, 'right', e.target.value)} placeholder="value" className="h-6 text-[10px] flex-1 min-w-0" />
          </div>
        </div>
      ))}
    </div>
  )
}
