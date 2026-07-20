"use client"

import { calculateEloResources } from "@/lib/elo-resources"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Trophy,
  Star,
  Loader2,
  TrendingUp,
  TrendingDown,
  Vote,
  MessageCircle,
  Calendar,
  User,
  Globe,
  GitBranch,
} from "lucide-react"
import Link from "next/link"

function EloBadge({ score }: { score: number }) {
  let color = "text-zinc-500"
  let bg = "bg-zinc-500/10 border-zinc-500/30"
  if (score >= 1400) {
    color = "text-amber-400"
    bg = "bg-amber-500/10 border-amber-500/30"
  } else if (score >= 1200) {
    color = "text-emerald-400"
    bg = "bg-emerald-500/10 border-emerald-500/30"
  } else if (score >= 1000) {
    color = "text-blue-400"
    bg = "bg-blue-500/10 border-blue-500/30"
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold border ${bg} ${color}`}>
      <Trophy className="h-3 w-3" />
      {score}
    </span>
  )
}


export default function DashboardEloUserProfile() {
  const params = useParams()
  const userId = params?.id as string
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    apiFetch(`/api/elo/users/${userId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <RolloutGuard rolloutKey="elo_rating" fallback={null}>
      <PanelHeader
        title={data?.user?.displayName || "ELO User Profile"}
        description={data ? `${data.stats.totalProjects} project${data.stats.totalProjects !== 1 ? 's' : ''}` : "Loading..."}
      />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full min-w-0 box-border">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
              <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center">
                <Star className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-base font-semibold text-foreground">User not found</p>
              <p className="text-sm text-muted-foreground">This ELO participant doesn't exist.</p>
              <Link href="/dashboard/elo">
                <Button variant="outline">Back to ELO Dashboard</Button>
              </Link>
            </div>
          ) : (
            <>
              {/* User Header */}
              <div className="border border-border/50 bg-card p-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-border">
                    {data.user.avatarUrl ? (
                      <img src={data.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">
                        {data.user.displayName?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-foreground">{data.user.displayName}</h1>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Joined {new Date(data.user.createdAt).toLocaleDateString()}
                      </span>
                      {data.user.studentVerified && (
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                          Hack Club
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Trophy} label="Projects" value={data.stats.totalProjects} />
                <StatCard icon={Vote} label="Votes Cast" value={data.stats.totalVotesCast} />
                <StatCard icon={TrendingUp} label="Highest ELO" value={data.stats.highestElo} />
                <StatCard icon={MessageCircle} label="Feedback" value={data.stats.totalFeedbacks} />
              </div>

              {/* Projects */}
              {data.projects.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                    Projects ({data.projects.length})
                  </h2>
                  <div className="space-y-3">
                    {data.projects.map((p: any) => {
                      const res = calculateEloResources(p.eloScore, data.user.studentVerified)
                      return (
                        <Link
                          key={p.id}
                          href={`/dashboard/elo/projects/${p.id}`}
                          className="block border border-border/50 bg-card p-4 hover:border-primary/30 hover:bg-accent/20 transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-foreground">{p.title}</span>
                                <EloBadge score={p.eloScore} />
                              </div>
                              {p.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                                <span>{p.totalVotes} votes</span>
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                                  {p.wins}W
                                </span>
                                <span className="flex items-center gap-1">
                                  <TrendingDown className="h-3 w-3 text-red-500" />
                                  {p.losses}L
                                </span>
                                <span>{res.cpu}% CPU / {(res.memory / 1024).toFixed(1)} GB</span>
                                {p.demoUrl && <span className="text-violet-400">Has Demo</span>}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {p.demoUrl && (
                                p.demoUrl.startsWith("http") ? (
                                  <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-telemetry="link:external">
                                    <Globe className="h-4 w-4 text-primary hover:text-primary/80" />
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-primary" title={p.demoUrl}>
                                    IP
                                  </span>
                                )
                              )}
                              {p.githubUrl && (
                                <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-telemetry="link:external">
                                  <GitBranch className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                </a>
                              )}
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Devlogs */}
              {data.devlogs?.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                    Recent Devlogs ({data.devlogs.length})
                  </h2>
                  <div className="space-y-2">
                    {data.devlogs.map((dl: any) => (
                      <div key={dl.id} className="border border-border/50 bg-card px-4 py-3">
                        <p className="text-sm text-foreground">{dl.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Project #{dl.projectId} &middot; {new Date(dl.publishedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.projects.length === 0 && data.devlogs?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Star className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">This user hasn't created any ELO projects yet.</p>
                </div>
              )}

              <div className="flex justify-center pb-4">
                <Link href="/dashboard/elo">
                  <Button variant="outline">Back to ELO Dashboard</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </RolloutGuard>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="border border-border/50 bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
        </div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
    </div>
  )
}
