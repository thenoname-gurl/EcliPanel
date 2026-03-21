"use client"

import { useRef, useState, useEffect } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Send, Loader2 } from "lucide-react"

export function ConsoleTab({ serverId }: { serverId: string }) {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<any>(null)
  const inputBuf = useRef("")
  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<string>("disconnected")

  const normalizeDaemonText = (v: string) => v.replace(/\[Pterodactyl Daemon\]/g, "[Daemon]")

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
        },
        convertEol: true,
        disableStdin: false,
        scrollback: 5000,
        cursorStyle: "underline",
      })

      const fitAddon = new FitAddon()
      fitRef.current = fitAddon
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(termRef.current)
      fitAddon.fit()
      xtermRef.current = term

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
      term.focus()

      async function connect() {
        if (cancelled) return
        if (isConnecting) return
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
        isConnecting = true
        try {
          const creds = await apiFetch(API_ENDPOINTS.serverWebsocket.replace(":id", serverId))
          const socketUrl = creds?.data?.socket
          const token = creds?.data?.token

          if (!socketUrl || !token) {
            term.writeln("\x1b[31mFailed to obtain WebSocket credentials.\x1b[0m")
            return
          }

          if (cancelled) return

          console.debug('server console websocket url:', socketUrl)

          try {
            ws = new WebSocket(socketUrl)
          } catch (err: any) {
            term.writeln(`\x1b[31mWebSocket construction failed: ${err.message || err}\x1b[0m`)
            console.error('failed to create WebSocket', err)
            return
          }
          wsRef.current = ws

          ws.onopen = () => {
            isConnecting = false
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
                  term.writeln("\x1b[32mConnected.\x1b[0m Type commands directly.\r\n")
                  ws!.send(JSON.stringify({ event: "send logs", args: [] }))
                  ws!.send(JSON.stringify({ event: "send stats", args: [] }))
                  break
                case "console output":
                  for (const line of msg.args || []) {
                    const raw = typeof line === "string" ? line : JSON.stringify(line)
                    term.writeln(normalizeDaemonText(raw))
                  }
                  break
                case "install output":
                  for (const line of msg.args || []) {
                    term.writeln(`\x1b[33m[Install]\x1b[0m ${normalizeDaemonText(String(line))}`)
                  }
                  break
                case "status":
                  try {
                    const raw = String(msg.args?.[0] || "")
                    term.writeln(`\x1b[36m[Status]\x1b[0m ${normalizeDaemonText(raw)}`)
                    setConnectionState(raw)
                    const s = raw.toLowerCase()
                    if (s === "connected") setConnected(true)
                    else if (s === "connecting") setConnected(false)
                    else if (s.includes("disconnect") || s.includes("failed") || s.includes("expired")) setConnected(false)
                  } catch (e) {
                    term.writeln(`\x1b[36m[Status]\x1b[0m ${normalizeDaemonText(String(msg.args?.[0] || ""))}`)
                  }
                  break
                case "daemon message":
                  term.writeln(`\x1b[33m[Daemon]\x1b[0m ${normalizeDaemonText(msg.args?.join(" ") || "")}`)
                  break
                case "daemon error":
                  term.writeln(`\x1b[31m[Error]\x1b[0m ${normalizeDaemonText(msg.args?.join(" ") || "")}`)
                  break
                case "jwt error":
                  term.writeln(`\x1b[31m[Auth Error]\x1b[0m ${normalizeDaemonText(msg.args?.join(" ") || "")}`)
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
              term.writeln(normalizeDaemonText(String(ev.data)))
            }
          }

          ws.onerror = (ev) => {
            if (!cancelled) {
              term.writeln("\x1b[31mWebSocket error (see console).\x1b[0m")
              console.error('websocket error event', ev)
            }
          }

          ws.onclose = (ev) => {
            isConnecting = false
            if (!cancelled) {
              setConnected(false)
              term.writeln(`\x1b[90mDisconnected from console (code ${ev.code} ${ev.reason || ''}).\x1b[0m`)
              console.debug('ws closed', ev)
              if (ev.code === 1006) {
                retryCount++
                if (retryCount > MAX_RETRIES) {
                  term.writeln(`\x1b[31mToo many reconnect attempts (${retryCount}). Stopping retries.\x1b[0m`)
                  return
                }
                if (reconnectTimer) return
                const now = Date.now()
                const sinceLast = now - (lastAttempt || 0)
                const backoff = Math.min(BASE_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY)
                const delay = Math.max(backoff, sinceLast < 1000 ? BASE_DELAY : 0)
                term.writeln(`\x1b[33mAbnormal disconnect detected — reconnecting in ${Math.round(delay/1000)}s...\x1b[0m`)
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
          term.writeln(`\x1b[31mFailed to connect: ${err.message || err}\x1b[0m`)
        }
      }

      connect()
    })()

    const onResize = () => fitRef.current?.fit()
    window.addEventListener("resize", onResize)

    return () => {
      cancelled = true
      window.removeEventListener("resize", onResize)
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      ws?.close()
      wsRef.current = null
      term?.dispose()
      xtermRef.current = null
    }
  }, [serverId])

  const [mobileCmd, setMobileCmd] = useState("")

  return (
    <div className="relative">
      <div className="w-full max-w-full min-w-0">
        <div
          ref={termRef}
          className="h-[300px] sm:h-[550px] cursor-text w-full max-w-full min-w-0 overflow-auto"
          onClick={() => xtermRef.current?.focus()}
        />
      </div>
      <div className="absolute top-2 right-2 z-10">
        <Badge
          variant="outline"
          className={
            connected
              ? "border-green-500/50 text-green-400 text-[10px] bg-black/60 backdrop-blur-sm"
              : connectionState && connectionState.toLowerCase() === "connecting"
              ? "border-yellow-500/50 text-yellow-400 text-[10px] bg-black/60 backdrop-blur-sm"
              : "border-red-500/50 text-red-400 text-[10px] bg-black/60 backdrop-blur-sm"
          }
        >
          {connectionState ? (connectionState.charAt(0).toUpperCase() + connectionState.slice(1)) : (connected ? "Connected" : "Disconnected")}
        </Badge>
      </div>
      <div className="flex sm:hidden border-t border-border bg-zinc-950">
        <input
          type="text"
          value={mobileCmd}
          onChange={(e) => setMobileCmd(e.target.value)}
          placeholder="Type command..."
          className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && mobileCmd.trim()) {
              const cmd = mobileCmd.trim()
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ event: "send command", args: [cmd] }))
              } else {
                apiFetch(API_ENDPOINTS.serverCommands.replace(":id", serverId), {
                  method: "POST",
                  body: JSON.stringify({ command: cmd }),
                }).catch(() => {})
              }
              xtermRef.current?.writeln(`> ${cmd}`)
              setMobileCmd("")
            }
          }}
        />
        <button
          onClick={() => {
            if (!mobileCmd.trim()) return
            const cmd = mobileCmd.trim()
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ event: "send command", args: [cmd] }))
            } else {
              apiFetch(API_ENDPOINTS.serverCommands.replace(":id", serverId), {
                method: "POST",
                body: JSON.stringify({ command: cmd }),
              }).catch(() => {})
            }
            xtermRef.current?.writeln(`> ${cmd}`)
            setMobileCmd("")
          }}
          className="px-3 text-muted-foreground hover:text-foreground"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
