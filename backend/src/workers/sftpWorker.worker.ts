import { parentPort } from 'worker_threads';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import path from 'path';
import { URL } from 'url';

type Msg = {
  id: string;
  op: string;
  node: any;
  creds: any;
  args?: any[];
};

function normalizeSftpPath(value: string | undefined): string {
  let normalized = typeof value === 'string' ? value.trim() : '/';
  if (!normalized) normalized = '/';
  normalized = normalized.replace(/\\\\/g, '/');
  normalized = path.posix.normalize(normalized);
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  return normalized === '' ? '/' : normalized;
}

function sftpUrlForNode(node: any) {
  const urlObj = (() => {
    try { return new URL(node.url); } catch { return null; }
  })();
  const nodeHost = urlObj?.hostname || node.url;
  const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$|$/, '');
  const backendHost = backendBase ? (() => { try { return new URL(backendBase).hostname; } catch { return backendBase; } })() : null;
  const host = node.sftpProxyPort ? backendHost || '127.0.0.1' : nodeHost;
  const port = node.sftpProxyPort ?? node.sftpPort ?? 2022;
  return { host, port };
}

function createConnectConfig(endpoint: any, creds: any): ConnectConfig {
  const config: ConnectConfig = {
    host: endpoint.host,
    port: endpoint.port,
    username: creds.username,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    tryKeyboard: false,
  } as any;
  if (creds.password) config.password = creds.password;
  if (creds.privateKey) config.privateKey = creds.privateKey;
  if (creds.passphrase) config.passphrase = creds.passphrase;
  return config;
}

function createSftpClient(endpoint: any, creds: any): Promise<{ client: Client; sftp: SFTPWrapper }> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;

    const handleError = (err: Error) => {
      if (settled) return;
      settled = true;
      try { client.end(); } catch {}
      reject(err);
    };

    client.once('ready', () => {
      client.sftp((err, sftp) => {
        if (err) { handleError(err); return; }
        settled = true;
        resolve({ client, sftp });
      });
    });

    client.once('error', handleError);
    client.once('end', () => {
      if (!settled) {
        settled = true;
        reject(new Error('SFTP connection closed before ready'));
      }
    });

    const config = createConnectConfig(endpoint, creds);
    try { client.connect(config); } catch (err) { handleError(err as Error); }
  });
}

function sftpReaddir(sftp: SFTPWrapper, p: string): Promise<any[]> {
  return new Promise((resolve, reject) => { sftp.readdir(p, (err, list) => { if (err) return reject(err); resolve(list || []); }); });
}

function sftpReadFile(sftp: SFTPWrapper, p: string): Promise<Buffer> {
  return new Promise((resolve, reject) => { sftp.readFile(p, (err, data) => { if (err) return reject(err); resolve(Buffer.from(data)); }); });
}

function sftpWriteFile(sftp: SFTPWrapper, p: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => { sftp.writeFile(p, data, (err) => { if (err) return reject(err); resolve(); }); });
}

function sftpUnlink(sftp: SFTPWrapper, p: string): Promise<void> {
  return new Promise((resolve, reject) => { sftp.unlink(p, (err) => { if (err) return reject(err); resolve(); }); });
}

function sftpRmdir(sftp: SFTPWrapper, p: string): Promise<void> {
  return new Promise((resolve, reject) => { sftp.rmdir(p, (err) => { if (err) return reject(err); resolve(); }); });
}

function sftpRename(sftp: SFTPWrapper, oldP: string, newP: string): Promise<void> {
  return new Promise((resolve, reject) => { sftp.rename(oldP, newP, (err) => { if (err) return reject(err); resolve(); }); });
}

function sftpMkdir(sftp: SFTPWrapper, p: string): Promise<void> {
  return new Promise((resolve, reject) => { sftp.mkdir(p, (err) => { if (err) return reject(err); resolve(); }); });
}

