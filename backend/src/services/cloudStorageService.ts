import path from 'path';
import crypto from 'crypto';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { UserStorage } from '../models/userStorage.entity';
import { WingsApiService } from './wingsApiService';
import { saveServerConfig } from '../handlers/remoteHandler';

const DEFAULT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const STORAGE_DISK_MB = 512 * 1024; // Wings-level disk cap for the hidden server (512 GB, generous ceiling)
const STORAGE_EGG_ID = 258; // "AIO" lightweight egg — container never boots anyway

let cachedNodes: Node[] | null = null;

async function getNodeRepo() {
  return AppDataSource.getRepository(Node);
}

/** Extract file entries from a Wings file-listing response (envelope-agnostic). */
export function parseFileEntries(body: any): any[] {
  const data = Array.isArray(body) ? body : (body as any)?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any)?.entries)) return (data as any).entries;
  if (Array.isArray((data as any)?.data)) return (data as any).data;
  if (Array.isArray((data as any)?.files)) return (data as any).files;
  return [];
}

export function normalizeStorageQuota(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_QUOTA_BYTES;
  return Math.floor(n);
}

export async function invalidateStorageNodeCache(): Promise<void> {
  cachedNodes = null;
}

/** Find the designated storage node (isStorageNode=true), preferring Wings. */
export async function getStorageNode(): Promise<Node> {
  if (!cachedNodes) {
    cachedNodes = (await (await getNodeRepo()).find()) || [];
  }
  const wings = cachedNodes.filter(n => n.provider === 'wings');
  const candidate =
    wings.find(n => n.isStorageNode) ??
    cachedNodes.find(n => n.isStorageNode) ??
    wings.find(n => n.id === 1) ??
    wings[0];
  if (!candidate) throw new Error('No storage node available: mark a Wings node as a storage node');
  return candidate;
}

/**
 * Fully provision a hidden cloud-storage server for a user on the storage node.
 * The server never boots — Wings file API works purely on the host filesystem,
 * so the container does not need to run (or even have a valid image).
 */
export async function provisionStorageServer(userId: number): Promise<UserStorage> {
  const storageRepo = AppDataSource.getRepository(UserStorage);
  const existing = await storageRepo.findOneBy({ userId });
  if (existing) return existing;

  const node = await getStorageNode();
  const serverUuid = crypto.randomUUID();

  const env = {
    STARTUP_CMD: 'sleep infinity',
    P_SERVER_ALLOCATION_LIMIT: '1',
  };

  // 1. Register the hidden server config (flagged so it never shows in the panel).
  await saveServerConfig({
    uuid: serverUuid,
    nodeId: node.id,
    userId,
    name: `cloud-storage-${userId}`,
    description: 'Internal cloud storage server',
    dockerImage: 'ghcr.io/pterodactyl/yolks:alpine',
    startup: 'sleep infinity',
    environment: env,
    memory: 64,
    disk: STORAGE_DISK_MB,
    cpu: 0,
    eggId: STORAGE_EGG_ID,
    skipEggScripts: true,
    isStorageOnly: true,
  });

  // 2. Map the server to the storage node so Wings routes it correctly.
  try {
    const { nodeService } = await import('./nodeService');
    await nodeService.mapServer(serverUuid, node.id);
  } catch {
    // mapping handled below via raw insert fallback in saveServerConfig path
  }

  // 3. Ask Wings to create the deployment (this makes the server filesystem materialize).
  const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
  try {
    await svc.createServer({ uuid: serverUuid, start_on_completion: false, skip_scripts: true });
  } catch (err: any) {
    const status = err?.response?.status ?? (err as any)?.status;
    if (status !== 409 && status !== 400) {
      // 409 = already exists; otherwise surface the failure.
      console.error(`[cloudStorage] Wings createServer failed for ${serverUuid}:`, err?.message || err);
    }
  }

  const row = storageRepo.create({
    userId,
    storageServerUuid: serverUuid,
    nodeId: node.id,
    quotaBytes: DEFAULT_QUOTA_BYTES,
    usedBytes: 0,
  });
  return storageRepo.save(row);
}

/** Get or lazily provision the storage server for a user. */
export async function getOrProvisionStorage(userId: number): Promise<UserStorage> {
  const storageRepo = AppDataSource.getRepository(UserStorage);
  const existing = await storageRepo.findOneBy({ userId });
  if (existing) return existing;
  return provisionStorageServer(userId);
}

/** Get the storage server uuid for a user, provisioning lazily if missing. */
export async function getStorageServerUuid(userId: number): Promise<{ uuid: string; nodeId: number }> {
  const row = await getOrProvisionStorage(userId);
  return { uuid: row.storageServerUuid, nodeId: row.nodeId };
}

