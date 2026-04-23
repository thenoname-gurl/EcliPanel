"use client"

import React, { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, RefreshCw, X } from "lucide-react"

type TunnelDevice = {
  device_code: string
  user_code: string
  name: string
  kind: string
  serverType?: string
  organisation?: string | null
  approved: boolean
  lastSeenAt: string | null
  createdAt: string
}

type TunnelAllocation = {
  id: number
  host: string
  port: number
  protocol: string
  status: string
  localHost: string
  localPort: number
  clientDevice: string | null
  serverDevice: string | null
  createdAt: string
  updatedAt: string
}

export default function TunnelsTab() {
  const t = useTranslations("adminPage")
  const [devices, setDevices] = useState<TunnelDevice[]>([])
  const [allocations, setAllocations] = useState<TunnelAllocation[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [organisations, setOrganisations] = useState<{ id: number; name: string }[]>([])
  const [serverTypeByDevice, setServerTypeByDevice] = useState<Record<string, string>>({})
  const [serverOrgByDevice, setServerOrgByDevice] = useState<Record<string, string>>({})

  const fetchData = async () => {
    setLoading(true)
    setError("")

    try {
      const [devicesRes, allocationsRes] = await Promise.all([
        apiFetch(API_ENDPOINTS.tunnelDevices),
        apiFetch(API_ENDPOINTS.tunnels),
      ])

      setDevices(Array.isArray(devicesRes?.devices) ? devicesRes.devices : [])
      setAllocations(Array.isArray(allocationsRes?.allocations) ? allocationsRes.allocations : [])
    } catch (err: any) {
      setError(err?.message || t("tunnelsTab.states.failedToLoad"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    apiFetch(API_ENDPOINTS.adminOrganisations)
      .then((d: any) => {
        const orgList = Array.isArray(d?.organisations) ? d.organisations : Array.isArray(d) ? d : []
        setOrganisations(orgList)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const defaultTypes: Record<string, string> = {}
    devices.forEach((device) => {
      if (device.device_code) {
        defaultTypes[device.device_code] = device.serverType || 'free_and_paid'
      }
    })
    setServerTypeByDevice((prev) => ({ ...defaultTypes, ...prev }))
  }, [devices])

  const approveDevice = async (device: TunnelDevice) => {
    setActionLoading(`approve-${device.user_code}`)
    setError("")

    try {
      const body: any = {
        device_code: device.device_code,
        user_code: device.user_code,
        name: device.name,
        kind: device.kind,
      }

      if (device.kind === 'server') {
        const selectedServerType = serverTypeByDevice[device.device_code] || device.serverType
        if (selectedServerType) {
          body.server_type = selectedServerType
        }

        const orgId = serverOrgByDevice[device.device_code]
        if (orgId) {
          body.organisation_id = Number(orgId)
        }
      }

      await apiFetch(API_ENDPOINTS.tunnelDeviceApprove, {
        method: "POST",
        body,
      })
      await fetchData()
    } catch (err: any) {
      setError(err?.message || t("tunnelsTab.states.failedToApprove"))
    } finally {
      setActionLoading(null)
    }
  }

  const closeAllocation = async (allocationId: number) => {
    setActionLoading(`close-${allocationId}`)
    setError("")

    try {
      await apiFetch(`${API_ENDPOINTS.tunnels}/${allocationId}/close`, {
        method: "POST",
      })
      await fetchData()
    } catch (err: any) {
      setError(err?.message || t("tunnelsTab.states.failedToClose"))
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (value: string | null) => {
    if (!value) return "—"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  const backendUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const clientBinaryUrl = backendUrl + API_ENDPOINTS.tunnelClientDownload
  const serverBinaryUrl = backendUrl + API_ENDPOINTS.tunnelServerDownload
  const curlClientCmd = `curl -fsSL \"${clientBinaryUrl}\" -o ecli-tunnel-client && chmod +x ecli-tunnel-client`
  const curlServerCmd = `curl -fsSL \"${serverBinaryUrl}\" -o ecli-tunnel-server && chmod +x ecli-tunnel-server`

  return (
    <div className="flex flex-col gap-6 max-w-full">
      <section className="mb-6">
        <h3 className="font-semibold mb-2">{t("downloads.client")}</h3>
        <div className="flex flex-col gap-2">
          <a
            href={API_ENDPOINTS.tunnelClientDownload}
            className="inline-block px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            download
          >
            {t("downloads.downloadClient")}
          </a>
          <div className="mt-2">
            <span className="font-mono text-xs select-all bg-muted px-2 py-1 rounded">{curlClientCmd}</span>
            <span className="ml-2 text-xs text-muted-foreground">{t("downloads.curlClient")}</span>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="font-semibold mb-2">{t("downloads.server")}</h3>
        <div className="flex flex-col gap-2">
          <a
            href={API_ENDPOINTS.tunnelServerDownload}
            className="inline-block px-4 py-2 rounded bg-secondary text-foreground hover:bg-secondary/90"
            download
          >
            {t("downloads.downloadServer")}
          </a>
          <div className="mt-2">
            <span className="font-mono text-xs select-all bg-muted px-2 py-1 rounded">{curlServerCmd}</span>
            <span className="ml-2 text-xs text-muted-foreground">{t("downloads.curlServer")}</span>
          </div>
        </div>
      </section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t("tunnelsTab.header.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("tunnelsTab.header.description")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="inline-flex items-center gap-2"
          onClick={fetchData}
          disabled={loading || actionLoading !== null}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {t("tunnelsTab.actions.refresh")}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("tunnelsTab.sections.devices")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("tunnelsTab.sections.devicesDescription")}</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {devices.length} {t("tunnelsTab.states.devices")}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">{t("tunnelsTab.labels.deviceCode")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.userCode")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.name")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.kind")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.serverType")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.organisation")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.approved")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.lastSeen")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.created")}</th>
                <th className="px-3 py-2 text-right">{t("tunnelsTab.labels.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? t("tunnelsTab.states.loading") : t("tunnelsTab.states.noDevices")}
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.user_code} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-mono text-xs text-foreground">{device.device_code}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{device.user_code}</td>
                    <td className="px-3 py-3 text-foreground">{device.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{device.kind}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {device.kind === 'server' && !device.approved ? (
                        <select
                          value={serverTypeByDevice[device.device_code] || device.serverType || 'free_and_paid'}
                          onChange={(event) =>
                            setServerTypeByDevice((prev) => ({
                              ...prev,
                              [device.device_code]: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none"
                        >
                          <option value="free">{t("tunnelsTab.serverTypes.free")}</option>
                          <option value="paid">{t("tunnelsTab.serverTypes.paid")}</option>
                          <option value="free_and_paid">{t("tunnelsTab.serverTypes.freeAndPaid")}</option>
                          <option value="enterprise">{t("tunnelsTab.serverTypes.enterprise")}</option>
                        </select>
                      ) : (
                        device.serverType || t("tunnelsTab.serverTypes.freeAndPaid")
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {device.kind === 'server' && !device.approved ? (
                        <select
                          value={serverOrgByDevice[device.device_code] || ''}
                          onChange={(event) =>
                            setServerOrgByDevice((prev) => ({
                              ...prev,
                              [device.device_code]: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none"
                        >
                          <option value="">{t("tunnelsTab.serverOrg.noOrg")}</option>
                          {organisations.map((org) => (
                            <option key={org.id} value={String(org.id)}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        device.organisation || '—'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={device.approved ? "secondary" : "outline"} className="text-[11px]">
                        {device.approved ? t("tunnelsTab.states.yes") : t("tunnelsTab.states.no")}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(device.lastSeenAt)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(device.createdAt)}</td>
                    <td className="px-3 py-3 text-right">
                      {!device.approved ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => approveDevice(device)}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center gap-2"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t("tunnelsTab.actions.approve")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("tunnelsTab.states.approved")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("tunnelsTab.sections.allocations")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("tunnelsTab.sections.allocationsDescription")}</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {allocations.length} {t("tunnelsTab.states.allocations")}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2">{t("tunnelsTab.labels.id")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.publicEndpoint")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.localTarget")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.status")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.clientDevice")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.serverDevice")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.created")}</th>
                <th className="px-3 py-2">{t("tunnelsTab.labels.updated")}</th>
                <th className="px-3 py-2 text-right">{t("tunnelsTab.labels.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? t("tunnelsTab.states.loading") : t("tunnelsTab.states.noAllocations")}
                  </td>
                </tr>
              ) : (
                allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 text-foreground">#{allocation.id}</td>
                    <td className="px-3 py-3 text-muted-foreground">{`${allocation.host}:${allocation.port}`}</td>
                    <td className="px-3 py-3 text-muted-foreground">{`${allocation.localHost}:${allocation.localPort}`}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-[11px]">
                        {allocation.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{allocation.clientDevice || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{allocation.serverDevice || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(allocation.createdAt)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(allocation.updatedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      {allocation.status !== "closed" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => closeAllocation(allocation.id)}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center gap-2"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("tunnelsTab.actions.close")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("tunnelsTab.states.closed")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}