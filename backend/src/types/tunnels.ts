export interface ConnectionMapping {
  allocationId: number;
  clientAgentId: string;
  serverAgentId: string;
}

export interface AgentMessage {
  type: string;
  [key: string]: unknown;
}

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