/** Resolve the Wings service + hidden server uuid for a user's storage. */
export async function getStorageSvcForUserId(userId: number): Promise<{
  svc: WingsApiService;
  uuid: string;
  row: UserStorage;
}> {
  const row = await getOrProvisionStorage(userId);
  const node = await (await getNodeRepo()).findOneBy({ id: row.nodeId });
  if (!node) throw new Error(`Storage node ${row.nodeId} not found`);
  const svc = new WingsApiService(node.backendWingsUrl || node.url, node.token);
  return { svc, uuid: row.storageServerUuid, row };
}

/** Recompute used bytes by recursively walking the Wings filesystem. */
export async function recomputeStorageUsage(userId: number): Promise<number> {
  const { svc, uuid, row } = await getStorageSvcForUserId(userId);
  const repo = AppDataSource.getRepository(UserStorage);

  const walk = async (dir: string, depth: number): Promise<number> => {
    if (depth > 32) return 0;
    let sum = 0;
    try {
      const res = await svc.listServerFiles(uuid, dir || '/');
      const entries = parseFileEntries(res?.data);
      for (const e of entries) {
        if (!e) continue;
        if (e.directory) {
          const child = [dir, String(e.name)].join('/').replace(/^\/|\/$/g, '');
          sum += await walk(child, depth + 1);
        } else {
          sum += e.size || 0;
        }
      }
    } catch (err: any) {
      console.warn('[cloudStorage] recompute walk failed for dir', dir, err?.message || err);
    }
    return sum;
  };

  let total = 0;
  try {
    total = await walk('/', 0);
  } catch (err: any) {
    console.warn('[cloudStorage] recompute failed for user', userId, err?.message || err);
    return row.usedBytes;
  }
  row.usedBytes = total;
  await repo.save(row);
  return total;
}

export interface StorageQuotaInfo {
  userId: number;
  quotaBytes: number;
  usedBytes: number;
  serverUuid: string;
  nodeId: number;
  provisioning: boolean;
}

export async function getStorageQuota(userId: number): Promise<StorageQuotaInfo> {
  const row = await getOrProvisionStorage(userId);
  return {
    userId,
    quotaBytes: row.quotaBytes,
    usedBytes: row.usedBytes,
    serverUuid: row.storageServerUuid,
    nodeId: row.nodeId,
    provisioning: false,
  };
}

export async function setStorageQuota(userId: number, quotaBytes: number): Promise<StorageQuotaInfo> {
  const row = await getOrProvisionStorage(userId);
  row.quotaBytes = normalizeStorageQuota(quotaBytes);
  await AppDataSource.getRepository(UserStorage).save(row);
  void recomputeStorageUsage(userId).catch(() => {});
  return getStorageQuota(userId);
}

/** Internal: ensure a directory tree exists on the hidden server. */
export async function ensureStorageDir(userId: number, dir: string): Promise<void> {
  const { svc, uuid } = await getStorageSvcForUserId(userId);
  const clean = dir.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return;

  const parts = clean.split('/');
  const created = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const segment = parts.slice(0, i + 1).join('/');
    if (created.has(segment)) continue;
    try {
      await svc.createDirectory(uuid, '/', segment);
    } catch {
      // already exists or partial — wings creates parent implicitly on write anyway
    }
    created.add(segment);
  }
}

export interface BlobDescriptor {
  name: string;
  size: number;
  directory: boolean;
  modified?: string;
}

export interface StorageWriteResult {
  path: string;
  size: number;
  usedBytes: number;
  quotaBytes: number;
  remaining: number;
}

/** Write a blob to the user's cloud storage, enforcing the per-user quota. */
export async function writeStorageBlob(
  userId: number,
  filePath: string,
  content: Uint8Array | ArrayBufferView | Buffer | string,
  timeoutMs?: number
): Promise<StorageWriteResult> {
  const { svc, uuid, row } = await getStorageSvcForUserId(userId);
  const repo = AppDataSource.getRepository(UserStorage);

  const buf =
    typeof content === 'string'
      ? Buffer.from(content, 'utf8')
      : Buffer.from(
          ArrayBuffer.isView(content)
            ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
            : (content as any).buffer ?? content
        );

  const size = buf.byteLength;

  const oldSize = await (async () => {
    try {
      const parent = path.posix.dirname(filePath === '/' ? '/x' : filePath);
      const name = path.posix.basename(filePath);
      const res = await svc.listServerFiles(uuid, parent);
      const entries = parseFileEntries(res?.data);
      const hit = entries.find(e => e.name === name);
      return hit ? Number(hit.size) || 0 : 0;
    } catch {
      return 0;
    }
  })();

  const quota = Number(row.quotaBytes) || DEFAULT_QUOTA_BYTES;
  const used = Number(row.usedBytes) || 0;
  const delta = size - oldSize;

  if (used + delta > quota) {
    const err: any = new Error(
      `Storage quota exceeded (${used + delta} > ${quota})`
    );
    err.code = 'STORAGE_QUOTA_EXCEEDED';
    err.remaining = Math.max(0, quota - used);
    throw err;
  }

  await ensureStorageDir(userId, path.posix.dirname(filePath));
  await svc.writeFile(uuid, filePath, buf, timeoutMs);

  row.usedBytes = Math.max(0, used + delta);
  await repo.save(row);

  return {
    path: filePath,
    size,
    usedBytes: row.usedBytes,
    quotaBytes: quota,
    remaining: Math.max(0, quota - row.usedBytes),
  };
}

