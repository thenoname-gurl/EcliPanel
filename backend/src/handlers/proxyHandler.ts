import { optionalAuth } from '../middleware/auth';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { TunnelDevice } from '../models/tunnelDevice.entity';
import { TunnelAllocation } from '../models/tunnelAllocation.entity';
import { Not, IsNull } from 'typeorm';

export function proxyRoutes(app: any, prefix: string) {
  app.get(prefix + '/internal-domains', async (ctx: any) => {
    const domains = new Set<string>();

    try {
      const backendUrl = process.env.BACKEND_URL || '';
      if (backendUrl) {
        try { domains.add(new URL(backendUrl).hostname); } catch {}
      }
    } catch {}

    try {
      if (ctx.request?.headers?.get) {
        const host = (ctx.request.headers.get('host') || '').split(':')[0];
        if (host) domains.add(host);
      }
    } catch {}

    try {
      const nodes = await AppDataSource.getRepository(Node).find({
        select: { url: true, fqdn: true, proxmoxHost: true },
      });
      for (const node of nodes) {
        if (node.url) {
          try { domains.add(new URL(node.url).hostname); } catch { domains.add(node.url); }
        }
        if (node.fqdn) domains.add(node.fqdn);
        if (node.proxmoxHost) domains.add(node.proxmoxHost.split(':')[0]);
      }
    } catch {}

    try {
      const devices = await AppDataSource.getRepository(TunnelDevice).find({
        select: { fqdn: true },
        where: { kind: 'server', fqdn: Not(IsNull()) },
      });
      for (const d of devices) {
        if (d.fqdn) domains.add(d.fqdn);
      }
    } catch {}

    try {
      const allocs = await AppDataSource.getRepository(TunnelAllocation)
        .createQueryBuilder('alloc')
        .select('DISTINCT alloc.host', 'host')
        .where('alloc.status = :status', { status: 'active' })
        .getRawMany();
      for (const a of allocs) {
        if (a.host) domains.add(a.host);
      }
    } catch {}

    const sorted = Array.from(domains).sort();
    return { domains: sorted };
  }, {
    detail: {
      tags: ['Proxy'],
      summary: 'List all trusted internal domains used by the panel, nodes, and tunnels',
    },
  });

  app.get(prefix + '/proxy/image', async (ctx: any) => {
    const rawUrl = ctx.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      ctx.set.status = 400;
      return { error: 'Missing url parameter' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      ctx.set.status = 400;
      return { error: 'Invalid URL' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      ctx.set.status = 400;
      return { error: 'Only HTTP/HTTPS URLs allowed' };
    }

    const blocklist = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
    if (blocklist.has(parsed.hostname) || /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\./.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
      ctx.set.status = 403;
      return { error: 'Internal/private host not allowed' };
    }

    const panelHostnames = new Set<string>();
    try {
      const backendUrl = process.env.BACKEND_URL || '';
      if (backendUrl) panelHostnames.add(new URL(backendUrl).hostname);
    } catch {}
    try {
      if (ctx.request?.headers?.get) {
        const host = (ctx.request.headers.get('host') || '').split(':')[0];
        if (host) panelHostnames.add(host);
      }
    } catch {}
    if (panelHostnames.has(parsed.hostname)) {
      ctx.set.status = 400;
      return { error: 'Cannot proxy panel URLs' };
    }

    let remoteRes: Response;
    try {
      remoteRes = await fetch(parsed.href, {
        headers: {
          'User-Agent': 'EcliPanel-ImageProxy/3.0',
          'Accept': 'image/*',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
    } catch {
      ctx.set.status = 502;
      return { error: 'Failed to fetch image' };
    }

    if (!remoteRes.ok) {
      ctx.set.status = 502;
      return { error: `Upstream returned ${remoteRes.status}` };
    }

    const contentType = remoteRes.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      ctx.set.status = 400;
      return { error: 'URL does not point to an image' };
    }

    const contentLength = remoteRes.headers.get('content-length');
    const imgBytes = new Uint8Array(await remoteRes.arrayBuffer());

    if (imgBytes.byteLength > 50 * 1024 * 1024) {
      ctx.set.status = 400;
      return { error: 'Image too large (max 50MB)' };
    }

    const cacheControl = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    };
    if (contentLength) headers['Content-Length'] = contentLength;

    return new Response(imgBytes, { status: 200, headers });
  }, {
    beforeHandle: [optionalAuth],
    detail: {
      tags: ['Proxy'],
      summary: 'Proxy an external image through the panel to protect user IPs',
      description: 'Fetches an image from the given url query parameter and serves it through the panel, stripping client IP from the remote server.',
    },
  });
}