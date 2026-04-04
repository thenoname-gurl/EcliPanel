"use client"

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { cn } from "@/lib/utils"
import { 
  Activity, 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Network, 
  RefreshCw,
  TrendingUp,
  Server,
  Wifi,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { 
  MiniStat, 
  ChartCard, 
  LoadingState, 
  EmptyState,
  SectionHeader,
  ToggleGroup,
  CardGrid,
  ProgressStat,
  ChartCardSkeleton
} from "./serverTabShared"
import { formatBytes } from "./serverTabHelpers"

interface StatsTabProps {
  serverId: string
  server: any
}

type TimeWindow = "live" | "5m" | "10m" | "1h" | "6h" | "24h" | "7d"

interface ChartDataPoint {
  time: string
  ts: number
  cpu: number
  memMB: number
  diskMB: number
  rxMB: number
  txMB: number
}

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "5m", label: "5m" },
  { value: "10m", label: "10m" },
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
]

const CHART_COLORS = {
  cpu: "#3b82f6",
  mem: "#8b5cf6",
  disk: "#f59e0b",
  rx: "#22c55e",
  tx: "#ef4444",
}

function formatTimeValue(value: number | string) {
  const ts = Number(value)
  if (Number.isNaN(ts)) return String(value)
  const d = new Date(ts)
  const hasSeconds = d.getSeconds() !== 0
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: hasSeconds ? '2-digit' : undefined,
  })
}

function CustomTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  
  const fmtLabel = (typeof label === 'number' || /^\d{13}$/.test(String(label)))
    ? formatTimeValue(label)
    : String(label)
  
  const unitFor = (key: string) => (key === 'cpu' ? '%' : key.endsWith('MB') ? ' MB' : '')
  
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5 font-medium">{fmtLabel}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs flex items-center gap-2" style={{ color: p.color }}>
          <span 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: p.color }} 
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-medium">
            {p.value}{p.unit || unitFor(p.dataKey) || ''}
          </span>
        </p>
      ))}
    </div>
  )
}

interface ChartProps {
  data: ChartDataPoint[]
  recharts: any
}

function CpuChart({ data, recharts }: ChartProps) {
  const { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } = recharts

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.cpu} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.cpu} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis 
          dataKey="ts" 
          tickFormatter={(v: any) => formatTimeValue(v)} 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={50}
        />
        <YAxis 
          domain={[0, 100]} 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false} 
          unit="%" 
          width={40}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Area 
          type="monotone" 
          dataKey="cpu" 
          name="CPU" 
          stroke={CHART_COLORS.cpu} 
          fill="url(#cpuGrad)" 
          strokeWidth={2} 
          unit="%" 
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function MemoryChart({ data, recharts }: ChartProps) {
  const { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } = recharts

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.mem} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.mem} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis 
          dataKey="ts" 
          tickFormatter={(v: any) => formatTimeValue(v)} 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={50}
        />
        <YAxis 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false} 
          unit=" MB"
          width={50}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Area 
          type="monotone" 
          dataKey="memMB" 
          name="Memory" 
          stroke={CHART_COLORS.mem} 
          fill="url(#memGrad)" 
          strokeWidth={2} 
          unit=" MB" 
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function DiskChart({ data, recharts }: ChartProps) {
  const { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } = recharts

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.disk} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.disk} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis 
          dataKey="ts" 
          tickFormatter={(v: any) => formatTimeValue(v)} 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={50}
        />
        <YAxis 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false} 
          unit=" MB"
          width={50}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Area 
          type="monotone" 
          dataKey="diskMB" 
          name="Disk" 
          stroke={CHART_COLORS.disk} 
          fill="url(#diskGrad)" 
          strokeWidth={2} 
          unit=" MB" 
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function NetworkChart({ data, recharts }: ChartProps) {
  const { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = recharts

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.rx} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.rx} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.tx} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.tx} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis 
          dataKey="ts" 
          tickFormatter={(v: any) => formatTimeValue(v)} 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={50}
        />
        <YAxis 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
          tickLine={false} 
          axisLine={false} 
          unit=" MB"
          width={50}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend 
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
          iconSize={8}
        />
        <Area 
          type="monotone" 
          dataKey="rxMB" 
          name="Download" 
          stroke={CHART_COLORS.rx} 
          fill="url(#rxGrad)" 
          strokeWidth={2} 
          unit=" MB" 
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area 
          type="monotone" 
          dataKey="txMB" 
          name="Upload" 
          stroke={CHART_COLORS.tx} 
          fill="url(#txGrad)" 
          strokeWidth={2} 
          unit=" MB" 
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface NodeInfoProps {
  nodeInfo: any
  nodeHistory?: any[]
}

