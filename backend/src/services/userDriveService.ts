import { AppDataSource } from '../config/typeorm';
import path from 'node:path';
import { User } from '../models/user.entity';
import {
  ensureStorageDir,
  writeStorageBlob,
  downloadStorageBlob,
  listStorageBlobs,
  statStorageBlob,
  deleteStorageBlob,
  deleteStoragePrefix,
} from './cloudStorageService';

const SANE_NAME = /^[^/\\:*?"<>|]{1,255}$/;

function resolveDrivePath(rel: string): string {
  const p = String(rel || '').replace(/\\/g, '/');
  const clean = path.posix.normalize('/' + p).replace(/^\/+/, '');
  if (!clean || clean.startsWith('..') || clean.split('/').some(s => !SANE_NAME.test(s))) {
    throw Object.assign(new Error('Invalid drive path'), { code: 'INVALID_PATH' });
  }
  return `drive/${clean}`;
}

export async function listDrive(userId: number, dir = '/') {
  const d = String(dir || '/').replace(/\\/g, '/');
  const clean = path.posix.normalize('/' + d).replace(/^\/+/, '');
  const entries = await listStorageBlobs(userId, `drive/${clean}`);
  return {
    directory: '/' + clean,
    entries: entries.map(e => ({
      name: e.name,
      size: e.size,
      directory: e.directory,
      modified: e.modified ?? null,
    })),
  };
}

export async function uploadDriveItem(userId: number, relDir: string, name: string, buf: Uint8Array | Buffer | string) {
  if (!SANE_NAME.test(name || '')) throw Object.assign(new Error('Invalid file name'), { code: 'INVALID_NAME' });
  const d = String(relDir || '/').replace(/\\/g, '/');
  const dirClean = path.posix.normalize('/' + d).replace(/^\/+/, '');
  const filePath = dirClean ? `drive/${dirClean}/${name}` : `drive/${name}`;
  return writeStorageBlob(userId, filePath, buf);
}

export async function moveDriveItem(userId: number, from: string, toDir: string, toName?: string) {
  const fromPath = resolveDrivePath(from);
  const d = String(toDir || '/').replace(/\\/g, '/');
  const dirClean = path.posix.normalize('/' + d).replace(/^\/+/, '');
  const to = resolveDrivePath(dirClean ? `${dirClean}/${toName || path.posix.basename(from)}` : toName || path.posix.basename(from));
  const content = await downloadStorageBlob(userId, fromPath);
  if (!content) {
    throw Object.assign(new Error(ctx?.fallbackLang ? '' : 'Source not found'), { code: 'NOT_FOUND' });
  }
  await writeStorageBlob(userId, to, content);
  await deleteStorageBlob(userId, fromPath);
  return { ok: true, to };
}

export async function deleteDriveItem(userId: number, rel: string) {
  const filePath = resolveDrivePath(rel);
  const stat = await statStorageBlob(userId, filePath);
  if (!stat) {
    throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
  }
  if (stat.directory) {
    await deleteStoragePrefix(userId, filePath);
  } else {
    await deleteStorageBlob(userId, filePath);
  }
  return { ok: true };
}

export type DriveItemDescriptor = {
  name: string;
  size: number;
  directory: boolean;
  modified: string | null;
  path: string;
  isOfficeDoc: boolean;
};

export async function listDriveRecursive(userId: number, dir = '/'): Promise<DriveItemDescriptor[]> {
  const pile: DriveItemDescriptor[] = [];
  const d = String(dir || '/').replace(/\\/g, '/');
  const root = path.posix.normalize('/' + d).replace(/^\/+/, '');
  const out = await listDrive(userId, root);
  for (const e of out.entries) {
    const isOfficeDoc =
      !e.directory &&
      (e.name.endsWith('.yjscontent') || e.name.endsWith('.office') || e.name.endsWith('.doc'));
    pile.push({
      name: e.name,
      size: e.size,
      directory: e.directory,
      modified: e.modified ?? null,
      path: (root ? `${root}/` : '') + e.name,
      isOfficeDoc,
    });
  }
  return pile;
}

export async function statDriveItem(userId: number, rel: string) {
  const filePath = resolveDrivePath(rel);
  return statStorageBlob(userId, filePath);
}

export async function avatarBlobPath(userId: number, ext: string): Promise<string> {
  return `me/avatar${ext}`;
}
export async function blogCoverBlobPath(userId: number, postId: number, ext = '.jpg'): Promise<string> {
  return `blog/${postId}/cover${ext}`;
}
export async function serveBlobAsFile(
  userId: number,
  rel: string,
  opts?: { download?: boolean; label?: string }
): Promise<{ data: BodyInit; set: { status: number; header?: (k: string, v: string) => unknown } }> {
  const filePath = resolveDrivePath(rel);
  const content = await downloadStorageBlob(userId, filePath);
  if (!content) {
    return { data: new Blob([]) as any, set: { status: 404 } as any };
  }
  const st = await statStorageBlob(userId, filePath);
  const name = opts?.label || path.posix.basename(rel);
  const headers = {
    'Content-Type': (st?.mime || 'application/octet-stream'),
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  const resp = new Response(content, { headers });
  if (opts?.download) {
    resp.headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  return {
    data: resp.body as BodyInit,
    set: { status: 200, header: (k, v) => { try { resp.headers.set(k, v); } catch {} } },
  };
}

type SvcCtx = { userId: number };
export async function getDriveSvc(userId: number): Promise<SvcCtx> {
  return { userId };
}