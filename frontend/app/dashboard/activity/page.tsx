"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import {
  Server,
  LogIn,
  LogOut,
  CreditCard,
  Shield,
  Ticket,
  Cpu,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Globe,
  Activity,
  FileText,
  User,
  Loader2,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Hash,
  Box,
  UserPlus,
  Calendar,
} from "lucide-react"

const typeIcons: Record<string, typeof Server> = {
  server: Server,
  auth: LogIn,
  login: LogIn,
  logout: LogOut,
  register: UserPlus,
  billing: CreditCard,
  security: Shield,
  support: Ticket,
  compute: Cpu,
}

const typeColors: Record<string, string> = {
  server: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  auth: "text-primary bg-primary/10 border-primary/20",
  login: "text-green-400 bg-green-400/10 border-green-400/20",
  logout: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  register: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  billing: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  security: "text-red-400 bg-red-400/10 border-red-400/20",
  support: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  compute: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
}

const typeBadgeColors: Record<string, string> = {
  server: "border-blue-500/30 text-blue-400 bg-blue-500/5",
  auth: "border-primary/30 text-primary bg-primary/5",
  login: "border-green-500/30 text-green-400 bg-green-500/5",
  logout: "border-orange-500/30 text-orange-400 bg-orange-500/5",
  register: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
  billing: "border-yellow-500/30 text-yellow-400 bg-yellow-500/5",
  security: "border-red-500/30 text-red-400 bg-red-500/5",
  support: "border-purple-500/30 text-purple-400 bg-purple-500/5",
  compute: "border-cyan-500/30 text-cyan-400 bg-cyan-500/5",
}

function guessType(action: string): string {
  const a = action.toLowerCase()
  if (a.includes("logout") || a.includes("log_out") || a.includes("signout")) return "logout"
  if (a.includes("login") || a.includes("log_in") || a.includes("signin")) return "login"
  if (a.includes("register") || a.includes("signup") || a.includes("sign_up")) return "register"
  if (/passkey|2fa|mfa|otp/.test(a)) return "security"
  if (/server|start|stop|restart|power|console/.test(a)) return "server"
  if (/billing|payment|invoice|order|subscription|credit/.test(a)) return "billing"
  if (/key|security|password|token/.test(a)) return "security"
  if (/ticket|support/.test(a)) return "support"
  if (/compute|instance|vm|container/.test(a)) return "compute"
  return "auth"
}

function formatTimeAgo(timestamp: string, t: (key: string, values?: Record<string, any>) => string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t("time.justNow")
  if (diffMins < 60) return t("time.minutesAgo", { count: diffMins })
  if (diffHours < 24) return t("time.hoursAgo", { count: diffHours })
  if (diffDays < 7) return t("time.daysAgo", { count: diffDays })
  return then.toLocaleDateString()
}

function formatAction(action: string): string {
  return action
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function InfoItem({ icon: Icon, label, value, mono, copyable }: {
  icon?: any
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (copyable && value && value !== "-") {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-secondary/20 p-2.5 sm:p-3 min-w-0 overflow-hidden",
        copyable && value !== "-" && "cursor-pointer hover:bg-secondary/40 active:bg-secondary/50 transition-colors"
      )}
      onClick={handleCopy}
    >
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
        {copyable && value !== "-" && (
          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
            {copied ? "✓" : ""}
          </span>
        )}
      </div>
      <p className={cn(
        "text-xs sm:text-sm text-foreground truncate",
        mono && "font-mono text-[10px] sm:text-xs"
      )}>
        {value || "-"}
      </p>
    </div>
  )
}

