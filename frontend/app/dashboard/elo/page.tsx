"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { SectionHeader } from "@/components/panel/shared"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Star,
  Trophy,
  Vote,
  FileText,
  TrendingUp,
  TrendingDown,
  Loader2,
  Plus,
  ArrowRight,
  Cpu,
  MemoryStick,
  HardDrive,
  Zap,
  Edit,
  ChevronDown,
  ChevronUp,
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

function StatCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden border border-border/50 bg-card p-4 sm:p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)]">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="text-2xl font-bold text-foreground tabular-nums">{children}</div>
        </div>
        <div className="bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary/20">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
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

function EloProgression({ eloScore, isHackClub, averageElo }: { eloScore: number; isHackClub?: boolean; averageElo?: number }) {
  const current = calculateEloResources(eloScore, isHackClub);
  const atPlus100 = calculateEloResources(eloScore + 100, isHackClub);
  const atPlus250 = calculateEloResources(eloScore + 250, isHackClub);
  const atPlus500 = calculateEloResources(eloScore + 500, isHackClub);
  const maxScore = 12000;
  const minScore = 200;
  const normalized = Math.max(0, Math.min(1, (eloScore - minScore) / (maxScore - minScore)));
  const avgNormalized = averageElo ? Math.max(0, Math.min(1, (averageElo - minScore) / (maxScore - minScore))) : 0;
  const avgPct = Math.pow(avgNormalized, 1/4) * 100;
  const pct = Math.pow(normalized, 1/4) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            ELO Progression
          </p>
          <div className="relative h-3 bg-secondary/30 border border-border/50 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/40 via-primary to-primary/40 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
            {averageElo && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/40 z-20"
                style={{ left: `calc(${avgPct}% - 0.5px)` }}
                title={`Average: ${averageElo} ELO`}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-muted-foreground/40" />
                </div>
              </div>
            )}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground transition-all duration-700 z-10"
              style={{ left: `calc(${pct}% - 1px)` }}
            >
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 bg-foreground" />
            </div>
          </div>
          <div className="relative mt-1 h-4">
            <span className="absolute left-0 text-[10px] text-muted-foreground">200 ELO</span>
            {averageElo && (
              <span
                className="absolute text-[9px] text-muted-foreground/60 -translate-x-1/2"
                style={{ left: `${avgPct}%` }}
              >
                avg
              </span>
            )}
            <span
              className="absolute text-[10px] font-semibold text-foreground -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {eloScore} ELO
            </span>
            <span className="absolute right-0 text-[10px] text-muted-foreground">12,000 ELO</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="border border-border/50 bg-secondary/20 p-3">
          <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Current Resources
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3" /> CPU
              </p>
              <p className="text-sm font-semibold text-foreground">{current.cpu}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MemoryStick className="h-3 w-3" /> RAM
              </p>
              <p className="text-sm font-semibold text-foreground">
                {current.memory >= 1024
                  ? `${(current.memory / 1024).toFixed(1)} GB`
                  : `${current.memory} MB`}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> Disk
              </p>
              <p className="text-sm font-semibold text-foreground">
                {current.disk >= 1024
                  ? `${(current.disk / 1024).toFixed(1)} GB`
                  : `${current.disk} MB`}
              </p>
            </div>
          </div>
        </div>

        <div className="border border-border/50 bg-secondary/20 p-3">
          <p className="text-xs font-medium text-foreground mb-2">Preview at higher ELO</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">+100 ELO</p>
              <p className="font-semibold text-foreground mt-0.5">
                {(atPlus100.memory / 1024).toFixed(1)} GB &middot; {(atPlus100.disk / 1024).toFixed(0)} GB
              </p>
            </div>
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">+250 ELO</p>
              <p className="font-semibold text-foreground mt-0.5">
                {(atPlus250.memory / 1024).toFixed(1)} GB &middot; {(atPlus250.disk / 1024).toFixed(0)} GB
              </p>
            </div>
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">+500 ELO</p>
              <p className="font-semibold text-foreground mt-0.5">
                {(atPlus500.memory / 1024).toFixed(1)} GB &middot; {(atPlus500.disk / 1024).toFixed(0)} GB
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EloDashboard() {
  const searchParams = useSearchParams()
  const [myProjects, setMyProjects] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingProject, setEditingProject] = useState<any | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editGitHub, setEditGitHub] = useState("")
  const [editDemoUrl, setEditDemoUrl] = useState("")
  const [editReadme, setEditReadme] = useState("")
  const [editScreenshots, setEditScreenshots] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [expandedReadme, setExpandedReadme] = useState<number | null>(null)
  const [eloStats, setEloStats] = useState<{ averageElo: number; medianElo: number; totalProjects: number } | null>(null)
  const [devlogProjectId, setDevlogProjectId] = useState<number | null>(null)
  const [devlogTitle, setDevlogTitle] = useState("")
  const [devlogContent, setDevlogContent] = useState("")
  const [devlogSaving, setDevlogSaving] = useState(false)
  const [devlogImages, setDevlogImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)

  const loadMyProjects = () => {
    setLoading(true)
    Promise.all([
      apiFetch(API_ENDPOINTS.eloMy),
      apiFetch("/api/elo/stats").catch(() => null),
    ]).then(([data, stats]) => {
      setMyProjects(data)
      if (stats) setEloStats(stats)
    }).catch(() => {
      setMyProjects(null)
    }).finally(() => {
      setLoading(false)
    })
  }

  useEffect(() => {
    loadMyProjects()
  }, [])

  const openEdit = (p: any) => {
    setEditingProject(p)
    setEditTitle(p.title || "")
    setEditDesc(p.description || "")
    setEditGitHub(p.githubUrl || "")
    setEditDemoUrl(p.demoUrl || "")
    setEditReadme(p.readme || "")
    setEditScreenshots(p.screenshots?.join("\n") || "")
  }

  const saveEdit = async () => {
    if (!editingProject) return
    setEditSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.eloProjectDetail.replace(":id", String(editingProject.id)), {
        method: "PUT",
        body: JSON.stringify({
          title: editTitle || null,
          description: editDesc || null,
          githubUrl: editGitHub || null,
          demoUrl: editDemoUrl || null,
          readme: editReadme || null,
          screenshots: editScreenshots.trim()
            ? editScreenshots.split("\n").map(s => s.trim()).filter(Boolean)
            : null,
        }),
      })
      setEditingProject(null)
      loadMyProjects()
    } catch {
      // ignore
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => {
    const projectId = searchParams.get("projectId")
    const writeDevlog = searchParams.get("writeDevlog")
    if (projectId && writeDevlog === "true") {
      setDevlogProjectId(Number(projectId))
    }
  }, [searchParams])

  const publishDevlog = async () => {
    if (!devlogProjectId || !devlogTitle.trim() || !devlogContent.trim()) return
    setDevlogSaving(true)
    try {
      const body: any = {
        projectId: devlogProjectId,
        title: devlogTitle.trim(),
        content: devlogContent.trim(),
      }
      if (devlogImages.length > 0) body.images = devlogImages
      await apiFetch(API_ENDPOINTS.eloDevlogCreate, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setDevlogProjectId(null)
      setDevlogTitle("")
      setDevlogContent("")
      setDevlogImages([])
      loadMyProjects()
    } catch {
      // ignore
    } finally {
      setDevlogSaving(false)
    }
  }

  return (
    <RolloutGuard rolloutKey="elo_rating" fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-md">
          <Star className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">ELO Rating — Coming Soon</h2>
          <p className="text-sm text-muted-foreground">
            Community-driven server rankings are being rolled out gradually. Check back soon!
          </p>
        </div>
      </div>
    }>
      <PanelHeader
        title="ELO Dashboard"
        description="Community-driven server rankings with resource scaling"
      />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="border border-border/50 bg-card px-4 py-2.5 flex items-center gap-3">
                  <Star className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Projects</p>
                    <p className="text-sm font-bold text-foreground">{myProjects?.totalProjects ?? 0}/{myProjects?.currentEloSlots ?? 1}</p>
                  </div>
                </div>
                <div className="border border-border/50 bg-card px-4 py-2.5 flex items-center gap-3">
                  <Vote className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Votes Cast</p>
                    <p className="text-sm font-bold text-foreground">{myProjects?.votesCast ?? 0}</p>
                  </div>
                </div>
                <div className="border border-border/50 bg-card px-4 py-2.5 flex items-center gap-3">
                  <Trophy className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Next Slot</p>
                    <p className="text-sm font-bold text-foreground">
                      {myProjects?.votesForNextSlot > 0 ? `${myProjects.votesForNextSlot} votes` : 'Unlocked!'}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <Link
                    href="/dashboard/elo/vote"
                    className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
                  >
                    <Vote className="h-3.5 w-3.5" />
                    Vote Now
                  </Link>
                  <Link
                    href="/dashboard/elo/leaderboard"
                    className="flex items-center gap-2 border border-border/50 bg-secondary/50 px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary transition-all active:scale-95"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Rankings
                  </Link>
                </div>
              </div>

              {(!myProjects?.projects || myProjects.projects.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
                  <div className="h-16 w-16 bg-muted/50 flex items-center justify-center">
                    <Star className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">No ELO projects yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first ELO-enabled server to get started.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/servers"
                    className="inline-flex items-center gap-2 bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    Create Your First ELO Server
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {myProjects.projects.map((project: any) => (
                    <div key={project.id} className="border border-border/50 bg-card overflow-hidden">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/dashboard/servers/${project.serverId}`}
                                className="text-base font-semibold text-foreground hover:text-primary truncate"
                              >
                                {project.title || project.serverName || `Project #${project.id}`}
                              </Link>
                              {project.githubUrl && (
                                <a
                                  href={project.githubUrl}
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
                              <EloBadge score={project.eloScore} />
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${project.serverStatus === 'suspended' ? 'text-destructive border-destructive/30' : 'text-emerald-500 border-emerald-500/30'}`}
                              >
                                {project.serverStatus}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              {project.ownerAvatar && (
                                <img
                                  src={project.ownerAvatar}
                                  alt=""
                                  className="h-5 w-5 rounded-full object-cover border border-border/50"
                                />
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {project.ownerName || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                              <span>{project.totalVotes} votes</span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                                {project.wins}W
                              </span>
                              <span className="flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-red-500" />
                                {project.losses}L
                              </span>
                              <span>{'\u23ED'} {project.skipTokensRemaining}/{project.maxSkipTokens} skips</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                              <span>{project.resources?.cpu ?? '-'}% CPU</span>
                              <span>{project.resources?.memory ?? '-'}MB RAM</span>
                              <span>{project.resources?.disk ? (project.resources.disk / 1024).toFixed(1) : '-'}GB</span>
                            </div>
                            {project.readme && (
                              <>
                                <button
                                  onClick={() => setExpandedReadme(expandedReadme === project.id ? null : project.id)}
                                  className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {expandedReadme === project.id ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                  {expandedReadme === project.id ? "Hide README" : "View README"}
                                </button>
                                {expandedReadme === project.id && (
                                  <div className="mt-2 p-3 border border-border/50 bg-secondary/10 max-h-48 overflow-y-auto">
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                                      {project.readme}
                                    </pre>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col gap-2">
                            <Link
                              href={`/dashboard/elo/projects/${project.id}`}
                              className="border border-primary/30 bg-primary/10 text-primary px-4 py-2 text-xs font-semibold hover:bg-primary/20 transition-all active:scale-95 whitespace-nowrap text-center flex items-center justify-center gap-1.5"
                            >
                              <Trophy className="h-3.5 w-3.5" />
                              Profile
                            </Link>
                            <Link
                              href={`/dashboard/servers/${project.serverId}`}
                              className="border border-border/50 bg-background text-foreground px-4 py-2 text-xs font-semibold hover:bg-muted/60 transition-all active:scale-95 whitespace-nowrap text-center"
                            >
                              Manage Server
                            </Link>
                            <button
                              onClick={() => openEdit(project)}
                              className="border border-border/50 bg-secondary/30 px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/60 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {myProjects?.projects && myProjects.projects.length > 0 && (
                <div className="border border-border/50 bg-card overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-border/50">
                    <h2 className="text-sm font-semibold text-foreground">Resource Scaling</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Resources scale linearly with your project's ELO rating
                    </p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <EloProgression
                      eloScore={Math.max(...myProjects.projects.map((p: any) => p.eloScore))}
                      isHackClub={myProjects.isHackClub}
                      averageElo={eloStats?.averageElo}
                    />
                    <p className="text-[10px] text-muted-foreground mt-3">
                      Hack Club users get +20% bonus resources. Every 20 votes cast unlocks an additional ELO server slot.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Edit Project Dialog */}
      <Dialog open={editingProject !== null} onOpenChange={(open) => { if (!open) setEditingProject(null) }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-lg overflow-hidden max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Project Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">GitHub URL</Label>
              <Input value={editGitHub} onChange={(e) => setEditGitHub(e.target.value)} placeholder="https://github.com/user/repo" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Demo URL / Server IP</Label>
              <Input value={editDemoUrl} onChange={(e) => setEditDemoUrl(e.target.value)} placeholder="https://... or play.example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Screenshots</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {editingProject?.screenshots?.length > 0 && editingProject.screenshots.map((url: string, i: number) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`Screenshot ${i + 1}`} className="h-20 w-auto border border-border/50 object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editingProject.screenshots.filter((_: string, j: number) => j !== i)
                        setEditScreenshots(updated.join("\n"))
                        setEditingProject({ ...editingProject, screenshots: updated })
                      }}
                      className="absolute top-0 right-0 bg-destructive/80 text-destructive-foreground w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const formData = new FormData()
                    formData.append("file", file)
                    try {
                      const res = await apiFetch("/api/elo/screenshots", { method: "POST", body: formData })
                      if (res?.url) {
                        const current = editScreenshots.trim() ? editScreenshots.split("\n").map(s => s.trim()).filter(Boolean) : []
                        current.push(res.url)
                        setEditScreenshots(current.join("\n"))
                        setEditingProject((prev: any) => prev ? { ...prev, screenshots: current } : prev)
                      }
                    } catch {}
                    e.target.value = ""
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:border file:border-border file:bg-secondary/30 file:px-2 file:py-1 file:text-xs file:text-foreground file:cursor-pointer hover:file:bg-secondary/60"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">README (markdown)</Label>
              <Textarea value={editReadme} onChange={(e) => setEditReadme(e.target.value)} className="mt-1 font-mono text-xs" rows={8} placeholder="# My Project&#10;&#10;Describe your project here..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Devlog Dialog */}
      <Dialog open={devlogProjectId !== null} onOpenChange={(open) => { if (!open) { setDevlogProjectId(null); setDevlogTitle(""); setDevlogContent(""); setDevlogImages([]) } }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">Write a Devlog</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={devlogTitle} onChange={(e) => setDevlogTitle(e.target.value)} placeholder="What's new?" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Content (markdown)</Label>
              <div className="flex flex-wrap gap-1 mt-1 mb-1 border border-border bg-secondary/20 p-1">
                {[
                  { label: "B", cmd: "**", hint: "bold" },
                  { label: "I", cmd: "*", hint: "italic" },
                  { label: "H", cmd: "## ", hint: "heading" },
                  { label: "<code>", cmd: "`", hint: "code" },
                  { label: "Link", cmd: "[text](url)", hint: "link" },
                  { label: "Img", cmd: "![alt](url)", hint: "image" },
                  { label: "•", cmd: "- ", hint: "bullet list" },
                  { label: "1.", cmd: "1. ", hint: "numbered list" },
                ].map((btn) => (
                  <button
                    key={btn.hint}
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById("devlog-content") as HTMLTextAreaElement
                      if (!ta) return
                      const start = ta.selectionStart
                      const end = ta.selectionEnd
                      const selected = devlogContent.substring(start, end)
                      const before = devlogContent.substring(0, start)
                      const after = devlogContent.substring(end)
                      let inserted = btn.cmd
                      if (btn.cmd.startsWith("**") || btn.cmd.startsWith("*") || btn.cmd === "`") {
                        inserted = btn.cmd + (selected || "text") + btn.cmd
                      } else if (btn.cmd === "[text](url)") {
                        inserted = `[${selected || "text"}](url)`
                      } else if (btn.cmd === "![alt](url)") {
                        inserted = `![${selected || "alt"}](${devlogImages[0] || "url"})`
                      }
                      setDevlogContent(before + inserted + after)
                      setTimeout(() => {
                        ta.focus()
                        ta.selectionStart = ta.selectionEnd = start + inserted.length
                      }, 0)
                    }}
                    className="px-2 py-1 text-xs font-mono text-foreground hover:bg-secondary/60 transition-colors active:scale-95"
                    title={btn.hint}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <textarea
                id="devlog-content"
                value={devlogContent}
                onChange={(e) => setDevlogContent(e.target.value)}
                className="mt-1 w-full border border-border bg-input px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y min-h-[200px]"
                rows={10}
                placeholder="Describe what you've been working on..."
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Images (up to 3)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {devlogImages.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="h-16 w-auto border border-border/50 object-cover" />
                    <button
                      type="button"
                      onClick={() => setDevlogImages(devlogImages.filter((_, j) => j !== i))}
                      className="absolute top-0 right-0 bg-destructive/80 text-destructive-foreground w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {devlogImages.length < 3 && (
                  <label className="border border-dashed border-border/50 px-3 py-1 text-xs text-muted-foreground cursor-pointer hover:border-primary/30 hover:text-foreground transition-colors flex items-center gap-1">
                    {uploadingImage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add Image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingImage(true)
                        const formData = new FormData()
                        formData.append("file", file)
                        try {
                          const res = await apiFetch("/api/elo/screenshots", { method: "POST", body: formData })
                          if (res?.url) {
                            setDevlogImages([...devlogImages, res.url])
                          }
                        } catch {}
                        setUploadingImage(false)
                        e.target.value = ""
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDevlogProjectId(null); setDevlogTitle(""); setDevlogContent(""); setDevlogImages([]) }}>Cancel</Button>
            <Button onClick={publishDevlog} disabled={devlogSaving || !devlogTitle.trim() || !devlogContent.trim()}>
              {devlogSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RolloutGuard>
  )
}
