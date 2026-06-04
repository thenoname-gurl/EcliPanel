import { AppDataSource } from '../config/typeorm';
import { SharedFileLink } from '../models/sharedFileLink.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { ServerMapping } from '../models/serverMapping.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { nodeService } from '../services/nodeService';
import { createActivityLog } from './logHandler';
import { resolvePanelBaseUrl } from '../utils/url';
import { httpRequest } from '../utils/http';
import { signWingsJwt } from './remoteHandler';
import type { RequestContext } from '../types/request';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : require('crypto');

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  tiff: 'image/tiff', tif: 'image/tiff',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', m4v: 'video/mp4', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  pdf: 'application/pdf',
};

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

const MEDIA_CACHE_DIR = path.join(os.tmpdir(), 'eclipanel-share-cache');
const mediaCacheLocks = new Map<string, Promise<void>>();

async function ensureCacheDir() {
  await fs.promises.mkdir(MEDIA_CACHE_DIR, { recursive: true });
}

function cachedFilePath(token: string): string {
  return path.join(MEDIA_CACHE_DIR, token);
}

function generateToken(): string {
  return cryptoObj.randomUUID().replace(/-/g, '') + cryptoObj.randomUUID().replace(/-/g, '');
}

function computeExpiry(expiresIn: string): { expiresIn: string; expiresAt: Date | null } {
  const now = new Date();
  switch (expiresIn) {
    case '1h':
      return { expiresIn, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) };
    case '1d':
      return { expiresIn, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
    case '1w':
      return { expiresIn, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
    case '1m':
      return { expiresIn, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
    case '1y':
      return { expiresIn, expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) };
    case 'permanent':
      return { expiresIn, expiresAt: null };
    default:
      return { expiresIn: '1d', expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
  }
}

function isValidExpiry(value: string): boolean {
  return ['1h', '1d', '1w', '1m', '1y', 'permanent'].includes(value);
}

async function canShareFiles(serverUuid: string, user: User): Promise<boolean> {
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
  if (cfg && cfg.userId === user.id) return true;

  const subuserRepo = AppDataSource.getRepository(ServerSubuser);
  const sub = await subuserRepo.findOne({
    where: { serverUuid, userId: user.id, accepted: true },
  });
  if (
    sub &&
    Array.isArray(sub.permissions) &&
    (sub.permissions.includes('*') || sub.permissions.includes('file-sharing'))
  ) {
    return true;
  }

  return false;
}

async function resolveFileContent(serverUuid: string, filePath: string): Promise<{
  data: string;
  contentType: string;
} | null> {
  try {
    const svc = await nodeService.getServiceForServer(serverUuid);
    const res = await svc.readFile(serverUuid, filePath);
    const data = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || '');
    const contentType = String(res.headers?.['content-type'] ?? 'text/plain');
    return { data, contentType };
  } catch {
    return null;
  }
}

const PREVIEWABLE_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'xml', 'ini', 'conf', 'config', 'properties',
  'toml', 'sh', 'bash', 'bat', 'cmd', 'js', 'mjs', 'cjs', 'ts', 'mts', 'cts',
  'jsx', 'tsx', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'py', 'pyw', 'rb',
  'php', 'java', 'kt', 'kts', 'swift', 'go', 'rs', 'c', 'cpp', 'cc', 'cxx', 'h',
  'hpp', 'cs', 'fs', 'vb', 'lua', 'sql', 'graphql', 'gql', 'vue', 'svelte', 'astro',
  'mdx', 'env', 'gitignore', 'dockerignore', 'dockerfile', 'makefile', 'cmake',
  'gradle', 'pom', 'lock', 'log', 'cfg',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp']);

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export async function sharedFileRoutes(app: any, prefix = '') {
  const shareRepo = () => AppDataSource.getRepository(SharedFileLink);

  async function cacheMediaFile(entry: SharedFileLink): Promise<void> {
    const tmpPath = cachedFilePath(entry.token) + '.tmp';
    const finalPath = cachedFilePath(entry.token);

    if (await fs.promises.stat(finalPath).then(() => true).catch(() => false)) return;

    const allowInvalidCerts = process.env.WINGS_ALLOW_INVALID_CERT === 'true';
    const fetchInit: RequestInit & { tls?: { rejectUnauthorized: boolean } } = {
      headers: {} as Record<string, string>,
    };
    if (allowInvalidCerts) {
      fetchInit.tls = { rejectUnauthorized: false };
    }

    try {
      const mappingRepo = AppDataSource.getRepository(ServerMapping);
      const mapping = await mappingRepo.findOne({ where: { uuid: entry.serverUuid }, relations: { node: true } });
      if (!mapping?.node) return;

      const node = mapping.node;
      const base = String((node as any).backendWingsUrl || node.url || '');
      const clean = base.replace(/\/+$/, '');
      const apiBase = clean.endsWith('/api') ? clean : clean + '/api';
      const wingsUrl = `${apiBase}/servers/${entry.serverUuid}/files/contents?file=${encodeURIComponent(entry.filePath)}`;
      (fetchInit.headers as Record<string, string>)['Authorization'] = `Bearer ${node.token}`;

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 120_000);
      fetchInit.signal = abortController.signal;

      const wingsRes = await fetch(wingsUrl, fetchInit);
      clearTimeout(timeout);

      if (!wingsRes.ok || !wingsRes.body) return;

      await ensureCacheDir();
      const writeStream = fs.createWriteStream(tmpPath, { highWaterMark: 1024 * 1024 });
      const reader = wingsRes.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await new Promise<void>((resolve, reject) => {
          writeStream.write(Buffer.from(value), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      await fs.promises.rename(tmpPath, finalPath);
    } catch {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  app.post(
    prefix + '/servers/v1/:id/files/shares',
    async (ctx: RequestContext) => {
      const { id } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;

      if (!(await canShareFiles(id, user))) {
        ctx.set!.status = 403;
        return { error: ctx.t ? ctx.t('common.insufficientPermissions') : 'Insufficient permissions' };
      }

      const { filePath, expiresIn } = (ctx.body as Record<string, unknown>) || {};
      if (!filePath || typeof filePath !== 'string') {
        ctx.set!.status = 400;
        return { error: 'filePath is required' };
      }

      const expiryValue = typeof expiresIn === 'string' && isValidExpiry(expiresIn) ? expiresIn : '1d';
      const { expiresIn: normExpiresIn, expiresAt } = computeExpiry(expiryValue);

      const token = generateToken();
      const entry = shareRepo().create({
        serverUuid: id,
        filePath: filePath as string,
        createdBy: user.id,
        expiresIn: normExpiresIn,
        expiresAt,
        token,
        active: true,
        downloads: 0,
      });
      await shareRepo().save(entry);

      await createActivityLog({
        userId: user.id,
        action: 'server:file:share',
        targetId: id,
        targetType: 'server',
        metadata: { filePath, shareToken: token, expiresIn: normExpiresIn },
        ipAddress: ctx.ip || 'unknown',
      });

      const baseUrl = resolvePanelBaseUrl(ctx);

      cacheMediaFile(entry).catch(() => {});

      return {
        id: entry.id,
        token: entry.token,
        filePath: entry.filePath,
        expiresIn: entry.expiresIn,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
        url: `${baseUrl}/share/${entry.token}`,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Create a shared file link', tags: ['Servers', 'Files'] },
    }
  );

  app.get(
    prefix + '/servers/v1/:id/files/shares',
    async (ctx: RequestContext) => {
      const { id } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;

      if (!(await canShareFiles(id, user))) {
        ctx.set!.status = 403;
        return { error: ctx.t ? ctx.t('common.insufficientPermissions') : 'Insufficient permissions' };
      }

      const shares = await shareRepo().find({
        where: { serverUuid: id },
        order: { createdAt: 'DESC' },
      });

      const baseUrl = resolvePanelBaseUrl(ctx);

      return shares.map(s => ({
        id: s.id,
        token: s.token,
        filePath: s.filePath,
        isFolder: s.isFolder,
        expiresIn: s.expiresIn,
        expiresAt: s.expiresAt,
        downloads: s.downloads,
        active: s.active,
        createdAt: s.createdAt,
        url: `${baseUrl}/share/${s.token}`,
      }));
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List shared file links for a server', tags: ['Servers', 'Files'] },
    }
  );

  app.delete(
    prefix + '/servers/v1/:id/files/shares/:shareId',
    async (ctx: RequestContext) => {
      const { id, shareId } = (ctx.params || {}) as Record<string, string>;
      const user = ctx.user as User;

      if (!(await canShareFiles(id, user))) {
        ctx.set!.status = 403;
        return { error: ctx.t ? ctx.t('common.insufficientPermissions') : 'Insufficient permissions' };
      }

      const entry = await shareRepo().findOneBy({ id: shareId, serverUuid: id });
      if (!entry) {
        ctx.set!.status = 404;
        return { error: 'Share link not found' };
      }

      await shareRepo().delete({ id: shareId });

      await createActivityLog({
        userId: user.id,
        action: 'server:file:share:delete',
        targetId: id,
        targetType: 'server',
        metadata: { filePath: entry.filePath, shareToken: entry.token },
        ipAddress: ctx.ip || 'unknown',
      });

      return { success: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Delete a shared file link', tags: ['Servers', 'Files'] },
    }
  );
}

export async function publicSharedFileRoutes(app: any, prefix = '') {
  const shareRepo = () => AppDataSource.getRepository(SharedFileLink);

  function validateEntry(entry: SharedFileLink | null, ctx: any): boolean {
    if (!entry) {
      ctx.set.status = 404;
      return false;
    }
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      entry.active = false;
      shareRepo().save(entry).catch(() => {});
      ctx.set.status = 410;
      return false;
    }
    return true;
  }

  async function checkFileOnWings(serverUuid: string, filePath: string): Promise<boolean> {
    try {
      const svc = await nodeService.getServiceForServer(serverUuid);
      const dir = filePath.split('/').slice(0, -1).join('/') || '/';
      const listings = await svc.listServerFiles(serverUuid, dir);
      const data: any = listings?.data ?? {};
      const entries: any[] = data.entries ?? data.data ?? Array.isArray(data) ? data : [];
      const targetName = filePath.split('/').pop() || '';
      return entries.some((e: any) => {
        const name = e.name || e.attributes?.name || '';
        return name === targetName;
      });
    } catch {
      return true;
    }
  }

  async function markStale(entry: SharedFileLink): Promise<void> {
    entry.active = false;
    await shareRepo().save(entry);
  }

  async function resolveWingsNode(serverUuid: string): Promise<{ wingsUrl: string; token: string } | null> {
    try {
      const mappingRepo = AppDataSource.getRepository(ServerMapping);
      const mapping = await mappingRepo.findOne({ where: { uuid: serverUuid }, relations: { node: true } });
      if (!mapping?.node) return null;
      const node = mapping.node;
      const base = (node as any).backendWingsUrl || node.url;
      const cleanBase = String(base).replace(/\/+$/, '');
      const fqdn = (node as any).fqdn;
      const downloadUrl = fqdn
        ? (() => { try { const u = new URL(cleanBase); u.hostname = fqdn; return u.toString().replace(/\/$/, ''); } catch { return cleanBase; } })()
        : cleanBase;
      return { wingsUrl: downloadUrl, token: node.token };
    } catch {
      return null;
    }
  }

  function generateWingsDownloadToken(serverUuid: string, filePath: string, nodeToken: string): string {
    const now = Math.floor(Date.now() / 1000);
    const normalizeUuid = (value: unknown) => {
      if (!value) return crypto.randomUUID().replace(/-/g, '');
      const s = String(value).toLowerCase().replace(/-/g, '');
      if (/^[0-9a-f]{32}$/.test(s)) return s;
      return crypto.randomUUID().replace(/-/g, '');
    };
    return signWingsJwt(
      {
        iss: process.env.APP_URL || 'eclipanel',
        sub: normalizeUuid(crypto.randomUUID()),
        aud: [''],
        iat: now,
        nbf: now,
        exp: now + 3600,
        jti: normalizeUuid(crypto.randomUUID()),
        scope: 'file-download',
        server_uuid: normalizeUuid(serverUuid),
        file_path: filePath,
        unique_id: normalizeUuid(crypto.randomUUID()),
      },
      nodeToken
    );
  }

  app.get(
    prefix + '/public/share/:token',
    async (ctx: any) => {
      try {
        const { token } = (ctx.params || {}) as Record<string, string>;
        const entry = await shareRepo().findOneBy({ token, active: true });
        if (!validateEntry(entry, ctx)) return { error: 'Share link not found or has been deactivated' };

        const ext = getExtension(entry.filePath);
        const isPreviewableCode = PREVIEWABLE_EXTENSIONS.has(ext);
        const isImage = IMAGE_EXTENSIONS.has(ext);
        const isVideo = VIDEO_EXTENSIONS.has(ext);

        return {
          id: entry.id,
          fileName: entry.filePath.split('/').pop() || 'file',
          filePath: entry.filePath,
          isPreviewableCode,
          isImage,
          isVideo,
          expiresAt: entry.expiresAt,
          downloads: entry.downloads,
        };
      } catch {
        ctx.set.status = 500;
        return { error: 'Failed to load share info' };
      }
    },
    {
      detail: { summary: 'Get shared file metadata', tags: ['Public', 'Shares'] },
    }
  );

  app.get(
    prefix + '/public/share/:token/content',
    async (ctx: any) => {
      try {
        const { token } = (ctx.params || {}) as Record<string, string>;
        const entry = await shareRepo().findOneBy({ token, active: true });
        if (!validateEntry(entry, ctx)) return { error: 'Share link not found' };

        const result = await resolveFileContent(entry.serverUuid, entry.filePath);
        if (!result) {
          const exists = await checkFileOnWings(entry.serverUuid, entry.filePath);
          if (!exists) {
            await markStale(entry);
            ctx.set.status = 410;
            return { error: 'This file no longer exists on the server' };
          }
          ctx.set.status = 502;
          return { error: 'Failed to read file content. Server may be offline.' };
        }

        entry.downloads += 1;
        await shareRepo().save(entry);

        return new Response(result.data, {
          status: 200,
          headers: {
            'Content-Type': result.contentType,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch {
        ctx.set.status = 500;
        return { error: 'Failed to read file content' };
      }
    },
    {
      detail: { summary: 'Get shared file content (for preview)', tags: ['Public', 'Shares'] },
    }
  );

  app.get(
    prefix + '/public/share/:token/download',
    async (ctx: any) => {
      try {
        const { token } = (ctx.params || {}) as Record<string, string>;
        const entry = await shareRepo().findOneBy({ token, active: true });
        if (!validateEntry(entry, ctx)) return { error: 'Share link not found' };

        const exists = await checkFileOnWings(entry.serverUuid, entry.filePath);
        if (!exists) {
          await markStale(entry);
          ctx.set.status = 410;
          return { error: 'This file no longer exists on the server' };
        }

        const nodeInfo = await resolveWingsNode(entry.serverUuid);
        if (!nodeInfo) {
          ctx.set.status = 502;
          return { error: 'Server node unavailable' };
        }

        const jwt = generateWingsDownloadToken(entry.serverUuid, entry.filePath, nodeInfo.token);
        const redirectUrl = `${nodeInfo.wingsUrl}/download/file?token=${encodeURIComponent(jwt)}`;

        entry.downloads += 1;
        await shareRepo().save(entry);

        ctx.set.status = 302;
        ctx.set.headers = { Location: redirectUrl };
        return;
      } catch {
        ctx.set.status = 500;
        return { error: 'Download failed' };
      }
    },
    {
      detail: { summary: 'Download a shared file', tags: ['Public', 'Shares'] },
    }
  );

  app.get(
    prefix + '/public/share/:token/media',
    async (ctx: any) => {
      try {
        const { token } = (ctx.params || {}) as Record<string, string>;
        const entry = await shareRepo().findOneBy({ token, active: true });
        if (!validateEntry(entry, ctx)) return { error: 'Share link not found' };

        const contentType = getMimeType(entry.filePath);
        const filename = entry.filePath.split('/').pop() || 'file';
        const cachePath = cachedFilePath(token);

        const cachedStat = await fs.promises.stat(cachePath).catch(() => null);
        if (cachedStat) {
          entry.downloads += 1;
          await shareRepo().save(entry);

          const file = Bun.file(cachePath);
          return new Response(file.stream(), {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
              'Content-Length': String(cachedStat.size),
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }

        const existingLock = mediaCacheLocks.get(token);
        if (existingLock) {
          await existingLock;
          const stat = await fs.promises.stat(cachePath).catch(() => null);
          if (stat) {
            entry.downloads += 1;
            await shareRepo().save(entry);
            const file = Bun.file(cachePath);
            return new Response(file.stream(), {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
                'Content-Length': String(stat.size),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400',
              },
            });
          }
        }

        const mappingRepo = AppDataSource.getRepository(ServerMapping);
        const mapping = await mappingRepo.findOne({ where: { uuid: entry.serverUuid }, relations: { node: true } });
        if (!mapping?.node) {
          ctx.set.status = 502;
          return { error: 'Server node not found' };
        }

        const node = mapping.node;
        const base = String((node as any).backendWingsUrl || node.url || '');
        const clean = base.replace(/\/+$/, '');
        const apiBase = clean.endsWith('/api') ? clean : clean + '/api';
        const wingsUrl = `${apiBase}/servers/${entry.serverUuid}/files/contents?file=${encodeURIComponent(entry.filePath)}`;

        const abortController = new AbortController();
        const connectTimeout = setTimeout(() => abortController.abort(), 30_000);

        const allowInvalidCerts = process.env.WINGS_ALLOW_INVALID_CERT === 'true';
        const fetchInit: RequestInit & { tls?: { rejectUnauthorized: boolean } } = {
          headers: { Authorization: `Bearer ${node.token}` },
          signal: abortController.signal,
        };
        if (allowInvalidCerts) {
          fetchInit.tls = { rejectUnauthorized: false };
        }

        const wingsRes = await fetch(wingsUrl, fetchInit);
        clearTimeout(connectTimeout);

        if (!wingsRes.ok) {
          ctx.set.status = wingsRes.status === 404 ? 410 : 502;
          return { error: 'File unavailable on node' };
        }

        if (!wingsRes.body) {
          ctx.set.status = 502;
          return { error: 'Empty response from node' };
        }

        entry.downloads += 1;
        await shareRepo().save(entry);

        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        };

        const contentLength = wingsRes.headers.get('content-length');
        if (contentLength) {
          headers['Content-Length'] = contentLength;
        }

        const [clientStream, cacheStream] = wingsRes.body.tee();
        const tmpPath = cachePath + '.tmp';

        const writeCache = (async () => {
          try {
            await ensureCacheDir();
            const writeStream = fs.createWriteStream(tmpPath, { highWaterMark: 1024 * 1024 });
            const reader = cacheStream.getReader();
            const pump = () =>
              reader.read().then(function process({ done, value }) {
                if (done) return;
                return new Promise<void>((resolve, reject) => {
                  writeStream.write(Buffer.from(value), (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                }).then(() => pump());
              });
            await pump();
            writeStream.end();
            await new Promise<void>((resolve, reject) => {
              writeStream.on('finish', resolve);
              writeStream.on('error', reject);
            });
            await fs.promises.rename(tmpPath, cachePath);
          } catch {
            await fs.promises.unlink(tmpPath).catch(() => {});
          }
        })();

        mediaCacheLocks.set(token, writeCache);
        writeCache.finally(() => mediaCacheLocks.delete(token));

        return new Response(clientStream, {
          status: 200,
          headers,
        });
      } catch (err: any) {
        console.error('[share:media] Error:', err?.message || err);
        ctx.set.status = 500;
        return { error: 'Media load failed' };
      }
    },
    {
      detail: { summary: 'Get shared file media inline (for embeds/preview)', tags: ['Public', 'Shares'] },
    }
  );
}