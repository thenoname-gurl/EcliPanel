import fs from 'fs';
import path from 'path';
import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { TunnelDevice } from '../models/tunnelDevice.entity';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { Organisation } from '../models/organisation.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware';
import {
  generateUserCode,
  getAuthToken,
  getStringField,
  getNumberField,
  createJsonResponse,
  errorResponse,
} from '../utils/tunnel.utils';
import {
  verifyDeviceToken,
  allocatePort,
  tryReuseRecentPort,
  getOnlineServerAgent,
  assignPendingAllocations,
} from '../services/tunnel.service';
import { TUNNEL_SERVER_TYPES } from '../types/tunnels';
import type { TunnelServerType } from '../types/tunnels';
import {
  agentConnections,
  registerAgent,
  unregisterAgent,
  sendAgentMessage,
} from '../services/agent.service';
import {
  handleServerConnectionOpen,
  handleConnectionData,
  handleConnectionClose,
  cleanupConnectionsByAgent,
} from '../services/connection.service';
import { getRolloutTreatment } from '../services/rolloutService';

type HeadersLike = Record<string, string | string[] | undefined>;

type TunnelApp = {
  jwt: {
    verify: (token: string) => unknown;
    sign?: (payload: Record<string, unknown>, opts?: { expiresIn?: string }) => string;
  };
  get?: (...args: unknown[]) => unknown;
  post?: (...args: unknown[]) => unknown;
  ws?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

type TunnelRequestContext = {
  headers?: HeadersLike;
  request?: { url?: string };
  query?: Record<string, unknown> | undefined;
  params?: Record<string, string> | undefined;
  body?: unknown;
  set?: { status?: number };
  apiKey?: { type?: string } | null;
  user?: User | null;
};

type WsLike = WebSocket & { data?: Record<string, unknown> };

function getAuthError(authResult: unknown): string | undefined {
  if (authResult && typeof authResult === 'object' && 'error' in (authResult as Record<string, unknown>)) {
    const val = (authResult as Record<string, unknown>)['error'];
    return typeof val === 'string' ? val : undefined;
  }
  return undefined;
}

function isCtxLike(v: unknown): v is TunnelRequestContext {
  return typeof v === 'object' && v !== null && (
    'params' in (v as Record<string, unknown>) ||
    'query' in (v as Record<string, unknown>) ||
    'headers' in (v as Record<string, unknown>)
  );
}

function isWsLikeObj(v: unknown): v is WsLike {
  return typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>)['send'] === 'function';
}

const TUNNEL_WS_SCHEMA = {
  detail: {
    summary: 'Tunnel agent websocket',
    tags: ['Tunnels'],
    description: 'Establish a websocket control channel for tunnel client and server agents.',
  },
};

function isAdminUser(user: User | null | undefined): boolean {
  return !!user && ['*', 'admin', 'rootAdmin'].includes(user.role);
}

async function getAccessibleOrganisationIds(user: User): Promise<number[]> {
  const orgIds = new Set<number>();
  if (user.org?.id && ['admin', 'owner'].includes(user.orgRole)) {
    orgIds.add(user.org.id);
  }
  const membershipRepo = AppDataSource.getRepository(
    require('../models/organisationMember.entity').OrganisationMember
  );
  const memberships = await membershipRepo.find({ where: { userId: user.id } });
  memberships.forEach(membership => {
    const m = membership as Record<string, unknown>;
    const orgRole = typeof m.orgRole === 'string' ? m.orgRole : undefined;
    const organisationId = typeof m.organisationId === 'number' ? m.organisationId : undefined;
    if (orgRole && organisationId && ['admin', 'owner'].includes(orgRole)) {
      orgIds.add(organisationId);
    }
  });
  return Array.from(orgIds);
}

async function deviceBelongsToUserOrOrg(device: TunnelDevice, user: User): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (device.ownerUser?.id === user.id) return true;
  if (device.organisation?.id && (await canManageOrganisation(user, device.organisation.id))) {
    return true;
  }
  return false;
}

async function canManageOrganisation(user: User, organisationId: number): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (user.org?.id === organisationId && ['admin', 'owner'].includes(user.orgRole)) return true;
  const membershipRepo = AppDataSource.getRepository(
    require('../models/organisationMember.entity').OrganisationMember
  );
  const membership = await membershipRepo.findOne({ where: { userId: user.id, organisationId } });
  return !!membership && ['admin', 'owner'].includes(membership.orgRole);
}

function isValidHostname(h: string): boolean {
  return /^[a-zA-Z0-9.:\-[\]]+$/.test(h) && !h.startsWith('.') && !h.includes('..');
}

function getRequestBaseUrl(ctx: TunnelRequestContext | undefined): string {
  const headers = (ctx && ctx.headers) || {};
  const host = (headers['x-forwarded-host'] || headers['host'] || headers['Host']) as
    | string
    | undefined;
  const proto = (headers['x-forwarded-proto'] ||
    headers['x-forwarded-protocol'] ||
    headers['x-forwarded-scheme']) as string | undefined;
  if (host && proto && isValidHostname(String(host))) {
    const scheme = proto.toString().split(',')[0].trim();
    return `${scheme}://${host}`;
  }

  let origin = '';
  try {
    origin = new URL(String(ctx?.request?.url || '')).origin;
  } catch {}

  return origin;
}

function getTunnelFrontendUrl(ctx: TunnelRequestContext | undefined): string {
  const normalize = (value: string | undefined) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed === '*' || trimmed.toLowerCase() === 'true') return '';
    return trimmed.replace(/\/+$/, '');
  };

  const frontendUrl = normalize(process.env.FRONTEND_URL);
  if (frontendUrl) return frontendUrl;

  const appUrl = normalize(process.env.APP_URL);
  if (appUrl) return appUrl;

  const requestUrl = normalize(getRequestBaseUrl(ctx));
  if (requestUrl) return requestUrl;

  return 'https://ecli.app';
}

