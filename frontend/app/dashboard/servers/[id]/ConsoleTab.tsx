"use client"

import { useRef, useState, useEffect, useCallback } from "react"
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
}

function StatusBadge({ connected, connectionState }: StatusBadgeProps) {
  const state = connectionState?.toLowerCase() || ""
  
  const getStatusConfig = () => {
    if (connected || state === "running" || state === "connected") {
      return {
        icon: <Wifi className="h-3 w-3" />,
        label: "Connected",
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
        label: "Stopping",
        className: "border-orange-500/50 text-orange-400 bg-black/60"
      }
    }
    return {
      icon: <WifiOff className="h-3 w-3" />,
      label: state ? state.charAt(0).toUpperCase() + state.slice(1) : "Disconnected",
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
}

function HistoryPanel({ history, onSelect, onClose }: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 p-4 rounded-md border border-border bg-background shadow-xl text-center">
        <p className="text-sm text-muted-foreground">No command history</p>
        <button
          onClick={onClose}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 rounded-md border border-border bg-background shadow-xl max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-secondary/50">
        <span className="text-xs font-medium text-muted-foreground">Recent Commands</span>
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
}

function MobileCommandInput({
  value, onChange, onSend, onHistoryToggle, historyOpen, disabled
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
          placeholder="Enter command..."
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
}

function ConsoleToolbar({
  connected, connectionState, isFullscreen, onFullscreenToggle,
  onClear, onReconnect, onCopy, copied, reconnecting
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground hidden sm:inline">Console</span>
        <StatusBadge connected={connected} connectionState={connectionState} />
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title="Copy console output"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
        
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title="Clear console"
        >
          <Trash2 className="h-3 w-3" />
          <span className="hidden sm:inline">Clear</span>
        </button>
        
        <button
          onClick={onReconnect}
          disabled={reconnecting}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          title="Reconnect"
        >
          <RefreshCw className={cn("h-3 w-3", reconnecting && "animate-spin")} />
        </button>
        
        <button
          onClick={onFullscreenToggle}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}

/**
 * Fix ANSI escape sequences that have lost their ESC[ prefix entirely
 * This handles serial console corruption where \x1b[ gets stripped
 * 
 * Examples of corrupted output this fixes:
 * - "0m" -> "\x1b[0m" (reset)
 * - "1m" -> "\x1b[1m" (bold)
 * - "32m" -> "\x1b[32m" (green)
 * - "1;32m" -> "\x1b[1;32m" (bold green)
 * - "0C" -> "\x1b[0C" (cursor forward)
 * - "?25l" -> "\x1b[?25l" (hide cursor)
 * - "?7l" -> "\x1b[?7l" (disable line wrap)
 */
function fixCorruptedAnsiCodes(text: string): string {
  if (!text) return ''
  
  // Quick check: if we already have proper escape sequences and few broken ones, skip
  const hasProperEsc = /\x1b\[/.test(text)
  
  // Count bare SGR codes like "0m", "1m", "32m" that aren't preceded by ESC[
  const brokenSgrPattern = /(?<!\x1b\[)(?<![0-9;])([0-9]{1,3}(?:;[0-9]{1,3})*)m/g
  const brokenSgrMatches = text.match(brokenSgrPattern) || []
  
  // Check for indicators of corrupted ANSI output
  const hasBrokenDec = /(?<!\x1b\[)\?[0-9]+[hlsr]/i.test(text)
  const hasBrokenCursor = /(?<!\x1b\[)(?<![0-9])[0-9]{1,3}[ABCDEFGHJKST](?![a-z])/i.test(text)
  
  // If text has proper escapes and very few broken patterns, probably fine
  if (hasProperEsc && brokenSgrMatches.length < 3 && !hasBrokenDec && !hasBrokenCursor) {
    return text
  }
  
  // If fewer than 3 broken SGR codes and no other broken patterns, probably not corrupted
  if (brokenSgrMatches.length < 3 && !hasBrokenDec && !hasBrokenCursor) {
    return text
  }
  
  let result = text
  
  // 1. Fix DEC private mode sequences: ?25l -> \x1b[?25l, ?7l -> \x1b[?7l, ?7h -> \x1b[?7h
  result = result.replace(/(?<!\x1b\[)\?([0-9]+)([hlsr])/gi, '\x1b[?$1$2')
  
  // 2. Fix cursor movement and erase sequences
  // Must handle: 0C (cursor forward), 2J (erase display), 1A (cursor up), etc.
  // Be careful not to match things like "PC" or other text
  result = result.replace(/(?<!\x1b\[)(?<![A-Za-z])([0-9]{1,3})([ABCDEFGHJKST])(?![a-zA-Z])/g, '\x1b[$1$2')
  
  // 3. Fix SGR (Select Graphic Rendition) sequences for colors/styles
  // Process in a loop because we may have consecutive codes like "0m1m1m"
  // which needs to become "\x1b[0m\x1b[1m\x1b[1m"
  let prevResult
  let iterations = 0
  const maxIterations = 100 // Safety limit
  
  do {
    prevResult = result
    // Match: start of string or after non-digit/semicolon, then digits with optional semicolons, then 'm'
    // Negative lookbehind ensures we don't match already-fixed sequences
    result = result.replace(/(?<!\x1b\[)(?<![0-9;])([0-9]{1,3}(?:;[0-9]{1,3})*)m/, '\x1b[$1m')
    iterations++
  } while (result !== prevResult && iterations < maxIterations)
  
  return result
}

/**
 * Clean up serial console output artifacts
 * Removes cursor position reports, device status responses, and other noise
 */
function cleanSerialOutput(text: string): string {
  if (!text) return ''
  
  let cleaned = text

  // Remove cursor position reports (CPR) - responses to DSR queries
  // Format: ESC[row;colR or malformed [row;colR
  cleaned = cleaned.replace(/\x1b\[[\d;]*R/g, '')
  cleaned = cleaned.replace(/\[[\d;]+R/g, '')
  
  // Remove Device Status Report requests (DSR)
  cleaned = cleaned.replace(/\x1b\[[\d;]*n/g, '')
  
  // Remove Primary Device Attributes responses
  cleaned = cleaned.replace(/\x1b\[\?[\d;]*c/g, '')
  
  // Remove Secondary Device Attributes responses
  cleaned = cleaned.replace(/\x1b\[>[\d;]*c/g, '')
  
  // Remove DECID responses
  cleaned = cleaned.replace(/\x1b\/Z/g, '')
  
  // Clean up OSC (Operating System Command) sequences - window titles, etc.
  // Format: ESC]...BEL or ESC]...ESC\
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
  
  // Remove null bytes
  cleaned = cleaned.replace(/\x00/g, '')
  
  // Remove other problematic control characters (keep common ones like \t, \n, \r)
  cleaned = cleaned.replace(/[\x01-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F]/g, '')
  
  return cleaned
}

/**
 * Normalize daemon text and fix partially broken escape sequences
 * This handles cases where [ is present but ESC is missing
 */
function normalizeDaemonText(text: string): string {
  if (!text) return ''
  
  let normalized = text
  
  // Replace verbose daemon prefix with shorter version
  normalized = normalized.replace(/\[Pterodactyl Daemon\]/g, "[Daemon]")
  
  // Fix escape sequences that have [ but lost ESC: [0m -> \x1b[0m
  // This pattern looks for [ followed by valid ANSI parameters and command letter
  // Negative lookbehind ensures we don't double-fix already correct sequences
  normalized = normalized.replace(/(?<!\x1b)\[([0-9;]+)([mABCDEFGHJKSTfsu])/g, '\x1b[$1$2')
  
  // Fix DEC private mode with bracket but no ESC: [?25l -> \x1b[?25l
  normalized = normalized.replace(/(?<!\x1b)\[\?([0-9]+)([hlsr])/gi, '\x1b[?$1$2')
  
  return normalized
}

/**
 * Strip all ANSI codes for plain text storage/copying
 */
function stripAnsiText(text: string): string {
  return text
    // Remove CSI sequences (ESC[ followed by parameters and command)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    // Remove OSC sequences (ESC] followed by content and BEL)
    .replace(/\x1b\][^\x07]*\x07/g, "")
    // Remove other escape sequences (DCS, PM, APC)
    .replace(/\x1b[PX^_].*?\x1b\\/g, "")
    // Remove any remaining simple escape sequences
    .replace(/\x1b./g, "")
}

/**
 * Full processing pipeline for console output
 * Applies all fixes in the correct order
 */
function processConsoleOutput(text: string): string {
  if (!text) return ''
  
  // Step 1: Fix completely corrupted ANSI codes (missing ESC[)
  // This handles cases like "0m1m32m" -> "\x1b[0m\x1b[1m\x1b[32m"
  let processed = fixCorruptedAnsiCodes(text)
  
  // Step 2: Fix partially broken codes (has [ but missing ESC)
  // This handles cases like "[0m" -> "\x1b[0m"
  processed = normalizeDaemonText(processed)
  
  // Step 3: Clean serial console artifacts (CPR, DSR responses, etc.)
  processed = cleanSerialOutput(processed)
  
  return processed
}

export function ConsoleTab({ serverId }: ConsoleTabProps) {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<any>(null)
  const inputBuf = useRef("")
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleOutputRef = useRef<string[]>([])

  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<string>("disconnected")
  const [connectedHintShown, setConnectedHintShown] = useState(false)
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
        xtermRef.current?.writeln(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
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
    xtermRef.current?.writeln("\x1b[90mConsole cleared.\x1b[0m")
  }, [])

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
    let cancelled = false
    let ws: WebSocket | null = null
    let term: any = null
    let reconnectTimer: any = null
    let retryCount = 0
    let lastAttempt = 0
    let isConnecting = false
    const BASE_DELAY = 5000
    const MAX_DELAY = 60000
    const MAX_RETRIES = 10

    ;(async () => {
      const { Terminal } = await import("@xterm/xterm")
      const { FitAddon } = await import("@xterm/addon-fit")
      const { WebLinksAddon } = await import("@xterm/addon-web-links")
      await import("@xterm/xterm/css/xterm.css")

      if (cancelled || !termRef.current) return

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
        windowsMode: false,
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

      term.writeln("\x1b[90mConnecting to server console...\x1b[0m")
      setConnectionState("connecting")

      async function connect() {
        if (cancelled) return
        if (isConnecting) return
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
        isConnecting = true
        setReconnecting(true)
        
        try {
          const creds = await apiFetch(API_ENDPOINTS.serverWebsocket.replace(":id", serverId))
          const socketUrl = creds?.data?.socket
          const token = creds?.data?.token

          if (!socketUrl || !token) {
            term.writeln("\x1b[31mFailed to obtain WebSocket credentials.\x1b[0m")
            setReconnecting(false)
            isConnecting = false
            return
          }

          if (cancelled) return

          try {
            ws = new WebSocket(socketUrl)
          } catch (err: any) {
            term.writeln(`\x1b[31mWebSocket error: ${err.message || err}\x1b[0m`)
            setReconnecting(false)
            isConnecting = false
            return
          }
          wsRef.current = ws

          ws.onopen = () => {
            isConnecting = false
            setReconnecting(false)
            if (cancelled) return
            retryCount = 0
            lastAttempt = Date.now()
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
            ws!.send(JSON.stringify({ event: "auth", args: [token] }))
          }

          ws.onmessage = (ev) => {
            if (cancelled) return
            try {
              const msg = JSON.parse(ev.data)
              switch (msg.event) {
                case "auth success":
                  setConnected(true)
                  setConnectionState("connected")
                  if (!connectedHintShown) {
                    term.writeln("\x1b[32mConnected.\x1b[0m Type commands directly.\r\n")
                    setConnectedHintShown(true)
                  }
                  ws!.send(JSON.stringify({ event: "send logs", args: [] }))
                  ws!.send(JSON.stringify({ event: "send stats", args: [] }))
                  break
                  
                case "console output":
                  for (const line of msg.args || []) {
                    const raw = typeof line === "string" ? line : JSON.stringify(line)
                    
                    // Process the output through our ANSI fixing pipeline
                    const processed = processConsoleOutput(raw)
                    
                    // Skip empty lines that result from cleaning
                    if (processed.trim() || processed.includes('\n')) {
                      term.write(processed)
                      // Only add newline if the line doesn't already end with one
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
                    const text = `[Install] ${processed}`
                    if (text.trim()) {
                      term.writeln(`\x1b[33m${text}\x1b[0m`)
                      addToOutput(stripAnsiText(text))
                    }
                  }
                  break
                  
                case "status":
                  try {
                    const raw = String(msg.args?.[0] || "")
                    const processed = processConsoleOutput(raw)
                    term.writeln(`\x1b[36m[Status]\x1b[0m ${processed}`)
                    setConnectionState(raw)
                    const s = raw.toLowerCase()
                    if (s === "running" || s === "connected") {
                      setConnected(true)
                      if (!connectedHintShown) {
                        setConnectedHintShown(true)
                      }
                    } else if (s === "connecting" || s === "starting") {
                      setConnected(false)
                    } else if (s.includes("disconnect") || s.includes("failed") || s.includes("expired") || s === "offline" || s === "stopped") {
                      setConnected(false)
                      setConnectedHintShown(false)
                    }
                  } catch {
                    const raw = String(msg.args?.[0] || "")
                    const processed = processConsoleOutput(raw)
                    term.writeln(`\x1b[36m[Status]\x1b[0m ${processed}`)
                  }
                  break
                  
                case "daemon message":
                  const dmMsg = processConsoleOutput(msg.args?.join(" ") || "")
                  if (dmMsg.trim()) {
                    term.writeln(`\x1b[33m[Daemon]\x1b[0m ${dmMsg}`)
                  }
                  break
                  
                case "daemon error":
                  const errMsg = processConsoleOutput(msg.args?.join(" ") || "")
                  if (errMsg.trim()) {
                    term.writeln(`\x1b[31m[Error]\x1b[0m ${errMsg}`)
                  }
                  break
                  
                case "jwt error":
                  term.writeln(`\x1b[31m[Auth Error]\x1b[0m ${processConsoleOutput(msg.args?.join(" ") || "")}`)
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
                  term.writeln("\x1b[31mSession expired. Reconnecting...\x1b[0m")
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
            if (!cancelled) {
              term.writeln("\x1b[31mWebSocket error occurred\x1b[0m")
            }
          }

          ws.onclose = (ev) => {
            isConnecting = false
            setReconnecting(false)
            if (!cancelled) {
              setConnected(false)
              term.writeln(`\x1b[90mDisconnected (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})\x1b[0m`)
              
              if (ev.code === 1006) {
                retryCount++
                if (retryCount > MAX_RETRIES) {
                  term.writeln(`\x1b[31mMax reconnection attempts reached\x1b[0m`)
                  return
                }
                if (reconnectTimer) return
                const now = Date.now()
                const sinceLast = now - (lastAttempt || 0)
                const backoff = Math.min(BASE_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY)
                const delay = Math.max(backoff, sinceLast < 1000 ? BASE_DELAY : 0)
                term.writeln(`\x1b[33mReconnecting in ${Math.round(delay/1000)}s...\x1b[0m`)
                reconnectTimer = setTimeout(() => {
                  reconnectTimer = null
                  if (!cancelled) {
                    lastAttempt = Date.now()
                    connect()
                  }
                }, delay)
              }
            }
          }
        } catch (err: any) {
          term.writeln(`\x1b[31mConnection failed: ${err.message || err}\x1b[0m`)
          isConnecting = false
          setReconnecting(false)
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
      cancelled = true
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onOrientationChange)
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      ws?.close()
      wsRef.current = null
      term?.dispose()
      xtermRef.current = null
    }
  }, [serverId, addToOutput, connectedHintShown])

  const handleReconnect = useCallback(() => {
    if (reconnecting) return
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setConnectedHintShown(false)
    setConnectionState("connecting")
    xtermRef.current?.writeln("\x1b[90mReconnecting...\x1b[0m")
    
    setReconnecting(true)
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }, [reconnecting])

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
      {/* Toolbar */}
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
      />

      {/* Terminal */}
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
        
        {/* Loading */}
        {!terminalReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading console...</span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Input */}
      <div className="relative sm:hidden">
        {showHistory && (
          <HistoryPanel
            history={commandHistory}
            onSelect={(cmd) => setMobileCmd(cmd)}
            onClose={() => setShowHistory(false)}
          />
        )}
        
        <MobileCommandInput
          value={mobileCmd}
          onChange={setMobileCmd}
          onSend={handleMobileSend}
          onHistoryToggle={() => setShowHistory(!showHistory)}
          historyOpen={showHistory}
          disabled={!terminalReady}
        />
      </div>

      {/* Desktop Hint */}
      <div className="hidden sm:flex items-center gap-2 border-t border-border bg-secondary/10 px-4 py-2.5">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          Type commands directly in the console above
        </span>
        <span className="text-muted-foreground/50 mx-2">•</span>
        <span className="text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">Ctrl+C</kbd>
          <span className="ml-1.5">Cancel</span>
        </span>
        <span className="text-muted-foreground/50 mx-2">•</span>
        <span className="text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">Ctrl+L</kbd>
          <span className="ml-1.5">Clear</span>
        </span>
      </div>
    </div>
  )
}