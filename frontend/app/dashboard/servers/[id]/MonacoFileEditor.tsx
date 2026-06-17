"use client"

import { useEffect, useState, useRef, lazy, Suspense, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
import { useAuth } from "@/hooks/useAuth"
import { isByoaiConfigured, type ByoaiConfig } from "@/lib/byoai-config"
import { cn } from "@/lib/utils"
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
} from "lucide-react"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

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
  copied
}: EditorToolbarProps) {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-2 py-1.5 sm:px-3 overflow-x-auto">
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
              aiChatOpen
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
            title={aiChatOpen ? "Close AI chat" : "Open AI chat"}
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={onUndo}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:hidden"
          title={t("actions.undo")}
        >
          <Undo className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:hidden"
          title={t("actions.redo")}
        >
          <Redo className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-border sm:hidden mx-1" />

        <div className="hidden sm:flex items-center gap-1 mr-1">
          <button
            onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={t("actions.decreaseFont")}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-muted-foreground w-6 text-center font-mono">
            {fontSize}
          </span>
          <button
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={t("actions.increaseFont")}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="hidden sm:block h-4 w-px bg-border mx-1" />

        <button
          onClick={onWordWrapToggle}
          className={cn(
            "p-1.5 rounded transition-colors",
            wordWrap
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
          title={wordWrap ? t("actions.disableWrap") : t("actions.enableWrap")}
        >
          <WrapText className="h-4 w-4" />
        </button>

        <button
          onClick={onSearch}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={t("actions.search")}
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          onClick={onCopy}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={t("actions.copyAll")}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}

interface MobilePositionBarProps {
  cursorPosition: CursorPosition
  lineCount: number
}

function MobilePositionBar({ cursorPosition, lineCount }: MobilePositionBarProps) {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex sm:hidden items-center justify-between border-t border-border bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{t("position.lineCol", { line: cursorPosition.line, col: cursorPosition.column })}</span>
      <span>{t("position.lines", { count: lineCount })}</span>
    </div>
  )
}

function EditorLoadingFallback() {
  const t = useTranslations("serverMonacoEditor")
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-[#1e1e1e]">
      <Loader2 className="h-6 w-6 rounded-full animate-spin text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{t("states.loadingEditor")}</p>
    </div>
  )
}

interface DiffHunkLine {
  type: "context" | "added" | "removed"
  content: string
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

  for (const line of lines) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] || "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] || "1"),
        lines: [],
      }
      continue
    }
    if (!currentHunk) continue
    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "added", content: line.slice(1) })
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "removed", content: line.slice(1) })
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line })
    }
  }
  if (currentHunk) hunks.push(currentHunk)
  return { hunks, raw: diffText }
}

function applyUnifiedDiff(original: string, diff: ParsedDiff): string {
  const origLines = original.split("\n")
  const result: string[] = []
  let origIdx = 0

  for (const hunk of diff.hunks) {
    while (origIdx < hunk.oldStart - 1) {
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
    result.push(origLines[origIdx])
    origIdx++
  }
  return result.join("\n")
}

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
      code.includes("\n@@ -") ||
      code.startsWith("@@ -") ||
      (code.includes("\n--- ") && code.includes("\n+++ "))
    blocks.push({
      type: isDiff ? "diff" : "code",
      lang: isDiff ? "diff" : lang,
      content: code,
      fullMatch: match[0],
    })
  }
  return blocks
}

