"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { StatCard, SectionHeader, UsageBar } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import Link from "next/link"
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
  AlertCircle,
  LogIn,
  LogOut,
  CreditCard,
  UserPlus,
  FileText,
} from "lucide-react"

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function guessActivityType(action: string): string {
  const a = (action || "").toLowerCase()
  if (/logout|signout/.test(a)) return "logout"
  if (/login|signin/.test(a)) return "login"
  if (/register|signup/.test(a)) return "register"
  if (/passkey|2fa|mfa|otp|password|token/.test(a)) return "security"
  if (/server|start|stop|restart|power|console|file|reinstall|subuser|suspend|unsuspend/.test(a)) return "server"
  if (/billing|payment|invoice|order|subscription|credit/.test(a)) return "billing"
  if (/ticket|support/.test(a)) return "support"
  return "auth"
}

const actionLabels: Record<string, string> = {
  "server:power:start": "Started server",
  "server:power:stop": "Stopped server",
  "server:power:restart": "Restarted server",
  "server:power:kill": "Killed server",
  "server:console:command": "Ran console command",
  "wings:server:console.command": "Ran console command",
  "server:file:write": "Modified file",
  "server:file:delete": "Deleted files",
  "server:reinstall": "Reinstalled server",
  "server:subuser:add": "Added subuser",
  "server:subuser:accept_invite": "Accepted subuser invite",
  "server:subuser:remove": "Removed subuser",
  "server:subuser:reject_invite": "Rejected subuser invite",
  "update-profile": "Updated profile",
  "server:suspend": "Suspended server",
  "server:unsuspend": "Unsuspended server",
}

