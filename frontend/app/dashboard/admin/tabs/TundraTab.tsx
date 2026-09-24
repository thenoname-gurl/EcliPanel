"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Network, RefreshCw, RotateCw, Activity, KeyRound, Plus, Trash2,
  Power, Server, Link2, ShieldCheck, ChevronDown, ChevronRight,
  Loader2,
} from "lucide-react"
import { useTranslations } from "next-intl"

interface TundraConfig {
  enabled: boolean
  defaultTunnelPort: number
  fullMeshCrossTenant: boolean
}

interface AclRow {
  id: number
  srcServer: string
  dstServer: string
  enabled: boolean
  createdAt: string
}

interface TundraNode {
  id: number
  name: string
  url: string
  provider: string
  nodeId?: string | null
  fqdn?: string | null
  tundraEnabled?: boolean
  tundraTunnelPort?: number | null
  tundraHost?: string | null
  tundraCertSha256?: string | null
}

function shortUuid(u: string | null | undefined): string {
  if (!u) return "—"
  return u.length > 16 ? `${u.slice(0, 6)}…${u.slice(-4)}` : u
}

export default function TundraTab() {
  const t = useTranslations("adminTundraTab")
  const [config, setConfig] = useState<TundraConfig | null>(null)
  const [nodes, setNodes] = useState<TundraNode[]>([])
  const [acls, setAcls] = useState<AclRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nodeStates, setNodeStates] = useState<Record<number, string>>({})
  const [nodeLoading, setNodeLoading] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [srcServer, setSrcServer] = useState("")
  const [dstServer, setDstServer] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfg, nodeRes, aclRes] = await Promise.all([
        apiFetch(API_ENDPOINTS.tundraConfig),
        apiFetch(API_ENDPOINTS.nodes),
        apiFetch(API_ENDPOINTS.tundraAcls),
      ])
      setConfig(cfg)
      setNodes(Array.isArray(nodeRes) ? nodeRes.filter((n: any) => n.provider === "wings") : [])
      setAcls(aclRes.acls || [])
    } catch (e: any) {
      toast(t("loadError") || "Failed to load tundra config", { icon: "⚠️" })
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  async function saveConfig(next: Partial<TundraConfig>) {
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.tundraConfig, {
        method: "PUT",
        body: JSON.stringify(next),
        headers: { "content-type": "application/json" },
      })
      setConfig((c) => (c ? { ...c, ...next } : c))
      toast(t("saved") || "Saved")
    } catch (e: any) {
      toast(t("saveError") || "Failed to save", { icon: "⚠️" })
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function saveNodeConfig(node: TundraNode, next: Partial<any>) {
    setNodeLoading((p) => ({ ...p, [node.id]: true }))
    try {
      await apiFetch(API_ENDPOINTS.tundraNodeConfig.replace(":nodeId", String(node.id)), {
        method: "PUT",
        body: JSON.stringify(next),
        headers: { "content-type": "application/json" },
      })
      setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, ...next } : n)))
      toast(t("saved") || "Saved")
    } catch (e: any) {
      toast(t("saveError") || "Failed to save", { icon: "⚠️" })
      console.error(e)
    } finally {
      setNodeLoading((p) => ({ ...p, [node.id]: false }))
    }
  }

  async function runNodeAction(nodeId: number, action: "sync" | "rotate" | "metrics") {
    const key = `${action}:${nodeId}`
    setNodeLoading((p) => ({ ...p, [nodeId]: true }))
    setNodeStates((p) => ({ ...p, [nodeId]: "working…" }))
    try {
      const endpoint =
        action === "sync" ? API_ENDPOINTS.nodeTundraSync :
        action === "rotate" ? API_ENDPOINTS.nodeTundraRotate :
        API_ENDPOINTS.nodeTundraMetrics.replace(":nodeId", String(nodeId))
      const res = await apiFetch(endpoint.replace(":nodeId", String(nodeId)), {
        method: action === "metrics" ? "GET" : "POST",
      })
      setNodeStates((p) => ({ ...p, [nodeId]: action === "metrics" ? JSON.stringify(res).slice(0, 300) : "ok" }))
      toast(action === "metrics" ? "Metrics fetched" : `${action} triggered`)
    } catch (e: any) {
      setNodeStates((p) => ({ ...p, [nodeId]: `error: ${e?.message || "request failed"}` }))
      toast(`${action} failed`, { icon: "⚠️" })
    } finally {
      setNodeLoading((p) => ({ ...p, [nodeId]: false }))
    }
  }

  async function addAcl(e: React.FormEvent) {
    e.preventDefault()
    if (!srcServer.trim() || !dstServer.trim()) {
      toast(t("aclRequired") || "Both server UUIDs are required", { icon: "⚠️" })
      return
    }
    try {
      const res = await apiFetch(API_ENDPOINTS.tundraAcls, {
        method: "POST",
        body: JSON.stringify({ srcServer: srcServer.trim(), dstServer: dstServer.trim() }),
        headers: { "content-type": "application/json" },
      })
      if (res.acl) setAcls((a) => [res.acl, ...a])
      setSrcServer("")
      setDstServer("")
      toast(t("saved") || "Saved")
    } catch (e: any) {
      toast(e?.message || "Failed to add ACL", { icon: "⚠️" })
      console.error(e)
    }
  }

  async function deleteAcl(id: number) {
    try {
      await apiFetch(`${API_ENDPOINTS.tundraAcls}/${id}`, { method: "DELETE" })
      setAcls((a) => a.filter((x) => x.id !== id))
      toast(t("saved") || "Saved")
    } catch (e: any) {
      toast(t("saveError") || "Failed to delete", { icon: "⚠️" })
      console.error(e)
    }
  }

  const wingsCount = useMemo(() => nodes.filter((n) => n.nodeId).length, [nodes])
  const nodesWithCert = useMemo(() => nodes.filter((n) => n.tundraCertSha256).length, [nodes])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">{t("loading")}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Global config ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("globalConfig")}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={saving}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("refresh")}
            </Button>
          </div>
        </div>

        {config && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("masterSwitch")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {config.enabled ? t("enabled") : t("disabled")} · {wingsCount} {t("nodesJoined")}
                  </p>
                </div>
                <Button
                  variant={config.enabled ? "destructive" : "default"}
                  size="sm"
                  onClick={() => saveConfig({ enabled: !config.enabled })}
                  disabled={saving}
                >
                  <Power className="h-3.5 w-3.5" />
                  {config.enabled ? t("disable") : t("enable")}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">{t("defaultTunnelPort")}</p>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={config.defaultTunnelPort}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (v > 0 && v <= 65535 && v !== config.defaultTunnelPort) {
                      saveConfig({ defaultTunnelPort: v })
                    }
                  }}
                  className="w-32"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("fullMesh")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("fullMeshHint")}</p>
                </div>
                <Button
                  variant={config.fullMeshCrossTenant ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => saveConfig({ fullMeshCrossTenant: !config.fullMeshCrossTenant })}
                  disabled={saving}
                >
                  {config.fullMeshCrossTenant ? t("enabled") : t("disabled")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Nodes ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Server className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("nodesTitle")}</h3>
          <Badge variant="outline" className="ml-1">{nodes.length}</Badge>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t("nodesHint")}</p>

        {nodes.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("noNodes")}</p>
        )}

        <div className="space-y-2">
          {nodes.map((node) => {
            const isOpen = !!expanded[node.id]
            const isBusy = !!nodeLoading[node.id]
            return (
              <div key={node.id} className="rounded-lg border border-border">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded((p) => ({ ...p, [node.id]: !p[node.id] }))}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{node.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="font-mono">{shortUuid(node.nodeId)}</span>
                        <span className="mx-1.5">·</span>
                        {node.tundraEnabled === false ? t("locallyDisabled") : t("locallyEnabled")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={node.tundraCertSha256 ? "default" : "secondary"}>
                      {node.tundraCertSha256 ? <ShieldCheck className="h-3 w-3" /> : null}
                      {node.tundraCertSha256 ? t("certPresent") : t("certMissing")}
                    </Badge>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("participate")}</p>
                          <p className="text-[11px] text-muted-foreground">{node.nodeId ? t("participateHint") : t("nodeIdMissing")}</p>
                        </div>
                        <Button
                          variant={node.tundraEnabled === false ? "default" : "outline"}
                          size="sm"
                          disabled={!node.nodeId || isBusy}
                          onClick={() => saveNodeConfig(node, { tundraEnabled: node.tundraEnabled === false })}
                        >
                          {node.tundraEnabled === false ? t("enable") : t("disable")}
                        </Button>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">{t("tunnelPort")}</p>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          defaultValue={node.tundraTunnelPort ?? config?.defaultTunnelPort}
                          disabled={isBusy}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v > 0 && v <= 65535 && v !== node.tundraTunnelPort) {
                              saveNodeConfig(node, { tunnelPort: v })
                            }
                          }}
                          className="mt-1.5 w-32"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Link2 className="h-3.5 w-3.5" />
                        <span>{t("host")}:</span>
                        <code className="text-foreground">
                          {node.tundraHost || node.fqdn || "auto"}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>{t("certFingerprint")}:</span>
                        <code className="text-foreground font-mono">{shortUuid(node.tundraCertSha256)}</code>
                      </div>
                    </div>

                    {nodeStates[node.id] && (
                      <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono text-muted-foreground break-all">{nodeStates[node.id]}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <Button variant="outline" size="sm" disabled={isBusy} onClick={() => runNodeAction(node.id, "sync")}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("sync")}
                      </Button>
                      <Button variant="outline" size="sm" disabled={isBusy} onClick={() => runNodeAction(node.id, "rotate")}>
                        <RotateCw className="h-3.5 w-3.5" />
                        {t("rotate")}
                      </Button>
                      <Button variant="outline" size="sm" disabled={isBusy} onClick={() => runNodeAction(node.id, "metrics")}>
                        <Activity className="h-3.5 w-3.5" />
                        {t("metrics")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => saveNodeConfig(node, { clearCert: true })}
                      >
                        {t("clearCert")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── ACLs ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("aclsTitle")}</h3>
          <Badge variant="outline" className="ml-1">{acls.length}</Badge>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{t("aclsHint")}</p>

        <form onSubmit={addAcl} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-muted-foreground mb-1">{t("srcServer")}</label>
            <Input
              value={srcServer}
              onChange={(e) => setSrcServer(e.target.value)}
              placeholder="server-uuid"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-muted-foreground mb-1">{t("dstServer")}</label>
            <Input
              value={dstServer}
              onChange={(e) => setDstServer(e.target.value)}
              placeholder="server-uuid"
              className="font-mono text-xs"
            />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            <Plus className="h-3.5 w-3.5" />
            {t("addAcl")}
          </Button>
        </form>

        {acls.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noAcls")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">{t("srcServer")}</th>
                  <th className="pb-2 pr-3 font-medium">{t("dstServer")}</th>
                  <th className="pb-2 pr-3 font-medium">{t("createdAt")}</th>
                  <th className="pb-2 font-medium text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {acls.map((acl) => (
                  <tr key={acl.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs">{acl.srcServer}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{acl.dstServer}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {acl.createdAt ? new Date(acl.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAcl(acl.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}