"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { StatCard, SectionHeader, UsageBar } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
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

export default function SOCDashboard() {
  const { user } = useAuth();
  useEffect(() => { console.log('dashboard rendered; user=', user); }, [user]);
  if (!user) {
    return <div className="p-8 text-center">Authentication in progress...</div>;
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

  const onlineServers = servers.filter((s) => s.status === "online" || s.status === "running").length
  const totalServers = servers.length
  const onlineList = servers.filter(s => s.status === "online" || s.status === "running")

  const totalCpuUsed = onlineList.reduce((a, s) => a + (s.resources?.cpu_absolute ?? 0), 0)
  const avgCpu = onlineServers > 0 ? Math.round(totalCpuUsed / onlineServers) : 0
  const totalMemUsed = onlineList.reduce((a, s) => a + (s.resources?.memory_bytes ?? 0), 0)
  const totalMemLimit = onlineList.reduce((a, s) => a + ((s.build?.memory_limit ?? 0) * 1024 * 1024), 0)
  const totalDiskUsed = onlineList.reduce((a, s) => a + (s.resources?.disk_bytes ?? 0), 0)
  const totalDiskLimit = onlineList.reduce((a, s) => a + ((s.build?.disk_space ?? 0) * 1024 * 1024), 0)
  const memPct = totalMemLimit > 0 ? Math.round((totalMemUsed / totalMemLimit) * 100) : 0
  const diskPct = totalDiskLimit > 0 ? Math.round((totalDiskUsed / totalDiskLimit) * 100) : 0

  return (
    <>
      <PanelHeader title="SOC Dashboard" description="Security Operations Center Overview" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Servers Online"
              value={`${onlineServers}/${totalServers}`}
              icon={Server}
            />
            <StatCard
              title="Threat Level"
              value={socAlerts.length > 0 ? "Elevated" : "Low"}
              subtitle={socAlerts.length > 0 ? `${socAlerts.length} alert(s) detected` : "No active threats detected"}
              icon={Shield}
            />
            <StatCard
              title="Active Alerts"
              value={socAlerts.length}
              subtitle={socAlerts.length > 0 ? "Requires attention" : "All clear"}
              icon={AlertTriangle}
            />
            <StatCard
              title="Uptime"
              value={totalServers > 0 ? `${Math.round((onlineServers / totalServers) * 10000) / 100}%` : "N/A"}
              subtitle="Online servers ratio"
              icon={Activity}
            />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Server Health */}
            <div className="col-span-1 rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <SectionHeader title="Server Health" description="Real-time resource utilization" />
              <div className="mt-4 flex flex-col gap-4">
                {onlineList.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No servers online</p>
                )}
                {onlineList.map((server) => {
                  const cpuPct = Math.round(server.resources?.cpu_absolute ?? 0)
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
                          <p className="text-[10px] text-muted-foreground mt-0.5">{cpuPct}%</p>
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
                })}
              </div>
            </div>

            {/* Quick Stats & Activity */}
            <div className="flex flex-col gap-6">
              {/* Resource Summary */}
              <div className="rounded-xl border border-border bg-card p-5">
                <SectionHeader title="Resource Summary" />
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Cpu className="h-4 w-4" />
                      <span>Avg CPU</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {avgCpu}%
                    </span>
                  </div>
                  <UsageBar label="" value={avgCpu} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MemoryStick className="h-4 w-4" />
                      <span>Total RAM</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {formatBytes(totalMemUsed)} / {formatBytes(totalMemLimit)}
                    </span>
                  </div>
                  <UsageBar label="" value={memPct} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HardDrive className="h-4 w-4" />
                      <span>Total Disk</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {formatBytes(totalDiskUsed)} / {formatBytes(totalDiskLimit)}
                    </span>
                  </div>
                  <UsageBar label="" value={diskPct} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Zap className="h-4 w-4" />
                      <span>Servers Online</span>
                    </div>
                    <span className="font-mono text-sm text-foreground">
                      {onlineServers}/{totalServers}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-border bg-card p-5">
                <SectionHeader title="Recent Activity" />
                <div className="mt-4 flex flex-col gap-3">
                  {recentActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="flex-1">
                        <p className="text-foreground">{item.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.target} &middot;{" "}
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Security Alerts */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SectionHeader title="Security Alerts" description="Recent security events and notifications" />
            <div className="mt-4 flex flex-col gap-3">
              {socAlerts.length === 0 ? (
                <div className="flex items-center gap-4 rounded-lg border border-success/30 bg-success/5 p-4">
                  <Shield className="h-5 w-5 shrink-0 text-success" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">No security alerts</p>
                    <p className="text-xs text-muted-foreground">All systems operating normally</p>
                  </div>
                </div>
              ) : (
                socAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center gap-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {alert.metrics?.alert || alert.metrics?.threat || alert.metrics?.warn || "Security event detected"}
                      </p>
                      <p className="text-xs text-muted-foreground">Server: {alert.serverId || "unknown"}</p>
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
