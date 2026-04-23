"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
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
  AlertCircle,
  Download,
  ChevronDown,
  X,
} from "lucide-react"

// ─── Tiny reusable primitives ────────────────────────────────────────────────

function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "danger" | "muted"
}) {
  const cls = {
    default: "bg-muted/60 text-muted-foreground ring-border/40",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    danger:  "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
    muted:   "bg-muted/40 text-muted-foreground ring-border/30",
  }[variant]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  )
}

function IconBox({ children, color = "default" }: { children: React.ReactNode; color?: string }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
      {children}
    </div>
  )
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border/50 bg-card shadow-sm ${className}`}>
      {children}
    </section>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6 gap-3">
      <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
        <Icon className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className={`rounded p-1 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all active:scale-90 ${className}`}
    >
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function CommandSnippet({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 min-w-0">
      <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <code className="flex-1 truncate font-mono text-xs text-foreground/80 select-all">{cmd}</code>
      <CopyButton value={cmd} />
    </div>
  )
}

// ─── Input / Select styles ────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"

const selectCls = inputCls + " appearance-none cursor-pointer pr-8"

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TunnelsPage() {
  const t = useTranslations("tunnelsPage")

  const kindLabel = (kind: string) => {
    if (kind === "server") return t("labels.serverDevice")
    if (kind === "client") return t("labels.clientDevice")
    return kind
  }

  const backendUrl = typeof window !== "undefined" ? window.location.origin : ""
  const clientBinaryUrl = backendUrl + API_ENDPOINTS.tunnelClientDownload
  const serverBinaryUrl = backendUrl + API_ENDPOINTS.tunnelServerDownload
  const curlClientCmd = `curl -fsSL "${clientBinaryUrl}" -o ecli-tunnel-client && chmod +x ecli-tunnel-client`
  const curlServerCmd = `curl -fsSL "${serverBinaryUrl}" -o ecli-tunnel-server && chmod +x ecli-tunnel-server`

  const [devices, setDevices] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [localHost, setLocalHost] = useState("127.0.0.1")
  const [localPort, setLocalPort] = useState(8080)
  const [protocol, setProtocol] = useState("tcp")
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [managedDevice, setManagedDevice] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

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
      const firstClient = newDevices.find((d: any) => d.kind === "client" && d.approved)
      setSelectedDeviceId((prev) => prev ?? firstClient?.id ?? null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ──────────────────────────────────────────────────────────────

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
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  async function createAllocation() {
    setFormError(null)
    if (!selectedDeviceId) {
      setFormError("Please select a client device first.")
      return
    }
    setActionLoading("create-allocation")
    try {
      await apiFetch("/api/tunnel/allocations", {
        method: "POST",
        body: { client_device_id: selectedDeviceId, local_host: localHost, local_port: localPort, protocol },
      })
      await load()
    } catch (err: any) {
      setFormError(String(err))
    } finally {
      setActionLoading(null)
    }
  }

  async function closeAllocation(id: number) {
    setActionLoading(`close-${id}`)
    try {
      await apiFetch(`/api/tunnel/allocations/${id}/close`, { method: "POST" })
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  async function deleteDevice(id: number) {
    if (!confirm("Delete this tunnel device and all its allocations?")) return
    setActionLoading(`delete-${id}`)
    try {
      await apiFetch(`/api/tunnel/devices/${id}/delete`, { method: "POST" })
      if (managedDevice?.id === id) setManagedDevice(null)
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  async function regenerateToken(id: number) {
    setActionLoading(`regen-${id}`)
    try {
      const data = await apiFetch(`/api/tunnel/devices/${id}/regenerate-token`, { method: "POST" })
      if (data?.access_token) {
        navigator.clipboard.writeText(data.access_token)
      }
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const clientDevices = devices.filter((d) => d.kind === "client")
  const approvedClients = clientDevices.filter((d) => d.approved)

  const filteredDevices = devices.filter(
    (d) =>
      d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.user_code?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pendingCount = devices.filter((d) => !d.approved).length

  return (
    <FeatureGuard feature="tunnels">
      <PanelHeader title={t("header.title")} description={t("header.description")} />

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto w-full pb-10">

          {/* ── Downloads ──────────────────────────────────────────────────── */}
          <SectionCard>
            <div className="p-4 sm:p-5 border-b border-border/50 flex items-center gap-2">
              <IconBox color="bg-primary/10">
                <Download className="h-4 w-4 text-primary" />
              </IconBox>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t("downloads.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("downloads.description")}</p>
              </div>
            </div>

            <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
              {/* Client */}
              <div className="flex flex-col gap-2.5 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{t("downloads.client")}</span>
                  <Badge variant="muted">Client</Badge>
                </div>
                <CommandSnippet cmd={curlClientCmd} />
                <p className="text-xs text-muted-foreground">{t("downloads.clientCurlDesc")}</p>
                <a
                  href={API_ENDPOINTS.tunnelClientDownload}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("downloads.downloadClient")}
                </a>
              </div>

              {/* Server */}
              <div className="flex flex-col gap-2.5 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{t("downloads.server")}</span>
                  <Badge variant="muted">Server</Badge>
                </div>
                <CommandSnippet cmd={curlServerCmd} />
                <p className="text-xs text-muted-foreground">{t("downloads.serverCurlDesc")}</p>
                <a
                  href={API_ENDPOINTS.tunnelServerDownload}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/60 px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/90 active:scale-95 transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("downloads.downloadServer")}
                </a>
              </div>
            </div>
          </SectionCard>

          {/* ── Create Allocation ───────────────────────────────────────────── */}
          <SectionCard>
            <div className="p-4 sm:p-5 border-b border-border/50 flex items-center gap-2">
              <IconBox color="bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </IconBox>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t("sections.createAllocation")}</h2>
                <p className="text-xs text-muted-foreground">{t("sections.createAllocationDescription")}</p>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Inline form error */}
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{formError}</p>
                  <button onClick={() => setFormError(null)} className="ml-auto shrink-0 text-destructive/60 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Client Device */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("labels.clientDevice")}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedDeviceId ?? ""}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value ? Number(e.target.value) : null)
                        setFormError(null)
                      }}
                      className={`${selectCls} ${!selectedDeviceId ? "border-amber-500/40 focus:border-amber-500/60 focus:ring-amber-500/10" : ""}`}
                    >
                      <option value="">{t("placeholders.selectClientDevice")}</option>
                      {approvedClients.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.user_code} — {d.user_code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  </div>
                  {approvedClients.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {t("states.noApprovedClients")}
                    </p>
                  )}
                </div>

                {/* Local Host */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("labels.localHost")}
                  </label>
                  <input
                    value={localHost}
                    onChange={(e) => setLocalHost(e.target.value)}
                    placeholder="127.0.0.1"
                    className={inputCls}
                  />
                </div>

                {/* Local Port */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("labels.localPort")}
                  </label>
                  <input
                    type="number"
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className={inputCls}
                    min={1}
                    max={65535}
                  />
                </div>

                {/* Protocol */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("labels.protocol")}
                  </label>
                  <div className="relative">
                    <select
                      value={protocol}
                      onChange={(e) => setProtocol(e.target.value)}
                      className={selectCls}
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  </div>
                </div>

                {/* Submit */}
                <div className="flex items-end sm:col-span-2 lg:col-span-1">
                  <button
                    onClick={createAllocation}
                    disabled={actionLoading === "create-allocation"}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]"
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
            </div>
          </SectionCard>

          {/* ── Devices ─────────────────────────────────────────────────────── */}
          <SectionCard>
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconBox color="bg-secondary/60">
                  <Server className="h-4 w-4 text-foreground" />
                </IconBox>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{t("sections.devices")}</h2>
                    {pendingCount > 0 && (
                      <Badge variant="warning">
                        <ShieldCheck className="h-3 w-3" />
                        {pendingCount} {t('states.pending')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{devices.length} registered</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder={t("search.devices")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            {loading ? (
              <LoadingState label={t("states.loading")} />
            ) : filteredDevices.length === 0 ? (
              <EmptyState
                icon={Server}
                title={searchTerm ? t("states.noDevicesMatchSearch") : t("states.noDevicesConnected")}
                description={searchTerm ? t("states.tryDifferentSearchTerm") : t("states.downloadAgentToGetStarted")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/50 text-sm">
                  <thead>
                    <tr className="bg-muted/20">
                      {[t('labels.name'), t('labels.type'), t('labels.userCode'), t('labels.status'), t('labels.lastSeen'), ''].map((h) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${h === '' ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredDevices.map((device) => {
                      const isManaged = managedDevice?.id === device.id
                      return (
                        <React.Fragment key={device.id ?? device.user_code}>
                          <tr className={`group transition-colors ${isManaged ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                            {/* Name */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    device.approved ? "bg-emerald-500" : "bg-amber-400"
                                  }`}
                                />
                                <span className="font-medium text-foreground truncate max-w-[140px]">
                                  {device.name || t('states.unnamedDevice')}
                                </span>
                              </div>
                            </td>
                            {/* Type */}
                            <td className="px-4 py-3">
                              <Badge variant="muted">{kindLabel(device.kind)}</Badge>
                            </td>
                            {/* Code */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <code className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-foreground">
                                  {device.user_code}
                                </code>
                                <CopyButton value={device.user_code} />
                              </div>
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3">
                              {device.approved ? (
                                <Badge variant="success">
                                  <CheckCircle className="h-3 w-3" /> {t('states.approved')}
                                </Badge>
                              ) : (
                                <Badge variant="warning">
                                  <ShieldCheck className="h-3 w-3" /> {t('states.pending')}
                                </Badge>
                              )}
                            </td>
                            {/* Last Seen */}
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {device.lastSeenAt
                                ? new Date(device.lastSeenAt).toLocaleString()
                                : t('states.never')}
                            </td>
                            {/* Actions */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!device.approved ? (
                                  <ActionButton
                                    loading={actionLoading === `approve-${device.user_code}`}
                                    onClick={() => approve(device.user_code, device.kind)}
                                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                                    label={t('actions.approve')}
                                    variant="default"
                                  />
                                ) : (
                                  <ActionButton
                                    loading={false}
                                    onClick={() => setManagedDevice(isManaged ? null : device)}
                                    icon={<Terminal className="h-3.5 w-3.5" />}
                                    label={isManaged ? t('actions.close') : t('actions.manage')}
                                    variant={isManaged ? 'active' : 'default'}
                                  />
                                )}
                                <ActionButton
                                  loading={actionLoading === `delete-${device.id}`}
                                  onClick={() => deleteDevice(device.id)}
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                  label=""
                                  variant="danger"
                                />
                              </div>
                            </td>
                          </tr>

                          {/* ── Inline Manage Panel ── */}
                          {isManaged && (
                            <tr>
                              <td colSpan={6} className="px-4 pb-4 pt-0">
                                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoTile label={t('labels.deviceCode')} value={device.device_code} mono copyable />
                                    <InfoTile label={t('labels.userCode')} value={device.user_code} mono copyable />
                                    <InfoTile label={t('labels.type')} value={kindLabel(device.kind)} />
                                    <InfoTile
                                      label={t('labels.status')}
                                      value={device.approved ? t('states.approved') : t('states.pending')}
                                      dot={device.approved ? 'emerald' : 'amber'}
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                                    <ActionButton
                                      loading={actionLoading === `regen-${device.id}`}
                                      onClick={() => regenerateToken(device.id)}
                                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                                      label={t('actions.regenerateToken')}
                                      variant="default"
                                    />
                                    <ActionButton
                                      loading={actionLoading === `delete-${device.id}`}
                                      onClick={() => deleteDevice(device.id)}
                                      icon={<Trash2 className="h-3.5 w-3.5" />}
                                      label={t('actions.deleteDevice')}
                                      variant="danger"
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ── Allocations ──────────────────────────────────────────────────── */}
          <SectionCard>
            <div className="p-4 sm:p-5 border-b border-border/50 flex items-center gap-2">
              <IconBox color="bg-secondary/60">
                <Network className="h-4 w-4 text-foreground" />
              </IconBox>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t("sections.allocations")}</h2>
                <p className="text-xs text-muted-foreground">{allocations.length} tunnel(s) allocated</p>
              </div>
            </div>

            {loading ? (
              <LoadingState label={t('states.loading')} />
            ) : allocations.length === 0 ? (
              <EmptyState
                icon={Network}
                title={t('states.noAllocationsYet')}
                description={t('states.createAllocationHint')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/50 text-sm">
                  <thead>
                    <tr className="bg-muted/20">
                      {[t('labels.publicEndpoint'), t('labels.localTarget'), t('labels.protocol'), t('labels.status'), t('labels.created'), ''].map((h) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${h === '' ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {allocations.map((a) => (
                      <tr key={a.id} className="group hover:bg-muted/20 transition-colors">
                        {/* Public Endpoint */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                            <span className="font-mono text-xs text-foreground">
                              {a.host}:{a.port}
                            </span>
                            <CopyButton value={`${a.host}:${a.port}`} />
                          </div>
                        </td>
                        {/* Local Target */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.localHost}:{a.localPort}
                          </span>
                        </td>
                        {/* Protocol */}
                        <td className="px-4 py-3">
                          <Badge variant="muted">{a.protocol?.toUpperCase()}</Badge>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          {a.status === "closed" ? (
                            <Badge variant="muted">
                              <XCircle className="h-3 w-3" /> {t('states.closed')}
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3" /> {t('states.active')}
                            </Badge>
                          )}
                        </td>
                        {/* Created */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          {a.status !== "closed" && (
                            <ActionButton
                              loading={actionLoading === `close-${a.id}`}
                              onClick={() => closeAllocation(a.id)}
                              icon={<XCircle className="h-3.5 w-3.5" />}
                              label={t('actions.close')}
                              variant="danger"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}

// ─── Shared action button ─────────────────────────────────────────────────────

function ActionButton({
  loading,
  onClick,
  icon,
  label,
  variant,
  disabled,
}: {
  loading: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  variant: "default" | "danger" | "active"
  disabled?: boolean
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"

  const variants = {
    default: "border border-border/50 bg-background text-foreground hover:bg-muted/60",
    danger:  "border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/15",
    active:  "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  }

  return (
    <button onClick={onClick} disabled={loading || disabled} className={`${base} ${variants[variant]}`}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label && <span>{label}</span>}
    </button>
  )
}

// ─── Info tile used in inline manage panel ────────────────────────────────────

function InfoTile({
  label,
  value,
  mono,
  copyable,
  dot,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
  dot?: "emerald" | "amber"
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 space-y-1 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {dot && (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                dot === "emerald" ? "bg-emerald-500" : "bg-amber-400"
              }`}
            />
          )}
          <p
            className={`truncate text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}
            title={value}
          >
            {value}
          </p>
        </div>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  )
}