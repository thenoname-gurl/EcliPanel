import axios from 'axios';
import WebSocket from 'ws';

const REQUEST_TIMEOUT = 10_000;

export class WingsApiService {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    const clean = baseUrl.replace(/\/+$/, '');
    this.baseUrl = clean.endsWith('/api') ? clean : clean + '/api';
    this.token = token;
  }

  private getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  private cfg(extra?: object) {
    return { headers: this.getAuthHeaders(), timeout: REQUEST_TIMEOUT, ...extra };
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
    return axios.post(`${this.baseUrl}/servers/${serverId}/kvm`, { enable }, this.cfg());
  }

  async listServerFiles(serverId: string) {
    return this.serverRequest(serverId, '/files');
  }

  async readFile(serverId: string, path: string) {
    return this.serverRequest(serverId, `/files/contents?file=${encodeURIComponent(path)}`);
  }

  async writeFile(serverId: string, filePath: string, content: string) {
    const url = `${this.baseUrl}/servers/${serverId}/files/write?file=${encodeURIComponent(filePath)}`;
    return axios.post(url, content, {
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'text/plain',
      },
      timeout: REQUEST_TIMEOUT,
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

  async moveFiles(serverId: string, root: string, files: Array<{ from: string; to: string }>) {
    return this.serverRequest(serverId, '/files/rename', 'put', { root, files });
  }

  async listServerBackups(serverId: string) {
    return this.serverRequest(serverId, '/backups');
  }

  async createServerBackup(serverId: string, payload: any) {
    return this.serverRequest(serverId, '/backups', 'post', payload);
  }

  async restoreServerBackup(serverId: string, backupId: string) {
    return this.serverRequest(serverId, `/backups/${backupId}/restore`, 'post');
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

  async serverRequest(serverId: string, subpath: string, method: 'get' | 'post' | 'put' | 'delete' = 'get', data?: any) {
    const url = `${this.baseUrl}/servers/${serverId}${subpath}`;
    const config: any = { headers: this.getAuthHeaders(), timeout: REQUEST_TIMEOUT };
    if (method === 'get' || method === 'delete') {
      return axios[method](url, config);
    } else {
      return axios[method](url, data, config);
    }
  }

  connectServerWebsocket(serverId: string, onMessage: (msg: any) => void) {
    const url = this.baseUrl.replace(/^http/, 'ws') + `/servers/${serverId}/ws`;
    const ws = new WebSocket(url, { headers: this.getAuthHeaders() });
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        onMessage(parsed);
      } catch (e) {
        onMessage(data);
      }
    });
    ws.on('error', (err) => console.error('Wings websocket error', err));
    return ws;
  }
}