/** Read a text blob from the user's cloud storage. Returns null if missing. */
export async function readStorageBlob(userId: number, filePath: string): Promise<string | null> {
  const { svc, uuid } = await getStorageSvcForUserId(userId);
  try {
    const res = await svc.readFile(uuid, filePath);
    return typeof res?.data === 'string' ? res.data : null;
  } catch (err: any) {
    if (err?.response?.status === 404 || (err as any)?.status === 404) return null;
    throw err;
  }
}

/** Read a binary blob from cloud storage. Returns null if missing. */
export async function downloadStorageBlob(
  userId: number,
  filePath: string
): Promise<Uint8Array | null> {
  const { svc, uuid } = await getStorageSvcForUserId(userId);
  try {
    const res = await svc.downloadFile(uuid, filePath);
    const data = res?.data;
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      return new Uint8Array(
        data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      );
    }
    if (typeof data === 'string') return new TextEncoder().encode(data);
    return null;
  } catch (err: any) {
    if (err?.response?.status === 404 || (err as any)?.status === 404) return null;
    throw err;
  }
}

/** List blobs under a directory. Returns [] for missing directories. */
export async function listStorageBlobs(userId: number, dir = '/'): Promise<BlobDescriptor[]> {
  const { svc, uuid } = await getStorageSvcForUserId(userId);
  const res = await svc.listServerFiles(uuid, dir);
  const entries = parseFileEntries(res?.data);
  return entries.map((e: any) => ({
    name: String(e.name ?? ''),
    size: Number(e.size) || 0,
    directory: Boolean(e.directory ?? e.is_dir ?? e.isDir),
    modified: e.modified ? new Date(e.modified).toISOString() : undefined,
  }));
}

/** Stat a single blob. Returns null if missing. */
export async function statStorageBlob(userId: number, filePath: string): Promise<BlobDescriptor | null> {
  const parent = path.posix.dirname(filePath);
  const name = path.posix.basename(filePath);
  const entries = await listStorageBlobs(userId, parent);
  return entries.find(e => e.name === name && !e.directory) || null;
}

/** Rename/move a blob or folder in the user's cloud storage (quota unchanged). */
export async function renameStorageBlob(userId: number, fromPath: string, toPath: string): Promise<void> {
  const { svc, uuid } = await getStorageSvcForUserId(userId);
  await ensureStorageDir(userId, path.posix.dirname(toPath));
  await svc.moveFiles(uuid, '/', [{ from: fromPath, to: toPath }]);
}

/** Delete a blob from cloud storage and free quota. */
export async function deleteStorageBlob(userId: number, filePath: string): Promise<boolean> {
  const { svc, uuid, row } = await getStorageSvcForUserId(userId);
  const stat = await statStorageBlob(userId, filePath);
  if (!stat) return false;
  await svc.deleteFile(uuid, '/', [filePath]);
  const repo = AppDataSource.getRepository(UserStorage);
  row.usedBytes = Math.max(0, Number(row.usedBytes) - stat.size);
  await repo.save(row);
  return true;
}

/** Delete the entire storage directory for an app prefix (e.g. `office`). */
export async function deleteStoragePrefix(userId: number, prefix: string): Promise<boolean> {
  const { svc, uuid, row } = await getStorageSvcForUserId(userId);
  try {
    await svc.deleteFile(uuid, '/', [prefix]);
  } catch {
    return false;
  }
  const repo = AppDataSource.getRepository(UserStorage);
  // Recomputed lazily; smart best-effort rebuild below.
  void recomputeStorageUsage(userId).catch(() => {});
  return true;
}

/** List all ServerConfig rows that are storage-only (for filtering in queries). */
export async function findStorageServerUuids(): Promise<string[]> {
  const rows = await AppDataSource.getRepository(ServerConfig).find({
    select: { uuid: true },
    where: { isStorageOnly: true },
  });
  return rows.map(r => r.uuid);
}

export async function findStorageServerUuidsForUser(userId: number): Promise<string[]> {
  const rows = await AppDataSource.getRepository(ServerConfig).find({
    select: { uuid: true },
    where: { userId, isStorageOnly: true },
  });
  return rows.map(r => r.uuid);
}