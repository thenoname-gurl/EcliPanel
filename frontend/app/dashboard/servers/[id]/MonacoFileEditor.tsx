"use client"

import { useEffect, useState, useRef, lazy, Suspense, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
import { useAuth } from "@/hooks/useAuth"
import { isByoaiConfigured, type ByoaiConfig } from "@/lib/byoai-config"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Loader2,
  WrapText,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Copy,
  Check,
  Search,
  Undo,
  Redo,
  FileCode,
  AlignLeft,
  Send,
  Bot,
  User,
  X,
  ArrowRight,
  Play,
  Minus,
  Plus,
  GitCompare,
} from "lucide-react"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

// ---------------------------------------------------------------------------
// Inject VSCode-style diff decoration CSS once
// ---------------------------------------------------------------------------
const DIFF_STYLE_ID = "monaco-diff-decorations"
function injectDiffStyles() {
  if (typeof document === "undefined") return
  if (document.getElementById(DIFF_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = DIFF_STYLE_ID
  style.textContent = `
    /* Added lines */
    .monaco-diff-added-line {
      background: rgba(40, 167, 69, 0.15) !important;
      border-left: 3px solid #28a745 !important;
    }
    .monaco-diff-added-line-glyph::before {
      content: '+';
      color: #28a745;
      font-weight: bold;
      font-size: 11px;
      line-height: 1;
    }
    /* Removed lines */
    .monaco-diff-removed-line {
      background: rgba(220, 53, 69, 0.15) !important;
      border-left: 3px solid #dc3545 !important;
    }
    .monaco-diff-removed-line-glyph::before {
      content: '-';
      color: #dc3545;
      font-weight: bold;
      font-size: 11px;
      line-height: 1;
    }
    /* Modified lines */
    .monaco-diff-modified-line {
      background: rgba(255, 193, 7, 0.12) !important;
      border-left: 3px solid #ffc107 !important;
    }
    .monaco-diff-modified-line-glyph::before {
      content: '~';
      color: #ffc107;
      font-weight: bold;
      font-size: 11px;
      line-height: 1;
    }
  `
  document.head.appendChild(style)
}

interface MonacoFileEditorProps {
  value: string
  onChange: (v: string | undefined) => void
  language: string
  editorSettings?: EditorSettings
  filePath?: string
  fileName?: string
}

interface CursorPosition {
  line: number
  column: number
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
interface EditorToolbarProps {
  language: string
  fileName?: string
  cursorPosition: CursorPosition
  lineCount: number
  wordWrap: boolean
  onWordWrapToggle: () => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  aiEnabled: boolean
  aiChatOpen: boolean
  onToggleAiChat: () => void
  onUndo: () => void
  onRedo: () => void
  onSearch: () => void
  onCopy: () => void
  copied: boolean
}

function EditorToolbar({
  language,
  fileName,
  cursorPosition,
  lineCount,
  wordWrap,
  onWordWrapToggle,
  fontSize,
  onFontSizeChange,
  aiEnabled,
  aiChatOpen,
  onToggleAiChat,
  onUndo,
  onRedo,
  onSearch,
  onCopy,
  copied,
}: EditorToolbarProps) {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-2 py-1.5 sm:px-3 overflow-x-auto shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileCode className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="font-mono uppercase">{language}</span>
        </div>
        {fileName && (
          <>
            <div className="hidden sm:block h-4 w-px bg-border" />
            <span className="hidden sm:inline text-xs text-muted-foreground font-mono truncate max-w-[160px]" title={fileName}>
              {fileName}
            </span>
          </>
        )}
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlignLeft className="h-3.5 w-3.5" />
          <span>{t("position.lineCol", { line: cursorPosition.line, col: cursorPosition.column })}</span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-border" />
        <span className="hidden sm:inline text-xs text-muted-foreground">
          {t("position.lines", { count: lineCount })}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {aiEnabled && (
          <button
            onClick={onToggleAiChat}
            className={cn(
              "p-1.5 rounded transition-colors flex items-center gap-1",
              aiChatOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
            title={aiChatOpen ? "Close AI chat" : "Open AI chat"}
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}
        <button onClick={onUndo} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:hidden" title={t("actions.undo")}>
          <Undo className="h-4 w-4" />
        </button>
        <button onClick={onRedo} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:hidden" title={t("actions.redo")}>
          <Redo className="h-4 w-4" />
        </button>
        <div className="h-4 w-px bg-border sm:hidden mx-1" />
        <div className="hidden sm:flex items-center gap-1 mr-1">
          <button onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={t("actions.decreaseFont")}>
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-muted-foreground w-6 text-center font-mono">{fontSize}</span>
          <button onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={t("actions.increaseFont")}>
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="hidden sm:block h-4 w-px bg-border mx-1" />
        <button
          onClick={onWordWrapToggle}
          className={cn("p-1.5 rounded transition-colors", wordWrap ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}
          title={wordWrap ? t("actions.disableWrap") : t("actions.enableWrap")}
        >
          <WrapText className="h-4 w-4" />
        </button>
        <button onClick={onSearch} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={t("actions.search")}>
          <Search className="h-4 w-4" />
        </button>
        <button onClick={onCopy} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={t("actions.copyAll")}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function MobilePositionBar({ cursorPosition, lineCount }: { cursorPosition: CursorPosition; lineCount: number }) {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex sm:hidden items-center justify-between border-t border-border bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground shrink-0">
      <span>{t("position.lineCol", { line: cursorPosition.line, col: cursorPosition.column })}</span>
      <span>{t("position.lines", { count: lineCount })}</span>
    </div>
  )
}

function EditorLoadingFallback() {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#1e1e1e]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{t("states.loadingEditor")}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------
interface DiffHunkLine {
  type: "context" | "added" | "removed"
  content: string
  oldLineNo: number | null
  newLineNo: number | null
}

interface DiffHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffHunkLine[]
}

interface ParsedDiff {
  hunks: DiffHunk[]
  raw: string
}

function parseUnifiedDiff(diffText: string): ParsedDiff {
  const hunks: DiffHunk[] = []
  const lines = diffText.split("\n")
  let currentHunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk)
      oldLine = parseInt(hunkMatch[1])
      newLine = parseInt(hunkMatch[3])
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2]) : 1,
        newStart: parseInt(hunkMatch[3]),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4]) : 1,
        lines: [],
      }
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "added", content: line.slice(1), oldLineNo: null, newLineNo: newLine++ })
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "removed", content: line.slice(1), oldLineNo: oldLine++, newLineNo: null })
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line
      currentHunk.lines.push({ type: "context", content, oldLineNo: oldLine++, newLineNo: newLine++ })
    }
  }

  if (currentHunk) hunks.push(currentHunk)
  return { hunks, raw: diffText }
}

