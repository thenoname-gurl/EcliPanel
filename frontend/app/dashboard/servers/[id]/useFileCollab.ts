'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { WingsSocket } from '@/lib/websocket';
import { SocketEvent, SocketRequest } from '@/lib/websocket';
import { useServerWebsocket } from './useServerWebsocket';

const LOG = '[file-collab]';
const UPDATE_CHUNK = 16 * 1024;
const COLORS = ['#e03131','#c2255c','#9c36b5','#3b5bdb','#1971c2','#099268','#e8590c','#f08c00'];

function b64enc(d: Uint8Array) { let s=''; for(let i=0;i<d.length;i++) s+=String.fromCharCode(d[i]); return btoa(s); }
function b64dec(d: string) { const b=atob(d), u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function normPath(p: string) { return p.replace(/^\/+/,''); }
function clr(seed: number) { return COLORS[Math.abs(seed) % COLORS.length]; }

function cursorStyles(el: HTMLStyleElement, a: Awareness) {
  const r: string[] = [];
  a.getStates().forEach((st, id) => {
    if (id === a.clientID) return;
    const u = st.user as { name?: string; color?: string; avatar?: string | null } | undefined;
    const c = u?.color ?? clr(id);
    const n = (u?.name ?? '').replace(/["\\]/g,'');
    const av = u?.avatar;

    if (av) {
      r.push(
        `.yRemoteSelection-${id}{background-color:${c}44}`,
        `.yRemoteSelectionHead-${id}{position:absolute;border-left:2px solid ${c};height:100%}`,
        `.yRemoteSelectionHead-${id}::after{content:"${n}";position:absolute;top:-1.2em;left:-2px;background-color:${c};color:#fff;font-size:10px;line-height:16px;padding:0 6px 0 18px;border-radius:0 2px 2px 0;white-space:nowrap;pointer-events:none;background-image:url('${av.replace(/'/g,"\\'")}');background-size:14px 14px;background-repeat:no-repeat;background-position:2px center}`,
      );
    } else {
      r.push(
        `.yRemoteSelection-${id}{background-color:${c}44}`,
        `.yRemoteSelectionHead-${id}{position:absolute;border-left:2px solid ${c};height:100%}`,
        `.yRemoteSelectionHead-${id}::after{content:"${n}";position:absolute;top:-1.2em;left:-2px;background-color:${c};color:#fff;font-size:10px;line-height:16px;padding:0 5px;border-radius:0 2px 2px 0;white-space:nowrap;pointer-events:none}`,
      );
    }
  });
  el.textContent = r.join('\n');
}

export interface CollabParticipant { user: string; name: string; avatar: string | null; }
export interface CollabSavedPayload { user: string; revisionId: number | null; }

interface UseFileCollabOptions {
  enabled: boolean;
  filePath: string;
  serverId: string;
  userName?: string;
  userAvatar?: string | null;
  onActivated: (dirty: boolean) => void;
  onSaved: (payload: CollabSavedPayload) => void;
  onError: (message: string) => void;
}

export default function useFileCollab({ enabled, filePath, serverId, userName, userAvatar, onActivated, onSaved, onError }: UseFileCollabOptions) {
  const { ws } = useServerWebsocket(serverId);
  const [active, setActive] = useState(false);
  const [participants, setParticipants] = useState<CollabParticipant[]>([]);
  const [, setEditorState] = useState<Parameters<OnMount>[0] | null>(null);

  const socketRef = useRef<WingsSocket | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const pathRef = useRef('');
  const subscribedRef = useRef(false);
  const cbRef = useRef({ onActivated, onSaved, onError });
  cbRef.current = { onActivated, onSaved, onError };

  useEffect(() => { socketRef.current = ws; }, [!!ws]);
  useEffect(() => { pathRef.current = filePath; }, [filePath]);

  const destroySession = useCallback(() => {
    console.log(LOG, 'destroySession');
    bindingRef.current?.destroy(); bindingRef.current = null;
    awarenessRef.current?.destroy(); awarenessRef.current = null;
    docRef.current?.destroy(); docRef.current = null;
    if (styleRef.current) { styleRef.current.remove(); styleRef.current = null; }
    setActive(false); setParticipants([]);
    subscribedRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) { console.log(LOG, 'disabled'); return; }

    let stopped = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let syncReceived = false;

    const start = () => {
      const s = socketRef.current;
      if (!s || !s.isConnected()) { console.log(LOG, 'waiting for socket...'); return; }

      const editor = editorRef.current;
      const fp = pathRef.current;
      if (!editor || !fp) { console.log(LOG, 'waiting for editor/file...'); return; }

      if (poll) { clearInterval(poll); poll = null; }
      if (syncReceived) return;

      const model = editor.getModel();
      if (!model) return;

      const path = fp;
      console.log(LOG, 'subscribing for', path);

      const sendUpdate = (update: Uint8Array) => {
        const enc = b64enc(update);
        console.log(LOG, 'update', enc.length, 'bytes');
        for (let i = 0; i < enc.length; i += UPDATE_CHUNK) {
          const done = i + UPDATE_CHUNK >= enc.length;
          s.send(SocketRequest.FILE_COLLAB_UPDATE, [path, done ? '1' : '0', enc.slice(i, i + UPDATE_CHUNK)]);
        }
      };

      const onSync = (syncPath: string, state: string, meta?: string) => {
        if (normPath(syncPath) !== normPath(path)) return;
        console.log(LOG, 'FILE_COLLAB_SYNC', state?.length, 'bytes');
        syncReceived = true;

        const curEditor = editorRef.current;
        const curModel = curEditor?.getModel();
        if (!curModel) return;

        destroySession();

        const doc = new Y.Doc();
        Y.applyUpdate(doc, b64dec(state), 'remote');
        console.log(LOG, 'doc created, clientID:', doc.clientID);

        const awareness = new Awareness(doc);
        awareness.setLocalStateField('user', { name: userName ?? 'unknown', color: clr(doc.clientID), avatar: userAvatar ?? null });

        const styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
        awareness.on('change', () => cursorStyles(styleEl, awareness));
        awareness.on('update', ({ added, updated, removed }, origin) => {
          if (origin === 'remote') return;
          const changed = added.concat(updated, removed);
          s.send(SocketRequest.FILE_COLLAB_AWARENESS, [path, b64enc(encodeAwarenessUpdate(awareness, changed))]);
        });

        doc.on('update', (update, origin) => {
          if (origin === 'remote') return;
          console.log(LOG, 'local change', update.byteLength, 'bytes');
          sendUpdate(update);
        });

        const text = doc.getText('content');
        bindingRef.current = new MonacoBinding(text, curModel, new Set([curEditor]), awareness);
        docRef.current = doc;
        awarenessRef.current = awareness;
        styleRef.current = styleEl;
        setActive(true);
        console.log(LOG, 'ACTIVE');

        let dirty = false;
        try { dirty = Boolean(JSON.parse(meta ?? '{}').dirty); } catch {}
        cbRef.current.onActivated(dirty);

        s.send(SocketRequest.FILE_COLLAB_AWARENESS, [path, b64enc(encodeAwarenessUpdate(awareness, [doc.clientID]))]);
      };

      const onUpdate = (p: string, update: string) => {
        if (normPath(p) !== normPath(path) || !docRef.current) return;
        console.log(LOG, 'update', update?.length, 'bytes');
        Y.applyUpdate(docRef.current, b64dec(update), 'remote');
      };

      const onAwareness = (p: string, update: string) => {
        if (normPath(p) !== normPath(path) || !awarenessRef.current) return;
        console.log(LOG, 'awareness', update?.length, 'bytes');
        applyAwarenessUpdate(awarenessRef.current, b64dec(update), 'remote');
      };

      const onParticipants = (p: string, data: string) => {
        if (normPath(p) !== normPath(path)) return;
        console.log(LOG, 'participants:', data);
        let list: CollabParticipant[] = [];
        try { list = JSON.parse(data); } catch { return; }
        setParticipants(list);

        const a = awarenessRef.current;
        const el = styleRef.current;
        if (a && el) {
          const activeIds = new Set(list.map(x => x.user));
          const avMap = new Map(list.map(x => [x.name, x.avatar]));
          a.getStates().forEach((st, clientId) => {
            if (clientId !== a.clientID) {
              const u = st.user as { name?: string; avatar?: string | null } | undefined;
              if (u?.name && !activeIds.has(u.name)) {
                console.log(LOG, 'removing stale awareness for', u.name);
                (a.states as Map<number, any>).delete(clientId);
              } else if (u?.name && avMap.has(u.name)) {
                const av = avMap.get(u.name);
                if (av && (st as any).user) (st as any).user.avatar = av;
              }
            }
          });
          cursorStyles(el, a);
        }
      };

      const onSavedEvent = (p: string, data: string) => {
        if (normPath(p) !== normPath(path)) return;
        console.log(LOG, 'saved:', data);
        try {
          const pl = JSON.parse(data);
          cbRef.current.onSaved({ user: pl.user, revisionId: pl.revision_id ?? null });
        } catch {}
      };

      const onErrorEvent = (p: string, message: string) => {
        console.warn(LOG, 'error:', { path: p, message });
        if (normPath(p) !== normPath(path)) return;
        const wasActive = !!docRef.current;
        destroySession();
        if (message === 'resync' || wasActive) {
          s.send(SocketRequest.FILE_COLLAB_SUBSCRIBE, path);
          if (message !== 'resync') cbRef.current.onError(message);
        } else {
          cbRef.current.onError(message);
        }
      };

      console.log(LOG, 'registering listeners');
      s.on(SocketEvent.FILE_COLLAB_SYNC, onSync);
      s.on(SocketEvent.FILE_COLLAB_UPDATE, onUpdate);
      s.on(SocketEvent.FILE_COLLAB_AWARENESS, onAwareness);
      s.on(SocketEvent.FILE_COLLAB_PARTICIPANTS, onParticipants);
      s.on(SocketEvent.FILE_COLLAB_SAVED, onSavedEvent);
      s.on(SocketEvent.FILE_COLLAB_ERROR, onErrorEvent);

      subscribedRef.current = true;
      console.log(LOG, 'FILE_COLLAB_SUBSCRIBE', path);
      s.send(SocketRequest.FILE_COLLAB_SUBSCRIBE, path);
    };

    poll = setInterval(() => {
      if (stopped) { if (poll) clearInterval(poll); return; }
      if (syncReceived) { if (poll) clearInterval(poll); return; }
      start();
    }, 200);

    return () => {
      console.log(LOG, 'cleanup — unsubscribing');
      stopped = true;
      if (poll) clearInterval(poll);
      const s = socketRef.current;
      if (s && subscribedRef.current) {
        s.send(SocketRequest.FILE_COLLAB_UNSUBSCRIBE, pathRef.current);
        s.off(SocketEvent.FILE_COLLAB_SYNC);
        s.off(SocketEvent.FILE_COLLAB_UPDATE);
        s.off(SocketEvent.FILE_COLLAB_AWARENESS);
        s.off(SocketEvent.FILE_COLLAB_PARTICIPANTS);
        s.off(SocketEvent.FILE_COLLAB_SAVED);
        s.off(SocketEvent.FILE_COLLAB_ERROR);
        subscribedRef.current = false;
      }
      destroySession();
    };
  }, [enabled, !!ws]);

  const save = useCallback(() => {
    const s = socketRef.current;
    if (!s || !subscribedRef.current) return false;
    console.log(LOG, 'FILE_COLLAB_SAVE', pathRef.current);
    s.send(SocketRequest.FILE_COLLAB_SAVE, pathRef.current);
    return true;
  }, []);

  const attachEditor = useCallback((e: Parameters<OnMount>[0] | null) => {
    console.log(LOG, 'attachEditor called, has editor:', !!e);
    editorRef.current = e;
  }, []);

  return { active, participants, save, attachEditor };
}