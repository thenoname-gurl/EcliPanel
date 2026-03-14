"use client"

import { useState, useEffect, useCallback } from "react"
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
import {
  HardDrive,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Copy,
  Server,
} from "lucide-react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Node {
  id: number
  name: string
  url: string
  nodeType: string
  useSSL?: boolean
  allowedOrigin?: string
  sftpPort?: number
  sftpProxyPort?: number
  organisationId?: number
  organisation?: { id: number; name: string }
  portRangeStart?: number
  portRangeEnd?: number
  defaultIp?: string
  cost?: number
  memory?: number
  disk?: number
  cpu?: number
  serverLimit?: number
  createdAt?: string
}

interface Organisation {
  id: number
  name: string
  handle: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_TYPE_META: Record<string, { label: string; color: string }> = {
  free:         { label: "Free",         color: "border-green-500/30 bg-green-500/10 text-green-400" },
  paid:         { label: "Paid",         color: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
  free_and_paid:{ label: "Free + Paid",  color: "border-purple-500/30 bg-purple-500/10 text-purple-400" },
  enterprise:   { label: "Enterprise",   color: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InfraNodesPage() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  // ── Create/Edit dialog ──
  const [nodeDialog, setNodeDialog] = useState<Node | null | "new">(null)
  const [nodeName, setNodeName] = useState("")
  const [nodeUrl, setNodeUrl] = useState("")
  const [nodeToken, setNodeToken] = useState("")
  const [nodeType, setNodeType] = useState("free")
  const [nodeOrgId, setNodeOrgId] = useState<string>("")
  const [nodeUseSSL, setNodeUseSSL] = useState(true)
  const [nodeAllowedOrigin, setNodeAllowedOrigin] = useState("")
  const [nodeSftpPort, setNodeSftpPort] = useState("")
  const [nodeSftpProxyPort, setNodeSftpProxyPort] = useState("")
  const [nodePortStart, setNodePortStart] = useState("")
  const [nodePortEnd, setNodePortEnd] = useState("")
  const [nodeDefaultIp, setNodeDefaultIp] = useState("")
  const [nodeCost, setNodeCost] = useState("")
  const [nodeMemory, setNodeMemory] = useState("")
  const [nodeDisk, setNodeDisk] = useState("")
  const [nodeCpu, setNodeCpu] = useState("")
  const [nodeServerLimit, setNodeServerLimit] = useState("")
  const [nodeLoading, setNodeLoading] = useState(false)

  // ── Load data ──
  const loadNodes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.nodes)
      setNodes(data || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNodes()
    apiFetch(API_ENDPOINTS.adminOrganisations).then((d) => setOrgs(d || [])).catch(() => {})
  }, [loadNodes])

  // ── Generate token ──
  async function generateToken() {
    const data = await apiFetch(`${API_ENDPOINTS.nodes}/generate-token`)
    setGeneratedToken(data.token)
    setNodeToken(data.token)
  }

  // ── Open dialogs ──
  function openNew() {
    setNodeDialog("new")
    setNodeName(""); setNodeUrl(""); setNodeToken("")
    setNodeType("free"); setNodeOrgId("")
    setNodeUseSSL(true)
    setNodeAllowedOrigin("")
    setNodeSftpPort("")
    setNodeSftpProxyPort("")
    setNodePortStart(""); setNodePortEnd("")
    setNodeDefaultIp(""); setNodeCost("")
    setNodeMemory(""); setNodeDisk(""); setNodeCpu("")
    setNodeServerLimit("")
    setGeneratedToken(null)
  }

  function openEdit(node: Node) {
    setNodeDialog(node)
    setNodeName(node.name); setNodeUrl(node.url); setNodeToken("")
    setNodeType(node.nodeType || "free")
    setNodeOrgId(node.organisationId ? String(node.organisationId) : "")
    setNodeUseSSL(node.useSSL !== false)
    setNodeAllowedOrigin(node.allowedOrigin || "")
    setNodeSftpPort(node.sftpPort != null ? String(node.sftpPort) : "")
    setNodeSftpProxyPort(node.sftpProxyPort != null ? String(node.sftpProxyPort) : "")
    setNodePortStart(node.portRangeStart != null ? String(node.portRangeStart) : "")
    setNodePortEnd(node.portRangeEnd != null ? String(node.portRangeEnd) : "")
    setNodeDefaultIp(node.defaultIp || "")
    setNodeCost(node.cost != null ? String(node.cost) : "")
    setNodeMemory(node.memory != null ? String(node.memory) : "")
    setNodeDisk(node.disk != null ? String(node.disk) : "")
    setNodeCpu(node.cpu != null ? String(node.cpu) : "")
    setNodeServerLimit(node.serverLimit != null ? String(node.serverLimit) : "")
    setGeneratedToken(null)
  }

  async function saveNode() {
    setNodeLoading(true)
    try {
      const body: Record<string, any> = {
        name: nodeName,
        nodeType,
        orgId: nodeOrgId ? Number(nodeOrgId) : undefined,
        useSSL: nodeUseSSL,
        allowedOrigin: nodeAllowedOrigin || null,
        sftpPort: nodeSftpPort ? Number(nodeSftpPort) : null,
        sftpProxyPort: nodeSftpProxyPort ? Number(nodeSftpProxyPort) : null,
        portRangeStart: nodePortStart ? Number(nodePortStart) : null,
        portRangeEnd: nodePortEnd ? Number(nodePortEnd) : null,
        defaultIp: nodeDefaultIp || null,
        cost: nodeCost ? Number(nodeCost) : null,
        memory: nodeMemory ? Number(nodeMemory) : null,
        disk: nodeDisk ? Number(nodeDisk) : null,
        cpu: nodeCpu ? Number(nodeCpu) : null,
        serverLimit: nodeServerLimit ? Number(nodeServerLimit) : null,
      }
      if (nodeDialog === "new") {
        body.url = nodeUrl
        body.token = nodeToken
        const created = await apiFetch(API_ENDPOINTS.nodes, { method: "POST", body: JSON.stringify(body) })
        setNodes((prev) => [...prev, created.node || created])
      } else if (nodeDialog && nodeDialog !== "new") {
        const res = await apiFetch(`${API_ENDPOINTS.nodes}/${(nodeDialog as Node).id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
        setNodes((prev) =>
          prev.map((n) =>
            n.id === (nodeDialog as Node).id ? (res.node || { ...n, ...body }) : n
          )
        )
      }
      setNodeDialog(null)
    } finally {
      setNodeLoading(false)
    }
  }

  async function deleteNode(node: Node) {
    if (!confirm(`Delete node "${node.name}"? All server mappings on this node will break.`)) return
    await apiFetch(`${API_ENDPOINTS.nodes}/${node.id}`, { method: "DELETE" })
    setNodes((prev) => prev.filter((n) => n.id !== node.id))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollArea className="h-screen">
        <PanelHeader
          title="Nodes"
          description="Manage infrastructure nodes and their tier classifications."
          icon={HardDrive}
        />

        <div className="flex flex-col gap-6 p-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {nodes.length} node{nodes.length !== 1 ? "s" : ""} registered
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadNodes} className="border-border h-9 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <Button size="sm" onClick={openNew} className="bg-primary text-primary-foreground h-9 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Node
              </Button>
            </div>
          </div>

          {/* Node grid */}
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
              Loading nodes…
            </div>
          ) : nodes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <HardDrive className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground">No nodes registered</p>
              <p className="text-xs text-muted-foreground mt-1">Add a node to start hosting servers.</p>
              <Button size="sm" onClick={openNew} className="mt-4 bg-primary text-primary-foreground gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Node
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {nodes.map((node) => {
                const meta = NODE_TYPE_META[node.nodeType] || NODE_TYPE_META.free
                return (
                  <div
                    key={node.id}
                    className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 flex flex-col gap-3"
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                          <h3 className="font-medium text-foreground truncate">{node.name}</h3>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{node.url}</p>
                      </div>
                      <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs shrink-0">
                        #{node.id}
                      </Badge>
                    </div>

                    {/* Type + SSL badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${meta.color}`}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${node.useSSL !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                        {node.useSSL !== false ? 'SSL' : 'No SSL (proxied)'}
                      </Badge>
                      {node.organisation && (
                        <span className="text-xs text-muted-foreground">
                          Org: {node.organisation.name}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(node)}
                        className="border-border h-7 px-2 text-xs gap-1"
                      >
                        <Edit className="h-3 w-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteNode(node)}
                        className="border-destructive/50 text-destructive h-7 px-2 text-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ═══════ Add / Edit Node Dialog ══════════════════════════════════════════ */}
      <Dialog open={nodeDialog !== null} onOpenChange={(open) => !open && setNodeDialog(null)}>
        <DialogContent className="border-border bg-card sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {nodeDialog === "new" ? "Add Node" : `Edit Node — ${(nodeDialog as Node)?.name}`}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <input
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder="EU Node 1"
              />
            </div>

            {/* URL — only on create */}
            {nodeDialog === "new" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wings URL</label>
                <input
                  value={nodeUrl}
                  onChange={(e) => setNodeUrl(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder="https://wings.example.com:8080"
                />
              </div>
            )}

            {/* Token — only on create */}
            {nodeDialog === "new" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auth Token</label>
                <div className="flex gap-2">
                  <input
                    value={nodeToken}
                    onChange={(e) => setNodeToken(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="Paste or generate a token"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generateToken}
                    className="border-border shrink-0 h-9 px-3 text-xs"
                  >
                    Generate
                  </Button>
                </div>
                {generatedToken && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                    <span className="flex-1 font-mono text-xs text-green-400 break-all">{generatedToken}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedToken)}
                      className="text-green-400 hover:text-green-300"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Node Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node Type</label>
              <select
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="free">Free — available to all users</option>
                <option value="paid">Paid — paid tier and above</option>
                <option value="free_and_paid">Free + Paid — any paying or free user</option>
                <option value="enterprise">Enterprise — linked organisation only</option>
              </select>
            </div>

            {/* Organisation — only relevant for enterprise nodes */}
            {nodeType === "enterprise" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linked Organisation</label>
                <select
                  value={nodeOrgId}
                  onChange={(e) => setNodeOrgId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">— None —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name} (@{o.handle})</option>
                  ))}
                </select>
              </div>
            )}

            {/* SSL toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-foreground">SSL / HTTPS</p>
                <p className="text-[10px] text-muted-foreground">Disable if the Wings node uses HTTP. WebSockets will be proxied through the backend.</p>
              </div>
              <button
                type="button"
                onClick={() => setNodeUseSSL(!nodeUseSSL)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  nodeUseSSL ? 'bg-primary' : 'bg-secondary'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  nodeUseSSL ? 'translate-x-4.5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Allowed origin override (for WS proxy) */}
            {!nodeUseSSL && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">Allowed Origin (WS Proxy)</label>
                <input
                  value={nodeAllowedOrigin}
                  onChange={(e) => setNodeAllowedOrigin(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder={"e.g. https://ecli.app (must match Wings allowed_origins)"}
                />
                <p className="text-[10px] text-muted-foreground">The panel origin to send when proxying WebSockets to this node. Must match an entry in the Wings daemon config. Defaults to FRONTEND_URL.</p>
              </div>
            )}

            {/* SFTP settings */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">SFTP</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">SFTP Port</label>
                  <input
                    value={nodeSftpPort}
                    onChange={(e) => setNodeSftpPort(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="2022"
                  />
                </div>
                {!nodeUseSSL && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">SFTP Proxy Port</label>
                    <input
                      value={nodeSftpProxyPort}
                      onChange={(e) => setNodeSftpProxyPort(e.target.value)}
                      type="number"
                      className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="e.g. 12022"
                    />
                    <p className="text-[10px] text-muted-foreground">Backend TCP proxy port for clients that can&apos;t reach the node directly.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resource limits section */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Resource Limits</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Memory (MB)</label>
                  <input
                    value={nodeMemory}
                    onChange={(e) => setNodeMemory(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="e.g. 8192"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Disk (MB)</label>
                  <input
                    value={nodeDisk}
                    onChange={(e) => setNodeDisk(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="e.g. 51200"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">CPU (%)</label>
                  <input
                    value={nodeCpu}
                    onChange={(e) => setNodeCpu(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="e.g. 400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Server Limit</label>
                  <input
                    value={nodeServerLimit}
                    onChange={(e) => setNodeServerLimit(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
            </div>

            {/* Network config */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Network</p>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">Default IP</label>
                  <input
                    value={nodeDefaultIp}
                    onChange={(e) => setNodeDefaultIp(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="0.0.0.0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Port Range Start</label>
                    <input
                      value={nodePortStart}
                      onChange={(e) => setNodePortStart(e.target.value)}
                      type="number"
                      className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="25000"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Port Range End</label>
                    <input
                      value={nodePortEnd}
                      onChange={(e) => setNodePortEnd(e.target.value)}
                      type="number"
                      className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="30000"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cost */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly Cost ($)</label>
              <input
                value={nodeCost}
                onChange={(e) => setNodeCost(e.target.value)}
                type="number"
                step="0.01"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialog(null)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={saveNode}
              disabled={nodeLoading || !nodeName.trim() || (nodeDialog === "new" && (!nodeUrl.trim() || !nodeToken.trim()))}
              className="bg-primary text-primary-foreground"
            >
              {nodeLoading ? "Saving…" : nodeDialog === "new" ? "Add Node" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
