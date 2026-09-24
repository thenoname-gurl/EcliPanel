"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { LoadingState, SectionHeader } from "./serverTabShared"
import { cn } from "@/lib/utils"
import {
  Loader2,
  Plus,
  Trash2,
  Network,
  Link2,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
  X,
  Save,
} from "lucide-react"

interface TunnelInfo {
  name: string
  alias: string
  address: string | null
  created: string
}

interface TunnelPort {
  port: number
  protocols: string[]
  created: string
}

interface TunnelPeer {
  server_uuid: string
  server_name: string
  name: string
  alias: string
  address: string | null
  ports: TunnelPort[]
  created: string
  status: "active" | "pending"
}

interface TunnelState {
  supported: boolean
  tunnel: TunnelInfo | null
  ports: TunnelPort[]
  allocation_ports: number[]
  outgoing: TunnelPeer[]
  incoming: TunnelPeer[]
}

interface AvailableServer {
  uuid: string
  name: string
  tunnel: TunnelInfo | null
}

const PROTOCOLS = ["tcp", "udp"] as const

export function TunnelTab({ serverId }: { serverId: string }) {
  const t = useTranslations("serverDetailPage")
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<TunnelState | null>(null)

  // create tunnel
  const [createName, setCreateName] = useState("")

  // ports
  const [editingPorts, setEditingPorts] = useState(false)
  const [portRows, setPortRows] = useState<{ port: string; protocols: string[] }[]>([])

  // connections
  const [showConnect, setShowConnect] = useState(false)
  const [available, setAvailable] = useState<AvailableServer[]>([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [connectSearch, setConnectSearch] = useState("")
  const [showOthers, setShowOthers] = useState(false)
  const isAdmin = hasPermission(user, "servers:list")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(API_ENDPOINTS.serverTunnel.replace(":id", serverId))
      setState(res as TunnelState)
    } catch (e: any) {
      setError(e?.message || t("tunnel.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [serverId, t])

  useEffect(() => {
    load()
  }, [load])

  const loadAvailable = useCallback(
    async (search?: string) => {
      setAvailableLoading(true)
      try {
        const params = new URLSearchParams({ page: "1", per_page: "50" })
        if (search?.trim()) params.set("search", search.trim())
        if (showOthers) params.set("other", "true")
        const res = await apiFetch(
          `${API_ENDPOINTS.serverTunnelAvailable.replace(":id", serverId)}?${params.toString()}`
        )
        setAvailable(Array.isArray((res as any)?.data) ? (res as any).data : [])
      } catch (e: any) {
        toast.error(e?.message || t("tunnel.availableLoadFailed"))
      } finally {
        setAvailableLoading(false)
      }
    },
    [serverId, t]
  )

  const enroll = async () => {
    setBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverTunnel.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ name: createName.trim() || undefined }),
      })
      toast.success(t("tunnel.created"))
      setCreateName("")
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.createFailed"))
    } finally {
      setBusy(false)
    }
  }

  const renameTunnel = async () => {
    if (!state?.tunnel) return
    const next = window.prompt(t("tunnel.namePlaceholder"), state.tunnel.name)
    if (next === null) return
    if (!next.trim()) {
      toast.error(t("tunnel.nameRequired"))
      return
    }
    setBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverTunnel.replace(":id", serverId), {
        method: "PATCH",
        body: JSON.stringify({ name: next.trim() }),
      })
      toast.success(t("tunnel.renamed"))
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.renameFailed"))
    } finally {
      setBusy(false)
    }
  }

  const unenroll = async () => {
    if (!confirm(t("tunnel.confirmDelete"))) return
    setBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverTunnel.replace(":id", serverId), {
        method: "DELETE",
      })
      toast.success(t("tunnel.deleted"))
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.deleteFailed"))
    } finally {
      setBusy(false)
    }
  }

  const startPortEdit = () => {
    const current = state?.ports || []
    const rows = current.map(p => ({
      port: String(p.port),
      protocols: p.protocols?.length ? [...p.protocols] : ["tcp"],
    }))
    if (!rows.length) rows.push({ port: "", protocols: ["tcp"] })
    setPortRows(rows)
    setEditingPorts(true)
  }

  const addPortRow = () => setPortRows(prev => [...prev, { port: "", protocols: ["tcp"] }])
  const updatePortRow = (index: number, patch: Partial<{ port: string; protocols: string[] }>) => {
    setPortRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const removePortRow = (index: number) => setPortRows(prev => prev.filter((_, i) => i !== index))

  const savePorts = async () => {
    const cleaned = portRows
      .map(r => ({ port: Number(r.port), protocols: r.protocols.filter(p => p === "tcp" || p === "udp") }))
      .filter(r => Number.isInteger(r.port) && r.port > 0 && r.port <= 65535)
    setBusy(true)
    try {
      await apiFetch(`${API_ENDPOINTS.serverTunnel.replace(":id", serverId)}/ports`, {
        method: "PUT",
        body: JSON.stringify({ ports: cleaned }),
      })
      toast.success(t("tunnel.portsUpdated"))
      setEditingPorts(false)
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.portsUpdateFailed"))
    } finally {
      setBusy(false)
    }
  }

  const toggleProto = (index: number, proto: string) => {
    setPortRows(prev =>
      prev.map((row, i) => {
        if (i !== index) return row
        const has = row.protocols.includes(proto)
        const protocols = has
          ? row.protocols.filter(p => p !== proto)
          : [...row.protocols, proto]
        if (!protocols.length) protocols.push("tcp")
        return { ...row, protocols }
      })
    )
  }

  const connect = async (targetUuid: string) => {
    setBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverTunnelConnections.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ server: targetUuid }),
      })
      toast.success(t("tunnel.connectionRequestSent"))
      setShowConnect(false)
      setConnectSearch("")
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.createConnectionFailed"))
    } finally {
      setBusy(false)
    }
  }

  const acceptRequest = async (peerUuid: string) => {
    setBusy(true)
    try {
      await apiFetch(
        API_ENDPOINTS.serverTunnelConnectionAccept
          .replace(":id", serverId)
          .replace(":connectionId", peerUuid),
        { method: "POST" }
      )
      toast.success(t("tunnel.accepted"))
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.acceptFailed"))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (peerUuid: string, incoming: boolean) => {
    if (!confirm(t("tunnel.confirmDeleteConnection"))) return
    setBusy(true)
    try {
      await apiFetch(
        API_ENDPOINTS.serverTunnelConnection
          .replace(":id", serverId)
          .replace(":connectionId", peerUuid) + `?incoming=${incoming}`,
        { method: "DELETE" }
      )
      toast.success(t("tunnel.connectionDeleted"))
      load()
    } catch (e: any) {
      toast.error(e?.message || t("tunnel.deleteConnectionFailed"))
    } finally {
      setBusy(false)
    }
  }

  const openConnect = async () => {
    setShowConnect(true)
    if (!available.length) loadAvailable()
  }

  if (loading) return <LoadingState message={t("tunnel.loading")} />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("tunnel.title")}
        icon={Network}
        action={
          <Button size="sm" onClick={() => load()} disabled={busy} className="gap-1.5" variant="outline">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t("actions.refresh")}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Enrollment / membership */}
      <div className="border border-border bg-secondary/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            {t("tunnel.status")}
          </p>
        </div>
        <div className="px-4 py-3">
          {state?.supported === false ? (
            <div className="flex items-center gap-2 px-3 py-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{t("tunnel.notSupported")}</span>
            </div>
          ) : state?.tunnel ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-border bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("tunnel.tunnelName")}</p>
                  <p className="text-sm font-mono font-medium">{state.tunnel.name}</p>
                </div>
                <div className="border border-border bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("tunnel.address")}</p>
                  <p className="text-sm font-mono font-medium break-all">{state.tunnel.address || "—"}</p>
                </div>
                <div className="border border-border bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("tunnel.createdAt")}</p>
                  <p className="text-sm font-mono font-medium">{new Date(state.tunnel.created).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={renameTunnel} disabled={busy}>
                  {t("tunnel.rename")}
                </Button>
                <Button variant="destructive" size="sm" onClick={unenroll} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {t("tunnel.delete")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <WifiOff className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("tunnel.noTunnel")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("tunnel.createHint")}</p>
                <div className="flex items-center gap-2 justify-center mt-3">
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={t("tunnel.namePlaceholder")}
                    className="w-48 font-mono text-sm"
                  />
                  <Button size="sm" onClick={enroll} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                    {t("tunnel.create")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ports */}
      {state?.tunnel && (
        <div className="border border-border bg-secondary/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              {t("tunnel.ports")}
            </p>
            <Badge variant={state.ports.length > 0 ? "default" : "secondary"}>
              {state.ports.length}
            </Badge>
          </div>
          <div className="px-4 py-3">
            {!editingPorts ? (
              <>
                {state.ports.length > 0 ? (
                  <div className="space-y-2">
                    {state.ports.map((port, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 border border-border bg-secondary/20 rounded-lg">
                        <span className="font-mono text-sm text-foreground">{port.port}</span>
                        <div className="flex gap-1.5">
                          {port.protocols.map(p => (
                            <Badge key={p} variant="outline" className="text-xs uppercase">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("tunnel.noPorts")}</p>
                )}

                

                <div className="flex justify-end pt-3">
                  <Button variant="outline" size="sm" onClick={startPortEdit} disabled={busy}>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {t("tunnel.editPorts")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {portRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={row.port}
                      onChange={(e) => updatePortRow(index, { port: e.target.value })}
                      placeholder={t("tunnel.dstPortPlaceholder")}
                      className="w-28 font-mono text-sm"
                    />
                    <div className="flex gap-1.5">
                      {PROTOCOLS.map(proto => (
                        <button
                          key={proto}
                          type="button"
                          onClick={() => toggleProto(index, proto)}
                          className={cn(
                            "px-2 py-1 text-xs rounded border transition-colors uppercase",
                            row.protocols.includes(proto)
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          {proto}
                        </button>
                      ))}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePortRow(index)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={addPortRow}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t("tunnel.addPort")}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingPorts(false)} disabled={busy}>
                      {t("actions.cancel")}
                    </Button>
                    <Button size="sm" onClick={savePorts} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      {t("tunnel.portsUpdateBtn")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connections */}
      {state?.tunnel && (
        <div className="border border-border bg-secondary/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              {t("tunnel.connections")}
            </p>
            <Button size="sm" variant="outline" onClick={openConnect} disabled={busy}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("tunnel.connect")}
            </Button>
          </div>
          <div className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border bg-secondary/20 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">{t("tunnel.outgoing")}</p>
                  <Badge variant={state.outgoing.length > 0 ? "default" : "secondary"}>
                    {state.outgoing.length}
                  </Badge>
                </div>
                {state.outgoing.length > 0 ? (
                  <div className="space-y-2">
                    {state.outgoing.map(peer => (
                      <div key={peer.server_uuid} className="flex items-center justify-between px-3 py-2 border border-border bg-secondary/20 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-mono text-sm text-foreground truncate">{peer.name}</p>
                            {peer.status === "pending" && (
                              <Badge variant="outline" className="text-[10px] shrink-0 text-amber-500">
                                {t("tunnel.pending")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{peer.address || peer.alias}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => disconnect(peer.server_uuid, false)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("tunnel.noOutgoing")}</p>
                )}
              </div>

              <div className="border border-border bg-secondary/20 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">{t("tunnel.incoming")}</p>
                  <Badge variant={state.incoming.length > 0 ? "default" : "secondary"}>
                    {state.incoming.length}
                  </Badge>
                </div>
                {state.incoming.length > 0 ? (
                  <div className="space-y-2">
                    {state.incoming.map(peer => (
                      <div key={peer.server_uuid} className="flex items-center justify-between px-3 py-2 border border-border bg-secondary/20 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-mono text-sm text-foreground truncate">{peer.name}</p>
                            {peer.status === "pending" && (
                              <Badge variant="outline" className="text-[10px] shrink-0 text-amber-500">
                                {t("tunnel.pending")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{peer.address || peer.alias}</p>
                        </div>
                        {peer.status === "pending" ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button size="sm" onClick={() => acceptRequest(peer.server_uuid)} disabled={busy}>
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              {t("tunnel.accept")}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => disconnect(peer.server_uuid, true)} disabled={busy}>
                              {t("tunnel.decline")}
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => disconnect(peer.server_uuid, true)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("tunnel.noIncoming")}</p>
                )}
              </div>
            </div>

            {showConnect && (
              <div className="mt-4 p-3 border border-dashed border-primary/30 bg-primary/5 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={connectSearch}
                    onChange={(e) => setConnectSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadAvailable(connectSearch)
                    }}
                    placeholder={t("tunnel.searchPlaceholder")}
                    className="font-mono text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={() => loadAvailable(connectSearch)} disabled={availableLoading}>
                    {availableLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {isAdmin && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={showOthers}
                      onClick={() => {
                        const next = !showOthers
                        setShowOthers(next)
                        loadAvailable(connectSearch)
                      }}
                      className={cn(
                        "h-4 w-8 rounded-full relative transition-colors",
                        showOthers ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all",
                          showOthers ? "left-4" : "left-0.5"
                        )}
                      />
                    </button>
                    <span className="text-xs text-muted-foreground">{t("tunnel.othersSwitch")}</span>
                  </label>
                )}

                {availableLoading ? (
                  <p className="text-sm text-muted-foreground">{t("tunnel.availableLoading")}</p>
                ) : available.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {available.map(s => (
                      <div key={s.uuid} className="flex items-center justify-between px-3 py-2 border border-border bg-secondary/20 rounded-lg">
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-mono text-sm text-foreground truncate">{s.name}</p>
                          {s.tunnel && (
                            <p className="text-xs text-muted-foreground truncate">{s.tunnel.name || s.tunnel.address}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          disabled={busy || !s.tunnel}
                          onClick={() => connect(s.uuid)}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                          {t("tunnel.connectTo")}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("tunnel.noAvailable")}</p>
                )}

                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowConnect(false)}>
                    {t("actions.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}