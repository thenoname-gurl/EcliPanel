"use client"

import { useEffect, useState, useCallback } from "react"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import {
  Trophy,
  Loader2,
  Check,
  ArrowLeft,
  AlertCircle,
  Vote,
  Flag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MessageCircle,
  FileText,
} from "lucide-react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

function ScreenshotGallery({ urls }: { urls?: string[] | null }) {
  if (!urls?.length) return null
  const [selected, setSelected] = useState(0)
  return (
    <div className="space-y-2">
      <div className="aspect-video overflow-hidden border border-border/30 bg-secondary/20">
        {urls[selected] ? (
          <img
            src={urls[selected]}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
      {urls.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`shrink-0 w-14 h-10 overflow-hidden border transition-colors ${
                i === selected ? "border-primary" : "border-border/30 opacity-60 hover:opacity-100"
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EloVotePage() {
  const [pair, setPair] = useState<{ projectA: any; projectB: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [voted, setVoted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<{ id: number; name: string } | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [reporting, setReporting] = useState(false)
  const [expandedReadme, setExpandedReadme] = useState<number | null>(null)
  const [expandedProjectDevlogs, setExpandedProjectDevlogs] = useState<number | null>(null)
  const [expandedDevlogContent, setExpandedDevlogContent] = useState<number | null>(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [skipCount, setSkipCount] = useState(0)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem("elo_vote_guide_seen")
    if (!seen) setShowGuide(true)
  }, [])

  const fetchPair = useCallback(async () => {
    setLoading(true)
    setError(null)
    setVoted(false)
    setFeedbackText("")
    try {
      const data = await apiFetch(API_ENDPOINTS.eloVoteNext)
      if (data?.projectA && data?.projectB) {
        setPair(data)
      } else {
        setError("Not enough projects to vote on yet.")
        setPair(null)
      }
    } catch (e: any) {
      setError(e.message || "Failed to load voting pair")
      setPair(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPair()
  }, [fetchPair])

  const handleVote = async (winnerId: number) => {
    if (!pair || voting) return
    const fb = feedbackText.trim()
    if (!fb) {
      toast({ title: "Error", description: "Please write your feedback before voting.", variant: "destructive" })
      return
    }
    const words = fb.split(/\s+/).length
    if (words < 20) {
      toast({ title: "Error", description: `Feedback must be at least 20 words (got ${words}).`, variant: "destructive" })
      return
    }
    setVoting(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.eloVote, {
        method: "POST",
        body: JSON.stringify({
          projectAId: pair.projectA.id,
          projectBId: pair.projectB.id,
          winnerId,
          feedback: fb,
        }),
      })
      setVoted(true)
      const delta = res?.delta?.winner
      const deltaStr = delta != null
        ? (delta > 0 ? `+${delta}` : `${delta}`)
        : ''
      const hackClubBonus = res?.weightedByHackClub ? ' (+10% Hack Club bonus)' : ''
      toast({
        title: "Vote submitted!",
        description: `ELO change: ${deltaStr}${hackClubBonus}`,
      })
    } catch (e: any) {
      toast({
        title: "Vote failed",
        description: e.message,
        variant: "destructive",
      })
    } finally {
      setVoting(false)
    }
  }

  const handleSkip = () => {
    const newCount = skipCount + 1
    setSkipCount(newCount)
    if (newCount >= 5) {
      toast({
        title: "Heads up",
        description: "You've skipped several pairs. Try to vote on the next one!",
        variant: "destructive",
      })
    }
    fetchPair()
  }

  const handleDismissGuide = () => {
    localStorage.setItem("elo_vote_guide_seen", "true")
    setShowGuide(false)
  }

  const handleReport = async () => {
    if (!reportTarget || reportReason.trim().length < 10) {
      toast({ title: "Error", description: "Reason must be at least 10 characters.", variant: "destructive" })
      return
    }
    setReporting(true)
    try {
      await apiFetch("/api/elo/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType: "project",
          targetId: reportTarget.id,
          reason: reportReason.trim(),
        }),
      })
      toast({ title: "Report submitted", description: "An admin will review your report." })
      setReportTarget(null)
      setReportReason("")
    } catch (e: any) {
      toast({ title: "Failed to submit report", description: e.message, variant: "destructive" })
    } finally {
      setReporting(false)
    }
  }

  return (
    <RolloutGuard rolloutKey="elo_rating" fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-md">
          <Vote className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Voting — Coming Soon</h2>
          <p className="text-sm text-muted-foreground">
            Community voting is being rolled out gradually.
          </p>
        </div>
      </div>
    }>
      <PanelHeader
        title="ELO Voting"
        description="Compare two projects and vote for the better one"
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
          ) : error ? (
            <section className="border border-destructive/30 bg-destructive/10 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
              <p className="text-sm text-foreground mb-4">{error}</p>
              <button
                onClick={fetchPair}
                className="inline-flex items-center justify-center gap-2 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95 transition-all"
              >
                Try Again
              </button>
            </section>
          ) : pair && !voted ? (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-sm font-semibold text-foreground mb-1">Which project is better?</h3>
                <p className="text-xs text-muted-foreground">
                  Review each project below, then pick the winner
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[pair.projectA, pair.projectB].map((project, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col border border-border/50 bg-card shadow-sm overflow-hidden"
                  >
                    {project.screenshots?.length > 0 && (
                      <ScreenshotGallery urls={project.screenshots} />
                    )}

                    <div className="p-4 sm:p-5 flex-1 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/dashboard/elo/projects/${project.id}`}
                            className="text-base font-semibold text-foreground hover:text-primary transition-colors"
                          >
                            {project.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {project.githubUrl && (
                              <a
                                href={project.githubUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                                GitHub
                              </a>
                            )}
                            {project.demoUrl && (
                              project.demoUrl.startsWith("http") ? (
                                <a
                                  href={project.demoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Demo
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  Server IP: {project.demoUrl}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {project.description && (
                        <div className="border-t border-border/30 pt-3">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            className="text-xs text-muted-foreground leading-relaxed prose prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-foreground prose-a:text-primary"
                          >
                            {project.description}
                          </ReactMarkdown>
                        </div>
                      )}

                      {project.readme && (
                        <div className="border-t border-border/30 pt-2">
                          <button
                            onClick={() => setExpandedReadme(expandedReadme === project.id ? null : project.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expandedReadme === project.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            README
                          </button>
                          {expandedReadme === project.id && (
                            <div className="mt-2 max-h-48 overflow-y-auto border border-border/30 bg-secondary/20 p-3">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                className="text-xs text-muted-foreground prose prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-headings:text-foreground prose-a:text-primary"
                              >
                                {project.readme}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      )}

                      {project.devlogs?.length > 0 && (
                        <div className="border-t border-border/30 pt-2">
                          <button
                            onClick={() => setExpandedProjectDevlogs(expandedProjectDevlogs === project.id ? null : project.id)}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expandedProjectDevlogs === project.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            Devlogs ({project.devlogs.length})
                          </button>
                          {expandedProjectDevlogs === project.id && (
                            <div className="mt-2 space-y-2">
                              {project.devlogs.map((dl: any) => (
                                <div key={dl.id} className="border border-border/20 bg-secondary/10">
                                  <button
                                    onClick={() => setExpandedDevlogContent(expandedDevlogContent === dl.id ? null : dl.id)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/20 transition-colors"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[11px] font-medium text-foreground truncate">{dl.title}</p>
                                      <p className="text-[9px] text-muted-foreground">{new Date(dl.publishedAt).toLocaleDateString()}</p>
                                    </div>
                                    {expandedDevlogContent === dl.id ? (
                                      <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                    )}
                                  </button>
                                  {expandedDevlogContent === dl.id && (
                                    <div className="px-3 pb-3 pt-1 space-y-2">
                                      {dl.images?.length > 0 && (
                                        <div className="flex gap-2 overflow-x-auto">
                                          {dl.images.map((img: string, i: number) => (
                                            <img key={i} src={img} alt="" className="h-20 w-auto object-cover border border-border/20" />
                                          ))}
                                        </div>
                                      )}
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        className="text-[11px] text-muted-foreground prose prose-invert max-w-none prose-p:my-0.5 prose-headings:my-1 prose-a:text-primary"
                                      >
                                        {dl.content}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="border-t border-border/30 pt-3 mt-auto">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Owner</span>
                          <Link
                            href={`/dashboard/elo/users/${project.userId}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {project.ownerName}
                          </Link>
                        </div>
                        {project.eloScore >= 1150 && (
                          <div className="flex gap-1.5 mt-2 flex-wrap justify-center">
                            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">High Ranked</Badge>
                            {project.totalVotes >= 10 && (
                              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">Veteran</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border/30 p-3 sm:p-4 flex flex-col gap-2">
                      <Button
                        onClick={() => handleVote(project.id)}
                        disabled={voting}
                        className="w-full"
                      >
                        {voting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Pick This Project
                      </Button>
                      <button
                        onClick={() => setReportTarget({ id: project.id, name: project.title })}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        <Flag className="h-3 w-3" />
                        Report this project
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="max-w-xl mx-auto w-full space-y-2">
                <label className="text-xs text-muted-foreground text-center block">
                  Your feedback <span className="text-destructive">*</span> (at least 20 words)
                </label>
                <Textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What do you think about these projects? Compare them, mention what's good or what could be improved..."
                  className="min-h-[80px] text-sm"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {feedbackText.trim() ? `${feedbackText.trim().split(/\s+/).length} words` : "0 words"}
                </p>
              </div>

              <div className="border border-border/50 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground text-center flex flex-col sm:flex-row items-center justify-center gap-3">
                <p className="flex-1">Beating a higher-ranked project gives a bigger ELO boost. Max 20 votes/day.</p>
                <button
                  onClick={handleSkip}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[11px] font-medium"
                  title="Get a different pair"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Skip this pair
                </button>
              </div>
            </div>
          ) : voted ? (
            <section className="border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 bg-emerald-500/10 flex items-center justify-center">
                  <Check className="h-7 w-7 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Vote Submitted!</h3>
                  <p className="text-sm text-muted-foreground mt-1">ELO ratings have been updated.</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button onClick={fetchPair}>
                  Next Pair
                </Button>
                <Link
                  href="/dashboard/elo"
                  className="inline-flex items-center justify-center gap-2 border border-border/50 bg-secondary/50 px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-all active:scale-95"
                >
                  Back to Dashboard
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      <Dialog open={reportTarget !== null} onOpenChange={(open) => { if (!open) { setReportTarget(null); setReportReason("") } }}>
        <DialogContent className="border-border bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              Report Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Reporting <strong className="text-foreground">{reportTarget?.name}</strong>. Describe why this project violates the rules.
            </p>
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Explain why this project should be reviewed... (min. 10 characters)"
              className="min-h-[100px]"
            />
            <p className="text-[10px] text-muted-foreground">{reportReason.length}/10 characters minimum</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReportTarget(null); setReportReason("") }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReport}
              disabled={reporting || reportReason.trim().length < 10}
            >
              {reporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGuide} onOpenChange={(open) => { if (!open) handleDismissGuide() }}>
        <DialogContent className="border-border bg-card max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Vote className="h-5 w-5 text-primary" />
              How ELO Voting Works
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4 text-sm">
            <div className="space-y-2">
              <p className="text-foreground font-medium">Review & Compare</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Each round shows two projects side by side. Look at their screenshots, read their descriptions and READMEs, and check out their GitHub repos and demo links before deciding.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-medium">Pick the Winner</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Click <strong>"Pick This Project"</strong> on the one you believe is better. The winner gains ELO points; the loser loses some. Beating a higher-ranked project gives a bigger boost.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-medium">Skip if Unsure</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Can't decide? Use the <strong>"Skip this pair"</strong> button to get a fresh matchup with no penalty.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-medium">Rules</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li><strong>20 votes/day</strong> — daily limit resets at midnight UTC</li>
                <li>Account must be at least <strong>7 days old</strong> to vote</li>
                <li>You cannot vote on your <strong>own project</strong></li>
                <li>Be fair and review projects thoroughly before voting</li>
              </ul>
            </div>
            <div className="bg-secondary/30 border border-border/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Tip</p>
              <p>Voting frequently helps the community surface the best projects. The more votes you cast, the more accurate the rankings become!</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleDismissGuide} className="w-full">
              Got it — let's vote!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RolloutGuard>
  )
}
