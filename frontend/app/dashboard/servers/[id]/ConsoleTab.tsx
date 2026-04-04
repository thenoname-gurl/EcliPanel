"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Send,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  Wifi,
  WifiOff,
  X,
  History,
  ChevronRight
} from "lucide-react"

interface ConsoleTabProps {
  serverId: string
}

interface StatusBadgeProps {
  connected: boolean
  connectionState: string
  t: any
}

function StatusBadge({ connected, connectionState, t }: StatusBadgeProps) {
  const state = connectionState?.toLowerCase() || ""
  
  const getStatusConfig = () => {
    if (connected || state === "running" || state === "connected") {
      return {
        icon: <Wifi className="h-3 w-3" />,
        label: t("status.connected"),
        className: "border-green-500/50 text-green-400 bg-black/60"
      }
    }
    if (state === "connecting" || state === "starting") {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: state.charAt(0).toUpperCase() + state.slice(1),
        className: "border-yellow-500/50 text-yellow-400 bg-black/60"
      }
    }
    if (state === "stopping") {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: t("status.stopping"),
        className: "border-orange-500/50 text-orange-400 bg-black/60"
      }
    }
    return {
      icon: <WifiOff className="h-3 w-3" />,
      label: state ? state.charAt(0).toUpperCase() + state.slice(1) : t("status.disconnected"),
      className: "border-red-500/50 text-red-400 bg-black/60"
    }
  }

  const config = getStatusConfig()

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] backdrop-blur-sm gap-1.5 px-2 py-0.5 font-medium",
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </Badge>
  )
}

interface HistoryPanelProps {
  history: string[]
  onSelect: (cmd: string) => void
  onClose: () => void
  t: any
}

function HistoryPanel({ history, onSelect, onClose, t }: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 p-4 rounded-md border border-border bg-background shadow-xl text-center">
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
        <button
          onClick={onClose}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {t("actions.close")}
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 rounded-md border border-border bg-background shadow-xl max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-secondary/50">
        <span className="text-xs font-medium text-muted-foreground">{t("history.recent")}</span>
        <button 
          onClick={onClose} 
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="p-1">
        {history.slice(0, 20).map((cmd, i) => (
          <button
            key={i}
            onClick={() => { onSelect(cmd); onClose() }}
            className="w-full text-left px-3 py-2 text-sm font-mono truncate text-foreground hover:bg-secondary/20 rounded transition-colors flex items-center gap-2"
          >
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{cmd}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface MobileInputProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onHistoryToggle: () => void
  historyOpen: boolean
  disabled: boolean
  t: any
}

function MobileCommandInput({
  value, onChange, onSend, onHistoryToggle, historyOpen, disabled, t
}: MobileInputProps) {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-2.5">
      <button
        onClick={onHistoryToggle}
        className={cn(
          "flex items-center justify-center rounded-md p-2 transition-colors flex-shrink-0",
          historyOpen 
            ? "bg-primary text-primary-foreground" 
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        )}
      >
        <History className="h-4 w-4" />
      </button>
      
      <div className="flex-1 flex items-center gap-2 rounded-md border border-border bg-input px-3 py-1.5">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("input.placeholder")}
          disabled={disabled}
          className="flex-1 bg-transparent py-1 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onSend()
            }
          }}
        />
      </div>
      
      <button
        onClick={onSend}
        disabled={!value.trim() || disabled}
        className={cn(
          "flex items-center justify-center rounded-md p-2 transition-colors flex-shrink-0",
          value.trim() && !disabled
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-secondary text-muted-foreground"
        )}
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToolbarProps {
  connected: boolean
  connectionState: string
  isFullscreen: boolean
  onFullscreenToggle: () => void
  onClear: () => void
  onReconnect: () => void
  onCopy: () => void
  copied: boolean
  reconnecting: boolean
  t: any
}