function AIChatPanel({
  open,
  filePath,
  fileName,
  language,
  value,
  onChange,
  useByoai,
  onClose,
}: {
  open: boolean
  filePath?: string
  fileName?: string
  language: string
  value: string
  onChange: (v: string | undefined) => void
  useByoai: boolean
  onClose: () => void
}) {
  const t = useTranslations("serverMonacoEditor")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [appliedBlock, setAppliedBlock] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const displayName = fileName || filePath?.split("/").pop() || "file"

  const SYSTEM_PROMPT = [
    `You are an AI code editor agent. You have access to the file the user is editing.`,
    ``,
    `File: ${filePath || "unknown"}`,
    `Language: ${language}`,
    `Current file content:`,
    `\`\`\`${language}`,
    value,
    `\`\`\``,
    ``,
    `Rules:`,
    `- For TARGETED edits (changing a few lines, fixing a function, adding a block), return a UNIFIED DIFF block. Use \`\`\`diff with proper @@ -l,c +l,c @@ hunk headers. Only include the changed lines and surrounding context.`,
    `- For LARGE changes (rewriting most of the file, complete refactors), return the COMPLETE updated file in a \`\`\`${language} code block.`,
    `- Unified diff format:`,
    `  \`\`\`diff`,
    `  --- a/${fileName || "file"}`,
    `  +++ b/${fileName || "file"}`,
    `  @@ -10,6 +10,8 @@`,
    `   unchanged context line`,
    `  -removed line`,
    `  +added line`,
    `   unchanged context line`,
    `  \`\`\``,
    `- Explain your changes briefly before the diff or code block`,
    `- If the user asks a question, answer helpfully and include code examples if relevant`,
    `- Keep responses concise and actionable`,
  ].join("\n")

  const send = async () => {
    if (!input.trim() || sending) return
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setSending(true)

    try {
      const payload: { role: string; content: string }[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...newMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" as const : "user" as const,
          content: m.content,
        })),
      ]

      const endpoint = useByoai ? API_ENDPOINTS.byoaiChatCompletions : API_ENDPOINTS.openaiChat
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ messages: payload }),
        timeout: 120000,
      })

      const aiText =
        res?.choices?.[0]?.message?.content ||
        res?.choices?.[0]?.text ||
        res?.reply ||
        JSON.stringify(res)
      setMessages([...newMessages, { id: (Date.now() + 1).toString(), role: "assistant", content: String(aiText) }])
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${err?.message || "Failed to get response"}`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const applyBlock = (block: ContentBlock) => {
    if (block.type === "diff") {
      const parsed = parseUnifiedDiff(block.content)
      if (parsed.hunks.length === 0) return
      const result = applyUnifiedDiff(value, parsed)
      onChange(result)
      setAppliedBlock(block.content)
      setTimeout(() => setAppliedBlock(null), 2000)
    } else {
      onChange(block.content)
      setAppliedBlock(block.content)
      setTimeout(() => setAppliedBlock(null), 2000)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col border-l border-border bg-card/80 backdrop-blur-sm transition-all duration-200 overflow-hidden",
        open ? "w-80 sm:w-96" : "w-0 border-l-0"
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 bg-secondary/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center bg-primary/10 rounded">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">AI Agent</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-2">
            <Bot className="h-8 w-8 text-muted-foreground/30" />
            <div>
              <p className="text-xs font-medium text-foreground">AI Code Agent</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Ask me to edit, fix, or explain this file. I can see the full code and will return the updated file.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {[
                "Fix all errors in this file",
                "Add error handling",
                "Refactor for better performance",
                "Explain what this code does",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); setTimeout(() => document.getElementById("ai-chat-input")?.focus(), 50) }}
                  className="text-left text-[11px] text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 border border-border/50 px-2.5 py-1.5 transition-colors truncate"
                >
                  <ArrowRight className="h-3 w-3 inline mr-1.5 text-primary/50" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const blocks = msg.role === "assistant" ? extractBlocks(msg.content) : []

          return (
            <div key={msg.id} className={cn("flex gap-1.5", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full shrink-0 mt-0.5",
                msg.role === "assistant" ? "bg-primary/10" : "bg-secondary/50"
              )}>
                {msg.role === "assistant"
                  ? <Bot className="h-3 w-3 text-primary" />
                  : <User className="h-3 w-3 text-foreground" />
                }
              </div>
              <div className={cn(
                "min-w-0 max-w-[90%] px-2.5 py-2 text-xs leading-relaxed",
                msg.role === "assistant"
                  ? "bg-secondary/30 border border-border/50"
                  : "bg-primary/10 border border-primary/20 text-foreground"
              )}>
                <div className="whitespace-pre-wrap break-words">
                  {blocks.length > 0 ? (
                    (() => {
                      let remaining = msg.content
                      const parts: React.ReactNode[] = []
                      let blockIndex = 0

                      for (const block of blocks) {
                        const idx = remaining.indexOf(block.fullMatch)
                        if (idx === -1) continue
                        if (idx > 0) {
                          parts.push(<span key={`${msg.id}-text-${blockIndex}`}>{remaining.slice(0, idx)}</span>)
                        }
                        const justApplied = appliedBlock === block.content
                        if (block.type === "diff") {
                          const parsed = parseUnifiedDiff(block.content)
                          const totalChanges = parsed.hunks.reduce((sum, h) =>
                            sum + h.lines.filter(l => l.type === "added" || l.type === "removed").length, 0
                          )
                          parts.push(
                            <div key={`${msg.id}-diff-${blockIndex}`} className="my-1.5 border border-border bg-background/50 overflow-hidden">
                              <div className="flex items-center justify-between px-2 py-0.5 bg-secondary/50 border-b border-border">
                                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                  <span className="text-green-400/70"><Plus className="h-2.5 w-2.5 inline" /></span>
                                  <span className="text-red-400/70"><Minus className="h-2.5 w-2.5 inline" /></span>
                                  {parsed.hunks.length} hunk{parsed.hunks.length !== 1 ? "s" : ""} &middot; {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                                </span>
                                <button
                                  onClick={() => applyBlock(block)}
                                  className={cn(
                                    "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                                    justApplied
                                      ? "text-green-400"
                                      : "text-primary hover:text-primary/80"
                                  )}
                                >
                                  {justApplied ? (
                                    <><Check className="h-2.5 w-2.5" /> Applied</>
                                  ) : (
                                    <><Play className="h-2.5 w-2.5" /> Apply</>
                                  )}
                                </button>
                              </div>
                              <div className="overflow-x-auto text-[11px] font-mono leading-relaxed">
                                {parsed.hunks.flatMap((hunk, hi) => {
                                  const result: React.ReactNode[] = [
                                    <div key={`${msg.id}-hunk-${hi}-hdr`} className="px-2 py-0.5 bg-primary/5 text-[10px] text-primary/60 border-b border-border/50">
                                      {hunk.header}
                                    </div>,
                                  ]
                                  hunk.lines.forEach((line, li) => {
                                    const bg =
                                      line.type === "added" ? "bg-green-500/10 text-green-300/80" :
                                      line.type === "removed" ? "bg-red-500/10 text-red-300/80" :
                                      ""
                                    const prefix =
                                      line.type === "added" ? "+" :
                                      line.type === "removed" ? "-" :
                                      " "
                                    result.push(
                                      <div key={`${msg.id}-hunk-${hi}-l${li}`} className={cn("px-2 py-px whitespace-pre", bg)}>
                                        <span className="select-none w-4 inline-block text-muted-foreground/50">{prefix}</span>
                                        {line.content}
                                      </div>
                                    )
                                  })
                                  return result
                                })}
                              </div>
                            </div>
                          )
                        } else {
                          parts.push(
                            <div key={`${msg.id}-code-${blockIndex}`} className="my-1.5 border border-border bg-background/50 overflow-hidden">
                              {block.lang && (
                                <div className="flex items-center justify-between px-2 py-0.5 bg-secondary/50 border-b border-border">
                                  <span className="text-[10px] text-muted-foreground font-mono uppercase">{block.lang}</span>
                                  <button
                                    onClick={() => applyBlock(block)}
                                    className={cn(
                                      "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                                      justApplied
                                        ? "text-green-400"
                                        : "text-primary hover:text-primary/80"
                                    )}
                                  >
                                    {justApplied ? (
                                      <><Check className="h-2.5 w-2.5" /> Applied</>
                                    ) : (
                                      <><Play className="h-2.5 w-2.5" /> Apply</>
                                    )}
                                  </button>
                                </div>
                              )}
                              <pre className="p-2 overflow-x-auto text-[11px] font-mono text-foreground/80 whitespace-pre">{block.content}</pre>
                            </div>
                          )
                        }
                        remaining = remaining.slice(idx + block.fullMatch.length)
                        blockIndex++
                      }
                      if (remaining.trim()) {
                        parts.push(<span key={`${msg.id}-text-end`}>{remaining}</span>)
                      }
                      return parts
                    })()
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 shrink-0 mt-0.5">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-secondary/30 border border-border/50 px-2.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 inline animate-spin mr-1.5" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-2.5 shrink-0">
        <div className="flex gap-1.5">
          <input
            id="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask AI to edit this file..."
            className="flex-1 border border-border bg-background/80 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors"
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center transition-all",
              input.trim() && !sending
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-secondary/30 text-muted-foreground/40"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function MonacoFileEditor({
  value,
  onChange,
  language,
  editorSettings,
  filePath,
  fileName
}: MonacoFileEditorProps) {
  const settings = { ...DEFAULT_EDITOR_SETTINGS, ...(editorSettings || {}) }
  const { user } = useAuth()
  const byoaiConfig = user?.settings?.byoai as ByoaiConfig | undefined
  const useByoai = isByoaiConfigured(byoaiConfig)

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [editorReady, setEditorReady] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 })
  const [lineCount, setLineCount] = useState(1)
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState<number>(settings.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize ?? 14)
  const [copied, setCopied] = useState(false)
  const [editorHeight, setEditorHeight] = useState("500px")
  const [aiChatOpen, setAiChatOpen] = useState(false)

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const viewportHeight = window.innerHeight
        const containerTop = containerRef.current.getBoundingClientRect().top
        const padding = 120
        const minHeight = 250
        const maxHeight = 800

        const calculatedHeight = Math.min(
          maxHeight,
          Math.max(minHeight, viewportHeight - containerTop - padding)
        )

        setEditorHeight(`${calculatedHeight}px`)
      }
    }

    updateHeight()
    window.addEventListener("resize", updateHeight)
    window.addEventListener("orientationchange", () => {
      setTimeout(updateHeight, 100)
    })

    return () => {
      window.removeEventListener("resize", updateHeight)
      window.removeEventListener("orientationchange", updateHeight)
    }
  }, [])

  useEffect(() => {
    setLineCount(value.split('\n').length)
  }, [value])

  const handleWordWrapToggle = useCallback(() => {
    setWordWrap(prev => {
      const newValue = !prev
      editorRef.current?.updateOptions({ wordWrap: newValue ? "on" : "off" })
      return newValue
    })
  }, [])

  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size)
    editorRef.current?.updateOptions({ fontSize: size })
  }, [])

  const handleUndo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'undo', {})
  }, [])

  const handleRedo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'redo', {})
  }, [])

  const handleSearch = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'actions.find', {})
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = value
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [value])

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setEditorReady(true)

    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column
      })
    })

    editor.onDidChangeModelContent(() => {
      setLineCount(editor.getModel()?.getLineCount() || 1)
    })

    if (window.innerWidth >= 640) {
      editor.focus()
    }
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
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

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0">
          <Suspense fallback={<EditorLoadingFallback />}>
            <MonacoEditor
              height={editorHeight}
              language={language}
              value={value}
              onChange={onChange}
              theme="vs-dark"
              onMount={handleEditorMount}
              loading={<EditorLoadingFallback />}
              options={{
                minimap: { enabled: window.innerWidth >= 768 && !!settings.minimap },
                fontSize: fontSize,
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
                lineNumbersMinChars: window.innerWidth < 640 ? 3 : 5,
                folding: window.innerWidth >= 640,
                glyphMargin: window.innerWidth >= 640,
                lineDecorationsWidth: window.innerWidth < 640 ? 0 : 10,
                scrollbar: {
                  verticalScrollbarSize: window.innerWidth < 640 ? 8 : 14,
                  horizontalScrollbarSize: window.innerWidth < 640 ? 8 : 14,
                  useShadows: false,
                },
                overviewRulerLanes: window.innerWidth < 640 ? 0 : 3,
                hideCursorInOverviewRuler: window.innerWidth < 640,
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
        />
      </div>

      <MobilePositionBar
        cursorPosition={cursorPosition}
        lineCount={lineCount}
      />
    </div>
  )
}