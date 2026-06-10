"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  CreditCard,
  FileText,
  HardDrive,
  Loader2,
  MessageSquare,
  MessageSquareHeart,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  Zap,
  X,
} from "lucide-react"

interface OverviewStats {
  totalUsers: number
  totalNodes: number
  totalOrganisations: number
  totalServers: number
  pendingTickets: number
  pendingVerifications: number
  pendingDeletions: number
  fraudAlerts: number
  serverActions: number
  abuseReports: number
  pendingApplications: number
  totalVerifications: number
  totalDeletions: number
  totalFeedback: number
  pendingOrders?: number
}

interface QuickAction {
  id: string
  title: string
  description: string
  count: number
  icon: React.ElementType
  color: string
  href: string
  permission: string
  showPending?: boolean
  countLabel?: string
}

export default function OverviewTab({ ctx }: { ctx: any }) {
  const { user } = useAuth()
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [quickSearch, setQuickSearch] = useState("")
  const [searchResults, setSearchResults] = useState<{
    users: any[]
    servers: any[]
    organisations: any[]
  }>({ users: [], servers: [], organisations: [] })
  const [searching, setSearching] = useState(false)

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await apiFetch(API_ENDPOINTS.adminStats)
      setStats(response)
    } catch (e) {
      console.error("Failed to fetch overview stats:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleQuickSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults({ users: [], servers: [], organisations: [] })
      return
    }
    setSearching(true)
    try {
      const response = await apiFetch(`${API_ENDPOINTS.adminGlobalSearch}?q=${encodeURIComponent(query)}`)
      setSearchResults({
        users: response?.users?.slice(0, 3) || [],
        servers: response?.servers?.slice(0, 3) || [],
        organisations: response?.organisations?.slice(0, 3) || [],
      })
    } catch (e) {
      console.error("Search failed:", e)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleQuickSearch(quickSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickSearch, handleQuickSearch])

  const quickActions: QuickAction[] = [
    {
      id: "kyc",
      title: "Pending KYC",
      description: "Identity verifications awaiting review",
      count: stats?.pendingVerifications ?? 0,
      icon: ShieldCheck,
      color: "text-cyan-500",
      href: "?tab=verifications",
      permission: "idverification:read",
      showPending: true,
    },
    {
      id: "deletions",
      title: "Deletion Requests",
      description: "Account deletion requests in queue",
      count: stats?.pendingDeletions ?? 0,
      icon: Trash2,
      color: "text-pink-500",
      href: "?tab=deletions",
      permission: "deletions:write",
      showPending: true,
    },
    {
      id: "applications",
      title: "Pending Applications",
      description: "Applications awaiting review",
      count: stats?.pendingApplications ?? 0,
      icon: FileText,
      color: "text-blue-500",
      href: "?tab=applications",
      permission: "applications:manage",
      showPending: true,
    },
    {
      id: "tickets",
      title: "Open Tickets",
      description: "Support tickets awaiting response",
      count: stats?.pendingTickets ?? 0,
      icon: MessageSquare,
      color: "text-orange-500",
      href: "?tab=tickets",
      permission: "tickets:read",
      showPending: true,
    },
    {
      id: "fraud",
      title: "Fraud Alerts",
      description: "Users flagged for suspicious activity",
      count: stats?.fraudAlerts ?? 0,
      icon: AlertTriangle,
      color: "text-red-500",
      href: "?tab=fraud",
      permission: "admin:fraud",
      showPending: true,
    },
    {
      id: "abuse",
      title: "Abuse Reports",
      description: "Anti-abuse incidents detected",
      count: stats?.abuseReports ?? 0,
      icon: Shield,
      color: "text-purple-500",
      href: "?tab=antiabuse",
      permission: "admin:antiabuse",
      showPending: false,
      countLabel: "total",
    },
    {
      id: "servers",
      title: "Total Servers",
      description: "Active servers across all nodes",
      count: stats?.totalServers ?? 0,
      icon: Server,
      color: "text-green-500",
      href: "?tab=servers",
      permission: "servers:read",
      showPending: false,
    },
    {
      id: "feedback",
      title: "User Feedback",
      description: "Feedback submissions from users",
      count: stats?.totalFeedback ?? 0,
      icon: MessageSquareHeart,
      color: "text-rose-500",
      href: "?tab=feedback",
      permission: "admin:access",
      showPending: false,
      countLabel: "total",
    },
  ]

  const visibleActions = quickActions.filter((action) =>
    user && hasPermission(user, action.permission)
  )

  const overviewCards = [
    { title: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-500" },
    { title: "Organisations", value: stats?.totalOrganisations ?? 0, icon: Users, color: "text-violet-500" },
    { title: "Nodes", value: stats?.totalNodes ?? 0, icon: HardDrive, color: "text-emerald-500" },
    { title: "Server Actions", value: stats?.serverActions ?? 0, icon: Zap, color: "text-amber-500" },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Search */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Quick Search</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Search users, servers, organisations..."
            className="w-full pl-10 pr-10 py-2.5 border border-border bg-secondary/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searching && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching...
          </div>
        )}
        {quickSearch && !searching && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-border p-2 bg-secondary/30">
              <p className="text-xs font-semibold text-foreground mb-1">
                Users ({searchResults.users.length})
              </p>
              {searchResults.users.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No matches</p>
              ) : (
                searchResults.users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-xs py-1">
                    <span className="truncate text-foreground">
                      {u.firstName} {u.lastName}
                    </span>
                    <button
                      onClick={() => ctx?.openGlobalUser?.(u)}
                      className="text-primary hover:underline ml-2"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border border-border p-2 bg-secondary/30">
              <p className="text-xs font-semibold text-foreground mb-1">
                Servers ({searchResults.servers.length})
              </p>
              {searchResults.servers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No matches</p>
              ) : (
                searchResults.servers.map((s) => (
                  <div key={s.uuid} className="flex items-center justify-between text-xs py-1">
                    <span className="truncate text-foreground">{s.name || s.uuid}</span>
                    <button
                      onClick={() => ctx?.openGlobalServer?.(s)}
                      className="text-primary hover:underline ml-2"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border border-border p-2 bg-secondary/30">
              <p className="text-xs font-semibold text-foreground mb-1">
                Organisations ({searchResults.organisations.length})
              </p>
              {searchResults.organisations.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No matches</p>
              ) : (
                searchResults.organisations.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs py-1">
                    <span className="truncate text-foreground">{o.name}</span>
                    <button
                      onClick={() => ctx?.openGlobalOrganisation?.(o)}
                      className="text-primary hover:underline ml-2"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overview Stats */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Platform Overview</p>
          </div>
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {overviewCards.map((card) => (
            <div key={card.title} className="border border-border bg-secondary/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{card.title}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className="text-2xl font-mono font-semibold text-foreground">
                {card.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Quick Actions</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleActions.map((action) => (
            <a
              key={action.id}
              href={action.href}
              className="group border border-border bg-secondary/30 p-4 hover:border-primary/50 hover:bg-secondary/50 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 bg-secondary ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{action.title}</h3>
              <p className="text-xs text-muted-foreground mb-3">{action.description}</p>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-mono font-bold ${action.count > 0 ? action.color : "text-muted-foreground"}`}>
                  {action.count}
                </span>
                {action.showPending && action.count > 0 && (
                  <span className="text-xs text-muted-foreground">pending</span>
                )}
                {action.countLabel && action.count > 0 && (
                  <span className="text-xs text-muted-foreground">{action.countLabel}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Activity Summary */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Verification & Deletion Summary</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Total KYC Records</p>
            <p className="text-xl font-mono font-semibold text-foreground">
              {stats?.totalVerifications?.toLocaleString() ?? "—"}
            </p>
          </div>
          <div className="border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Pending KYC</p>
            <p className="text-xl font-mono font-semibold text-cyan-500">
              {stats?.pendingVerifications?.toLocaleString() ?? "—"}
            </p>
          </div>
          <div className="border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Total Deletions</p>
            <p className="text-xl font-mono font-semibold text-foreground">
              {stats?.totalDeletions?.toLocaleString() ?? "—"}
            </p>
          </div>
          <div className="border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Pending Deletions</p>
            <p className="text-xl font-mono font-semibold text-pink-500">
              {stats?.pendingDeletions?.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}