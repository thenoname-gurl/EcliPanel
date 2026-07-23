"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useState, useCallback } from "react"
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
  ScanLine,
  ShieldAlert,
  Check,
  CheckCircle,
  Flag,
  ChevronDown,
  ChevronUp,
  Bug,
  Send,
  RefreshCw,
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
  // All hooks must be above any early return (Rules of Hooks)
  const [servers, setServers] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unhealthyNodes, setUnhealthyNodes] = useState<{ id: number; name: string }[]>([])
  const [findings, setFindings] = useState<any[]>([])
  const [findingsSummary, setFindingsSummary] = useState<Record<string, number>>({})
  const [findingsLoading, setFindingsLoading] = useState(true)
  const [scanRunning, setScanRunning] = useState(false)
  const [findingsExpanded, setFindingsExpanded] = useState(false)
  const [findingsFilter, setFindingsFilter] = useState('open')
  const [findingsSeverity, setFindingsSeverity] = useState('')

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

  // Load user activity logs for Recent Activity
  useEffect(() => {
    if (!user) return
    apiFetch(`${API_ENDPOINTS.userDetail.replace(":id", user.id.toString())}/logs?limit=20`)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setRecentActivity(list.slice(0, 5))
      })
      .catch(() => {
        setRecentActivity([])
      })
  }, [user])

  useEffect(() => {
    apiFetch(API_ENDPOINTS.nodesMyHealth)
      .then((data) => {
        if (Array.isArray(data)) setUnhealthyNodes(data)
      })
      .catch(() => {})
  }, [])

  // Fetch security findings
  const fetchFindings = useCallback(() => {
    setFindingsLoading(true)
    const params = new URLSearchParams({ status: findingsFilter || 'open', visibility: 'public' })
    if (findingsSeverity) params.set('severity', findingsSeverity)
    apiFetch(`${API_ENDPOINTS.socSecurityFindings}?${params}`)
      .then((data: any) => {
        setFindings(Array.isArray(data?.findings) ? data.findings : [])
        setFindingsSummary(data?.summary || {})
      })
      .catch(() => { setFindings([]); setFindingsSummary({}) })
      .finally(() => setFindingsLoading(false))
  }, [findingsFilter, findingsSeverity])

  useEffect(() => {
    fetchFindings()
  }, [fetchFindings])

  const handleScan = async () => {
    setScanRunning(true)
    try {
      await apiFetch(API_ENDPOINTS.socSecurityScan, { method: 'POST' })
      fetchFindings()
    } catch (e) {
      console.error('Security scan failed', e)
    } finally {
      setScanRunning(false)
    }
  }

  const silentFetchFindings = useCallback(() => {
    const params = new URLSearchParams({ status: findingsFilter || 'open', visibility: 'public' })
    if (findingsSeverity) params.set('severity', findingsSeverity)
    apiFetch(`${API_ENDPOINTS.socSecurityFindings}?${params}`)
      .then((data: any) => {
        setFindings(Array.isArray(data?.findings) ? data.findings : [])
        setFindingsSummary(data?.summary || {})
      })
      .catch(() => {})
  }, [findingsFilter, findingsSeverity])

  const handleUpdateFinding = async (id: number, status: string) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status } : f))
    try {
      await apiFetch(`${API_ENDPOINTS.socSecurityFindingDetail.replace(':id', String(id))}/${status}`, {
        method: 'PUT',
      })
    } catch {}
    silentFetchFindings()
  }

  // Derive last scan from newest finding
  const lastScanTime = findings.length > 0
    ? findings.reduce((a: any, b: any) => new Date(a.detectedAt) > new Date(b.detectedAt) ? a : b).detectedAt
    : null

  const handleEscalate = async (id: number) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'acknowledged' } : f))
    try {
      await apiFetch(`${API_ENDPOINTS.socSecurityFindingDetail.replace(':id', String(id))}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reviewed', note: 'User escalated for staff evaluation' }),
      })
    } catch {}
    silentFetchFindings()
  }

  if (!user) {
    return <div className="p-8 text-center">{t("authInProgress")}</div>;
  }

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
          {user?.inactive && (
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{t("warnings.inactiveTitle")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("warnings.inactiveDescription")}</p>
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(API_ENDPOINTS.reactivate, { method: "POST" });
                        window.location.reload();
                      } catch {}
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {t("warnings.reactivateNow")}
                  </button>
                </div>
              </div>
            </div>
          )}
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
              title="THREAT LEVEL"
              value={((findingsSummary.critical || 0) + (findingsSummary.high || 0)) > 0 ? "Elevated" : "Low"}
              subtitle={((findingsSummary.critical || 0) + (findingsSummary.high || 0)) > 0
                ? `${findingsSummary.high || 0} high, ${findingsSummary.critical || 0} critical`
                : "No open threats"}
              icon={Shield}
            />
            <StatCard
              title={t("stats.uptime")}
              value={`${myUptimePct}%`}
              subtitle={totalServers > 0 ? t("stats.totalUptime", { value: totalUptimePct }) : t("stats.noServers")}
              icon={Activity}
            />
          </div>

          {/* Security Findings — primary SOC content */}
          <div className="border border-border bg-card p-3 md:p-5">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div>
                <SectionHeader title={t("securityFindings.title")} description={lastScanTime
                  ? `${t("securityFindings.description")} • Last scan: ${formatTimeAgo(lastScanTime)}`
                  : t("securityFindings.description")} />
              </div>
              <button
                onClick={handleScan}
                disabled={scanRunning}
                className="flex items-center gap-1.5 border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
               data-telemetry="dashboard:scan">
                <ScanLine className={cn("h-3.5 w-3.5", scanRunning && "animate-pulse")} />
                {scanRunning ? t("securityFindings.scanning") : t("securityFindings.scan")}
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <select value={findingsFilter} onChange={e => { setFindingsFilter(e.target.value) }}
                className="border border-border bg-card text-xs px-2 py-1.5 w-full sm:w-auto">
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
              </select>
              <select value={findingsSeverity} onChange={e => { setFindingsSeverity(e.target.value) }}
                className="border border-border bg-card text-xs px-2 py-1.5 w-full sm:w-auto">
                <option value="">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {findingsLoading ? (
                <div className="border border-border/50 bg-secondary/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t("securityFindings.scanning")}</p>
                </div>
              ) : findings.length === 0 ? (
                <div className="flex items-center gap-4 border border-success/30 bg-success/5 p-4">
                  <Shield className="h-5 w-5 shrink-0 text-success" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{t("securityFindings.empty")}</p>
                    <p className="text-xs text-muted-foreground">{t("securityFindings.emptyDescription")}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Severity summary bar */}
                  <div className="flex flex-wrap gap-2">
                    {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
                      const count = findingsSummary[sev] || 0
                      if (count === 0) return null
                      const colors: Record<string, string> = {
                        critical: 'border-red-500/50 bg-red-500/10 text-red-600',
                        high: 'border-orange-500/50 bg-orange-500/10 text-orange-600',
                        medium: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600',
                        low: 'border-blue-500/50 bg-blue-500/10 text-blue-600',
                        info: 'border-gray-500/50 bg-gray-500/10 text-gray-600',
                      }
                      const Icon = sev === 'critical' ? ShieldAlert : sev === 'high' ? AlertTriangle : sev === 'medium' ? AlertCircle : sev === 'low' ? Bug : Shield
                      return (
                        <div key={sev} className={cn('flex items-center gap-1 border px-2 py-0.5 text-xs font-medium', colors[sev])}>
                          <Icon className="h-3 w-3" />
                          <span>{count}</span>
                          <span className="opacity-70">{t(`securityFindings.severity.${sev}`)}</span>
                        </div>
                      )
                    })}
                    <span className="text-xs text-muted-foreground self-center ml-1">
                      {t("securityFindings.totalOpen", { count: findings.length })}
                    </span>
                  </div>

                  {/* Findings list */}
                  <div className="flex flex-col gap-2">
                    {findings.slice(0, findingsExpanded ? undefined : 5).map((item: any) => {
                      const sevColors: Record<string, string> = {
                        critical: 'border-l-red-500 bg-red-500/5',
                        high: 'border-l-orange-500 bg-orange-500/5',
                        medium: 'border-l-yellow-500 bg-yellow-500/5',
                        low: 'border-l-blue-500 bg-blue-500/5',
                        info: 'border-l-gray-400 bg-gray-400/5',
                      }
                      const sevBorder = sevColors[item.severity] || sevColors.info
                      const serverName = item.serverId
                        ? servers.find((s: any) => (s.uuid || s.id) === item.serverId)?.name
                        : null
                      const targetLabel = serverName || (item.nodeId ? `Node #${item.nodeId}` : null)
                      const targetHref = item.serverId
                        ? `/dashboard/servers/${item.serverId}`
                        : null

                      return (
                        <div
                          key={item.id}
                          className={cn('border border-border pl-3 pr-3 py-2.5 text-sm transition-colors border-l-2', sevBorder)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground text-sm font-medium truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0.5 border font-medium',
                                  item.severity === 'critical' ? 'border-red-500/30 text-red-600 bg-red-500/5' :
                                  item.severity === 'high' ? 'border-orange-500/30 text-orange-600 bg-orange-500/5' :
                                  item.severity === 'medium' ? 'border-yellow-500/30 text-yellow-600 bg-yellow-500/5' :
                                  item.severity === 'low' ? 'border-blue-500/30 text-blue-600 bg-blue-500/5' :
                                  'border-gray-500/30 text-gray-600 bg-gray-500/5'
                                )}>
                                  {t(`securityFindings.severity.${item.severity}`)}
                                </span>
                                <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
                                  {t(`securityFindings.categories.${item.category}`) || item.category}
                                </span>
                                {/* Threat intel: IP reputation badge */}
                                {item.metadata?.ip && (
                                  <a
                                    href={`https://www.abuseipdb.com/check/${item.metadata.ip}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(
                                      'text-[10px] px-1.5 py-0.5 border font-medium hover:underline',
                                      item.metadata?.reputation?.score >= 70
                                        ? 'border-red-500/50 bg-red-500/10 text-red-600'
                                        : item.metadata?.reputation?.score >= 30
                                        ? 'border-orange-500/50 bg-orange-500/10 text-orange-600'
                                        : 'border-green-500/50 bg-green-500/10 text-green-600'
                                    )}
                                  >
                                    IP: {item.metadata.ip}
                                    {item.metadata?.reputation?.score != null && (
                                      <> ({item.metadata.reputation.score}/100)</>
                                    )}
                                  </a>
                                )}
                                {/* Threat intel: known malicious tags */}
                                {item.metadata?.reputation?.tags?.length > 0 && item.metadata.reputation.tags[0] !== 'private_ip' && (
                                  <span className="text-[10px] px-1.5 py-0.5 border border-red-500/30 bg-red-500/5 text-red-600 font-medium">
                                    {item.metadata.reputation.tags[0]}
                                  </span>
                                )}
                                {item.source === 'external' && item.sourceName && (
                                  <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
                                    {item.sourceName}
                                  </span>
                                )}
                                {targetHref ? (
                                  <Link href={targetHref} className="text-[10px] text-primary hover:underline">
                                    {targetLabel}
                                  </Link>
                                ) : targetLabel ? (
                                  <span className="text-[10px] text-muted-foreground">{targetLabel}</span>
                                ) : null}
                                <span className="text-[10px] text-muted-foreground">
                                  {item.detectedAt ? formatTimeAgo(item.detectedAt) : ''}
                                </span>
                              </div>
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleUpdateFinding(item.id, 'acknowledged')}
                                title={t("securityFindings.actions.acknowledge")}
                                className="p-2.5 md:p-1 hover:bg-secondary/50 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                               data-telemetry="dashboard:acknowledge">
                                <Check className="h-5 w-5 md:h-3.5 md:w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                              <button
                                onClick={() => handleUpdateFinding(item.id, 'resolved')}
                                title={t("securityFindings.actions.resolve")}
                                className="p-2.5 md:p-1 hover:bg-secondary/50 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                               data-telemetry="dashboard:resolve">
                                <CheckCircle className="h-5 w-5 md:h-3.5 md:w-3.5 text-muted-foreground hover:text-green-600" />
                              </button>
                              <button
                                onClick={() => handleUpdateFinding(item.id, 'false_positive')}
                                title={t("securityFindings.actions.falsePositive")}
                                className="p-2.5 md:p-1 hover:bg-secondary/50 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                               data-telemetry="dashboard:falsepositive">
                                <Flag className="h-5 w-5 md:h-3.5 md:w-3.5 text-muted-foreground hover:text-orange-600" />
                              </button>
                              <button
                                onClick={() => handleEscalate(item.id)}
                                title="Escalate to staff"
                                className="p-2.5 md:p-1 hover:bg-secondary/50 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                              >
                                <Send className="h-5 w-5 md:h-3.5 md:w-3.5 text-muted-foreground hover:text-blue-600" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Show more / show less */}
                  {findings.length > 5 && (
                    <button
                      onClick={() => setFindingsExpanded(!findingsExpanded)}
                      className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                    >
                      {findingsExpanded ? (
                        <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" /> Show all {findings.length} findings</>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Sidebar: Resource Summary + Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="border border-border bg-card p-5">
              <SectionHeader title={t("resourceSummary.title")} />
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Cpu className="h-4 w-4" /><span>{t("resourceSummary.avgCpu")}</span>
                  </div>
                  <span className="font-mono text-sm text-foreground">{avgCpu}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MemoryStick className="h-4 w-4" /><span>{t("resourceSummary.totalRam")}</span>
                  </div>
                  <span className="font-mono text-sm text-foreground">{formatBytes(totalMemUsed)} / {formatBytes(totalMemLimit)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HardDrive className="h-4 w-4" /><span>{t("resourceSummary.totalDisk")}</span>
                  </div>
                  <span className="font-mono text-sm text-foreground">{formatBytes(totalDiskUsed)} / {formatBytes(totalDiskLimit)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4" /><span>{t("resourceSummary.serversOnline")}</span>
                  </div>
                  <span className="font-mono text-sm text-foreground">{onlineServers}/{totalServers}</span>
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
                ) : recentActivity.map((item) => {
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
                    <div key={item.id} className="flex items-start gap-3 border border-border/50 bg-secondary/10 p-3 text-sm">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground leading-snug truncate">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {targetHref ? <Link href={targetHref} className="font-medium text-primary hover:underline">{targetLabel}</Link>
                           : targetLabel ? targetLabel
                           : item.ipAddress ? `IP: ${item.ipAddress}` : null}
                          {(targetLabel || item.ipAddress) ? " • " : ""}
                          {item.timestamp ? formatTimeAgo(item.timestamp) : "Unknown time"}
                        </p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
