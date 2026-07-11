'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import { API_ENDPOINTS } from '@/lib/panel-config'
import {
  WingsSocket,
  type SocketError,
  type SocketState,
  SocketErrorType,
  SocketState as State,
} from '@/lib/websocket'

export interface TransferProgress {
  archive_bytes_processed: number
  network_bytes_processed: number
  bytes_total: number
  files_processed: number
}

export interface ServerWebsocketState {
  ws: WingsSocket
  connected: boolean
  connectionState: string
  installing: boolean
  socketError: SocketError | null
  reconnect: () => void
  sendCommand: (cmd: string) => void
  resources: ServerResources | null
  transferring: boolean
  transferProgress: TransferProgress | null
  transferLogs: string[]
}

export interface ServerResources {
  cpu_absolute?: number
  memory_bytes?: number
  memory_limit_bytes?: number
  disk_bytes?: number
  disk_limit_bytes?: number
}

export function useServerWebsocket(serverId: string): ServerWebsocketState {
  const wsRef = useRef<WingsSocket | null>(null)
  const intentionallyClosedRef = useRef(false)
  const tokenRefreshFailuresRef = useRef(0)

  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState('disconnected')
  const [installing, setInstalling] = useState(false)
  const [socketError, setSocketError] = useState<SocketError | null>(null)
  const [resources, setResources] = useState<ServerResources | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null)
  const [transferLogs, setTransferLogs] = useState<string[]>([])

  const getWs = useCallback((): WingsSocket => {
    if (!wsRef.current) {
      wsRef.current = new WingsSocket()
    }
    return wsRef.current
  }, [])

  const connect = useCallback(async () => {
    if (intentionallyClosedRef.current) return

    const ws = getWs()

    if (ws.getState() === State.CONNECTED || ws.getState() === State.CONNECTING) return

    setConnectionState('connecting')

    try {
      const creds = await apiFetch(API_ENDPOINTS.serverWebsocket.replace(':id', serverId))
      const url = creds?.data?.socket
      const token = creds?.data?.token
      const directUrl = creds?.data?.direct_socket
      const directToken = creds?.data?.token

      if (!url) {
        setConnectionState('disconnected')
        return
      }

      if (directUrl && directToken) {
        ws.setToken(directToken)
        ws.connect(directUrl)
      } else {
        ws.setToken(token)
        ws.connect(url)
      }
    } catch {
      setConnectionState('disconnected')
    }
  }, [serverId, getWs])

  useEffect(() => {
    const ws = getWs()

    const onOpen = () => {
      setConnected(true)
      setConnectionState('connected')
      setSocketError(null)
      tokenRefreshFailuresRef.current = 0
      // Don't send logs/stats here — auth hasn't completed yet.
      // Wings ignores commands before auth success.
    }

    const onClose = () => {
      setConnected(false)
    }

    const onErrorState = (err: SocketError) => {
      setSocketError(err)
      if (err.type === SocketErrorType.PERMISSION_DENIED) {
        setConnected(false)
        setConnectionState('disconnected')
      }
    }

    const onErrorClear = () => {
      setSocketError(null)
    }

    const onAuthSuccess = () => {
      setConnected(true)
      setConnectionState('connected')
      tokenRefreshFailuresRef.current = 0

      ws.send('send logs', [])
      ws.send('send stats', [])
    }

    const onTokenExpiring = async () => {
      try {
        const creds = await apiFetch(API_ENDPOINTS.serverWebsocket.replace(':id', serverId))
        if (creds?.data?.token) {
          ws.setToken(creds.data.token, true)
          tokenRefreshFailuresRef.current = 0
        }
      } catch {
        tokenRefreshFailuresRef.current++
        if (tokenRefreshFailuresRef.current >= 3) {
          setSocketError({
            type: SocketErrorType.AUTH_FAILED,
            message: 'tokenRefreshLoop',
            recoverable: false,
            reconnectAttempt: 0,
            nextRetryMs: 0,
          })
        }
      }
    }

    const onTokenExpired = () => {
      tokenRefreshFailuresRef.current++
    }

    const onStatus = (args: unknown[]) => {
      const status = String(args?.[0] ?? '').toLowerCase()

      setConnectionState(status)

      if (status === 'running' || status === 'connected' || status === 'online') {
        setInstalling(false)
        setConnected(true)
      } else if (status === 'installing') {
        setInstalling(true)
        setConnected(true)
      } else if (status === 'starting' || status === 'connecting') {
        setConnected(false)
      } else if (status === 'offline' || status === 'stopped') {
        if (installing) {
          setConnectionState('installing')
        } else {
          setConnected(false)
        }
      }
    }

    const onInstallStarted = () => {
      setInstalling(true)
    }

    const onInstallCompleted = (args: unknown[]) => {
      setInstalling(false)
      const successful = String(args?.[0] ?? '') === 'true'
      if (!successful) {
        setConnectionState('install_failed')
      }
    }

    const onInstallOutput = () => {
      setInstalling(true)
    }

    const onStats = (args: unknown[]) => {
      const stats = (args?.[0] ?? {}) as Record<string, unknown>
      setResources({
        cpu_absolute: stats.cpu_absolute != null ? Number(stats.cpu_absolute) : undefined,
        memory_bytes: stats.memory_bytes != null ? Number(stats.memory_bytes) : undefined,
        memory_limit_bytes: stats.memory_limit_bytes != null ? Number(stats.memory_limit_bytes) : undefined,
        disk_bytes: stats.disk_bytes != null ? Number(stats.disk_bytes) : undefined,
        disk_limit_bytes: stats.disk_limit_bytes != null ? Number(stats.disk_limit_bytes) : undefined,
      })
    }

    const onDaemonError = (args: unknown[]) => {
      const msg = args?.join(' ') ?? 'Daemon error'
      setSocketError({
        type: SocketErrorType.DAEMON_ERROR,
        message: String(msg),
        recoverable: true,
        reconnectAttempt: 0,
        nextRetryMs: 0,
      })
    }

    ws.on('SOCKET_OPEN', onOpen)
    ws.on('SOCKET_CLOSE', onClose)
    ws.on('SOCKET_ERROR_STATE', onErrorState)
    ws.on('SOCKET_ERROR_CLEAR', onErrorClear)
    ws.on('auth success', onAuthSuccess)
    ws.on('token expiring', onTokenExpiring)
    ws.on('token expired', onTokenExpired)
    ws.on('status', onStatus)
    ws.on('install started', onInstallStarted)
    ws.on('install completed', onInstallCompleted)
    ws.on('install output', onInstallOutput)
    ws.on('stats', onStats)
    ws.on('daemon error', onDaemonError)
    
    ws.on('transfer status', (args: unknown[]) => {
      const status = String(args?.[0] ?? '')
      if (status === 'processing') {
        setTransferring(true)
      } else if (status === 'completed') {
        setTransferring(false)
        setTransferProgress(null)
      } else if (status === 'failure') {
        setTransferring(false)
        setTransferProgress(null)
      }
    })

    ws.on('transfer progress', (args: unknown[]) => {
      const p = (args?.[0] ?? {}) as Record<string, unknown>
      setTransferring(true)
      setTransferProgress({
        archive_bytes_processed: Number(p.archive_bytes_processed ?? 0),
        network_bytes_processed: Number(p.network_bytes_processed ?? 0),
        bytes_total: Number(p.bytes_total ?? 0),
        files_processed: Number(p.files_processed ?? 0),
      })
    })

    ws.on('transfer logs', (args: unknown[]) => {
      const msg = String(args?.[0] ?? '')
      if (msg) {
        setTransferLogs(prev => [...prev.slice(-100), msg])
      }
    })

    // Defer connect() so child components (ConsoleTab) have time to
    // register their own ws.on(...) handlers before the WebSocket
    // handshake completes.  Otherwise console output events arrive
    // during the auth window and are dropped.
    const id = setTimeout(() => connect(), 0)

    return () => {
      clearTimeout(id)
      intentionallyClosedRef.current = true
      ws.close()
      wsRef.current = null
    }
  }, [serverId, getWs, connect]) // eslint-disable-line react-hooks/exhaustive-deps

  const reconnect = useCallback(() => {
    const ws = getWs()
    intentionallyClosedRef.current = false
    tokenRefreshFailuresRef.current = 0
    ws.close()
    wsRef.current = new WingsSocket()

    setTimeout(() => {
      connect()
    }, 200)
  }, [getWs, connect])

  const sendCommand = useCallback(
    (cmd: string) => {
      const ws = getWs()
      if (ws.isConnected()) {
        ws.send('send command', [cmd])
      } else {
        apiFetch(API_ENDPOINTS.serverCommands.replace(':id', serverId), {
          method: 'POST',
          body: JSON.stringify({ command: cmd }),
        }).catch(() => {})
      }
    },
    [serverId, getWs],
  )

  return {
    ws: getWs(),
    connected,
    connectionState,
    installing,
    socketError,
    reconnect,
    sendCommand,
    resources,
    transferring,
    transferProgress,
    transferLogs,
  }
}