import WebSocket from 'ws';
import { AppDataSource } from '../config/typeorm';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { User } from '../models/user.entity';
import { signWingsJwt } from './remoteHandler';
import { handleSocConnection } from './wsRoutes';
import { v4 as uuidv4 } from 'uuid';

interface ProxyCtx {
  params?: any;
  query?: any;
  request?: any;
  headers?: any;
}

// I finally state this is HELL

export function wsProxyRoutes(app: any, prefix: string) {
  function unwrapArgs(args: IArguments | any[]) {
    const arr = Array.from(args);
    let ctx: any = undefined;
    let ws: any = undefined;
    let message: any = undefined;

    if (arr.length === 1) {
      ws = arr[0];
      ctx = ws?.data || {};
    } else if (arr.length === 2) {
      if (arr[0]?.params) {
        ctx = arr[0];
        ws = arr[1];
      } else if (typeof arr[0]?.send === 'function') {
        ws = arr[0];
        message = arr[1];
        ctx = ws?.data || {};
      } else {
        ctx = arr[0];
        ws = arr[1];
      }
    } else if (arr.length >= 3) {
      ctx = arr[0];
      ws = arr[1];
      message = arr[2];
    }
    return { ctx, ws, message };
  }

  app.ws(prefix + '/ws/soc', {
    open(...args: any[]) {
      const { ctx, ws } = unwrapArgs(arguments);
      if (!ws) return;
      handleSocConnection(app, ws, ctx);
    },
    message(...args: any[]) {
      const { ws, message } = unwrapArgs(arguments);
    },
    close(...args: any[]) {
      const { ws } = unwrapArgs(arguments);
      try { ws.close?.(); } catch {};
    },
    error(...args: any[]) {
      const { ws } = unwrapArgs(arguments);
      try { ws.close?.(); } catch {};
    },
  });

  app.ws(prefix + '/servers/:id/ws/proxy', {
    open(...args: any[]) {
      const { ctx, ws } = unwrapArgs(arguments);
      if (!ws) return;
      new WingsProxySession(app, ctx, ws);
    },
    message(...args: any[]) {
      const { ws, message } = unwrapArgs(arguments);
      const session = ws?.data?._ecliProxySession as WingsProxySession | undefined;
      if (session) session.onClientMessage(message);
    },
    close(...args: any[]) {
      const { ws } = unwrapArgs(arguments);
      const session = ws?.data?._ecliProxySession as WingsProxySession | undefined;
      if (session) session.onClientClose();
    },
    error(...args: any[]) {
      const { ws } = unwrapArgs(arguments);
      const session = ws?.data?._ecliProxySession as WingsProxySession | undefined;
      if (session) session.onClientError(args[2]);
    },
  });
}

class WingsProxySession {
  private clientWs: any;
  private ctx: ProxyCtx;
  private app: any;
  private wingsWs: WebSocket | null = null;
  private queue: string[] = [];
  private node?: Node;
  private server?: ServerConfig;
  private user?: User;
  private serverId?: string;
  private panelOrigin?: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private closedByClient = false;
  private isAuthenticated = false;
  private destroyed = false;

  constructor(app: any, ctx: ProxyCtx, ws: any) {
    this.app = app;
    this.ctx = ctx;
    this.clientWs = ws;
    this.serverId = ctx?.params?.id;

    ws.data = ws.data || {};
    ws.data._ecliProxySession = this;

    this.init().catch((err) => {
      this.log('error', 'ws-proxy init failed', err);
      this.destroy();
    });
  }

