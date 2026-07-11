"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatBytes } from "./serverTabHelpers"
import { useServerWebsocket } from "./useServerWebsocket"
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
  ChevronRight,
  HardDrive
} from "lucide-react"

interface ConsoleTabProps {
  serverId: string
  installing?: boolean
  onReinstall?: () => Promise<void>
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
        icon: <Loader2 className="h-3 w-3 rounded-full animate-spin" />,
        label: state.charAt(0).toUpperCase() + state.slice(1),
        className: "border-yellow-500/50 text-yellow-400 bg-black/60"
      }
    }
    if (state === "stopping") {
      return {
        icon: <Loader2 className="h-3 w-3 rounded-full animate-spin" />,
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
      <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 p-4 border border-border bg-background shadow-xl text-center">
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
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 border border-border bg-background shadow-xl max-h-48 overflow-y-auto">
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
          "flex items-center justify-center p-2 transition-colors flex-shrink-0",
          historyOpen 
            ? "bg-primary text-primary-foreground" 
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        )}
      >
        <History className="h-4 w-4" />
      </button>
      
      <div className="flex-1 flex items-center gap-2 border border-border bg-input px-3 py-1.5">
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
          "flex items-center justify-center p-2 transition-colors flex-shrink-0",
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
  installing: boolean
  t: any
}

