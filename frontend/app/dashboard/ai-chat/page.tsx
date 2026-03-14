"use client"

import { useState, useRef, useEffect } from "react"
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
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const STORAGE_KEY = 'ecli_ai_chat_messages'

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Welcome to Eclipse AI Chat. I can help you manage your servers, debug issues, optimize configurations, and answer questions about your infrastructure. How can I assist you today?",
    timestamp: new Date(),
  },
]

const SUGGESTIONS = [
  "How do I optimize my Minecraft server?",
  "Analyze my server's CPU usage patterns",
  "Help me configure a Rust server",
  "What's the best RAM allocation for 20 players?",
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        return parsed.map((m) => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() }))
      }
    } catch {}
    return INITIAL_MESSAGES
  })
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [models, setModels] = useState<any[] | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    const loadModels = async () => {
      try {
        const data: any[] = await apiFetch(API_ENDPOINTS.aiMyModels)
        setModels(data)

        const stored = typeof window !== 'undefined' ? window.localStorage.getItem('ecli_ai_model') : null
        const defaultId = stored || data?.[0]?.model?.config?.modelId || data?.[0]?.model?.name
        if (defaultId) setSelectedModel(String(defaultId))
      } catch (err) {
        console.error('Failed to load AI models', err)
      }
    }
    loadModels()
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const payload = [...messages, userMsg].map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      const candidateModel = selectedModel || models?.[0]?.model?.config?.modelId || models?.[0]?.model?.name
      const providerModelId = candidateModel && !/^\d+$/.test(String(candidateModel)) ? String(candidateModel) : undefined
      if (!candidateModel && !(models && models.length > 0)) {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "No AI model is available. Please contact your administrator to configure an AI model.",
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMsg])
        return
      }

      if (typeof window !== 'undefined' && providerModelId) {
        window.localStorage.setItem('ecli_ai_model', providerModelId)
      }

      const body: any = { messages: payload }
      if (providerModelId) body.model = providerModelId

      const res = await apiFetch(API_ENDPOINTS.openaiChat, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const aiText = res?.choices?.[0]?.message?.content || res?.choices?.[0]?.text || res?.reply || JSON.stringify(res)
      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: aiText, timestamp: new Date() }
      setMessages((prev) => [...prev, botMsg])
    } catch (err: any) {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${err.message || "failed to get response"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
    }
  }

  const modelOptions = models?.map((m) => ({
    id: m.model?.config?.modelId ?? m.model?.name ?? m.model?.id,
    label: m.model?.name || m.model?.config?.modelId || `Model ${m.model?.id ?? 'unknown'}`,
  }))

  return (
    <>
      <PanelHeader title="AI Chat" description="Chat with your AI assistant" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card/50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Model:</span>
            <select
              value={selectedModel ?? ""}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none"
            >
              {modelOptions?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
              {!modelOptions?.length && <option value="">No models available</option>}
            </select>
          </div>
          <button
            onClick={() => setMessages(INITIAL_MESSAGES)}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Clear chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    msg.role === "assistant"
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`group max-w-[80%] rounded-xl px-4 py-3 ${
                    msg.role === "assistant"
                      ? "bg-card border border-border"
                      : "bg-primary/15 border border-primary/20"
                  }`}
                >
                  <p className="text-sm text-foreground leading-relaxed">
                    {msg.content}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                    {msg.role === "assistant" && (
                      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button className="rounded p-1 hover:bg-secondary transition-colors">
                          <Copy className="h-3 w-3" />
                        </button>
                        <button className="rounded p-1 hover:bg-secondary transition-colors">
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button className="rounded p-1 hover:bg-secondary transition-colors">
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                        <button className="rounded p-1 hover:bg-secondary transition-colors">
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-xl bg-card border border-border px-4 py-3">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="border-t border-border bg-card/50 px-6 py-3">
            <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  <Sparkles className="mr-1.5 inline h-3 w-3 text-primary" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border bg-card/50 p-4">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex flex-1 items-center rounded-xl border border-border bg-card px-4 py-2.5 focus-within:border-primary/50 focus-within:shadow-[0_0_10px_var(--glow)] transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
