"use client"

import { use, useEffect, useState, useRef, useCallback, lazy, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor-settings"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Play,
  Square,
  RotateCcw,
  Power,
  Terminal,
  Folder,
  FileText,
  Database,
  Clock,
  Network,
  HardDrive,
  ChevronRight,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  Plus,
  Download,
  X,
  Save,
  ArrowLeft,
  RefreshCw,
  Repeat,
  Send,
  Loader2,
  AlertTriangle,
  Settings,
  Cpu,
  MemoryStick,
  Variable,
  Box,
  BarChart3,
  Activity,
  Copy,
} from "lucide-react"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then(m => ({ default: m.default })))

function MonacoFileEditor({ value, onChange, language, editorSettings }: { value: string; onChange: (v: string | undefined) => void; language: string; editorSettings?: EditorSettings }) {
  const settings = { ...DEFAULT_EDITOR_SETTINGS, ...(editorSettings || {}) }
  const [aiLoading, setAiLoading] = useState(false)
  const editorRef = useRef<any | null>(null)
  const monacoRef = useRef<any | null>(null)
  const providerRef = useRef<any | null>(null)
  const aiCacheRef = useRef<{ key: string; promise: Promise<any> | null; result: any | null }>({ key: '', promise: null, result: null })

  const stripCodeFences = (text: string) => {
    return text.replace(/^\s*```\w*\n/, '').replace(/\n```\s*$/, '').trimEnd()
  }

  const settingsRef = useRef(settings)
  const [editorReady, setEditorReady] = useState(false)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    console.log('[AI completion] init', { language, settings: settingsRef.current, editorReady })
    if (!editorReady || !monacoRef.current || !editorRef.current) return

    providerRef.current?.dispose()
    providerRef.current = null
    aiCacheRef.current = { key: '', promise: null, result: null }

    const currentSettings = settingsRef.current
    if (!currentSettings.aiAssistant) return

    providerRef.current = monacoRef.current.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '(', ' ', '\t', '=', ',', '+', '-'],
      provideCompletionItems: async (model: any, position: any) => {
        console.debug('[AI completion] provideCompletionItems called')
        const cursorOffset = model.getOffsetAt(position)
        const maxContext = 2000
        const fullText = model.getValue()
        const contextText = fullText.slice(Math.max(0, cursorOffset - maxContext), cursorOffset)
        const key = `${language}:${contextText}`

        if (aiCacheRef.current.key === key && aiCacheRef.current.result) {
          return aiCacheRef.current.result
        }
        if (aiCacheRef.current.key === key && aiCacheRef.current.promise) {
          return aiCacheRef.current.promise
        }

        const promise = (async () => {
          const prompt = `Complete the following code at the cursor position. Only return the code to insert (no explanations):\n\n${contextText}`
          console.debug('[AI completion] request', { language, cursorOffset, prompt })
          setAiLoading(true)
          try {
            const response = await apiFetch(API_ENDPOINTS.aiChat, {
              method: 'POST',
              body: JSON.stringify({ message: prompt }),
            })

            const raw = String(response.reply || '')
            const completion = stripCodeFences(raw).trim()
            if (!completion) {
              console.debug('[AI completion] empty response, skipping suggestion')
              const empty = { suggestions: [] }
              aiCacheRef.current = { key, promise: null, result: empty }
              return empty
            }

            const insertText = completion.trim()
            if (!insertText) {
              console.debug('[AI completion] insertText empty after trim, skipping suggestion')
              const empty = { suggestions: [] }
              aiCacheRef.current = { key, promise: null, result: empty }
              return empty
            }

            const snippet = insertText.split('\n')[0].trim()
            const label = snippet.length > 0 ? (snippet.length > 60 ? snippet.slice(0, 57) + '...' : snippet) : 'AI suggestion'

            const item = {
              label,
              kind: monacoRef.current.languages.CompletionItemKind.Snippet,
              insertText,
              insertTextRules: monacoRef.current.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'AI suggestion',
              documentation: 'Generated by AI',
            }

            const result = { suggestions: [item] }
            aiCacheRef.current = { key, promise: null, result }
            return result
          } catch (err) {
            console.debug('[AI completion] request failed', err)
            const empty = { suggestions: [] }
            aiCacheRef.current = { key, promise: null, result: empty }
            return empty
          } finally {
            setAiLoading(false)
          }
        })()

        aiCacheRef.current = { key, promise, result: null }
        return promise
      },
      resolveCompletionItem: (item: any) => item,
    })

    return () => {
      providerRef.current?.dispose()
      providerRef.current = null
      aiCacheRef.current = { key: '', promise: null, result: null }
    }
  }, [language, settings.aiAssistant, editorReady])

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[600px] bg-[#1e1e1e]"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <MonacoEditor
        height="600px"
        language={language}
        value={value}
        onChange={onChange}
        theme="vs-dark"
        onMount={(editor, monaco) => {
          editorRef.current = editor
          monacoRef.current = monaco
          setEditorReady(true)

          const suggestDebounce = { id: 0 } as { id: number }
          editor.onDidChangeModelContent((e: any) => {
            if (!settingsRef.current.aiAssistant) return
            if (!e.changes || e.changes.length === 0) return
            const lastChange = e.changes[e.changes.length - 1]
            const text = lastChange.text || ''
            if (!text) return
            clearTimeout(suggestDebounce.id)
            suggestDebounce.id = window.setTimeout(() => {
              editor.trigger('keyboard', 'editor.action.triggerSuggest', {})
            }, 150)
          })
        }}
        options={{
          minimap: { enabled: !!settings.minimap },
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          lineNumbers: "on",
          renderWhitespace: "selection",
          tabSize: settings.tabSize,
          insertSpaces: settings.insertSpaces,
          autoIndent: settings.autoIndent ? "full" : "none",
          formatOnType: settings.formatOnType,
          formatOnPaste: settings.formatOnPaste,
          padding: { top: 12 },
          inlineSuggest: { enabled: !!settings.aiAssistant },
          quickSuggestions: !!settings.aiAssistant,
          acceptSuggestionOnEnter: settings.aiAssistant ? "on" : "off",
        }}
      />
    </Suspense>
  )
}


