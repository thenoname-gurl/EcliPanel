import { httpRequest, HttpError } from '../utils/http';
import type { CreateServerPayload, ServerInfo, ServerStats, SystemInfo } from '../types/nodeProvider';
import type { ProxmoxAuthResponse, ProxmoxNodeStatus, ProxmoxVM, ProxmoxStorageContent, ProxmoxClusterResources } from '../types/proxmox';

const REQUEST_TIMEOUT = 15_000;
const PVE_PORT = 8006;

type PveType = 'lxc' | 'qemu';

export class ProxmoxApiService {
  private baseUrl: string;
  private tokenId: string;
  private secret: string;
  private realm: string;
  private proxmoxNode: string;
  private storage: string;
  private bridge: string;
  private ticket: string | null = null;
  private csrfToken: string | null = null;
  private ticketExpiry: number = 0;

  constructor(opts: {
    host: string;
    tokenId: string;
    secret: string;
    realm?: string;
    proxmoxNode: string;
    storage?: string;
    bridge?: string;
  }) {
    const host = opts.host.replace(/\/+$/, '');
    this.baseUrl = host.includes('://') ? host : `https://${host}:${PVE_PORT}`;
    this.baseUrl = this.baseUrl.replace(/\/+$/, '') + '/api2/json';
    this.tokenId = opts.tokenId;
    this.secret = opts.secret;
    this.realm = opts.realm || 'pam';
    this.proxmoxNode = opts.proxmoxNode;
    this.storage = opts.storage || 'local';
    this.bridge = opts.bridge || 'vmbr0';
  }

  private authHeaders(): Record<string, string> {
    if (this.ticket && Date.now() < this.ticketExpiry) {
      return {
        Cookie: `PVEAuthCookie=${this.ticket}`,
        'CSRFPreventionToken': this.csrfToken || '',
      };
    }
    return {
      Authorization: `PVEAPIToken=${this.tokenId}=${this.secret}`,
    };
  }

  async authenticate(): Promise<void> {
    try {
      const res = await httpRequest<ProxmoxAuthResponse>(`${this.baseUrl}/access/ticket`, {
        method: 'POST',
        body: { username: this.tokenId.split('!')[0], password: this.secret, realm: this.realm },
        timeoutMs: REQUEST_TIMEOUT,
      });
      this.ticket = res.data.data.ticket;
      this.csrfToken = res.data.data.CSRFPreventionToken;
      this.ticketExpiry = Date.now() + 7200_000;
    } catch {
      this.ticket = null;
      this.csrfToken = null;
    }
  }