async function requireAdmin(ctx: TunnelRequestContext): Promise<Response | null> {
  const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
  const err = getAuthError(authResult);
  if (err) {
    const status = ctx.set?.status || 401;
    return errorResponse(err, status);
  }

  if (ctx.apiKey && ctx.apiKey.type === 'admin') return null;
  if (!isAdminUser(ctx.user as User | null | undefined)) {
    return errorResponse('forbidden', 403);
  }
  return null;
}

async function requireAuth(ctx: TunnelRequestContext): Promise<Response | null> {
  const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
  const err = getAuthError(authResult);
  if (err) {
    const status = ctx.set?.status || 401;
    return errorResponse(err, status);
  }

  if (!ctx.user) {
    return errorResponse('unauthorized', 401);
  }
  return null;
}

async function cleanupExpiredEnrollments(): Promise<void> {
  const repo = AppDataSource.getRepository(TunnelDevice);
  const expired = await repo.find({ where: { approved: false } });
  const now = Date.now();
  await Promise.all(
    expired
      .filter(device => device.expiresAt.getTime() <= now)
      .map(async device => repo.remove(device).catch(() => {}))
  );
}

async function requireAuthOrDevice(
  ctx: TunnelRequestContext,
  app: TunnelApp
): Promise<{ device: TunnelDevice | null; error: Response | null }> {
  const token = getAuthToken(ctx as unknown as Record<string, unknown>);
  let device: TunnelDevice | null = null;

  if (token) {
    device = await verifyDeviceToken(app.jwt, token);
  }

  if (!device) {
    const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
    const err = getAuthError(authResult);
    if (err) {
      const status = ctx.set?.status || 401;
      return { device: null, error: errorResponse(err, status) };
    }
  }

  return { device, error: null };
}

const TUNNEL_ROLLOUT_KEY = 'tunnel_feature';

async function requireTunnelRollout(ctx: TunnelRequestContext & { user?: User | null; set?: { status?: number }; t?: (s: string) => string }): Promise<true | { error: string }> {
  if (!ctx.user) return true;
  const { inRollout } = await getRolloutTreatment(ctx.user!.id, TUNNEL_ROLLOUT_KEY);
  if (!inRollout) {
    if (ctx.set) ctx.set.status = 403;
    return { error: ctx.t ? ctx.t('system.tunnelsNotAvailable') : 'tunnels_not_available' };
  }
  return true;
}

