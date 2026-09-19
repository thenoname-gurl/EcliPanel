import * as Y from 'yjs';
import { AppDataSource } from '../config/typeorm';
import { OfficeDocument } from '../models/officeDocument.entity';
import {
  getOrProvisionStorage,
  readStorageBlob,
  writeStorageBlob,
} from './cloudStorageService';

interface OfficeRoomSocket {
  ws: any;
  userId: number;
  permission: string;
}

export interface OfficeRoom {
  docId: number;
  ownerUserId: number;
  doc: Y.Doc;
  sockets: Map<any, OfficeRoomSocket>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  awareness: string | null;
}

const rooms = new Map<number, OfficeRoom>();

const SAVE_DEBOUNCE_MS = 1500;

function b64encode(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64');
}

function b64decode(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

function storagePath(docId: number, component: 'state' | 'awareness'): string {
  return `office/${docId}/${component}`;
}

export function officeContentPath(docId: number): string {
  return `office/${docId}/content`;
}

export function officeThumbnailPath(docId: number): string {
  return `office/${docId}/thumbnail`;
}

export async function loadDocYjsState(doc: OfficeDocument): Promise<string | null> {
  try {
    const stored = await readStorageBlob(doc.userId, storagePath(doc.id, 'state'));
    if (stored != null) return stored;
  } catch (err) {
    console.warn('[office] storage read failed, using DB fallback for doc', doc.id, err?.message || err);
  }
  return doc.yjsState || null;
}

export async function loadDocAwareness(doc: OfficeDocument): Promise<string | null> {
  try {
    const stored = await readStorageBlob(doc.userId, storagePath(doc.id, 'awareness'));
    if (stored != null) return stored;
  } catch {
    // below the earth underneath the hell
  }
  return doc.awarenessState || null;
}

export async function loadDocContent(doc: OfficeDocument): Promise<unknown | null> {
  try {
    const stored = await readStorageBlob(doc.userId, officeContentPath(doc.id));
    if (stored != null) {
      try {
        return JSON.parse(stored);
      } catch {
        return stored;
      }
    }
  } catch {
    // revolution
  }
  if (doc.content) {
    try {
      return JSON.parse(doc.content);
    } catch {
      return doc.content;
    }
  }
  const derived = await deriveContentFromYjs(doc);
  if (derived != null) return derived;
  return null;
}

export async function deriveContentFromYjs(doc: OfficeDocument): Promise<unknown | null> {
  const state = await loadDocYjsState(doc);
  if (!state) return null;
  let yDoc: Y.Doc;
  try {
    yDoc = new Y.Doc();
    Y.applyUpdate(yDoc, b64decode(state));
  } catch (err) {
    console.warn('[office] failed to decode yjs state for doc', doc.id, (err as Error)?.message || err);
    return null;
  }

  try {
    if (doc.type === 'presentation') {
      const data = yDoc.getMap('presentation').get('data');
      if (Array.isArray(data) && data.length > 0) return { slides: data };
      return null;
    }

    if (doc.type === 'spreadsheet') {
      const map = yDoc.getMap('sheet');
      const cols = Math.max(1, Number(map.get('cols')) || 6);
      const rows = Math.max(1, Number(map.get('rows')) || 20);
      const cells: Record<string, string> = {};
      const styles: Record<string, unknown> = {};
      const images: unknown[] = [];
      for (const [key, value] of map.entries()) {
        if (typeof value !== 'string') continue;
        if (key.startsWith('cell:')) {
          cells[key] = value;
        } else if (key.startsWith('fmt:')) {
          const parts = key.split(':');
          const c = Number(parts[1]);
          const r = Number(parts[2]);
          if (!Number.isFinite(c) || !Number.isFinite(r)) continue;
          try {
            styles[`cell:${c}:${r}`] = JSON.parse(value);
          } catch {
            /* skip */
          }
        } else if (key.startsWith('img:')) {
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && parsed.src) images.push(parsed);
          } catch {
            /* skip */
          }
        }
      }
      const hasData = Object.keys(cells).length > 0 || Object.keys(styles).length > 0 || images.length > 0;
      if (!hasData) return null;
      return { cols, rows, cells, styles, images };
    }

    if (doc.type === 'document') {
      const blocks = fragmentToBlocks(yDoc.getXmlFragment('blocknote'));
      if (blocks.length > 0) return blocks;
      return null;
    }
  } catch (err) {
    console.warn('[office] content derivation failed for doc', doc.id, (err as Error)?.message || err);
  }
  return null;
}

