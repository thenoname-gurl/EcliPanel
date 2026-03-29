import axios, { AxiosRequestConfig } from 'axios';
import https from 'https';
import WebSocket from 'ws';

const REQUEST_TIMEOUT = 10_000;

const allowInvalidCerts = process.env.WINGS_ALLOW_INVALID_CERT === 'true';

export class WingsApiService {
  private baseUrl: string;
  private token: string;
  private httpsAgent: https.Agent | undefined;

  constructor(baseUrl: string, token: string) {
    const clean = baseUrl.replace(/\/+$/, '');
    this.baseUrl = clean.endsWith('/api') ? clean : clean + '/api';
    this.token = token;

    if (allowInvalidCerts) {
      this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  private cfg(extra?: AxiosRequestConfig): AxiosRequestConfig {
    const extraSafe = extra || {};
    const mergedHeaders = { ...this.getAuthHeaders(), ...(extraSafe.headers || {}) };

    const config: AxiosRequestConfig = {
      ...extraSafe,
      headers: mergedHeaders,
      timeout: REQUEST_TIMEOUT,
    };

    if (this.httpsAgent) {
      config.httpsAgent = this.httpsAgent;
    }

    return config;
  }

  async getSystemInfo() {
    return axios.get(`${this.baseUrl}/system`, this.cfg());
  }

  async getSystemStats() {
    return axios.get(`${this.baseUrl}/system/stats`, this.cfg());
  }

  async getUpdates() {
    return axios.get(`${this.baseUrl}/update`, this.cfg());
  }

  async getTransfers() {
    return axios.get(`${this.baseUrl}/transfers`, this.cfg());
  }

  async getBackups() {
    return axios.get(`${this.baseUrl}/backups`, this.cfg());
  }

  async deauthorizeUser(data: any) {
    return axios.post(`${this.baseUrl}/deauthorize-user`, data, this.cfg());
  }

  async getServers() {
    return axios.get(`${this.baseUrl}/servers`, this.cfg());
  }

  async getServer(serverId: string) {
    return axios.get(`${this.baseUrl}/servers/${serverId}`, this.cfg());
  }

  async createServer(payload: any) {
    return axios.post(`${this.baseUrl}/servers`, payload, this.cfg());
  }

  async powerServer(serverId: string, action: string) {
    return axios.post(`${this.baseUrl}/servers/${serverId}/power`, { action }, this.cfg());
  }

  async toggleKvm(serverId: string, enable: boolean) {
    return this.syncServer(serverId, { kvm_passthrough_enabled: Boolean(enable) });
  }

  async listServerFiles(serverId: string, directory: string = '/') {
    const url = `${this.baseUrl}/servers/${serverId}/files/list-directory`;
    return axios.get(url, this.cfg({ params: { directory } }));
  }

  async readFile(serverId: string, path: string) {
    const url = `${this.baseUrl}/servers/${serverId}/files/contents`;
    return axios.get(url, this.cfg({
      params: { file: path },
      responseType: 'text',
    }));
  }

  async downloadFile(serverId: string, path: string) {
    const url = `${this.baseUrl}/servers/${serverId}/files/contents`;
    return axios.get(url, this.cfg({
      params: { file: path },
      responseType: 'arraybuffer',
    }));
  }

  async writeFile(serverId: string, filePath: string, content: Uint8Array | ArrayBuffer | Buffer | string) {
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

    return axios.post(url, body, this.cfg({
      params: { file: filePath },
      headers: {
        'Content-Type': contentType,
      },
      transformRequest: contentType === 'application/octet-stream'
        ? [(data: any) => data]
        : undefined,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }));
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

  async chmodFiles(serverId: string, root: string, files: Array<{ file: string; mode: string; recursive?: boolean }>) {
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
    return this.serverRequest(serverId, '/sync', 'post', payload);
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
    const url = `${this.baseUrl}/servers/${serverId}${subpath}`;
    const config = this.cfg();

    switch (method) {
      case 'get':
        return axios.get(url, config);
      case 'delete':
        return data ? axios.delete(url, { ...config, data }) : axios.delete(url, config);
      case 'post':
        return axios.post(url, data, config);
      case 'put':
        return axios.put(url, data, config);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  connectServerWebsocket(serverId: string, onMessage: (msg: any) => void, onError?: (err: Error) => void) {
    const url = this.baseUrl.replace(/^http/, 'ws') + `/servers/${serverId}/ws`;

    const wsOptions: WebSocket.ClientOptions = {
      headers: this.getAuthHeaders(),
    };

    if (allowInvalidCerts) {
      wsOptions.rejectUnauthorized = false;
    }

    const ws = new WebSocket(url, wsOptions);

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        onMessage(parsed);
      } catch {
        onMessage(data);
      }
    });

    ws.on('error', (err) => {
      console.error('Wings websocket error:', err);
      onError?.(err);
    });

    return ws;
  }
}