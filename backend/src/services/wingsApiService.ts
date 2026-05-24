import WebSocket from 'ws';
import { httpRequest } from '../utils/http';

const REQUEST_TIMEOUT = 10_000;

const allowInvalidCerts = process.env.WINGS_ALLOW_INVALID_CERT === 'true';

export class WingsApiService {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    const clean = baseUrl.replace(/\/+$/, '');
    this.baseUrl = clean.endsWith('/api') ? clean : clean + '/api';
    this.token = token;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  private buildUrl(path: string, params?: Record<string, any>): string {
    const p = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(p, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T = any>(
    path: string,
    opts: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      params?: Record<string, any>;
      responseType?: 'json' | 'text' | 'arraybuffer';
    } = {}
  ) {
    const headers = { ...this.getAuthHeaders(), ...(opts.headers || {}) };
    return await httpRequest<T>(this.buildUrl(path, opts.params), {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      timeoutMs: REQUEST_TIMEOUT,
      responseType: opts.responseType || 'json',
    });
  }

  async getSystemInfo() {
    return this.request('/system');
  }

  async getSystemStats() {
    return this.request('/system/stats');
  }

  async getUpdates() {
    return this.request('/update');
  }

  async getTransfers() {
    return this.request('/transfers');
  }

  async getBackups() {
    return this.request('/backups');
  }

  async deauthorizeUser(data: any) {
    return this.request('/deauthorize-user', { method: 'POST', body: data });
  }

  async getServers() {
    return this.request('/servers');
  }

  async getServer(serverId: string) {
    return this.request(`/servers/${serverId}`);
  }

  async createServer(payload: any) {
    const normalized: Record<string, any> = {};
    if (payload?.uuid) normalized.uuid = payload.uuid;
    if (Object.prototype.hasOwnProperty.call(payload ?? {}, 'start_on_completion')) {
      normalized.start_on_completion = Boolean(payload.start_on_completion);
    }
    if (Object.prototype.hasOwnProperty.call(payload ?? {}, 'skip_scripts')) {
      normalized.skip_scripts = Boolean(payload.skip_scripts);
    }
    return this.request('/servers', { method: 'POST', body: normalized });
  }

  async powerServer(serverId: string, action: string) {
    return this.request(`/servers/${serverId}/power`, { method: 'POST', body: { action } });
  }

  async toggleKvm(serverId: string, enable: boolean) {
    return this.syncServer(serverId, { kvm_passthrough_enabled: Boolean(enable) });
  }

  async listServerFiles(serverId: string, directory: string = '/') {
    const url = `${this.baseUrl}/servers/${serverId}/files/list-directory`;
    return this.request(`/servers/${serverId}/files/list-directory`, { params: { directory } });
  }

  async readFile(serverId: string, path: string) {
    const url = `${this.baseUrl}/servers/${serverId}/files/contents`;
    return this.request(`/servers/${serverId}/files/contents`, {
      params: { file: path },
      responseType: 'text',
    });
  }

  async downloadFile(serverId: string, path: string) {
    const url = `${this.baseUrl}/servers/${serverId}/files/contents`;
    return this.request(`/servers/${serverId}/files/contents`, {
      params: { file: path },
      responseType: 'arraybuffer',
    });
  }

  async writeFile(
    serverId: string,
    filePath: string,
    content: Uint8Array | ArrayBuffer | Buffer | string
  ) {
    const url = `${this.baseUrl}/servers/${serverId}/files/write`;

    let body: Buffer | string;
    let contentType: string;

    if (content instanceof Uint8Array || ArrayBuffer.isView(content)) {
      const view = content as Uint8Array;
      body = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
      contentType = 'application/octet-stream';
    } else if (content instanceof ArrayBuffer) {
      body = Buffer.from(content);
      contentType = 'application/octet-stream';
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(content)) {
      body = content;
      contentType = 'application/octet-stream';
    } else if (typeof content === 'string') {
      body = content;
      contentType = 'text/plain; charset=utf-8';
    } else {
      body = String(content ?? '');
      contentType = 'text/plain; charset=utf-8';
    }

    return this.request(`/servers/${serverId}/files/write`, {
      method: 'POST',
      body,
      params: { file: filePath },
      headers: { 'Content-Type': contentType },
    });
  }

  async deleteFile(serverId: string, root: string, files: string[]) {
    return this.serverRequest(serverId, '/files/delete', 'post', { root, files });
  }

  async createDirectory(serverId: string, root: string, name: string) {
    return this.serverRequest(serverId, '/files/create-directory', 'post', { root, name });
  }

  async archiveFiles(serverId: string, root: string, files: string[]) {
    return this.serverRequest(serverId, '/files/compress', 'post', { root, files });
  }

  async chmodFiles(
    serverId: string,
    root: string,
    files: Array<{ file: string; mode: string; recursive?: boolean }>
  ) {
    return this.serverRequest(serverId, '/files/chmod', 'post', { root, files });
  }

  async moveFiles(serverId: string, root: string, files: Array<{ from: string; to: string }>) {
    return this.serverRequest(serverId, '/files/rename', 'put', { root, files });
  }

  async listServerBackups(serverId: string) {
    try {
      return await this.serverRequest(serverId, '/backup');
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        try {
          return await this.serverRequest(serverId, '/backups');
        } catch (err2: any) {
          if (err2?.response?.status === 404 || err2?.response?.status === 405) {
            return { data: [] };
          }
          throw err2;
        }
      }
      throw err;
    }
  }

