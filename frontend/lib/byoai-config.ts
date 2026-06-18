export type ByoaiProvider = "opencode-go" | "custom"

export interface ByoaiConfig {
  enabled: boolean
  provider: ByoaiProvider
  endpoint: string
  apiKey: string
  modelId: string
}

export const OPENCODE_GO_ENDPOINT = "https://opencode.ai/zen/go"

export const OPENCODE_GO_REFERRAL = "https://opencode.ai/go?ref=GKS00BZJQZ"

export const OPENCODE_GO_MODELS = [
  { id: "glm-5.2", name: "GLM-5.2" },
  { id: "glm-5.1", name: "GLM-5.1" },
  { id: "kimi-k2.7", name: "Kimi K2.7" },
  { id: "kimi-k2.6", name: "Kimi K2.6" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  { id: "mimo-v2.5", name: "MiMo-V2.5" },
  { id: "mimo-v2.5-pro", name: "MiMo-V2.5-Pro" },
  { id: "minimax-m3", name: "MiniMax M3" },
  { id: "minimax-m2.7", name: "MiniMax M2.7" },
  { id: "minimax-m2.5", name: "MiniMax M2.5" },
  { id: "qwen3.7-max", name: "Qwen3.7 Max" },
  { id: "qwen3.7-plus", name: "Qwen3.7 Plus" },
  { id: "qwen3.6-plus", name: "Qwen3.6 Plus" },
]

export const DEFAULT_BYOAI_CONFIG: ByoaiConfig = {
  enabled: false,
  provider: "opencode-go",
  endpoint: OPENCODE_GO_ENDPOINT,
  apiKey: "",
  modelId: "deepseek-v4-pro",
}

export function isByoaiConfigured(config: ByoaiConfig | null | undefined): boolean {
  return !!(config?.enabled && config?.endpoint && config?.apiKey && config?.modelId)
}

const PROVIDER_BY_HOST: Record<string, string> = {
  "openai": "OpenAI",
  "anthropic": "Anthropic",
  "google": "Google",
  "gemini": "Google",
  "deepseek": "DeepSeek",
  "groq": "Groq",
  "mistral": "Mistral",
  "cohere": "Cohere",
  "together": "Together",
  "perplexity": "Perplexity",
  "opencode": "OpenCode Go",
}

export function getModelSource(model: Record<string, unknown> | null | undefined): string {
  if (!model) return "Eclipse"
  if ((model as any)._byoai) return "BYO"

  const tags = Array.isArray(model.tags) ? model.tags as string[] : []
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    for (const [key, label] of Object.entries(PROVIDER_BY_HOST)) {
      if (lower.includes(key)) return label
    }
  }

  const endpoint = typeof model.endpoint === "string" ? model.endpoint : ""
  if (endpoint) {
    try {
      const host = new URL(endpoint).hostname
      for (const [key, label] of Object.entries(PROVIDER_BY_HOST)) {
        if (host.includes(key)) return label
      }
    } catch {}
  }

  const endpoints = Array.isArray((model as any).endpoints) ? (model as any).endpoints as Array<Record<string, unknown>> : []
  for (const ep of endpoints) {
    const url = typeof ep.endpoint === "string" ? ep.endpoint : typeof ep.url === "string" ? ep.url : ""
    if (url) {
      try {
        const host = new URL(url).hostname
        for (const [key, label] of Object.entries(PROVIDER_BY_HOST)) {
          if (host.includes(key)) return label
        }
      } catch {}
    }
  }

  const config = (model as any).config as Record<string, unknown> | undefined
  const modelId = typeof config?.modelId === "string" ? config.modelId : ""
  if (modelId) {
    const lower = modelId.toLowerCase()
    if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("davinci")) return "OpenAI"
    if (lower.includes("claude")) return "Anthropic"
    if (lower.includes("gemini")) return "Google"
    if (lower.includes("deepseek")) return "DeepSeek"
    if (lower.includes("llama") || lower.includes("mixtral")) return "Meta"
    for (const [key, label] of Object.entries(PROVIDER_BY_HOST)) {
      if (lower.includes(key)) return label
    }
  }

  return "Eclipse"
}

export function normalizeByoaiModels(raw: unknown): Array<{ id: string; name: string }> {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((m: any) => ({ id: String(m.id || m.name || ""), name: String(m.name || m.id || "") })).filter(m => m.id)
  }
  const data = (raw as any).data || (raw as any).models
  if (Array.isArray(data)) {
    return data.map((m: any) => ({ id: String(m.id || m.name || ""), name: String(m.name || m.id || "") })).filter(m => m.id)
  }
  return []
}