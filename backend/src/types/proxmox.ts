export interface ProxmoxAuthResponse {
  data: {
    ticket: string;
    CSRFPreventionToken: string;
    username: string;
  };
}

export interface ProxmoxNodeStatus {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  status: string;
  mem: number;
  maxmem: number;
  cpu: number;
  maxcpu: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  type: 'lxc' | 'qemu';
  node: string;
  template?: number;
}

export interface ProxmoxStorageContent {
  volid: string;
  format: string;
  size: number;
  content: string;
  ctime: number;
  used?: number;
  description?: string;
  notes?: string;
}

export interface ProxmoxPoolResource {
  id: string;
  node: string;
  type: string;
  vmid: number;
  status: string;
  mem?: number;
  maxmem?: number;
  cpu?: number;
  maxcpu?: number;
  disk?: number;
  maxdisk?: number;
  name?: string;
  uptime?: number;
}

export interface ProxmoxClusterResources {
  data: ProxmoxPoolResource[];
}