// ============================================
// Main Server Detail Page
// ============================================
export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const [editorSettings, setEditorSettings] = useState<EditorSettings | undefined>(undefined)
  const [server, setServer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("console")
  const [powerLoading, setPowerLoading] = useState(false)
  const [powerDialogOpen, setPowerDialogOpen] = useState(false)
  const [pendingPowerAction, setPendingPowerAction] = useState<string | null>(null)

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferNodes, setTransferNodes] = useState<any[]>([])
  const [transferNodeId, setTransferNodeId] = useState<number | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  const loadServer = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDetail.replace(":id", id))
      setServer(data)
    } catch (e) {
      console.error("Failed to load server", e)
    } finally {
      setLoading(false)
    }
  }, [id])

  const isRunningStatus = (s: any) => (s === "running" || s === "online")
  const isPowerableStatus = (s: any) => isRunningStatus(s) || s === "starting" || s === "stopping"
  const isStoppedStatus = (s: any) => (s === "stopped" || s === "offline" || s === "hibernated")
  const isHibernatedStatus = (s: any) => s === "hibernated"

  useEffect(() => {
    setEditorSettings(user?.settings?.editor)
  }, [user])

  useEffect(() => {
    loadServer()
    const interval = setInterval(loadServer, 15000)
    return () => clearInterval(interval)
  }, [loadServer])

  const sendPower = async (action: string) => {
    setPowerLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.serverPower.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ action }),
      })
      setTimeout(loadServer, 1500)
    } catch (e: any) {
      alert("Power action failed: " + e.message)
    } finally {
      setPowerLoading(false)
    }
  }

  const confirmPowerAction = (action: string) => {
    setPendingPowerAction(action)
    setPowerDialogOpen(true)
  }

  const doConfirmedPowerAction = async () => {
    if (!pendingPowerAction) return
    setPowerDialogOpen(false)
    await sendPower(pendingPowerAction)
    setPendingPowerAction(null)
  }

  const deleteServer = async () => {
    if (!confirm("Are you sure you want to permanently delete this server? This action cannot be undone.")) return
    try {
      await apiFetch(API_ENDPOINTS.serverDelete.replace(":id", id), { method: "DELETE" })
      router.push("/dashboard/servers")
    } catch (e: any) {
      alert("Delete failed: " + e.message)
    }
  }

  const loadNodes = async () => {
    try {
      const nodes = await apiFetch(API_ENDPOINTS.nodes)
      if (Array.isArray(nodes)) {
        setTransferNodes(nodes)
      }
    } catch {
      // skip
    }
  }

  const openTransferDialog = async () => {
    setTransferError(null)
    setTransferNodeId(null)
    setTransferDialogOpen(true)
    if (transferNodes.length === 0) {
      await loadNodes()
    }
  }

  const doTransfer = async () => {
    if (!transferNodeId) {
      setTransferError('Please select a target node')
      return
    }
    setTransferLoading(true)
    setTransferError(null)
    try {
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ targetNodeId: transferNodeId }),
      })
      setTransferDialogOpen(false)
      setTransferNodeId(null)
      setTransferNodes([])
      loadServer()
      alert('Transfer initiated. This may take several minutes.')
    } catch (e: any) {
      setTransferError(e.message || 'Transfer failed')
    } finally {
      setTransferLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Server not found or unavailable.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/servers")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Servers
        </Button>
      </div>
    )
  }

  const statusColor =
    server.status === "running" || server.status === "online"
      ? "text-green-400"
      : server.status === "hibernated"
        ? "text-purple-400"
        : server.status === "stopped" || server.status === "offline"
          ? "text-red-400"
          : "text-yellow-400"

  const tabs = [
    { id: "console", label: "Console", icon: Terminal },
    { id: "stats", label: "Stats", icon: BarChart3 },
    { id: "files", label: "Files", icon: Folder },
    { id: "startup", label: "Startup", icon: Variable },
    { id: "databases", label: "Databases", icon: Database },
    { id: "schedules", label: "Schedules", icon: Clock },
    { id: "network", label: "Network", icon: Network },
    { id: "backups", label: "Backups", icon: HardDrive },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "subusers", label: "Subusers", icon: FileText },
    { id: "mounts", label: "Mounts", icon: Box },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <>
      <PanelHeader
        title={server.name || server.uuid?.slice(0, 8) || "Server"}
        description={`${server.uuid || id} · ${server.status || "unknown"}`}
      />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-3 p-2 sm:p-4 md:p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Power Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between w-full max-w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-3 w-3 rounded-full flex-shrink-0 ${statusColor.replace("text-", "bg-")} animate-pulse`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{server.name || "Unnamed Server"}</p>
                  <p className="text-xs text-muted-foreground truncate">ID: {server.uuid || id}</p>
              </div>
              <Badge variant="outline" className={`${statusColor} flex-shrink-0`}>
                {server.status || "unknown"}
              </Badge>
            </div>
              <div className="flex flex-wrap gap-2 justify-end items-center w-full sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10 w-full sm:w-auto"
                disabled={powerLoading || isPowerableStatus(server.status) || isHibernatedStatus(server.status)}
                onClick={() => confirmPowerAction("start")}
              >
                <Play className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Start</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 w-full sm:w-auto"
                disabled={powerLoading || !isPowerableStatus(server.status) || isHibernatedStatus(server.status)}
                onClick={() => confirmPowerAction("restart")}
              >
                <RotateCcw className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Restart</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 w-full sm:w-auto"
                disabled={powerLoading || !isPowerableStatus(server.status) || isHibernatedStatus(server.status)}
                onClick={() => confirmPowerAction("stop")}
              >
                <Square className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Stop</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={powerLoading || !isPowerableStatus(server.status) || isHibernatedStatus(server.status)}
                onClick={() => confirmPowerAction("kill")}
              >
                <Power className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Kill</span>
              </Button>
              {user && (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 w-full sm:w-auto"
                  onClick={openTransferDialog}
                >
                  <Repeat className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Transfer</span>
                </Button>
              )}
            </div>
          </div>

          {/* Resource Stats */}
          {server.resources && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-4 w-full max-w-full">
              <StatCard label="CPU" value={`${(server.resources.cpu_absolute ?? 0).toFixed(1)}%`} icon={Cpu} />
              <StatCard label="Memory" value={formatBytes(server.resources.memory_bytes ?? 0)} icon={MemoryStick} />
              <StatCard label="Disk" value={formatBytes(server.resources.disk_bytes ?? 0)} icon={HardDrive} />
              <StatCard label="Network" value={`up ${formatBytes(server.resources.network?.tx_bytes ?? 0)} dn ${formatBytes(server.resources.network?.rx_bytes ?? 0)}`} icon={Network} />
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0 max-w-[100vw] box-border overflow-x-hidden">
            {activeTab === "console" && <ConsoleTab serverId={id} />}
            {activeTab === "stats" && <StatsTab serverId={id} server={server} />}
            {activeTab === "files" && <FilesTab serverId={id} sftpInfo={server?.sftp} editorSettings={editorSettings} />}
            {activeTab === "startup" && <StartupTab serverId={id} />}
            {activeTab === "databases" && <DatabasesTab serverId={id} />}
            {activeTab === "schedules" && <SchedulesTab serverId={id} />}
            {activeTab === "network" && <NetworkTab serverId={id} />}
            {activeTab === "mounts" && <MountsTab serverId={id} />}
            {activeTab === "backups" && <BackupsTab serverId={id} />}
            {activeTab === "activity" && <ActivityTab serverId={id} />}
            {activeTab === "subusers" && <SubusersTab serverId={id} />}
            {activeTab === "settings" && <SettingsTab serverId={id} server={server} onDelete={deleteServer} reload={loadServer} />}
          </div>
        </div>
      </ScrollArea>

      {/* Power confirmation dialog */}
      <Dialog open={powerDialogOpen} onOpenChange={(open) => { if (!open) { setPowerDialogOpen(false); setPendingPowerAction(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirm Action</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">Are you sure you want to <span className="font-medium text-foreground">{pendingPowerAction?.toUpperCase()}</span> the server <span className="font-medium">{server.name || server.uuid || id}</span>?</p>
            {pendingPowerAction === 'kill' && (
              <p className="text-xs text-destructive mt-2">Killing a server forcibly terminates its process immediately. Data loss may occur.</p>
            )}
          </div>
          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setPowerDialogOpen(false); setPendingPowerAction(null); }} disabled={powerLoading}>Cancel</Button>
              <Button variant={pendingPowerAction === 'kill' ? 'destructive' : 'default'} onClick={doConfirmedPowerAction} disabled={powerLoading}>
                {powerLoading ? 'Processing...' : (pendingPowerAction ? (pendingPowerAction.charAt(0).toUpperCase() + pendingPowerAction.slice(1)) : 'Confirm')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => { if (!open) { setTransferDialogOpen(false); setTransferNodeId(null); setTransferError(null); } }}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Transfer Server</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">Select the destination node to transfer this server to. This may take a few minutes.</p>
            <div>
              <label className="text-xs font-medium text-foreground">Destination Node</label>
              <select
                value={transferNodeId ?? ''}
                onChange={(e) => setTransferNodeId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="">Select a node...</option>
                {transferNodes.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.name || n.nodeId || n.id} {n.nodeType ? `(${n.nodeType})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {transferError && <p className="text-xs text-destructive">{transferError}</p>}
            <p className="text-xs text-muted-foreground">The source node will stream the server data to the destination node. Make sure both nodes are online.</p>
          </div>
          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)} disabled={transferLoading}>Cancel</Button>
              <Button variant="default" onClick={doTransfer} disabled={transferLoading || !transferNodeId}>
                {transferLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Transfer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-1 sm:p-2 min-w-0 max-w-full w-full">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-sm font-mono font-medium text-foreground">{value}</p>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function ConsoleTab({ serverId }: { serverId: string }) {
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

      // Command history
      const history: string[] = []
      let historyIdx = -1

      // Handle keyboard input inside the terminal
      term.onKey(({ key, domEvent }: { key: string; domEvent: KeyboardEvent }) => {
        const code = domEvent.keyCode

        if (code === 13) {
          // Enter — send command
          const cmd = inputBuf.current
          term.write("\r\n")
          if (cmd.trim()) {
            history.unshift(cmd)
            if (history.length > 200) history.pop()
            historyIdx = -1

            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "send command", args: [cmd] }))
            } else {
              // Fallback: HTTP
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
          // Backspace
          if (inputBuf.current.length > 0) {
            inputBuf.current = inputBuf.current.slice(0, -1)
            term.write("\b \b")
          }
          return
        }

        if (code === 38) {
          // Arrow up — history back
          if (history.length > 0 && historyIdx < history.length - 1) {
            historyIdx++
            // Erase current input
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
          // Arrow down — history forward
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

        // Ignore other control keys
        if (domEvent.ctrlKey || domEvent.altKey || domEvent.metaKey) {
          // Allow Ctrl+C to copy selected text (don't intercept)
          if (domEvent.ctrlKey && code === 67 && term.hasSelection()) return
          // Ctrl+C with no selection — send to server as interrupt
          if (domEvent.ctrlKey && code === 67) {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "send command", args: ["\x03"] }))
            }
            inputBuf.current = ""
            term.write("^C\r\n")
            return
          }
          // Ctrl+L — clear terminal
          if (domEvent.ctrlKey && code === 76) {
            term.clear()
            return
          }
          return
        }

        // Printable characters
        if (key.length === 1 && key.charCodeAt(0) >= 32) {
          inputBuf.current += key
          term.write(key)
        }
      })

      // Also handle paste via onData (covers Ctrl+V / right-click paste)
      term.onData((data: string) => {
        // onKey handles single keypresses; onData fires for pastes (multi-char)
        if (data.length > 1) {
          // Filter out control sequences from paste
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
              term.writeln(
                `\x1b[90mDisconnected from console (code ${ev.code} ${ev.reason || ''}).\x1b[0m`
              )
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
      {/* Mobile command input — visible only on small screens */}
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

// ============================================
// Stats Tab — Proxmox-style resource charts
// ============================================
function StatsTab({ serverId, server: serverProp }: { serverId: string; server: any }) {
  const [history, setHistory] = useState<any[]>([])
  const [live, setLive] = useState<any>(null)
  const [nodeInfo, setNodeInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState<"1h" | "6h" | "24h" | "7d">("1h")
  const [localPoints, setLocalPoints] = useState<any[]>([])
  const [Area, setArea] = useState<any>(null)
  const [ResponsiveContainer, setResponsiveContainer] = useState<any>(null)
  const [XAxis, setXAxis] = useState<any>(null)
  const [YAxis, setYAxis] = useState<any>(null)
  const [CartesianGrid, setCartesianGrid] = useState<any>(null)
  const [Tooltip, setTooltip] = useState<any>(null)
  const [AreaChart, setAreaChart] = useState<any>(null)
  const [Legend, setLegend] = useState<any>(null)
  const [rechartsReady, setRechartsReady] = useState(false)

  // dynamically import recharts to avoid SSR issues
  useEffect(() => {
    import("recharts").then((mod) => {
      setArea(() => mod.Area)
      setResponsiveContainer(() => mod.ResponsiveContainer)
      setXAxis(() => mod.XAxis)
      setYAxis(() => mod.YAxis)
      setCartesianGrid(() => mod.CartesianGrid)
      setTooltip(() => mod.Tooltip)
      setAreaChart(() => mod.AreaChart)
      setLegend(() => mod.Legend)
      setRechartsReady(true)
    })
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [histData, liveData, nodeData] = await Promise.all([
        apiFetch(API_ENDPOINTS.serverStatsHistory.replace(":id", serverId) + `?window=${timeWindow}`).catch(() => []),
        apiFetch(API_ENDPOINTS.serverStats.replace(":id", serverId)).catch(() => null),
        apiFetch(API_ENDPOINTS.serverStatsNode.replace(":id", serverId)).catch(() => null),
      ])
      setHistory(Array.isArray(histData) ? histData : [])
      setLive(liveData)
      setNodeInfo(nodeData)
    } finally {
      setLoading(false)
    }
  }, [serverId, timeWindow])

  useEffect(() => {
    setLoading(true)
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  // Accumulate rolling realtime data points from serverProp.resources (updated every 15s by parent)
  useEffect(() => {
    const r = serverProp?.resources
    if (!r || (r.cpu_absolute == null && r.memory_bytes == null)) return
    const point = {
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ts: Date.now(),
      cpu: Number((r.cpu_absolute ?? 0).toFixed(1)),
      memMB: Math.round((r.memory_bytes ?? 0) / 1024 / 1024),
      diskMB: Math.round((r.disk_bytes ?? 0) / 1024 / 1024),
      rxMB: Math.round(((r.network?.rx_bytes ?? 0) / 1024 / 1024) * 100) / 100,
      txMB: Math.round(((r.network?.tx_bytes ?? 0) / 1024 / 1024) * 100) / 100,
    }
    setLocalPoints((prev) => {
      const next = [...prev, point]
      return next.length > 120 ? next.slice(-120) : next // keep ~30 min at 15s intervals
    })
  }, [serverProp?.resources])

  // Transform SocData metrics into chart-friendly points
  const chartData = history.map((entry: any) => {
    const m = entry.metrics || {}
    // Wings WebSocket stats typically send: { cpu_absolute, memory_bytes, memory_limit_bytes, disk_bytes, network: { rx_bytes, tx_bytes }, state }
    // But the shape may vary — normalise gracefully
    const cpu = m.cpu_absolute ?? m.cpu ?? m.proc?.cpu?.total ?? 0
    const memBytes = m.memory_bytes ?? m.memory ?? m.proc?.memory?.total ?? 0
    const diskBytes = m.disk_bytes ?? m.disk ?? 0
    const rxBytes = m.network?.rx_bytes ?? m.network?.rx ?? 0
    const txBytes = m.network?.tx_bytes ?? m.network?.tx ?? 0
    const ts = new Date(entry.timestamp).getTime()
    return {
      time: new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ts,
      cpu: Number(cpu.toFixed ? cpu.toFixed(1) : cpu),
      memMB: Math.round(memBytes / 1024 / 1024),
      diskMB: Math.round(diskBytes / 1024 / 1024),
      rxMB: Math.round((rxBytes / 1024 / 1024) * 100) / 100,
      txMB: Math.round((txBytes / 1024 / 1024) * 100) / 100,
    }
  })

  // Node system info
  // Wings /system/stats wraps live data under cpu.used, memory.used, memory.total
  const nodeCpu = nodeInfo?.cpu?.used ?? null
  const nodeMemUsed = nodeInfo?.memory?.used ?? null
  const nodeMemTotal = nodeInfo?.memory?.total ?? null

  // Live stats cards — fall back to server.resources (fetched by parent) when SocData has nothing yet
  const liveSource = (live && (live.cpu_absolute != null || live.memory_bytes != null)) ? live : (serverProp?.resources ?? null)
  const liveCpu = liveSource?.cpu_absolute ?? liveSource?.proc?.cpu?.total ?? 0
  const liveMem = liveSource?.memory_bytes ?? liveSource?.proc?.memory?.total ?? 0
  const liveMemLimit = liveSource?.memory_limit_bytes ?? liveSource?.proc?.memory?.limit ?? 0
  const liveDisk = liveSource?.disk_bytes ?? liveSource?.disk ?? 0
  const liveNetRx = liveSource?.network?.rx_bytes ?? 0
  const liveNetTx = liveSource?.network?.tx_bytes ?? 0

  const hasLiveData = liveCpu > 0 || liveMem > 0 || liveDisk > 0

  // Prefer SocData history; fall back to locally accumulated realtime points
  const effectiveChartData = chartData.length > 0 ? chartData : localPoints

  if (loading && !rechartsReady) return <LoadingState />

  const windowOpts: { value: "1h" | "6h" | "24h" | "7d"; label: string }[] = [
    { value: "1h", label: "1 Hour" },
    { value: "6h", label: "6 Hours" },
    { value: "24h", label: "24 Hours" },
    { value: "7d", label: "7 Days" },
  ]

  const chartColors = {
    cpu: "#3b82f6",
    mem: "#8b5cf6",
    disk: "#f59e0b",
    rx: "#22c55e",
    tx: "#ef4444",
  }

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const fmtLabel = (typeof label === 'number' || /^\\\d{13}\b$/.test(String(label)))
      ? new Date(Number(label)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : String(label)
    const unitFor = (key: string) => (key === 'cpu' ? '%' : key.endsWith('MB') ? ' MB' : '')
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
        <p className="text-xs text-muted-foreground mb-1">{fmtLabel}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
            {p.name}: {p.value}{p.unit || unitFor(p.dataKey) || ''}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with time window selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Resource Usage</h3>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
          {windowOpts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeWindow(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeWindow === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="CPU" value={`${Number(liveCpu).toFixed(1)}%`} color={chartColors.cpu} />
        <MiniStat label="Memory" value={formatBytes(liveMem)} sub={liveMemLimit ? `/ ${formatBytes(liveMemLimit)}` : undefined} color={chartColors.mem} />
        <MiniStat label="Disk" value={formatBytes(liveDisk)} color={chartColors.disk} />
        <MiniStat label="Net ↑" value={formatBytes(liveNetTx)} color={chartColors.tx} />
        <MiniStat label="Net ↓" value={formatBytes(liveNetRx)} color={chartColors.rx} />
      </div>

      {rechartsReady && effectiveChartData.length > 0 ? (
        <>
          {/* CPU Chart */}
          <ChartCard title="CPU Usage (%)" icon={Cpu}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.cpu} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.cpu} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke={chartColors.cpu} fill="url(#cpuGrad)" strokeWidth={2} unit="%" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Memory Chart */}
          <ChartCard title="Memory Usage (MB)" icon={MemoryStick}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.mem} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.mem} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="memMB" name="Memory" stroke={chartColors.mem} fill="url(#memGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Disk Chart */}
          <ChartCard title="Disk Usage (MB)" icon={HardDrive}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.disk} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.disk} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="diskMB" name="Disk" stroke={chartColors.disk} fill="url(#diskGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Network Chart */}
          <ChartCard title="Network Traffic (MB)" icon={Network}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.rx} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.rx} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.tx} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.tx} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="rxMB" name="Download (RX)" stroke={chartColors.rx} fill="url(#rxGrad)" strokeWidth={2} unit=" MB" dot={false} />
                <Area type="monotone" dataKey="txMB" name="Upload (TX)" stroke={chartColors.tx} fill="url(#txGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      ) : !loading ? (
        effectiveChartData.length > 0 ? (
          <div className="rounded-xl border border-border bg-secondary/10 p-4 text-center">
            <p className="text-xs text-muted-foreground">Showing live data — historical data accumulates over time.</p>
          </div>
        ) : (
        <div className="rounded-xl border border-border bg-secondary/10 p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No data available yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Stats are collected while the server is running. Check back in a few minutes.</p>
        </div>
        )
      ) : (
        <LoadingState />
      )}

      {/* Node Information */}
      {nodeInfo && Object.keys(nodeInfo).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Node System</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {nodeCpu !== null && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Node CPU</p>
                <p className="text-sm font-mono font-medium text-foreground">{Number(nodeCpu).toFixed(1)}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(Number(nodeCpu), 100)}%` }} />
                </div>
              </div>
            )}
            {nodeMemUsed !== null && nodeMemTotal !== null && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Node Memory</p>
                <p className="text-sm font-mono font-medium text-foreground">{formatBytes(nodeMemUsed)} / {formatBytes(nodeMemTotal)}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${Math.min((nodeMemUsed / nodeMemTotal) * 100, 100)}%` }} />
                </div>
              </div>
            )}
            {(nodeInfo.version || nodeInfo.kernel_version) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Version</p>
                <p className="text-sm font-mono font-medium text-foreground">{nodeInfo.version || nodeInfo.kernel_version || "\u2014"}</p>
              </div>
            )}
            {(nodeInfo.architecture || nodeInfo.arch) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Architecture</p>
                <p className="text-sm font-mono font-medium text-foreground">{nodeInfo.architecture || nodeInfo.arch}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 min-w-0 max-w-full">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-mono font-semibold text-foreground">
        {value}
        {sub && <span className="text-xs font-normal text-muted-foreground ml-1">{sub}</span>}
      </p>
    </div>
  )
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0 max-w-full">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  )
}