function applyUnifiedDiff(original: string, diff: ParsedDiff): string {
  if (diff.hunks.length === 0) return original
  const origLines = original.split("\n")
  const result: string[] = []
  let origIdx = 0

  for (const hunk of diff.hunks) {
    const hunkStart = hunk.oldStart - 1
    while (origIdx < hunkStart) {
      result.push(origLines[origIdx] ?? "")
      origIdx++
    }
    for (const line of hunk.lines) {
      if (line.type === "context") {
        result.push(origLines[origIdx] ?? line.content)
        origIdx++
      } else if (line.type === "removed") {
        origIdx++
      } else if (line.type === "added") {
        result.push(line.content)
      }
    }
  }

  while (origIdx < origLines.length) {
    result.push(origLines[origIdx++])
  }
  return result.join("\n")
}

// ---------------------------------------------------------------------------
// Block extraction
// ---------------------------------------------------------------------------
interface ContentBlock {
  type: "code" | "diff"
  lang: string
  content: string
  fullMatch: string
}

function extractBlocks(md: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(md)) !== null) {
    const lang = match[1] || ""
    const code = match[2].trimEnd()
    const isDiff =
      lang === "diff" ||
      lang === "patch" ||
      /^@@\s+-\d/.test(code) ||
      /\n@@\s+-\d/.test(code) ||
      (code.includes("--- ") && code.includes("+++ ") && code.includes("@@"))
    blocks.push({
      type: isDiff ? "diff" : "code",
      lang: isDiff ? "diff" : lang,
      content: code,
      fullMatch: match[0],
    })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Diff block viewer — GitHub / VSCode style
// ---------------------------------------------------------------------------
function DiffBlockView({
  msgId,
  block,
  justApplied,
  onPreview,
  onApply,
}: {
  msgId: string
  block: ContentBlock
  justApplied: boolean
  onPreview: () => void
  onApply: () => void
}) {
  const parsed = parseUnifiedDiff(block.content)
  const totalAdded = parsed.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "added").length, 0)
  const totalRemoved = parsed.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "removed").length, 0)

  return (
    <div className="my-2 rounded overflow-hidden border border-[#30363d] bg-[#0d1117] text-[11px] font-mono">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-3">
          <GitCompare className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-green-400 font-semibold">+{totalAdded}</span>
          <span className="text-red-400 font-semibold">-{totalRemoved}</span>
          <span className="text-muted-foreground/50 text-[10px]">
            {parsed.hunks.length} hunk{parsed.hunks.length !== 1 ? "s" : ""}
          </span>
        </div>
        {justApplied ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-400">
            <Check className="h-2.5 w-2.5" /> Applied
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={onPreview} className="px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 rounded transition-colors">
              Preview
            </button>
            <button onClick={onApply} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-primary hover:text-primary/80 hover:bg-primary/10 rounded transition-colors">
              <Play className="h-2.5 w-2.5" /> Apply
            </button>
          </div>
        )}
      </div>

      {/* Hunks */}
      <div className="overflow-x-auto">
        {parsed.hunks.map((hunk, hi) => (
          <div key={`${msgId}-h${hi}`}>
            {/* Hunk header */}
            <div className="flex items-center gap-0 bg-[#1f2938] border-y border-[#30363d] select-none">
              {/* gutter placeholders */}
              <span className="w-10 shrink-0 border-r border-[#30363d]" />
              <span className="w-10 shrink-0 border-r border-[#30363d]" />
              <span className="w-5 shrink-0" />
              <span className="px-2 py-0.5 text-[10px] text-blue-400/80 font-mono">{hunk.header}</span>
            </div>

            {/* Lines */}
            {hunk.lines.map((line, li) => {
              const isAdded = line.type === "added"
              const isRemoved = line.type === "removed"
              return (
                <div
                  key={`${msgId}-h${hi}-l${li}`}
                  className={cn(
                    "flex items-stretch min-w-0 leading-5",
                    isAdded && "bg-[rgba(46,160,67,0.15)]",
                    isRemoved && "bg-[rgba(248,81,73,0.15)]",
                  )}
                >
                  {/* Old line number */}
                  <span className={cn(
                    "select-none w-10 shrink-0 text-right pr-2 py-px border-r border-[#30363d] text-[10px] leading-5",
                    isAdded ? "bg-transparent text-transparent" : "text-[#6e7681]",
                    isRemoved && "bg-[rgba(248,81,73,0.08)]"
                  )}>
                    {line.oldLineNo ?? ""}
                  </span>

                  {/* New line number */}
                  <span className={cn(
                    "select-none w-10 shrink-0 text-right pr-2 py-px border-r border-[#30363d] text-[10px] leading-5",
                    isRemoved ? "bg-transparent text-transparent" : "text-[#6e7681]",
                    isAdded && "bg-[rgba(46,160,67,0.08)]"
                  )}>
                    {line.newLineNo ?? ""}
                  </span>

                  {/* Sign column */}
                  <span className={cn(
                    "select-none w-5 shrink-0 text-center py-px leading-5 font-bold",
                    isAdded && "text-green-500 bg-[rgba(46,160,67,0.2)]",
                    isRemoved && "text-red-400 bg-[rgba(248,81,73,0.2)]",
                    !isAdded && !isRemoved && "text-[#6e7681]"
                  )}>
                    {isAdded ? "+" : isRemoved ? "-" : " "}
                  </span>

                  {/* Code */}
                  <span className={cn(
                    "flex-1 py-px pl-2 pr-4 whitespace-pre leading-5",
                    isAdded && "text-[#aff5b4]",
                    isRemoved && "text-[#ffdcd7]",
                    !isAdded && !isRemoved && "text-[#e6edf3]"
                  )}>
                    {line.content || " "}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Chat Panel
// ---------------------------------------------------------------------------
function AIChatPanel({
  open,
  filePath,
  fileName,
  language,
  value,
  onChange,
  useByoai,
  onClose,
  onPreview,
}: {
  open: boolean
  filePath?: string
  fileName?: string
  language: string
  value: string
  onChange: (v: string | undefined) => void
  useByoai: boolean
  onClose: () => void
  onPreview?: (content: string) => void
}) {
  const t = useTranslations("serverMonacoEditor")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [appliedBlock, setAppliedBlock] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  const displayName = fileName || filePath?.split("/").pop() || "file"

  const SYSTEM_PROMPT = [
    `You are an AI code editor agent. You have access to the file the user is editing.`,
    `File: ${filePath || "unknown"}`,
    `Language: ${language}`,
    `Current file content:`,
    `\`\`\`${language}`,
    value,
    `\`\`\``,
    `Rules:`,
    `- For TARGETED edits, return a UNIFIED DIFF. Use \`\`\`diff with proper @@ -l,c +l,c @@ hunk headers.`,
    `  Always include at least 3 lines of context around changes. Lines starting with ' ' are context, '-' are removed, '+' are added.`,
    `- For LARGE changes (rewriting most of the file), return the COMPLETE updated file in a \`\`\`${language} block.`,
    `- Unified diff format:`,
    `  \`\`\`diff`,
    `  --- a/${fileName || "file"}`,
    `  +++ b/${fileName || "file"}`,
    `  @@ -10,6 +10,8 @@`,
    `   context line`,
    `  -removed line`,
    `  +added line`,
    `   context line`,
    `  \`\`\``,
    `- Explain changes briefly before the code block.`,
    `- Keep responses concise and actionable.`,
  ].join("\n")

  const send = async () => {
    if (!input.trim() || sending) return
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setSending(true)
    try {
      const payload = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...newMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ]
      const endpoint = useByoai ? API_ENDPOINTS.byoaiChatCompletions : API_ENDPOINTS.openaiChat
      const res = await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ messages: payload }), timeout: 120000 })
      const aiText = res?.choices?.[0]?.message?.content || res?.choices?.[0]?.text || res?.reply || JSON.stringify(res)
      setMessages([...newMessages, { id: (Date.now() + 1).toString(), role: "assistant", content: String(aiText) }])
    } catch (err: any) {
      setMessages([...newMessages, { id: (Date.now() + 1).toString(), role: "assistant", content: `Error: ${err?.message || "Failed to get response"}` }])
    } finally {
      setSending(false)
    }
  }

  const previewBlock = useCallback((block: ContentBlock) => {
    if (!onPreview) return
    if (block.type === "diff") {
      const parsed = parseUnifiedDiff(block.content)
      if (parsed.hunks.length === 0) return
      onPreview(applyUnifiedDiff(value, parsed))
    } else {
      onPreview(block.content)
    }
  }, [onPreview, value])

  const applyBlock = useCallback((block: ContentBlock) => {
    if (block.type === "diff") {
      const parsed = parseUnifiedDiff(block.content)
      if (parsed.hunks.length === 0) return
      onChange(applyUnifiedDiff(value, parsed))
    } else {
      onChange(block.content)
    }
    setAppliedBlock(block.content)
    setTimeout(() => setAppliedBlock(null), 2000)
  }, [onChange, value])

  return (
    <div className={cn(
      "flex flex-col border-l border-border bg-card/80 backdrop-blur-sm transition-all duration-200",
      // CRITICAL: these ensure the panel never grows taller than its flex parent
      "h-full max-h-full overflow-hidden",
      open ? "w-80 sm:w-96 min-w-[300px]" : "w-0 border-l-0 min-w-0"
    )}>
      {/* Header — fixed height */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-secondary/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center bg-primary/10 rounded shrink-0">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">AI Agent</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages — ONLY this div scrolls */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 min-h-0">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-2">
            <Bot className="h-8 w-8 text-muted-foreground/30" />
            <div>
              <p className="text-xs font-medium text-foreground">AI Code Agent</p>
              <p className="text-[11px] text-muted-foreground mt-1">Ask me to edit, fix, or explain this file.</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {["Fix all errors in this file", "Add error handling", "Refactor for better performance", "Explain what this code does"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => document.getElementById("ai-chat-input")?.focus(), 50) }}
                  className="text-left text-[11px] text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 border border-border/50 px-2.5 py-1.5 rounded-sm transition-colors"
                >
                  <ArrowRight className="h-3 w-3 inline mr-1.5 text-primary/50" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const blocks = msg.role === "assistant" ? extractBlocks(msg.content) : []
          return (
            <div key={msg.id} className={cn("flex gap-1.5", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn("flex h-5 w-5 items-center justify-center rounded-full shrink-0 mt-0.5", msg.role === "assistant" ? "bg-primary/10" : "bg-secondary/50")}>
                {msg.role === "assistant" ? <Bot className="h-3 w-3 text-primary" /> : <User className="h-3 w-3 text-foreground" />}
              </div>
              <div className={cn(
                "min-w-0 max-w-[90%] px-2.5 py-2 text-xs leading-relaxed rounded-sm",
                msg.role === "assistant" ? "bg-secondary/30 border border-border/50" : "bg-primary/10 border border-primary/20"
              )}>
                {blocks.length > 0 ? (() => {
                  let remaining = msg.content
                  const parts: React.ReactNode[] = []
                  let bi = 0
                  for (const block of blocks) {
                    const idx = remaining.indexOf(block.fullMatch)
                    if (idx === -1) continue
                    if (idx > 0) {
                      parts.push(
                        <div key={`${msg.id}-t${bi}`} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{remaining.slice(0, idx)}</ReactMarkdown>
                        </div>
                      )
                    }
                    const justApplied = appliedBlock === block.content
                    if (block.type === "diff") {
                      parts.push(
                        <DiffBlockView
                          key={`${msg.id}-d${bi}`}
                          msgId={`${msg.id}-${bi}`}
                          block={block}
                          justApplied={justApplied}
                          onPreview={() => previewBlock(block)}
                          onApply={() => applyBlock(block)}
                        />
                      )
                    } else {
                      parts.push(
                        <div key={`${msg.id}-c${bi}`} className="my-1.5 border border-[#30363d] bg-[#0d1117] overflow-hidden rounded">
                          {block.lang && (
                            <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-[#30363d]">
                              <span className="text-[10px] text-muted-foreground font-mono uppercase">{block.lang}</span>
                              {justApplied ? (
                                <span className="flex items-center gap-1 text-[10px] text-green-400"><Check className="h-2.5 w-2.5" /> Applied</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => previewBlock(block)} className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">Preview</button>
                                  <button onClick={() => applyBlock(block)} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-primary hover:text-primary/80 transition-colors">
                                    <Play className="h-2.5 w-2.5" /> Apply
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <pre className="p-3 overflow-x-auto text-[11px] font-mono text-[#e6edf3] whitespace-pre leading-5">{block.content}</pre>
                        </div>
                      )
                    }
                    remaining = remaining.slice(idx + block.fullMatch.length)
                    bi++
                  }
                  if (remaining.trim()) {
                    parts.push(
                      <div key={`${msg.id}-tend`} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{remaining}</ReactMarkdown>
                      </div>
                    )
                  }
                  return parts
                })() : (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 shrink-0 mt-0.5">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-secondary/30 border border-border/50 rounded-sm px-2.5 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — fixed at bottom */}
      <div className="border-t border-border p-2 shrink-0">
        <div className="flex gap-1.5">
          <input
            id="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask AI to edit this file..."
            className="flex-1 border border-border bg-background/80 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors rounded-sm"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-all",
              input.trim() && !sending ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-secondary/30 text-muted-foreground/40"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------
export function MonacoFileEditor({ value, onChange, language, editorSettings, filePath, fileName }: MonacoFileEditorProps) {
  const settings = { ...DEFAULT_EDITOR_SETTINGS, ...(editorSettings || {}) }
  const { user } = useAuth()
  const byoaiConfig = user?.settings?.byoai as ByoaiConfig | undefined
  const useByoai = isByoaiConfigured(byoaiConfig)

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 })
  const [lineCount, setLineCount] = useState(1)
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState<number>(settings.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize ?? 14)
  const [copied, setCopied] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const previewDecorationsRef = useRef<string[]>([])

  // Inject diff CSS on mount
  useEffect(() => { injectDiffStyles() }, [])

  // ------------------------------------------------------------------
  // VSCode-style diff decorations using Monaco decoration API
  // ------------------------------------------------------------------
  const applyDiffDecorations = useCallback((original: string, modified: string) => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const origLines = original.split("\n")
    const modLines = modified.split("\n")
    const decorations: any[] = []

    const maxLen = Math.max(origLines.length, modLines.length)

    // Simple line-by-line comparison to highlight changed lines
    // The editor shows `modified` content, so we decorate based on modLines positions
    for (let i = 0; i < modLines.length; i++) {
      const modLine = modLines[i]
      const origLine = origLines[i]

      if (origLine === undefined) {
        // Line was added
        decorations.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: "monaco-diff-added-line",
            glyphMarginClassName: "monaco-diff-added-line-glyph",
            overviewRuler: { color: "rgba(40,167,69,0.7)", position: monaco.editor.OverviewRulerLane.Full },
            minimap: { color: "rgba(40,167,69,0.6)", position: 1 },
            linesDecorationsClassName: "border-l-2 border-green-500",
          },
        })
      } else if (modLine !== origLine) {
        // Line was modified
        decorations.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: "monaco-diff-modified-line",
            glyphMarginClassName: "monaco-diff-modified-line-glyph",
            overviewRuler: { color: "rgba(255,193,7,0.7)", position: monaco.editor.OverviewRulerLane.Full },
            minimap: { color: "rgba(255,193,7,0.6)", position: 1 },
          },
        })
      }
    }

    // Mark lines that were removed (can't show in the editor directly since they don't exist,
    // but we mark the line before where they were removed with a special decoration)
    for (let i = modLines.length; i < origLines.length; i++) {
      const markAt = Math.max(1, modLines.length)
      const exists = decorations.find(d => d.range.startLineNumber === markAt && d.options.afterContentClassName)
      if (!exists) {
        decorations.push({
          range: new monaco.Range(markAt, 1, markAt, 1),
          options: {
            isWholeLine: false,
            afterContentClassName: "monaco-diff-deleted-marker",
            overviewRuler: { color: "rgba(220,53,69,0.7)", position: monaco.editor.OverviewRulerLane.Full },
          },
        })
      }
    }

    previewDecorationsRef.current = editor.deltaDecorations(previewDecorationsRef.current, decorations)
  }, [])

  const clearPreviewDecorations = useCallback(() => {
    if (editorRef.current) {
      previewDecorationsRef.current = editorRef.current.deltaDecorations(previewDecorationsRef.current, [])
    }
  }, [])

  useEffect(() => { setLineCount(value.split("\n").length) }, [value])

  useEffect(() => {
    if (previewMode && previewContent !== null) {
      // Small delay to let Monaco re-render with the new content first
      const t = setTimeout(() => applyDiffDecorations(value, previewContent), 50)
      return () => clearTimeout(t)
    } else {
      clearPreviewDecorations()
    }
  }, [previewMode, previewContent, value, applyDiffDecorations, clearPreviewDecorations])

  const handleWordWrapToggle = useCallback(() => {
    setWordWrap((p) => { const n = !p; editorRef.current?.updateOptions({ wordWrap: n ? "on" : "off" }); return n })
  }, [])

  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size); editorRef.current?.updateOptions({ fontSize: size })
  }, [])

  const handleUndo = useCallback(() => editorRef.current?.trigger("keyboard", "undo", {}), [])
  const handleRedo = useCallback(() => editorRef.current?.trigger("keyboard", "redo", {}), [])
  const handleSearch = useCallback(() => editorRef.current?.trigger("keyboard", "actions.find", {}), [])

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(value) } catch {
      const ta = document.createElement("textarea"); ta.value = value
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }, [value])

  const handlePreview = useCallback((content: string) => {
    setPreviewContent(content); setPreviewMode(true)
  }, [])

  const handleApplyPreview = useCallback(() => {
    if (previewContent !== null) onChange(previewContent)
    clearPreviewDecorations(); setPreviewMode(false); setPreviewContent(null)
  }, [previewContent, onChange, clearPreviewDecorations])

  const handleRevertPreview = useCallback(() => {
    clearPreviewDecorations(); setPreviewMode(false); setPreviewContent(null)
  }, [clearPreviewDecorations])

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPosition({ line: e.position.lineNumber, column: e.position.column })
    })
    editor.onDidChangeModelContent(() => {
      setLineCount(editor.getModel()?.getLineCount() || 1)
    })
    if (typeof window !== "undefined" && window.innerWidth >= 640) editor.focus()
  }, [])

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 overflow-hidden">
      <EditorToolbar
        language={language}
        fileName={fileName}
        cursorPosition={cursorPosition}
        lineCount={lineCount}
        wordWrap={wordWrap}
        onWordWrapToggle={handleWordWrapToggle}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
        aiEnabled={!!settings.aiAssistant}
        aiChatOpen={aiChatOpen}
        onToggleAiChat={() => setAiChatOpen((v) => !v)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSearch={handleSearch}
        onCopy={handleCopy}
        copied={copied}
      />

      {previewMode && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
          <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
            <GitCompare className="h-3 w-3" /> Previewing AI changes — highlighted lines show modifications
          </span>
          <div className="flex items-center gap-2">
            <button onClick={handleRevertPreview} className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors">
              Revert
            </button>
            <button onClick={handleApplyPreview} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Apply Changes
            </button>
          </div>
        </div>
      )}

      {/*
        THE KEY FIX:
        - `flex-1 min-h-0` lets this row fill remaining space without overflowing the parent column
        - `overflow-hidden` hard-clips anything that tries to escape (AI panel content, etc.)
        - Monaco gets `height="100%"` — no JS measurement needed, pure CSS sizing
        - AIChatPanel gets `h-full` so it matches the row exactly
      */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Monaco wrapper — flex-1 so it takes remaining width, overflow-hidden to clip */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <Suspense fallback={<EditorLoadingFallback />}>
            <MonacoEditor
              height="100%"
              language={language}
              value={previewMode ? (previewContent ?? value) : value}
              onChange={(v) => {
                if (previewMode) { setPreviewMode(false); setPreviewContent(null) }
                onChange(v)
              }}
              theme="vs-dark"
              onMount={handleEditorMount}
              loading={<EditorLoadingFallback />}
              options={{
                minimap: { enabled: !isMobile && !!settings.minimap },
                fontSize,
                fontFamily: settings.fontFamily,
                scrollBeyondLastLine: false,
                wordWrap: wordWrap ? "on" : "off",
                lineNumbers: "on",
                renderWhitespace: "selection",
                tabSize: settings.tabSize,
                insertSpaces: settings.insertSpaces,
                autoIndent: settings.autoIndent ? "full" : "none",
                formatOnType: settings.formatOnType,
                formatOnPaste: settings.formatOnPaste,
                padding: { top: 12, bottom: 12 },
                lineNumbersMinChars: isMobile ? 3 : 5,
                folding: !isMobile,
                glyphMargin: !isMobile,
                lineDecorationsWidth: isMobile ? 0 : 10,
                scrollbar: {
                  verticalScrollbarSize: isMobile ? 8 : 14,
                  horizontalScrollbarSize: isMobile ? 8 : 14,
                  useShadows: false,
                },
                overviewRulerLanes: isMobile ? 0 : 3,
                hideCursorInOverviewRuler: isMobile,
                renderLineHighlight: "line",
                cursorBlinking: "smooth",
                smoothScrolling: true,
                mouseWheelZoom: true,
                dragAndDrop: true,
                links: true,
                contextmenu: true,
              }}
            />
          </Suspense>
        </div>

        <AIChatPanel
          open={aiChatOpen}
          filePath={filePath}
          fileName={fileName}
          language={language}
          value={value}
          onChange={onChange}
          useByoai={useByoai}
          onClose={() => setAiChatOpen(false)}
          onPreview={handlePreview}
        />
      </div>

      <MobilePositionBar cursorPosition={cursorPosition} lineCount={lineCount} />
    </div>
  )
}