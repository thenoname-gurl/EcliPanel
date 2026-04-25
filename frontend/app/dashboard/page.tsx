"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/hooks/useAuth"
import { StatCard, SectionHeader, UsageBar } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"
import {
  Server,
  Shield,
  AlertTriangle,
  Activity,
  Cpu,
  Globe,
  Zap,
  HardDrive,
  MemoryStick,
} from "lucide-react"

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSocActivity(item: any, servers: any[]) {
  const metric = item?.metrics || {}
  const server = servers.find((s) => (s.uuid || s.id) === item?.serverId)
  const serverName = server?.name || server?.label || item?.serverId
  const serverHref = server ? `/dashboard/servers/${server.uuid || server.id}` : undefined

  const title =
    item?.action ||
    metric.alert ||
    metric.threat ||
    metric.warn ||
    (item?.serverId ? `Server ${serverName} metrics` : "SOC event")

  const details: ReactNode[] = []

  if (item?.target) details.push(item.target)
  if (item?.serverId) {
    const serverLabel = server ? `Server ${serverName}` : `Server ${item.serverId}`
    if (serverHref) {
      details.push(
        <a
          key="server-link"
          href={serverHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          {serverLabel}
        </a>
      )
    } else {
      details.push(serverLabel)
    }
  }

  if (metric.cpu_absolute != null) details.push(`CPU ${Math.round(Number(metric.cpu_absolute))}%`)
  if (metric.memory_bytes != null) details.push(`RAM ${formatBytes(Number(metric.memory_bytes))}`)
  if (metric.disk_bytes != null) details.push(`Disk ${formatBytes(Number(metric.disk_bytes))}`)

  const network = metric.network || {}
  if (network.rx_bytes != null || network.tx_bytes != null) {
    const rx = network.rx_bytes != null ? formatBytes(Number(network.rx_bytes)) : "0 B"
    const tx = network.tx_bytes != null ? formatBytes(Number(network.tx_bytes)) : "0 B"
    details.push(`Net ${rx} / ${tx}`)
  }

  return {
    title,
    details,
    time: item?.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Unknown time",
  }
}

export default function SOCDashboard() {
  const t = useTranslations("dashboardPage")
  const { user } = useAuth();
  if (!user) {
    return <div className="p-8 text-center">{t("authInProgress")}</div>;
  }
  const [servers, setServers] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [socAlerts, setSocAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.servers)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setServers(list)
        list.forEach((s: any) => {
          const sid = s.uuid || s.id
          if (sid && !s.resources) {
            apiFetch(API_ENDPOINTS.serverStats.replace(":id", sid))
              .then((stats) => {
                if (stats && typeof stats === 'object' && Object.keys(stats).length > 0) {
                  setServers(prev => prev.map(sv =>
                    (sv.uuid || sv.id) === sid
                      ? { ...sv, resources: { ...sv.resources, cpu_absolute: stats.cpu_absolute ?? stats.cpu, memory_bytes: stats.memory_bytes ?? stats.memory, disk_bytes: stats.disk_bytes ?? stats.disk, network: stats.network, uptime: stats.uptime } }
                      : sv
                  ))
                }
              })
              .catch(() => {})
          }
        })
      })
      .catch((err) => console.error("failed to load servers", err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    apiFetch(API_ENDPOINTS.socOverview)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setRecentActivity(list.slice(0, 5))
        const alerts = list.filter((e: any) => e.metrics?.alert || e.metrics?.threat || e.metrics?.warn)
        setSocAlerts(alerts.slice(0, 5))
      })
      .catch(() => {
        setRecentActivity([])
        setSocAlerts([])
      })
  }, [])

  const myServers = servers.filter((s) => s.userId == null || s.userId === user.id)
  const otherServers = servers.filter((s) => s.userId != null && s.userId !== user.id)

  const myOnlineServers = myServers.filter((s) => s.status === "online" || s.status === "running").length
  const myOnlineList = myServers.filter((s) => s.status === "online" || s.status === "running")

  const otherOnlineServers = otherServers.filter((s) => s.status === "online" || s.status === "running").length
  const otherOnlineList = otherServers.filter((s) => s.status === "online" || s.status === "running")

  const onlineServers = myOnlineServers + otherOnlineServers
  const totalServers = servers.length
  const onlineList = [...myOnlineList, ...otherOnlineList]

  const myUptimePct = myServers.length > 0 ? Math.round((myOnlineServers / myServers.length) * 10000) / 100 : 0
  const totalUptimePct = totalServers > 0 ? Math.round((onlineServers / totalServers) * 10000) / 100 : 0

  const totalCpuPct = onlineList.reduce((a, s) => {
    const cpuVal = Number(s.resources?.cpu_absolute ?? 0)
    const cpuLimit = Number(s.build?.cpu_limit ?? 100)
    return a + (cpuLimit > 0 ? (cpuVal / cpuLimit) * 100 : cpuVal)
  }, 0)
  const avgCpu = onlineServers > 0 ? Math.round(totalCpuPct / onlineServers) : 0
  const totalMemUsed = onlineList.reduce((a, s) => a + (s.resources?.memory_bytes ?? 0), 0)
  const totalMemLimit = onlineList.reduce((a, s) => a + ((s.build?.memory_limit ?? 0) * 1024 * 1024), 0)
  const totalDiskUsed = onlineList.reduce((a, s) => a + (s.resources?.disk_bytes ?? 0), 0)
  const totalDiskLimit = onlineList.reduce((a, s) => a + ((s.build?.disk_space ?? 0) * 1024 * 1024), 0)
  const memPct = totalMemLimit > 0 ? Math.round((totalMemUsed / totalMemLimit) * 100) : 0
  const diskPct = totalDiskLimit > 0 ? Math.round((totalDiskUsed / totalDiskLimit) * 100) : 0

  const renderServerCard = (server: any) => {
    const cpuVal = Number(server.resources?.cpu_absolute ?? 0)
    const cpuLimit = Number(server.build?.cpu_limit ?? 100)
    const cpuPct = cpuLimit > 0 ? Math.round((cpuVal / cpuLimit) * 100) : Math.round(cpuVal)
    const memUsed = server.resources?.memory_bytes ?? 0
    const memLimit = (server.build?.memory_limit ?? 0) * 1024 * 1024
    const ramPct = memLimit > 0 ? Math.round((memUsed / memLimit) * 100) : 0
    const diskUsed = server.resources?.disk_bytes ?? 0
    const diskLimit = (server.build?.disk_space ?? 0) * 1024 * 1024
    const dkPct = diskLimit > 0 ? Math.round((diskUsed / diskLimit) * 100) : 0
    return (
      <div
        key={server.uuid || server.id}
        className="rounded-lg border border-border bg-secondary/30 p-4 transition-colors hover:border-primary/20"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm font-medium text-foreground">
              {server.name}
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {server.nodeName || server.node || ""}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <UsageBar label="CPU" value={cpuPct} />
            <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round(cpuVal)}%</p>
          </div>
          <div>
            <UsageBar label="RAM" value={ramPct} />
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(memUsed)} / {formatBytes(memLimit)}</p>
          </div>
          <div>
            <UsageBar label="Disk" value={dkPct} />
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(diskUsed)} / {formatBytes(diskLimit)}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div data-guide-id="dashboard-activity">
        <PanelHeader title={t("header.title")} description={t("header.description")} />
      </div>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
              title={t("stats.yourServersOnline")}
              value={`${myOnlineServers}/${myServers.length}`}
              subtitle={otherServers.length > 0 ? t("stats.others", { online: otherOnlineServers, total: otherServers.length }) : undefined}
              icon={Server}
            />
            <StatCard
              title={t("stats.totalServersOnline")}
              value={`${onlineServers}/${totalServers}`}
              icon={Globe}
            />
            <StatCard
              title={t("stats.threatLevel")}
              value={socAlerts.length > 0 ? t("stats.elevated") : t("stats.low")}
              subtitle={socAlerts.length > 0 ? t("stats.alertsDetected", { count: socAlerts.length }) : t("stats.noThreats")}
              icon={Shield}
            />
            <StatCard
              title={t("stats.uptime")}
              value={`${myUptimePct}%`}
              subtitle={totalServers > 0 ? t("stats.totalUptime", { value: totalUptimePct }) : t("stats.noServers")}
              icon={Activity}
            />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Server Health */}
            <div className="col-span-1 rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <SectionHeader title={t("serverHealth.title")} description={t("serverHealth.description")} />
              <div className="mt-4 flex flex-col gap-4">
                {onlineList.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t("serverHealth.noServersOnline")}</p>
                )}

                {myOnlineList.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-semibold text-foreground">{t("serverHealth.yourServers")}</h4>
                    <div className="flex flex-col gap-4">
                      {myOnlineList.map(renderServerCard)}
                    </div>
                  </div>
                )}

                {otherOnlineList.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-semibold text-foreground">{t("serverHealth.otherServers")}</h4>
                    <div className="flex flex-col gap-4">
                      {otherOnlineList.map(renderServerCard)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats & Activity */}
            <div className="flex flex-col gap-6">
              {/* Resource Summary */}
              <div className="rounded-xl border border-border bg-card p-5">
                <SectionHeader title={t("resourceSummary.title")} />
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Cpu className="h-4 w-4" />
                      <span>{t("resourceSummary.avgCpu")}</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {avgCpu}%
                    </span>
                  </div>
                  <UsageBar label="" value={avgCpu} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MemoryStick className="h-4 w-4" />
                      <span>{t("resourceSummary.totalRam")}</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {formatBytes(totalMemUsed)} / {formatBytes(totalMemLimit)}
                    </span>
                  </div>
                  <UsageBar label="" value={memPct} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HardDrive className="h-4 w-4" />
                      <span>{t("resourceSummary.totalDisk")}</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {formatBytes(totalDiskUsed)} / {formatBytes(totalDiskLimit)}
                    </span>
                  </div>
                  <UsageBar label="" value={diskPct} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Zap className="h-4 w-4" />
                      <span>{t("resourceSummary.serversOnline")}</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {onlineServers}/{totalServers}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-border bg-card p-5">
                <SectionHeader title={t("recentActivity.title")} />
                <div className="mt-4 flex flex-col gap-3">
                  {recentActivity.length === 0 ? (
                    <div className="rounded-lg border border-border/50 bg-secondary/10 p-4 text-center">
                      <p className="text-xs text-muted-foreground">{t("recentActivity.empty")}</p>
                    </div>
                  ) : (
                    recentActivity.map((item) => {
                      const { title, details, time } = formatSocActivity(item, servers)
                      return (
                        <div
                          key={item.id || item.timestamp}
                          className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/10 p-3 text-sm"
                        >
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="flex-1">
                            <p className="text-foreground leading-snug">{title}</p>
                            <p className="text-xs text-muted-foreground">
                              {details.length > 0 && (
                                <>
                                  {details.map((detail, idx) => (
                                    <span key={idx}>
                                      {detail}
                                      {idx < details.length - 1 ? " • " : ""}
                                    </span>
                                  ))}
                                  {' • '}
                                </>
                              )}{time}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Security Alerts */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SectionHeader title={t("securityAlerts.title")} description={t("securityAlerts.description")} />
            <div className="mt-4 flex flex-col gap-3">
              {socAlerts.length === 0 ? (
                <div className="flex items-center gap-4 rounded-lg border border-success/30 bg-success/5 p-4">
                  <Shield className="h-5 w-5 shrink-0 text-success" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{t("securityAlerts.noneTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("securityAlerts.noneSubtitle")}</p>
                  </div>
                </div>
              ) : (
                socAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center gap-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {alert.metrics?.alert || alert.metrics?.threat || alert.metrics?.warn || t("securityAlerts.eventDetected")}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("securityAlerts.server")}: {alert.serverId || t("securityAlerts.unknown")}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
