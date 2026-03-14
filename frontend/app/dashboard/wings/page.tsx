"use client"

import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Info,
  RefreshCw,
  ArrowUpCircle,
  HardDrive,
  Repeat,
  ShieldOff,
  AlertTriangle,
  Network,
} from "lucide-react"

interface NodeOption {
  id: number
  name: string
  url: string
  nodeType?: string
}

type Panel = "system" | "update" | "transfers" | "backups" | null

export default function WingsPage() {
  // Node selector state
  const [nodes, setNodes] = useState<NodeOption[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [nodesLoading, setNodesLoading] = useState(true)

  // Panel data state
  const [active, setActive] = useState<Panel>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deauthorize state
  const [deauthUserId, setDeauthUserId] = useState("")
  const [deauthLoading, setDeauthLoading] = useState(false)
  const [deauthResult, setDeauthResult] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.adminNodes)
      .then((res: any) => {
        const ns: NodeOption[] = Array.isArray(res) ? res : res.nodes ?? []
        setNodes(ns)
        if (ns.length === 1) setSelectedNodeId(String(ns[0].id))
      })
      .catch(() => {})
      .finally(() => setNodesLoading(false))
  }, [])

  const selectedNode = nodes.find((n) => String(n.id) === selectedNodeId)

  function nodeQuery() {
    return selectedNodeId ? `?nodeId=${selectedNodeId}` : ""
  }

  async function fetchPanel(panel: Panel, base: string) {
    if (!selectedNodeId) return
    setActive(panel)
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await apiFetch(`${base}${nodeQuery()}`)
      setData(res)
    } catch (e: any) {
      setError(e.message || "Request failed")
    } finally {
      setLoading(false)
    }
  }

  async function deauthorize() {
    if (!deauthUserId.trim() || !selectedNodeId) return
    setDeauthLoading(true)
    setDeauthResult(null)
    try {
      await apiFetch(`/api/wings/deauthorize-user${nodeQuery()}`, {
        method: "POST",
        body: JSON.stringify({ userId: Number(deauthUserId) }),
      })
      setDeauthResult("User deauthorized successfully.")
    } catch (e: any) {
      setDeauthResult("Error: " + (e.message || "Failed"))
    } finally {
      setDeauthLoading(false)
    }
  }

  function renderData() {
    if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
    if (error) return <p className="text-sm text-destructive">{error}</p>
    if (!data) return null
    if (typeof data !== "object" || Array.isArray(data)) {
      return <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
    }
    return (
      <div className="flex flex-col gap-1.5">
        {Object.entries(data as Record<string, any>).map(([k, v]) => (
          <div key={k} className="flex items-start gap-3 text-sm">
            <span className="w-44 shrink-0 text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
            <span className="text-foreground font-mono break-all">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <PanelHeader title="Wings Daemon" description="Daemon-level diagnostics and controls for individual Wings nodes" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-6">

          {/* Node Selector */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Network className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Select Node</p>
            </div>
            {nodesLoading ? (
              <p className="text-sm text-muted-foreground">Loading nodes…</p>
            ) : nodes.length === 0 ? (
              <p className="text-sm text-destructive">No nodes found. Add nodes in Admin → Nodes first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      setSelectedNodeId(String(node.id))
                      setActive(null)
                      setData(null)
                      setError(null)
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedNodeId === String(node.id)
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-secondary/30 text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedNodeId === String(node.id) ? "bg-primary" : "bg-muted-foreground"}`} />
                    <span className="font-medium">{node.name}</span>
                    {node.nodeType && (
                      <span className="text-xs text-muted-foreground">({node.nodeType})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedNode && (
              <p className="mt-2 text-xs text-muted-foreground font-mono">
                Target: <span className="text-foreground">{selectedNode.url}</span>
              </p>
            )}
          </div>

          {/* No node warning */}
          {!selectedNodeId && !nodesLoading && nodes.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Select a node above</span> before running any Wings commands.
              </p>
            </div>
          )}

          {/* Action cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { id: "system" as Panel, label: "System Info", icon: Info, base: "/api/wings/system", desc: "CPU, memory, disk usage" },
              { id: "update" as Panel, label: "Check Update", icon: ArrowUpCircle, base: "/api/wings/update", desc: "Available Wings updates" },
              { id: "transfers" as Panel, label: "Transfers", icon: Repeat, base: "/api/wings/transfers", desc: "Active file transfers" },
              { id: "backups" as Panel, label: "Backups", icon: HardDrive, base: "/api/wings/backups", desc: "Backup tasks" },
            ].map(({ id, label, icon: Icon, base, desc }) => (
              <button
                key={id}
                disabled={!selectedNodeId}
                onClick={() => fetchPanel(id, base)}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
                  !selectedNodeId
                    ? "cursor-not-allowed opacity-40 border-border bg-card"
                    : active === id
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Result panel */}
          {(active || loading) && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-foreground capitalize">{active} response</p>
                <button
                  onClick={() => {
                    if (active) fetchPanel(active, `/api/wings/${active}`)
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {renderData()}
            </div>
          )}

          {/* Deauthorize user */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldOff className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Deauthorize User</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Revokes all active WebSocket sessions for a user on the selected node, immediately disconnecting them from their server consoles.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="User ID"
                value={deauthUserId}
                onChange={(e) => setDeauthUserId(e.target.value)}
                className="w-32 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <Button
                variant="outline"
                onClick={deauthorize}
                disabled={deauthLoading || !deauthUserId.trim() || !selectedNodeId}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {deauthLoading ? "Deauthorizing…" : "Deauthorize"}
              </Button>
            </div>
            {!selectedNodeId && (
              <p className="mt-2 text-xs text-muted-foreground">Select a node first.</p>
            )}
            {deauthResult && (
              <p className={`mt-2 text-xs ${deauthResult.startsWith("Error") ? "text-destructive" : "text-emerald-400"}`}>
                {deauthResult}
              </p>
            )}
          </div>

        </div>
      </ScrollArea>
    </>
  )
}