import fs from 'fs';
import path from 'path';
import { t } from 'elysia';
import { v4 as uuidv4 } from 'uuid';
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

const TUNNEL_WS_SCHEMA = {
  detail: {
    summary: 'Tunnel agent websocket',
    tags: ['Tunnels'],
    description:
      'Establish a websocket control channel for tunnel client and server agents.',
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
  const membershipRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const memberships = await membershipRepo.find({ where: { userId: user.id } });
  memberships.forEach((membership: any) => {
    if (['admin', 'owner'].includes(membership.orgRole)) {
      orgIds.add(membership.organisationId);
    }
  });
  return Array.from(orgIds);
}

async function deviceBelongsToUserOrOrg(device: TunnelDevice, user: User): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (device.ownerUser?.id === user.id) return true;
  if (device.organisation?.id && await canManageOrganisation(user, device.organisation.id)) {
    return true;
  }
  return false;
}

async function canManageOrganisation(user: User, organisationId: number): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (user.org?.id === organisationId && ['admin', 'owner'].includes(user.orgRole)) return true;
  const membershipRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const membership = await membershipRepo.findOne({ where: { userId: user.id, organisationId } });
  return !!membership && ['admin', 'owner'].includes(membership.orgRole);
}

function getRequestBaseUrl(ctx: any): string {
  const headers = ctx?.headers || {};
  const host = (headers['x-forwarded-host'] || headers['host'] || headers['Host']) as string | undefined;
  const proto = (headers['x-forwarded-proto'] || headers['x-forwarded-protocol'] || headers['x-forwarded-scheme']) as string | undefined;
  if (host && proto) {
    const scheme = proto.toString().split(',')[0].trim();
    return `${scheme}://${host}`;
  }

  let origin = '';
  try {
    origin = new URL(String(ctx?.request?.url || '')).origin;
  } catch {}

  return origin;
}

function getTunnelFrontendUrl(ctx: any): string {
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

  const backendUrl = normalize(process.env.BACKEND_URL);
  if (backendUrl) return backendUrl;

  const requestUrl = normalize(getRequestBaseUrl(ctx));
  if (requestUrl) return requestUrl;

  return 'https://ecli.app';
}

async function requireAdmin(ctx: any): Promise<Response | null> {
  const authResult = await authenticate(ctx);
  if (authResult && (authResult as any).error) {
    const status = ctx.set?.status || 401;
    return errorResponse((authResult as any).error, status);
  }

  if (!isAdminUser(ctx.user)) {
    return errorResponse('forbidden', 403);
  }
  return null;
}

async function requireAuth(ctx: any): Promise<Response | null> {
  const authResult = await authenticate(ctx);
  if (authResult && (authResult as any).error) {
    const status = ctx.set?.status || 401;
    return errorResponse((authResult as any).error, status);
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
      .filter((device) => device.expiresAt.getTime() <= now)
      .map(async (device) => repo.remove(device).catch(() => {}))
  );
}

async function requireAuthOrDevice(
  ctx: any,
  app: any
): Promise<{ device: TunnelDevice | null; error: Response | null }> {
  const token = getAuthToken(ctx);
  let device: TunnelDevice | null = null;

  if (token) {
    device = await verifyDeviceToken(app.jwt, token);
  }

  if (!device) {
    const authResult = await authenticate(ctx);
    if (authResult && (authResult as any).error) {
      const status = ctx.set?.status || 401;
      return { device: null, error: errorResponse((authResult as any).error, status) };
    }
  }

  return { device, error: null };
}

