import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import { AppDataSource } from '../config/typeorm';
import { ExportJob } from '../models/exportJob.entity';
import { User } from '../models/user.entity';
import { Passkey } from '../models/passkey.entity';
import { Ticket } from '../models/ticket.entity';
import { UserLog } from '../models/userLog.entity';
import { Organisation } from '../models/organisation.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { WingsApiService } from './wingsApiService';
import * as tar from 'tar';
import { v4 as uuidv4 } from 'uuid';
import { socEmitter } from './socSocketService';

const EXPORT_FOLDER_PREFIX = 'ecli-export-';
const MAX_FILES_PER_SERVER = Number(process.env.EXPORT_JOB_MAX_FILES_PER_SERVER || 500);
const MAX_TOTAL_FILE_BYTES = Number(process.env.EXPORT_JOB_MAX_TOTAL_BYTES || 500 * 1024 * 1024);
const EXPORT_RETENTION_DAYS = Number(process.env.EXPORT_JOB_RETENTION_DAYS || 14);

function isDirectoryEntry(item: any): boolean {
  const type = String(item?.type || '').toLowerCase();
  if (type === 'directory' || type === 'dir' || type === 'folder') return true;
  if (typeof item?.isDirectory === 'boolean') return item.isDirectory;
  if (typeof item?.is_file === 'boolean') return !item.is_file;
  const mode = String(item?.mode || '');
  if (mode.startsWith('d')) return true;
  return false;
}

async function collectFilesRecursive(
  svc: WingsApiService,
  serverId: string,
  dir: string,
  entries: Array<{ path: string; size: number }>,
  totals: { bytes: number },
): Promise<void> {
  if (entries.length >= MAX_FILES_PER_SERVER || totals.bytes >= MAX_TOTAL_FILE_BYTES) return;
  let res: any;
  try {
    res = await svc.listServerFiles(serverId, dir);
  } catch (e) {
    return;
  }
  const data = res?.data;
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  for (const item of list) {
    if (entries.length >= MAX_FILES_PER_SERVER || totals.bytes >= MAX_TOTAL_FILE_BYTES) break;
    const rawName = item?.name || item?.filename || item?.path || '';
    const name = String(rawName);
    if (!name || name === '.' || name === '..') continue;
    const isDir = isDirectoryEntry(item);
    const filepath = name.startsWith('/') ? name : (dir === '/' ? `/${name}` : `${dir}/${name}`);
    if (isDir) {
      await collectFilesRecursive(svc, serverId, filepath, entries, totals);
    } else {
      const size = Number(item.size || 0);
      if (totals.bytes + size > MAX_TOTAL_FILE_BYTES) continue;
      entries.push({ path: filepath, size });
      totals.bytes += size;
    }
  }
}

export async function createExportJob(adminId: number | undefined, userId: number) {
  const repo = AppDataSource.getRepository(ExportJob);
  const job = repo.create({ userId, adminId, status: 'queued', progress: 0, message: 'Queued for processing' });
  return repo.save(job);
}

async function updateJob(job: ExportJob, changes: Partial<ExportJob>) {
  const repo = AppDataSource.getRepository(ExportJob);
  Object.assign(job, changes);
  const saved = await repo.save(job);
  try { socEmitter.emit('update', { type: 'export:progress', jobId: saved.id, status: saved.status, progress: saved.progress, message: saved.message, resultPath: saved.resultPath }); } catch {}
  return saved;
}

