"use client"

import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import {
  Server,
  LogIn,
  CreditCard,
  Shield,
  Ticket,
  Cpu,
  Filter,
} from "lucide-react"

const typeIcons: Record<string, typeof Server> = {
  server: Server,
  auth: LogIn,
  login: LogIn,
  logout: LogIn,
  register: LogIn,
  billing: CreditCard,
  security: Shield,
  support: Ticket,
  compute: Cpu,
}

const typeColors: Record<string, string> = {
  server: "text-chart-2",
  auth: "text-primary",
  login: "text-primary",
  logout: "text-muted-foreground",
  register: "text-success",
  billing: "text-success",
  security: "text-warning",
  support: "text-info",
  compute: "text-chart-4",
}

function guessType(action: string): string {
  if (/login|logout|register|passkey/.test(action)) return action.includes("login") ? "login" : action.includes("logout") ? "logout" : "register"
  if (/server|start|stop|restart/.test(action)) return "server"
  if (/billing|payment|invoice|order/.test(action)) return "billing"
  if (/key|2fa|security|password/.test(action)) return "security"
  if (/ticket|support/.test(action)) return "support"
  if (/compute|instance/.test(action)) return "compute"
  return "auth"
}

export default function AccountActivity() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    apiFetch(API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) + "/logs")
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [user])

  const displayLogs = logs.filter((item) => {
    if (!filter) return true
    return guessType(item.action ?? "") === filter
  })

  const filterTypes = ["server", "login", "billing", "security", "support", "compute"]

  return (
    <>
      <PanelHeader title="Account Activity" description="SOC audit trail and account events" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter(null)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                !filter
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              All Events
            </button>
            {filterTypes.map((type) => {
              const Icon = typeIcons[type] ?? Server
              return (
                <button
                  key={type}
                  onClick={() => setFilter(filter === type ? null : type)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    filter === type
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden capitalize sm:inline">{type}</span>
                </button>
              )
            })}
          </div>

          {/* Activity Timeline */}
          <div className="rounded-xl border border-border bg-card p-5">
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading activity…</p>
            ) : displayLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity found.</p>
            ) : (
              <div className="flex flex-col">
                {displayLogs.map((item, idx) => {
                  const type = guessType(item.action ?? "")
                  const Icon = typeIcons[type] ?? Server
                  const iconColor = typeColors[type] ?? "text-primary"

                  return (
                    <div key={item.id} className="flex gap-4">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50">
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                        </div>
                        {idx < displayLogs.length - 1 && (
                          <div className="w-px flex-1 bg-border" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">
                              {item.action ?? "Unknown action"}
                            </p>
                            {item.target && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.target}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-muted-foreground">
                              {item.timestamp
                                ? `${new Date(item.timestamp).toLocaleDateString()} ${new Date(item.timestamp).toLocaleTimeString()}`
                                : ""}
                            </span>
                            {item.ip && (
                              <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-[10px]">
                                IP: {item.ip}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