  async createServerBackup(serverId: string, payload: any) {
    try {
      return await this.serverRequest(serverId, '/backup', 'post', payload);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return this.serverRequest(serverId, '/backups', 'post', payload);
      }
      throw err;
    }
  }

  async restoreServerBackup(serverId: string, backupId: string, payload: any) {
    try {
      return await this.serverRequest(serverId, `/backup/${backupId}/restore`, 'post', payload);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return this.serverRequest(serverId, `/backups/${backupId}/restore`, 'post', payload);
      }
      throw err;
    }
  }

  async deleteServerBackup(serverId: string, backupId: string) {
    try {
      return await this.serverRequest(serverId, `/backup/${backupId}`, 'delete');
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return this.serverRequest(serverId, `/backups/${backupId}`, 'delete');
      }
      throw err;
    }
  }

  async executeServerCommand(serverId: string, command: string) {
    return this.serverRequest(serverId, '/commands', 'post', { commands: [command] });
  }

  async getServerLogs(serverId: string) {
    return this.serverRequest(serverId, '/logs');
  }

  async reinstallServer(serverId: string, payload: any) {
    return this.serverRequest(serverId, '/reinstall', 'post', payload);
  }

  async getServerSchedules(serverId: string) {
    return this.serverRequest(serverId, '/schedules');
  }

  async createServerSchedule(serverId: string, payload: any) {
    return this.serverRequest(serverId, '/schedules', 'post', payload);
  }

  async syncServer(serverId: string, payload: any) {
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return this.serverRequest(serverId, '/sync', 'post', payload);
    }

    if (payload.server) {
      return this.serverRequest(serverId, '/sync', 'post', payload);
    }

    const result = await this.getServer(serverId);
    const server = result.data as any;
    const settings = server.settings || {};
    const processConfiguration = server.process_configuration || {};

    const sanitizeAllocations = (valueObject: any) => {
      const raw = valueObject && typeof valueObject === 'object' ? valueObject : {};
      const mappings: Record<string, number[]> = {};

      const normalizeIp = (ip: string) => {
        const clean = String(ip ?? '').trim();
        if (clean.startsWith('[') && clean.endsWith(']')) {
          return clean.slice(1, -1).trim();
        }
        return clean;
      };

      const allocationHostKey = (ip: string, port: number) => {
        const cleanIp = normalizeIp(ip);
        return cleanIp.includes(':') ? `[${cleanIp}]:${port}` : `${cleanIp}:${port}`;
      };

      for (const [ip, ports] of Object.entries(raw.mappings ?? {})) {
        const list = Array.isArray(ports) ? ports : [];
        const safe = list
          .map(p => Number(p))
          .filter(p => Number.isInteger(p) && p > 0 && p <= 65535);
        const normalizedIp = normalizeIp(ip);
        if (safe.length > 0 && normalizedIp) mappings[normalizedIp] = safe;
      }

      let def: any = undefined;
      if (raw.default && typeof raw.default === 'object') {
        const ip = normalizeIp(raw.default.ip ?? '');
        const port = Number(raw.default.port ?? 0);
        if (ip && Number.isInteger(port) && port > 0 && port <= 65535) {
          def = { ip, port };
        }
      }

      const fqdns: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw.fqdns ?? {})) {
        const fqdn = String(value ?? '').trim();
        if (!fqdn) continue;
        const match = String(key)
          .trim()
          .match(/^\[?(.*?)\]:(\d+)$/);
        if (!match) {
          fqdns[String(key).trim()] = fqdn;
          continue;
        }
        const ip = normalizeIp(match[1]);
        const port = Number(match[2]);
        if (ip && Number.isInteger(port) && port > 0 && port <= 65535) {
          fqdns[allocationHostKey(ip, port)] = fqdn;
        }
      }

      return {
        force_outgoing_ip: Boolean(raw.force_outgoing_ip),
        ...(def ? { default: def } : {}),
        mappings,
        ...(Object.keys(fqdns).length > 0 ? { fqdns } : {}),
      };
    };

    for (const [key, value] of Object.entries(payload)) {
      const valueObject = typeof value === 'object' && value !== null ? value : {};

      if (key === 'process_configuration') {
        server.process_configuration = { ...processConfiguration, ...valueObject };
        continue;
      }

      if (key === 'kvm_passthrough_enabled') {
        server.settings = {
          ...settings,
          container: {
            ...settings.container,
            kvm_passthrough_enabled: Boolean(value),
          },
        };
        continue;
      }

      if (key === 'settings') {
        server.settings = {
          ...settings,
          ...valueObject,
        };
        continue;
      }

      if (
        key === 'build' ||
        key === 'container' ||
        key === 'meta' ||
        key === 'allocations' ||
        key === 'schedules' ||
        key === 'environment' ||
        key === 'labels' ||
        key === 'backups' ||
        key === 'mounts' ||
        key === 'egg'
      ) {
        server.settings = {
          ...settings,
          [key]:
            key === 'allocations'
              ? sanitizeAllocations(valueObject)
              : {
                  ...settings[key],
                  ...valueObject,
                },
        };
        continue;
      }

      server.settings = {
        ...settings,
        [key]: value,
      };
    }

    return this.serverRequest(serverId, '/sync', 'post', { server });
  }

  async transferServer(serverId: string, payload: any) {
    return this.serverRequest(serverId, '/transfer', 'post', payload);
  }

  async getServerVersion(serverId: string) {
    return this.serverRequest(serverId, '/version');
  }

  async getAllocations(serverId: string) {
    return this.serverRequest(serverId, '/allocations');
  }

  async getNetwork(serverId: string) {
    return this.serverRequest(serverId, '/network');
  }

  async getMounts(serverId: string) {
    return this.serverRequest(serverId, '/mounts');
  }

  async getLocation(serverId: string) {
    return this.serverRequest(serverId, '/location');
  }

  async getStats(serverId: string) {
    return this.serverRequest(serverId, '/stats');
  }

  async serverRequest(
    serverId: string,
    subpath: string,
    method: 'get' | 'post' | 'put' | 'delete' = 'get',
    data?: any
  ) {
    switch (method) {
      case 'get':
        return this.request(`/servers/${serverId}${subpath}`);
      case 'delete':
        return this.request(`/servers/${serverId}${subpath}`, { method: 'DELETE', body: data });
      case 'post':
        return this.request(`/servers/${serverId}${subpath}`, { method: 'POST', body: data });
      case 'put':
        return this.request(`/servers/${serverId}${subpath}`, { method: 'PUT', body: data });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  connectServerWebsocket(
    serverId: string,
    onMessage: (msg: any) => void,
    onError?: (err: Error) => void
  ) {
    const url = this.baseUrl.replace(/^http/, 'ws') + `/servers/${serverId}/ws`;

    const wsOptions: WebSocket.ClientOptions = {
      headers: this.getAuthHeaders(),
    };

    if (allowInvalidCerts) {
      wsOptions.rejectUnauthorized = false;
    }

    const ws = new WebSocket(url, wsOptions);

    ws.on('message', data => {
      try {
        const parsed = JSON.parse(data.toString());
        onMessage(parsed);
      } catch {
        onMessage(data);
      }
    });

    ws.on('error', err => {
      console.error('Wings websocket error:', err);
      onError?.(err);
    });

    return ws;
  }
}