function ConsoleToolbar({
  connected, connectionState, isFullscreen, onFullscreenToggle,
  onClear, onReconnect, onCopy, copied, reconnecting, installing, t
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground hidden sm:inline">{t("toolbar.console")}</span>
        <StatusBadge connected={connected} connectionState={connectionState} t={t} />
        {installing && (
          <Badge variant="outline" className="text-[10px] gap-1.5 px-2 py-0.5 font-medium border-yellow-500/50 text-yellow-400 bg-black/60">
            <Loader2 className="h-3 w-3 rounded-full animate-spin" />
            {t("status.installing")}
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={t("toolbar.copyOutput")}
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          <span className="hidden sm:inline">{copied ? t("actions.copied") : t("actions.copy")}</span>
        </button>
        
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title={t("toolbar.clearConsole")}
        >
          <Trash2 className="h-3 w-3" />
          <span className="hidden sm:inline">{t("actions.clear")}</span>
        </button>
        
        <button
          onClick={onReconnect}
          disabled={reconnecting}
          className="flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          title={t("actions.reconnect")}
        >
          <RefreshCw className={cn("h-3 w-3", reconnecting && "rounded-full animate-spin")} />
        </button>
        
        <button
          onClick={onFullscreenToggle}
          className="flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
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

function translateStatusText(text: string, translate: any): string {
  const key = text.toLowerCase()
  const dotKey = key.endsWith('...') ? key.slice(0, -3) + '_dots' : key
  const translated = translate(`terminal.statusValues.${dotKey}`)
  if (translated && !translated.includes('terminal.statusValues.')) {
    return translated
  }
  return text
}

function translateDaemonText(text: string, translate: any): string {
  const trimmed = text.trim()
  const clean = trimmed.replace(/^[\s-]+|[\s-]+$/g, '').trim()

  const exactMap: Record<string, string> = {
    'Detected server process in a crashed state!': 'terminal.daemonMessages.crashedState',
    'Updating process configuration files...': 'terminal.daemonMessages.updatingConfig',
    'Ensuring file permissions are set correctly, this could take a few seconds...': 'terminal.daemonMessages.settingPermissions',
    'Pulling Docker container image, this could take a few minutes to complete...': 'terminal.daemonMessages.pullingImage',
    'Finished pulling Docker container image': 'terminal.daemonMessages.finishedPulling',
    'Server is exceeding the assigned disk space limit, stopping process now.': 'terminal.daemonMessages.diskLimit',
    'Server is outputting console data too quickly -- throttling...': 'terminal.daemonMessages.throttling',
    'Aborting automatic restart, crash detection is disabled for this instance.': 'terminal.daemonMessages.crashDisabled',
  }

  if (exactMap[clean]) {
    return trimmed.replace(clean, translate(exactMap[clean]))
  }

  const exitMatch = clean.match(/^Exit code: (.+)$/i)
  if (exitMatch) {
    return trimmed.replace(clean, translate('terminal.daemonMessages.exitCode', { code: exitMatch[1] }))
  }

  const oomMatch = clean.match(/^Out of memory: (.+)$/i)
  if (oomMatch) {
    return trimmed.replace(clean, translate('terminal.daemonMessages.outOfMemory', { value: oomMatch[1] }))
  }

  const abortMatch = clean.match(/^Aborting automatic restart, last crash occurred less than (\d+) seconds ago\.$/i)
  if (abortMatch) {
    return trimmed.replace(clean, translate('terminal.daemonMessages.crashTooFrequent', { timeout: abortMatch[1] }))
  }

  return text
}

function translateInstallText(text: string, translate: any): string {
  const clean = text.trim()

  const exactMap: Record<string, string> = {
    'Finished pulling Docker container image': 'terminal.installMessages.finishedPulling',
  }

  if (exactMap[clean]) {
    return translate(exactMap[clean])
  }

  const pullingMatch = clean.match(/^Pulling from (.+)$/i)
  if (pullingMatch) {
    return translate('terminal.installMessages.pullingFrom', { image: pullingMatch[1] })
  }

  const digestMatch = clean.match(/^Digest: (.+)$/i)
  if (digestMatch) {
    return translate('terminal.installMessages.digest', { digest: digestMatch[1] })
  }

  const statusMatch = clean.match(/^Status: (.+)$/i)
  if (statusMatch) {
    return translate('terminal.installMessages.status', { status: statusMatch[1] })
  }

  return text
}

export function ConsoleTab({ serverId, installing: installingProp }: ConsoleTabProps) {
  const t = useTranslations("serverConsoleTab")
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const inputBuf = useRef("")
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleOutputRef = useRef<string[]>([])
  const cancelledRef = useRef(false)

  const {
    ws,
    connected,
    connectionState,
    installing,
    reconnect,
    sendCommand: wsSendCommand,
    resources,
  } = useServerWebsocket(serverId)

  const [mobileCmd, setMobileCmd] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [terminalReady, setTerminalReady] = useState(false)

  const isInstalling = installing || (installingProp ?? false)

  // Freeze tab after inactivity (10 min)
  const [frozen, setFrozen] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const FREEZE_TIMEOUT = 10 * 60 * 1000

  const resetFreezeTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (frozen) return
    if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
    freezeTimerRef.current = setTimeout(() => {
      setFrozen(true)
      ws.close()
    }, FREEZE_TIMEOUT)
  }, [frozen, ws])

  useEffect(() => {
    if (isInstalling) {
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
      return
    }
    resetFreezeTimer()
    return () => { if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current) }
  }, [isInstalling, resetFreezeTimer])

  const unfreeze = useCallback(() => {
    setFrozen(false)
    lastActivityRef.current = Date.now()
    if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
    freezeTimerRef.current = setTimeout(() => {
      setFrozen(true)
      ws.close()
    }, FREEZE_TIMEOUT)
    reconnect()
  }, [ws, reconnect])

  const addToOutput = useCallback((text: string) => {
    consoleOutputRef.current.push(text)
    if (consoleOutputRef.current.length > 1000) {
      consoleOutputRef.current = consoleOutputRef.current.slice(-500)
    }
  }, [])

  // Track which install lines we've already displayed (to avoid duplicates)
  const displayedInstallLinesRef = useRef<Set<string>>(new Set())

  const fetchInstallLogs = useCallback(async () => {
    if (!xtermRef.current) return
    try {
      const text = await apiFetch(API_ENDPOINTS.serverInstallLogs.replace(":id", serverId))
      if (!text) return
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || displayedInstallLinesRef.current.has(trimmed)) continue
        displayedInstallLinesRef.current.add(trimmed)
        const translated = translateInstallText(trimmed, t)
        const output = `[${t("terminal.tags.install")}] ${translated}`
        xtermRef.current.writeln(`\x1b[33m${output}\x1b[0m`)
        addToOutput(stripAnsiText(output))
      }
    } catch {}
  }, [serverId, addToOutput, t])

  // Fetch install logs once on mount (catches completed installs)
  // Do NOT poll during install — Wings only creates/truncates install.log
  // at the END of installation, so polling returns stale data from a previous install.
  // Live output comes via WS "install output" events instead.
  useEffect(() => {
    fetchInstallLogs()
  }, [fetchInstallLogs])

  // When install finishes (isInstalling -> false), fetch the final log once
  const prevInstallingRef = useRef(isInstalling)
  useEffect(() => {
    if (prevInstallingRef.current && !isInstalling) {
      fetchInstallLogs()
    }
    prevInstallingRef.current = isInstalling
  }, [isInstalling, fetchInstallLogs])

  const sendCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return
    setCommandHistory(prev => {
      const filtered = prev.filter(c => c !== cmd)
      return [cmd, ...filtered].slice(0, 100)
    })
    wsSendCommand(cmd)
    addToOutput(`> ${cmd}`)
  }, [wsSendCommand, addToOutput])

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
    let termDisposed = false

    let term: any = null
    const history: string[] = []
    let historyIdx = -1

    ;(async () => {
      const { Terminal } = await import("@xterm/xterm")
      const { FitAddon } = await import("@xterm/addon-fit")
      const { WebLinksAddon } = await import("@xterm/addon-web-links")
      await import("@xterm/xterm/css/xterm.css")

      if (cancelledRef.current || !termRef.current || termDisposed) return

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
            wsSendCommand(cmd)
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
            inputBuf.current = history[historyIdx]
            term.write(history[historyIdx])
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
            inputBuf.current = history[historyIdx]
            term.write(history[historyIdx])
          } else {
            historyIdx = -1
          }
          return
        }

        if (domEvent.ctrlKey || domEvent.altKey || domEvent.metaKey) {
          if (domEvent.ctrlKey && code === 67 && term.hasSelection()) return
          if (domEvent.ctrlKey && code === 67) {
            ws.send("send command", ["\x03"])
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

      const connectedHintShown = { current: false }

      ws.on('auth success', () => {
        if (!connectedHintShown.current) {
          term.writeln(`\x1b[32m${t("terminal.connected")}.\x1b[0m ${t("terminal.typeCommands")}\r\n`)
          connectedHintShown.current = true
        }
      })

      ws.on('console output', (args: unknown[]) => {
        for (const line of (args || [])) {
          const raw = typeof line === 'string' ? line : JSON.stringify(line)
          const processed = processConsoleOutput(raw)
          const plain = stripAnsiText(processed)
          const daemonMatch = plain.match(/^\[Daemon\]:\s*/)
          let output = processed
          if (daemonMatch) {
            const msgText = plain.slice(daemonMatch[0].length)
            const translated = translateDaemonText(msgText, t)
            output = processed.replace(msgText, translated)
          }
          if (output.trim() || output.includes('\n')) {
            term.write(output)
            if (!output.endsWith('\n') && !output.endsWith('\r')) {
              term.write('\r\n')
            }
            addToOutput(stripAnsiText(output))
          }
        }
      })

      ws.on('install output', (args: unknown[]) => {
        for (const line of (args || [])) {
          const processed = processConsoleOutput(String(line))
          const translated = translateInstallText(processed, t)
          const text = `[${t("terminal.tags.install")}] ${translated}`
          if (text.trim()) {
            term.writeln(`\x1b[33m${text}\x1b[0m`)
            addToOutput(stripAnsiText(text))
          }
        }
      })

      ws.on('install started', () => {
        term.writeln(`\x1b[33m[${t("terminal.tags.install")}] ${t("terminal.installStarted")}\x1b[0m`)
      })

      ws.on('install completed', () => {
        term.writeln(`\x1b[32m[${t("terminal.tags.install")}] ${t("terminal.installCompleted")}\x1b[0m`)
        fetchInstallLogs()
      })

      ws.on('status', (args: unknown[]) => {
        const raw = String(args?.[0] ?? '')
        const processed = processConsoleOutput(raw)
        const translated = translateStatusText(processed, t)
        term.writeln(`\x1b[36m[${t("terminal.tags.status")}]\x1b[0m ${translated}`)
      })

      ws.on('daemon message', (args: unknown[]) => {
        const dmMsg = processConsoleOutput(args?.join(' ') || '')
        const translated = translateDaemonText(dmMsg, t)
        if (translated.trim()) {
          term.writeln(`\x1b[33m[${t("terminal.tags.daemon")}]\x1b[0m ${translated}`)
        }
      })

      ws.on('daemon error', (args: unknown[]) => {
        const errMsg = processConsoleOutput(args?.join(' ') || '')
        if (errMsg.trim()) {
          term.writeln(`\x1b[31m[${t("terminal.tags.error")}]\x1b[0m ${errMsg}`)
        }
      })

      ws.on('jwt error', (args: unknown[]) => {
        term.writeln(`\x1b[31m[${t("terminal.tags.authError")}]\x1b[0m ${processConsoleOutput(args?.join(' ') || '')}`)
      })
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
      termDisposed = true
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onOrientationChange)
      term?.dispose()
      xtermRef.current = null
    }
  }, [serverId, ws, wsSendCommand, addToOutput, t])

  const handleReconnect = useCallback(() => {
    if (!connected) {
      xtermRef.current?.writeln(`\x1b[90m${t("terminal.manuallyReconnecting")}\x1b[0m`)
      reconnect()
    }
  }, [connected, reconnect, t])

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
        reconnecting={!connected && connectionState === 'connecting'}
        installing={installingProp || isInstalling}
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
          onMouseMove={resetFreezeTimer}
          onKeyDown={resetFreezeTimer}
          onWheel={resetFreezeTimer}
        />
        
        {!terminalReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 rounded-full animate-spin" />
              <span className="text-sm">{t("states.loadingConsole")}</span>
            </div>
          </div>
        )}

        {frozen && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 cursor-pointer z-10"
            onClick={unfreeze}
          >
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <Terminal className="h-10 w-10 text-muted-foreground/50" />
              <div>
                <p className="text-base font-medium text-foreground mb-1">{t("states.frozenTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("states.frozenDescription")}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isInstalling && resources && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-secondary/5 text-xs">
          {resources.cpu_absolute != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">CPU</span>
              <div className="w-24 h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(resources.cpu_absolute, 100)}%` }}
                />
              </div>
              <span className="font-mono text-muted-foreground tabular-nums">{Math.round(resources.cpu_absolute)}%</span>
            </div>
          )}
          {resources.memory_bytes != null && resources.memory_limit_bytes != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">RAM</span>
              <div className="w-24 h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((resources.memory_bytes / resources.memory_limit_bytes) * 100, 100)}%` }}
                />
              </div>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatBytes(resources.memory_bytes)} / {formatBytes(resources.memory_limit_bytes)}
              </span>
            </div>
          )}
          {resources.disk_bytes != null && resources.disk_limit_bytes != null && (
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-muted-foreground" />
              <div className="w-24 h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((resources.disk_bytes / resources.disk_limit_bytes) * 100, 100)}%` }}
                />
              </div>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatBytes(resources.disk_bytes)} / {formatBytes(resources.disk_limit_bytes)}
              </span>
            </div>
          )}
        </div>
      )}

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