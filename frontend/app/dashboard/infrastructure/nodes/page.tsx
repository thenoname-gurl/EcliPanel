"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
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
  nodeId?: string
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
  fqdn?: string
  cost?: number
  memory?: number
  disk?: number
  cpu?: number
  backendWingsUrl?: string
  serverLimit?: number
  createdAt?: string
}

interface Organisation {
  id: number
  name: string
  handle: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

function getNodeTypeMeta(t: any): Record<string, { label: string; color: string }> {
  return {
    free: { label: t("nodeTypes.free"), color: "border-green-500/30 bg-green-500/10 text-green-400" },
    paid: { label: t("nodeTypes.paid"), color: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
    free_and_paid: { label: t("nodeTypes.freeAndPaid"), color: "border-purple-500/30 bg-purple-500/10 text-purple-400" },
    enterprise: { label: t("nodeTypes.enterprise"), color: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InfraNodesPage() {
  const t = useTranslations("infrastructureNodesPage")
  const NODE_TYPE_META = getNodeTypeMeta(t)
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nodes, setNodes] = useState<Node[]>([])
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const demoExpiresAt = (user as any)?.demoExpiresAt as string | undefined
  const demoActive = !!demoExpiresAt && new Date(demoExpiresAt) > new Date()
  const [editNodeId, setEditNodeId] = useState<string | null>(null)

  // ── Create/Edit dialog ──
  const [nodeDialog, setNodeDialog] = useState<Node | null | "new">(null)
  const [nodeName, setNodeName] = useState("")

  useEffect(() => {
    const edit = searchParams.get("edit")
    if (edit) setEditNodeId(edit)
  }, [searchParams])
  const [nodeUrl, setNodeUrl] = useState("")
  const [nodeToken, setNodeToken] = useState("")
  const [nodeBackendWingsUrl, setNodeBackendWingsUrl] = useState("")
  const [nodeIdValue, setNodeIdValue] = useState<string>("")
  const [nodeType, setNodeType] = useState("free")
  const [nodeOrgId, setNodeOrgId] = useState<string>("")
  const [nodeUseSSL, setNodeUseSSL] = useState(true)

  function generateDefaultNodeId() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const [nodeAllowedOrigin, setNodeAllowedOrigin] = useState("")
  const [nodeSftpPort, setNodeSftpPort] = useState("")
  const [nodeSftpProxyPort, setNodeSftpProxyPort] = useState("")
  const [nodePortStart, setNodePortStart] = useState("")
  const [nodePortEnd, setNodePortEnd] = useState("")
  const [nodeDefaultIp, setNodeDefaultIp] = useState("")
  const [nodeFqdn, setNodeFqdn] = useState("")
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
      const nodesData = Array.isArray(data?.nodes)
        ? data.nodes
        : Array.isArray(data)
          ? data
          : []
      setNodes(nodesData)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNodes()
    apiFetch(API_ENDPOINTS.adminOrganisations)
      .then((d: any) => {
        const orgList = Array.isArray(d?.organisations) ? d.organisations : Array.isArray(d) ? d : []
        setOrgs(orgList)
      })
      .catch(() => {})
  }, [loadNodes])

  useEffect(() => {
    if (!loading && editNodeId) {
      const match = nodes.find((n) => String(n.id) === editNodeId || n.nodeId === editNodeId)
      if (match) {
        openEdit(match)
        setEditNodeId(null)
        router.replace('/dashboard/infrastructure/nodes')
      }
    }
  }, [loading, editNodeId, nodes, router])

  // ── Generate token ──
  async function generateToken() {
    const data = await apiFetch(`${API_ENDPOINTS.nodes}/generate-token`)
    setGeneratedToken(data.token)
    setNodeToken(data.token)
  }

  // ── Open dialogs ──
  function openNew() {
    if (demoActive) {
      alert(t("alerts.demoCreateDisabled"));
      return;
    }
    setNodeDialog("new")
    setNodeName(""); setNodeUrl(""); setNodeToken("")
    setNodeBackendWingsUrl("")
    setNodeIdValue(generateDefaultNodeId())
    setNodeType("free"); setNodeOrgId("")
    setNodeUseSSL(true)
    setNodeAllowedOrigin("")
    setNodeSftpPort("")
    setNodeSftpProxyPort("")
    setNodePortStart(""); setNodePortEnd("")
    setNodeDefaultIp(""); setNodeFqdn("")
    setNodeCost("")
    setNodeMemory(""); setNodeDisk(""); setNodeCpu("")
    setNodeServerLimit("")
    setGeneratedToken(null)
  }

  function openEdit(node: Node) {
    setNodeDialog(node)
    setNodeName(node.name); setNodeUrl(node.url); setNodeToken("")
    setNodeBackendWingsUrl((node as any).backendWingsUrl || "")
    setNodeIdValue(node.nodeId || generateDefaultNodeId())
    setNodeType(node.nodeType || "free")
    setNodeOrgId(node.organisationId ? String(node.organisationId) : "")
    setNodeUseSSL(node.useSSL !== false)
    setNodeAllowedOrigin(node.allowedOrigin || "")
    setNodeSftpPort(node.sftpPort != null ? String(node.sftpPort) : "")
    setNodeSftpProxyPort(node.sftpProxyPort != null ? String(node.sftpProxyPort) : "")
    setNodePortStart(node.portRangeStart != null ? String(node.portRangeStart) : "")
    setNodePortEnd(node.portRangeEnd != null ? String(node.portRangeEnd) : "")
    setNodeDefaultIp(node.defaultIp || "")
    setNodeFqdn((node as any).fqdn || "")
    setNodeCost(node.cost != null ? String(node.cost) : "")
    setNodeMemory(node.memory != null ? String(node.memory) : "")
    setNodeDisk(node.disk != null ? String(node.disk) : "")
    setNodeCpu(node.cpu != null ? String(node.cpu) : "")
    setNodeServerLimit(node.serverLimit != null ? String(node.serverLimit) : "")
    setGeneratedToken(null)
  }

  async function saveNode() {
    if (demoActive) {
      alert(t("alerts.demoEditDisabled"));
      return;
    }
    setNodeLoading(true)
    try {
      const body: Record<string, any> = {
        name: nodeName,
        url: nodeUrl,
        nodeId: nodeIdValue || null,
        nodeType,
        orgId: nodeOrgId ? Number(nodeOrgId) : undefined,
        useSSL: nodeUseSSL,
        allowedOrigin: nodeAllowedOrigin || null,
        sftpPort: nodeSftpPort ? Number(nodeSftpPort) : null,
        sftpProxyPort: nodeSftpProxyPort ? Number(nodeSftpProxyPort) : null,
        portRangeStart: nodePortStart ? Number(nodePortStart) : null,
        portRangeEnd: nodePortEnd ? Number(nodePortEnd) : null,
        defaultIp: nodeDefaultIp || null,
        fqdn: nodeFqdn || null,
        cost: nodeCost ? Number(nodeCost) : null,
        memory: nodeMemory ? Number(nodeMemory) : null,
        disk: nodeDisk ? Number(nodeDisk) : null,
        cpu: nodeCpu ? Number(nodeCpu) : null,
        serverLimit: nodeServerLimit ? Number(nodeServerLimit) : null,
      }
      if (nodeBackendWingsUrl) body.backendWingsUrl = nodeBackendWingsUrl
      if (nodeDialog === "new") {
        body.url = nodeUrl
        body.token = nodeToken
        const created = await apiFetch(API_ENDPOINTS.nodes, { method: "POST", body: JSON.stringify(body) })
        setNodes((prev) => [...prev, created.node || created])
      } else if (nodeDialog) {
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
    if (demoActive) {
      alert(t("alerts.demoDeleteDisabled"));
      return;
    }
    if (!confirm(t("confirm.deleteNode", { name: node.name }))) return
    await apiFetch(`${API_ENDPOINTS.nodes}/${node.id}`, { method: "DELETE" })
    setNodes((prev) => prev.filter((n) => n.id !== node.id))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollArea className="h-screen">
        <PanelHeader
          title={t("header.title")}
          description={t("header.description")}
        />

        {demoActive ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 mx-6">
            <p className="text-sm font-medium text-warning-foreground">
              {t("states.demoActive")}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-6 p-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("states.nodesRegistered", { count: nodes.length })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadNodes} className="border-border h-9 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> {t("actions.refresh")}
              </Button>
              <Button size="sm" onClick={openNew} disabled={demoActive} className="bg-primary text-primary-foreground h-9 gap-1.5" title={demoActive ? t("states.disabledInDemo") : undefined}>
                <Plus className="h-3.5 w-3.5" /> {t("actions.addNode")}
              </Button>
            </div>
          </div>

          {/* Node grid */}
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
              {t("states.loadingNodes")}
            </div>
          ) : nodes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <HardDrive className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground">{t("states.noNodesTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("states.noNodesDescription")}</p>
              <Button size="sm" onClick={openNew} disabled={demoActive} className="mt-4 bg-primary text-primary-foreground gap-1.5" title={demoActive ? t("states.disabledInDemo") : undefined}>
                <Plus className="h-3.5 w-3.5" /> {t("actions.addNode")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(Array.isArray(nodes) ? nodes : []).map((node) => {
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
                        {node.fqdn ? (
                          <p className="mt-1 text-[12px] text-muted-foreground">{t("labels.fqdn")}: {node.fqdn}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs shrink-0">
                        {node.nodeId ? node.nodeId : `#${node.id}`}
                      </Badge>
                    </div>

                    {/* Type + SSL badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${meta.color}`}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${node.useSSL !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                        {node.useSSL !== false ? t("labels.ssl") : t("labels.noSslProxied")}
                      </Badge>
                      {node.organisation && (
                        <span className="text-xs text-muted-foreground">
                          {t("labels.org")}: {node.organisation.name}
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
                        <Edit className="h-3 w-3" /> {t("actions.edit")}
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
              {nodeDialog === "new" ? t("dialog.addTitle") : t("dialog.editTitle", { name: (nodeDialog as Node)?.name || "" })}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.name")}</label>
              <input
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder={t("form.namePlaceholder")}
              />
            </div>

            {/* Node ID */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.nodeId")}</label>
              <input
                value={nodeIdValue}
                onChange={(e) => setNodeIdValue(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder={t("form.nodeIdPlaceholder")}
              />
              <p className="text-[10px] text-muted-foreground">{t("form.nodeIdHint")}</p>
            </div>

            {/* FQDN */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.fqdnOptional")}</label>
              <p className="text-[10px] text-muted-foreground">{t("form.fqdnHint")}</p>
              <input
                value={nodeFqdn}
                onChange={(e) => setNodeFqdn(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder={t("form.fqdnPlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.wingsUrl")}</label>
              <input
                value={nodeUrl}
                onChange={(e) => setNodeUrl(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder={t("form.wingsUrlPlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.backendWingsUrlOptional")}</label>
              <p className="text-[10px] text-muted-foreground">{t("form.backendWingsUrlHint")}</p>
              <input
                value={nodeBackendWingsUrl}
                onChange={(e) => setNodeBackendWingsUrl(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder={t("form.backendWingsUrlPlaceholder")}
              />
            </div>

            {/* Token — only on create */}
            {nodeDialog === "new" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.authToken")}</label>
                <div className="flex gap-2">
                  <input
                    value={nodeToken}
                    onChange={(e) => setNodeToken(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.authTokenPlaceholder")}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generateToken}
                    className="border-border shrink-0 h-9 px-3 text-xs"
                  >
                    {t("actions.generate")}
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.nodeType")}</label>
              <select
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="free">{t("nodeTypeOptions.free")}</option>
                <option value="paid">{t("nodeTypeOptions.paid")}</option>
                <option value="free_and_paid">{t("nodeTypeOptions.freeAndPaid")}</option>
                <option value="enterprise">{t("nodeTypeOptions.enterprise")}</option>
              </select>
            </div>

            {/* Organisation — only relevant for enterprise nodes */}
            {nodeType === "enterprise" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.linkedOrganisation")}</label>
                <select
                  value={nodeOrgId}
                  onChange={(e) => setNodeOrgId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">{t("form.noneOption")}</option>
                  {(Array.isArray(orgs) ? orgs : []).map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name} (@{o.handle})</option>
                  ))}
                </select>
              </div>
            )}

            {/* SSL toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-foreground">{t("form.sslHttps")}</p>
                <p className="text-[10px] text-muted-foreground">{t("form.sslHint")}</p>
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
                <label className="text-[10px] text-muted-foreground">{t("form.allowedOrigin")}</label>
                <input
                  value={nodeAllowedOrigin}
                  onChange={(e) => setNodeAllowedOrigin(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder={t("form.allowedOriginPlaceholder")}
                />
                <p className="text-[10px] text-muted-foreground">{t("form.allowedOriginHint")}</p>
              </div>
            )}

            {/* SFTP settings */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("sections.sftp")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.sftpPort")}</label>
                  <input
                    value={nodeSftpPort}
                    onChange={(e) => setNodeSftpPort(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.sftpPortPlaceholder")}
                  />
                </div>
                {!nodeUseSSL && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">{t("form.sftpProxyPort")}</label>
                    <input
                      value={nodeSftpProxyPort}
                      onChange={(e) => setNodeSftpProxyPort(e.target.value)}
                      type="number"
                      className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder={t("form.sftpProxyPortPlaceholder")}
                    />
                    <p className="text-[10px] text-muted-foreground">{t("form.sftpProxyPortHint")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resource limits section */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("sections.resourceLimits")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.memoryMb")}</label>
                  <input
                    value={nodeMemory}
                    onChange={(e) => setNodeMemory(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.memoryMbPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.diskMb")}</label>
                  <input
                    value={nodeDisk}
                    onChange={(e) => setNodeDisk(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.diskMbPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.cpuPercent")}</label>
                  <input
                    value={nodeCpu}
                    onChange={(e) => setNodeCpu(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.cpuPercentPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.serverLimit")}</label>
                  <input
                    value={nodeServerLimit}
                    onChange={(e) => setNodeServerLimit(e.target.value)}
                    type="number"
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder={t("form.serverLimitPlaceholder")}
                  />
                </div>
              </div>
            </div>

            {/* Network config */}
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("sections.network")}</p>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground">{t("form.defaultIp")}</label>
                  <input
                    value={nodeDefaultIp}
                    onChange={(e) => setNodeDefaultIp(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                    placeholder="0.0.0.0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">{t("form.portRangeStart")}</label>
                    <input
                      value={nodePortStart}
                      onChange={(e) => setNodePortStart(e.target.value)}
                      type="number"
                      className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                      placeholder="25000"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">{t("form.portRangeEnd")}</label>
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("form.monthlyCost")}</label>
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
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={saveNode}
              disabled={
                nodeLoading ||
                !nodeName.trim() ||
                !nodeUrl.trim() ||
                (nodeDialog === "new" && !nodeToken.trim())
              }
              className="bg-primary text-primary-foreground"
            >
              {nodeLoading ? t("actions.saving") : nodeDialog === "new" ? t("actions.addNode") : t("actions.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
