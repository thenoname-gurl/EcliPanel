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
  Globe,
  FileText,
  TrendingUp,
  TrendingDown,
  Calendar,
  User,
  Server,
  Image,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  GitBranch,
} from "lucide-react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"


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

function StatCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border/50 bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="text-lg font-bold text-foreground tabular-nums">{children}</div>
        </div>
        <div className="bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export default function EloProjectProfile() {
  const params = useParams()
  const id = params?.id as string
  const [project, setProject] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDevlog, setExpandedDevlog] = useState<number | null>(null)
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null)
  const [votes, setVotes] = useState<any[]>([])
  const [votesPage, setVotesPage] = useState(1)
  const [votesTotalPages, setVotesTotalPages] = useState(1)
  const [votesLoading, setVotesLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch(`/api/elo/projects/${id}`)
      .then(data => setProject(data))
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    setVotesLoading(true)
    apiFetch(`/api/elo/projects/${id}/votes?page=${votesPage}&per=10`)
      .then(data => {
        setVotes(data?.votes || [])
        setVotesTotalPages(data?.totalPages || 1)
      })
      .catch(() => setVotes([]))
      .finally(() => setVotesLoading(false))
  }, [id, votesPage])

  const resources = project ? calculateEloResources(project.eloScore) : null

  return (
    <RolloutGuard rolloutKey="elo_rating" fallback={null}>
      <PanelHeader
        title={project?.title || "ELO Project"}
        description={project ? `by ${project.ownerName}` : "Loading..."}
      />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full min-w-0 box-border">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !project ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
              <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center">
                <Star className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-base font-semibold text-foreground">Project not found</p>
              <p className="text-sm text-muted-foreground">This ELO project doesn't exist or has been removed.</p>
              <Link href="/dashboard/elo">
                <Button variant="outline">Back to ELO Dashboard</Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start gap-4 border border-border/50 bg-card p-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
                    <EloBadge score={project.eloScore} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                    <Link
                      href={`/dashboard/elo/users/${project.userId}`}
                      className="flex items-center gap-1 hover:text-violet-400 transition-colors"
                    >
                      <User className="h-3.5 w-3.5" />
                      {project.ownerName}
                    </Link>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    {project.serverId && (
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Server className="h-3 w-3" />
                        {project.serverId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                  {project.tags?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {project.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {project.githubUrl && (
                    <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" data-telemetry="link:external">
                      <Button size="sm" variant="outline">
                        <GitBranch className="h-4 w-4 mr-1.5" />
                        GitHub
                      </Button>
                    </a>
                  )}
                  {project.demoUrl && (
                    project.demoUrl.startsWith("http") ? (
                      <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" data-telemetry="link:external">
                        <Button size="sm">
                          <Globe className="h-4 w-4 mr-1.5" />
                          Live Demo
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" variant="outline" className="cursor-default">
                        <Globe className="h-4 w-4 mr-1.5" />
                        {project.demoUrl}
                      </Button>
                    )
                  )}
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <div className="border border-border/50 bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">About</h2>
                  <div className="text-sm text-muted-foreground leading-relaxed prose max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-foreground prose-a:text-primary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.description}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Trophy} label="ELO Score">{project.eloScore}</StatCard>
                <StatCard icon={TrendingUp} label="Wins">{project.wins}</StatCard>
                <StatCard icon={TrendingDown} label="Losses">{project.losses}</StatCard>
                <StatCard icon={MessageCircle} label="Total Votes">{project.totalVotes}</StatCard>
              </div>

              {/* Resources */}
              {resources && (
                <div className="border border-border/50 bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Allocated Resources</h2>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-border/30 bg-secondary/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Memory</p>
                      <p className="text-lg font-bold text-foreground mt-1">{(resources.memory / 1024).toFixed(1)} GB</p>
                    </div>
                    <div className="border border-border/30 bg-secondary/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disk</p>
                      <p className="text-lg font-bold text-foreground mt-1">{(resources.disk / 1024).toFixed(0)} GB</p>
                    </div>
                    <div className="border border-border/30 bg-secondary/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CPU</p>
                      <p className="text-lg font-bold text-foreground mt-1">{resources.cpu}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Screenshots */}
              {project.screenshots?.length > 0 && (
                <div className="border border-border/50 bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Screenshots</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {project.screenshots.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block border border-border/50 bg-secondary/20 overflow-hidden hover:border-primary/30 transition-colors" data-telemetry="link:external">
                        <img
                          src={url}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full h-40 object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* README */}
              {project.readme && (
                <div className="border border-border/50 bg-card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">README</h2>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <div className="text-sm text-muted-foreground prose max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-foreground prose-a:text-primary prose-code:text-muted-foreground prose-pre:bg-black/40">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.readme}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Devlogs */}
              {project.devlogs?.length > 0 && (
                <div className="border border-border/50 bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                    Devlogs ({project.devlogs.length})
                  </h2>
                  <div className="space-y-2">
                    {project.devlogs.map((dl: any) => (
                      <div key={dl.id} className="border border-border/30 bg-secondary/20">
                        <button
                          onClick={() => setExpandedDevlog(expandedDevlog === dl.id ? null : dl.id)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{dl.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(dl.publishedAt).toLocaleDateString()}
                            </p>
                          </div>
                          {expandedDevlog === dl.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                        {expandedDevlog === dl.id && (
                          <div className="border-t border-border/30 px-4 py-3 space-y-3">
                            {dl.images?.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto">
                                {dl.images.map((img: string, i: number) => (
                                  <img key={i} src={img} alt="" className="h-24 w-auto object-cover border border-border/30" />
                                ))}
                              </div>
                            )}
                            <div className="text-sm text-muted-foreground prose max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-foreground prose-a:text-primary">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{dl.content}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vote History */}
              <div className="border border-border/50 bg-card p-6">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                  Vote History ({project.totalVotes})
                </h2>
                {votesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : votes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No votes yet.</p>
                ) : (
                  <div className="space-y-1.5">
                  {votes.map((v: any) => (
                    <div key={v.id}>
                      <div className="flex items-center justify-between border border-border/30 bg-secondary/20 px-4 py-2.5 cursor-pointer hover:bg-secondary/30 transition-colors"
                        onClick={() => setExpandedFeedback(expandedFeedback === v.id ? null : v.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`h-2 w-2 shrink-0 ${v.won ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                          <span className="text-sm text-foreground truncate">
                            vs.{' '}
                            <Link href={`/dashboard/elo/projects/${v.opponentId}`} className="text-muted-foreground hover:text-primary transition-colors">
                              {v.opponentTitle}
                            </Link>
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            by {v.voterName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-mono tabular-nums ${v.won ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {v.eloDelta > 0 ? '+' : ''}{Math.round(v.eloDelta)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {v.feedback && expandedFeedback === v.id && (
                        <div className="border border-border/30 border-t-0 bg-secondary/10 px-4 py-3">
                          <p className="text-xs text-muted-foreground italic leading-relaxed">&ldquo;{v.feedback}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                )}
                {votesTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      disabled={votesPage <= 1}
                      onClick={() => setVotesPage(p => Math.max(1, p - 1))}
                      className="text-xs px-3 py-1.5 border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-[10px] text-muted-foreground/50">Page {votesPage} of {votesTotalPages}</span>
                    <button
                      disabled={votesPage >= votesTotalPages}
                      onClick={() => setVotesPage(p => p + 1)}
                      className="text-xs px-3 py-1.5 border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Back link */}
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
