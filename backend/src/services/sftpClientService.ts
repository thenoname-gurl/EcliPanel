import { Client, ConnectConfig, SFTPWrapper } from 'ssh2'
import path from 'path'
import { URL } from 'url'
import { Node } from '../models/node.entity'

async function runSftpOpInWorker(op: string, node: Node, creds: any, args: any[] = [], timeoutMs = 30000) {
  return new Promise<any>((resolve, reject) => {
    const workerUrl = new URL('../workers/sftpWorker.worker.ts', import.meta.url).href;
    const worker = new Worker(workerUrl, { type: 'module' });
    const id = `${Date.now()}-${Math.random()}`;

    const cleanup = () => {
      try { worker.terminate(); } catch {}
      worker.removeEventListener('message', onMessage as any);
      worker.removeEventListener('error', onError as any);
      if (timer) clearTimeout(timer);
    };

    const onMessage = (ev: any) => {
      const { id: rid, result, error } = ev.data || {};
      if (rid !== id) return;
      cleanup();
      if (error) return reject(new Error(String(error)));
      resolve(result);
    };

    const onError = (err: any) => {
      cleanup();
      reject(err || new Error('Worker error'));
    };

    worker.addEventListener('message', onMessage as any);
    worker.addEventListener('error', onError as any);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SFTP worker timeout'));
    }, timeoutMs);

    worker.postMessage({ id, op, node, creds, args });
  });
}

export interface SftpCredentials {
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface SftpEndpoint {
  host: string
  port: number
}

function normalizeSftpPath(value: string | undefined): string {
  let normalized = typeof value === 'string' ? value.trim() : '/'
  if (!normalized) normalized = '/'
  normalized = normalized.replace(/\\\\/g, '/')
  normalized = path.posix.normalize(normalized)
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  return normalized === '' ? '/' : normalized
}

function sftpUrlForNode(node: Node): SftpEndpoint {
  const urlObj = (() => {
    try {
      return new URL(node.url)
    } catch {
      return null
    }
  })()

  const nodeHost = urlObj?.hostname || node.url
  const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '')
  const backendHost = backendBase
    ? (() => {
        try {
          return new URL(backendBase).hostname
        } catch {
          return backendBase
        }
      })()
    : null

  const host = node.sftpProxyPort
    ? backendHost || '127.0.0.1'
    : nodeHost

  const port = node.sftpProxyPort ?? node.sftpPort ?? 2022

  return { host, port }
}

function sftpEndpoint(node: Node, override?: SftpEndpoint): SftpEndpoint {
  return override ?? sftpUrlForNode(node)
}

function parseTime(attr: any): string | undefined {
  if (!attr) return undefined
  if (typeof attr === 'number') {
    return new Date(attr * 1000).toISOString()
  }
  if (attr instanceof Date) {
    return attr.toISOString()
  }
  return undefined
}

function normalizeSftpEntry(filename: string, attrs: any) {
  return {
    name: filename,
    attributes: {
      name: filename,
      size: Number(attrs.size || 0),
      modified_at: parseTime(attrs.mtime),
    },
    directory: typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false,
    is_file: typeof attrs.isFile === 'function' ? attrs.isFile() : !attrs.isDirectory?.(),
    type: typeof attrs.isDirectory === 'function' && attrs.isDirectory() ? 'directory' : 'file',
    size: Number(attrs.size || 0),
    modified: parseTime(attrs.mtime),
    modified_at: parseTime(attrs.mtime),
  }
}

function createConnectConfig(endpoint: SftpEndpoint, creds: SftpCredentials): ConnectConfig {
  const config: ConnectConfig = {
    host: endpoint.host,
    port: endpoint.port,
    username: creds.username,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    tryKeyboard: false,
  }

  if (creds.password) {
    config.password = creds.password
  }

  if (creds.privateKey) {
    config.privateKey = creds.privateKey
  }

  if (creds.passphrase) {
    config.passphrase = creds.passphrase
  }

  return config
}

function createSftpClient(endpoint: SftpEndpoint, creds: SftpCredentials): Promise<{ client: Client; sftp: SFTPWrapper }> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false

    console.debug('[sftp] attempting connection', { host: endpoint.host, port: endpoint.port, username: creds.username })

    const cleanup = () => {
      if (!settled) return
      settled = false
      client.removeAllListeners()
    }

    const handleError = (err: Error) => {
      if (settled) return
      settled = true
      client.end()
      reject(err)
    }

    client.once('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          handleError(err)
          return
        }
        settled = true
        resolve({ client, sftp })
      })
    })

    client.once('error', handleError)
    client.once('end', () => {
      if (!settled) {
        settled = true
        reject(new Error('SFTP connection closed before ready'))
      }
    })

    const config = createConnectConfig(endpoint, creds)
    try {
      client.connect(config)
    } catch (err) {
      handleError(err as Error)
    }
  })
}

