export interface ConnectionMapping {
  allocationId: number;
  clientAgentId: string;
  serverAgentId: string;
  directToken: string;
}

export interface AgentMessage {
  type: string;
  [key: string]: unknown;
}

export type TunnelServerType = 'free' | 'paid' | 'free_and_paid' | 'enterprise';
export const TUNNEL_SERVER_TYPES = ['free', 'paid', 'free_and_paid', 'enterprise'] as const;

export interface AllocationResponse {
  id: number;
  host: string;
  port: number;
  protocol: string;
  status: string;
  localHost: string;
  localPort: number;
}

export type DeviceKind = 'client' | 'server';
export type AllocationStatus = 'pending' | 'active' | 'closed';
export type AllocationProtocol = 'tcp' | 'udp' | 'http' | 'https';