"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Server,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Globe,
  Activity,
  FileText,
  User,
  Eye,
  ChevronDown,
  ChevronUp,
  Hash,
  Box,
  Calendar,
  LogIn,
  RefreshCw,
} from "lucide-react"
import {
  typeIcons,
  typeColors,
  typeBadgeColors,
  guessType,
  formatTimeAgo,
  InfoItem,
  JsonBlock,
  EmptyState,
  LoadingState,
} from "./helpers"

export interface ActivityStat {
  key: string
  label: string
  icon: any
  iconColor: string
  value: number | string
  subtext?: string
}

export interface ActivityFilterOption {
  key: string
  label: string
  icon: any
}

export interface ActivityFeedProps {
  logs: any[]
  loading: boolean
  getActionLabel: (action: string) => string
  guessTypeFn?: (action: string) => string
  typeIconsMap?: Record<string, any>
  typeColorsMap?: Record<string, string>
  typeBadgeColorsMap?: Record<string, string>

  statsCards?: ActivityStat[]
  filterOptions?: ActivityFilterOption[]

  page?: number
  hasMore?: boolean
  onPrevPage?: () => void
  onNextPage?: () => void
  onRefresh?: () => void
  refreshing?: boolean

  translate: (key: string, values?: Record<string, any>) => string
  emptyTitle?: string
  emptyMessage?: string
}