function sftpChmod(sftp: SFTPWrapper, p: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => { sftp.chmod(p, mode, (err) => { if (err) return reject(err); resolve(); }); });
}

async function deleteSftpPath(sftp: SFTPWrapper, targetPath: string): Promise<void> {
  const stats = await new Promise<any>((res, rej) => sftp.stat(targetPath, (err, st) => err ? rej(err) : res(st)));
  const isDir = typeof stats.isDirectory === 'function' ? stats.isDirectory() : false;
  if (isDir) {
    const entries = await sftpReaddir(sftp, targetPath);
    for (const entry of entries) {
      const child = path.posix.join(targetPath, entry.filename);
      await deleteSftpPath(sftp, child);
    }
    await sftpRmdir(sftp, targetPath);
  } else {
    await sftpUnlink(sftp, targetPath);
  }
}

parentPort?.on('message', async (msg: Msg) => {
  const { id, op, node, creds, args } = msg;
  const endpoint = sftpUrlForNode(node);
  try {
    const { client, sftp } = await createSftpClient(endpoint, creds);
    try {
      let result: any;
      switch (op) {
        case 'list': {
          const dir = normalizeSftpPath(args?.[0]);
          const entries = await sftpReaddir(sftp, dir);
          result = entries.map((entry: any) => ({ name: entry.filename, attributes: { size: Number(entry.attrs?.size || 0), modified_at: entry.attrs ? new Date((entry.attrs.mtime || 0) * 1000).toISOString() : undefined }, directory: typeof entry.attrs?.isDirectory === 'function' ? entry.attrs.isDirectory() : false }));
          break;
        }
        case 'read': {
          const filePath = normalizeSftpPath(args?.[0]);
          const buf = await sftpReadFile(sftp, filePath);
          result = { data: Array.from(buf) };
          break;
        }
        case 'write': {
          const filePath = normalizeSftpPath(args?.[0]);
          const data = Buffer.from(args?.[1] || []);
          await sftpWriteFile(sftp, filePath, data);
          result = { ok: true };
          break;
        }
        case 'delete': {
          const root = normalizeSftpPath(args?.[0]);
          const files: string[] = args?.[1] || [];
          for (const file of files) {
            const target = normalizeSftpPath(path.posix.join(root, file));
            await deleteSftpPath(sftp, target);
          }
          result = { ok: true };
          break;
        }
        case 'mkdir': {
          const dirPath = normalizeSftpPath(args?.[0]);
          await sftpMkdir(sftp, dirPath);
          result = { ok: true };
          break;
        }
        case 'rename': {
          const oldP = normalizeSftpPath(args?.[0]);
          const newP = normalizeSftpPath(args?.[1]);
          await sftpRename(sftp, oldP, newP);
          result = { ok: true };
          break;
        }
        case 'chmod': {
          const p = normalizeSftpPath(args?.[0]);
          const mode = Number(args?.[1] || 0);
          await sftpChmod(sftp, p, mode);
          result = { ok: true };
          break;
        }
        case 'move': {
          const root = normalizeSftpPath(args?.[0]);
          const mappings: Array<{ from: string; to: string }> = args?.[1] || [];
          for (const mapping of mappings) {
            const fromPath = normalizeSftpPath(path.posix.join(root, mapping.from));
            const toPath = normalizeSftpPath(path.posix.join(root, mapping.to));
            await sftpRename(sftp, fromPath, toPath);
          }
          result = { ok: true };
          break;
        }
        case 'validate': {
          const p = normalizeSftpPath(args?.[0]);
          await sftpReaddir(sftp, p);
          result = { ok: true };
          break;
        }
        default:
          throw new Error(`Unknown op: ${op}`);
      }
      parentPort?.postMessage({ id, result });
    } finally {
      try { client.end(); } catch {}
    }
  } catch (err: any) {
    parentPort?.postMessage({ id, error: String(err?.message || err) });
  }
});