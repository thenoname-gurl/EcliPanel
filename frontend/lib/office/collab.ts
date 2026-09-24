import * as Y from "yjs"
import * as awarenessProtocol from "y-protocols/awareness"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiWsUrl } from "@/lib/ws-url"
import type { OfficeEditorStatus, OfficePermission } from "./types"

function b64ToBytes(b64: string): Uint8Array {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return new Uint8Array()
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

type Listener = (...args: any[]) => void

export function mapSet<T>(map: Y.Map<T>, key: string, value: T, origin?: string): T {
  return (map.set as (key: string, value: T, origin?: unknown) => T)(key, value, origin)
}

export function mapDelete<T>(map: Y.Map<T>, key: string, origin?: string): void {
  ;(map.delete as (key: string, origin?: unknown) => void)(key, origin)
}

export class OfficeProvider {
  readonly doc: Y.Doc
  readonly awareness: awarenessProtocol.Awareness

  private docId: number
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private connected = false
  private synced = false
  private applyingSync = false
  private lastAwarenessSent = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private intentionallyClosed = false
  private user: { name: string; color: string }
  private permission: OfficePermission | null = null

  constructor(docId: number, config: { user: { name: string; color: string } }) {
    this.docId = docId
    this.user = config.user
    this.doc = new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.doc)

    this.awareness.setLocalState({
      user: { ...config.user },
    })

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "office:remote") return
      if (this.applyingSync) return
      this.sendUpdate(update)
    })

    this.awareness.on("update", ({ added, updated, removed }: any, origin: unknown) => {
      if (origin !== "local") return
      const changed = (added as number[]).concat(updated as number[]).concat(removed as number[])
      if (!this.connected) return
      const now = Date.now()
      if (changed.length === 0 && now - this.lastAwarenessSent < 20) return
      try {
        const encoded = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed.length ? changed : [this.awareness.clientID])
        this.lastAwarenessSent = now
        if (encoded.byteLength > 0) {
          this.send({ type: "awareness", docId: this.docId, awareness: bytesToB64(encoded) })
        }
      } catch {
        /* malformed awareness frames */
      }
    })

    this.awareness.on("change", () => {
      this.emit("awareness", this.awareness.getStates())
    })
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return this
  }

  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn)
    return this
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch {
        /* bewh */
      }
    })
  }

  private setStatus(status: OfficeEditorStatus) {
    this.emit("status", status)
  }

  getPermission(): OfficePermission | null {
    return this.permission
  }

  isConnected(): boolean {
    return this.connected
  }

  isSynced(): boolean {
    return this.synced
  }

  connect() {
    if (this.ws || this.reconnectTimer) return
    this.intentionallyClosed = false
    this.setStatus("connecting")
    try {
      this.openSocket()
    } catch {
      this.scheduleReconnect()
    }
    this.startPing()
  }

  private startPing() {
    if (this.pingTimer) return
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" })
    }, 25000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  disconnect() {
    this.intentionallyClosed = true
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "unsubscribe", docId: this.docId }))
      } catch {
        /* ignore */
      }
      try {
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.connected = false
    this.synced = false
    this.setStatus("disconnected")
    try {
      this.awareness.setLocalState(null)
    } catch {
      /* ignore */
    }
  }

  destroy() {
    this.disconnect()
    try {
      this.awareness.destroy()
    } catch {
      /* ignore */
    }
    try {
      this.doc.destroy()
    } catch {
      /* ignore */
    }
    this.listeners.clear()
  }

  private openSocket() {
    const ws = new WebSocket(apiWsUrl(API_ENDPOINTS.officeWs))
    this.ws = ws
    this.setStatus("connecting")

    ws.onopen = () => {
      this.connected = true
      this.setStatus("connected")
      this.send({ type: "subscribe", docId: this.docId })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(typeof event.data === "string" ? event.data : "")
        if (data.docId && Number(data.docId) !== this.docId) return

        if (data.type === "sync") {
          this.handleSync(data)
        } else if (data.type === "update") {
          const bytes = b64ToBytes(String(data.update || ""))
          if (bytes.byteLength === 0) return
          this.applyingSync = true
          try {
            Y.applyUpdate(this.doc, bytes, "office:remote")
          } finally {
            this.applyingSync = false
          }
        } else if (data.type === "awareness") {
          const bytes = b64ToBytes(String(data.awareness || ""))
          if (bytes.byteLength === 0) return
          try {
            awarenessProtocol.applyAwarenessUpdate(this.awareness, bytes, "office:remote")
          } catch {
            /* ignore malformed awareness */
          }
        } else if (data.type === "error") {
          this.emit("error", data)
        }
      } catch {
        /* ignore non-JSON / unexpected frames */
      }
    }

    ws.onclose = () => {
      this.connected = false
      this.synced = false
      this.ws = null
      this.setStatus("disconnected")
      if (!this.intentionallyClosed) {
        this.emit("network", { lost: true })
        this.scheduleReconnect()
      }
    }

    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  private handleSync(data: any) {
    if (this.synced) return
    this.permission = data.permission as OfficePermission
    const bytes = b64ToBytes(String(data.state || ""))
    this.applyingSync = true
    try {
      if (bytes.byteLength > 0) Y.applyUpdate(this.doc, bytes, "office:remote")
    } finally {
      this.applyingSync = false
    }
    try {
      const sv = Y.encodeStateVectorFromUpdate(bytes)
      const diff = Y.encodeStateAsUpdate(this.doc, sv)
      if (diff.byteLength > 0) this.sendUpdate(diff)
    } catch {
      /* the inmem doc is still authoritative locally */
    }
    if (data.awareness != null) {
      const aBytes = b64ToBytes(String(data.awareness))
      if (aBytes.byteLength > 0) {
        try {
          awarenessProtocol.applyAwarenessUpdate(this.awareness, aBytes, "office:remote")
        } catch {
          /* ignore */
        }
      }
      this.awareness.setLocalState({ user: { ...this.user } })
    }
    this.synced = true
    this.setStatus("synced")
    this.emit("sync", { docId: this.docId, permission: this.permission })
  }

  private sendUpdate(update: Uint8Array) {
    if (!this.connected) return
    if (update.byteLength === 0) return
    this.send({ type: "update", docId: this.docId, update: bytesToB64(update) })
  }

  private send(payload: object) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed) return
    if (this.reconnectTimer) return
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000) * (0.75 + Math.random() * 0.5)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.intentionallyClosed) return
      this.setStatus("connecting")
      try {
        this.openSocket()
      } catch {
        this.scheduleReconnect()
      }
    }, delay)
  }

  private clearAwareness() {}
}