export interface SystemInfo {
  version: string;
  architecture: string;
  cpu: { cores: number; model: string; usage: number };
  memory: { total: number; used: number; free: number };
  disk: { total: number; used: number; free: number };
  uptime: number;
}

export interface ServerStats {
  memory: { used: number; total: number };
  cpu: { used: number; total: number };
  disk: { used: number; total: number };
  network: { rx: number; tx: number };
  uptime?: number;
}

export interface ServerInfo {
  uuid: string;
  name: string;
  status: string;
  provider: 'wings' | 'proxmox';
  resources: ServerStats | null;
  build: {
    memory_limit: number;
    disk_space: number;
    cpu_limit: number;
  };
  nodeId: number;
  userId?: number;
  hibernated?: boolean;
  is_suspended?: boolean;
  is_dmca?: boolean;
}

export interface CreateServerPayload {
  uuid: string;
  name?: string;
  memory: number;
  disk: number;
  cpu: number;
  vmType: 'lxc' | 'qemu';
  template?: string;
  isoFile?: string;
  ostemplate?: string;
  cores?: number;
  sockets?: number;
  rootfs?: string;
  netif?: string;
  nameserver?: string;
  searchdomain?: string;
  startOnCompletion?: boolean;
}

export interface NodeProvider {
  getSystemInfo(): Promise<SystemInfo>;
  getSystemStats(): Promise<ServerStats>;
  getServers(): Promise<{ data: ServerInfo[] }>;
  getServer(id: string): Promise<{ data: ServerInfo }>;
  createServer(payload: CreateServerPayload): Promise<any>;
  deleteServer(id: string): Promise<void>;
  powerServer(id: string, action: 'start' | 'stop' | 'restart' | 'shutdown' | 'kill'): Promise<any>;
  getStats(id: string): Promise<ServerStats>;
  syncServer(id: string, payload: any): Promise<any>;
}
