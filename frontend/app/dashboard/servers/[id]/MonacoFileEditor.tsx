"use client"

import { useEffect, useState, useRef, lazy, Suspense, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
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
  Replace,
  Undo,
  Redo,
  FileCode,
  AlignLeft
} from "lucide-react"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

interface MonacoFileEditorProps {
  value: string
  onChange: (v: string | undefined) => void
  language: string
  editorSettings?: EditorSettings
}

interface CursorPosition {
  line: number
  column: number
}

interface EditorToolbarProps {
  language: string
  cursorPosition: CursorPosition
  lineCount: number
  wordWrap: boolean
  onWordWrapToggle: () => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  aiEnabled: boolean
  aiLoading: boolean
  onUndo: () => void
  onRedo: () => void
  onSearch: () => void
  onCopy: () => void
  copied: boolean
}

function EditorToolbar({
  language,
  cursorPosition,
  lineCount,
  wordWrap,
  onWordWrapToggle,
  fontSize,
  onFontSizeChange,
  aiEnabled,
  aiLoading,
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
        
        <div className="hidden sm:block h-4 w-px bg-border" />
        
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlignLeft className="h-3.5 w-3.5" />
          <span>{t("position.lineCol", { line: cursorPosition.line, col: cursorPosition.column })}</span>
        </div>
        
        <div className="hidden sm:block h-4 w-px bg-border" />
        
        <span className="hidden sm:inline text-xs text-muted-foreground">
          {t("position.lines", { count: lineCount })}
        </span>

        {aiEnabled && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className={cn(
              "flex items-center gap-1 text-xs",
              aiLoading ? "text-primary" : "text-muted-foreground"
            )}>
              <Sparkles className={cn("h-3 w-3", aiLoading && "animate-pulse")} />
              <span className="hidden sm:inline">
                {aiLoading ? t("ai.thinking") : t("ai.label")}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
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
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{t("states.loadingEditor")}</p>
    </div>
  )
}

export function MonacoFileEditor({ 
  value, 
  onChange, 
  language, 
  editorSettings 
}: MonacoFileEditorProps) {
  const t = useTranslations("serverMonacoEditor")
  const settings = { ...DEFAULT_EDITOR_SETTINGS, ...(editorSettings || {}) }
  
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const providerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aiCacheRef = useRef<{ 
    key: string
    promise: Promise<any> | null
    result: any | null 
  }>({ key: '', promise: null, result: null })
  const settingsRef = useRef(settings)

  const [aiLoading, setAiLoading] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ line: 1, column: 1 })
  const [lineCount, setLineCount] = useState(1)
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState<number>(settings.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize ?? 14)
  const [copied, setCopied] = useState(false)
  const [editorHeight, setEditorHeight] = useState("500px")

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

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

  const stripCodeFences = useCallback((text: string) => {
    return text.replace(/^\s*```\w*\n/, '').replace(/\n```\s*$/, '').trimEnd()
  }, [])

  useEffect(() => {
    if (!editorReady || !monacoRef.current || !editorRef.current) return

    providerRef.current?.dispose()
    providerRef.current = null
    aiCacheRef.current = { key: '', promise: null, result: null }

    const currentSettings = settingsRef.current
    if (!currentSettings.aiAssistant) return

    providerRef.current = monacoRef.current.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '(', ' ', '\t', '=', ',', '+', '-'],
      provideCompletionItems: async (model: any, position: any) => {
        const cursorOffset = model.getOffsetAt(position)
        const maxContext = 2000
        const fullText = model.getValue()
        const contextText = fullText.slice(Math.max(0, cursorOffset - maxContext), cursorOffset)
        const key = `${language}:${contextText}`

        if (aiCacheRef.current.key === key && aiCacheRef.current.result) {
          return aiCacheRef.current.result
        }
        if (aiCacheRef.current.key === key && aiCacheRef.current.promise) {
          return aiCacheRef.current.promise
        }

        const promise = (async () => {
          const prompt = `Complete the following code at the cursor position. Only return the code to insert (no explanations):\n\n${contextText}`
          setAiLoading(true)
          try {
            const response = await apiFetch(API_ENDPOINTS.aiChat, {
              method: 'POST',
              body: JSON.stringify({ message: prompt }),
            })

            const raw = String(response.reply || '')
            const completion = stripCodeFences(raw).trim()
            if (!completion) {
              const empty = { suggestions: [] }
              aiCacheRef.current = { key, promise: null, result: empty }
              return empty
            }

            const insertText = completion.trim()
            if (!insertText) {
              const empty = { suggestions: [] }
              aiCacheRef.current = { key, promise: null, result: empty }
              return empty
            }

            const snippet = insertText.split('\n')[0].trim()
            const label = snippet.length > 0 
              ? (snippet.length > 60 ? snippet.slice(0, 57) + '...' : snippet) 
              : t("ai.suggestion")

            const item = {
              label,
              kind: monacoRef.current.languages.CompletionItemKind.Snippet,
              insertText,
              insertTextRules: monacoRef.current.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: t("ai.suggestion"),
              documentation: t("ai.generatedBy"),
            }

            const result = { suggestions: [item] }
            aiCacheRef.current = { key, promise: null, result }
            return result
          } catch {
            const empty = { suggestions: [] }
            aiCacheRef.current = { key, promise: null, result: empty }
            return empty
          } finally {
            setAiLoading(false)
          }
        })()

        aiCacheRef.current = { key, promise, result: null }
        return promise
      },
      resolveCompletionItem: (item: any) => item,
    })

    return () => {
      providerRef.current?.dispose()
      providerRef.current = null
      aiCacheRef.current = { key: '', promise: null, result: null }
    }
  }, [language, settings.aiAssistant, editorReady, stripCodeFences])

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

    const suggestDebounce = { id: 0 }
    editor.onDidChangeModelContent((e: any) => {
      setLineCount(editor.getModel()?.getLineCount() || 1)

      if (!settingsRef.current.aiAssistant) return
      if (!e.changes || e.changes.length === 0) return
      const lastChange = e.changes[e.changes.length - 1]
      const text = lastChange.text || ''
      if (!text) return
      clearTimeout(suggestDebounce.id)
      suggestDebounce.id = window.setTimeout(() => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {})
      }, 150)
    })

    if (window.innerWidth >= 640) {
      editor.focus()
    }
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <EditorToolbar
        language={language}
        cursorPosition={cursorPosition}
        lineCount={lineCount}
        wordWrap={wordWrap}
        onWordWrapToggle={handleWordWrapToggle}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
        aiEnabled={!!settings.aiAssistant}
        aiLoading={aiLoading}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSearch={handleSearch}
        onCopy={handleCopy}
        copied={copied}
      />

      {/* Editor */}
      <div className="flex-1 min-h-0">
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
              inlineSuggest: { enabled: !!settings.aiAssistant },
              quickSuggestions: !!settings.aiAssistant,
              acceptSuggestionOnEnter: settings.aiAssistant ? "on" : "off",
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

      <MobilePositionBar 
        cursorPosition={cursorPosition} 
        lineCount={lineCount} 
      />
    </div>
  )
}