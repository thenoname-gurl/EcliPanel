"use client"

import { useEffect, useState } from "react"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Trophy, Loader2, ArrowLeft, Star } from "lucide-react"
import Link from "next/link"

function RankBadge({ rank }: { rank: number }) {
  let cls = "text-sm font-bold tabular-nums"
  if (rank === 1) cls += " text-amber-400"
  else if (rank === 2) cls += " text-zinc-400"
  else if (rank === 3) cls += " text-amber-700"
  else cls += " text-muted-foreground"
  return <span className={cls}>#{rank}</span>
}

export default function EloLeaderboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.eloLeaderboard + "?per=50")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <RolloutGuard rolloutKey="elo_rating" fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-md">
          <Trophy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Leaderboard — Coming Soon</h2>
          <p className="text-sm text-muted-foreground">
            Rankings are being rolled out gradually.
          </p>
        </div>
      </div>
    }>
      <PanelHeader
        title="ELO Leaderboard"
        description="Top-ranked projects by community voting"
      />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          <Link
            href="/dashboard/elo"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to ELO Dashboard
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !data?.leaderboard?.length ? (
            <section className="border border-border/50 bg-card shadow-sm p-6 sm:p-8 text-center">
              <div className="flex flex-col items-center justify-center py-16 text-center px-6 gap-3">
                <div className="h-14 w-14 bg-secondary/50 flex items-center justify-center">
                  <Trophy className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">No ranked projects yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Start voting to create rankings!
                  </p>
                </div>
                <Link
                  href="/dashboard/elo/vote"
                  className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
                >
                  <Star className="h-4 w-4" />
                  Vote Now
                </Link>
              </div>
            </section>
          ) : (
            <section className="border border-border/50 bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-5 py-3 text-left font-medium">#</th>
                      <th className="px-5 py-3 text-left font-medium">Project</th>
                      <th className="px-5 py-3 text-right font-medium">ELO</th>
                      <th className="px-5 py-3 text-right font-medium">Votes</th>
                      <th className="px-5 py-3 text-right font-medium">W/L</th>
                      <th className="px-5 py-3 text-right font-medium">Win%</th>
                      <th className="px-5 py-3 text-right font-medium">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaderboard.map((entry: any) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${
                          entry.rank <= 3 ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center">
                            <RankBadge rank={entry.rank} />
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/elo/projects/${entry.id}`}
                              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {entry.title}
                            </Link>
                            {entry.githubUrl && (
                              <a
                                href={entry.githubUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title="GitHub repository"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-sm font-semibold text-foreground tabular-nums">{entry.eloScore}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">
                          {entry.totalVotes}
                        </td>
                        <td className="px-5 py-3 text-right text-xs tabular-nums">
                          <span className="text-emerald-500">{entry.wins}</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-red-500">{entry.losses}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground tabular-nums">
                          {entry.winRate}%
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-muted-foreground truncate max-w-[160px]">
                          {entry.ownerName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </RolloutGuard>
  )
}
