interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

interface UserAiConfig {
  provider?: string;
  endpoint?: string;
  apiKey?: string;
  modelId?: string;
}

export interface StreamChunk {
  type: "text" | "done" | "tool_start" | "tool_end" | "thinking";
  text?: string;
  fullContent?: string;
  toolCalls?: Array<{
    index?: number;
    id?: string;
    type: "function";
    function: { name?: string; arguments: string };
  }>;
}

async function makeRequest(body: Record<string, any>, stream: boolean, aiConfig?: UserAiConfig | null) {
  const payload = { ...body, stream };
  if (aiConfig?.endpoint && aiConfig?.apiKey) {
    return fetch(`${aiConfig.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aiConfig.apiKey}` },
      body: JSON.stringify(payload),
    });
  }
  return fetch(`${process.env.ECLI_API_URL || "http://localhost:3432/api"}/ai/byoai/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": process.env.ECLI_ADMIN_KEY || "" },
    body: JSON.stringify(payload),
  });
}

export interface StreamResult {
  content: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export async function streamCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  tools?: any[],
  aiConfig?: UserAiConfig | null
): Promise<StreamResult> {
  const defaultModel = (process.env as any).AI_MODEL || "gpt-4o";
  const body: Record<string, any> = { messages, model: aiConfig?.modelId || defaultModel, temperature: 0.7, stream: true };
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }

  const res = await makeRequest(body, true, aiConfig);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`AI stream failed (${res.status}): ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body for stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  const toolCallsByIndex = new Map<number, { id?: string; name?: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        if (toolCallsByIndex.size > 0) {
          const merged = Array.from(toolCallsByIndex.entries()).map(([idx, tc]) => ({
            index: idx,
            id: tc.id || "",
            type: "function" as const,
            function: { name: tc.name || "", arguments: tc.args },
          }));
          onChunk({ type: "done", fullContent, toolCalls: merged });
          return { content: fullContent, toolCalls: merged };
        }
        onChunk({ type: "done", fullContent });
        return { content: fullContent };
      }

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content) {
          fullContent += delta.content;
          onChunk({ type: "text", text: delta.content, fullContent });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCallsByIndex.get(idx) || { args: "" };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallsByIndex.set(idx, existing);

            onChunk({
              type: "tool_start",
              fullContent,
              toolCalls: [{
                index: idx,
                id: existing.id,
                type: "function",
                function: { name: existing.name, arguments: existing.args },
              }],
            });
          }
        }
      } catch {}
    }
  }

  if (toolCallsByIndex.size > 0) {
    const merged = Array.from(toolCallsByIndex.entries()).map(([idx, tc]) => ({
      id: tc.id || "",
      type: "function" as const,
      function: { name: tc.name || "", arguments: tc.args },
    }));
    onChunk({ type: "done", fullContent, toolCalls: merged });
    return { content: fullContent, toolCalls: merged };
  }

  onChunk({ type: "done", fullContent });
  return { content: fullContent };
}
