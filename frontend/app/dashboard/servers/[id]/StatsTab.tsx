"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Activity, Cpu, MemoryStick, HardDrive, Network } from "lucide-react"
import { MiniStat, ChartCard, LoadingState } from "./serverTabShared"
import { formatBytes } from "./serverTabHelpers"

export function StatsTab({ serverId, server: serverProp }: { serverId: string; server: any }) {
  const [history, setHistory] = useState<any[]>([])
  const [live, setLive] = useState<any>(null)
  const [nodeInfo, setNodeInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState<"1h" | "6h" | "24h" | "7d">("1h")
  const [localPoints, setLocalPoints] = useState<any[]>([])
  const [Area, setArea] = useState<any>(null)
  const [ResponsiveContainer, setResponsiveContainer] = useState<any>(null)
  const [XAxis, setXAxis] = useState<any>(null)
  const [YAxis, setYAxis] = useState<any>(null)
  const [CartesianGrid, setCartesianGrid] = useState<any>(null)
  const [Tooltip, setTooltip] = useState<any>(null)
  const [AreaChart, setAreaChart] = useState<any>(null)
  const [Legend, setLegend] = useState<any>(null)
  const [rechartsReady, setRechartsReady] = useState(false)

  useEffect(() => {
    import("recharts").then((mod) => {
      setArea(() => mod.Area)
      setResponsiveContainer(() => mod.ResponsiveContainer)
      setXAxis(() => mod.XAxis)
      setYAxis(() => mod.YAxis)
      setCartesianGrid(() => mod.CartesianGrid)
      setTooltip(() => mod.Tooltip)
      setAreaChart(() => mod.AreaChart)
      setLegend(() => mod.Legend)
      setRechartsReady(true)
    })
  }, [])

  const loadData = useCallback(async () => {
    console.debug('[StatsTab] loadData', { serverId, timeWindow })
    try {
      const [histData, liveData, nodeData] = await Promise.all([
        apiFetch(API_ENDPOINTS.serverStatsHistory.replace(":id", serverId) + `?window=${timeWindow}`).catch(() => []),
        apiFetch(API_ENDPOINTS.serverStats.replace(":id", serverId)).catch(() => null),
        apiFetch(API_ENDPOINTS.serverStatsNode.replace(":id", serverId)).catch(() => null),
      ])
      setHistory(Array.isArray(histData) ? histData : [])
      setLive(liveData)
      setNodeInfo(nodeData)
    } finally {
      setLoading(false)
    }
  }, [serverId, timeWindow])

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  useEffect(() => {
    const r = serverProp?.resources
    if (!r || (r.cpu_absolute == null && r.memory_bytes == null)) return
    const point = {
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ts: Date.now(),
      cpu: Number((r.cpu_absolute ?? 0).toFixed(1)),
      memMB: Math.round((r.memory_bytes ?? 0) / 1024 / 1024),
      diskMB: Math.round((r.disk_bytes ?? 0) / 1024 / 1024),
      rxMB: Math.round(((r.network?.rx_bytes ?? 0) / 1024 / 1024) * 100) / 100,
      txMB: Math.round(((r.network?.tx_bytes ?? 0) / 1024 / 1024) * 100) / 100,
    }
    setLocalPoints((prev) => {
      const next = [...prev, point]
      return next.length > 120 ? next.slice(-120) : next
    })
  }, [serverProp?.resources])

  const chartData = useMemo(() => {
    return history.map((entry: any) => {
      const m = entry.metrics || {}
      const cpu = m.cpu_absolute ?? m.cpu ?? m.proc?.cpu?.total ?? 0
      const memBytes = m.memory_bytes ?? m.memory ?? m.proc?.memory?.total ?? 0
      const diskBytes = m.disk_bytes ?? m.disk ?? 0
      const rxBytes = m.network?.rx_bytes ?? m.network?.rx ?? 0
      const txBytes = m.network?.tx_bytes ?? m.network?.tx ?? 0
      const ts = new Date(entry.timestamp).getTime()
      return {
        time: new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ts,
        cpu: Number(cpu.toFixed ? cpu.toFixed(1) : cpu),
        memMB: Math.round(memBytes / 1024 / 1024),
        diskMB: Math.round(diskBytes / 1024 / 1024),
        rxMB: Math.round((rxBytes / 1024 / 1024) * 100) / 100,
        txMB: Math.round((txBytes / 1024 / 1024) * 100) / 100,
      }
    })
  }, [history])

  const nodeCpu = nodeInfo?.cpu?.used ?? null
  const nodeMemUsed = nodeInfo?.memory?.used ?? null
  const nodeMemTotal = nodeInfo?.memory?.total ?? null

  const liveSource = (live && (live.cpu_absolute != null || live.memory_bytes != null)) ? live : (serverProp?.resources ?? null)
  const liveCpu = liveSource?.cpu_absolute ?? liveSource?.proc?.cpu?.total ?? 0
  const liveMem = liveSource?.memory_bytes ?? liveSource?.proc?.memory?.total ?? 0
  const liveMemLimit = liveSource?.memory_limit_bytes ?? liveSource?.proc?.memory?.limit ?? 0
  const liveDisk = liveSource?.disk_bytes ?? liveSource?.disk ?? 0
  const liveNetRx = liveSource?.network?.rx_bytes ?? 0
  const liveNetTx = liveSource?.network?.tx_bytes ?? 0

  const effectiveChartData = useMemo(() => chartData.length > 0 ? chartData : localPoints, [chartData, localPoints])

  if (loading && !rechartsReady) return <LoadingState />

  const windowOpts: { value: "1h" | "6h" | "24h" | "7d"; label: string }[] = [
    { value: "1h", label: "1 Hour" },
    { value: "6h", label: "6 Hours" },
    { value: "24h", label: "24 Hours" },
    { value: "7d", label: "7 Days" },
  ]

  const chartColors = {
    cpu: "#3b82f6",
    mem: "#8b5cf6",
    disk: "#f59e0b",
    rx: "#22c55e",
    tx: "#ef4444",
  }

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const fmtLabel = (typeof label === 'number' || /^\\b\d{13}\b$/.test(String(label)))
      ? new Date(Number(label)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : String(label)
    const unitFor = (key: string) => (key === 'cpu' ? '%' : key.endsWith('MB') ? ' MB' : '')
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
        <p className="text-xs text-muted-foreground mb-1">{fmtLabel}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
            {p.name}: {p.value}{p.unit || unitFor(p.dataKey) || ''}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Resource Usage</h3>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
          {windowOpts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeWindow(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeWindow === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="CPU" value={`${Number(liveCpu).toFixed(1)}%`} color={chartColors.cpu} />
        <MiniStat label="Memory" value={formatBytes(liveMem)} sub={liveMemLimit ? `/ ${formatBytes(liveMemLimit)}` : undefined} color={chartColors.mem} />
        <MiniStat label="Disk" value={formatBytes(liveDisk)} color={chartColors.disk} />
        <MiniStat label="Net ↑" value={formatBytes(liveNetTx)} color={chartColors.tx} />
        <MiniStat label="Net ↓" value={formatBytes(liveNetRx)} color={chartColors.rx} />
      </div>

      {rechartsReady && effectiveChartData.length > 0 ? (
        <>
          <ChartCard title="CPU Usage (%)" icon={Cpu}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.cpu} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.cpu} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke={chartColors.cpu} fill="url(#cpuGrad)" strokeWidth={2} unit="%" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Memory Usage (MB)" icon={MemoryStick}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.mem} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.mem} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="memMB" name="Memory" stroke={chartColors.mem} fill="url(#memGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Disk Usage (MB)" icon={HardDrive}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.disk} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.disk} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="diskMB" name="Disk" stroke={chartColors.disk} fill="url(#diskGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Network Traffic (MB)" icon={Network}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={effectiveChartData}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.rx} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.rx} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.tx} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.tx} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ts" tickFormatter={(v:any)=> new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit=" MB" />
                <Tooltip content={<CustomTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="rxMB" name="Download (RX)" stroke={chartColors.rx} fill="url(#rxGrad)" strokeWidth={2} unit=" MB" dot={false} />
                <Area type="monotone" dataKey="txMB" name="Upload (TX)" stroke={chartColors.tx} fill="url(#txGrad)" strokeWidth={2} unit=" MB" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      ) : !loading ? (
        effectiveChartData.length > 0 ? (
          <div className="rounded-xl border border-border bg-secondary/10 p-4 text-center">
            <p className="text-xs text-muted-foreground">Showing live data — historical data accumulates over time.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-secondary/10 p-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No data available yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Stats are collected while the server is running. Check back in a few minutes.</p>
          </div>
        )
      ) : (
        <LoadingState />
      )}

      {nodeInfo && Object.keys(nodeInfo).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Node System</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {nodeCpu !== null && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Node CPU</p>
                <p className="text-sm font-mono font-medium text-foreground">{Number(nodeCpu).toFixed(1)}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(Number(nodeCpu), 100)}%` }} />
                </div>
              </div>
            )}
            {nodeMemUsed !== null && nodeMemTotal !== null && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Node Memory</p>
                <p className="text-sm font-mono font-medium text-foreground">{formatBytes(nodeMemUsed)} / {formatBytes(nodeMemTotal)}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${Math.min((nodeMemUsed / nodeMemTotal) * 100, 100)}%` }} />
                </div>
              </div>
            )}
            {(nodeInfo.version || nodeInfo.kernel_version) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Version</p>
                <p className="text-sm font-mono font-medium text-foreground">{nodeInfo.version || nodeInfo.kernel_version || "\u2014"}</p>
              </div>
            )}
            {(nodeInfo.architecture || nodeInfo.arch) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Architecture</p>
                <p className="text-sm font-mono font-medium text-foreground">{nodeInfo.architecture || nodeInfo.arch}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
