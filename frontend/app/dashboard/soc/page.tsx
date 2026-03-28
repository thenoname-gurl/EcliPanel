"use client"

import { useEffect, useState, useCallback } from "react"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Activity,
  RefreshCw,
  Server,
  BarChart2,
  Package,
  Users,
  Building2,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import SearchableUserSelect from "@/components/SearchableUserSelect"

interface SocEntry {
  id: number
  serverId: string
  metrics: Record<string, any>
  timestamp: string
}

interface Plan {
  id: number
  name: string
  description?: string
  price?: number
  features?: any
}

interface UsageEntry {
  endpoint: string
  count: string
}

interface AdminUser { id: number; firstName: string; lastName: string; email: string }
interface AdminOrg { id: number; name: string; handle: string }

export default function SocPage() {
  const [overview, setOverview] = useState<SocEntry[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [userUsage, setUserUsage] = useState<UsageEntry[]>([])
  const [orgUsage, setOrgUsage] = useState<UsageEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedOrgId, setSelectedOrgId] = useState("")
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [loadingUserUsage, setLoadingUserUsage] = useState(false)
  const [loadingOrgUsage, setLoadingOrgUsage] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")

  // Load users + orgs for dropdowns on mount
  useEffect(() => {
    apiFetch(API_ENDPOINTS.adminUsers).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {})
    apiFetch(API_ENDPOINTS.adminOrganisations)
      .then((d: any) => {
        const orgList = Array.isArray(d?.organisations) ? d.organisations : Array.isArray(d) ? d : []
        setOrgs(orgList)
      })
      .catch(() => {})
    fetchOverview()
  }, [])

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socOverview)
      setOverview(Array.isArray(data) ? data : [])
    } catch { setOverview([]) }
    finally { setLoadingOverview(false) }
  }, [])

  const fetchPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socPlans)
      setPlans(Array.isArray(data) ? data : [])
    } catch { setPlans([]) }
    finally { setLoadingPlans(false) }
  }, [])

  const fetchUserUsage = useCallback(async () => {
    if (!selectedUserId) return
    setLoadingUserUsage(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socUsageUser.replace(":id", selectedUserId))
      setUserUsage(Array.isArray(data) ? data : [])
    } catch { setUserUsage([]) }
    finally { setLoadingUserUsage(false) }
  }, [selectedUserId])

  const fetchOrgUsage = useCallback(async () => {
    if (!selectedOrgId) return
    setLoadingOrgUsage(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socUsageOrg.replace(":id", selectedOrgId))
      setOrgUsage(Array.isArray(data) ? data : [])
    } catch { setOrgUsage([]) }
    finally { setLoadingOrgUsage(false) }
  }, [selectedOrgId])

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    if (tab === "plans" && plans.length === 0) fetchPlans()
  }

  // group overview by serverId → latest entry per server
  const latestByServer: Record<string, SocEntry> = {}
  for (const e of overview) {
    if (!latestByServer[e.serverId] || new Date(e.timestamp) > new Date(latestByServer[e.serverId].timestamp)) {
      latestByServer[e.serverId] = e
    }
  }
  const serverEntries = Object.values(latestByServer)

  const maxCount = userUsage.length ? Math.max(...userUsage.map((u) => Number(u.count))) : 1
  const maxOrgCount = orgUsage.length ? Math.max(...orgUsage.map((u) => Number(u.count))) : 1

  return (
    <>
      <PanelHeader title="SOC Dashboard" description="Security Operations Center — metrics, plans & usage" />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-5 p-6">

          {/* Summary row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Tracked Servers", value: serverEntries.length, icon: Server },
              { label: "Total Plans", value: plans.length, icon: Package },
              { label: "Users", value: users.length, icon: Users },
              { label: "Organisations", value: orgs.length, icon: Building2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold text-foreground">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <Tabs defaultValue="overview" onValueChange={handleTabChange} className="w-full">
            <TabsList className="border border-border bg-secondary/50">
              {[
                { value: "overview", label: "Server Metrics" },
                { value: "plans", label: "Plans" },
                { value: "user-usage", label: "User Usage" },
                { value: "org-usage", label: "Org Usage" },
              ].map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ─── Server Metrics ─── */}
            <TabsContent value="overview" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" /> Latest metrics per server
                  </p>
                  <button onClick={fetchOverview} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingOverview ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {loadingOverview ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading metrics…</div>
                ) : serverEntries.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No SOC data recorded yet.</div>
                ) : (
                  <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {serverEntries.map((entry) => {
                      const m = entry.metrics || {}
                      const cpuPct = Number(m.cpu_absolute ?? 0).toFixed(1)
                      const memBytes = Number(m.memory_bytes ?? 0)
                      const memLimitBytes = Number(m.memory_limit_bytes ?? 0)
                      const diskBytes = Number(m.disk_bytes ?? 0)
                      const netRx = Number(m.network?.rx_bytes ?? 0)
                      const netTx = Number(m.network?.tx_bytes ?? 0)
                      const state = m.state || 'unknown'
                      const stateColor = state === 'running' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : state === 'stopped' || state === 'offline' ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                      const fmtBytes = (b: number) => {
                        if (b === 0) return '0 B'
                        const k = 1024; const s = ['B','KB','MB','GB','TB']
                        const i = Math.floor(Math.log(b) / Math.log(k))
                        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i]
                      }
                      const memPct = memLimitBytes > 0 ? Math.min((memBytes / memLimitBytes) * 100, 100) : 0
                      return (
                        <div key={entry.serverId} className="rounded-lg border border-border bg-secondary/20 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Server className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-mono text-foreground truncate max-w-[140px]">{entry.serverId}</span>
                            </div>
                            <Badge variant="outline" className={`${stateColor} text-[10px]`}>{state}</Badge>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {/* CPU */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</span>
                                <span className="text-foreground font-mono">{cpuPct}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(Number(cpuPct), 100)}%` }} />
                              </div>
                            </div>
                            {/* Memory */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><MemoryStick className="h-3 w-3" /> Memory</span>
                                <span className="text-foreground font-mono">{fmtBytes(memBytes)}{memLimitBytes > 0 ? ` / ${fmtBytes(memLimitBytes)}` : ''}</span>
                              </div>
                              {memLimitBytes > 0 && (
                                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${memPct}%` }} />
                                </div>
                              )}
                            </div>
                            {/* Disk */}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="h-3 w-3" /> Disk</span>
                              <span className="text-foreground font-mono">{fmtBytes(diskBytes)}</span>
                            </div>
                            {/* Network */}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> Network</span>
                              <span className="text-foreground font-mono flex items-center gap-2">
                                <span className="flex items-center gap-0.5"><ArrowUpRight className="h-2.5 w-2.5 text-red-400" />{fmtBytes(netTx)}</span>
                                <span className="flex items-center gap-0.5"><ArrowDownRight className="h-2.5 w-2.5 text-green-400" />{fmtBytes(netRx)}</span>
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(entry.timestamp).toLocaleString()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── Plans ─── */}
            <TabsContent value="plans" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" /> Available Plans
                  </p>
                  <button onClick={fetchPlans} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingPlans ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {loadingPlans ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading plans…</div>
                ) : plans.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No plans configured.</div>
                ) : (
                  <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {plans.map((plan) => (
                      <div key={plan.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                        <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                        {plan.description && <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>}
                        {plan.price !== undefined && (
                          <p className="mt-2 text-lg font-bold text-primary">${plan.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                        )}
                        {plan.features && (
                          <div className="mt-2 flex flex-col gap-1">
                            {Object.entries(plan.features).map(([k, v]) => (
                              <div key={k} className="flex justify-between text-xs">
                                <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                                <span className="text-foreground font-mono">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── User Usage ─── */}
            <TabsContent value="user-usage" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <div className="flex-1 max-w-xs">
                    <SearchableUserSelect value={selectedUserId} onChange={setSelectedUserId} placeholder="— select a user —" initialList={users} />
                  </div>
                  <Button size="sm" onClick={fetchUserUsage} disabled={!selectedUserId || loadingUserUsage}>
                    {loadingUserUsage ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Load</span>
                  </Button>
                </div>
                {!selectedUserId ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Select a user to view their API usage.</div>
                ) : loadingUserUsage ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : userUsage.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No usage data found for this user.</div>
                ) : (
                  <div className="flex flex-col gap-2 p-4">
                    {userUsage.sort((a, b) => Number(b.count) - Number(a.count)).map((entry) => (
                      <div key={entry.endpoint} className="flex items-center gap-3">
                        <span className="w-52 truncate text-xs font-mono text-muted-foreground shrink-0">{entry.endpoint}</span>
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(Number(entry.count) / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs text-foreground w-14 text-right font-mono">{Number(entry.count).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── Org Usage ─── */}
            <TabsContent value="org-usage" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 flex-1 max-w-xs"
                  >
                    <option value="">— select an organisation —</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name} (@{o.handle})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={fetchOrgUsage} disabled={!selectedOrgId || loadingOrgUsage}>
                    {loadingOrgUsage ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Load</span>
                  </Button>
                </div>
                {!selectedOrgId ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Select an organisation to view its API usage.</div>
                ) : loadingOrgUsage ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : orgUsage.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No usage data found for this organisation.</div>
                ) : (
                  <div className="flex flex-col gap-2 p-4">
                    {orgUsage.sort((a, b) => Number(b.count) - Number(a.count)).map((entry) => (
                      <div key={entry.endpoint} className="flex items-center gap-3">
                        <span className="w-52 truncate text-xs font-mono text-muted-foreground shrink-0">{entry.endpoint}</span>
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(Number(entry.count) / maxOrgCount) * 100}%` }} />
                        </div>
                        <span className="text-xs text-foreground w-14 text-right font-mono">{Number(entry.count).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </>
  )
}
