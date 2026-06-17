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