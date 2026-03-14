"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState, useRef } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
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

// ── Lightweight markdown renderer ────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  const inlineFormat = (text: string, key: string | number): React.ReactNode => {
    // inline code
    const parts = text.split(/(`[^`]+`)/)
    return (
      <span key={key}>
        {parts.map((p, j) =>
          p.startsWith("`") && p.endsWith("`") ? (
            <code key={j} className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.8em] text-foreground">
              {p.slice(1, -1)}
            </code>
          ) : (
            <span key={j} dangerouslySetInnerHTML={{
              __html: p
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                .replace(/\*([^*]+)\*/g, "<em>$1</em>")
                .replace(/~~([^~]+)~~/g, "<del>$1</del>")
            }} />
          )
        )}
      </span>
    )
  }

  while (i < lines.length) {
    const line = lines[i]

    // fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="my-2 overflow-x-auto rounded-lg bg-muted/80 border border-border p-3 text-xs font-mono text-foreground leading-relaxed">
          {lang && <div className="mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">{lang}</div>}
          <code>{codeLines.join("\n")}</code>
        </pre>
      )
      i++
      continue
    }

    // heading
    const hm = line.match(/^(#{1,3})\s+(.+)/)
    if (hm) {
      const lvl = hm[1].length
      const cls = lvl === 1 ? "text-base font-bold mt-3 mb-1" : lvl === 2 ? "text-sm font-bold mt-2 mb-1" : "text-sm font-semibold mt-1"
      elements.push(<div key={i} className={cls}>{inlineFormat(hm[2], i)}</div>)
      i++; continue
    }

    // horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-2 border-border" />)
      i++; continue
    }

    // table
    if (line.includes("|") && lines[i + 1]?.match(/^[\s|:-]+$/)) {
      const headers = line.split("|").map(c => c.trim()).filter(Boolean)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(c => c.trim()).filter(Boolean))
        i++
      }
      elements.push(
        <div key={i} className="my-2 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {headers.map((h, j) => <th key={j} className="px-2 py-1 text-left font-semibold text-foreground">{inlineFormat(h, j)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border/40 even:bg-muted/20">
                  {row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-muted-foreground">{inlineFormat(cell, ci)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(<li key={i} className="ml-4 list-disc text-sm">{inlineFormat(lines[i].replace(/^[-*+]\s/, ""), i)}</li>)
        i++
      }
      elements.push(<ul key={i} className="my-1 space-y-0.5">{items}</ul>)
      continue
    }

    // ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} className="ml-4 list-decimal text-sm">{inlineFormat(lines[i].replace(/^\d+\.\s/, ""), i)}</li>)
        i++
      }
      elements.push(<ol key={i} className="my-1 space-y-0.5">{items}</ol>)
      continue
    }

    // blank line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />)
      i++; continue
    }

    // paragraph
    elements.push(<p key={i} className="text-sm leading-relaxed">{inlineFormat(line, i)}</p>)
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}
// ─────────────────────────────────────────────────────────────────────────────

const AI_TOOLS = [
  {
    icon: Code, name: "Code Assistant", color: "text-chart-2",
    description: "Generate, debug, and optimize server configurations",
    systemPrompt: "You are a Code Assistant for game server management. Help the user generate, debug, and optimize server configuration files (server.properties, spigot.yml, paper.yml, startup scripts, Docker compose files, etc). Provide clear code with explanations.",
    placeholder: "Describe what you need — e.g. 'Optimize my paper.yml for 50 players'",
  },
  {
    icon: FileText, name: "Log Analyzer", color: "text-success",
    description: "Analyze server logs and identify issues automatically",
    systemPrompt: "You are a Log Analyzer for game servers. The user will paste server logs. Identify errors, warnings, performance issues, plugin conflicts, and crashes. Provide clear diagnoses and actionable fix steps.",
    placeholder: "Paste your server log or describe the error…",
  },
  {
    icon: Image, name: "Image Generator", color: "text-primary",
    description: "Generate server icons and banners with AI",
    comingSoon: true,
    systemPrompt: "",
    placeholder: "",
  },
  {
    icon: Wand2, name: "Config Wizard", color: "text-warning",
    description: "Auto-generate optimal server configurations",
    systemPrompt: "You are a Config Wizard for game servers. Based on the user's requirements (player count, server type, mods/plugins, hardware specs), generate complete, optimized configuration files. Output ready-to-use config blocks.",
    placeholder: "e.g. 'Generate optimized JVM flags for 8GB RAM, Paper 1.21, 100 players'",
  },
  {
    icon: Brain, name: "Performance Advisor", color: "text-chart-5",
    description: "AI-powered performance optimization suggestions",
    systemPrompt: "You are a Performance Advisor for game servers. Analyze the user's described setup and provide specific optimization suggestions for TPS, memory usage, chunk loading, entity management, and network performance. Be specific with config values.",
    placeholder: "Describe your server setup and performance issues…",
  },
  {
    icon: BarChart3, name: "Analytics AI", color: "text-info",
    description: "Predictive analytics for server resource planning",
    systemPrompt: "You are an Analytics AI for server resource planning. Help the user predict resource needs, plan scaling, estimate costs, and analyze usage patterns. Provide data-driven recommendations for server sizing and capacity planning.",
    placeholder: "e.g. 'I expect 200 concurrent players, what resources do I need?'",
  },
]

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}


export default function AIStudioPage() {
  const [models, setModels] = useState<any[]>([]);
  const [myModels, setMyModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Tool chat state
  const [activeTool, setActiveTool] = useState<typeof AI_TOOLS[number] | null>(null)
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
        ]);
        setModels(all ?? []);
        setMyModels(mine ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const openTool = (tool: typeof AI_TOOLS[number]) => {
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
      const payloadMessages = [] as { role: string; content: string }[]
      if (activeTool.systemPrompt) payloadMessages.push({ role: 'system', content: activeTool.systemPrompt })
      for (const m of newMessages) payloadMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })

      const candidateModel = myModels?.[0]?.model?.config?.modelId || myModels?.[0]?.model?.name
      const providerModelId = candidateModel && !/^\d+$/.test(String(candidateModel)) ? String(candidateModel) : undefined
      const body: any = { messages: payloadMessages }
      if (providerModelId) body.model = providerModelId

      const res = await apiFetch(API_ENDPOINTS.openaiChat, {
        method: "POST",
        body: JSON.stringify(body),
      })

      const aiText = res?.choices?.[0]?.message?.content || res?.choices?.[0]?.text || res?.reply || JSON.stringify(res)
      setMessages([...newMessages, { role: "assistant", content: aiText }])
    } catch (err: any) {
      setMessages([...newMessages, { role: "assistant", content: `Error: ${err.message}` }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PanelHeader title="AI Studio" description="AI-powered tools for server management" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">

          {/* Active Tool Chat Panel */}
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
                <button onClick={closeTool} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col h-[400px]">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                      <activeTool.icon className={`h-10 w-10 ${activeTool.color} opacity-30`} />
                      <p className="text-sm text-muted-foreground">Send a message to start using {activeTool.name}</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                        msg.role === "user"
                          ? "bg-primary/15 text-foreground border border-primary/20 text-sm"
                          : "bg-secondary/60 text-foreground border border-border"
                      }`}>
                        {msg.role === "assistant"
                          ? <MarkdownContent content={msg.content} />
                          : <span className="whitespace-pre-wrap">{msg.content}</span>
                        }
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-xl bg-secondary/60 border border-border px-4 py-2.5 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
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
                    placeholder={activeTool.placeholder}
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

          {/* AI Tools Grid */}
          <div>
            <SectionHeader title="AI Tools" description="Specialized AI tools for your workflow" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AI_TOOLS.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => openTool(tool)}
                  className={`group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)] ${tool.comingSoon ? 'opacity-60 cursor-not-allowed' : ''} ${activeTool?.name === tool.name ? 'ring-2 ring-primary border-primary/40' : ''}`}
                >
                  <div className="rounded-lg bg-secondary/50 p-2.5 transition-colors group-hover:bg-primary/10">
                    <tool.icon className={`h-5 w-5 ${tool.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{tool.name}</h3>
                      {tool.comingSoon && (
                        <Badge className="bg-warning/20 text-warning border-0 text-[10px] flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Coming Soon
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

          {/* My Models */}
          <div>
            <SectionHeader title="My AI Models" description="Models your administrator has granted you access to" />
            <div className="mt-4 flex flex-col gap-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading models...</p>
              ) : myModels.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/50">
                    <Lock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">No models assigned</p>
                    <p className="mt-1 text-sm text-muted-foreground">Contact your administrator to get access to AI models.</p>
                  </div>
                </div>
              ) : (
                myModels.map(({ model, limits }) => {
                  if (!model) return null;
                  const status = model.config?.status || "active";
                  const type = model.config?.type || "text";
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
                              <Badge className="bg-warning/20 text-warning border-0 text-[10px]">Beta</Badge>
                            )}
                          </div>
                          {model.config?.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{model.config.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs capitalize">
                          {type}
                        </Badge>
                        <span className="rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs text-green-400">
                          Access granted
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* All models — read-only directory */}
          {models.length > 0 && (
            <div>
              <SectionHeader title="All Models" description="Full catalogue of available AI models" />
              <div className="mt-4 flex flex-col gap-3">
                {models.map((model) => {
                  const linked = myModels.some((m) => m.model?.id === model.id);
                  const type = model.config?.type || "text";
                  return (
                    <div key={model.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-5"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          linked ? "bg-primary/10" : "bg-secondary/50"
                        }`}>
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
                        <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs capitalize">{type}</Badge>
                        {linked
                          ? <span className="text-xs text-green-400">Assigned</span>
                          : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Not assigned</span>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}