function fragmentText(node: any): string {
  if (typeof node?.toString === 'function' && (node instanceof Y.XmlText || typeof node.tagName === 'undefined')) {
    const text = node.toString();
    if (node instanceof Y.XmlText) return text;
    return '';
  }
  if (typeof node?.toArray !== 'function') return '';
  const out: string[] = [];
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) out.push(child.toString());
    else if (typeof child?.toArray === 'function') out.push(fragmentText(child));
  }
  return out.join('');
}

function nodeRichText(node: any): { text: string; marks: Record<string, unknown> }[] {
  const runs: { text: string; marks: Record<string, unknown> }[] = [];
  if (typeof node?.toArray !== 'function') return runs;
  for (const child of node.toArray() || []) {
    if (child instanceof Y.XmlText) {
      const t = child.toString();
      const attrs = child.getAttributes ? child.getAttributes() || {} : {};
      const marks: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(attrs)) {
        const val = v && typeof v === 'object' && 'value' in (v as any) ? (v as any).value : v;
        if (val === true || val === 'true' || val === 1) marks[k] = true;
        else if (typeof val === 'string' && val && val !== 'false') marks[k] = val;
      }
      if (t) runs.push({ text: t, marks });
    } else if (typeof child?.toArray === 'function') {
      runs.push(...nodeRichText(child));
    }
  }
  return runs.length ? runs : [];
}

function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36) + Math.random().toString(36).slice(2, 6);
}

function fragmentToBlocks(frag: any): any[] {
  const blocks: any[] = [];
  const pushText = (text: string, type: string, level?: number) => {
    if (!text.trim()) return;
    blocks.push({
      id: hashText(text),
      type,
      ...(level ? { props: { level } } : {}),
      content: [{ type: 'text', text }],
    });
  };
  const walk = (node: any) => {
    if (typeof node?.toArray !== 'function') return;
    for (const child of node.toArray()) {
      if (!child || typeof child !== 'object') continue;
      if (child instanceof Y.XmlText) {
        pushText(child.toString(), 'paragraph');
        continue;
      }
      if (typeof child?.toArray !== 'function') continue;
      const tag = (child.tagName as string) || '';
      const isBlock = /^(abc|paragraph|heading|bullet|numbered|check|quote|code)/i.test(tag);
      if (isBlock) {
        const runs = nodeRichText(child);
        const text = runs.length ? runs.map((r) => r.text).join('') : fragmentText(child);
        let type = 'paragraph';
        let level: number | undefined;
        const h = /^heading(\d)?$/.exec(tag);
        if (h) {
          type = 'heading';
          level = h[1] ? Number(h[1]) : 1;
        } else if (/^bullet|^check/.test(tag)) type = 'bulletListItem';
        else if (/^numbered/.test(tag)) type = 'numberedListItem';
        else if (/^quote/.test(tag)) type = 'quote';
        else if (/^code/.test(tag)) type = 'codeBlock';

        if (runs.length > 0) {
          blocks.push({
            id: hashText(text),
            type,
            ...(level ? { props: { level } } : {}),
            content: runs,
          });
        } else if (text.trim()) {
          pushText(text, type, level);
        }
      }
      if (child.toArray().length > 0) walk(child);
    }
  };
  walk(frag);
  return blocks;
}