export async function processExportJob(jobRow: ExportJob) {
  const repo = AppDataSource.getRepository(ExportJob);
  let job = jobRow;
  try {
    job = await updateJob(job, { status: 'running', progress: 2, message: 'Starting export' });

    const userRepo = AppDataSource.getRepository(User);
    const passkeyRepo = AppDataSource.getRepository(Passkey);
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const logRepo = AppDataSource.getRepository(UserLog);
    const orgRepo = AppDataSource.getRepository(Organisation);
    const serverRepo = AppDataSource.getRepository(ServerConfig as any);

    const user = await userRepo.findOne({ where: { id: job.userId } });
    if (!user) {
      job = await updateJob(job, { status: 'failed', progress: 100, message: 'User not found' });
      return job;
    }

    const passkeys = await passkeyRepo.find({ where: { user: { id: user.id } } }).catch(() => []);
    const tickets = await ticketRepo.find({ where: { userId: user.id } }).catch(() => []);
    const logs = await logRepo.find({ where: { userId: user.id } }).catch(() => []);
    const orgs = await orgRepo.find({ where: { ownerId: user.id } }).catch(() => []);
    const servers = await serverRepo.find({ where: { userId: user.id } }).catch(() => []);

    job = await updateJob(job, { progress: 20, message: 'Collected metadata' });

    const tmpRoot = os.tmpdir();
    const outDir = path.join(tmpRoot, EXPORT_FOLDER_PREFIX + uuidv4());
    await fsp.mkdir(outDir, { recursive: true });

    const serverData: any[] = [];
    const nodes = await AppDataSource.getRepository(Node).find();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (let idx = 0; idx < servers.length; idx++) {
      const server = servers[idx] as any;
      const serverUuid = server.uuid || server.serverUuid || server.id;
      if (!serverUuid) continue;

      const node = nodeMap.get(server.nodeId);
      if (!node) continue;
      const base = (node as any).backendWingsUrl || node.url;
      const svc = new WingsApiService(base, node.token);

      const sData: any = { uuid: serverUuid, name: server.name || serverUuid, logs: null, backups: null, files: [] };

      try {
        const res = await svc.getServerLogs(serverUuid);
        sData.logs = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } catch (e: any) {
        sData.logs = `Failed to collect logs: ${e?.message || e}`;
      }

      try {
        const res = await svc.listServerBackups(serverUuid);
        sData.backups = res.data || [];
      } catch (e: any) {
        sData.backups = `Failed to collect backups: ${e?.message || e}`;
      }

      try {
        const fileEntries: Array<{ path: string; size: number }> = [];
        const totals = { bytes: 0 };
        await collectFilesRecursive(svc, serverUuid, '/', fileEntries, totals);
        sData.files = fileEntries;

        const serverFilesDir = path.join(outDir, 'servers', String(serverUuid), 'files');
        await fsp.mkdir(serverFilesDir, { recursive: true });

        for (let fIdx = 0; fIdx < fileEntries.length; fIdx++) {
          const fileItem = fileEntries[fIdx];
          try {
            const res = await svc.downloadFile(serverUuid, fileItem.path);
            const fileData = res.data instanceof ArrayBuffer ? Buffer.from(res.data) : Buffer.from(res.data || '');
            const normalized = fileItem.path.replace(/^\//, '');
            const destPath = path.join(outDir, 'servers', String(serverUuid), 'files', normalized);
            await fsp.mkdir(path.dirname(destPath), { recursive: true });
            await fsp.writeFile(destPath, fileData);
          } catch (e: any) {
            // skip
          }
          const serverProgress = 20 + Math.floor((idx / Math.max(1, servers.length)) * 50 + (fIdx / Math.max(1, fileEntries.length)) * 20);
          await updateJob(job, { progress: Math.min(90, serverProgress), message: `Collecting files for server ${serverUuid}` });
        }
      } catch (e: any) {
        sData.files = `Failed to collect files: ${e?.message || e}`;
      }

      serverData.push(sData);
      await updateJob(job, { progress: 30 + Math.floor(((idx + 1) / Math.max(1, servers.length)) * 50), message: `Processed server ${serverUuid}` });
    }

    const meta = { user, passkeys, tickets, logs, orgs, servers, serverData };
    await fsp.writeFile(path.join(outDir, 'user-export.json'), JSON.stringify(meta, null, 2), 'utf8');
    job = await updateJob(job, { progress: 50, message: 'Wrote metadata and server info' });

    const archivePath = path.join(tmpRoot, `export-${user.id}-${Date.now()}.tar.gz`);
    await tar.c({ gzip: true, file: archivePath, cwd: outDir }, ['.']);
    job = await updateJob(job, { progress: 90, message: 'Archive created', resultPath: archivePath });
    job = await updateJob(job, { status: 'completed', progress: 100, message: 'Export complete' });

    try { await fsp.rm(outDir, { recursive: true, force: true }); } catch {}

    return job;
  } catch (e: any) {
    console.error('processExportJob error', e);
    try { job = await updateJob(job, { status: 'failed', progress: 100, message: String(e?.message || e) }); } catch {}
    return job;
  }
}

export async function getExportJob(jobId: string) {
  const repo = AppDataSource.getRepository(ExportJob);
  return repo.findOne({ where: { id: jobId } });
}

export async function listExportJobs(limit = 100, status?: string) {
  const repo = AppDataSource.getRepository(ExportJob);
  const where = status ? { status } as any : {};
  const jobs = await repo.find({ where, order: { createdAt: 'DESC' }, take: Math.min(Math.max(1, limit), 500) });
  return jobs;
}

export async function cleanupExpiredExportArchives() {
  const repo = AppDataSource.getRepository(ExportJob);
  const cutoff = new Date(Date.now() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stale = await repo.createQueryBuilder('job')
    .where('job.resultPath IS NOT NULL')
    .andWhere('job.updatedAt <= :cutoff', { cutoff })
    .getMany();

  let removed = 0;
  for (const job of stale) {
    const archivePath = job.resultPath;
    if (!archivePath) continue;
    try {
      await fsp.unlink(archivePath);
    } catch {
      // meow
    }

    await repo.update(
      { id: job.id },
      {
        resultPath: null as any,
        shareToken: null as any,
        shareLinkExpiresAt: null as any,
        shareDownloadsRemaining: 0,
        message: `Archive deleted after ${EXPORT_RETENTION_DAYS} days retention`,
      } as any,
    );
    removed += 1;
  }

  return { removed, cutoff };
}
