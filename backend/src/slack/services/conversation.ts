interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const conversations = new Map<string, Message[]>();
const MAX_HISTORY = 50;

export function getConversation(key: string): Message[] {
  return conversations.get(key) || [];
}

export function addMessage(key: string, message: Message): void {
  const history = conversations.get(key) || [];
  history.push(message);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  conversations.set(key, history);
}

export function clearConversation(key: string): void {
  conversations.delete(key);
}

export type { Message, ToolCall };