// ============================================
// Files Tab
// ============================================
function FilesTab({ serverId, sftpInfo, editorSettings }: { serverId: string; sftpInfo?: { host: string; port: number; username?: string; proxied?: boolean } | null; editorSettings?: EditorSettings }) {
  const [path, setPath] = useState("/")
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [showNewFileForm, setShowNewFileForm] = useState(false)
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const breadcrumbs = path.split("/").filter(Boolean)

  const loadFiles = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFiles.replace(":id", serverId) + `?path=${encodeURIComponent(p)}`
      )
      setFiles(Array.isArray(data) ? data : [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    loadFiles(path)
  }, [path, loadFiles])

  useEffect(() => {
    setSelectedNames([])
  }, [path])

  const displayPath = (p: string) => `/home/container${p.startsWith("/") ? p : `/${p}`}`

  const fileNameOf = (f: any) => f.name || f.attributes?.name || ""
  const selectableFiles = files.map(fileNameOf).filter(Boolean)
  const allSelected = selectableFiles.length > 0 && selectableFiles.every((n) => selectedNames.includes(n))

  const toggleOne = (name: string) => {
    setSelectedNames((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])
  }

  const toggleAll = () => {
    setSelectedNames((prev) => allSelected ? [] : selectableFiles)
  }

  const openFile = async (filePath: string) => {
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFileContents.replace(":id", serverId) + `?path=${encodeURIComponent(filePath)}`
      )
      setFileContent(typeof data === "string" ? data : JSON.stringify(data, null, 2))
      setEditingFile(filePath)
    } catch (e: any) {
      alert("Failed to open file: " + e.message)
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: editingFile, content: fileContent }),
      })
      setEditingFile(null)
    } catch (e: any) {
      alert("Save failed: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteFile = async (filePath: string) => {
    if (!confirm(`Delete ${filePath}?`)) return
    try {
      await apiFetch(API_ENDPOINTS.serverFileDelete.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: filePath }),
      })
      loadFiles(path)
    } catch (e: any) {
      alert("Delete failed: " + e.message)
    }
  }

  const createDirectory = async () => {
    if (!newName.trim()) return
    const trimmed = newName.trim()
    const existing = files.find((f: any) => (f.name || f.attributes?.name) === trimmed)
    if (existing) {
      const isDir = existing.is_file === false || existing.type === "folder" || existing.type === "directory"
      alert(isDir ? `A directory named "${trimmed}" already exists.` : `A file named "${trimmed}" already exists.`)
      return
    }
    try {
      await apiFetch(API_ENDPOINTS.serverFileCreateDir.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: path + trimmed }),
      })
      setNewName("")
      setShowNewFolderForm(false)
      loadFiles(path)
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const createNewFile = async () => {
    if (!newName.trim()) return
    const trimmed = newName.trim()
    const existing = files.find((f: any) => (f.name || f.attributes?.name) === trimmed)
    if (existing) {
      const isDir = existing.is_file === false || existing.type === "folder" || existing.type === "directory"
      alert(isDir ? `Cannot create file "${trimmed}" — a directory with that name already exists.` : `A file named "${trimmed}" already exists. Opening it instead.`)
      if (!isDir) openFile(path + trimmed)
      return
    }
    try {
      await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: path + trimmed, content: "" }),
      })
      setNewName("")
      setShowNewFileForm(false)
      loadFiles(path)
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const archiveSelected = async () => {
    if (selectedNames.length === 0) return
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileArchive.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ root: path, files: selectedNames }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Archive failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const moveSelected = async () => {
    if (selectedNames.length === 0) return
    const destination = prompt("Move selected items to folder (relative to current directory). Example: backups or nested/folder", "")
    if (destination === null) return
    const cleanDest = destination.trim().replace(/^\/+|\/+$/g, "")
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileMove.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ root: path, files: selectedNames, destination: cleanDest }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Move failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (selectedNames.length === 0) return
    if (!confirm(`Delete ${selectedNames.length} selected item(s)?`)) return
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileDelete.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path, files: selectedNames, bulk: true }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Bulk delete failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  // File Editor View
  if (editingFile) {
    const ext = editingFile.split(".").pop()?.toLowerCase() || ""
    const langMap: Record<string, string> = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      json: "json", yml: "yaml", yaml: "yaml", xml: "xml", html: "html",
      css: "css", scss: "scss", less: "less", md: "markdown", sql: "sql",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      sh: "shell", bash: "shell", zsh: "shell", toml: "ini", ini: "ini",
      cfg: "ini", conf: "ini", properties: "ini", env: "ini",
      dockerfile: "dockerfile", lua: "lua", php: "php", c: "c", cpp: "cpp",
      h: "c", hpp: "cpp", cs: "csharp", kt: "kotlin", swift: "swift",
    }
    const monacoLang = langMap[ext] || "plaintext"

    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button onClick={() => setEditingFile(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-foreground truncate">{displayPath(editingFile)}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEditingFile(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <MonacoFileEditor
          value={fileContent}
          onChange={(v) => setFileContent(v ?? "")}
          language={monacoLang}
          editorSettings={editorSettings}
        />
      </div>
    )
  }

  // File Browser View
  return (
    <div className="flex flex-col">
      {/* SFTP Banner */}
      {sftpInfo && sftpInfo.username && (
        <div className="flex items-center gap-3 border-b border-border bg-secondary/10 px-4 py-2.5">
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
            sftp {sftpInfo.username}@{sftpInfo.host} -P {sftpInfo.port}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(`sftp ${sftpInfo!.username}@${sftpInfo!.host} -P ${sftpInfo!.port}`)}
            className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          {sftpInfo.proxied && <span className="text-[10px] text-yellow-400/80 shrink-0">proxied</span>}
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm">
          <button onClick={() => setPath("/")} className="text-primary hover:underline font-mono">/home/container</button>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => setPath("/" + breadcrumbs.slice(0, i + 1).join("/") + "/")}
                className="text-primary hover:underline font-mono"
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={async (e) => {
            const files = e.target.files
            if (!files || files.length === 0) return
            setUploading(true)
            try {
              for (let i = 0; i < files.length; i++) {
                const f = files[i]
                const content = await f.text()
                await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
                  method: "POST",
                  body: JSON.stringify({ path: path + f.name, content }),
                })
              }
              await loadFiles(path)
            } catch (err: any) {
              alert('Upload failed: ' + (err?.message || err))
            } finally {
              setUploading(false)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }
          }} />
          {selectedNames.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedNames.length} selected</span>
              <button