export function tunnelRoutes(app: any, prefix: string): void {
    app.get(
      `${prefix}/tunnel/server/download`,
      async (ctx: any) => {
        const binaryPath = path.resolve(
          process.cwd(),
          '..',
          'tunnel',
          'server',
          'target',
          'release',
          'ecli-tunnel-server'
        );

        if (!fs.existsSync(binaryPath)) {
          ctx.set.status = 404;
          return errorResponse('Tunnel server binary not available', 404);
        }

        const file = await fs.promises.readFile(binaryPath);
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
    async (ctx: any) => {
      const binaryPath = path.resolve(
        process.cwd(),
        '..',
        'tunnel',
        'client',
        'target',
        'release',
        'ecli-tunnel-client'
      );

      if (!fs.existsSync(binaryPath)) {
        ctx.set.status = 404;
        return errorResponse('Tunnel client binary not available', 404);
      }

      const file = await fs.promises.readFile(binaryPath);
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

  app.post(
    `${prefix}/tunnel/device/start`,
    async (ctx: any) => {
      await authenticate(ctx).catch(() => {});
      const body = (ctx.body as Record<string, unknown>) || {};
      const name = getStringField(body, ['name', 'name'], 'agent');
      const requestedKind = getStringField(body, ['kind', 'kind']);
      const kind: 'client' | 'server' = requestedKind === 'server' ? 'server' : 'client';

      if (kind === 'server' && !isAdminUser(ctx.user)) {
        return errorResponse('forbidden', 403);
      }

      const deviceCode = uuidv4();
      const userCode = generateUserCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const repo = AppDataSource.getRepository(TunnelDevice);
      const deviceData: any = {
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
      if (organisationId && ctx.user && await canManageOrganisation(ctx.user, organisationId)) {
        const orgRepo = AppDataSource.getRepository(Organisation);
        const organisation = await orgRepo.findOne({ where: { id: organisationId } });
        if (organisation) {
          deviceData.organisation = organisation;
        }
      }

      const device = repo.create(deviceData);
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
        description:
          'Begin device authorization for a tunnel client or server agent.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/device/poll`,
    async (ctx: any) => {
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

      const tokenTtl = Math.max(
        0,
        Math.floor((device.expiresAt.getTime() - Date.now()) / 1000)
      );

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
    async (ctx: any) => {
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
      if (requestedServerType && TUNNEL_SERVER_TYPES.includes(requestedServerType as any)) {
        serverType = requestedServerType as TunnelServerType;
      }

      if (!userCode && !deviceCode) {
        return errorResponse('missing_identifier', 400);
      }

      const repo = AppDataSource.getRepository(TunnelDevice);
      let device: TunnelDevice | null = null;

      if (userCode) {
        device = await repo.findOne({ where: { userCode }, relations: ['ownerUser', 'organisation'] });
      }
      if (!device && deviceCode) {
        device = await repo.findOne({ where: { deviceCode }, relations: ['ownerUser', 'organisation'] });
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
        { expiresIn: '24h' }
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
        description:
          'Authorize a pending tunnel client/server device and issue a JWT token.',
      },
    }
  );

  app.get(
    `${prefix}/tunnel/devices`,
    async (ctx: any) => {
      const authResult = await authenticate(ctx);
      if (authResult && (authResult as any).error) {
        return errorResponse((authResult as any).error, ctx.set?.status || 401);
      }

      await cleanupExpiredEnrollments();
      const repo = AppDataSource.getRepository(TunnelDevice);
      let devices: TunnelDevice[] = [];

      if (isAdminUser(ctx.user)) {
        devices = await repo.find({ relations: ['organisation'], order: { createdAt: 'DESC' } });
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
        devices: devices.map((d) => ({
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
    async (ctx: any) => {
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

      const allocRepo = AppDataSource.getRepository(TunnelAllocation);
      const allocations = await allocRepo.find({
        relations: ['clientDevice', 'serverDevice'],
        where: [
          { clientDevice: { id: deviceId } } as any,
          { serverDevice: { id: deviceId } } as any,
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
    async (ctx: any) => {
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

      device.token = app.jwt.sign(
        {
          agent: device.deviceCode,
          kind: device.kind,
          iat: Math.floor(Date.now() / 1000),
        },
        { expiresIn: '24h' }
      );
      await repo.save(device);

      return createJsonResponse({
        access_token: device.token,
        token_type: 'bearer',
        expires_in: 86400,
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
    `${prefix}/tunnel/allocations`,
    async (ctx: any) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

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
          relations: ['ownerUser', 'ownerUser.org', 'ownerUser.organisationMemberships', 'organisation'],
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

      const localHost = getStringField(
        body,
        ['local_host', 'localHost'],
        '127.0.0.1'
      );
      const localPort = getNumberField(body, ['local_port', 'localPort']);
      const protocol = getStringField(
        body,
        ['protocol', 'protocol'],
        'tcp'
      ).toLowerCase();

      const VALID_PROTOCOLS = ['tcp', 'udp', 'http', 'https'];
      if (!VALID_PROTOCOLS.includes(protocol)) {
        return errorResponse('invalid_protocol', 400);
      }

      if (localPort < 1 || localPort > 65535) {
        return errorResponse('invalid_local_port', 400);
      }

      let port: number;
      try {
        port = await allocatePort();
      } catch {
        return errorResponse('no_ports_available', 503);
      }

      const host =
        process.env.TUNNEL_PUBLIC_HOST ?? 'n2.ecli.app';

      const repo = AppDataSource.getRepository(TunnelAllocation);
      let tunnelLimit = 10;
      let requestingUser: User | null = null;
      if (ctx.user) {
        requestingUser = ctx.user;
      } else if (clientDevice?.ownerUser) {
        requestingUser = clientDevice.ownerUser;
      }
      if (requestingUser && !isAdminUser(requestingUser)) {
        tunnelLimit = (requestingUser.limits && typeof requestingUser.limits.tunnelPortCount === 'number')
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
      const allocation = repo.create({
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
        description:
          'Reserve a public tunnel endpoint and bind it to a client device.',
      },
    }
  );

  app.get(
    `${prefix}/tunnel/allocations`,
    async (ctx: any) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const repo = AppDataSource.getRepository(TunnelAllocation);
      let allocations: TunnelAllocation[] = [];
      if (device) {
        allocations = await repo.find({
          where: { clientDevice: { id: device.id } },
          relations: ['clientDevice', 'serverDevice'],
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
        allocations: allocations.map((a) => ({
          id: a.id,
          host: a.host,
          port: a.port,
          protocol: a.protocol,
          status: a.status,
          localHost: a.localHost,
          localPort: a.localPort,
          clientDevice: a.clientDevice?.deviceCode ?? null,
          serverDevice: a.serverDevice?.deviceCode ?? null,
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
    async (ctx: any) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const allocationId = Number(ctx.params.id);
      if (!Number.isFinite(allocationId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: ['clientDevice', 'serverDevice'],
      });

      if (!allocation) {
        return errorResponse('not_found', 404);
      }

      if (device && allocation.clientDevice?.id !== device.id) {
        return errorResponse('forbidden', 403);
      }

      if (allocation.status === 'closed') {
        return errorResponse('already_closed', 409);
      }

      allocation.status = 'closed';
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
        description:
          'Release a public tunnel endpoint and notify the server agent to unbind it.',
      },
    }
  );

  app.post(
    `${prefix}/tunnel/allocations/:id/edit`,
    async (ctx: any) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const allocationId = Number(ctx.params.id);
      if (!Number.isFinite(allocationId)) {
        return errorResponse('invalid_id', 400);
      }

      const body = (ctx.body as Record<string, unknown>) || {};
      const localPort = getNumberField(body, ['local_port', 'localPort']);
      if (localPort < 1 || localPort > 65535) {
        return errorResponse('invalid_local_port', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: ['clientDevice', 'serverDevice'],
      });

      if (!allocation) {
        return errorResponse('not_found', 404);
      }

      if (device && allocation.clientDevice?.id !== device.id) {
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
    async (ctx: any) => {
      const { device, error } = await requireAuthOrDevice(ctx, app);
      if (error) return error;

      const allocationId = Number(ctx.params.id);
      if (!Number.isFinite(allocationId)) {
        return errorResponse('invalid_id', 400);
      }

      const repo = AppDataSource.getRepository(TunnelAllocation);
      const allocation = await repo.findOne({
        where: { id: allocationId },
        relations: ['clientDevice', 'serverDevice'],
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

  function unwrapWsArgs(args: IArguments | any[]) {
    const arr = Array.from(args as any[]);
    let ctx: any = undefined;
    let ws: any = undefined;
    let message: any = undefined;

    if (arr.length === 1) {
      ws = arr[0];
      ctx = ws?.data || {};
    } else if (arr.length === 2) {
      if (arr[0]?.params || arr[0]?.query || arr[0]?.headers) {
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

  app.ws(`${prefix}/tunnel/ws`, {
    ...TUNNEL_WS_SCHEMA,

    async open(...args: any[]) {
      const { ctx, ws } = unwrapWsArgs(args);
      if (!ws) return;

      const token = getAuthToken(ctx || {});

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

      ws.data = ws.data || {};
      ws.data._ecliDeviceCode = device.deviceCode;
      ws.data._ecliKind = device.kind;

      registerAgent(device.deviceCode, ws);

      if (device.kind === 'server') {
        await assignPendingAllocations(device).catch((err) => {
          console.error('[tunnel] Failed to assign pending allocations:', err);
        });
      }

      ws.send(
        JSON.stringify({
          type: 'connected',
          deviceCode: device.deviceCode,
          kind: device.kind,
        })
      );
    },

    message(...args: any[]) {
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
        if (value && typeof value === 'object' && 'data' in (value as any)) {
          return extractText((value as any).data);
        }
        return null;
      };

      if (message && typeof message === 'object' && 'type' in (message as any)) {
        const msg = message as Record<string, unknown>;
        const deviceCode: string = ws.data?._ecliDeviceCode;
        const deviceKind: string = ws.data?._ecliKind;
        if (!deviceCode || !deviceKind) return;

        switch (msg.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            return;

          case 'connection.open':
            if (deviceKind === 'server') {
              handleServerConnectionOpen(msg, deviceCode).catch((err) => {
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
          const ctor = (message as any)?.constructor?.name ?? 'unknown';
          const keys = message && typeof message === 'object' ? Object.keys(message as any) : [];
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

      const deviceCode: string = ws.data?._ecliDeviceCode;
      const deviceKind: string = ws.data?._ecliKind;
      if (!deviceCode || !deviceKind) return;

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'connection.open':
          if (deviceKind === 'server') {
            console.info(
              `[tunnel] received connection.open from ${deviceCode}: ` +
                `allocationId=${String((msg as any).allocationId ?? '')} ` +
                `connectionId=${String((msg as any).connectionId ?? '')}`
            );
            handleServerConnectionOpen(msg, deviceCode).catch((err) => {
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

    close(...args: any[]) {
      const { ws, message } = unwrapWsArgs(args);
      if (!ws) return;

      const deviceCode: string = ws.data?._ecliDeviceCode;
      const code = typeof message === 'number' ? message : undefined;
      const reason = typeof message === 'string' ? message : '';

      if (deviceCode) {
        unregisterAgent(deviceCode);
        cleanupConnectionsByAgent(deviceCode);

        console.info(
          `[tunnel] Agent disconnected: ${deviceCode} (code=${code}, reason=${reason})`
        );
      }
    },

    error(...args: any[]) {
      const { ws, message } = unwrapWsArgs(args);
      if (!ws) return;
      const error = message instanceof Error ? message : undefined;

      const deviceCode: string = ws.data?._ecliDeviceCode;
      console.error(`[tunnel] WebSocket error for ${deviceCode}:`, error || message);

      if (deviceCode) {
        unregisterAgent(deviceCode);
        cleanupConnectionsByAgent(deviceCode);
      }
    },
  });
}