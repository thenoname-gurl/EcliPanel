"use client"

import { useTranslations } from "next-intl"
import { calculateEloResources } from "@/lib/elo-resources"
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
  Flame,
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


function EloProgression({ eloScore, isHackClub, averageElo }: { eloScore: number; isHackClub?: boolean; averageElo?: number }) {
  const t = useTranslations("eloPage")
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
            {t("dashboard.eloProgression")}
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
                title={t("dashboard.averageEloTooltip", { elo: averageElo })}
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
            <span className="absolute left-0 text-[10px] text-muted-foreground">{t("dashboard.progressionMin")}</span>
            {averageElo && (
              <span
                className="absolute text-[9px] text-muted-foreground/60 -translate-x-1/2"
                style={{ left: `${avgPct}%` }}
              >
                {t("dashboard.progressionAvg")}
              </span>
            )}
            <span
              className="absolute text-[10px] font-semibold text-foreground -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {eloScore} ELO {/* ELO is a proper noun, kept as-is */}
            </span>
            <span className="absolute right-0 text-[10px] text-muted-foreground">{t("dashboard.progressionMax")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="border border-border/50 bg-secondary/20 p-3">
          <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            {t("dashboard.currentResources")}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3" /> {t("resources.cpu")}
              </p>
              <p className="text-sm font-semibold text-foreground">{current.cpu}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MemoryStick className="h-3 w-3" /> {t("resources.memory")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {current.memory >= 1024
                  ? `${(current.memory / 1024).toFixed(1)} GB`
                  : `${current.memory} MB`}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> {t("resources.disk")}
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
          <p className="text-xs font-medium text-foreground mb-2">{t("dashboard.previewHigherElo")}</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">{t("dashboard.plus100Elo")}</p>
              <p className="font-semibold text-foreground mt-0.5">
                {(atPlus100.memory / 1024).toFixed(1)} GB &middot; {(atPlus100.disk / 1024).toFixed(0)} GB
              </p>
            </div>
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">{t("dashboard.plus250Elo")}</p>
              <p className="font-semibold text-foreground mt-0.5">
                {(atPlus250.memory / 1024).toFixed(1)} GB &middot; {(atPlus250.disk / 1024).toFixed(0)} GB
              </p>
            </div>
            <div className="text-center p-2 border border-border/30">
              <p className="text-muted-foreground">{t("dashboard.plus500Elo")}</p>
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
  const t = useTranslations("eloPage")
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
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("rollout.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("rollout.description")}
          </p>
        </div>
      </div>
    }>
      <PanelHeader
        title={t("title")}
        description={t("description")}
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.projectsLabel")}</p>
                    <p className="text-sm font-bold text-foreground">{myProjects?.totalProjects ?? 0}/{myProjects?.currentEloSlots ?? 1}</p>
                  </div>
                </div>
                <div className="border border-border/50 bg-card px-4 py-2.5 flex items-center gap-3">
                  <Vote className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.votesCastLabel")}</p>
                    <p className="text-sm font-bold text-foreground">{myProjects?.votesCast ?? 0}</p>
                  </div>
                </div>
                <div className="border border-border/50 bg-card px-4 py-2.5 flex items-center gap-3">
                  <Trophy className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.nextSlotLabel")}</p>
                    <p className="text-sm font-bold text-foreground">
                      {myProjects?.votesForNextSlot > 0 ? t("dashboard.votesNeeded", { count: myProjects.votesForNextSlot }) : t("dashboard.unlocked")}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <Link
                    href="/dashboard/elo/vote"
                    className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
                  >
                    <Vote className="h-3.5 w-3.5" />
                    {t("dashboard.voteNow")}
                  </Link>
                  <Link
                    href="/dashboard/elo/leaderboard"
                    className="flex items-center gap-2 border border-border/50 bg-secondary/50 px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary transition-all active:scale-95"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    {t("dashboard.rankings")}
                  </Link>
                </div>
              </div>

              {(!myProjects?.projects || myProjects.projects.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-4">
                  <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center">
                    <Star className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{t("dashboard.noProjects")}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("dashboard.noProjectsDesc")}
                    </p>
                  </div>
                  <Link
                    href="/dashboard/servers"
                    className="inline-flex items-center gap-2 bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    {t("dashboard.createFirstServer")}
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
                                {project.title || project.serverName || t("dashboard.projectFallback", { id: project.id })}
                              </Link>
                              {project.isWellMade && (
                                <span title={t("badges.wellMade")} className="shrink-0"><Flame className="h-4 w-4 text-orange-500" /></span>
                              )}
                              {project.githubUrl && (
                                <a
                                  href={project.githubUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title={t("leaderboard.githubRepo")}
                                 data-telemetry="link:external">
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
                                {project.ownerName || t("dashboard.unknownOwner")}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                              <span>{t("dashboard.votesCount", { count: project.totalVotes })}</span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                                {t("dashboard.winsShort", { count: project.wins })}
                              </span>
                              <span className="flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-red-500" />
                                {t("dashboard.lossesShort", { count: project.losses })}
                              </span>
                              <span>{'⏭'} {t("dashboard.skipsCount", { current: project.skipTokensRemaining, max: project.maxSkipTokens })}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                              <span>{project.resources?.cpu !== undefined ? t("dashboard.cpuPercent", { cpu: project.resources.cpu }) : '-'}</span>
                              <span>{project.resources?.memory !== undefined ? t("dashboard.ramMb", { memory: project.resources.memory }) : '-'}</span>
                              <span>{project.resources?.disk ? t("dashboard.diskGb", { disk: (project.resources.disk / 1024).toFixed(1) }) : '-'}</span>
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
                                  {expandedReadme === project.id ? t("dashboard.hideReadme") : t("dashboard.viewReadme")}
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
                              {t("dashboard.profile")}
                            </Link>
                            <Link
                              href={`/dashboard/servers/${project.serverId}`}
                              className="border border-border/50 bg-background text-foreground px-4 py-2 text-xs font-semibold hover:bg-muted/60 transition-all active:scale-95 whitespace-nowrap text-center"
                            >
                              {t("dashboard.manageServer")}
                            </Link>
                            <button
                              onClick={() => openEdit(project)}
                              className="border border-border/50 bg-secondary/30 px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/60 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              {t("dashboard.edit")}
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
                    <h2 className="text-sm font-semibold text-foreground">{t("dashboard.resourceScaling")}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("dashboard.resourceScalingDesc")}
                    </p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <EloProgression
                      eloScore={Math.max(...myProjects.projects.map((p: any) => p.eloScore))}
                      isHackClub={myProjects.isHackClub}
                      averageElo={eloStats?.averageElo}
                    />
                    <p className="text-[10px] text-muted-foreground mt-3">
                      {t("dashboard.resourceFootnote")}
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
            <DialogTitle className="text-foreground">{t("editProject.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.titleLabel")}</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.descriptionLabel")}</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.githubUrlLabel")}</Label>
              <Input value={editGitHub} onChange={(e) => setEditGitHub(e.target.value)} placeholder={t("editProject.githubUrlPlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.demoUrlLabel")}</Label>
              <Input value={editDemoUrl} onChange={(e) => setEditDemoUrl(e.target.value)} placeholder={t("editProject.demoUrlPlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.screenshotsLabel")}</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {editingProject?.screenshots?.length > 0 && editingProject.screenshots.map((url: string, i: number) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={t("sections.screenshotAlt", { n: i + 1 })} className="h-20 w-auto border border-border/50 object-cover" />
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
              <Label className="text-xs text-muted-foreground">{t("editProject.readmeLabel")}</Label>
              <Textarea value={editReadme} onChange={(e) => setEditReadme(e.target.value)} className="mt-1 font-mono text-xs" rows={8} placeholder={t("editProject.readmePlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(null)}>{t("editProject.cancel")}</Button>
            <Button onClick={saveEdit} disabled={editSaving} data-telemetry="elo:saveedit">
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("editProject.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Devlog Dialog */}
      <Dialog open={devlogProjectId !== null} onOpenChange={(open) => { if (!open) { setDevlogProjectId(null); setDevlogTitle(""); setDevlogContent(""); setDevlogImages([]) } }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("devlog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("editProject.titleLabel")}</Label>
              <Input value={devlogTitle} onChange={(e) => setDevlogTitle(e.target.value)} placeholder={t("devlog.titlePlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("devlog.contentLabel")}</Label>
              <div className="flex flex-wrap gap-1 mt-1 mb-1 border border-border bg-secondary/20 p-1">
                {[
                  { label: "B", cmd: "**", hint: t("devlog.toolbar.bold") },
                  { label: "I", cmd: "*", hint: t("devlog.toolbar.italic") },
                  { label: "H", cmd: "## ", hint: t("devlog.toolbar.heading") },
                  { label: "<code>", cmd: "`", hint: t("devlog.toolbar.code") },
                  { label: "Link", cmd: "[text](url)", hint: t("devlog.toolbar.link") },
                  { label: "Img", cmd: "![alt](url)", hint: t("devlog.toolbar.image") },
                  { label: "•", cmd: "- ", hint: t("devlog.toolbar.bulletList") },
                  { label: "1.", cmd: "1. ", hint: t("devlog.toolbar.numberedList") },
                ].map((btn) => (
                  <button
                    key={btn.cmd}
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
                placeholder={t("devlog.contentPlaceholder")}
               data-telemetry="elo:devlog-content"/>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("devlog.imagesLabel")}</Label>
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
                    {t("devlog.addImage")}
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
            <Button variant="outline" onClick={() => { setDevlogProjectId(null); setDevlogTitle(""); setDevlogContent(""); setDevlogImages([]) }}>{t("devlog.cancel")}</Button>
            <Button onClick={publishDevlog} disabled={devlogSaving || !devlogTitle.trim() || !devlogContent.trim()} data-telemetry="elo:publishdevlog">
              {devlogSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("devlog.publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RolloutGuard>
  )
}
