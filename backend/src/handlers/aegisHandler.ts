import { AppDataSource } from '../config/typeorm';
import { AegisAttack } from '../models/aegisAttack.entity';
import { Node } from '../models/node.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { t } from 'elysia';
import type { BaseHandlerContext, NodeApp } from '../types';
import {
  latestMetrics,
  MAX_AGE_MS,
  HISTORY,
  HISTORY_MAX,
  Sample,
  AttackEvent,
  mergeClosedAttack,
  closeAttack,
  ATTACKS,
  OPEN_ATTACK,
  ATTACKS_MAX,
  ATTACK_THRESHOLD_PPS,
  ATTACK_COOLDOWN_SAMPLES,
  ATTACK_MERGE_GAP_MS,
  DAEMON_METHOD_LABELS,
  daemonMethodLabel,
  METHOD_KEYS,
  METHOD_LABELS,
  dominantMethod,
  processPush,
  adminOk
} from '../utils/aegisState';

/**
 * Welcome to hell!
 * This is home for Ecli Aegis (XDP Daemon) metrics that pushes its metrics here every N seconds
 * POST /api/v1/nodes/aegis/metrics (daemon to panel)
 * GET  /api/v1/nodes/aegis/metrics (aadmin get latest snapshot)
 * GET  /api/v1/nodes/aegis/history (admin get time series for graphs)
 * GET  /api/v1/nodes/aegis/attacks (admin get attack events log)
 */

export async function aegisRoutes(app: NodeApp, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);

  app.post(
    prefix + '/nodes/aegis/metrics',
    async (ctx) => {
      const auth = ctx.request.headers.get('authorization') || '';
      const nodeName = ctx.request.headers.get('x-node-name') || '';
      const match = /^Bearer (.+)$/i.exec(auth);
      if (!match) {
        ctx.set.status = 401;
        return { error: 'unauthorized' };
      }

      const node = await nodeRepo().findOneBy({ token: match[1] });
      if (!node) {
        ctx.set.status = 401;
        return { error: 'unauthorized' };
      }

      const data = ctx.body as any;
      latestMetrics.set(node.id, {
        nodeName: nodeName || node.name,
        receivedAt: Date.now(),
        data,
      });
      processPush(node.id, data);

      return { success: true };
    },
    {
      body: t.Any(),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Node agent pushes EcliAegis DDoS metrics', tags: ['Nodes'] },
    },
  );

  app.get(
    prefix + '/nodes/aegis/metrics',
    async (ctx: BaseHandlerContext) => {
      if (!adminOk(ctx)) {
        ctx.set.status = 403;
        return { error: 'forbidden' };
      }
      const now = Date.now();
      const out: Record<number, { nodeName: string; receivedAt: number; data: unknown }> = {};
      for (const [id, m] of latestMetrics) {
        if (now - m.receivedAt < MAX_AGE_MS) out[id] = m;
      }
      return out;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get latest EcliAegis metrics for all nodes', tags: ['Nodes'] },
    },
  );

  app.get(
    prefix + '/nodes/aegis/history',
    async (ctx: BaseHandlerContext) => {
      if (!adminOk(ctx)) {
        ctx.set.status = 403;
        return { error: 'forbidden' };
      }
      const q = ctx.query as Record<string, string>;
      const nodeId = q.nodeId ? Number(q.nodeId) : undefined;
      const out: Record<number, Sample[]> = {};
      for (const [id, hist] of HISTORY) {
        if (nodeId !== undefined && id !== nodeId) continue;
        out[id] = hist;
      }
      return out;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get EcliAegis time-series history', tags: ['Nodes'] },
    },
  );

  app.get(
    prefix + '/nodes/aegis/attacks',
    async (ctx: BaseHandlerContext) => {
      if (!adminOk(ctx)) {
        ctx.set.status = 403;
        return { error: 'forbidden' };
      }
      const q = ctx.query as Record<string, string>;
      const nodeId = q.nodeId ? Number(q.nodeId) : undefined;
      const out: Record<number, AttackEvent[]> = {};
      for (const [id, list] of ATTACKS) {
        if (nodeId !== undefined && id !== nodeId) continue;
        out[id] = list;
      }
      for (const [key, open] of OPEN_ATTACK) {
        if (nodeId !== undefined && open.nodeId !== nodeId) continue;
        const list = out[open.nodeId] ?? [];
        out[open.nodeId] = [{ ...open, endTs: Date.now() }, ...list];
      }
      return out;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get EcliAegis attack event log', tags: ['Nodes'] },
    },
  );
}