function EmptyState({ icon: Icon = AlertCircle, title, message }: {
  icon?: any
  title?: string
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div className="rounded-full bg-secondary/50 p-4 mb-4">
        <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
      </div>
      {title && <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>}
      <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  )
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16">
      <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground mb-3" />
      <p className="text-xs sm:text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export default function AccountActivity() {
  const t = useTranslations("activityPage")
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string | number>>(new Set())
  const LOGS_PER = 50

  const loadLogs = async (pageNumber = 1) => {
    if (!user) return
    setLoading(true)
    try {
      const offset = (pageNumber - 1) * LOGS_PER
      const url = `${API_ENDPOINTS.userDetail.replace(":id", user.id.toString())}/logs?limit=${LOGS_PER}&offset=${offset}`
      const data = await apiFetch(url)
      const items = Array.isArray(data) ? data : []
      setLogs(items)
      setHasMore(items.length === LOGS_PER)
      setPage(pageNumber)
    } catch {
      setLogs([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs(1)
  }, [user])

  const displayLogs = logs.filter((item) => {
    if (!filter) return true
    return guessType(item.action ?? "") === filter
  })

  const toggleExpand = (id: string | number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const filterTypes = [
    { key: "server", label: t("filters.server") },
    { key: "login", label: t("filters.login") },
    { key: "logout", label: t("filters.logout") },
    { key: "billing", label: t("filters.billing") },
    { key: "security", label: t("filters.security") },
    { key: "support", label: t("filters.support") },
  ]

  // Stats from current page data
  const pageStats = {
    onPage: displayLogs.length,
    today: logs.filter(l => {
      if (!l.timestamp) return false
      const d = new Date(l.timestamp)
      const now = new Date()
      return d.toDateString() === now.toDateString()
    }).length,
    logins: logs.filter(l => guessType(l.action ?? "") === "login").length,
    servers: logs.filter(l => guessType(l.action ?? "") === "server").length,
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div data-guide-id="activity-dashboard" className="flex-shrink-0">
        <PanelHeader title={t("header.title")} description={t("header.description")} />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-4 sm:gap-6 p-3 sm:p-4 md:p-6 w-full min-w-0">

          {/* Stats Cards - showing page-relevant stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 min-w-0">
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("stats.currentPage")}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{pageStats.onPage}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("stats.page", { page })}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("stats.today")}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{pageStats.today}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("stats.onThisPage")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="h-4 w-4 text-green-400 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("stats.logins")}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{pageStats.logins}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("stats.onThisPage")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-4 w-4 text-purple-400 flex-shrink-0" />
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("stats.serverEvents")}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{pageStats.servers}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("stats.onThisPage")}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-3 min-w-0">
              <Filter className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">{t("filters.title")}</span>
              {filter && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(null)}
                  className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-3 w-3 mr-1" />
                  {t("filters.clear")}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 min-w-0">
              <button
                onClick={() => setFilter(null)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors flex-shrink-0",
                  !filter
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{t("filters.all")}</span>
              </button>
              {filterTypes.map(({ key, label }) => {
                const Icon = typeIcons[key] ?? Server
                const isActive = filter === key
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(isActive ? null : key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors flex-shrink-0",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Activity List */}
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-border bg-secondary/20 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{t("log.title")}</span>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  {t("log.shown", { count: displayLogs.length })}
                </Badge>
              </div>
              {/* Pagination */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">
                  {t("stats.page", { page })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => loadLogs(Math.max(1, page - 1))}
                  className="h-7 sm:h-8 px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasMore || loading}
                  onClick={() => loadLogs(page + 1)}
                  className="h-7 sm:h-8 px-2"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0">
              {loading ? (
                <LoadingState message={t("states.loadingActivity")} />
              ) : displayLogs.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title={t("states.noActivityTitle")}
                  message={filter ? t("states.noActivityForFilter", { filter }) : t("states.noActivityMessage")}
                />
              ) : (
                <div className="divide-y divide-border">
                  {displayLogs.map((item) => {
                    const type = guessType(item.action ?? "")
                    const Icon = typeIcons[type] ?? Server
                    const colorClasses = typeColors[type] ?? typeColors.auth
                    const badgeColor = typeBadgeColors[type] ?? typeBadgeColors.auth
                    const isExpanded = expandedLogs.has(item.id)
                    const isSelected = selectedLog?.id === item.id

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "transition-colors",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        {/* Main Row */}
                        <div
                          className="flex items-start gap-2.5 sm:gap-3 p-3 sm:p-4 cursor-pointer hover:bg-secondary/30 min-w-0"
                          onClick={() => toggleExpand(item.id)}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border",
                            colorClasses
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate min-w-0">
                                    {formatAction(item.action ?? t("log.unknownAction"))}
                                  </p>
                                  <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", badgeColor)}>
                                    {type}
                                  </Badge>
                                </div>
                                {item.target && (
                                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{item.target}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right hidden sm:block">
                                  <p className="text-xs text-muted-foreground">
                                    {item.timestamp ? formatTimeAgo(item.timestamp, t) : ""}
                                  </p>
                                  {item.ipAddress && (
                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                      {item.ipAddress}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedLog(isSelected ? null : item)
                                    }}
                                    className={cn(
                                      "h-7 w-7 p-0",
                                      isSelected && "bg-primary/10 text-primary"
                                    )}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Mobile timestamp */}
                            <div className="flex items-center gap-2 mt-1.5 sm:hidden flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-[10px] text-muted-foreground">
                                  {item.timestamp ? formatTimeAgo(item.timestamp, t) : "-"}
                                </span>
                              </div>
                              {item.ipAddress && (
                                <div className="flex items-center gap-1 min-w-0">
                                  <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                                    {item.ipAddress}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 min-w-0 overflow-hidden">
                            <div className="rounded-lg border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 ml-10 sm:ml-12 min-w-0 overflow-hidden">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                                <InfoItem
                                  icon={Activity}
                                  label={t("details.action")}
                                  value={item.action || t("log.unknown")}
                                />
                                <InfoItem
                                  icon={Box}
                                  label={t("details.targetType")}
                                  value={item.targetType || "-"}
                                />
                                <InfoItem
                                  icon={Hash}
                                  label={t("details.targetId")}
                                  value={item.targetId?.toString() || "-"}
                                  mono
                                  copyable
                                />
                                <InfoItem
                                  icon={Clock}
                                  label={t("details.timestamp")}
                                  value={item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
                                />
                                <InfoItem
                                  icon={Globe}
                                  label={t("details.ipAddress")}
                                  value={item.ipAddress || "-"}
                                  mono
                                  copyable
                                />
                                <InfoItem
                                  icon={User}
                                  label={t("details.userId")}
                                  value={item.userId?.toString() || "-"}
                                  mono
                                />
                              </div>

                              {item.metadata && Object.keys(item.metadata).length > 0 && (
                                <div className="pt-2 border-t border-border min-w-0 overflow-hidden">
                                  <p className="text-xs text-muted-foreground mb-2">{t("details.metadata")}</p>
                                  <div className="rounded-md border border-border bg-background overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <pre className="p-2 sm:p-3 text-[10px] sm:text-xs font-mono text-foreground whitespace-pre">
                                        {JSON.stringify(item.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer Pagination */}
            {!loading && displayLogs.length > 0 && (
              <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-t border-border bg-secondary/10 min-w-0">
                <span className="text-xs text-muted-foreground truncate">
                  {t("footer.pageEvents", { page, count: displayLogs.length })}
                </span>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() => loadLogs(Math.max(1, page - 1))}
                    className="h-8 px-2 sm:px-3 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">{t("actions.prev")}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hasMore || loading}
                    onClick={() => loadLogs(page + 1)}
                    className="h-8 px-2 sm:px-3 text-xs"
                  >
                    <span className="hidden sm:inline">{t("actions.next")}</span>
                    <ChevronRight className="h-3.5 w-3.5 sm:ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Selected Log Detail Panel */}
          {selectedLog && (
            <div className="rounded-xl border border-primary/30 bg-card overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-border bg-primary/5 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Eye className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{t("details.eventDetails")}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedLog(null)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-3 sm:p-4 space-y-4 min-w-0 overflow-hidden">
                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
                  <InfoItem icon={Activity} label={t("details.action")} value={selectedLog.action || t("log.unknown")} />
                  <InfoItem icon={Box} label={t("details.targetType")} value={selectedLog.targetType || "-"} />
                  <InfoItem icon={Hash} label={t("details.targetId")} value={selectedLog.targetId?.toString() || "-"} mono copyable />
                  <InfoItem icon={Clock} label={t("details.timestamp")} value={selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : "-"} />
                  <InfoItem icon={Globe} label={t("details.ipAddress")} value={selectedLog.ipAddress || "-"} mono copyable />
                  <InfoItem icon={User} label={t("details.userId")} value={selectedLog.userId?.toString() || "-"} mono />
                </div>

                {/* All Properties */}
                <div className="pt-3 border-t border-border min-w-0 overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("details.allProperties")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                    {Object.entries(selectedLog).map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-border bg-secondary/20 p-2 sm:p-2.5 min-w-0 overflow-hidden">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{key}</p>
                        <p className="mt-1 font-mono text-[10px] sm:text-xs text-foreground break-all line-clamp-2">
                          {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? "-")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Raw JSON */}
                <div className="pt-3 border-t border-border min-w-0 overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("details.rawJson")}</p>
                  <div className="rounded-md border border-border bg-background overflow-hidden">
                    <div className="overflow-x-auto">
                      <pre className="p-2 sm:p-3 text-[10px] sm:text-xs font-mono text-foreground whitespace-pre">
                        {JSON.stringify(selectedLog, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}