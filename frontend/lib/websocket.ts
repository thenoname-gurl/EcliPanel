type Listener = (...args: any[]) => void

class Emitter {
  private _ls = new Map<string, Set<Listener>>()

  on(e: string, fn: Listener): this {
    if (!this._ls.has(e)) this._ls.set(e, new Set())
    this._ls.get(e)!.add(fn)
    return this
  }

  off(e: string, fn: Listener): this {
    this._ls.get(e)?.delete(fn)
    return this
  }

  emit(e: string, ...args: any[]): boolean {
    const fns = this._ls.get(e)
    if (!fns?.size) return false
    for (const fn of fns) fn(...args)
    return true
  }

  removeAll(): this {
    this._ls.clear()
    return this
  }
}

export const SocketState = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  CLOSED: 'CLOSED',
} as const
export type SocketState = (typeof SocketState)[keyof typeof SocketState]

export const SocketErrorType = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_LOST: 'CONNECTION_LOST',
  AUTH_FAILED: 'AUTH_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DAEMON_ERROR: 'DAEMON_ERROR',
} as const
export type SocketErrorType = (typeof SocketErrorType)[keyof typeof SocketErrorType]

export interface SocketError {
  type: SocketErrorType
  message: string
  recoverable: boolean
  reconnectAttempt: number
  nextRetryMs: number
  closeCode?: number
  closeReason?: string
}

const MIN_BACKOFF = 1000
const MAX_BACKOFF = 30_000

export class WingsSocket extends Emitter {
  private socket: WebSocket | null = null
  private url: string | null = null
  private token = ''
  private state: SocketState = SocketState.CLOSED
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private intentionallyClosed = false
  private hadSuccessfulConnection = false
  private nextRetryMs = 0

  getState(): SocketState {
    return this.state
  }

  isConnected(): boolean {
    return this.state === SocketState.CONNECTED && this.socket?.readyState === WebSocket.OPEN
  }

  connect(url: string) {
    if (this.state === SocketState.CONNECTED || this.state === SocketState.CONNECTING) return
    this.intentionallyClosed = false
    this.url = url
    this.createSocket()
  }

  setToken(token: string, isUpdate = false) {
    this.token = token
    if (isUpdate && this.state === SocketState.CONNECTED) {
      this.auth()
    }
  }

  close(code?: number, reason?: string) {
    this.intentionallyClosed = true
    this.clearTimer()
    this.reconnectAttempts = 0
    this.hadSuccessfulConnection = false
    this.destroy(code, reason)
    this.state = SocketState.CLOSED
    this.emit('SOCKET_CLOSE')
  }

  send(event: string, payload?: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    try {
      const args = payload != null ? (Array.isArray(payload) ? payload : [payload]) : []
      this.socket.send(JSON.stringify({ event, args }))
    } catch (err) {
      console.warn('[WingsSocket] send error:', err)
    }
  }

  private auth() {
    if (this.token && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'auth', args: [this.token] }))
    }
  }

  private createSocket() {
    this.destroy()

    if (!this.url) return

    this.state = this.hadSuccessfulConnection
      ? SocketState.RECONNECTING
      : SocketState.CONNECTING

    try {
      this.socket = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0
      this.hadSuccessfulConnection = true
      this.clearTimer()
      this.state = SocketState.CONNECTED
      this.emit('SOCKET_ERROR_CLEAR')
      this.emit('SOCKET_OPEN')
      this.auth()
    }

    this.socket.onmessage = (e) => {
      this.emit('SOCKET_MESSAGE', e)
      try {
        if (typeof e.data !== 'string') return
        const { event, args } = JSON.parse(e.data)
        if (event) this.emit(event, args ?? [])
      } catch { /* ermmm */ }
    }

    this.socket.onclose = (e) => {
      this.state = SocketState.CLOSED
      this.emit('SOCKET_CLOSE', e)

      if (this.intentionallyClosed) return

      if (e.reason === 'permission revoked') {
        this.emitErr({
          type: SocketErrorType.PERMISSION_DENIED,
          message: e.reason,
          recoverable: false,
          closeCode: e.code,
          closeReason: e.reason,
        })
        return
      }

      if (this.hadSuccessfulConnection) {
        this.emit('SOCKET_RECONNECT')
      }

      this.scheduleReconnect()
      this.emitErr({
        type: this.hadSuccessfulConnection
          ? SocketErrorType.CONNECTION_LOST
          : SocketErrorType.CONNECTION_FAILED,
        message: e.reason || `closed (code ${e.code})`,
        recoverable: true,
        closeCode: e.code,
        closeReason: e.reason,
      })
    }

    this.socket.onerror = () => {
      this.emit('SOCKET_ERROR')
    }
  }

  private destroy(code?: number, reason?: string) {
    if (!this.socket) return
    this.socket.onopen = null
    this.socket.onmessage = null
    this.socket.onclose = null
    this.socket.onerror = null
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      try { this.socket.close(code, reason) } catch { /* buh */ }
    }
    this.socket = null
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed || !this.url) return
    this.clearTimer()

    const delay = Math.round(
      Math.min(MIN_BACKOFF * Math.pow(2, this.reconnectAttempts), MAX_BACKOFF) *
        (0.75 + Math.random() * 0.5)
    )

    this.reconnectAttempts++
    this.nextRetryMs = delay
    this.state = SocketState.RECONNECTING

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.createSocket()
    }, delay)
  }

  private clearTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private emitErr(fields: {
    type: SocketErrorType
    message: string
    recoverable: boolean
    closeCode?: number
    closeReason?: string
  }) {
    this.emit('SOCKET_ERROR_STATE', {
      type: fields.type,
      message: fields.message,
      recoverable: fields.recoverable,
      reconnectAttempt: this.reconnectAttempts,
      nextRetryMs: this.nextRetryMs,
      closeCode: fields.closeCode,
      closeReason: fields.closeReason,
    } satisfies SocketError)
  }
}