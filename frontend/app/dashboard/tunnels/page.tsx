"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { apiFetch } from "@/lib/api-client"
import { FeatureGuard } from "@/components/panel/feature-guard"
import {
  Plus,
  Server,
  Globe,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  ShieldCheck,
  Copy,
  Terminal,
  Network,
  ChevronRight,
  AlertCircle,
} from "lucide-react"

export default function TunnelsPage() {
  const t = useTranslations("tunnelsPage")
  
  // State
  const [devices, setDevices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [localHost, setLocalHost] = useState("127.0.0.1")
  const [localPort, setLocalPort] = useState(8080)
  const [protocol, setProtocol] = useState("tcp")
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Load Data
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deviceRes, allocationRes] = await Promise.all([
        apiFetch("/api/tunnel/devices"),
        apiFetch("/api/tunnel/allocations"),
      ])
      const newDevices = deviceRes.devices || []
      setDevices(newDevices)
      setAllocations(allocationRes.allocations || [])
      const firstClient = newDevices.find((d: any) => d.kind === 'client' && d.approved)
      setSelectedDeviceId(firstClient?.id ?? null)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Actions
  async function approve(userCode: string, kind: string) {
    const name = prompt("Name for device", "agent")
    if (!name) return
    setActionLoading(`approve-${userCode}`)
    try {
      await apiFetch("/api/tunnel/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode, name, kind }),
      })
      await load()
    } catch (error) {
      console.error(error)
      alert(String(error))
    } finally {
      setActionLoading(null)
    }
  }

  async function createAllocation() {
    if (!selectedDeviceId) {
      alert('Please select a client device before creating an allocation.')
      return
    }

    setActionLoading("create-allocation")
    try {
      await apiFetch("/api/tunnel/allocations", {
        method: "POST",
        body: {
          client_device_id: selectedDeviceId,
          local_host: localHost,
          local_port: localPort,
          protocol,
        },
      })
      await load()
      // Reset form slightly or keep it? Let's keep it for bulk creation
    } catch (error) {
      console.error(error)
      alert(String(error))
    } finally {
      setActionLoading(null)
    }
  }

  async function closeAllocation(id: number) {
    setActionLoading(`close-${id}`)
    try {
      await apiFetch(`/api/tunnel/allocations/${id}/close`, { method: "POST" })
      await load()
    } catch (error) {
      console.error(error)
      alert(String(error))
    } finally {
      setActionLoading(null)
    }
  }

  async function deleteDevice(id: number) {
    if (!confirm("Delete this tunnel device and all its allocations?")) return
    setActionLoading(`delete-${id}`)
    try {
      await apiFetch(`/api/tunnel/devices/${id}/delete`, { method: "POST" })
      await load()
    } catch (error) {
      console.error(error)
      alert(String(error))
    } finally {
      setActionLoading(null)
    }
  }

  async function regenerateToken(id: number) {
    setActionLoading(`regen-${id}`)
    try {
      const data = await apiFetch(`/api/tunnel/devices/${id}/regenerate-token`, { method: "POST" })
      if (data?.access_token) {
        // In a real app, use a toast here. For now, alert matches original behavior but styled better
        const confirmed = confirm(`New token generated:\n\n${data.access_token}\n\nCopy to clipboard?`)
        if (confirmed) {
          navigator.clipboard.writeText(data.access_token)
        }
      }
      await load()
    } catch (error) {
      console.error(error)
      alert(String(error))
    } finally {
      setActionLoading(null)
    }
  }

  // Filtered Lists
  const filteredDevices = devices
    .filter((d) => d.kind === 'client')
    .filter((d) =>
      d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.user_code?.toLowerCase().includes(searchTerm.toLowerCase())
    )

  return (
    <FeatureGuard feature="tunnels">
      <PanelHeader title={t("header.title")} description={t("header.description")} />

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-4 sm:gap-5 p-3 sm:p-5 md:p-6 max-w-[100vw] w-full min-w-0 box-border pb-safe">
          
          {/* Create Allocation Card */}
          <section className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">{t("sections.createAllocation")}</h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("labels.clientDevice")}
                </label>
                <select
                  value={selectedDeviceId ?? ''}
                  onChange={(e) => setSelectedDeviceId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all appearance-none"
                >
                  <option value="">{t("placeholders.selectClientDevice")}</option>
                  {devices
                    .filter((d) => d.kind === 'client' && d.approved)
                    .map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name || device.user_code} ({device.user_code})
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("labels.localHost")}
                </label>
                <input
                  value={localHost}
                  onChange={(e) => setLocalHost(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("labels.localPort")}
                </label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(Number(e.target.value))}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("labels.protocol")}
                </label>
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all appearance-none"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  className="btn w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 disabled:opacity-50 transition-all min-h-[44px]"
                  onClick={createAllocation}
                  disabled={actionLoading === "create-allocation"}
                >
                  {actionLoading === "create-allocation" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t("actions.createAllocation")}
                </button>
              </div>
            </div>
          </section>

          {/* Devices Section */}
          <section className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50">
                  <Server className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t("sections.devices")}</h2>
                  <p className="text-xs text-muted-foreground">{devices.length} registered</p>
                </div>
              </div>
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("search.devices")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 pl-10 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading devices...</p>
              </div>
            ) : filteredDevices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Server className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">No devices found</h3>
                <p className="text-xs text-muted-foreground mt-1">Connect a tunnel agent to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/50">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Seen</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredDevices.map((device) => (
                      <tr key={device.id || device.device_code} className="group hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${device.approved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span className="font-medium text-sm text-foreground">{device.name || "Unnamed Device"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/50 capitalize">
                            {device.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted/30 px-2 py-1 rounded text-foreground font-mono">{device.user_code}</code>
                            <button 
                              onClick={() => navigator.clipboard.writeText(device.user_code)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Copy Code"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {device.approved ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Never"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!device.approved ? (
                              <button
                                className="inline-flex items-center justify-center rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 active:scale-95 transition-all"
                                onClick={() => approve(device.user_code, device.kind)}
                                disabled={actionLoading?.startsWith(`approve-${device.user_code}`)}
                              >
                                {actionLoading?.startsWith(`approve-${device.user_code}`) ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <CheckCircle className="h-3 w-3 mr-1"/>}
                                Approve
                              </button>
                            ) : (
                              <button
                                className="inline-flex items-center justify-center rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 active:scale-95 transition-all"
                                onClick={() => setSelectedDevice(device)}
                              >
                                Manage
                              </button>
                            )}
                            <button
                              className="inline-flex items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                              onClick={() => deleteDevice(device.id)}
                              disabled={actionLoading?.startsWith(`delete-${device.id}`)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Selected Device Details (Inline Panel) */}
          {selectedDevice && (
            <section className="rounded-2xl border border-primary/20 bg-card p-6 shadow-lg shadow-primary/5 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Terminal className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Manage Device</h2>
                    <p className="text-sm text-muted-foreground">{selectedDevice.name} ({selectedDevice.kind})</p>
                  </div>
                </div>
                <button 
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95"
                  onClick={() => setSelectedDevice(null)}
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Device Code</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm font-medium text-foreground truncate">{selectedDevice.device_code}</p>
                    <Copy className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => navigator.clipboard.writeText(selectedDevice.device_code)} />
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">User Code</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm font-medium text-foreground truncate">{selectedDevice.user_code}</p>
                    <Copy className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => navigator.clipboard.writeText(selectedDevice.user_code)} />
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Type</p>
                  <p className="text-sm font-medium capitalize text-foreground">{selectedDevice.kind}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${selectedDevice.approved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <p className="text-sm font-medium text-foreground">{selectedDevice.approved ? 'Approved' : 'Pending'}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row border-t border-border/50 pt-6">
                <button 
                  className="btn flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 active:scale-95 transition-all"
                  onClick={() => regenerateToken(selectedDevice.id)}
                  disabled={actionLoading?.startsWith(`regen-${selectedDevice.id}`)}
                >
                  {actionLoading?.startsWith(`regen-${selectedDevice.id}`) ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                  Regenerate Token
                </button>
                <button 
                  className="btn flex items-center justify-center gap-2 rounded-xl bg-destructive/10 px-5 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 active:scale-95 transition-all"
                  onClick={() => deleteDevice(selectedDevice.id)}
                  disabled={actionLoading?.startsWith(`delete-${selectedDevice.id}`)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Device
                </button>
              </div>
            </section>
          )}

          {/* Allocations Section */}
          <section className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50">
                  <Network className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t("sections.allocations")}</h2>
                  <p className="text-xs text-muted-foreground">{allocations.length} active tunnels</p>
                </div>
              </div>
            </div>

            {loading ? (
               <div className="flex flex-col items-center justify-center py-12 gap-3">
               <Loader2 className="h-6 w-6 animate-spin text-primary" />
               <p className="text-sm text-muted-foreground">Loading allocations...</p>
             </div>
            ) : allocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Network className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">No active allocations</h3>
                <p className="text-xs text-muted-foreground mt-1">Create a tunnel allocation above to start forwarding traffic.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/50">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public Endpoint</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Local Target</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protocol</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {allocations.map((allocation) => (
                      <tr key={allocation.id} className="group hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono text-sm text-foreground">{allocation.host}:{allocation.port}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{allocation.localHost}:{allocation.localPort}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/50 uppercase">
                            {allocation.protocol}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {allocation.status === 'closed' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                              <XCircle className="h-3.5 w-3.5" />
                              Closed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {allocation.createdAt ? new Date(allocation.createdAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {allocation.status !== 'closed' && (
                            <button
                              className="inline-flex items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                              onClick={() => closeAllocation(allocation.id)}
                              disabled={actionLoading === `close-${allocation.id}`}
                            >
                              {actionLoading === `close-${allocation.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <XCircle className="h-3 w-3 mr-1"/>}
                              Close
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}