export async function persistDocContent(docId: number, ownerUserId: number, content: unknown): Promise<void> {
  const raw = typeof content === 'string' ? content : JSON.stringify(content ?? null);
  await writeStorageBlob(ownerUserId, officeContentPath(docId), raw);
}

async function persistRoom(room: OfficeRoom): Promise<void> {
  try {
    if (!room.dirty) return;
    const update = Y.encodeStateAsUpdate(room.doc);
    const stateB64 = b64encode(update);
    const repo = AppDataSource.getRepository(OfficeDocument);

    let persistedToStorage = false;
    let storageError: unknown = null;
    try {
      await getOrProvisionStorage(room.ownerUserId);
      const writes: Promise<unknown>[] = [
        writeStorageBlob(room.ownerUserId, storagePath(room.docId, 'state'), stateB64),
      ];
      if (room.awareness) {
        writes.push(writeStorageBlob(room.ownerUserId, storagePath(room.docId, 'awareness'), room.awareness));
      }
      await Promise.all(writes);
      persistedToStorage = true;
    } catch (err) {
      storageError = err;
    }

    if (persistedToStorage) {
      await repo.update(
        { id: room.docId },
        { yjsState: null, awarenessState: room.awareness ? null : undefined }
      );
    } else if (storageError) {
      await repo.update(
        { id: room.docId },
        {
          yjsState: stateB64,
          ...(room.awareness ? { awarenessState: room.awareness } : {}),
        }
      );
    }
    room.dirty = false;
  } catch (err) {
    console.error('[office] persist failed for doc', room.docId, err);
  }
}

function scheduleSave(room: OfficeRoom): void {
  room.dirty = true;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    void persistRoom(room);
  }, SAVE_DEBOUNCE_MS);
}

export async function getOrCreateRoom(doc: OfficeDocument): Promise<OfficeRoom> {
  const existing = rooms.get(doc.id);
  if (existing) return existing;

  const yDoc = new Y.Doc();
  const state = await loadDocYjsState(doc);
  const awareness = await loadDocAwareness(doc);
  if (state) {
    try {
      Y.applyUpdate(yDoc, b64decode(state));
    } catch (err) {
      console.error('[office] failed to load yjs state for doc', doc.id, err);
    }
  }

  const room: OfficeRoom = {
    docId: doc.id,
    ownerUserId: doc.userId,
    doc: yDoc,
    sockets: new Map(),
    saveTimer: null,
    dirty: false,
    awareness,
  };

  yDoc.on('update', () => {
    scheduleSave(room);
  });

  rooms.set(doc.id, room);
  return room;
}

export function getRoom(docId: number): OfficeRoom | undefined {
  return rooms.get(docId);
}

export function joinRoom(room: OfficeRoom, ws: any, userId: number, permission: string): void {
  room.sockets.set(ws, { ws, userId, permission });
}

export function leaveRoom(room: OfficeRoom, ws: any): void {
  room.sockets.delete(ws);
  if (room.sockets.size === 0) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    void persistRoom(room);
    room.saveTimer = setTimeout(() => {
      rooms.delete(room.docId);
    }, 60_000);
  }
}

export function applyIncomingUpdate(room: OfficeRoom, updateB64: string): void {
  try {
    Y.applyUpdate(room.doc, b64decode(updateB64));
  } catch (err) {
    console.error('[office] apply update failed for doc', room.docId, err);
  }
}

export function setRoomAwareness(room: OfficeRoom, awarenessB64: string | null): void {
  room.awareness = awarenessB64;
  room.dirty = true;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    void persistRoom(room);
  }, 3000);
}

export function roomStatePayload(room: OfficeRoom): string {
  return b64encode(Y.encodeStateAsUpdate(room.doc));
}

export async function flushAllRooms(): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  for (const room of rooms.values()) {
    if (room.dirty) tasks.push(persistRoom(room));
  }
  await Promise.allSettled(tasks);
}