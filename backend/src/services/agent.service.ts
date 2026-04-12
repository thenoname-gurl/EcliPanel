import { AgentMessage } from '../types/tunnels';

export const agentConnections = new Map<string, WebSocket>();

export function sendAgentMessage(
  agentId: string,
  message: AgentMessage
): boolean {
  const ws = agentConnections.get(agentId);

  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    console.error(`[agent] Failed to send message to ${agentId}:`, err);
    return false;
  }
}

export function registerAgent(agentId: string, ws: WebSocket): void {
  agentConnections.set(agentId, ws);
}

export function unregisterAgent(agentId: string): void {
  agentConnections.delete(agentId);
}