function formatActionLabel(action: string): string {
  const key = (action || "").toLowerCase()
  if (actionLabels[key]) return actionLabels[key]
  return (action || "Unknown action")
    .replace(/[:_.-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function formatTimeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

const typeIcons: Record<string, typeof Server> = {
  server: Server,
  auth: LogIn,
  login: LogIn,
  logout: LogOut,
  register: UserPlus,
  billing: CreditCard,
  security: Shield,
  support: FileText,
}

const typeIconColors: Record<string, string> = {
  server: "text-blue-600",
  auth: "text-primary",
  login: "text-green-600",
  logout: "text-orange-600",
  register: "text-emerald-600",
  billing: "text-yellow-600",
  security: "text-red-600",
  support: "text-purple-600",
}

// -------------------------------------------------

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
  const [unhealthyNodes, setUnhealthyNodes] = useState<{ id: number; name: string }[]>([])

  // Load all servers (paginated — same pattern as /dashboard/servers)
  useEffect(() => {
    let cancelled = false
    async function loadAllServers() {
      try {
        let allServers: any[] = []
        let page = 1
        const perPage = 200
        while (true) {
          const data = await apiFetch(`${API_ENDPOINTS.servers}?page=${page}&per_page=${perPage}`)
          const list = Array.isArray(data) ? data : []
          if (list.length === 0) break
          allServers = allServers.concat(list)
          const total = (data as any)?.total
          if (total && allServers.length >= total) break
          page++
        }
        if (cancelled) return
        setServers(allServers)
        allServers.forEach((s: any) => {
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
      } catch (err) {
        console.error("failed to load servers", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAllServers()
    return () => { cancelled = true }
  }, [])

  // Load user activity logs for Recent Activity & Security Alerts
  useEffect(() => {
    if (!user) return
    apiFetch(`${API_ENDPOINTS.userDetail.replace(":id", user.id.toString())}/logs?limit=20`)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setRecentActivity(list.slice(0, 5))
        const securityEvents = list.filter((e: any) => guessActivityType(e.action ?? "") === "security")
        setSocAlerts(securityEvents.slice(0, 5))
      })
      .catch(() => {
        setRecentActivity([])
        setSocAlerts([])
      })
  }, [user])

  useEffect(() => {
    apiFetch(API_ENDPOINTS.nodesMyHealth)
      .then((data) => {
        if (Array.isArray(data)) setUnhealthyNodes(data)
      })
      .catch(() => {})
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
        className="border border-border bg-secondary/30 p-4 transition-colors hover:border-primary/20"
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
          {unhealthyNodes.length > 0 && (
            <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {unhealthyNodes.length === 1
                      ? t("warnings.nodeIssueTitle", { node: unhealthyNodes[0].name })
                      : t("warnings.nodesIssueTitle")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {unhealthyNodes.length === 1
                      ? t("warnings.nodeIssueDescription", { node: unhealthyNodes[0].name })
                      : t("warnings.nodesIssueDescription", { nodes: unhealthyNodes.map(n => n.name).join(", ") })}
                  </p>
                  <Link href="/status" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                    {t("warnings.learnMore")}
                  </Link>
                </div>
              </div>
            </div>
          )}

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
            <div className="col-span-1 border border-border bg-card p-5 lg:col-span-2">
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
              <div className="border border-border bg-card p-5">
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

              <div className="border border-border bg-card p-5">
                <SectionHeader title={t("recentActivity.title")} />
                <div className="mt-4 flex flex-col gap-3">
                  {recentActivity.length === 0 ? (
                    <div className="border border-border/50 bg-secondary/10 p-4 text-center">
                      <p className="text-xs text-muted-foreground">{t("recentActivity.empty")}</p>
                    </div>
                  ) : (
                    recentActivity.map((item) => {
                      const type = guessActivityType(item.action ?? "")
                      const Icon = typeIcons[type] ?? Activity
                      const iconColor = typeIconColors[type] ?? "text-primary"
                      const label = formatActionLabel(item.action ?? "")
                      const targetLabel = item.targetId
                        ? servers.find((s) => (s.uuid || s.id) === item.targetId)?.name || item.targetId
                        : null
                      const targetHref = item.targetId && item.targetType === "server"
                        ? `/dashboard/servers/${item.targetId}`
                        : null

                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 border border-border/50 bg-secondary/10 p-3 text-sm"
                        >
                          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground leading-snug truncate">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {targetHref ? (
                                <Link href={targetHref} className="font-medium text-primary hover:underline">
                                  {targetLabel}
                                </Link>
                              ) : targetLabel ? (
                                targetLabel
                              ) : item.ipAddress ? (
                                `IP: ${item.ipAddress}`
                              ) : null}
                              {targetLabel && item.ipAddress ? ` • IP: ${item.ipAddress}` : ""}
                              {(targetLabel || item.ipAddress) ? " • " : ""}
                              {item.timestamp ? formatTimeAgo(item.timestamp) : "Unknown time"}
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

          <div className="border border-border bg-card p-5">
            <SectionHeader title={t("securityAlerts.title")} description={t("securityAlerts.description")} />
            <div className="mt-4 flex flex-col gap-3">
              {socAlerts.length === 0 ? (
                <div className="flex items-center gap-4 border border-success/30 bg-success/5 p-4">
                  <Shield className="h-5 w-5 shrink-0 text-success" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{t("securityAlerts.noneTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("securityAlerts.noneSubtitle")}</p>
                  </div>
                </div>
              ) : (
                socAlerts.map((item) => {
                  const label = formatActionLabel(item.action ?? "")
                  const targetLabel = item.targetId
                    ? servers.find((s) => (s.uuid || s.id) === item.targetId)?.name || item.targetId
                    : null

                  return (
                    <div key={item.id} className="flex items-center gap-4 border border-warning/30 bg-warning/5 p-4">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {targetLabel && (
                            <span>{t("securityAlerts.server")}: {targetLabel}</span>
                          )}
                          {!targetLabel && item.ipAddress && (
                            <span>IP: {item.ipAddress}</span>
                          )}
                          {!targetLabel && !item.ipAddress && (
                            <span>{t("securityAlerts.eventDetected")}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.timestamp ? formatTimeAgo(item.timestamp) : ""}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