function NodeInfoPanel({ nodeInfo, nodeHistory = [] }: NodeInfoProps) {
  const [expanded, setExpanded] = useState(false)
  const hasNodeInfo = !!nodeInfo && Object.keys(nodeInfo).length > 0

  const nodeCpu = nodeInfo?.cpu?.used ?? null
  const nodeMemUsed = nodeInfo?.memory?.used ?? null
  const nodeMemTotal = nodeInfo?.memory?.total ?? null

  const getNodeValue = useCallback((row: any, paths: string[]): number => {
    const source = row?.metrics ?? row ?? {}
    for (const path of paths) {
      const parts = path.split('.')
      let cur: any = source
      for (const part of parts) {
        if (cur == null) break
        cur = cur[part]
      }
      const num = Number(cur)
      if (Number.isFinite(num)) return num
    }
    return 0
  }, [])

  const nodeHistorySummary = useMemo(() => {
    if (!Array.isArray(nodeHistory) || nodeHistory.length < 2) {
      return { cpuAvg: 0, rx24h: 0, tx24h: 0 }
    }

    const cpuSamples = nodeHistory.map((r) => getNodeValue(r, ["cpu.used", "cpu.total", "cpu", "cpu_absolute"]))
    const cpuAvg = cpuSamples.length > 0
      ? cpuSamples.reduce((acc, v) => acc + v, 0) / cpuSamples.length
      : 0

    const readCounter = (row: any, key: "rx" | "tx") => getNodeValue(row, [
      `network.${key}_bytes`,
      `network.${key}`,
      key === "rx" ? "network.received" : "network.sent",
    ])

    let rxTotal = 0
    let txTotal = 0
    let prevRx = readCounter(nodeHistory[0], "rx")
    let prevTx = readCounter(nodeHistory[0], "tx")

    for (let i = 1; i < nodeHistory.length; i++) {
      const curRx = readCounter(nodeHistory[i], "rx")
      const curTx = readCounter(nodeHistory[i], "tx")
      const drx = curRx - prevRx
      const dtx = curTx - prevTx
      if (drx > 0) rxTotal += drx
      if (dtx > 0) txTotal += dtx
      prevRx = curRx
      prevTx = curTx
    }

    return {
      cpuAvg: Number.isFinite(cpuAvg) ? cpuAvg : 0,
      rx24h: Math.max(0, rxTotal),
      tx24h: Math.max(0, txTotal),
    }
  }, [nodeHistory, getNodeValue])

  if (!hasNodeInfo) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Node System</h3>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {expanded && (
        <div className="p-3 sm:p-4 pt-0 border-t border-border">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {nodeCpu !== null && (
              <ProgressStat
                label="Node CPU"
                value={Number(nodeCpu)}
                max={100}
                unit="%"
                color={CHART_COLORS.cpu}
                formatValue={(v) => v.toFixed(1)}
              />
            )}
            {nodeMemUsed !== null && nodeMemTotal !== null && (
              <ProgressStat
                label="Node Memory"
                value={nodeMemUsed}
                max={nodeMemTotal}
                color={CHART_COLORS.mem}
                formatValue={(v) => formatBytes(v)}
              />
            )}
            {(nodeInfo.version || nodeInfo.kernel_version) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Version</p>
                <p className="text-xs sm:text-sm font-mono font-medium text-foreground truncate">
                  {nodeInfo.version || nodeInfo.kernel_version || "—"}
                </p>
              </div>
            )}
            {(nodeInfo.architecture || nodeInfo.arch) && (
              <div className="rounded-lg border border-border bg-secondary/20 p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Architecture</p>
                <p className="text-xs sm:text-sm font-mono font-medium text-foreground">
                  {nodeInfo.architecture || nodeInfo.arch}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-border bg-secondary/20 p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Node CPU Avg (24h)</p>
              <p className="text-xs sm:text-sm font-mono font-medium text-foreground">
                {nodeHistorySummary.cpuAvg.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Node Net 24h (↓ / ↑)</p>
              <p className="text-xs sm:text-sm font-mono font-medium text-foreground">
                {formatBytes(nodeHistorySummary.rx24h)} / {formatBytes(nodeHistorySummary.tx24h)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function StatsTab({ serverId, server: serverProp }: StatsTabProps) {
  const [history, setHistory] = useState<any[]>([])
  const [live, setLive] = useState<any>(null)
  const [liveResources, setLiveResources] = useState<any>(serverProp?.resources ?? null)
  const [nodeInfo, setNodeInfo] = useState<any>(null)
  const [nodeHistory, setNodeHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [sevenDayTraffic, setSevenDayTraffic] = useState({ rx: 0, tx: 0 })
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("1h")
  const [localPoints, setLocalPoints] = useState<ChartDataPoint[]>([])
  const [liveHistory, setLiveHistory] = useState<ChartDataPoint[]>([])
  const [recharts, setRecharts] = useState<any>(null)
  const [activeChart, setActiveChart] = useState<"cpu" | "memory" | "disk" | "network">("cpu")

  useEffect(() => {
    import("recharts").then((mod) => {
      setRecharts(mod)
    })
  }, [])

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      const [liveData, nodeData] = await Promise.all([
        apiFetch(API_ENDPOINTS.serverStats.replace(":id", serverId)).catch(() => null),
        apiFetch(API_ENDPOINTS.serverStatsNode.replace(":id", serverId)).catch(() => null),
      ])

      const points =
        timeWindow === "5m" ? 60 :
        timeWindow === "10m" ? 120 :
        timeWindow === "1h" ? 720 :
        timeWindow === "6h" ? 4320 :
        timeWindow === "24h" ? 14400 :
        timeWindow === "7d" ? 201600 :
        60
      let histData: any[] = []

      if (timeWindow === "live") {
        if (liveData && (liveData.cpu_absolute != null || liveData.memory_bytes != null || liveData.disk_bytes != null)) {
          histData = [{ timestamp: new Date().toISOString(), metrics: liveData }]
        } else {
          histData = await apiFetch(API_ENDPOINTS.serverStatsHistory.replace(":id", serverId) + `?window=5m&points=15`).catch(() => [])
        }
      } else {
        histData = await apiFetch(API_ENDPOINTS.serverStatsHistory.replace(":id", serverId) + `?window=${timeWindow}&points=${points}`).catch(() => [])
      }

      setHistory(Array.isArray(histData) ? histData : [])
      setLive(liveData)
      setNodeInfo(nodeData)

      const nodeHistRows = await apiFetch(
        API_ENDPOINTS.serverStatsNodeHistory.replace(":id", serverId) + "?window=24h&points=144"
      ).catch(() => [])
      setNodeHistory(Array.isArray(nodeHistRows) ? nodeHistRows : [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [serverId, timeWindow])

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  useEffect(() => {
    const interval = setInterval(() => loadData(), 20000)
    return () => clearInterval(interval)
  }, [loadData])

  useEffect(() => {
    let active = true

    const load7DayTraffic = async () => {
      try {
        const rows = await apiFetch(API_ENDPOINTS.serverStatsHistory.replace(':id', serverId) + '?window=7d&points=168').catch(() => [])
        if (!active || !Array.isArray(rows) || rows.length < 2) {
          if (active) setSevenDayTraffic({ rx: 0, tx: 0 })
          return
        }

        const getDyn = (row: any, key: 'rx' | 'tx') => {
          const net = row.metrics?.network ?? row.network ?? {}
          return Number(net[`${key}_bytes`] ?? net[key] ?? 0)
        }

        let rxTotal = 0
        let txTotal = 0

        let prevRx = getDyn(rows[0], 'rx')
        let prevTx = getDyn(rows[0], 'tx')

        for (let i = 1; i < rows.length; i++) {
          const currentRx = getDyn(rows[i], 'rx')
          const currentTx = getDyn(rows[i], 'tx')

          const deltaRx = currentRx - prevRx
          const deltaTx = currentTx - prevTx

          if (deltaRx > 0) rxTotal += deltaRx
          if (deltaTx > 0) txTotal += deltaTx

          prevRx = currentRx
          prevTx = currentTx
        }

        setSevenDayTraffic({
          rx: Math.max(0, rxTotal),
          tx: Math.max(0, txTotal),
        })
      } catch {
        if (active) setSevenDayTraffic({ rx: 0, tx: 0 })
      }
    }

    load7DayTraffic()
    const interval = setInterval(load7DayTraffic, 5 * 60 * 1000)

    return () => { active = false; clearInterval(interval) }
  }, [serverId])

  useEffect(() => {
    setLiveResources(serverProp?.resources ?? null)
  }, [serverProp?.resources])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const detail = await apiFetch(API_ENDPOINTS.serverDetail.replace(":id", serverId))
        if (detail?.resources) {
          setLiveResources(detail.resources)
        }
      } catch {
        // skip
      }
    }, 8000)

    return () => clearInterval(interval)
  }, [serverId])

  useEffect(() => {
    const r = liveResources
    if (!r || (r.cpu_absolute == null && r.memory_bytes == null)) return
    
    const point: ChartDataPoint = {
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

  useEffect(() => {
    if (!live || (live.cpu_absolute == null && live.memory_bytes == null)) return

    const point: ChartDataPoint = {
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ts: Date.now(),
      cpu: Number((live.cpu_absolute ?? live.proc?.cpu?.total ?? 0).toFixed ? (live.cpu_absolute ?? live.proc?.cpu?.total ?? 0).toFixed(1) : (live.cpu_absolute ?? live.proc?.cpu?.total ?? 0)),
      memMB: Math.round((live.memory_bytes ?? live.proc?.memory?.total ?? 0) / 1024 / 1024),
      diskMB: Math.round((live.disk_bytes ?? live.disk ?? 0) / 1024 / 1024),
      rxMB: Math.round(((live.network?.rx_bytes ?? live.network?.rx ?? 0) / 1024 / 1024) * 100) / 100,
      txMB: Math.round(((live.network?.tx_bytes ?? live.network?.tx ?? 0) / 1024 / 1024) * 100) / 100,
    }

    setLiveHistory((prev) => {
      const next = [...prev]
      if (next.length > 0 && Math.abs(point.ts - next[next.length - 1].ts) < 60000) {
        next[next.length - 1] = point
      } else {
        next.push(point)
      }
      return next.length > 120 ? next.slice(-120) : next
    })
  }, [live])

  const chartData = useMemo((): ChartDataPoint[] => {
    return history.map((entry: any) => {
      const m = entry.metrics || {}
      const cpu = m.cpu_absolute ?? m.cpu ?? m.proc?.cpu?.total ?? 0
      const memBytes = m.memory_bytes ?? m.memory ?? m.proc?.memory?.total ?? 0
      const diskBytes = m.disk_bytes ?? m.disk ?? 0
      const rxBytes = m.network?.rx_bytes ?? m.network?.rx ?? 0
      const txBytes = m.network?.tx_bytes ?? m.network?.tx ?? 0
      const ts = new Date(entry.timestamp).getTime()
      
      return {
        time: formatTimeValue(entry.timestamp),
        ts,
        cpu: Number(cpu.toFixed ? cpu.toFixed(1) : cpu),
        memMB: Math.round(memBytes / 1024 / 1024),
        diskMB: Math.round(diskBytes / 1024 / 1024),
        rxMB: Math.round((rxBytes / 1024 / 1024) * 100) / 100,
        txMB: Math.round((txBytes / 1024 / 1024) * 100) / 100,
      }
    })
  }, [history])

  const preferredLiveSource = useMemo(() => {
    if (liveResources && (liveResources.cpu_absolute != null || liveResources.memory_bytes != null)) {
      return liveResources
    }
    if (live && (live.cpu_absolute != null || live.memory_bytes != null)) {
      return live
    }
    if (serverProp?.resources && (serverProp.resources.cpu_absolute != null || serverProp.resources.memory_bytes != null)) {
      return serverProp.resources
    }
    return null
  }, [liveResources, live, serverProp?.resources])

  const livePoint = useMemo<ChartDataPoint | null>(() => {
    const source = preferredLiveSource

    if (!source || (source.cpu_absolute == null && source.memory_bytes == null && source.disk_bytes == null)) {
      return null
    }

    return {
      time: formatTimeValue(Date.now()),
      ts: Date.now(),
      cpu: Number((source.cpu_absolute ?? source.proc?.cpu?.total ?? 0).toFixed ? (source.cpu_absolute ?? source.proc?.cpu?.total ?? 0).toFixed(1) : (source.cpu_absolute ?? source.proc?.cpu?.total ?? 0)),
      memMB: Math.round((source.memory_bytes ?? source.proc?.memory?.total ?? 0) / 1024 / 1024),
      diskMB: Math.round((source.disk_bytes ?? source.disk ?? 0) / 1024 / 1024),
      rxMB: Math.round(((source.network?.rx_bytes ?? source.network?.rx ?? 0) / 1024 / 1024) * 100) / 100,
      txMB: Math.round(((source.network?.tx_bytes ?? source.network?.tx ?? 0) / 1024 / 1024) * 100) / 100,
    }
  }, [preferredLiveSource])

  const effectiveChartData = useMemo<ChartDataPoint[]>(() => {
    if (timeWindow === "live") {
      return liveHistory
    }

    if (chartData.length > 0) {
      return chartData
    }

    return localPoints
  }, [timeWindow, chartData, localPoints, liveHistory])

  const liveSource = preferredLiveSource
  
  const liveCpu = liveSource?.cpu_absolute ?? liveSource?.proc?.cpu?.total ?? 0
  const liveMem = liveSource?.memory_bytes ?? liveSource?.proc?.memory?.total ?? 0
  const liveMemLimit = liveSource?.memory_limit_bytes ?? liveSource?.proc?.memory?.limit ?? 0
  const liveDisk = liveSource?.disk_bytes ?? liveSource?.disk ?? 0
  const liveNetRx = liveSource?.network?.rx_bytes ?? 0
  const liveNetTx = liveSource?.network?.tx_bytes ?? 0

  if (loading && !recharts) {
    return <LoadingState message="Loading statistics..." />
  }

  const chartTabs = [
    { value: "cpu" as const, label: "CPU", icon: Cpu },
    { value: "memory" as const, label: "Memory", icon: MemoryStick },
    { value: "disk" as const, label: "Disk", icon: HardDrive },
    { value: "network" as const, label: "Network", icon: Network },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionHeader title="Resource Usage" icon={Activity} />
        
        <div className="flex items-center gap-2">
          <ToggleGroup
            options={TIME_WINDOW_OPTIONS}
            value={timeWindow}
            onChange={setTimeWindow}
          />
          
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 rounded-lg border border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Live Stats */}
      <CardGrid columns={5}>
        <MiniStat 
          label="CPU" 
          value={`${Number(liveCpu).toFixed(1)}%`} 
          color={CHART_COLORS.cpu} 
        />
        <MiniStat 
          label="Memory" 
          value={formatBytes(liveMem)} 
          sub={liveMemLimit ? `/ ${formatBytes(liveMemLimit)}` : undefined} 
          color={CHART_COLORS.mem} 
        />
        <MiniStat 
          label="Disk" 
          value={formatBytes(liveDisk)} 
          color={CHART_COLORS.disk} 
        />
        <MiniStat 
          label="Net ↑" 
          value={formatBytes(liveNetTx)} 
          color={CHART_COLORS.tx} 
        />
        <MiniStat 
          label="Net ↓" 
          value={formatBytes(liveNetRx)} 
          color={CHART_COLORS.rx} 
        />
      </CardGrid>

      {/* Total Traffic */}
      <CardGrid columns={2}>
        <MiniStat
          label="7d Download Traffic"
          value={formatBytes(sevenDayTraffic.rx)}
          color={CHART_COLORS.rx}
        />
        <MiniStat
          label="7d Upload Traffic"
          value={formatBytes(sevenDayTraffic.tx)}
          color={CHART_COLORS.tx}
        />
      </CardGrid>

      {/* Charts */}
      {recharts && effectiveChartData.length > 0 ? (
        <>
          {/* Mobile: Tabbed charts */}
          <div className="sm:hidden">
            <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
              {chartTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveChart(tab.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    activeChart === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
            
            <ChartCard 
              title={chartTabs.find(t => t.value === activeChart)?.label || ""}
              icon={chartTabs.find(t => t.value === activeChart)?.icon || Cpu}
            >
              {activeChart === "cpu" && <CpuChart data={effectiveChartData} recharts={recharts} />}
              {activeChart === "memory" && <MemoryChart data={effectiveChartData} recharts={recharts} />}
              {activeChart === "disk" && <DiskChart data={effectiveChartData} recharts={recharts} />}
              {activeChart === "network" && <NetworkChart data={effectiveChartData} recharts={recharts} />}
            </ChartCard>
          </div>

          {/* Desktop: All charts */}
          <div className="hidden sm:grid sm:grid-cols-2 gap-4">
            <ChartCard title="CPU Usage" icon={Cpu}>
              <CpuChart data={effectiveChartData} recharts={recharts} />
            </ChartCard>
            
            <ChartCard title="Memory Usage" icon={MemoryStick}>
              <MemoryChart data={effectiveChartData} recharts={recharts} />
            </ChartCard>
            
            <ChartCard title="Disk Usage" icon={HardDrive}>
              <DiskChart data={effectiveChartData} recharts={recharts} />
            </ChartCard>
            
            <ChartCard title="Network Traffic" icon={Network}>
              <NetworkChart data={effectiveChartData} recharts={recharts} />
            </ChartCard>
          </div>
        </>
      ) : !loading ? (
        <EmptyState
          icon={Activity}
          title="No data available"
          message="Stats are collected while the server is running. Check back in a few minutes."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
      )}

      <NodeInfoPanel nodeInfo={nodeInfo} nodeHistory={nodeHistory} />
    </div>
  )
}