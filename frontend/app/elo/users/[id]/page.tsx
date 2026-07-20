"use client"

import { calculateEloResources } from "@/lib/elo-resources"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import {
  Trophy,
  Star,
  Loader2,
  TrendingUp,
  TrendingDown,
  Vote,
  MessageCircle,
  Calendar,
  ExternalLink,
  Globe,
  GitBranch,
  FileText,
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


export default function EloUserProfile() {
  const t = useTranslations("eloPage")
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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
            <Star className="h-12 w-12 text-zinc-600" />
            <p className="text-lg font-semibold text-zinc-300">{t("eloPage.profile.notFound")}</p>
            <p className="text-sm text-zinc-500">{t("eloPage.profile.notFoundDescription")}</p>
            <Link href="/">
              <Button variant="outline" className="border-zinc-700 text-zinc-300">{t("eloPage.profile.backToDashboard")}</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* User Header */}
            <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center overflow-hidden ring-2 ring-white/10">
                  {data.user.avatarUrl ? (
                    <img src={data.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-zinc-500">
                      {data.user.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-white">{data.user.displayName}</h1>
                  <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {t("eloPage.profile.joined", { date: new Date(data.user.createdAt).toLocaleDateString() })}
                    </span>
                    {data.user.studentVerified && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                        {t("eloPage.profile.hackClub")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatBox icon={Trophy} label={t("eloPage.profile.projectsStat")} value={data.stats.totalProjects} />
              <StatBox icon={Vote} label={t("eloPage.profile.votesCast")} value={data.stats.totalVotesCast} />
              <StatBox icon={TrendingUp} label={t("eloPage.profile.highestElo")} value={data.stats.highestElo} />
              <StatBox icon={MessageCircle} label={t("eloPage.profile.feedback")} value={data.stats.totalFeedbacks} />
            </div>

            {/* Projects */}
            {data.projects.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
                  {t("eloPage.profile.projectsCountTitle", { count: data.projects.length })}
                </h2>
                <div className="space-y-3">
                  {data.projects.map((p: any) => {
                    const res = calculateEloResources(p.eloScore, data.user.studentVerified)
                    return (
                      <Link
                        key={p.id}
                        href={`/elo/projects/${p.id}`}
                        className="block border border-white/10 bg-white/[0.03] p-4 hover:border-violet-500/30 hover:bg-white/[0.06] transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white">{p.title}</span>
                              <EloBadge score={p.eloScore} />
                            </div>
                            {p.description && (
                              <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{p.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
                              <span>{t("eloPage.profile.votesCount", { count: p.totalVotes })}</span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                                {t("eloPage.profile.wins", { count: p.wins })}
                              </span>
                              <span className="flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-red-500" />
                                {t("eloPage.profile.losses", { count: p.losses })}
                              </span>
                              <span>{t("eloPage.profile.resources", { cpu: res.cpu, memory: (res.memory / 1024).toFixed(1) })}</span>
                              {p.demoUrl && <span className="text-violet-400">{t("eloPage.profile.hasDemo")}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                              {p.demoUrl && (
                                p.demoUrl.startsWith("http") ? (
                                  <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                    <Globe className="h-4 w-4 text-violet-400 hover:text-violet-300" />
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-violet-400" title={p.demoUrl}>
                                    {t("eloPage.profile.ip")}
                                  </span>
                                )
                              )}
                            {p.githubUrl && (
                              <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                <GitBranch className="h-4 w-4 text-zinc-400 hover:text-zinc-300" />
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
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
                  {t("eloPage.profile.recentDevlogs", { count: data.devlogs.length })}
                </h2>
                <div className="space-y-2">
                  {data.devlogs.map((dl: any) => (
                    <div key={dl.id} className="border border-white/10 bg-white/[0.03] px-4 py-3">
                      <p className="text-sm text-white">{dl.title}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {t("eloPage.profile.projectNumber", { id: dl.projectId })} &middot; {new Date(dl.publishedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.projects.length === 0 && data.devlogs?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Star className="h-10 w-10 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500">{t("eloPage.profile.noProjects")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatBox({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="text-xl font-bold text-white mt-1 tabular-nums">{value}</p>
        </div>
        <Icon className="h-4 w-4 text-violet-400" />
      </div>
    </div>
  )
}