async function withSftp<T>(node: Node, creds: SftpCredentials, callback: (sftp: SFTPWrapper) => Promise<T>, endpoint?: SftpEndpoint): Promise<T> {
  const selectedEndpoint = sftpEndpoint(node, endpoint)
  const { client, sftp } = await createSftpClient(selectedEndpoint, creds)
  try {
    return await callback(sftp)
  } finally {
    try {
      client.end()
    } catch {
      // meow
    }
  }
}

function sftpReaddir(sftp: SFTPWrapper, path: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) return reject(err)
      resolve(list || [])
    })
  })
}

function sftpReadFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (err, data) => {
      if (err) return reject(err)
      resolve(Buffer.from(data))
    })
  })
}

function sftpWriteFile(sftp: SFTPWrapper, path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.writeFile(path, data, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpUnlink(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(path, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpRmdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rmdir(path, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpRename(sftp: SFTPWrapper, oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpChmod(sftp: SFTPWrapper, path: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chmod(path, mode, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function sftpStat(sftp: SFTPWrapper, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (err, stats) => {
      if (err) return reject(err)
      resolve(stats)
    })
  })
}

export async function listSftpDirectory(node: Node, creds: SftpCredentials, dir: string, endpoint?: SftpEndpoint) {
  const normalized = normalizeSftpPath(dir)
  const res = await runSftpOpInWorker('list', node, creds, [normalized])
  return res || []
}

export async function readSftpFile(node: Node, creds: SftpCredentials, filePath: string, endpoint?: SftpEndpoint): Promise<Buffer> {
  const normalized = normalizeSftpPath(filePath)
  const res = await runSftpOpInWorker('read', node, creds, [normalized])
  if (!res || !res.data) throw new Error('Empty SFTP result')
  return Buffer.from(res.data)
}

export async function writeSftpFile(node: Node, creds: SftpCredentials, filePath: string, data: Buffer, endpoint?: SftpEndpoint) {
  const normalized = normalizeSftpPath(filePath)
  await runSftpOpInWorker('write', node, creds, [normalized, Array.from(data)])
}

async function deleteSftpPath(sftp: SFTPWrapper, targetPath: string): Promise<void> {
  const stats = await sftpStat(sftp, targetPath)
  if (typeof stats.isDirectory === 'function' && stats.isDirectory()) {
    const entries = await sftpReaddir(sftp, targetPath)
    for (const entry of entries) {
      const child = path.posix.join(targetPath, entry.filename)
      await deleteSftpPath(sftp, child)
    }
    await sftpRmdir(sftp, targetPath)
  } else {
    await sftpUnlink(sftp, targetPath)
  }
}

export async function deleteSftpFiles(node: Node, creds: SftpCredentials, root: string, files: string[], endpoint?: SftpEndpoint) {
  const normalizedRoot = normalizeSftpPath(root)
  await runSftpOpInWorker('delete', node, creds, [normalizedRoot, files])
}

export async function mkdirSftp(node: Node, creds: SftpCredentials, dirPath: string, endpoint?: SftpEndpoint) {
  const normalized = normalizeSftpPath(dirPath)
  await runSftpOpInWorker('mkdir', node, creds, [normalized])
}

export async function renameSftp(node: Node, creds: SftpCredentials, oldPath: string, newPath: string, endpoint?: SftpEndpoint) {
  const normalizedOld = normalizeSftpPath(oldPath)
  const normalizedNew = normalizeSftpPath(newPath)
  await runSftpOpInWorker('rename', node, creds, [normalizedOld, normalizedNew])
}

export async function chmodSftp(node: Node, creds: SftpCredentials, filePath: string, mode: number, endpoint?: SftpEndpoint) {
  const normalized = normalizeSftpPath(filePath)
  await runSftpOpInWorker('chmod', node, creds, [normalized, mode])
}

export async function moveSftpFiles(node: Node, creds: SftpCredentials, root: string, mappings: Array<{ from: string; to: string }>, endpoint?: SftpEndpoint) {
  const normalizedRoot = normalizeSftpPath(root)
  await runSftpOpInWorker('move', node, creds, [normalizedRoot, mappings])
}

export async function listSftpFiles(node: Node, creds: SftpCredentials, dir: string, endpoint?: SftpEndpoint) {
  return listSftpDirectory(node, creds, dir, endpoint)
}

export async function validateSftpCredentials(node: Node, creds: SftpCredentials, path: string, endpoint?: SftpEndpoint) {
  const normalized = normalizeSftpPath(path)
  const res = await runSftpOpInWorker('validate', node, creds, [normalized])
  return !!res?.ok
}

export { sftpUrlForNode }