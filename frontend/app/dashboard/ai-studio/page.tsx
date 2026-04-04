"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Brain,
  ArrowRight,
  BarChart3,
  Code,
  FileText,
  Image,
  Wand2,
  Lock,
  Send,
  X,
  Loader2,
  Clock,
} from "lucide-react"

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-full break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

interface AITool {
  id: string
  icon: any
  name: string
  color: string
  description: string
  systemPrompt: string
  placeholder: string
  comingSoon?: boolean
}

function getAiTools(t: any): AITool[] {
  return [
    {
      id: "codeAssistant",
      icon: Code,
      name: t("tools.codeAssistant.name"),
      color: "text-chart-2",
      description: t("tools.codeAssistant.description"),
      systemPrompt: t("tools.codeAssistant.systemPrompt"),
      placeholder: t("tools.codeAssistant.placeholder"),
    },
    {
      id: "logAnalyzer",
      icon: FileText,
      name: t("tools.logAnalyzer.name"),
      color: "text-success",
      description: t("tools.logAnalyzer.description"),
      systemPrompt: t("tools.logAnalyzer.systemPrompt"),
      placeholder: t("tools.logAnalyzer.placeholder"),
    },
    {
      id: "imageGenerator",
      icon: Image,
      name: t("tools.imageGenerator.name"),
      color: "text-primary",
      description: t("tools.imageGenerator.description"),
      comingSoon: true,
      systemPrompt: "",
      placeholder: "",
    },
    {
      id: "configWizard",
      icon: Wand2,
      name: t("tools.configWizard.name"),
      color: "text-warning",
      description: t("tools.configWizard.description"),
      systemPrompt: t("tools.configWizard.systemPrompt"),
      placeholder: t("tools.configWizard.placeholder"),
    },
    {
      id: "performanceAdvisor",
      icon: Brain,
      name: t("tools.performanceAdvisor.name"),
      color: "text-chart-5",
      description: t("tools.performanceAdvisor.description"),
      systemPrompt: t("tools.performanceAdvisor.systemPrompt"),
      placeholder: t("tools.performanceAdvisor.placeholder"),
    },
    {
      id: "analyticsAi",
      icon: BarChart3,
      name: t("tools.analyticsAi.name"),
      color: "text-info",
      description: t("tools.analyticsAi.description"),
      systemPrompt: t("tools.analyticsAi.systemPrompt"),
      placeholder: t("tools.analyticsAi.placeholder"),
    },
  ]
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export default function AIStudioPage() {
  const t = useTranslations("aiStudioPage")
  const AI_TOOLS = getAiTools(t)

  const [models, setModels] = useState<any[]>([])
  const [myModels, setMyModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [activeTool, setActiveTool] = useState<AITool | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [all, mine] = await Promise.all([
          apiFetch(API_ENDPOINTS.aiModels),
          apiFetch(API_ENDPOINTS.aiMyModels),
        ])
        setModels(all ?? [])
        setMyModels(mine ?? [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const openTool = (tool: AITool) => {
    if (tool.comingSoon) return
    setActiveTool(tool)
    setMessages([])
    setInput("")
  }

  const closeTool = () => {
    setActiveTool(null)
    setMessages([])
    setInput("")
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeTool || sending) return
    const userMsg = input.trim()
    setInput("")
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }]
    setMessages(newMessages)
    setSending(true)

    try {
      const payloadMessages: { role: string; content: string }[] = []
      if (activeTool.systemPrompt) {
        payloadMessages.push({ role: "system", content: activeTool.systemPrompt })
      }
      for (const message of newMessages) {
        payloadMessages.push({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })
      }

      const candidateModel = myModels?.[0]?.model?.config?.modelId || myModels?.[0]?.model?.name
      const providerModelId =
        candidateModel && !/^\d+$/.test(String(candidateModel)) ? String(candidateModel) : undefined
      const body: any = { messages: payloadMessages }
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
      setMessages([...newMessages, { role: "assistant", content: aiText }])
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: t("errors.chatResponse", {
            reason: err?.message || t("errors.failedGetResponse"),
          }),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <FeatureGuard feature="ai">
      <>
        <PanelHeader title={t("header.title")} description={t("header.description")} />
        <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
          <div className="flex flex-col gap-6 p-6">
            {activeTool && (
              <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <activeTool.icon className={`h-4 w-4 ${activeTool.color}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{activeTool.name}</h3>
                      <p className="text-xs text-muted-foreground">{activeTool.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={closeTool}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col h-[400px]">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                        <activeTool.icon className={`h-10 w-10 ${activeTool.color} opacity-30`} />
                        <p className="text-sm text-muted-foreground">
                          {t("chat.startUsing", { tool: activeTool.name })}
                        </p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                            msg.role === "user"
                              ? "bg-primary/15 text-foreground border border-primary/20 text-sm"
                              : "bg-secondary/60 text-foreground border border-border"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <MarkdownContent content={msg.content} />
                          ) : (
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-xl bg-secondary/60 border border-border px-4 py-2.5 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("chat.thinking")}
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="border-t border-border p-3 flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                      placeholder={activeTool.placeholder || t("chat.typeMessage")}
                      className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 transition-colors"
                      disabled={sending}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !input.trim()}
                      className="rounded-lg bg-primary/20 border border-primary/30 px-3 py-2 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <SectionHeader title={t("sections.aiToolsTitle")} description={t("sections.aiToolsDescription")} />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AI_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => openTool(tool)}
                    className={`group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)] ${tool.comingSoon ? "opacity-60 cursor-not-allowed" : ""} ${activeTool?.id === tool.id ? "ring-2 ring-primary border-primary/40" : ""}`}
                  >
                    <div className="rounded-lg bg-secondary/50 p-2.5 transition-colors group-hover:bg-primary/10">
                      <tool.icon className={`h-5 w-5 ${tool.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{tool.name}</h3>
                        {tool.comingSoon && (
                          <Badge className="bg-warning/20 text-warning border-0 text-[10px] flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {t("tools.comingSoon")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SectionHeader title={t("models.myModelsTitle")} description={t("models.myModelsDescription")} />
              <div className="mt-4 flex flex-col gap-3">
                {loading ? (
                  <p className="text-sm text-muted-foreground">{t("models.loading")}</p>
                ) : myModels.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/50">
                      <Lock className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{t("models.noModelsAssignedTitle")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t("models.noModelsAssignedDescription")}</p>
                    </div>
                  </div>
                ) : (
                  myModels.map(({ model }) => {
                    if (!model) return null
                    const status = model.config?.status || "active"
                    const type = model.config?.type || "text"
                    return (
                      <div
                        key={model.id}
                        className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Brain className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-foreground">{model.name}</h3>
                              {status === "beta" && (
                                <Badge className="bg-warning/20 text-warning border-0 text-[10px]">{t("badges.beta")}</Badge>
                              )}
                            </div>
                            {model.config?.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{model.config.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="border-border bg-secondary/50 text-muted-foreground text-xs capitalize"
                          >
                            {type}
                          </Badge>
                          <span className="rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs text-green-400">
                            {t("modelStatus.accessGranted")}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {models.length > 0 && (
              <div>
                <SectionHeader title={t("models.allModelsTitle")} description={t("models.allModelsDescription")} />
                <div className="mt-4 flex flex-col gap-3">
                  {models.map((model) => {
                    const linked = myModels.some((m) => m.model?.id === model.id)
                    const type = model.config?.type || "text"
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-card p-5"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                              linked ? "bg-primary/10" : "bg-secondary/50"
                            }`}
                          >
                            <Brain className={`h-5 w-5 ${linked ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{model.name}</p>
                            {model.config?.description && (
                              <p className="text-xs text-muted-foreground">{model.config.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-border bg-secondary/50 text-muted-foreground text-xs capitalize"
                          >
                            {type}
                          </Badge>
                          {linked ? (
                            <span className="text-xs text-green-400">{t("modelStatus.assigned")}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" /> {t("modelStatus.notAssigned")}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </>
    </FeatureGuard>
  )
}