function ConsoleToolbar({
  connected, connectionState, isFullscreen, onFullscreenToggle,
  onClear, onReconnect, onCopy, copied, reconnecting, t
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground hidden sm:inline">{t("toolbar.console")}</span>
        <StatusBadge connected={connected} connectionState={connectionState} t={t} />
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={t("toolbar.copyOutput")}
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          <span className="hidden sm:inline">{copied ? t("actions.copied") : t("actions.copy")}</span>
        </button>
        
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={t("toolbar.clearConsole")}
        >
          <Trash2 className="h-3 w-3" />
          <span className="hidden sm:inline">{t("actions.clear")}</span>
        </button>
        
        <button
          onClick={onReconnect}
          disabled={reconnecting}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          title={t("actions.reconnect")}
        >
          <RefreshCw className={cn("h-3 w-3", reconnecting && "animate-spin")} />
        </button>
        
        <button
          onClick={onFullscreenToggle}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={isFullscreen ? t("actions.exitFullscreen") : t("actions.fullscreen")}
        >
          {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}

function fixCorruptedAnsiCodes(text: string): string {
  if (!text) return ''
  
  const hasProperEsc = /\x1b\[/.test(text)
  const brokenSgrPattern = /(?<!\x1b\[)(?<![0-9;])([0-9]{1,3}(?:;[0-9]{1,3})*)m/g
  const brokenSgrMatches = text.match(brokenSgrPattern) || []
  const hasBrokenDec = /(?<!\x1b\[)\?[0-9]+[hlsr]/i.test(text)
  const hasBrokenCursor = /(?<!\x1b\[)(?<![0-9])[0-9]{1,3}[ABCDEFGHJKST](?![a-z])/i.test(text)
  
  if (hasProperEsc && brokenSgrMatches.length < 3 && !hasBrokenDec && !hasBrokenCursor) {
    return text
  }
  
  if (brokenSgrMatches.length < 3 && !hasBrokenDec && !hasBrokenCursor) {
    return text
  }
  
  let result = text
  result = result.replace(/(?<!\x1b\[)\?([0-9]+)([hlsr])/gi, '\x1b[?$1$2')
  result = result.replace(/(?<!\x1b\[)(?<![A-Za-z])([0-9]{1,3})([ABCDEFGHJKST])(?![a-zA-Z])/g, '\x1b[$1$2')
  
  let prevResult
  let iterations = 0
  const maxIterations = 100
  
  do {
    prevResult = result
    result = result.replace(/(?<!\x1b\[)(?<![0-9;])([0-9]{1,3}(?:;[0-9]{1,3})*)m/, '\x1b[$1m')
    iterations++
  } while (result !== prevResult && iterations < maxIterations)
  
  return result
}

function cleanSerialOutput(text: string): string {
  if (!text) return ''
  let cleaned = text
  cleaned = cleaned.replace(/\x1b\[[\d;]*R/g, '')
  cleaned = cleaned.replace(/\[[\d;]+R/g, '')
  cleaned = cleaned.replace(/\x1b\[[\d;]*n/g, '')
  cleaned = cleaned.replace(/\x1b\[\?[\d;]*c/g, '')
  cleaned = cleaned.replace(/\x1b\[>[\d;]*c/g, '')
  cleaned = cleaned.replace(/\x1b\/Z/g, '')
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
  cleaned = cleaned.replace(/\x00/g, '')
  cleaned = cleaned.replace(/[\x01-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F]/g, '')
  return cleaned
}

function normalizeDaemonText(text: string): string {
  if (!text) return ''
  let normalized = text
  normalized = normalized.replace(/\[Pterodactyl Daemon\]/g, "[Daemon]")
  normalized = normalized.replace(/(?<!\x1b)\[([0-9;]+)([mABCDEFGHJKSTfsu])/g, '\x1b[$1$2')
  normalized = normalized.replace(/(?<!\x1b)\[\?([0-9]+)([hlsr])/gi, '\x1b[?$1$2')
  return normalized
}

function stripAnsiText(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[PX^_].*?\x1b\\/g, "")
    .replace(/\x1b./g, "")
}

function processConsoleOutput(text: string): string {
  if (!text) return ''
  let processed = fixCorruptedAnsiCodes(text)
  processed = normalizeDaemonText(processed)
  processed = cleanSerialOutput(processed)
  return processed
}

export function ConsoleTab({ serverId }: ConsoleTabProps) {
  const t = useTranslations("serverConsoleTab")
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<any>(null)
  const inputBuf = useRef("")
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleOutputRef = useRef<string[]>([])

  // Refs for reconnection state (not in dependency arrays)
  const connectedHintShownRef = useRef(false)
  const retryCountRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isConnectingRef = useRef(false)
  const cancelledRef = useRef(false)
  const serverOfflineRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<string>("disconnected")
  const [mobileCmd, setMobileCmd] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)

  const addToOutput = useCallback((text: string) => {
    consoleOutputRef.current.push(text)
    if (consoleOutputRef.current.length > 1000) {
      consoleOutputRef.current = consoleOutputRef.current.slice(-500)
    }
  }, [])

  const sendCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return
    
    setCommandHistory(prev => {
      const filtered = prev.filter(c => c !== cmd)
      return [cmd, ...filtered].slice(0, 100)
    })

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "send command", args: [cmd] }))
    } else {
      apiFetch(API_ENDPOINTS.serverCommands.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ command: cmd }),
      }).catch((err: any) => {
        xtermRef.current?.writeln(`\x1b[31m[${t("terminal.errorTag")}] ${err.message}\x1b[0m`)
      })
    }
    
    addToOutput(`> ${cmd}`)
  }, [serverId, addToOutput])

  const copyOutput = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(consoleOutputRef.current.join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const text = consoleOutputRef.current.join("\n")
      const textarea = document.createElement("textarea")
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  const clearConsole = useCallback(() => {
    xtermRef.current?.clear()
    consoleOutputRef.current = []
    xtermRef.current?.writeln(`\x1b[90m${t("terminal.consoleCleared")}\x1b[0m`)
  }, [t])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.() ||
        (containerRef.current as any).webkitRequestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.() ||
        (document as any).webkitExitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      setTimeout(() => fitRef.current?.fit(), 100)
    }
    
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    let ws: WebSocket | null = null
    let term: any = null

    // Exponential backoff: 2s, 4s, 8s, 15s, 30s, 30s, 30s...
    const getReconnectDelay = (attempt: number): number => {
      if (serverOfflineRef.current) {
        // Server is offline — use much longer intervals
        return Math.min(30000 + attempt * 5000, 60000)
      }
      const base = 2000
      const delay = Math.min(base * Math.pow(2, attempt), 30000)
      // Add jitter: ±25%
      const jitter = delay * 0.25 * (Math.random() * 2 - 1)
      return Math.round(delay + jitter)
    }

    const MAX_RETRIES = 15

    ;(async () => {
      const { Terminal } = await import("@xterm/xterm")
      const { FitAddon } = await import("@xterm/addon-fit")
      const { WebLinksAddon } = await import("@xterm/addon-web-links")
      await import("@xterm/xterm/css/xterm.css")

      if (cancelledRef.current || !termRef.current) return

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
        theme: {
          background: "#0a0a0a",
          foreground: "#e4e4e7",
          cursor: "#a1a1aa",
          selectionBackground: "#27272a",
          black: "#18181b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#e4e4e7",
          brightBlack: "#3f3f46",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#fafafa",
        },
        convertEol: true,
        disableStdin: false,
        scrollback: 5000,
        cursorStyle: "underline",
        allowProposedApi: true,
      })

      const fitAddon = new FitAddon()
      fitRef.current = fitAddon
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(termRef.current)
      
      setTimeout(() => fitAddon.fit(), 50)
      
      xtermRef.current = term
      setTerminalReady(true)

      const history: string[] = []
      let historyIdx = -1

      term.onKey(({ key, domEvent }: { key: string; domEvent: KeyboardEvent }) => {
        const code = domEvent.keyCode

        if (code === 13) {
          const cmd = inputBuf.current
          term.write("\r\n")
          if (cmd.trim()) {
            history.unshift(cmd)
            if (history.length > 200) history.pop()
            historyIdx = -1
            setCommandHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 100))

            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "send command", args: [cmd] }))
            } else {
              apiFetch(API_ENDPOINTS.serverCommands.replace(":id", serverId), {
                method: "POST",
                body: JSON.stringify({ command: cmd }),
              }).catch((err: any) => {
                term.writeln(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
              })
            }
            addToOutput(`> ${cmd}`)
          }
          inputBuf.current = ""
          return
        }

        if (code === 8) {
          if (inputBuf.current.length > 0) {
            inputBuf.current = inputBuf.current.slice(0, -1)
            term.write("\b \b")
          }
          return
        }

        if (code === 38) {
          if (history.length > 0 && historyIdx < history.length - 1) {
            historyIdx++
            while (inputBuf.current.length > 0) {
              term.write("\b \b")
              inputBuf.current = inputBuf.current.slice(0, -1)
            }
            const entry = history[historyIdx]
            inputBuf.current = entry
            term.write(entry)
          }
          return
        }

        if (code === 40) {
          while (inputBuf.current.length > 0) {
            term.write("\b \b")
            inputBuf.current = inputBuf.current.slice(0, -1)
          }
          if (historyIdx > 0) {
            historyIdx--
            const entry = history[historyIdx]
            inputBuf.current = entry
            term.write(entry)
          } else {
            historyIdx = -1
          }
          return
        }

        if (domEvent.ctrlKey || domEvent.altKey || domEvent.metaKey) {
          if (domEvent.ctrlKey && code === 67 && term.hasSelection()) return
          if (domEvent.ctrlKey && code === 67) {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "send command", args: ["\x03"] }))
            }
            inputBuf.current = ""
            term.write("^C\r\n")
            return
          }
          if (domEvent.ctrlKey && code === 76) {
            term.clear()
            consoleOutputRef.current = []
            return
          }
          return
        }

        if (key.length === 1 && key.charCodeAt(0) >= 32) {
          inputBuf.current += key
          term.write(key)
        }
      })

      term.onData((data: string) => {
        if (data.length > 1) {
          const clean = data.replace(/[\x00-\x1f]/g, "")
          if (clean) {
            inputBuf.current += clean
            term.write(clean)
          }
        }
      })

      term.writeln(`\x1b[90m${t("terminal.connectingToConsole")}\x1b[0m`)
      setConnectionState("connecting")

      function scheduleReconnect() {
        if (cancelledRef.current) return
        if (reconnectTimerRef.current) return // Already scheduled

        retryCountRef.current++
        
        if (retryCountRef.current > MAX_RETRIES) {
          term.writeln(`\x1b[31m${t("terminal.maxReconnect")}\x1b[0m`)
          setConnectionState("disconnected")
          setReconnecting(false)
          return
        }

        const delay = getReconnectDelay(retryCountRef.current - 1)
        const delaySec = Math.round(delay / 1000)
        
        if (serverOfflineRef.current) {
          term.writeln(`\x1b[90m${t("terminal.serverOfflineRetry", { delaySec, attempt: retryCountRef.current, maxRetries: MAX_RETRIES })}\x1b[0m`)
        } else {
          term.writeln(`\x1b[33m${t("terminal.reconnectingIn", { delaySec, attempt: retryCountRef.current, maxRetries: MAX_RETRIES })}\x1b[0m`)
        }
        
        setConnectionState("reconnecting")

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          if (!cancelledRef.current) {
            connect()
          }
        }, delay)
      }

      async function connect() {
        if (cancelledRef.current) return
        if (isConnectingRef.current) return
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
        
        isConnectingRef.current = true
        setReconnecting(true)
        setConnectionState("connecting")
        
        try {
          const creds = await apiFetch(API_ENDPOINTS.serverWebsocket.replace(":id", serverId))
          const socketUrl = creds?.data?.socket
          const token = creds?.data?.token

          if (!socketUrl || !token) {
            term.writeln(`\x1b[31m${t("terminal.failedWsCredentials")}\x1b[0m`)
            isConnectingRef.current = false
            setReconnecting(false)
            serverOfflineRef.current = true
            scheduleReconnect()
            return
          }

          if (cancelledRef.current) {
            isConnectingRef.current = false
            return
          }

          try {
            ws = new WebSocket(socketUrl)
          } catch (err: any) {
            term.writeln(`\x1b[31m${t("terminal.websocketError", { reason: err.message || err })}\x1b[0m`)
            isConnectingRef.current = false
            setReconnecting(false)
            scheduleReconnect()
            return
          }
          wsRef.current = ws

          // Connection timeout — if we don't get onopen within 10s, give up
          const connectTimeout = setTimeout(() => {
            if (ws && ws.readyState === WebSocket.CONNECTING) {
              term.writeln(`\x1b[31m${t("terminal.connectionTimedOut")}\x1b[0m`)
              ws.close()
            }
          }, 10000)

          ws.onopen = () => {
            clearTimeout(connectTimeout)
            isConnectingRef.current = false
            setReconnecting(false)
            if (cancelledRef.current) return
            
            // Reset retry state on successful connection
            retryCountRef.current = 0
            serverOfflineRef.current = false
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current)
              reconnectTimerRef.current = null
            }
            
            ws!.send(JSON.stringify({ event: "auth", args: [token] }))
          }

          ws.onmessage = (ev) => {
            if (cancelledRef.current) return
            try {
              const msg = JSON.parse(ev.data)
              switch (msg.event) {
                case "auth success":
                  setConnected(true)
                  setConnectionState("connected")
                  serverOfflineRef.current = false
                  if (!connectedHintShownRef.current) {
                    term.writeln(`\x1b[32m${t("terminal.connected")}.\x1b[0m ${t("terminal.typeCommands")}\r\n`)
                    connectedHintShownRef.current = true
                  }
                  ws!.send(JSON.stringify({ event: "send logs", args: [] }))
                  ws!.send(JSON.stringify({ event: "send stats", args: [] }))
                  break
                  
                case "console output":
                  for (const line of msg.args || []) {
                    const raw = typeof line === "string" ? line : JSON.stringify(line)
                    const processed = processConsoleOutput(raw)
                    if (processed.trim() || processed.includes('\n')) {
                      term.write(processed)
                      if (!processed.endsWith('\n') && !processed.endsWith('\r')) {
                        term.write('\r\n')
                      }
                      addToOutput(stripAnsiText(processed))
                    }
                  }
                  break
                  
                case "install output":
                  for (const line of msg.args || []) {
                    const processed = processConsoleOutput(String(line))
                    const text = `[${t("terminal.tags.install")}] ${processed}`
                    if (text.trim()) {
                      term.writeln(`\x1b[33m${text}\x1b[0m`)
                      addToOutput(stripAnsiText(text))
                    }
                  }
                  break
                  
                case "status": {
                  const raw = String(msg.args?.[0] || "")
                  const processed = processConsoleOutput(raw)
                  term.writeln(`\x1b[36m[${t("terminal.tags.status")}]\x1b[0m ${processed}`)
                  setConnectionState(raw)
                  const s = raw.toLowerCase()
                  if (s === "running" || s === "connected") {
                    setConnected(true)
                    serverOfflineRef.current = false
                    if (!connectedHintShownRef.current) {
                      connectedHintShownRef.current = true
                    }
                  } else if (s === "connecting" || s === "starting") {
                    setConnected(false)
                  } else if (s === "offline" || s === "stopped") {
                    setConnected(false)
                    serverOfflineRef.current = true
                    connectedHintShownRef.current = false
                  } else if (s.includes("disconnect") || s.includes("failed") || s.includes("expired")) {
                    setConnected(false)
                    connectedHintShownRef.current = false
                  }
                  break
                }
                  
                case "daemon message": {
                  const dmMsg = processConsoleOutput(msg.args?.join(" ") || "")
                  if (dmMsg.trim()) {
                    term.writeln(`\x1b[33m[${t("terminal.tags.daemon")}]\x1b[0m ${dmMsg}`)
                  }
                  break
                }
                  
                case "daemon error": {
                  const errMsg = processConsoleOutput(msg.args?.join(" ") || "")
                  if (errMsg.trim()) {
                    term.writeln(`\x1b[31m[${t("terminal.tags.error")}]\x1b[0m ${errMsg}`)
                  }
                  break
                }
                  
                case "jwt error":
                  term.writeln(`\x1b[31m[${t("terminal.tags.authError")}]\x1b[0m ${processConsoleOutput(msg.args?.join(" ") || "")}`)
                  setConnected(false)
                  break
                  
                case "token expiring":
                  apiFetch(API_ENDPOINTS.serverWebsocket.replace(":id", serverId))
                    .then((c) => {
                      if (c?.data?.token && ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: "auth", args: [c.data.token] }))
                      }
                    })
                    .catch(() => {})
                  break
                  
                case "token expired":
                  term.writeln(`\x1b[31m${t("terminal.sessionExpired")}\x1b[0m`)
                  setConnected(false)
                  break
                  
                default:
                  break
              }
            } catch {
              const processed = processConsoleOutput(String(ev.data))
              if (processed.trim()) {
                term.writeln(processed)
              }
            }
          }

          ws.onerror = () => {
            clearTimeout(connectTimeout)
            if (!cancelledRef.current) {
              term.writeln(`\x1b[31m${t("terminal.websocketErrorOccurred")}\x1b[0m`)
            }
          }

          ws.onclose = (ev) => {
            clearTimeout(connectTimeout)
            isConnectingRef.current = false
            setReconnecting(false)
            
            if (cancelledRef.current) return
            
            setConnected(false)
            
            // Determine if this was an immediate disconnect (server offline)
            // Code 1006 = abnormal closure (connection lost / server unreachable)
            // Code 1000 = normal closure
            // Code 1008 = policy violation (auth failure)
            const isAbnormal = ev.code === 1006
            const isAuthFailure = ev.code === 1008
            
            if (isAuthFailure) {
              term.writeln(`\x1b[31m${t("terminal.authFailed", { code: ev.code })}\x1b[0m`)
              setConnectionState("disconnected")
              return
            }
            
            term.writeln(`\x1b[90m${t("terminal.disconnected", { code: ev.code, reason: ev.reason ? `: ${ev.reason}` : "" })}\x1b[0m`)
            
            if (isAbnormal) {
              // Mark as potentially offline if we disconnect very quickly
              serverOfflineRef.current = true
              scheduleReconnect()
            }
            // For normal closures (1000), don't auto-reconnect — user or server initiated
          }
        } catch (err: any) {
          const msg = err?.message || String(err)
          
          // Check if it's a network/server error indicating the server is offline
          if (msg.includes("fetch") || msg.includes("network") || msg.includes("404") || msg.includes("502") || msg.includes("503")) {
            serverOfflineRef.current = true
            term.writeln(`\x1b[90m${t("terminal.serverOffline", { reason: msg })}\x1b[0m`)
          } else {
            term.writeln(`\x1b[31m${t("terminal.connectionFailed", { reason: msg })}\x1b[0m`)
          }
          
          isConnectingRef.current = false
          setReconnecting(false)
          scheduleReconnect()
        }
      }

      connect()
    })()

    const onResize = () => {
      setTimeout(() => fitRef.current?.fit(), 50)
    }
    window.addEventListener("resize", onResize)

    const onOrientationChange = () => {
      setTimeout(() => fitRef.current?.fit(), 100)
    }
    window.addEventListener("orientationchange", onOrientationChange)

    return () => {
      cancelledRef.current = true
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onOrientationChange)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      ws?.close()
      wsRef.current = null
      term?.dispose()
      xtermRef.current = null
    }
  }, [serverId, addToOutput, t]) // Only stable dependencies needed for runtime lifecycle

  const handleReconnect = useCallback(() => {
    if (reconnecting) return
    
    // Clear any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    
    // Reset retry state for manual reconnect
    retryCountRef.current = 0
    serverOfflineRef.current = false
    isConnectingRef.current = false
    connectedHintShownRef.current = false
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null // Prevent auto-reconnect from firing
      wsRef.current.close()
      wsRef.current = null
    }
    
    setConnected(false)
    setConnectionState("connecting")
    xtermRef.current?.writeln(`\x1b[90m${t("terminal.manuallyReconnecting")}\x1b[0m`)

    // Re-run the effect by unmounting and remounting
    // We do this by toggling a key or simply calling connect again
    // Since connect is inside the effect, we reload — but properly this time
    // Actually, let's just reload the component cleanly
    setReconnecting(true)
    
    // Small delay then reload
    setTimeout(() => {
      window.location.reload()
    }, 200)
  }, [reconnecting, t])

  const handleMobileSend = useCallback(() => {
    if (!mobileCmd.trim()) return
    sendCommand(mobileCmd.trim())
    setMobileCmd("")
  }, [mobileCmd, sendCommand])

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col relative",
        isFullscreen && "fixed inset-0 z-50 bg-background"
      )}
    >
      <ConsoleToolbar
        connected={connected}
        connectionState={connectionState}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
        onClear={clearConsole}
        onReconnect={handleReconnect}
        onCopy={copyOutput}
        copied={copied}
        reconnecting={reconnecting}
        t={t}
      />

      <div className="flex-1 relative min-h-0 bg-[#0a0a0a]">
        <div
          ref={termRef}
          className={cn(
            "w-full cursor-text overflow-hidden",
            isFullscreen 
              ? "h-[calc(100vh-120px)]" 
              : "h-[300px] sm:h-[400px] md:h-[550px]"
          )}
          onClick={() => xtermRef.current?.focus()}
        />
        
        {!terminalReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t("states.loadingConsole")}</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative sm:hidden">
        {showHistory && (
          <HistoryPanel
            history={commandHistory}
            onSelect={(cmd) => setMobileCmd(cmd)}
            onClose={() => setShowHistory(false)}
            t={t}
          />
        )}
        
        <MobileCommandInput
          value={mobileCmd}
          onChange={setMobileCmd}
          onSend={handleMobileSend}
          onHistoryToggle={() => setShowHistory(!showHistory)}
          historyOpen={showHistory}
          disabled={!terminalReady}
          t={t}
        />
      </div>

      <div className="hidden sm:flex items-center gap-2 border-t border-border bg-secondary/10 px-4 py-2.5">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          {t("footer.typeCommandsAbove")}
        </span>
        <span className="text-muted-foreground/50 mx-2">•</span>
        <span className="text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">Ctrl+C</kbd>
          <span className="ml-1.5">{t("actions.cancel")}</span>
        </span>
        <span className="text-muted-foreground/50 mx-2">•</span>
        <span className="text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">Ctrl+L</kbd>
          <span className="ml-1.5">{t("actions.clear")}</span>
        </span>
      </div>
    </div>
  )
}