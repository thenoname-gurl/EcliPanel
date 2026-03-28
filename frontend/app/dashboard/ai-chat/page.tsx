"use client"

import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { PanelHeader } from "@/components/panel/header"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import {
  Send,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  MessageSquare,
  Zap,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const STORAGE_KEY = "ecli_ai_chat_messages"

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hey there! 👋 I'm your Eclipse AI assistant. I can help you manage servers, debug issues, and optimize your infrastructure. What would you like to work on today?",
    timestamp: new Date(),
  },
]

const SUGGESTIONS = [
  { icon: Zap, text: "Optimize my server", color: "text-yellow-400" },
  { icon: MessageSquare, text: "Debug an issue", color: "text-blue-400" },
  { icon: Bot, text: "Configure settings", color: "text-green-400" },
  { icon: Sparkles, text: "Best practices", color: "text-purple-400" },
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? sessionStorage.getItem(STORAGE_KEY)
          : null
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        return parsed.map((m) => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }))
      }
    } catch {}
    return INITIAL_MESSAGES
  })
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [models, setModels] = useState<any[] | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    })
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  useEffect(() => {
    const loadModels = async () => {
      try {
        const data: any[] = await apiFetch(API_ENDPOINTS.aiMyModels)
        setModels(data)
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem("ecli_ai_model")
            : null
        const defaultId =
          stored ||
          data?.[0]?.model?.config?.modelId ||
          data?.[0]?.model?.name
        if (defaultId) setSelectedModel(String(defaultId))
      } catch (err) {
        console.error("Failed to load AI models", err)
      }
    }
    loadModels()
  }, [])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 120) + "px"
    }
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || isTyping) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    if (window.innerWidth < 640) {
      inputRef.current?.blur()
    }

    try {
      const payload = [...messages, userMsg].map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }))
      const candidateModel =
        selectedModel ||
        models?.[0]?.model?.config?.modelId ||
        models?.[0]?.model?.name
      const providerModelId =
        candidateModel && !/^\d+$/.test(String(candidateModel))
          ? String(candidateModel)
          : undefined

      if (!candidateModel && !(models && models.length > 0)) {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "No AI model available. Please contact your administrator to configure one.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMsg])
        return
      }

      if (typeof window !== "undefined" && providerModelId) {
        window.localStorage.setItem("ecli_ai_model", providerModelId)
      }

      const body: any = { messages: payload }
      if (providerModelId) body.model = providerModelId

      const res = await apiFetch(API_ENDPOINTS.openaiChat, {
        method: "POST",
        body: JSON.stringify(body),
      })

      const aiText =
        res?.choices?.[0]?.message?.content ||
        res?.choices?.[0]?.text ||
        res?.reply ||
        JSON.stringify(res)
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiText,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err: any) {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${err.message || "Failed to get response"}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, botMsg])
    } finally {
      setIsTyping(false)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const modelOptions = models?.map((m) => ({
    id: m.model?.config?.modelId ?? m.model?.name ?? m.model?.id,
    label:
      m.model?.name ||
      m.model?.config?.modelId ||
      `Model ${m.model?.id ?? "unknown"}`,
  }))

  const selectedModelLabel =
    modelOptions?.find((m) => m.id === selectedModel)?.label || "Select Model"

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PanelHeader title="AI Chat" description="Chat with your AI assistant" />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 border-b border-border/50 bg-card/30 backdrop-blur-xl">
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="relative">
                <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                  <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-semibold text-foreground">
                  Eclipse AI
                </h2>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
                  {isTyping ? "Typing..." : "Online"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowModelSelect(!showModelSelect)}
                  className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-secondary/50 px-2 py-1.5 sm:px-2.5 text-[10px] sm:text-[11px] text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="max-w-[60px] sm:max-w-[120px] truncate">
                    {selectedModelLabel}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showModelSelect ? "rotate-180" : ""}`}
                  />
                </button>

                {showModelSelect && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowModelSelect(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-border/50 bg-card shadow-xl shadow-black/20 overflow-hidden">
                      <div className="p-1.5 max-h-60 overflow-y-auto">
                        {modelOptions?.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setSelectedModel(opt.id)
                              setShowModelSelect(false)
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                              selectedModel === opt.id
                                ? "bg-primary/15 text-primary font-medium"
                                : "text-foreground hover:bg-secondary/50"
                            }`}
                          >
                            <Zap
                              className={`h-3 w-3 shrink-0 ${selectedModel === opt.id ? "text-primary" : "text-muted-foreground"}`}
                            />
                            <span className="truncate">{opt.label}</span>
                            {selectedModel === opt.id && (
                              <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />
                            )}
                          </button>
                        ))}
                        {!modelOptions?.length && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            No models available
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setMessages(INITIAL_MESSAGES)}
                className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-secondary/50 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Clear chat"
              >
                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto max-w-2xl px-3 py-4 sm:px-6 sm:py-6 space-y-3 sm:space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 sm:gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0 mt-0.5">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                      <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  </div>
                )}

                <div className="group relative min-w-0 max-w-[88%] sm:max-w-[75%]">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 ${
                      msg.role === "assistant"
                        ? "bg-card/80 backdrop-blur-sm border border-border/50 rounded-tl-md"
                        : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-tr-md shadow-lg shadow-primary/20"
                    }`}
                  >
                    <div
                      className={`text-[13px] sm:text-sm leading-relaxed break-words ${
                        msg.role === "assistant"
                          ? "prose prose-invert prose-sm max-w-none prose-p:my-1 sm:prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-background/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-xs prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
                          : ""
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 px-1 ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground/50">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {msg.role === "assistant" && (
                      <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="rounded-md p-1 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
                          title="Copy"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          className="rounded-md p-1 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
                          title="Good response"
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          className="rounded-md p-1 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                        <button
                          className="rounded-md p-1 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
                          title="Regenerate"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {msg.role === "assistant" && (
                      <button
                        onClick={() =>
                          setActiveMessageMenu(
                            activeMessageMenu === msg.id ? null : msg.id
                          )
                        }
                        className="sm:hidden rounded-md p-1 text-muted-foreground/50 active:bg-secondary transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="shrink-0 mt-0.5">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-secondary/50 ring-1 ring-border/50">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 sm:gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  </div>
                </div>
                <div className="rounded-2xl rounded-tl-md bg-card/80 backdrop-blur-sm border border-border/50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <span className="text-[10px] sm:text-xs text-muted-foreground/60">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} className="h-1" />
          </div>
        </div>

        {messages.length <= 1 && !isTyping && (
          <div className="shrink-0 border-t border-border/50 bg-card/30 backdrop-blur-xl px-3 py-2.5 sm:px-6 sm:py-3">
            <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mb-2 text-center font-medium uppercase tracking-wider">
              Quick actions
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 max-w-md mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(s.text)
                    inputRef.current?.focus()
                  }}
                  className="flex items-center gap-2 rounded-xl bg-secondary/30 border border-border/50 px-2.5 py-2 sm:px-3 sm:py-2.5 text-left hover:bg-secondary/50 hover:border-primary/30 active:scale-[0.97] transition-all"
                >
                  <div
                    className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-background/50 shrink-0 ${s.color}`}
                  >
                    <s.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </div>
                  <span className="text-[11px] sm:text-xs text-foreground font-medium leading-tight">
                    {s.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-border/50 bg-card/50 backdrop-blur-xl p-2.5 sm:p-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <div className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="Ask me anything..."
                    rows={1}
                    className="w-full resize-none bg-transparent px-3.5 py-2.5 sm:px-4 sm:py-3 text-[13px] sm:text-sm text-foreground placeholder:text-muted-foreground/50 outline-none max-h-[120px] leading-relaxed"
                    style={{ minHeight: "44px" }}
                  />
                </div>

                {input.length > 100 && (
                  <div className="absolute right-3 bottom-0.5 text-[8px] sm:text-[9px] text-muted-foreground/40 pointer-events-none">
                    {input.length}
                  </div>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                  input.trim() && !isTyping
                    ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-90"
                    : "bg-secondary/50 text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="hidden sm:flex items-center justify-center gap-4 mt-2">
              <span className="text-[10px] text-muted-foreground/40">
                <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] font-mono">
                  Enter
                </kbd>{" "}
                send
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] font-mono">
                  Shift+Enter
                </kbd>{" "}
                new line
              </span>
            </div>
          </div>
        </div>
      </div>

      {activeMessageMenu && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          onClick={() => setActiveMessageMenu(null)}
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-card border-t border-border/50 p-4 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex justify-center mb-4">
              <div className="h-1 w-10 rounded-full bg-border/60" />
            </div>

            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-3 px-1">
              Message actions
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[
                {
                  icon: Copy,
                  label: "Copy",
                  action: () => {
                    const msg = messages.find((m) => m.id === activeMessageMenu)
                    if (msg) copyToClipboard(msg.content, msg.id)
                    setActiveMessageMenu(null)
                  },
                },
                {
                  icon: ThumbsUp,
                  label: "Good",
                  action: () => setActiveMessageMenu(null),
                },
                {
                  icon: ThumbsDown,
                  label: "Bad",
                  action: () => setActiveMessageMenu(null),
                },
                {
                  icon: RotateCcw,
                  label: "Retry",
                  action: () => setActiveMessageMenu(null),
                },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary/40 border border-border/30 p-3 active:scale-95 active:bg-secondary transition-all"
                >
                  <item.icon className="h-5 w-5 text-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in-from-bottom {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-in.slide-in-from-bottom {
          animation: slide-in-from-bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .overscroll-contain {
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: hsl(var(--border) / 0.5);
          border-radius: 4px;
        }

        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .pb-safe {
            padding-bottom: max(0.625rem, env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  )
}