  private getHeader(name: string): string | undefined {
    const headers = this.ctx?.headers || {};
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name.toLowerCase()] || headers[name];
  }

  private async init() {
    if (!this.serverId) {
      this.sendToClient({ event: 'error', args: ['Missing server ID'] });
      this.destroy();
      return;
    }

    const token = this.extractPanelToken();
    if (!token) {
      this.sendToClient({ event: 'error', args: ['Missing authentication token'] });
      this.destroy();
      return;
    }

    const user = await this.validateSession(token);
    if (!user) {
      this.sendToClient({ event: 'error', args: ['Invalid session'] });
      this.destroy();
      return;
    }
    this.user = user;

    const cfg = await AppDataSource.getRepository(ServerConfig).findOne({
      where: { uuid: this.serverId },
    });

    if (!cfg) {
      this.sendToClient({ event: 'error', args: ['Server not found'] });
      this.destroy();
      return;
    }
    this.server = cfg;

    if (cfg.suspended) {
      const actor = String(cfg.suspendedBy || 'system').trim() || 'system';
      const reason = String(cfg.suspendedReason || 'No reason provided').trim() || 'No reason provided';
      this.sendToClient({
        event: 'error',
        args: [`This server was suspended by ${actor} for reason: ${reason}. Please contact support.`],
      });
      this.destroy();
      return;
    }

    const node = cfg.nodeId ? await AppDataSource.getRepository(Node).findOneBy({ id: cfg.nodeId }) : null;
    if (!node) {
      this.sendToClient({ event: 'error', args: ['Node not found'] });
      this.destroy();
      return;
    }
    this.node = node;

    this.panelOrigin = this.normalizeOrigin(
      node.allowedOrigin || this.getHeader('origin') || process.env.FRONTEND_URL || ''
    );

    await this.connectToWings();
  }

  private extractPanelToken(): string | null {
    const queryToken = this.ctx?.query?.token;
    if (queryToken) return String(queryToken);

    const authHeader = this.getHeader('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    const cookie = this.getHeader('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);

    return null;
  }

  private async validateSession(token: string): Promise<User | null> {
    try {
      const decoded = this.app.jwt.verify(token) as { userId: number; sessionId: string };
      if (!decoded?.userId) return null;

      const user = await AppDataSource.getRepository(User).findOne({
        where: { id: decoded.userId },
        relations: ['org'],
      });

      if (!user) return null;

      if (user.sessions && decoded.sessionId) {
        if (!user.sessions.includes(decoded.sessionId)) return null;
      }

      return user;
    } catch (err) {
      this.log('debug', 'token validation failed', err);
      return null;
    }
  }

  private normalizeOrigin(origin: string | undefined): string | undefined {
    if (!origin) return undefined;
    const s = String(origin).trim();
    try {
      return new URL(s).origin;
    } catch {
      try {
        return new URL(s.startsWith('http') ? s : `https://${s}`).origin;
      } catch {
        return s.replace(/\/+$/, '');
      }
    }
  }

  private async connectToWings() {
    if (this.destroyed || !this.node || !this.serverId) return;

    this.clearReconnect();

    const nodeUrl = String((this.node as any).backendWingsUrl || this.node.url).replace(/\/+$/, '');
    const protocol = this.node!.useSSL === false ? 'ws:' : 'wss:';
    const wsUrl = nodeUrl.replace(/^https?:/, protocol) + `/api/servers/${this.serverId}/ws`;

    const headers: Record<string, string> = {};
    if (this.panelOrigin) headers['Origin'] = this.panelOrigin;

    try {
      if (this.node.token) {
        const jwt = this.generateWingsJwt();
        headers['Authorization'] = `Bearer ${jwt}`;
      }
    } catch (err) {
      this.log('error', 'failed to generate wings jwt', err);
      if (this.node.token) {
        headers['Authorization'] = `Bearer ${this.node.token}`;
      }
    }

    this.sendToClient({ event: 'status', args: ['Connecting...'] });
    this.log('debug', 'connecting to wings', { url: wsUrl });

    try {
      this.wingsWs = new WebSocket(wsUrl, {
        headers,
        perMessageDeflate: false,
        handshakeTimeout: 20000,
      } as any);
    } catch (err) {
      this.log('error', 'failed to create wings websocket', err);
      this.scheduleReconnect();
      return;
    }

    this.setupWingsHandlers();
  }

  private generateWingsJwt(): string {
    const now = Math.floor(Date.now() / 1000);

    const normalizeUuid = (value: any): string => {
      if (!value) return uuidv4().replace(/-/g, '');
      const s = String(value).toLowerCase().replace(/-/g, '');
      if (/^[0-9a-f]{32}$/.test(s)) return s;
      return uuidv4().replace(/-/g, '');
    };

    const userUuid = normalizeUuid(this.user?.id);
    const serverUuid = normalizeUuid(this.serverId);
    const jti = normalizeUuid(uuidv4());

    const payload = {
      iss: process.env.APP_URL || 'eclipanel',
      sub: userUuid,
      aud: [this.node!.url.replace(/\/+$/, '')],
      iat: now,
      nbf: now,
      exp: now + 600,
      jti,
      user_uuid: userUuid,
      server_uuid: serverUuid,
      permissions: ['*'],
      unique_id: jti,
    };

    return signWingsJwt(payload, String(this.node!.token));
  }

  private setupWingsHandlers() {
    if (!this.wingsWs) return;

    this.wingsWs.on('open', () => {
      this.reconnectAttempts = 0;
      this.log('info', 'wings ws connected');
      this.sendToClient({ event: 'status', args: ['Connected'] });
      this.startPing();
      try {
        this.refreshWingsAuth();
      } catch (e) {
        this.log('error', 'failed to send initial wings auth', e);
      }
      this.drainQueue();
    });

    this.wingsWs.on('message', (data: WebSocket.Data) => {
      this.handleWingsMessage(data);
    });

    this.wingsWs.on('close', (code: number, reason: Buffer) => {
      this.log('warn', 'wings ws closed', { code, reason: reason?.toString() });
      this.stopPing();
      this.isAuthenticated = false;

      if (!this.closedByClient && !this.destroyed) {
        this.sendToClient({ event: 'status', args: ['Disconnected'] });
        this.scheduleReconnect();
      }
    });

    this.wingsWs.on('error', (err: Error) => {
      this.log('error', 'wings ws error', err);
      this.stopPing();
      if (!this.closedByClient && !this.destroyed) {
        this.scheduleReconnect();
      }
    });

    this.wingsWs.on('pong', () => {
      this.lastPong = Date.now();
    });
  }

  private handleWingsMessage(data: WebSocket.Data) {
    let text: string;
    try {
      if (typeof data === 'string') {
        text = data;
      } else if (Buffer.isBuffer(data)) {
        text = data.toString('utf8');
      } else if (data instanceof ArrayBuffer) {
        text = Buffer.from(data).toString('utf8');
      } else if (Array.isArray(data)) {
        text = Buffer.concat(data.map(d => Buffer.isBuffer(d) ? d : Buffer.from(d))).toString('utf8');
      } else {
        text = String(data);
      }
    } catch (e) {
      this.log('error', 'failed to parse wings message', e);
      return;
    }

    try {
      const msg = JSON.parse(text);

      if (msg.event === 'auth success') {
        this.isAuthenticated = true;
        this.log('info', 'wings auth success');
        this.sendToWings({ event: 'send logs', args: [null] });
        this.sendToWings({ event: 'send stats', args: [null] });
      } else if (msg.event === 'token expiring') {
        this.log('info', 'wings token expiring, refreshing...');
        this.refreshWingsAuth();
      } else if (msg.event === 'token expired') {
        this.log('warn', 'wings token expired');
        this.isAuthenticated = false;
        this.refreshWingsAuth();
      } else if (msg.event === 'jwt error') {
        this.log('error', 'wings jwt error', msg.args);
        this.isAuthenticated = false;
      }
    } catch {
      // skip
    }

    this.sendRawToClient(text);
  }

  private refreshWingsAuth() {
    if (!this.wingsWs || this.wingsWs.readyState !== WebSocket.OPEN) return;

    try {
      const jwt = this.generateWingsJwt();
      this.sendToWings({ event: 'auth', args: [jwt] });
    } catch (err) {
      this.log('error', 'failed to refresh wings auth', err);
    }
  }

  private drainQueue() {
    if (!this.wingsWs || this.wingsWs.readyState !== WebSocket.OPEN) return;

    const BATCH_SIZE = 32;
    let sent = 0;

    while (sent < BATCH_SIZE && this.queue.length > 0) {
      const msg = this.queue.shift();
      if (msg) {
        try {
          this.wingsWs.send(msg);
          sent++;
        } catch (err) {
          this.log('error', 'failed to drain queue message', err);
          this.queue.unshift(msg);
          break;
        }
      }
    }

    if (this.queue.length > 0) {
      setImmediate(() => this.drainQueue());
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;

    this.reconnectAttempts++;
    const BASE_DELAY = 2000;
    const MAX_DELAY = 60000;
    const delay = Math.min(BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1), MAX_DELAY);

    this.log('info', 'scheduling reconnect', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && this.clientWs) {
        this.connectToWings().catch((err) => {
          this.log('error', 'reconnect failed', err);
          this.scheduleReconnect();
        });
      }
    }, delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing() {
    this.stopPing();
    this.lastPong = Date.now();

    this.pingInterval = setInterval(() => {
      if (!this.wingsWs || this.wingsWs.readyState !== WebSocket.OPEN) return;

      if (Date.now() - this.lastPong > 45000) {
        this.log('warn', 'wings pong timeout, reconnecting');
        try {
          this.wingsWs.terminate();
        } catch {}
        this.wingsWs = null;
        this.scheduleReconnect();
        return;
      }

      try {
        this.wingsWs.ping();
      } catch {}
    }, 15000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public onClientMessage(msg: any) {
    if (this.destroyed) return;

    let text: string;
    try {
      if (typeof msg === 'string') {
        text = msg;
      } else if (Buffer.isBuffer(msg)) {
        text = msg.toString('utf8');
      } else if (msg instanceof ArrayBuffer) {
        text = Buffer.from(msg).toString('utf8');
      } else {
        text = JSON.stringify(msg);
      }
    } catch {
      text = String(msg);
    }

    try {
      const parsed = JSON.parse(text);
      
      if (parsed.event === 'auth') {
        const jwt = this.generateWingsJwt();
        text = JSON.stringify({ event: 'auth', args: [jwt] });
      }
    } catch {
      // skip
    }

    this.sendToWings(text);
  }

  private sendToWings(msg: string | object) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);

    if (!this.wingsWs || this.wingsWs.readyState !== WebSocket.OPEN) {
      this.queue.push(text);
      return;
    }

    try {
      this.wingsWs.send(text);
    } catch (err) {
      this.log('error', 'failed to send to wings', err);
      this.queue.push(text);
    }
  }

  private sendToClient(msg: object) {
    this.sendRawToClient(JSON.stringify(msg));
  }

  private sendRawToClient(text: string) {
    if (this.destroyed || !this.clientWs) return;

    try {
      this.clientWs.send(text);
    } catch (err) {
      this.log('error', 'failed to send to client', err);
    }
  }

  public onClientClose() {
    this.closedByClient = true;
    this.destroy();
  }

  public onClientError(err: any) {
    this.log('error', 'client ws error', err);
    this.destroy();
  }

  private destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.clearReconnect();
    this.stopPing();

    if (this.wingsWs) {
      try {
        if (this.wingsWs.readyState === WebSocket.OPEN || 
            this.wingsWs.readyState === WebSocket.CONNECTING) {
          this.wingsWs.close(1000, 'Client disconnected');
        }
      } catch {}
      this.wingsWs = null;
    }

    if (this.clientWs) {
      try {
        this.clientWs.close?.();
      } catch {}
      this.clientWs = null;
    }

    this.queue = [];
  }

  public close() {
    this.onClientClose();
  }

  public error(err: any) {
    this.onClientError(err);
  }

  private log(level: 'debug' | 'error' | 'warn' | 'info', message: string, meta?: any) {
    const prefix = `[WSProxy:${this.serverId?.slice(0, 8) || 'unknown'}]`;
    const fullMessage = `${prefix} ${message}`;

    if (this.app?.log?.[level]) {
      this.app.log[level](fullMessage, meta);
    } else {
      console[level](fullMessage, meta !== undefined ? meta : '');
    }
  }
}