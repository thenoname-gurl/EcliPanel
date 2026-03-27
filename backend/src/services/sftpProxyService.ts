import net from 'net';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';

interface ProxyEntry {
  nodeId: number;
  server: net.Server;
  proxyPort: number;
}

const proxies = new Map<number, ProxyEntry>();

function urlToHost(nodeUrl: string): string {
  try {
    return new URL(nodeUrl).hostname;
  } catch {
    return nodeUrl.replace(/[:\/].*$/, '');
  }
}

function startProxy(node: Node): void {
  if (!node.sftpProxyPort) return;

  const targetHost = urlToHost(node.url);
  const targetPort = node.sftpPort ?? 2022;
  const listenPort = node.sftpProxyPort;

  const existing = proxies.get(node.id);
  if (existing && existing.proxyPort === listenPort) return;

  stopProxy(node.id);

  const server = net.createServer((client) => {
    let cleaned = false;

    const remote = net.createConnection({ host: targetHost, port: targetPort });

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      client.unpipe(remote);
      remote.unpipe(client);
      if (!client.destroyed) client.destroy();
      if (!remote.destroyed) remote.destroy();
    };

    remote.once('connect', () => {
      if (cleaned) return;
      client.pipe(remote);
      remote.pipe(client);
    });

    client.on('error', () => cleanup());
    client.once('close', cleanup);

    remote.on('error', (err) => {
      console.error(`sftp-proxy [node ${node.id}]: remote error: ${err.message}`);
      cleanup();
    });
    remote.once('close', cleanup);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `sftp-proxy [node ${node.id}]: port ${listenPort} already in use — skipping`,
      );
    } else {
      console.error(`sftp-proxy [node ${node.id}]: server error: ${err.message}`);
    }
  });

  server.listen(listenPort, '0.0.0.0', () => {
    console.log(
      `sftp-proxy [node ${node.id} "${node.name}"]: listening on :${listenPort} → ${targetHost}:${targetPort}`,
    );
  });

  proxies.set(node.id, { nodeId: node.id, server, proxyPort: listenPort });
}

function stopProxy(nodeId: number): void {
  const entry = proxies.get(nodeId);
  if (!entry) return;
  try {
    entry.server.close();
  } catch {
    /* skip */
  }
  proxies.delete(nodeId);
}

export async function startAllSftpProxies(): Promise<void> {
  try {
    const nodeRepo = AppDataSource.getRepository(Node);
    const nodes = await nodeRepo.find();
    for (const node of nodes) {
      if (node.sftpProxyPort) {
        startProxy(node);
      }
    }
  } catch (err: any) {
    console.error('sftp-proxy: failed to start proxies on boot:', err?.message);
  }
}

export async function refreshAllSftpProxies(): Promise<void> {
  try {
    const nodeRepo = AppDataSource.getRepository(Node);
    const nodes = await nodeRepo.find();
    const nodeIds = new Set(nodes.map((n) => n.id));

    const stale = [...proxies.keys()].filter((id) => !nodeIds.has(id));
    for (const id of stale) {
      stopProxy(id);
    }

    for (const node of nodes) {
      if (node.sftpProxyPort) {
        startProxy(node);
      } else {
        stopProxy(node.id);
      }
    }
  } catch (err: any) {
    console.error('sftp-proxy: refresh error:', err?.message);
  }
}