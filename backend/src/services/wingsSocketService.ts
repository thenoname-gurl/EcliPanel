import { WingsApiService } from './wingsApiService';
import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { socEmitter } from './socSocketService';

const INITIAL_RETRY_DELAY = 15_000;
const MAX_RETRY_DELAY = 5 * 60_000;

export class WingsSocketService {
  private wings: WingsApiService;
  private sockets: Record<string, any> = {};
  private retryTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private statsIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  private stopped = false;

  constructor(baseUrl: string, token: string) {
    this.wings = new WingsApiService(baseUrl, token);
  }

  stop() {
    this.stopped = true;
    for (const t of Object.values(this.retryTimers)) clearTimeout(t);
    for (const i of Object.values(this.statsIntervals)) clearInterval(i);
    for (const ws of Object.values(this.sockets)) {
      try { ws.terminate?.() ?? ws.close?.(); } catch {}
    }
    this.sockets = {};
    this.retryTimers = {};
    this.statsIntervals = {};
  }

  listenToServer(serverId: string, retryDelay = INITIAL_RETRY_DELAY) {
    if (this.stopped) return;
    if (this.sockets[serverId]) return;

    let ws: any;
    try {
      ws = this.wings.connectServerWebsocket(serverId, async (msg) => {
            try {
              if (msg?.event !== 'stats') return;
              let stats: any = msg.args?.[0];
              if (typeof stats === 'string') {
                try { stats = JSON.parse(stats); } catch { return; }
              }
              if (!stats || typeof stats !== 'object') return;
              const repo = AppDataSource.getRepository(SocData);
              const record = repo.create({ serverId, metrics: stats, timestamp: new Date() });
              const saved = await repo.save(record);
              try { socEmitter.emit('update', saved); } catch (e) { /* skip */ }
            } catch (e) { console.error('wingsSocketService: failed to persist stats', e); }
      });
    } catch {
      this._scheduleRetry(serverId, retryDelay);
      return;
    }

    this.sockets[serverId] = ws;

    ws.on('open', () => {
      this.retryTimers[serverId] && clearTimeout(this.retryTimers[serverId]);
      delete this.retryTimers[serverId];
      const sendStats = () => {
        try { ws.send(JSON.stringify({ event: 'send stats', args: [] })); } catch {}
      };
      sendStats();
      if (this.statsIntervals[serverId]) clearInterval(this.statsIntervals[serverId]);
      this.statsIntervals[serverId] = setInterval(sendStats, 30_000);
    });

    ws.on('close', () => {
      if (this.statsIntervals[serverId]) {
        clearInterval(this.statsIntervals[serverId]);
        delete this.statsIntervals[serverId];
      }
      delete this.sockets[serverId];
      if (!this.stopped) this._scheduleRetry(serverId, retryDelay);
    });

    ws.on('error', () => {
      // skip
    });
  }

  private _scheduleRetry(serverId: string, delay: number) {
    if (this.stopped || this.retryTimers[serverId]) return;
    const next = Math.min(delay * 2, MAX_RETRY_DELAY);
    this.retryTimers[serverId] = setTimeout(() => {
      delete this.retryTimers[serverId];
      this.listenToServer(serverId, next);
    }, delay);
  }

  async listenToAll() {
    const res = await this.wings.getServers();
    const servers: any[] = Array.isArray(res.data)
      ? res.data
      : (res.data?.servers ?? []);
    for (const s of servers) {
      const id: string = s.uuid || s.id;
      if (id) this.listenToServer(id);
    }
  }
}
