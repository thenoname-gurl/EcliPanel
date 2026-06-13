"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import {
  Trophy,
  Star,
  Loader2,
  TrendingUp,
  TrendingDown,
  MessageCircle,
  Calendar,
  User,
  Server,
  Image,
  Globe,
  GitBranch,
  ChevronDown,
  ChevronUp,
  FileText,
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

function calculateEloResources(eloScore: number, isHackClub = false) {
  const bonus = isHackClub ? 1.2 : 1.0;
  const multiplier = Math.max(0.2, Math.min(12, eloScore / 1000)) * bonus;
  return {
    memory: Math.max(256, Math.min(24576, Math.round(2048 * multiplier))),
    disk: Math.max(2048, Math.min(512000, Math.round(40960 * multiplier))),
    cpu: Math.max(20, Math.min(1200, Math.round(100 * multiplier))),
  };
}

export default function PublicEloProjectProfile() {
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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        ) : !project ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
            <Star className="h-12 w-12 text-zinc-600" />
            <p className="text-lg font-semibold text-zinc-300">Project not found</p>
            <p className="text-sm text-zinc-500">This ELO project doesn't exist or has been removed.</p>
            <Link href="/">
              <Button variant="outline" className="border-zinc-700 text-zinc-300">Back to Home</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-white">{project.title}</h1>
                    <EloBadge score={project.eloScore} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-sm text-zinc-400 flex-wrap">
                    <Link
                      href={`/elo/users/${project.userId}`}
                      className="flex items-center gap-1 hover:text-violet-400 transition-colors"
                    >
                      <User className="h-3.5 w-3.5" />
                      {project.ownerName}
                    </Link>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    {project.tags?.length > 0 && project.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {project.githubUrl && (
                    <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300">
                        <GitBranch className="h-4 w-4 mr-1.5" />
                        GitHub
                      </Button>
                    </a>
                  )}
                  {project.demoUrl && (
                    project.demoUrl.startsWith("http") ? (
                      <a href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white">
                          <Globe className="h-4 w-4 mr-1.5" />
                          Live Demo
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" className="bg-violet-600/50 text-violet-300 cursor-default" asChild>
                        <span>
                          <Globe className="h-4 w-4 mr-1.5" />
                          {project.demoUrl}
                        </span>
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            {project.description && (
              <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">About</h2>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className="text-sm text-zinc-400 leading-relaxed prose prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-zinc-200 prose-a:text-violet-400"
                >
                  {project.description}
                </ReactMarkdown>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatBox icon={Trophy} label="ELO Score" value={project.eloScore} />
              <StatBox icon={TrendingUp} label="Wins" value={project.wins} />
              <StatBox icon={TrendingDown} label="Losses" value={project.losses} />
              <StatBox icon={MessageCircle} label="Total Votes" value={project.totalVotes} />
            </div>

            {/* Resources */}
            {resources && (
              <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Allocated Resources</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-white/5 bg-white/[0.02] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Memory</p>
                    <p className="text-lg font-bold text-white mt-1">{(resources.memory / 1024).toFixed(1)} GB</p>
                  </div>
                  <div className="border border-white/5 bg-white/[0.02] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Disk</p>
                    <p className="text-lg font-bold text-white mt-1">{(resources.disk / 1024).toFixed(0)} GB</p>
                  </div>
                  <div className="border border-white/5 bg-white/[0.02] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">CPU</p>
                    <p className="text-lg font-bold text-white mt-1">{resources.cpu}%</p>
                  </div>
                </div>
              </div>
            )}

            {/* Screenshots */}
            {project.screenshots?.length > 0 && (
              <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Screenshots</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {project.screenshots.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block border border-white/10 bg-white/[0.05] overflow-hidden hover:border-violet-500/30 transition-colors">
                      <img src={url} alt={`Screenshot ${i + 1}`} className="w-full h-40 object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* README */}
            {project.readme && (
              <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">README</h2>
                <div className="max-h-96 overflow-y-auto">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="text-sm text-zinc-500 prose prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-zinc-200 prose-a:text-violet-400 prose-code:text-zinc-400 prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10"
                  >
                    {project.readme}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Devlogs */}
            {project.devlogs?.length > 0 && (
              <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
                  Devlogs ({project.devlogs.length})
                </h2>
                <div className="space-y-2">
                  {project.devlogs.map((dl: any) => (
                    <div key={dl.id}>
                      <button
                        onClick={() => setExpandedDevlog(expandedDevlog === dl.id ? null : dl.id)}
                        className="w-full flex items-center justify-between border border-white/5 bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200 truncate">{dl.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {new Date(dl.publishedAt).toLocaleDateString()}
                          </p>
                        </div>
                        {expandedDevlog === dl.id ? (
                          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                        )}
                      </button>
                      {expandedDevlog === dl.id && (
                        <div className="border border-white/5 border-t-0 bg-white/[0.01] px-4 py-3 space-y-3">
                          {dl.images?.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto">
                              {dl.images.map((img: string, i: number) => (
                                <img key={i} src={img} alt="" className="h-24 w-auto object-cover border border-white/10" />
                              ))}
                            </div>
                          )}
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            className="text-sm text-zinc-500 prose prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-zinc-200 prose-a:text-violet-400"
                          >
                            {dl.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vote History */}
            <div className="border border-white/10 bg-white/[0.03] p-6 mb-6">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
                Vote History ({project.totalVotes})
              </h2>
              {votesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                </div>
              ) : votes.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">No votes yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {votes.map((v: any) => (
                    <div key={v.id}>
                      <div className="flex items-center justify-between border border-white/5 bg-white/[0.02] px-4 py-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
                        onClick={() => setExpandedFeedback(expandedFeedback === v.id ? null : v.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`h-2 w-2 shrink-0 ${v.won ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                          <span className="text-sm text-zinc-300 truncate">
                            vs.{' '}
                            <Link href={`/elo/projects/${v.opponentId}`} className="text-zinc-500 hover:text-violet-400 transition-colors">
                              {v.opponentTitle}
                            </Link>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            by {v.voterName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-mono tabular-nums ${v.won ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {v.eloDelta > 0 ? '+' : ''}{Math.round(v.eloDelta)}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {v.feedback && expandedFeedback === v.id && (
                        <div className="border border-white/5 border-t-0 bg-white/[0.01] px-4 py-3">
                          <p className="text-xs text-zinc-500 italic leading-relaxed">&ldquo;{v.feedback}&rdquo;</p>
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
                    className="text-xs px-3 py-1.5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-[10px] text-zinc-600">Page {votesPage} of {votesTotalPages}</span>
                  <button
                    disabled={votesPage >= votesTotalPages}
                    onClick={() => setVotesPage(p => p + 1)}
                    className="text-xs px-3 py-1.5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Back link */}
            <div className="flex justify-center pb-4">
              <Link href="/">
                <Button variant="outline" className="border-zinc-700 text-zinc-300">Back to Home</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