  private async request<T = any>(
    path: string,
    opts: { method?: string; body?: any; params?: Record<string, any>; timeoutMs?: number } = {}
  ) {
    const basePath = path.startsWith('/') ? path : `/${path}`;
    let url = `${this.baseUrl}${basePath}`;
    if (opts.params) {
      const qs = Object.entries(opts.params)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    const headers = this.authHeaders();
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const bodyStr = Object.entries(opts.body)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      opts.body = bodyStr;
    }

    return httpRequest<T>(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      timeoutMs: opts.timeoutMs || REQUEST_TIMEOUT,
    });
  }

  async getVersion(): Promise<string> {
    const res = await this.request<{ data: { version: string } }>('/version');
    return res.data.data.version;
  }

  async getNodeStatus(): Promise<ProxmoxNodeStatus> {
    const res = await this.request<{ data: ProxmoxNodeStatus }>(`/nodes/${this.proxmoxNode}/status`);
    return res.data.data;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const status = await this.getNodeStatus();
    const version = await this.getVersion();
    return {
      version,
      architecture: 'amd64',
      cpu: {
        cores: status.maxcpu,
        model: 'Proxmox VE',
        usage: status.cpu,
      },
      memory: {
        total: status.maxmem,
        used: status.mem,
        free: status.maxmem - status.mem,
      },
      disk: {
        total: status.maxdisk,
        used: status.disk,
        free: status.maxdisk - status.disk,
      },
      uptime: status.uptime || 0,
    };
  }

  async getSystemStats(): Promise<ServerStats> {
    const status = await this.getNodeStatus();
    return {
      memory: { used: status.mem, total: status.maxmem },
      cpu: { used: Math.round(status.cpu * status.maxcpu * 100) / 100, total: status.maxcpu },
      disk: { used: status.disk, total: status.maxdisk },
      network: { rx: 0, tx: 0 },
      uptime: status.uptime,
    };
  }

  async getServers(): Promise<{ data: ServerInfo[] }> {
    const res = await this.request<ProxmoxClusterResources>('/cluster/resources');
    const resources = res.data.data || [];
    const vms = resources.filter(
      (r: any) => r.type === 'lxc' || r.type === 'qemu'
    );

    const servers: ServerInfo[] = vms.map((vm: any) => ({
      uuid: `${vm.type}-${vm.vmid}`,
      name: vm.name || `${vm.type}-${vm.vmid}`,
      status: vm.status === 'running' ? 'running' : 'stopped',
      provider: 'proxmox',
      resources: vm.status === 'running' ? {
        memory: { used: vm.mem || 0, total: vm.maxmem || 0 },
        cpu: { used: (vm.cpu || 0) * (vm.maxcpu || 1), total: vm.maxcpu || 1 },
        disk: { used: vm.disk || 0, total: vm.maxdisk || 0 },
        network: { rx: 0, tx: 0 },
        uptime: vm.uptime,
      } : null,
      build: {
        memory_limit: vm.maxmem || 0,
        disk_space: vm.maxdisk || 0,
        cpu_limit: (vm.maxcpu || 1) * 100,
      },
      nodeId: 0,
    }));

    return { data: servers };
  }

  async getServer(id: string): Promise<{ data: ServerInfo }> {
    const [type, vmid] = this.parseVmId(id);
    const res = await this.request<{ data: ProxmoxVM }>(
      `/nodes/${this.proxmoxNode}/${type}/${vmid}/status/current`
    );
    const vm = res.data.data;
    return {
      data: {
        uuid: id,
        name: vm.name || `${type}-${vmid}`,
        status: vm.status === 'running' ? 'running' : 'stopped',
        provider: 'proxmox',
        resources: {
          memory: { used: vm.mem || 0, total: vm.maxmem || 0 },
          cpu: { used: (vm.cpu || 0) * (vm.maxcpu || 1), total: vm.maxcpu || 1 },
          disk: { used: vm.disk || 0, total: vm.maxdisk || 0 },
          network: { rx: 0, tx: 0 },
          uptime: vm.uptime,
        },
        build: {
          memory_limit: vm.maxmem || 0,
          disk_space: vm.maxdisk || 0,
          cpu_limit: (vm.maxcpu || 1) * 100,
        },
        nodeId: 0,
      },
    };
  }

  async getServerByName(name: string): Promise<ProxmoxVM | null> {
    const res = await this.request<ProxmoxClusterResources>('/cluster/resources');
    const resources = res.data.data || [];
    const found = resources.find(
      (r: any) => (r.type === 'lxc' || r.type === 'qemu') && r.name === name
    );
    return (found as unknown as ProxmoxVM) || null;
  }

  async getNextVmid(): Promise<number> {
    const res = await this.request<{ data: string }>('/cluster/nextid');
    return parseInt(res.data.data, 10);
  }

  async createServer(payload: CreateServerPayload): Promise<any> {
    const vmid = await this.getNextVmid();
    const type: PveType = payload.vmType || 'lxc';

    if (type === 'lxc') {
      return this.createLxc(vmid, payload);
    }
    return this.createQemu(vmid, payload);
  }

  private async createLxc(vmid: number, payload: CreateServerPayload): Promise<any> {
    const ostemplate = payload.ostemplate || payload.template || '';
    const rootfs = payload.rootfs || this.storage;
    const netif = payload.netif || `name=eth0,bridge=${this.bridge},firewall=1,ip=dhcp`;

    const body: Record<string, any> = {
      vmid,
      hostname: payload.name || `ct-${vmid}`,
      ostemplate,
      rootfs: `${rootfs}:${payload.disk}`,
      memory: payload.memory,
      swap: 0,
      cores: payload.cores || 1,
      net0: netif,
      storage: this.storage,
      password: crypto.randomUUID().replace(/-/g, '').substring(0, 12),
      start: payload.startOnCompletion ? 1 : 0,
      unprivileged: 1,
      cmode: 'tty',
    };

    if (payload.nameserver) body.nameserver = payload.nameserver;
    if (payload.searchdomain) body.searchdomain = payload.searchdomain;

    const res = await this.request<{ data: string }>(
      `/nodes/${this.proxmoxNode}/lxc`,
      { method: 'POST', body, timeoutMs: 120_000 }
    );

    return { vmid, task: res.data.data, type: 'lxc' };
  }

  private async createQemu(vmid: number, payload: CreateServerPayload): Promise<any> {
    const iso = payload.isoFile || '';
    const cores = payload.cores || 1;
    const sockets = payload.sockets || 1;

    const body: Record<string, any> = {
      vmid,
      name: (payload.name || `vm-${vmid}`).toLowerCase().replace(/[^a-z0-9-]/g, ''),
      memory: payload.memory,
      cores,
      sockets,
      cpu: 'host',
      net0: `virtio,bridge=${this.bridge},firewall=1`,
      ostype: 'l26',
      ide2: `${iso},media=cdrom`,
      scsihw: 'virtio-scsi-pci',
      boot: 'order=scsi0;ide2',
      scsi0: `${this.storage}:${payload.disk}`,
      agent: 'enabled=1',
      start: payload.startOnCompletion ? 1 : 0,
    };

    body.vga = 'serial0';
    body.serial0 = 'socket';

    const res = await this.request<{ data: string }>(
      `/nodes/${this.proxmoxNode}/qemu`,
      { method: 'POST', body, timeoutMs: 120_000 }
    );

    return { vmid, task: res.data.data, type: 'qemu' };
  }

  async deleteServer(id: string): Promise<void> {
    const [type, vmid] = this.parseVmId(id);
    try {
      await this.request(`/nodes/${this.proxmoxNode}/${type}/${vmid}`, {
        method: 'DELETE',
        timeoutMs: 60_000,
      });
    } catch {
      await this.powerServer(id, 'stop').catch(() => {});
      await this.request(`/nodes/${this.proxmoxNode}/${type}/${vmid}`, {
        method: 'DELETE',
        timeoutMs: 60_000,
      });
    }
  }

  async powerServer(
    id: string,
    action: 'start' | 'stop' | 'restart' | 'shutdown' | 'kill'
  ): Promise<any> {
    const [type, vmid] = this.parseVmId(id);
    const pveAction = action === 'restart' ? 'reboot' : action === 'kill' ? 'stop' : action;

    const body: Record<string, any> = {};
    if (pveAction === 'stop') body.force = action === 'kill' ? 1 : 0;
    if (pveAction === 'shutdown') body.force = 0;

    const endpoint = `/nodes/${this.proxmoxNode}/${type}/${vmid}/status/${pveAction}`;
    return this.request(endpoint, { method: 'POST', body, timeoutMs: 30_000 });
  }

  async getStats(id: string): Promise<ServerStats> {
    const server = await this.getServer(id);
    return server.data.resources || {
      memory: { used: 0, total: 0 },
      cpu: { used: 0, total: 0 },
      disk: { used: 0, total: 0 },
      network: { rx: 0, tx: 0 },
    };
  }

  async syncServer(id: string, _payload: any): Promise<any> {
    const [type, vmid] = this.parseVmId(id);
    try {
      const res = await this.request<{ data: ProxmoxVM }>(
        `/nodes/${this.proxmoxNode}/${type}/${vmid}/config`
      );
      return res.data;
    } catch {
      return null;
    }
  }

  async getStorageContent(storage?: string): Promise<ProxmoxStorageContent[]> {
    const st = storage || this.storage;
    const res = await this.request<{ data: ProxmoxStorageContent[] }>(
      `/nodes/${this.proxmoxNode}/storage/${st}/content`
    );
    return res.data.data || [];
  }

  async getTemplates(): Promise<ProxmoxStorageContent[]> {
    const content = await this.getStorageContent();
    return content.filter(c => c.content === 'vztmpl' || c.content === 'iso');
  }

  async getIsos(): Promise<ProxmoxStorageContent[]> {
    const content = await this.getStorageContent();
    return content.filter(c => c.content === 'iso');
  }

  async getLxcTemplates(): Promise<ProxmoxStorageContent[]> {
    const content = await this.getStorageContent();
    return content.filter(c => c.content === 'vztmpl');
  }

  async getStorages(): Promise<Array<{ storage: string; type: string; content: string[] }>> {
    const res = await this.request<{ data: Array<{ storage: string; type: string; content: string[] }> }>(
      `/nodes/${this.proxmoxNode}/storage`
    );
    return res.data.data || [];
  }

  async getRrdData(vmid: number, type: PveType, timeframe: 'hour' | 'day' | 'week' = 'hour') {
    return this.request(`/nodes/${this.proxmoxNode}/${type}/${vmid}/rrddata`, {
      params: { timeframe },
    });
  }

  private parseVmId(id: string): [PveType, number] {
    const parts = id.split('-');
    const type = parts[0] === 'qemu' ? 'qemu' as PveType : 'lxc' as PveType;
    const vmid = parseInt(parts[parts.length - 1], 10);
    return [type, isNaN(vmid) ? 100 : vmid];
  }

  private notSupported(): never {
    throw Object.assign(new Error('Not supported for Proxmox nodes'), { statusCode: 400 });
  }

  async serverRequest(_id: string, _path: string, _method?: string, _body?: any): Promise<any> { return this.notSupported(); }
  async writeFile(_id: string, _path: string, _data: Uint8Array): Promise<any> { return this.notSupported(); }
  async readFile(_id: string, _path: string): Promise<any> { return this.notSupported(); }
  async downloadFile(_id: string, _path: string): Promise<any> { return this.notSupported(); }
  getBaseWingsUrl(): string { throw Object.assign(new Error('Not supported for Proxmox nodes'), { statusCode: 400 }); }
  async deleteFile(_id: string, _root: string, _files: string[]): Promise<any> { return this.notSupported(); }
  async createDirectory(_id: string, _root: string, _name: string): Promise<any> { return this.notSupported(); }
  async archiveFiles(_id: string, _root: string, _files: any): Promise<any> { return this.notSupported(); }
  async decompressFile(_id: string, _root: string, _file: string): Promise<any> { return this.notSupported(); }
  async moveFiles(_id: string, _root: string, _mappings: any): Promise<any> { return this.notSupported(); }
  async chmodFiles(_id: string, _root: string, _files: any): Promise<any> { return this.notSupported(); }
  async getFileRevisions(_id: string, _path: string): Promise<any> { return this.notSupported(); }
  async getRevisionContent(_id: string, _revisionId: number): Promise<any> { return this.notSupported(); }
  async getLargestDirectories(_id: string, _directory: string): Promise<any> { return this.notSupported(); }
  async listServerBackups(_id: string): Promise<any> { return this.notSupported(); }
  async createServerBackup(_id: string, _payload: any): Promise<any> { return this.notSupported(); }
  async restoreServerBackup(_id: string, _bid: string, _payload: any): Promise<any> { return this.notSupported(); }
  async executeServerCommand(_id: string, _command: string): Promise<any> { return this.notSupported(); }
  async getServerLogs(_id: string): Promise<any> { return this.notSupported(); }
  async reinstallServer(_id: string, _payload: any): Promise<any> { return this.notSupported(); }
  async transferServer(_id: string, _payload: any): Promise<any> { return this.notSupported(); }
  async cancelTransfer(_id: string): Promise<any> { return this.notSupported(); }
  async getServerVersion(_id: string): Promise<any> { return this.notSupported(); }
  async listServerFiles(_id: string, _path: string): Promise<any> { return this.notSupported(); }
}