export function tunnelRoutes(app: TunnelApp, prefix: string): void {
  app.get(
    `${prefix}/tunnel/server/download`,
    async (ctx: TunnelRequestContext) => {
      const binaryPath = path.resolve(
        process.cwd(),
        '..',
        'tunnel',
        'server',
        'target',
        'release',
        'ecli-tunnel-server'
      );

      if (Bun.file(binaryPath).size === 0) {
        ctx.set.status = 404;
        return errorResponse('Tunnel server binary not available', 404);
      }

      const file = await Bun.file(binaryPath).arrayBuffer();
      const fileName = path.basename(binaryPath);

      return new Response(file, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': String(Buffer.byteLength(file)),
        },
      });
    },
    {
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Download the tunnel server binary',
        tags: ['Tunnels'],
      },
    }
  );

  app.get(
    `${prefix}/tunnel/client/download`,
    async (ctx: TunnelRequestContext) => {
      const binaryPath = path.resolve(
        process.cwd(),
        '..',
        'tunnel',
        'client',
        'target',
        'release',
        'ecli-tunnel-client'
      );

      if (Bun.file(binaryPath).size === 0) {
        ctx.set.status = 404;
        return errorResponse('Tunnel client binary not available', 404);
      }

      const file = await Bun.file(binaryPath).arrayBuffer();
      const fileName = path.basename(binaryPath);

      return new Response(file, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': String(Buffer.byteLength(file)),
        },
      });
    },
    {
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Download the tunnel client binary',
        tags: ['Tunnels'],
      },
    }
  );

  app.get(
    `${prefix}/tunnel/version`,
    async () => {
      const cargoPath = (subdir: string) =>
        path.resolve(process.cwd(), '..', 'tunnel', subdir, 'Cargo.toml');

      const readVersion = (subdir: string, fallback: string): string => {
        try {
          const content = fs.readFileSync(cargoPath(subdir), 'utf8');
          const match = content.match(/^version\s*=\s*"([^"]+)"/m);
          return match ? match[1] : fallback;
        } catch {
          return fallback;
        }
      };

      return {
        server: readVersion('server', '0.2.0'),
        client: readVersion('client', '0.2.0'),
      };
    },
    {
      response: t.Object({
        server: t.String(),
        client: t.String(),
      }),
      detail: {
        summary: 'Get latest tunnel binary versions',
        tags: ['Tunnels'],
      },
    }
  );

  app.get(
    `${prefix}/tunnel/deploy.sh`,
    async (ctx: TunnelRequestContext) => {
      const scriptPath = path.resolve(process.cwd(), '..', 'tunnel', 'deploy.sh');

      if (Bun.file(scriptPath).size === 0) {
        ctx.set.status = 404;
        return errorResponse('Deploy script not available', 404);
      }

      const content = await Bun.file(scriptPath).text();
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/x-shellscript; charset=utf-8',
          'Content-Length': String(Buffer.byteLength(content)),
        },
      });
    },
    {
      response: {
        200: t.String(),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Download the tunnel deploy shell script',
        tags: ['Tunnels'],
      },
    }
  );

  app.post(
    `${prefix}/tunnel/device/start`,
    async (ctx: TunnelRequestContext) => {
      await authenticate(ctx).catch(() => {});
      const body = (ctx.body as Record<string, unknown>) || {};
      const name = getStringField(body, ['name', 'name'], 'agent');
      const requestedKind = getStringField(body, ['kind', 'kind']);
      const kind: 'client' | 'server' = requestedKind === 'server' ? 'server' : 'client';

      if (kind === 'server' && !isAdminUser(ctx.user)) {
        return errorResponse('forbidden', 403);
      }

      const deviceCode = crypto.randomUUID();
      const userCode = generateUserCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const repo = AppDataSource.getRepository(TunnelDevice);
      const deviceData: Partial<TunnelDevice> = {
        deviceCode,
        userCode,
        name,
        kind,
        approved: false,
        expiresAt,
      };
      if (ctx.user) {
        deviceData.ownerUser = ctx.user;
      }

      const organisationId = getNumberField(body, ['organisation_id', 'organisationId']);
      if (organisationId && ctx.user && (await canManageOrganisation(ctx.user, organisationId))) {
        const orgRepo = AppDataSource.getRepository(Organisation);
        const organisation = await orgRepo.findOne({ where: { id: organisationId } });
        if (organisation) {
          deviceData.organisation = organisation;
        }
      }

      const device = repo.create(deviceData as Record<string, unknown>);
      await repo.save(device);

      const baseUrl = getTunnelFrontendUrl(ctx);
      return createJsonResponse({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${baseUrl.replace(/\/$/, '')}/tunnel/verify?user_code=${encodeURIComponent(
          userCode
        )}`,
        expires_in: 600,
      });
    },
    {
      response: {
        200: t.Object({
          device_code: t.String(),
          user_code: t.String(),
          verification_uri: t.String(),
          expires_in: t.Number(),
        }),
        400: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Start tunnel device enrollment',
        tags: ['Tunnels'],
        description: 'Begin device authorization for a tunnel client or server agent.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/device/poll`,
    async (ctx: TunnelRequestContext) => {
      const body = (ctx.body as Record<string, unknown>) || {};
      const deviceCode =
        getStringField(body, ['device_code', 'deviceCode']) ||
        getStringField(ctx.query, ['device_code', 'deviceCode']);

      if (!deviceCode) {
        return errorResponse('missing_device_code', 400);
      }

      const repo = AppDataSource.getRepository(TunnelDevice);
      const device = await repo.findOne({ where: { deviceCode } });

      if (!device) {
        return errorResponse('invalid_device', 400);
      }

      if (Date.now() > device.expiresAt.getTime()) {
        await repo.remove(device).catch(() => {});
        return errorResponse('expired', 400);
      }

      if (!device.approved || !device.token) {
        return errorResponse('authorization_pending', 428);
      }

      const tokenTtl = Math.max(0, Math.floor((device.expiresAt.getTime() - Date.now()) / 1000));

      return createJsonResponse({
        access_token: device.token,
        token_type: 'bearer',
        expires_in: tokenTtl,
      });
    },
    {
      response: {
        200: t.Object({
          access_token: t.String(),
          token_type: t.String(),
          expires_in: t.Number(),
        }),
        400: t.Object({ error: t.String() }),
        428: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Poll for tunnel device approval',
        tags: ['Tunnels'],
        description:
          'Poll for approval and receive an access token once a tunnel device is authorized.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/device/approve`,
    async (ctx: TunnelRequestContext) => {
      const authError = await requireAuth(ctx);
      if (authError) return authError;

      const body = (ctx.body as Record<string, unknown>) || {};

      const userCode =
        getStringField(body, ['user_code', 'userCode']) ||
        getStringField(ctx.query, ['user_code', 'userCode']);
      const deviceCode =
        getStringField(body, ['device_code', 'deviceCode']) ||
        getStringField(ctx.query, ['device_code', 'deviceCode']);
      const name = getStringField(body, ['name', 'deviceName'], 'agent');
      const requestedKind = getStringField(body, ['kind', 'deviceKind']);
      const requestedServerType = getStringField(body, ['server_type', 'serverType']);

      let kind: 'client' | 'server' = 'client';
      if (requestedKind === 'server') {
        kind = 'server';
      } else if (requestedKind === 'client') {
        kind = 'client';
      }

      let serverType: TunnelServerType | undefined = undefined;
      if (typeof requestedServerType === 'string' && TUNNEL_SERVER_TYPES.includes(requestedServerType as TunnelServerType)) {
        serverType = requestedServerType as TunnelServerType;
      }

      if (!userCode && !deviceCode) {
        return errorResponse('missing_identifier', 400);
      }

      const repo = AppDataSource.getRepository(TunnelDevice);
      let device: TunnelDevice | null = null;

      if (userCode) {
        device = await repo.findOne({
          where: { userCode },
          relations: { ownerUser: true, organisation: true },
        });
      }
      if (!device && deviceCode) {
        device = await repo.findOne({
          where: { deviceCode },
          relations: { ownerUser: true, organisation: true },
        });
      }

      if (!device) {
        return errorResponse('not_found', 404);
      }

      if (Date.now() > device.expiresAt.getTime()) {
        await repo.remove(device).catch(() => {});
        return errorResponse('enrollment_expired', 410);
      }

      if (device.approved) {
        return errorResponse('already_approved', 409);
      }

      if (!requestedKind) {
        if (device.kind === 'server' || device.kind === 'client') {
          kind = device.kind;
        }
      }

      const currentUser = ctx.user as User;
      const isAdmin = isAdminUser(currentUser);

      if (kind === 'server' && !isAdmin) {
        return errorResponse('forbidden', 403);
      }

      const ownerUserId = getNumberField(body, ['owner_user_id', 'ownerUserId']);
      const organisationId = getNumberField(body, ['organisation_id', 'organisationId']);

      if (!isAdmin) {
        const isOwnedByCurrentUser = device.ownerUser?.id === currentUser.id;
        const isOwnedByCurrentOrg =
          device.organisation?.id &&
          (await canManageOrganisation(currentUser, device.organisation.id));

        if (!isOwnedByCurrentUser && !isOwnedByCurrentOrg && device.ownerUser) {
          return errorResponse('forbidden', 403);
        }

        if (!isOwnedByCurrentUser && !isOwnedByCurrentOrg && device.organisation) {
          return errorResponse('forbidden', 403);
        }

        if (!device.ownerUser && !device.organisation) {
          if (organisationId && (await canManageOrganisation(currentUser, organisationId))) {
            const orgRepo = AppDataSource.getRepository(Organisation);
            const organisation = await orgRepo.findOne({ where: { id: organisationId } });
            if (organisation) {
              device.organisation = organisation;
              device.ownerUser = undefined;
            }
          } else {
            device.ownerUser = currentUser;
            device.organisation = undefined;
          }
        }
      } else {
        if (ownerUserId) {
          const userRepo = AppDataSource.getRepository(User);
          const ownerUser = await userRepo.findOne({ where: { id: ownerUserId } });
          if (ownerUser) {
            device.ownerUser = ownerUser;
            device.organisation = undefined;
          }
        } else if (organisationId) {
          const orgRepo = AppDataSource.getRepository(Organisation);
          const organisation = await orgRepo.findOne({ where: { id: organisationId } });
          if (organisation) {
            device.organisation = organisation;
            device.ownerUser = undefined;
          }
        }
      }

      device.kind = kind;
      if (kind === 'server' && serverType) {
        device.serverType = serverType;
      }
      device.name = name;
      device.approved = true;
      device.approvedBy = currentUser;
      device.token = app.jwt.sign(
        {
          agent: device.deviceCode,
          kind,
          iat: Math.floor(Date.now() / 1000),
        },
        { expiresIn: kind === 'server' ? '365d' : '90d' }
      );

      await repo.save(device);

      if (kind === 'server' && agentConnections.has(device.deviceCode)) {
        await assignPendingAllocations(device);
      }

      return createJsonResponse({ ok: true });
    },
    {
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        410: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Approve a tunnel device enrollment',
        tags: ['Tunnels'],
        description: 'Authorize a pending tunnel client/server device and issue a JWT token.',
      },
    }
  );

  app.get(
    `${prefix}/tunnel/devices`,
    async (ctx: TunnelRequestContext) => {
      const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
      const authErr = getAuthError(authResult);
      if (authErr) {
        return errorResponse(authErr, ctx.set?.status || 401);
      }

      const rolloutCheck = await requireTunnelRollout(ctx);
      if (rolloutCheck !== true) return rolloutCheck;

      await cleanupExpiredEnrollments();
      const repo = AppDataSource.getRepository(TunnelDevice);
      let devices: TunnelDevice[] = [];

      if (isAdminUser(ctx.user)) {
        devices = await repo.find({
          relations: { organisation: true },
          order: { createdAt: 'DESC' },
        });
      } else if (ctx.user) {
        const orgIds = await getAccessibleOrganisationIds(ctx.user);
        const qb = repo.createQueryBuilder('device');
        qb.leftJoinAndSelect('device.ownerUser', 'ownerUser');
        qb.leftJoinAndSelect('device.organisation', 'organisation');
        qb.where('ownerUser.id = :userId', { userId: ctx.user.id });
        if (orgIds.length > 0) {
          qb.orWhere('organisation.id IN (:...orgIds)', { orgIds });
        }
        qb.andWhere('device.kind = :kind', { kind: 'client' });
        qb.orderBy('device.createdAt', 'DESC');
        devices = await qb.getMany();
      } else {
        return errorResponse('unauthorized', 401);
      }

      return createJsonResponse({
        devices: devices.map(d => ({
          id: d.id,
          device_code: d.deviceCode,
          user_code: d.userCode,
          name: d.name,
          kind: d.kind,
          serverType: d.serverType,
          organisation: d.organisation?.name ?? null,
          approved: d.approved,
          online: agentConnections.has(d.deviceCode),
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
        })),
      });
    },
    {
      response: {
        200: t.Object({
          devices: t.Array(
            t.Object({
              id: t.Number(),
              device_code: t.String(),
              user_code: t.String(),
              name: t.String(),
              kind: t.String(),
              approved: t.Boolean(),
              online: t.Boolean(),
              lastSeenAt: t.Nullable(t.String()),
              createdAt: t.String(),
            })
          ),
        }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'List tunnel devices',
        tags: ['Tunnels'],
        description: 'Return all registered tunnel client and server devices.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/devices/:id/delete`,
    async (ctx: TunnelRequestContext) => {
      const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
      const authErr = getAuthError(authResult);
      if (authErr) {
        const status = ctx.set?.status || 401;
        return errorResponse(authErr, status);
      }

      const deviceId = Number(ctx.params.id);
      if (!Number.isFinite(deviceId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelDevice);
      const device = await repo.findOne({ where: { id: deviceId } });
      if (!device) {
        return errorResponse('not_found', 404);
      }

      const isDeviceAdmin = ctx.apiKey && ctx.apiKey.type === 'admin';
      const canDelete =
        isDeviceAdmin || (ctx.user && (await deviceBelongsToUserOrOrg(device, ctx.user)));
      if (!canDelete) {
        return errorResponse('forbidden', 403);
      }

      const allocRepo = AppDataSource.getRepository(TunnelAllocation);
      const allocations = await allocRepo.find({
        relations: { clientDevice: true, serverDevice: true },
        where: [
          { clientDevice: { id: deviceId } } as unknown as Record<string, unknown>,
          { serverDevice: { id: deviceId } } as unknown as Record<string, unknown>,
        ],
      });

      for (const allocation of allocations) {
        if (allocation.status !== 'closed' && allocation.serverDevice) {
          sendAgentMessage(allocation.serverDevice.deviceCode, {
            type: 'unbind',
            allocationId: allocation.id,
          });
        }
        await allocRepo.remove(allocation).catch(() => {});
      }

      await repo.remove(device).catch(() => {});
      return createJsonResponse({ ok: true });
    },
    {
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Delete a tunnel device',
        tags: ['Tunnels'],
        description: 'Remove a tunnel device and delete its associated allocations.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/devices/:id/regenerate-token`,
    async (ctx: TunnelRequestContext) => {
      const authError = await requireAdmin(ctx);
      if (authError) return authError;

      const deviceId = Number(ctx.params.id);
      if (!Number.isFinite(deviceId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelDevice);
      const device = await repo.findOne({ where: { id: deviceId } });
      if (!device) {
        return errorResponse('not_found', 404);
      }

      if (!device.approved) {
        return errorResponse('not_approved', 400);
      }

      const tokenExpiry = device.kind === 'server' ? '365d' : '90d';
      device.token = app.jwt.sign(
        {
          agent: device.deviceCode,
          kind: device.kind,
          iat: Math.floor(Date.now() / 1000),
        },
        { expiresIn: tokenExpiry }
      );
      await repo.save(device);

      return createJsonResponse({
        access_token: device.token,
        token_type: 'bearer',
        expires_in: device.kind === 'server' ? 365 * 86400 : 90 * 86400,
      });
    },
    {
      response: {
        200: t.Object({ access_token: t.String(), token_type: t.String(), expires_in: t.Number() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Regenerate a tunnel device token',
        tags: ['Tunnels'],
        description: 'Issue a new access token for an approved tunnel device.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/devices`,
    async (ctx: TunnelRequestContext) => {
      const authResult = await authenticate(ctx as unknown as Record<string, unknown>);
      const authErr = getAuthError(authResult);
      if (authErr) {
        const status = ctx.set?.status || 401;
        return errorResponse(authErr, status);
      }

      const isAdminUser_ = isAdminUser(ctx.user) || (ctx.apiKey && ctx.apiKey.type === 'admin');

      const body = (ctx.body as Record<string, unknown>) || {};
      const name = getStringField(body, ['name', 'name'], 'agent');
      const requestedKind = getStringField(body, ['kind', 'kind']);
      const kind: 'client' | 'server' = requestedKind === 'server' ? 'server' : 'client';

      if (kind === 'server' && !isAdminUser_) {
        return errorResponse('forbidden', 403);
      }

      const deviceCode = crypto.randomUUID();
      const userCode = generateUserCode();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      let ownerUser: User | undefined = undefined;
      if (kind === 'client') {
        if (isAdminUser_) {
          ownerUser = ctx.user;
          const ownerUserId = getNumberField(body, ['owner_user_id', 'ownerUserId']);
          if (ownerUserId) {
            const userRepo = AppDataSource.getRepository(User);
            ownerUser = await userRepo.findOne({ where: { id: ownerUserId } });
            if (!ownerUser) return errorResponse('owner_user_not_found', 404);
          }
        } else {
          ownerUser = ctx.user;
        }
      }

      const fqdn = getStringField(body, ['fqdn', 'fqdn'], '');

      const repo = AppDataSource.getRepository(TunnelDevice);
      const device = repo.create({
        deviceCode,
        userCode,
        name,
        kind,
        approved: true,
        approvedBy: ctx.user,
        ownerUser,
        expiresAt,
        token: app.jwt.sign(
          { agent: deviceCode, kind, iat: Math.floor(Date.now() / 1000) },
          { expiresIn: kind === 'server' ? '365d' : '90d' }
        ),
      });
      if (kind === 'server' && fqdn) {
        device.fqdn = fqdn;
      }
      await repo.save(device);

      return createJsonResponse({
        device_code: deviceCode,
        user_code: userCode,
        name,
        kind,
        fqdn: device.fqdn || null,
        access_token: device.token,
        token_type: 'bearer',
        expires_in: kind === 'server' ? 365 * 86400 : 86400,
      });
    },
    {
      response: {
        200: t.Object({
          device_code: t.String(),
          user_code: t.String(),
          name: t.String(),
          kind: t.String(),
          fqdn: t.Nullable(t.String()),
          access_token: t.String(),
          token_type: t.String(),
          expires_in: t.Number(),
        }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Create and approve a tunnel device (admin)',
        tags: ['Tunnels'],
        description:
          'Create a tunnel device that is immediately approved. Returns an access token. Admin only.\n\nSupply `fqdn` for server devices (e.g. `n2.ecli.app`).',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/allocations`,
    async (ctx: TunnelRequestContext) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const tunnelRollout = await requireTunnelRollout(ctx);
      if (tunnelRollout !== true) return tunnelRollout;

      let clientDevice = device;
      const body = (ctx.body as Record<string, unknown>) || {};
      const clientDeviceId = getNumberField(body, ['client_device_id', 'clientDeviceId']);

      if (!clientDevice && ctx.user) {
        if (!clientDeviceId) {
          return errorResponse('client_device_required', 400);
        }
        const deviceRepo = AppDataSource.getRepository(TunnelDevice);
        clientDevice = await deviceRepo.findOne({
          where: { id: clientDeviceId, kind: 'client', approved: true },
          relations: {
            ownerUser: { org: true, organisationMemberships: true },
            organisation: true,
          },
        });
        if (!clientDevice) {
          return errorResponse('invalid_client_device', 400);
        }
        if (!(await deviceBelongsToUserOrOrg(clientDevice, ctx.user))) {
          return errorResponse('forbidden', 403);
        }
      }

      if (!clientDevice) {
        return errorResponse('client_device_required', 401);
      }

      if (clientDevice.kind !== 'client') {
        return errorResponse('client_only_device', 403);
      }

      const localHost = getStringField(body, ['local_host', 'localHost'], '127.0.0.1');
      const localPort = getNumberField(body, ['local_port', 'localPort']);
      const protocol = getStringField(body, ['protocol', 'protocol'], 'tcp').toLowerCase();

      const VALID_PROTOCOLS = ['tcp', 'udp', 'http', 'https'];
      if (!VALID_PROTOCOLS.includes(protocol)) {
        return errorResponse('invalid_protocol', 400);
      }

      if (localPort < 1 || localPort > 65535) {
        return errorResponse('invalid_local_port', 400);
      }

      const reused = await tryReuseRecentPort(clientDevice, localHost, localPort);
      let port: number;
      const reuseAllocation: TunnelAllocation | null = reused;

      if (reused) {
        port = reused.port;
      } else {
        try {
          port = await allocatePort();
        } catch {
          return errorResponse('no_ports_available', 503);
        }
      }

      const host = process.env.TUNNEL_PUBLIC_HOST ?? 'n2.ecli.app';

      const repo = AppDataSource.getRepository(TunnelAllocation);
      let tunnelLimit = 10;
      let requestingUser: User | null = null;
      if (ctx.user) {
        requestingUser = ctx.user;
      } else if (clientDevice?.ownerUser) {
        requestingUser = clientDevice.ownerUser;
      }
      if (requestingUser && !isAdminUser(requestingUser)) {
        tunnelLimit =
          requestingUser.limits && typeof requestingUser.limits.tunnelPortCount === 'number'
            ? requestingUser.limits.tunnelPortCount
            : 10;

        const activeCount = await repo
          .createQueryBuilder('allocation')
          .leftJoin('allocation.clientDevice', 'clientDevice')
          .leftJoin('clientDevice.ownerUser', 'ownerUser')
          .where('allocation.status != :closed', { closed: 'closed' })
          .andWhere('ownerUser.id = :ownerId', { ownerId: requestingUser.id })
          .getCount();

        if (activeCount + 1 > tunnelLimit) {
          return errorResponse('tunnel_port_limit_exceeded', 403);
        }
      }
      let allocation: TunnelAllocation;

      if (reuseAllocation) {
        allocation = reuseAllocation;
        const serverAgent = await getOnlineServerAgent(clientDevice);
        if (serverAgent) {
          allocation.serverDevice = serverAgent;
          await repo.save(allocation);
          sendAgentMessage(serverAgent.deviceCode, {
            type: 'bind',
            allocationId: allocation.id,
            host: allocation.host,
            port: allocation.port,
            protocol: allocation.protocol,
          });
        }
      } else {
        allocation = repo.create({
          port,
          host,
          protocol,
          clientDevice,
          localHost,
          localPort,
          status: 'pending',
        });
        await repo.save(allocation);

        const serverAgent = await getOnlineServerAgent(clientDevice);
        if (serverAgent) {
          allocation.serverDevice = serverAgent;
          allocation.status = 'active';
          await repo.save(allocation);

          sendAgentMessage(serverAgent.deviceCode, {
            type: 'bind',
            allocationId: allocation.id,
            host: allocation.host,
            port: allocation.port,
            protocol: allocation.protocol,
          });
        }
      }

      return createJsonResponse({
        allocation: {
          id: allocation.id,
          host: allocation.host,
          port: allocation.port,
          protocol: allocation.protocol,
          status: allocation.status,
          localHost: allocation.localHost,
          localPort: allocation.localPort,
        },
      });
    },
    {
      response: {
        200: t.Object({
          allocation: t.Object({
            id: t.Number(),
            host: t.String(),
            port: t.Number(),
            protocol: t.String(),
            status: t.String(),
            localHost: t.String(),
            localPort: t.Number(),
          }),
        }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        503: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Create tunnel allocation',
        tags: ['Tunnels'],
        description: 'Reserve a public tunnel endpoint and bind it to a client device.',
      },
    }
  );

  app.get(
    `${prefix}/tunnel/allocations`,
    async (ctx: TunnelRequestContext) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const tunnelRollout = await requireTunnelRollout(ctx);
      if (tunnelRollout !== true) return tunnelRollout;

      const repo = AppDataSource.getRepository(TunnelAllocation);
      let allocations: TunnelAllocation[] = [];
      if (device) {
        allocations = await repo.find({
          where: { clientDevice: { id: device.id } },
          relations: { clientDevice: true, serverDevice: true },
          order: { createdAt: 'DESC' },
        });
      } else if (ctx.user) {
        const orgIds = await getAccessibleOrganisationIds(ctx.user);
        const qb = repo.createQueryBuilder('allocation');
        qb.leftJoinAndSelect('allocation.clientDevice', 'clientDevice');
        qb.leftJoinAndSelect('allocation.serverDevice', 'serverDevice');
        qb.leftJoin('clientDevice.ownerUser', 'ownerUser');
        qb.leftJoin('clientDevice.organisation', 'organisation');
        qb.where('ownerUser.id = :userId', { userId: ctx.user.id });
        if (orgIds.length > 0) {
          qb.orWhere('organisation.id IN (:...orgIds)', { orgIds });
        }
        qb.orderBy('allocation.createdAt', 'DESC');
        allocations = await qb.getMany();
      } else {
        const qb = repo.createQueryBuilder('allocation');
        qb.leftJoinAndSelect('allocation.clientDevice', 'clientDevice');
        qb.leftJoinAndSelect('allocation.serverDevice', 'serverDevice');
        qb.orderBy('allocation.createdAt', 'DESC');
        allocations = await qb.getMany();
      }

      return createJsonResponse({
        allocations: allocations.map(a => ({
          id: a.id,
          host: a.host,
          port: a.port,
          protocol: a.protocol,
          status: a.status,
          localHost: a.localHost,
          localPort: a.localPort,
          clientDevice: a.clientDevice?.deviceCode ?? null,
          serverDevice: a.serverDevice?.deviceCode ?? null,
          serverOnline: a.serverDevice ? agentConnections.has(a.serverDevice.deviceCode) : false,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      });
    },
    {
      response: {
        200: t.Object({
          allocations: t.Array(
            t.Object({
              id: t.Number(),
              host: t.String(),
              port: t.Number(),
              protocol: t.String(),
              status: t.String(),
              localHost: t.String(),
              localPort: t.Number(),
              clientDevice: t.Nullable(t.String()),
              serverDevice: t.Nullable(t.String()),
              serverOnline: t.Boolean(),
              createdAt: t.String(),
              updatedAt: t.String(),
            })
          ),
        }),
        401: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'List tunnel allocations',
        tags: ['Tunnels'],
        description:
          'Return active tunnel allocations for the requesting device or all allocations for authenticated users.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/allocations/:id/close`,
    async (ctx: TunnelRequestContext) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const tunnelRollout = await requireTunnelRollout(ctx);
      if (tunnelRollout !== true) return tunnelRollout;

      const allocationId = Number(ctx.params.id);
      if (!Number.isFinite(allocationId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: { clientDevice: true, serverDevice: true },
      });

      if (!allocation) {
        return errorResponse('not_found', 404);
      }

      if (device) {
        if (allocation.clientDevice?.id !== device.id) {
          return errorResponse('forbidden', 403);
        }
      } else if (
        !ctx.user ||
        !(await deviceBelongsToUserOrOrg(allocation.clientDevice, ctx.user))
      ) {
        return errorResponse('forbidden', 403);
      }

      if (allocation.status === 'closed') {
        return errorResponse('already_closed', 409);
      }

      allocation.status = 'closed';
      allocation.closedAt = new Date();
      await repo.save(allocation);

      if (allocation.serverDevice) {
        sendAgentMessage(allocation.serverDevice.deviceCode, {
          type: 'unbind',
          allocationId: allocation.id,
        });
      }

      return createJsonResponse({ ok: true });
    },
    {
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Close a tunnel allocation',
        tags: ['Tunnels'],
        description: 'Release a public tunnel endpoint and notify the server agent to unbind it.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/allocations/:id/edit`,
    async (ctx: TunnelRequestContext) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const tunnelRollout = await requireTunnelRollout(ctx);
      if (tunnelRollout !== true) return tunnelRollout;

      const allocationId = Number(ctx.params.id);
      const body = (ctx.body as Record<string, unknown>) || {};
      const localPort = getNumberField(body, ['local_port', 'localPort']);
      if (localPort < 1 || localPort > 65535) {
        return errorResponse('invalid_local_port', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: { clientDevice: true, serverDevice: true },
      });

      if (!allocation) {
        return errorResponse('not_found', 404);
      }

      if (device) {
        if (allocation.clientDevice?.id !== device.id) {
          return errorResponse('forbidden', 403);
        }
      } else if (
        !ctx.user ||
        !(await deviceBelongsToUserOrOrg(allocation.clientDevice, ctx.user))
      ) {
        return errorResponse('forbidden', 403);
      }

      allocation.localPort = localPort;
      await repo.save(allocation);

      return createJsonResponse({
        allocation: {
          id: allocation.id,
          host: allocation.host,
          port: allocation.port,
          protocol: allocation.protocol,
          status: allocation.status,
          localHost: allocation.localHost,
          localPort: allocation.localPort,
        },
      });
    },
    {
      response: {
        200: t.Object({
          allocation: t.Object({
            id: t.Number(),
            host: t.String(),
            port: t.Number(),
            protocol: t.String(),
            status: t.String(),
            localHost: t.String(),
            localPort: t.Number(),
          }),
        }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Edit tunnel allocation',
        tags: ['Tunnels'],
        description: 'Update local port for a tunnel allocation.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/allocations/:id/delete`,
    async (ctx: TunnelRequestContext) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const tunnelRollout = await requireTunnelRollout(ctx);
      if (tunnelRollout !== true) return tunnelRollout;

      const allocationId = Number(ctx.params.id);
      if (!Number.isFinite(allocationId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: { clientDevice: true, serverDevice: true },
      });

      if (!allocation) {
        return errorResponse('not_found', 404);
      }

      if (device && allocation.clientDevice?.id !== device.id) {
        return errorResponse('forbidden', 403);
      }

      if (allocation.status !== 'closed' && allocation.serverDevice) {
        sendAgentMessage(allocation.serverDevice.deviceCode, {
          type: 'unbind',
          allocationId: allocation.id,
        });
      }

      await repo.remove(allocation);
      return createJsonResponse({ ok: true });
    },
    {
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Delete tunnel allocation',
        tags: ['Tunnels'],
        description: 'Remove a tunnel allocation permanently.',
      },
    }
  );

  function unwrapWsArgs(args: IArguments | unknown[]) {
    const arr = Array.from(args as unknown[]);
    let ctx: TunnelRequestContext | undefined = undefined;
    let ws: WsLike | undefined = undefined;
    let message: unknown = undefined;

    if (arr.length === 1) {
      const maybeWs = arr[0];
      if (isWsLikeObj(maybeWs)) {
        ws = maybeWs;
        ctx = (ws.data as TunnelRequestContext) || {};
      }
    } else if (arr.length === 2) {
      const a0 = arr[0];
      const a1 = arr[1];
      if (isCtxLike(a0)) {
        ctx = a0;
        if (isWsLikeObj(a1)) ws = a1;
      } else if (isWsLikeObj(a0)) {
        ws = a0;
        message = a1;
        ctx = (ws.data as TunnelRequestContext) || {};
      } else {
        ctx = a0 as TunnelRequestContext;
        if (isWsLikeObj(a1)) ws = a1;
      }
    } else if (arr.length >= 3) {
      ctx = arr[0] as TunnelRequestContext;
      ws = isWsLikeObj(arr[1]) ? arr[1] : undefined;
      message = arr[2];
    }

    return { ctx, ws, message };
  }

  app.ws(`${prefix}/tunnel/ws`, {
    ...TUNNEL_WS_SCHEMA,

    async open(...args: unknown[]) {
      const { ctx, ws } = unwrapWsArgs(args);
      if (!ws) return;

      const token = getAuthToken(ctx as unknown as { headers?: Headers | Record<string, string>; query?: Record<string, string> } ) ;

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', error: 'missing_token' }));
        ws.close(1008, 'Missing token');
        return;
      }

      const device = await verifyDeviceToken(app.jwt, token).catch(() => null);

      if (!device) {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid_token' }));
        ws.close(1008, 'Invalid token');
        return;
      }

      const reportedVersion = (ctx.query?.version as string) ?? null;
      if (reportedVersion) {
        device.clientVersion = reportedVersion;
        const repo = AppDataSource.getRepository(TunnelDevice);
        await repo.save(device).catch(() => {});
      }

      const _versionCache = new Map<string, string>();
      const readVersion = (subdir: string, fallback: string): string => {
        const cached = _versionCache.get(subdir);
        if (cached) return cached;
        try {
          const tomlPath = path.resolve(process.cwd(), '..', 'tunnel', subdir, 'Cargo.toml');
          const content = require('fs').readFileSync(tomlPath, 'utf8');
          const match = content.match(/^version\s*=\s*"([^"]+)"/m);
          const version = match ? match[1] : fallback;
          _versionCache.set(subdir, version);
          return version;
        } catch {
          return fallback;
        }
      };

      function parseSemver(v: string | null | undefined): [number, number, number] {
        if (!v) return [0, 0, 0];
        const parts = v.split('.').map(n => parseInt(n, 10));
        return [
          Number.isFinite(parts[0]) ? parts[0] : 0,
          Number.isFinite(parts[1]) ? parts[1] : 0,
          Number.isFinite(parts[2]) ? parts[2] : 0,
        ];
      }

      function isOlder(current: string, latest: string): boolean {
        const [c0, c1, c2] = parseSemver(current);
        const [l0, l1, l2] = parseSemver(latest);
        if (c0 !== l0) return c0 < l0;
        if (c1 !== l1) return c1 < l1;
        return c2 < l2;
      }

      const expectedVersion =
        device.kind === 'server' ? readVersion('server', '0.2.5') : readVersion('client', '0.2.5');
      const updateAvailable = reportedVersion ? isOlder(reportedVersion, expectedVersion) : false;

      ws.data = ws.data || {};
      ws.data._ecliDeviceCode = device.deviceCode;
      ws.data._ecliKind = device.kind;

      registerAgent(device.deviceCode, ws);

      if (device.kind === 'server') {
        await assignPendingAllocations(device).catch(err => {
          console.error('[tunnel] Failed to assign pending allocations:', err);
        });
      }

      if (device.kind === 'client') {
        const allocRepo = AppDataSource.getRepository(TunnelAllocation);
        const clientAllocs = await allocRepo.find({
          where: { clientDevice: { id: device.id }, status: 'active' as any },
          relations: { clientDevice: true, serverDevice: true },
        });
        if (clientAllocs.length > 0) {
          ws.send(JSON.stringify({
            type: 'allocations.restored',
            allocations: clientAllocs.map(a => ({
              id: a.id,
              port: a.port,
              protocol: a.protocol,
              localHost: a.localHost,
              localPort: a.localPort,
              host: a.host,
            })),
          }));
          for (const alloc of clientAllocs) {
            if (alloc.serverDevice) {
              sendAgentMessage(alloc.serverDevice.deviceCode, {
                type: 'client.reconnected',
                allocationId: alloc.id,
                clientDeviceCode: device.deviceCode,
              });
            }
          }
        }
      }

      ws.send(
        JSON.stringify({
          type: 'connected',
          deviceCode: device.deviceCode,
          kind: device.kind,
          updateAvailable,
          latestVersion: expectedVersion,
          currentVersion: reportedVersion,
        })
      );
    },

    message(...args: unknown[]) {
      const { ws, message } = unwrapWsArgs(args);
      if (!ws) return;

      const extractText = (value: unknown): string | null => {
        if (typeof value === 'string') return value;
        if (Buffer.isBuffer(value)) return value.toString('utf8');
        if (value instanceof ArrayBuffer) {
          return Buffer.from(value).toString('utf8');
        }
        if (ArrayBuffer.isView(value)) {
          return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
        }
        if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
          return extractText((value as Record<string, unknown>).data);
        }
        return null;
      };

      if (message && typeof message === 'object' && 'type' in (message as Record<string, unknown>)) {
        const msg = message as Record<string, unknown>;
        const deviceCode = String(ws.data?._ecliDeviceCode ?? '');
        const deviceKind = String(ws.data?._ecliKind ?? '');
        if (!deviceCode || !deviceKind) return;

        switch (msg.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            return;

          case 'connection.open':
            if (deviceKind === 'server') {
              handleServerConnectionOpen(msg, deviceCode).catch(err => {
                console.error('[tunnel] connection.open error:', err);
              });
            }
            return;

          case 'connection.data':
            handleConnectionData(msg, deviceCode, deviceKind);
            return;

          case 'connection.close':
            handleConnectionClose(msg, deviceCode, deviceKind);
            return;

          default:
            return;
        }
      }

      const text = extractText(message);
      try {
        if (text) {
          console.info('[tunnel] ws message (text):', text);
        } else {
          const ctor = (message as Record<string, unknown>)?.constructor?.name ?? 'unknown';
          const keys = message && typeof message === 'object' ? Object.keys(message as Record<string, unknown>) : [];
          console.info('[tunnel] ws message (unparsed):', { type: typeof message, ctor, keys });
        }
      } catch (err) {
        console.warn('[tunnel] ws message log error:', err);
      }

      if (!text) return;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }

      const deviceCode = String(ws.data?._ecliDeviceCode ?? '');
      const deviceKind = String(ws.data?._ecliKind ?? '');
      if (!deviceCode || !deviceKind) return;

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'connection.open':
          if (deviceKind === 'server') {
            console.info(
              `[tunnel] received connection.open from ${deviceCode}: ` +
                `allocationId=${String(msg['allocationId'] ?? '')} ` +
                `connectionId=${String(msg['connectionId'] ?? '')}`
            );
            handleServerConnectionOpen(msg, deviceCode).catch(err => {
              console.error('[tunnel] connection.open error:', err);
            });
          }
          break;

        case 'connection.data':
          handleConnectionData(msg, deviceCode, deviceKind);
          break;

        case 'connection.close':
          handleConnectionClose(msg, deviceCode, deviceKind);
          break;

        default:
          console.warn(`[tunnel] Unknown message type: ${msg.type}`);
      }
    },

    close(...args: unknown[]) {
      const { ws, message } = unwrapWsArgs(args);
      if (!ws) return;

      const deviceCode = String(ws.data?._ecliDeviceCode ?? '');
      const code = typeof message === 'number' ? message : undefined;
      const reason = typeof message === 'string' ? message : '';

      if (deviceCode) {
        unregisterAgent(deviceCode);
        cleanupConnectionsByAgent(deviceCode);

        console.info(`[tunnel] Agent disconnected: ${deviceCode} (code=${code}, reason=${reason})`);
      }
    },

    error(...args: unknown[]) {
      const { ws, message } = unwrapWsArgs(args);
      if (!ws) return;
      const error = message instanceof Error ? message : undefined;

      const deviceCode = String(ws.data?._ecliDeviceCode ?? '');
      console.error(`[tunnel] WebSocket error for ${deviceCode}:`, error || message);

      if (deviceCode) {
        unregisterAgent(deviceCode);
        cleanupConnectionsByAgent(deviceCode);
      }
    },
  });
}
