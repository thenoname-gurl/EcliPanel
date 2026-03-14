import WebSocket from 'ws';
import { AppDataSource } from '../config/typeorm';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { User } from '../models/user.entity';
import { signWingsJwt } from './remoteHandler';

interface ProxyCtx {
  params?: any;
  query?: any;
  request?: any;
  headers?: any;
}

// This was probabably second hardest thing I did in this codebase
// Migrations were harder I guess but we will not ignore the fact that migrations made me do this
// I'm glad it works now?
export function wsProxyRoutes(app: any, prefix: string) {
  function unwrapArgs(args: any) {
    const arr = Array.from(args as any);
    let ctx: any = undefined;
    let ws: any = undefined;
    let message: any = undefined;
    if (arr.length === 1) {
      ws = arr[0];
      ctx = ws?.data || {};
    } else if (arr.length === 2) {
      if (arr[0] && arr[0].params) {
        ctx = arr[0];
        ws = arr[1];
      } else if (arr[0] && typeof arr[0].send === 'function') {
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
      if (session) session.close();
    },
    error(...args: any[]) {
      const { ws } = unwrapArgs(arguments);
      const session = ws?.data?._ecliProxySession as WingsProxySession | undefined;
      if (session) session.error((args as any)[2]);
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
  private serverId?: string;
  private panelOrigin?: string;

  constructor(app: any, ctx: ProxyCtx, ws: any) {
    this.app = app;
    this.ctx = ctx;
    this.clientWs = ws;
    this.serverId = ctx?.params?.id;

    (ws as any).data = (ws as any).data || {};
    (ws as any).data._ecliProxySession = this;

    void this.init();
  }

  private getHeader(name: string) {
    const headers = this.ctx?.headers || {};
    if (headers && typeof headers.get === 'function') return headers.get(name);
    return headers[name.toLowerCase()] || headers[name];
  }

  private async init() {
    try {
      if (!this.serverId) {
        this.log('error', 'missing server id');
        this.close();
        return;
      }

      const token = this.extractPanelToken();
      if (!token) {
        this.log('error', 'missing authentication token');
        this.close();
        return;
      }

      const user = await this.validateSession(token);
      if (!user) {
        this.log('error', 'invalid session token');
        this.close();
        return;
      }

      const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: this.serverId });
      if (!cfg) {
        this.log('error', 'server not found');
        this.close();
        return;
      }

      const node = await AppDataSource.getRepository(Node).findOneBy({ id: cfg.nodeId });
      if (!node) {
        this.log('error', 'node not found for server');
        this.close();
        return;
      }

      this.node = node;
      this.panelOrigin = this.normalizeOrigin(node.allowedOrigin || this.getHeader('origin') || process.env.FRONTEND_URL || '');
      await this.connectToWings();
    } catch (err: any) {
      this.log('error', 'ws-proxy init error', err);
      this.close();
    }
  }

  private extractPanelToken(): string | null {
    const q = (this.ctx?.query || {}).token as string | undefined;
    if (q) return q;

    const cookie = String(this.getHeader('cookie') || '');
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1] || '');
    return null;
  }

  private async validateSession(token: string): Promise<User | null> {
    try {
      const decoded = this.app.jwt.verify(token) as { userId: number; sessionId: string };
      const user = await AppDataSource.getRepository(User).findOne({ where: { id: decoded.userId } });
      if (!user || !user.sessions?.includes(decoded.sessionId)) return null;
      return user;
    } catch {
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
        return s.replace(/\/+$|\/+/g, '');
      }
    }
  }

  private async connectToWings() {
    if (!this.node || !this.serverId) return;

    const nodeUrl = String(this.node.url).replace(/\/+$/, '');
    const wsUrl = nodeUrl.replace(/^https?:/, this.node.useSSL === false ? 'ws:' : 'wss:') + `/api/servers/${this.serverId}/ws`;

    const headers: any = {};
    if (this.panelOrigin) headers.Origin = this.panelOrigin;
    try {
      if (this.node && this.node.token) {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          iss: 'eclipanel',
          sub: String((this.ctx as any)?.user?.id || ''),
          aud: [''],
          iat: now,
          nbf: now,
          exp: now + 600,
          jti: (Math.random() + 1).toString(36).slice(2, 12),
          user_uuid: String((this.ctx as any)?.user?.uuid || ''),
          server_uuid: this.serverId,
          permissions: ['*'],
          use_console_read_permission: false,
        };
        const signed = signWingsJwt(payload, String(this.node.token));
        headers.Authorization = `Bearer ${signed}`;
      }
    } catch (e) {
      if (this.node && this.node.token) headers.Authorization = `Bearer ${this.node.token}`;
    }

    //this.log('debug', 'connecting to wings', { wsUrl, headers });

    try {
      if (this.clientWs && typeof this.clientWs.send === 'function') {
        this.clientWs.send(JSON.stringify({ event: 'status', args: ['Connecting'] }));
      }
    } catch (e) {
      // skip
    }

    this.wingsWs = new WebSocket(wsUrl, { headers });

    this.wingsWs.on('open', () => {
      //this.log('debug', 'wings ws open');
      while (this.queue.length && this.wingsWs && this.wingsWs.readyState === WebSocket.OPEN) {
        const queued = this.queue.shift();
        if (queued) this.wingsWs.send(queued);
      }
    });

    this.wingsWs.on('message', (msg: any) => {
      let text: string;
      try {
        if (typeof msg === 'string') text = msg;
        else if (msg instanceof Buffer) text = msg.toString('utf8');
        else if (msg instanceof ArrayBuffer) text = Buffer.from(msg).toString('utf8');
        else text = JSON.stringify(msg);
      } catch (e) {
        text = String(msg);
      }
      //this.log('debug', 'forwarding wings -> client', (text && text.slice) ? text.slice(0, 256) : text);
      try { this.clientWs.send(text); } catch (e) { this.log('error', 'failed sending to client', e); }
    });

    this.wingsWs.on('close', () => {
      this.log('debug', 'wings ws closed');
      this.close();
    });

    this.wingsWs.on('error', (err: any) => {
      this.log('error', 'wings ws error', err);
      this.close();
    });
  }

  public onClientMessage(msg: any) {
    let text: string;
    try {
      if (typeof msg === 'string') text = msg;
      else if (msg instanceof Buffer) text = msg.toString('utf8');
      else if (msg instanceof ArrayBuffer) text = Buffer.from(msg).toString('utf8');
      else text = JSON.stringify(msg);
    } catch (e) {
      text = String(msg);
    }

    //this.log('debug', 'client -> wings', (text && text.slice) ? text.slice(0, 256) : text);

    if (!this.wingsWs || this.wingsWs.readyState !== WebSocket.OPEN) {
      this.queue.push(text);
      return;
    }

    try {
      this.wingsWs.send(text);
    } catch (err) {
      this.log('error', 'failed to send to wings', err);
    }
  }

  public close() {
    try { this.clientWs?.close?.(); } catch {}
    try { this.wingsWs?.close?.(); } catch {}
  }

  public error(err: any) {
    this.log('error', 'client websocket error', err);
    this.close();
  }

  private log(level: 'debug' | 'error' | 'warn' | 'info', message: string, meta?: any) {
    if (this.app && this.app.log && typeof this.app.log[level] === 'function') {
      this.app.log[level](message, meta);
    } else {
      (console as any)[level](message, meta);
    }
  }
}