c                 onClick={archiveSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
              >
                Archive Selected
              </button>
              <button
                onClick={moveSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
              >
                Move Selected
              </button>
              <button
                onClick={deleteSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-destructive/20 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/30 disabled:opacity-60"
              >
                Delete Selected
              </button>
            </>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
            disabled={uploading || bulkBusy}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Upload
          </button>
          <button
            onClick={() => { setShowNewFileForm(true); setShowNewFolderForm(false); setNewName("") }}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <FilePlus className="h-3 w-3" /> New File
          </button>
          <button
            onClick={() => { setShowNewFolderForm(true); setShowNewFileForm(false); setNewName("") }}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <FolderPlus className="h-3 w-3" /> New Folder
          </button>
          <button
            onClick={() => loadFiles(path)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* New File/Folder Form */}
      {(showNewFileForm || showNewFolderForm) && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-secondary/20">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={showNewFileForm ? "filename.txt" : "folder-name"}
            className="rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground outline-none flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") showNewFileForm ? createNewFile() : createDirectory()
              if (e.key === "Escape") { setShowNewFileForm(false); setShowNewFolderForm(false) }
            }}
          />
          <Button size="sm" onClick={showNewFileForm ? createNewFile : createDirectory}>Create</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowNewFileForm(false); setShowNewFolderForm(false) }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* File Table */}
      <div>
        <div className="hidden sm:grid grid-cols-[28px_1fr_100px_160px_100px] gap-2 bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3.5 w-3.5"
            />
          </span>
          <span>Name</span>
          <span>Size</span>
          <span>Modified</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Back button */}
        {path !== "/" && (
          <button
            onClick={() => {
              const parts = path.split("/").filter(Boolean)
              parts.pop()
              setPath(parts.length ? "/" + parts.join("/") + "/" : "/")
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/20 border-t border-border"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> ..
          </button>
        )}

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Empty directory
          </div>
        ) : (
          files.map((file: any, i: number) => {
            const fname = file.name || file.attributes?.name || "unknown"
            const isDir = file.directory === true || file.is_file === false || file.type === "folder" || file.type === "directory"
            const fsize = file.size || file.attributes?.size || 0
            const fmod = file.modified || file.modified_at || file.attributes?.modified_at

            return (
              <div
                key={i}
                className="group flex items-center justify-between sm:grid sm:grid-cols-[28px_1fr_100px_160px_100px] gap-2 px-4 py-2.5 text-sm border-t border-border hover:bg-secondary/20 transition-colors"
              >
                <span>
                  <input
                    type="checkbox"
                    checked={selectedNames.includes(fname)}
                    onChange={() => toggleOne(fname)}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <button
                  onClick={() => isDir ? setPath(path + fname + "/") : openFile(path + fname)}
                  className="flex items-center gap-2 text-foreground text-left hover:text-primary transition-colors truncate min-w-0"
                >
                  {isDir ? (
                    <Folder className="h-4 w-4 text-primary/70 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate">{fname}</span>
                  <span className="text-xs text-muted-foreground sm:hidden flex-shrink-0">
                    {!isDir ? formatBytes(fsize) : ""}
                  </span>
                </button>
                <span className="hidden sm:block text-xs text-muted-foreground">
                  {!isDir ? formatBytes(fsize) : "\u2014"}
                </span>
                <span className="hidden sm:block text-xs text-muted-foreground">
                  {fmod ? new Date(fmod).toLocaleDateString() : "\u2014"}
                </span>
                <div className="flex items-center justify-end gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {!isDir && (
                    <button
                      onClick={() => openFile(path + fname)}
                      className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={async () => {
                        const newName = prompt('Rename file to', fname);
                        if (!newName || newName === fname) return;
                        try {
                          await apiFetch(API_ENDPOINTS.serverFileRename.replace(":id", serverId), {
                            method: 'PUT',
                            body: JSON.stringify({
                              root: path,
                              files: [{ from: fname, to: newName }],
                            }),
                          });
                          await loadFiles(path);
                        } catch (e: any) {
                          alert('Rename failed: ' + (e?.message || e));
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                      title="Rename"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            API_ENDPOINTS.serverFileDownload.replace(":id", serverId) + `?path=${encodeURIComponent(path + fname)}`,
                            {
                              credentials: 'include',
                              headers: {
                                Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
                              },
                            }
                          );
                          if (!res.ok) {
                            const text = await res.text();
                            throw new Error(text || `HTTP ${res.status}`);
                          }
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = fname;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        } catch (e: any) {
                          alert('Download failed: ' + (e?.message || e));
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteFile(path + fname)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================
// Databases Tab
// ============================================
function DatabasesTab({ serverId }: { serverId: string }) {
  const [databases, setDatabases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [creds, setCreds] = useState<Record<number, any>>({})
  const [loadingCreds, setLoadingCreds] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDatabases.replace(":id", serverId))
      setDatabases(Array.isArray(data) ? data : [])
    } catch {
      setDatabases([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createDb = async () => {
    setCreating(true)
    setCreateError("")
    try {
      const data = await apiFetch(API_ENDPOINTS.serverDatabases.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ label: formLabel || undefined }),
      })
      setDatabases(prev => [...prev, { ...data, password: "***" }])
      if (data.id && data.password && data.password !== "***") {
        setCreds(prev => ({ ...prev, [data.id]: data }))
      }
      setFormLabel("")
      setShowForm(false)
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create database")
    } finally {
      setCreating(false)
    }
  }

  const deleteDb = async (dbId: number) => {
    if (!confirm("Delete this database? This will permanently DROP the database on the server.")) return
    setDeletingId(dbId)
    try {
      await apiFetch(
        `${API_ENDPOINTS.serverDatabases.replace(":id", serverId)}/${dbId}`,
        { method: "DELETE" }
      )
      setDatabases(prev => prev.filter((d: any) => d.id !== dbId))
      setCreds(prev => { const c = { ...prev }; delete c[dbId]; return c })
    } finally {
      setDeletingId(null)
    }
  }

  const viewCreds = async (dbId: number) => {
    if (creds[dbId]) {
      setCreds(prev => { const c = { ...prev }; delete c[dbId]; return c })
      return
    }
    setLoadingCreds(prev => ({ ...prev, [dbId]: true }))
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverDatabaseCredentials
          .replace(":id", serverId)
          .replace(":dbId", String(dbId))
      )
      setCreds(prev => ({ ...prev, [dbId]: data }))
    } finally {
      setLoadingCreds(prev => ({ ...prev, [dbId]: false }))
    }
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function PasswordReveal({ value, copyKey }: { value: string; copyKey: string }) {
    const [display, setDisplay] = useState("")
    const raf = useRef<number | null>(null)
    const progress = useRef(0)
    const initialMaskRef = useRef<string | null>(null)

    useEffect(() => {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>/?"
      const mask = Array.from({ length: Math.max(0, value.length) }).map(() => chars[Math.floor(Math.random() * chars.length)]).join("")
      initialMaskRef.current = mask
      setDisplay(mask)
      return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    }, [value])

    const startReveal = () => {
      progress.current = 0
      const len = value.length
      const step = () => {
        progress.current += 0.03
        const p = Math.min(1, progress.current)
        const revealed = Math.floor(p * len)
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>/?"
        let out = ""
        for (let i = 0; i < len; i++) {
          if (i < revealed) out += value[i]
          else out += chars[Math.floor(Math.random() * chars.length)]
        }
        setDisplay(out)
        if (p < 1) raf.current = requestAnimationFrame(step)
        else setDisplay(value)
      }
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(step)
    }

    const stopReveal = () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      const len = value.length
      let encProgress = 0
      const target = initialMaskRef.current ?? Array.from({ length: Math.max(0, len) }).map(() => "•").join("")
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>/?"
      const stepEnc = () => {
        encProgress += 0.04
        const p = Math.min(1, encProgress)
        const revealed = Math.floor((1 - p) * len)
        let out = ""
        for (let i = 0; i < len; i++) {
          if (i < revealed) out += value[i]
          else out += chars[Math.floor(Math.random() * chars.length)]
        }
        setDisplay(out)
        if (p < 1) raf.current = requestAnimationFrame(stepEnc)
        else setDisplay(target)
      }
      raf.current = requestAnimationFrame(stepEnc)
    }

    return (
      <div
        onMouseEnter={startReveal}
        onMouseLeave={stopReveal}
        onClick={() => copyText(value, copyKey)}
        className="cursor-pointer select-none w-full rounded px-2 py-0.5 bg-secondary/40 text-xs"
      >
        <div className="truncate">{display}</div>
      </div>
    )
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage MySQL databases attached to this server.</p>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setCreateError("") }}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Database
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-4 mb-4 space-y-3">
          <p className="text-sm font-medium">Create Database</p>
          <div>
            <label className="text-xs font-medium text-foreground">Label (optional)</label>
            <input
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              placeholder="e.g. Primary DB"
              value={formLabel}
              onChange={e => setFormLabel(e.target.value)}
            />
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={createDb} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {creating ? "Creating…" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {databases.length === 0 ? (
        <EmptyState message="No databases configured for this server." />
      ) : (
        <div className="space-y-3">
          {databases.map((db: any) => (
            <div key={db.id} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {db.label ? `${db.label}` : db.name}
                  </p>
                  {db.label && (
                    <p className="text-xs text-muted-foreground mt-0.5">{db.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">User: {db.username}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewCreds(db.id)}
                    disabled={loadingCreds[db.id]}
                  >
                    {loadingCreds[db.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : creds[db.id] ? "Hide" : "Credentials"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteDb(db.id)}
                    disabled={deletingId === db.id}
                  >
                    {deletingId === db.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {creds[db.id] && (
                <div className="rounded-md bg-background border border-border p-3 space-y-2">
                  {[
                    { label: "Host", value: `${creds[db.id].host}:${creds[db.id].port}`, key: `host-${db.id}` },
                    { label: "Database", value: creds[db.id].name, key: `db-${db.id}` },
                    { label: "Username", value: creds[db.id].username, key: `user-${db.id}` },
                    { label: "Password", value: creds[db.id].password, key: `pass-${db.id}` },
                    { label: "JDBC", value: creds[db.id].jdbc, key: `jdbc-${db.id}` },
                  ].map(row => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{row.label}</span>
                      {row.label === "Password" ? (
                        <PasswordReveal value={row.value} copyKey={row.key} />
                      ) : (
                        <code className="text-xs bg-secondary/40 rounded px-2 py-0.5 flex-1 truncate">{row.value}</code>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs shrink-0"
                        onClick={() => copyText(row.value, row.key)}
                      >
                        {copied === row.key ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Schedules Tab
// ============================================
function SchedulesTab({ serverId }: { serverId: string }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", cron_minute: "*", cron_hour: "*", cron_day_of_month: "*", cron_month: "*", cron_day_of_week: "*", is_active: true })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverSchedules.replace(":id", serverId))
      setSchedules(Array.isArray(data) ? data : [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createSchedule = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverSchedules.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({ name: "", cron_minute: "*", cron_hour: "*", cron_day_of_month: "*", cron_month: "*", cron_day_of_week: "*", is_active: true })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteSchedule = async (sid: string) => {
    if (!confirm("Delete this schedule?")) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverScheduleDelete.replace(":id", serverId).replace(":sid", sid),
        { method: "DELETE" }
      )
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Scheduled tasks for this server.</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Schedule
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-secondary/20 p-4 mb-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Restart every night"
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none"
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(["cron_minute", "cron_hour", "cron_day_of_month", "cron_month", "cron_day_of_week"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <label className="text-xs text-muted-foreground capitalize">{field.replace("cron_", "").replace(/_/g, " ")}</label>
                <input
                  type="text"
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full rounded-md border border-border bg-input px-2 py-1.5 text-sm font-mono text-foreground outline-none text-center"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={createSchedule} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Create
            </Button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState message="No schedules configured." />
      ) : (
        <div className="space-y-3">
          {schedules.map((sched: any) => (
            <div key={sched.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{sched.name || "Unnamed Schedule"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sched.cron_minute} {sched.cron_hour} {sched.cron_day_of_month} {sched.cron_month} {sched.cron_day_of_week}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Status: {sched.is_active ? "Active" : "Inactive"} &middot; Last run: {sched.last_run_at ? new Date(sched.last_run_at).toLocaleString() : "Never"}
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => deleteSchedule(String(sched.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Network Tab
// ============================================
function NetworkTab({ serverId }: { serverId: string }) {
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverAllocations.replace(":id", serverId))
      .then((data) => setAllocations(Array.isArray(data) ? data : []))
      .catch(() => setAllocations([]))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <LoadingState />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Network allocations for this server.</p>
      </div>
      {allocations.length === 0 ? (
        <EmptyState message="No network allocations found." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Address</span>
            <span>Port</span>
            <span>Type</span>
          </div>
          {allocations.map((alloc: any, i: number) => {
            const displayHost = alloc.fqdn || alloc.ip || alloc.alias || "—"
            return (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-2.5 text-sm border-t border-border">
              <div>
                <span className="font-mono text-foreground">{displayHost}</span>
                {alloc.fqdn && alloc.ip && alloc.fqdn !== alloc.ip && (
                  <span className="ml-2 text-xs text-muted-foreground font-mono">({alloc.ip})</span>
                )}
              </div>
              <span className="font-mono text-foreground">{alloc.port || "—"}</span>
              <Badge variant="outline" className="w-fit text-xs">{alloc.is_default ? "Primary" : "Secondary"}</Badge>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// Backups Tab
// ============================================
function BackupsTab({ serverId }: { serverId: string }) {
  const [backups, setBackups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId))
      setBackups(Array.isArray(data) ? data : [])
    } catch {
      setBackups([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { load() }, [load])

  const createBackup = async () => {
    setCreating(true)
    try {
      await apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  const restoreBackup = async (bid: string) => {
    if (!confirm("Restore this backup? Current server data may be overwritten.")) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverBackupRestore.replace(":id", serverId).replace(":bid", bid),
        { method: "POST" }
      )
      alert("Restore initiated.")
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const deleteBackup = async (bid: string) => {
    if (!confirm("Delete this backup permanently?")) return
    try {
      await apiFetch(
        API_ENDPOINTS.serverBackupDelete.replace(":id", serverId).replace(":bid", bid),
        { method: "DELETE" }
      )
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Manage server backups.</p>
        <Button size="sm" onClick={createBackup} disabled={creating}>
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Create Backup
        </Button>
      </div>

      {backups.length === 0 ? (
        <EmptyState message="No backups found. Create one to get started." />
      ) : (
        <div className="space-y-3">
          {backups.map((backup: any) => (
            <div key={backup.uuid || backup.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{backup.name || backup.uuid || "Backup"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Size: {formatBytes(backup.bytes || 0)} &middot; Created: {backup.created_at ? new Date(backup.created_at).toLocaleString() : "\u2014"}
                </p>
                {backup.is_successful === false && (
                  <p className="text-xs text-destructive mt-0.5">Backup failed or incomplete</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => restoreBackup(String(backup.uuid || backup.id))}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteBackup(String(backup.uuid || backup.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Startup Tab — Editable Environment Variables
// ============================================
function StartupTab({ serverId }: { serverId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startup, setStartup] = useState<any>(null)
  const [editedEnv, setEditedEnv] = useState<Record<string, string>>({})
  const [donePatterns, setDonePatterns] = useState<string[]>([])

  const normalizeDonePatterns = (p: any): string[] => {
    if (Array.isArray(p)) return p.map((x) => (x == null ? "" : String(x)))
    if (p == null) return [""]
    return [String(p)]
  }

  useEffect(() => {
    apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId))
      .then((data) => {
        setStartup(data)
        setEditedEnv(data?.environment || {})
        const patterns = data?.processConfig?.startup?.done
        setDonePatterns(normalizeDonePatterns(patterns))
        // Some templates have no clear startup pattern..
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId])

  const saveEnv = async () => {
    setSaving(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId), {
        method: "PUT",
        body: JSON.stringify({
          environment: editedEnv,
          processConfig: { startup: { done: donePatterns.filter(p => p.length > 0) } },
        }),
      })
      if (res?.environment) setEditedEnv(res.environment)
      if (res?.processConfig?.startup?.done) setDonePatterns(normalizeDonePatterns(res.processConfig.startup.done))
      alert("Startup configuration saved.")
    } catch (e: any) {
      alert("Save failed: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!startup) return <EmptyState message="Failed to load startup configuration." />

  const envVarDefs: any[] = startup.envVars || []
  const allKeys = new Set([
    ...envVarDefs.map((v: any) => v.env_variable || v.key || v.name),
    ...Object.keys(editedEnv),
  ])

  return (
    <div className="p-6 space-y-6">
      {/* Startup info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Startup Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="Egg" value={startup.eggName} />
          <InfoRow label="Docker Image" value={startup.dockerImage || "\u2014"} mono />
        </div>
        {startup.startup && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-xs text-muted-foreground mb-1">Startup Command</p>
            <p className="text-sm font-mono text-foreground break-all">{startup.startup}</p>
          </div>
        )}
      </div>

      {/* Startup Detection (done patterns) */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Startup Detection</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Strings matched against console output to detect when the server has finished starting.
          If empty, the server will stay in &quot;starting&quot; state.
        </p>
        <div className="space-y-2">
          {donePatterns.map((pattern, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={pattern}
                onChange={(e) => {
                  const next = [...donePatterns]
                  next[i] = e.target.value
                  setDonePatterns(next)
                }}
                placeholder="e.g. Server started"
                className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm font-mono text-foreground outline-none"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDonePatterns(donePatterns.filter((_, j) => j !== i))}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDonePatterns([...donePatterns, ""])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Pattern
          </Button>
        </div>
      </div>

      {/* Environment Variables */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Environment Variables</h3>
          <Button size="sm" onClick={saveEnv} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
        <div className="space-y-3">
          {[...allKeys].map((key) => {
            const def = envVarDefs.find((v: any) => (v.env_variable || v.key || v.name) === key)
            const isEditable = def ? !!def.user_editable : true
            const description = def?.description || ""
            const name = def?.name || key

            return (
              <div key={key} className="rounded-lg border border-border bg-secondary/10 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-foreground">{name}</span>
                  <Badge variant="outline" className="text-[10px]">{key}</Badge>
                  {!isEditable && (
                    <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">Read Only</Badge>
                  )}
                </div>
                {description && (
                  <p className="text-xs text-muted-foreground mb-2">{description}</p>
                )}
                <input
                  type="text"
                  value={editedEnv[key] ?? ""}
                  onChange={(e) => setEditedEnv((prev) => ({ ...prev, [key]: e.target.value }))}
                  disabled={!isEditable}
                  className={`w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none ${
                    isEditable
                      ? "bg-input text-foreground"
                      : "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                  }`}
                />
              </div>
            )
          })}
          {allKeys.size === 0 && (
            <EmptyState message="No environment variables defined for this server." />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Mounts Tab
// ============================================
function MountsTab({ serverId }: { serverId: string }) {
  const [mounts, setMounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/servers/${serverId}/mounts`)
      .then((data) => setMounts(Array.isArray(data) ? data : []))
      .catch(() => setMounts([]))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <LoadingState />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Mounts allow you to bind host directories into your server container.
          </p>
        </div>
      </div>
      {mounts.length === 0 ? (
        <EmptyState message="No mounts configured for this server. Mounts are managed by administrators." />
      ) : (
        <div className="space-y-3">
          {mounts.map((mount: any, i: number) => (
            <div key={mount.id || i} className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Box className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">{mount.name || `Mount ${i + 1}`}</p>
                {mount.read_only && (
                  <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">Read Only</Badge>
                )}
              </div>
              {mount.description && (
                <p className="text-xs text-muted-foreground mb-2">{mount.description}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border bg-secondary/30 p-2">
                  <span className="text-muted-foreground">Source: </span>
                  <span className="font-mono text-foreground">{mount.source || "\u2014"}</span>
                </div>
                <div className="rounded border border-border bg-secondary/30 p-2">
                  <span className="text-muted-foreground">Target: </span>
                  <span className="font-mono text-foreground">{mount.target || "\u2014"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Settings Tab
// ============================================
function SettingsTab({ serverId, server, onDelete, reload }: { serverId: string; server: any; onDelete: () => void; reload: () => void }) {
  const [reinstalling, setReinstalling] = useState(false)

  const handleReinstall = async () => {
    if (!confirm("Reinstall this server? All files will be wiped and the server will be re-provisioned from its egg template.")) return
    setReinstalling(true)
    try {
      await apiFetch(API_ENDPOINTS.serverReinstall.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({}),
      })
      alert("Reinstall initiated. The server will restart shortly.")
      reload()
    } catch (e: any) {
      alert("Reinstall failed: " + e.message)
    } finally {
      setReinstalling(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Server Info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Server Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="UUID" value={server.uuid || serverId} mono />
          <InfoRow label="Name" value={server.name || "\u2014"} />
          <InfoRow label="Status" value={server.status || "\u2014"} />
          <InfoRow label="Node" value={server.node || "\u2014"} />
          <InfoRow label="Docker Image" value={server.container?.image || "\u2014"} mono />
          <InfoRow label="Startup Command" value={server.container?.startup || server.invocation || "\u2014"} mono />
        </div>
      </div>

      {/* Access */}
      {/* SSH Info should be same as SFTP, but it works only on wings-rs, I won't add killswitch for wings-go */}
      {server.sftp && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">External Access</h3>
          <div className="rounded-lg border border-border bg-secondary/10 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InfoRow label="Host" value={server.sftp.host} mono />
              <InfoRow label="Port" value={String(server.sftp.port)} mono />
              {server.sftp.username && <InfoRow label="Username" value={server.sftp.username} mono />}
            </div>
            {server.sftp.username && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-3 py-2 overflow-x-auto">
                  sftp {server.sftp.username}@{server.sftp.host} -P {server.sftp.port}
                </code>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigator.clipboard.writeText(`sftp ${server.sftp.username}@${server.sftp.host} -P ${server.sftp.port}`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {server.sftp.username && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-3 py-2 overflow-x-auto">
                  ssh {server.sftp.username}@{server.sftp.host} -p {server.sftp.port}
                </code>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigator.clipboard.writeText(`ssh ${server.sftp.username}@${server.sftp.host} -p ${server.sftp.port}`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {server.sftp.proxied && (
              <p className="text-[11px] text-yellow-400/80">Connected via backend SFTP proxy (node has no public SSL).</p>
            )}
            <p className="text-xs text-muted-foreground">Authentication: use your panel account password, or authenticate with an SSH key (manage in Profile -&gt; SSH Keys).</p>
          </div>
        </div>
      )}
      

      {/* Build Configuration */}
      {server.build && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Build Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Memory Limit" value={`${server.build.memory_limit || 0} MB`} />
            <InfoRow label="Disk Space" value={`${server.build.disk_space || 0} MB`} />
            <InfoRow label="CPU Limit" value={`${server.build.cpu_limit || 0}%`} />
            <InfoRow label="IO Weight" value={String(server.build.io_weight || 500)} />
            <InfoRow label="Swap" value={`${server.build.swap || 0} MB`} />
          </div>
        </div>
      )}

      {/* Environment Variables */}
      {server.environment && Object.keys(server.environment).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Environment Variables</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            {Object.entries(server.environment).map(([key, val]) => (
              <div key={key} className="flex items-center border-b border-border last:border-b-0 px-4 py-2.5">
                <span className="text-sm font-mono text-primary w-1/3">{key}</span>
                <span className="text-sm font-mono text-muted-foreground flex-1 truncate">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h3>
        <p className="text-xs text-muted-foreground mb-4">These actions are irreversible. Proceed with caution.</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-yellow-500/30 text-yellow-400" onClick={handleReinstall} disabled={reinstalling}>
            {reinstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Reinstall Server
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Server
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Activity Tab — Server activity log
// ============================================
function ActivityTab({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/servers/${serverId}/activity?limit=100`)
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <LoadingState />

  const actionLabels: Record<string, string> = {
    'server:create': 'Created server',
    'server:delete': 'Deleted server',
    'server:update': 'Updated server settings',
    'server:suspend': 'Suspended server',
    'server:unsuspend': 'Unsuspended server',
    'server:power:start': 'Started server',
    'server:power:stop': 'Stopped server',
    'server:power:restart': 'Restarted server',
    'server:power:kill': 'Killed server',
    'server:console:command': 'Executed console command',
    'server:file:write': 'Wrote file',
    'server:file:delete': 'Deleted file(s)',
    'server:reinstall': 'Reinstalled server',
    'server:kvm:enable': 'Enabled KVM',
    'server:kvm:disable': 'Disabled KVM',
    'server:subuser:add': 'Added subuser',
    'server:subuser:remove': 'Removed subuser',
    'server:subuser:update': 'Updated subuser permissions',
  }

  return (
    <div className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Activity Log</h3>
      {logs.length === 0 ? (
        <EmptyState message="No activity recorded yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  {actionLabels[log.action] || log.action}
                </p>
                {log.metadata?.command && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    $ {log.metadata.command}
                  </p>
                )}
                {log.metadata?.filePath && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {log.metadata.filePath}
                  </p>
                )}
                {log.metadata?.files && Array.isArray(log.metadata.files) && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {log.metadata.files.join(', ')}
                  </p>
                )}
                {log.metadata?.powerAction && !log.metadata.command && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Action: {log.metadata.powerAction}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>User #{log.userId}</span>
                  {log.ipAddress && <span>{log.ipAddress}</span>}
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Subusers Tab — Manage server subusers
// ============================================
function SubusersTab({ serverId }: { serverId: string }) {
  const [subusers, setSubusers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const PERMISSIONS = [
    { key: 'console', label: 'Console', desc: 'View console & send commands' },
    { key: 'files', label: 'Files', desc: 'Read and write files' },
    { key: 'backups', label: 'Backups', desc: 'Create, restore, delete backups' },
    { key: 'startup', label: 'Startup', desc: 'Edit startup variables' },
    { key: 'settings', label: 'Settings', desc: 'Change server settings' },
    { key: 'databases', label: 'Databases', desc: 'Manage databases' },
    { key: 'schedules', label: 'Schedules', desc: 'Manage schedules' },
  ]
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['console'])
  const { user } = useAuth()

  const loadSubusers = () => {
    setLoading(true)
    apiFetch(`/api/servers/${serverId}/subusers`)
      .then((data) => setSubusers(Array.isArray(data) ? data : []))
      .catch(() => setSubusers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSubusers() }, [serverId])

  const handleAdd = async () => {
    if (!email.trim()) return
    setAdding(true)
    setError(null)
    try {
      await apiFetch(`/api/servers/${serverId}/subusers`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), permissions: selectedPerms }),
      })
      setEmail("")
      setSelectedPerms(['console'])
      setShowAdd(false)
      loadSubusers()
    } catch (e: any) {
      setError(e.message || "Failed to add subuser")
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (subuserId: number) => {
    if (!confirm("Remove this subuser?")) return
    try {
      await apiFetch(`/api/servers/${serverId}/subusers/${subuserId}`, { method: "DELETE" })
      loadSubusers()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  if (loading) return <LoadingState />

  const canManage = (() => {
    if (!user) return false
    if (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin') return true
    if (subusers.length > 1) return true
    if (subusers.some(su => su.userId && su.userId !== user.id)) return true
    return false
  })()

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Subusers</h3>
        {canManage && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Subuser
          </Button>
        )}
      </div>

      {showAdd && (
        <div className="mb-4 rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">User Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Permissions</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.key)}
                    onChange={(e) => {
                      setSelectedPerms(prev =>
                        e.target.checked ? [...prev, p.key] : prev.filter(x => x !== p.key)
                      )
                    }}
                    className="accent-primary"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {subusers.length === 0 ? (
        <EmptyState message="No subusers added yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {subusers.map((su) => (
            <div key={su.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{su.userEmail || su.email || `User #${su.userId}`}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(su.permissions || []).map((p: string) => (
                    <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {su.userId === user?.id ? (
                  <Button size="sm" variant="destructive" onClick={() => handleRemove(su.id)}>
                    Give up
                  </Button>
                ) : (
                  canManage ? (
                    <Button size="sm" variant="destructive" onClick={() => handleRemove(su.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Shared Components
// ============================================
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm text-foreground truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
