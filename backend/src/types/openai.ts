export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: string;
  delta?: Partial<OpenAIChatMessage>;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

export function isOpenAIChatResponse(data: unknown): data is OpenAIChatCompletionResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'choices' in data &&
    Array.isArray((data as OpenAIChatCompletionResponse).choices)
  );
}

export function getAIChatResponseContent(data: unknown): string {
  if (!isOpenAIChatResponse(data)) {
    return JSON.stringify(data);
  }
  const firstChoice = data.choices?.[0];
  return firstChoice?.message?.content || '';
}

export interface AIModelConfig {
  id?: string;
  name: string;
  endpoint?: string;
  apiKey?: string;
  config?: Record<string, unknown>;
  limits?: Record<string, number>;
  endpoints?: Array<{
    id?: string;
    endpoint?: string;
    url?: string;
    apiKey?: string;
    key?: string;
  }>;
  tags?: string[];
}