export function ActivityFeed({
  logs,
  loading,
  getActionLabel,
  guessTypeFn = guessType,
  typeIconsMap = typeIcons,
  typeColorsMap = typeColors,
  typeBadgeColorsMap = typeBadgeColors,
  statsCards,
  filterOptions,
  page = 1,
  hasMore = false,
  onPrevPage,
  onNextPage,
  onRefresh,
  refreshing,
  translate: t,
  emptyTitle,
  emptyMessage,
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string | number>>(new Set())

  const displayLogs = logs.filter((item) => {
    if (!filter) return true
    return guessTypeFn(item.action ?? "") === filter
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

  const defaultStats: ActivityStat[] = [
    {
      key: "onPage",
      label: t("stats.currentPage"),
      icon: Calendar,
      iconColor: "text-primary",
      value: displayLogs.length,
      subtext: t("stats.page", { page }),
    },
    {
      key: "today",
      label: t("stats.today"),
      icon: Clock,
      iconColor: "text-blue-400",
      value: logs.filter(l => {
        if (!l.timestamp) return false
        const d = new Date(l.timestamp)
        const now = new Date()
        return d.toDateString() === now.toDateString()
      }).length,
      subtext: t("stats.onThisPage"),
    },
    {
      key: "logins",
      label: t("stats.logins"),
      icon: LogIn,
      iconColor: "text-green-400",
      value: logs.filter(l => guessTypeFn(l.action ?? "") === "login").length,
      subtext: t("stats.onThisPage"),
    },
    {
      key: "serverEvents",
      label: t("stats.serverEvents"),
      icon: Server,
      iconColor: "text-purple-400",
      value: logs.filter(l => guessTypeFn(l.action ?? "") === "server").length,
      subtext: t("stats.onThisPage"),
    },
  ]

  const stats = statsCards ?? defaultStats

  const defaultFilterOptions: ActivityFilterOption[] = [
    { key: "server", label: t("filters.server"), icon: Server },
    { key: "login", label: t("filters.login"), icon: LogIn },
    { key: "logout", label: t("filters.logout"), icon: LogIn },
    { key: "billing", label: t("filters.billing"), icon: LogIn },
    { key: "security", label: t("filters.security"), icon: LogIn },
    { key: "support", label: t("filters.support"), icon: LogIn },
  ]

  const filterTypes = filterOptions ?? defaultFilterOptions

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full min-w-0">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 min-w-0">
        {stats.map((stat) => (
          <div key={stat.key} className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={cn("h-4 w-4 flex-shrink-0", stat.iconColor)} />
              <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stat.value}</p>
            {stat.subtext && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.subtext}</p>
            )}
          </div>
        ))}
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
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
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
            const Icon = (typeIconsMap as any)[key] ?? Server
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
              onClick={onPrevPage}
              className="h-7 sm:h-8 px-2"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasMore || loading}
              onClick={onNextPage}
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
              title={emptyTitle ?? t("states.noActivityTitle")}
              message={emptyMessage ?? (filter ? t("states.noActivityForFilter", { filter }) : t("states.noActivityMessage"))}
            />
          ) : (
            <div className="divide-y divide-border">
              {displayLogs.map((item: any) => {
                const type = guessTypeFn(item.action ?? "")
                const Icon = (typeIconsMap as any)[type] ?? Server
                const colorClasses = (typeColorsMap as any)[type] ?? typeColorsMap?.auth ?? "text-primary bg-primary/10 border-primary/20"
                const badgeColor = (typeBadgeColorsMap as any)[type] ?? typeBadgeColorsMap?.auth ?? "border-primary/30 text-primary bg-primary/5"
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
                                {getActionLabel(item.action ?? t("log.unknownAction"))}
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
                            {item.targetType ? (
                              <InfoItem
                                icon={Box}
                                label={t("details.targetType")}
                                value={item.targetType}
                              />
                            ) : null}
                            {item.targetId ? (
                              <InfoItem
                                icon={Hash}
                                label={t("details.targetId")}
                                value={item.targetId.toString()}
                                mono
                                copyable
                              />
                            ) : null}
                            <InfoItem
                              icon={Clock}
                              label={t("details.timestamp")}
                              value={item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
                            />
                            {item.ipAddress ? (
                              <InfoItem
                                icon={Globe}
                                label={t("details.ipAddress")}
                                value={item.ipAddress}
                                mono
                                copyable
                              />
                            ) : null}
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
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 min-w-0">
                                {Object.entries(item.metadata).map(([key, value]) => (
                                  <JsonBlock key={key} label={key} data={value} />
                                ))}
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
                onClick={onPrevPage}
                className="h-8 px-2 sm:px-3 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">{t("pagination.prev")}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasMore || loading}
                onClick={onNextPage}
                className="h-8 px-2 sm:px-3 text-xs"
              >
                <span className="hidden sm:inline">{t("pagination.next")}</span>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
              <InfoItem icon={Activity} label={t("details.action")} value={selectedLog.action ? getActionLabel(selectedLog.action) : t("log.unknown")} />
              {selectedLog.targetType ? (
                <InfoItem icon={Box} label={t("details.targetType")} value={selectedLog.targetType} />
              ) : null}
              {selectedLog.targetId ? (
                <InfoItem icon={Hash} label={t("details.targetId")} value={selectedLog.targetId.toString()} mono copyable />
              ) : null}
              <InfoItem icon={Clock} label={t("details.timestamp")} value={selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : "-"} />
              {selectedLog.ipAddress ? (
                <InfoItem icon={Globe} label={t("details.ipAddress")} value={selectedLog.ipAddress} mono copyable />
              ) : null}
              <InfoItem icon={User} label={t("details.userId")} value={selectedLog.userId?.toString() || "-"} mono />
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div className="pt-3 border-t border-border min-w-0 overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("details.metadata")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 min-w-0">
                  {Object.entries(selectedLog.metadata).map(([key, value]) => (
                    <JsonBlock key={key} label={key} data={value} />
                  ))}
                </div>
              </div>
            )}

            <details className="pt-3 border-t border-border min-w-0 overflow-hidden group">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none list-none flex items-center gap-1.5 before:content-['▶'] before:text-[10px] before:transition-transform group-open:before:rotate-90">
                {t("details.rawJson")}
              </summary>
              <div className="mt-2 rounded-md border border-border bg-background overflow-hidden">
                <div className="overflow-x-auto">
                  <pre className="p-2 sm:p-3 text-[10px] sm:text-xs font-mono text-foreground whitespace-pre">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}
