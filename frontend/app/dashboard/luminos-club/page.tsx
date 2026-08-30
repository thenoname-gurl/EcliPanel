"use client"

import React, { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PageLayout } from "@/components/panel/shared"
import { PanelHeader } from "@/components/panel/header"
import { RouteSkeleton } from "@/components/ui/route-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { LoadingBar } from "@/components/panel/shared"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { hasPermission } from "@/hooks/useAuth"
import { formatDistanceToNow } from "date-fns"
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Timer,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ListChecks,
  CalendarDays,
  Trash2,
  Plus,
  Gift,
  Trophy,
  Target,
  Bug,
  Coins,
  ExternalLink,
  ChevronDown,
  MessageCircle,
} from "lucide-react"

interface ExamQuestion {
  id: number
  category?: string
  question: string
  options: string[]
  imageUrl?: string
}

interface ExamStatus {
  attemptsUsed: number
  attemptsRemaining: number
  passed: boolean
  membership: boolean
  activeAttempt: { id: number; startedAt: string } | null
  timeLimitMinutes: number
  totalQuestions: number
  passThreshold: number
}

interface ExamResult {
  score: number
  correct: number
  total: number
  passed: boolean
  membership: boolean
}

type View = "intro" | "exam" | "results"

// A thread in the Luminos club chat board.
interface ClubThread {
  id: number
  content: string | null
  displayName?: string | null
  replyCount?: number
  bumpedAt?: string | null
}

// Only render bounty repo links with an http(s) scheme; anything else could be a
// javascript: URL set by the creator (stored XSS for anyone who clicks).
function safeRepoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  return ["http:", "https:"].includes(parsed.protocol) ? url : null
}

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ""
  return formatDistanceToNow(date, { addSuffix: true })
}

function severityBadgeClass(severity: string | null | undefined): string {
  switch (severity) {
    case "critical": return "border-destructive/40 bg-destructive/10 text-destructive"
    case "high": return "border-warning/40 bg-warning/10 text-warning"
    case "medium": return "border-primary/30 bg-primary/10 text-primary"
    default: return "border-border bg-secondary/50 text-muted-foreground"
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "awarded": return "border-success/30 bg-success/10 text-success"
    case "valid": return "border-primary/30 bg-primary/10 text-primary"
    case "triaged": return "border-warning/40 bg-warning/10 text-warning"
    case "invalid": return "border-destructive/30 bg-destructive/10 text-destructive"
    default: return "border-border bg-secondary/50 text-muted-foreground"
  }
}

export default function LuminosClubPage() {
  const t = useTranslations("luminosClub")
  const { user, refreshUser } = useAuth()
  const { toast } = useToast()

  const [view, setView] = useState<View>("intro")
  const [status, setStatus] = useState<ExamStatus | null>(null)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showStartConfirm, setShowStartConfirm] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Club events
  interface ClubEvent {
    id: number
    title: string
    description: string | null
    startsAt: string
    createdById: number
    rsvpCount?: number
    rsvped?: boolean
  }
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventTitle, setEventTitle] = useState("")
  const [eventDescription, setEventDescription] = useState("")
  const [eventStartsAt, setEventStartsAt] = useState("")
  const [savingEvent, setSavingEvent] = useState(false)

  // Giveaways
  interface Giveaway {
    id: number
    title: string
    description: string | null
    prize: string | null
    startsAt: string
    endsAt: string
    winnerId: number | null
    winnerName?: string | null
    entryCount?: number
    entered?: boolean
  }
  const [giveaways, setGiveaways] = useState<Giveaway[]>([])
  const [giveawaysLoading, setGiveawaysLoading] = useState(false)
  const [showGiveawayForm, setShowGiveawayForm] = useState(false)
  const [giveawayTitle, setGiveawayTitle] = useState("")
  const [giveawayDescription, setGiveawayDescription] = useState("")
  const [giveawayPrize, setGiveawayPrize] = useState("")
  const [giveawayEndsAt, setGiveawayEndsAt] = useState("")
  const [savingGiveaway, setSavingGiveaway] = useState(false)

  // Contests
  interface ContestSubmission {
    id: number
    contestId: number
    userId: number
    content: string
    imageUrl: string | null
    displayName?: string
  }
  interface Contest {
    id: number
    title: string
    description: string | null
    endsAt: string
    winnerId: number | null
    winnerName?: string | null
    submissionCount?: number
    submissions?: ContestSubmission[]
    mySubmission?: ContestSubmission | null
  }
  const [contests, setContests] = useState<Contest[]>([])
  const [contestsLoading, setContestsLoading] = useState(false)
  const [showContestForm, setShowContestForm] = useState(false)
  const [contestTitle, setContestTitle] = useState("")
  const [contestDescription, setContestDescription] = useState("")
  const [contestEndsAt, setContestEndsAt] = useState("")
  const [savingContest, setSavingContest] = useState(false)
  const [submittingContest, setSubmittingContest] = useState<number | null>(null)
  const [submissionText, setSubmissionText] = useState<Record<string, string>>({})
  const [submissionImage, setSubmissionImage] = useState<Record<string, string>>({})

  // Daily challenge
  interface DailyData {
    day: string
    totalQuestions: number
    questions: ExamQuestion[]
    submitted: { score: number; correct: number; total: number } | null
    leaderboard: { rank: number; score: number; correct: number; name: string }[]
  }
  const [daily, setDaily] = useState<DailyData | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyAnswers, setDailyAnswers] = useState<Record<string, number>>({})
  const [submittingDaily, setSubmittingDaily] = useState(false)

  // Bounties
  interface BountyComment {
    id: number
    userId: number
    content: string
    displayName?: string
    createdAt?: string
  }
  interface BountyFinding {
    id: number
    bountyId: number
    userId: number
    title: string
    content: string
    status: string
    severity?: string | null
    vulnType?: string | null
    affectedAsset?: string | null
    awardedPoints: number | null
    disclosureRequested?: boolean
    disclosed?: boolean
    displayName?: string
    comments?: BountyComment[]
  }
  interface Bounty {
    id: number
    title: string
    description: string | null
    repoUrl: string | null
    ownerId: number
    ownerName?: string
    isPublished?: boolean
    findings: BountyFinding[]
  }
  const [bounties, setBounties] = useState<Bounty[]>([])
  const [bountiesLoading, setBountiesLoading] = useState(false)
  const [showBountyForm, setShowBountyForm] = useState(false)
  const [bountyTitle, setBountyTitle] = useState("")
  const [bountyDescription, setBountyDescription] = useState("")
  const [bountyRepoUrl, setBountyRepoUrl] = useState("")
  const [savingBounty, setSavingBounty] = useState(false)
  const [findingText, setFindingText] = useState<Record<number, string>>({})
  const [findingTitle, setFindingTitle] = useState<Record<number, string>>({})
  const [findingVulnType, setFindingVulnType] = useState<Record<number, string>>({})
  const [findingAsset, setFindingAsset] = useState<Record<number, string>>({})
  const [findingSeverity, setFindingSeverity] = useState<Record<number, string>>({})
  const [markSeverity, setMarkSeverity] = useState<Record<number, string>>({})
  const [submittingFinding, setSubmittingFinding] = useState<number | null>(null)
  const [showFindingForm, setShowFindingForm] = useState<Record<number, boolean>>({})

  // Points
  interface PointRow {
    id: number
    amount: number
    reason: string
    note: string | null
    createdAt: string
  }
  const [pointsData, setPointsData] = useState<{ balance: number; history: PointRow[] } | null>(null)
  const [redeemPoints, setRedeemPoints] = useState("")
  const [redeeming, setRedeeming] = useState(false)


  // Club chat feed
  const [clubThreads, setClubThreads] = useState<ClubThread[]>([])
  const [clubThreadsLoading, setClubThreadsLoading] = useState(false)
  const [clubChannelId, setClubChannelId] = useState<number | null>(null)
  const [clubPostText, setClubPostText] = useState("")
  const [postingThread, setPostingThread] = useState(false)

  // Bounty navigation: list -> bounty detail -> report detail
  const [bountyView, setBountyView] = useState<{ bountyId: number | null; findingId: number | null }>({
    bountyId: null,
    findingId: null,
  })

  // Exam state
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [current, setCurrent] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const submittedRef = useRef(false)
  const busyRef = useRef<Set<string>>(new Set())
  const timeLimitMinutes = status?.timeLimitMinutes ?? 45

  // MUST stay above the effects: the chat-feed useEffect below references
  // isMember in its dependency array, and a later declaration would throw
  // "Cannot access before initialization" (TDZ) during render.
  const isMember = status?.membership ?? user?.luminosMember ?? false
  const isOrganizer = hasPermission(user, "chat:manage")

  async function loadClubData() {
    // Parallel fetches; each settles independently so one failing endpoint
    // doesn't prevent partial data from rendering or reject the caller.
    const [evs, gs, cs, dl, bs, pts] = await Promise.allSettled([
      apiFetch(API_ENDPOINTS.luminosEvents),
      apiFetch(API_ENDPOINTS.luminosGiveaways),
      apiFetch(API_ENDPOINTS.luminosContests),
      apiFetch(API_ENDPOINTS.luminosDaily),
      apiFetch(API_ENDPOINTS.luminosBounties),
      apiFetch(API_ENDPOINTS.luminosPoints),
    ])
    if (evs.status === "fulfilled") setEvents(Array.isArray(evs.value) ? evs.value : [])
    if (gs.status === "fulfilled") setGiveaways(Array.isArray(gs.value) ? gs.value : [])
    if (cs.status === "fulfilled") setContests(Array.isArray(cs.value) ? cs.value : [])
    if (dl.status === "fulfilled") setDaily(dl.value ?? null)
    if (bs.status === "fulfilled") setBounties(Array.isArray(bs.value) ? bs.value : [])
    if (pts.status === "fulfilled") setPointsData(pts.value ?? null)
  }

  async function loadStatus() {
    setLoading(true)
    try {
      const s = await apiFetch(API_ENDPOINTS.luminosStatus)
      setStatus(s)
      if (s.membership || isOrganizer) {
        setEventsLoading(true)
        setGiveawaysLoading(true)
        setContestsLoading(true)
        setDailyLoading(true)
        setBountiesLoading(true)
        try {
          await loadClubData()
        } catch {
          // individual cards show empty states on failure
        } finally {
          setEventsLoading(false)
          setGiveawaysLoading(false)
          setContestsLoading(false)
          setDailyLoading(false)
          setBountiesLoading(false)
        }
      } else {
        // Bounties are public: anyone logged in can view and hunt.
        setBountiesLoading(true)
        try {
          const bs = await apiFetch(API_ENDPOINTS.luminosBounties)
          setBounties(Array.isArray(bs) ? bs : [])
        } catch {
          setBounties([])
        } finally {
          setBountiesLoading(false)
        }
      }
    } catch (e: any) {
      toast({ title: t("errors.loadFailed"), description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the club channel's recent threads for the Chat tab.
  async function loadClubThreads() {
    setClubThreadsLoading(true)
    try {
      const chs = await apiFetch(API_ENDPOINTS.chatChannels)
      const club = chs?.find((c: any) => c.type === "club")
      if (!club) return
      setClubChannelId(club.id)
      const res = await apiFetch(`${API_ENDPOINTS.chatChannel.replace(":id", String(club.id))}/threads?limit=10`)
      setClubThreads(res?.threads ?? [])
    } catch {
      // empty state on failure
    } finally {
      setClubThreadsLoading(false)
    }
  }

  useEffect(() => {
    if (isMember) loadClubThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember])

  async function postClubThread() {
    const content = clubPostText.trim()
    if (!content || postingThread || !clubChannelId) return
    setPostingThread(true)
    try {
      await apiFetch(`${API_ENDPOINTS.chatChannel.replace(":id", String(clubChannelId))}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      setClubPostText("")
      await loadClubThreads()
    } catch (e: any) {
      toast({ title: t("chat.postFailed"), description: e.message, variant: "destructive" })
    } finally {
      setPostingThread(false)
    }
  }

  // Countdown ticker. Purely decrements; the submit trigger lives in its own
  // effect below so it always sees the latest `answers` closure.
  useEffect(() => {
    if (view !== "exam" || secondsLeft <= 0) return
    const id = setInterval(() => {
      setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, secondsLeft > 0])

  // Auto-submit when the timer reaches 0.
  useEffect(() => {
    if (view === "exam" && secondsLeft === 0 && attemptId != null) submitExam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, secondsLeft])

  async function startExam() {
    setStarting(true)
    try {
      const s = await apiFetch(API_ENDPOINTS.luminosStart, { method: "POST" })
      setQuestions(s.questions)
      setAttemptId(s.attemptId)
      setAnswers({})
      setCurrent(0)
      setSecondsLeft(s.timeLimitMinutes * 60)
      setView("exam")
    } catch (e: any) {
      toast({ title: t("errors.startFailed"), description: e.message, variant: "destructive" })
    } finally {
      setStarting(false)
      setShowStartConfirm(false)
    }
  }

  async function submitExam() {
    if (submittedRef.current || attemptId == null) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const r = await apiFetch(API_ENDPOINTS.luminosSubmit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers }),
      })
      setResult(r)
      setView("results")
      if (r.membership) {
        await refreshUser()
        await loadStatus()
      }
    } catch (e: any) {
      submittedRef.current = false
      toast({ title: t("errors.submitFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
      setShowSubmitConfirm(false)
    }
  }

  async function createEvent() {
    if (!eventStartsAt) {
      toast({ title: t("events.createFailed"), variant: "destructive" })
      return
    }
    setSavingEvent(true)
    try {
      await apiFetch(API_ENDPOINTS.luminosEvents, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventTitle,
          description: eventDescription || undefined,
          startsAt: new Date(eventStartsAt).toISOString(),
        }),
      })
      setEventTitle("")
      setEventDescription("")
      setEventStartsAt("")
      setShowEventForm(false)
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("events.createFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSavingEvent(false)
    }
  }

  async function deleteEvent(id: number) {
    if (busyRef.current.has(`event:${id}`)) return
    busyRef.current.add(`event:${id}`)
    try {
      await apiFetch(API_ENDPOINTS.luminosEvent.replace(":id", String(id)), { method: "DELETE" })
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch (e: any) {
      toast({ title: t("events.deleteFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`event:${id}`)
    }
  }

  async function toggleRsvp(ev: ClubEvent) {
    if (busyRef.current.has(`rsvp:${ev.id}`)) return
    busyRef.current.add(`rsvp:${ev.id}`)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosEventRsvp.replace(":id", String(ev.id)), { method: "POST" })
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, rsvped: res.rsvped, rsvpCount: res.rsvpCount } : e)))
    } catch (e: any) {
      toast({ title: t("events.rsvpFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`rsvp:${ev.id}`)
    }
  }

  async function createGiveaway() {
    if (!giveawayEndsAt) {
      toast({ title: t("giveaways.createFailed"), variant: "destructive" })
      return
    }
    setSavingGiveaway(true)
    try {
      await apiFetch(API_ENDPOINTS.luminosGiveaways, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: giveawayTitle,
          description: giveawayDescription || undefined,
          prize: giveawayPrize || undefined,
          endsAt: new Date(giveawayEndsAt).toISOString(),
        }),
      })
      setGiveawayTitle("")
      setGiveawayDescription("")
      setGiveawayPrize("")
      setGiveawayEndsAt("")
      setShowGiveawayForm(false)
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("giveaways.createFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSavingGiveaway(false)
    }
  }

  async function enterGiveaway(id: number) {
    if (busyRef.current.has(`enter:${id}`)) return
    busyRef.current.add(`enter:${id}`)
    try {
      await apiFetch(API_ENDPOINTS.luminosGiveawayEnter.replace(":id", String(id)), { method: "POST" })
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("giveaways.enterFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`enter:${id}`)
    }
  }

  async function drawGiveaway(id: number) {
    if (busyRef.current.has(`draw:${id}`)) return
    busyRef.current.add(`draw:${id}`)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosGiveawayDraw.replace(":id", String(id)), { method: "POST" })
      setGiveaways(prev => prev.map(g => (g.id === id ? { ...g, winnerId: res.winnerId } : g)))
    } catch (e: any) {
      toast({ title: t("giveaways.drawFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`draw:${id}`)
    }
  }

  async function deleteGiveaway(id: number) {
    if (busyRef.current.has(`giveaway:${id}`)) return
    busyRef.current.add(`giveaway:${id}`)
    try {
      await apiFetch(API_ENDPOINTS.luminosGiveaway.replace(":id", String(id)), { method: "DELETE" })
      setGiveaways(prev => prev.filter(g => g.id !== id))
    } catch (e: any) {
      toast({ title: t("giveaways.deleteFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`giveaway:${id}`)
    }
  }

  async function createContest() {
    if (!contestEndsAt) {
      toast({ title: t("contests.createFailed"), variant: "destructive" })
      return
    }
    setSavingContest(true)
    try {
      await apiFetch(API_ENDPOINTS.luminosContests, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: contestTitle,
          description: contestDescription || undefined,
          endsAt: new Date(contestEndsAt).toISOString(),
        }),
      })
      setContestTitle("")
      setContestDescription("")
      setContestEndsAt("")
      setShowContestForm(false)
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("contests.createFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSavingContest(false)
    }
  }

  async function submitContest(c: Contest) {
    if (!(submissionText[c.id] ?? "").trim()) {
      toast({ title: t("contests.submitFailed"), variant: "destructive" })
      return
    }
    setSubmittingContest(c.id)
    try {
      await apiFetch(API_ENDPOINTS.luminosContestSubmit.replace(":id", String(c.id)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: submissionText[c.id],
          imageUrl: submissionImage[c.id]?.trim() || undefined,
        }),
      })
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("contests.submitFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSubmittingContest(null)
    }
  }

  async function pickWinner(c: Contest, submissionId: number) {
    if (busyRef.current.has(`winner:${c.id}`)) return
    busyRef.current.add(`winner:${c.id}`)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosContestWinner.replace(":id", String(c.id)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      })
      setContests(prev => prev.map(x => (x.id === c.id ? { ...x, winnerId: res.winnerId } : x)))
    } catch (e: any) {
      toast({ title: t("contests.pickWinnerFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`winner:${c.id}`)
    }
  }

  async function deleteContest(id: number) {
    if (busyRef.current.has(`contest:${id}`)) return
    busyRef.current.add(`contest:${id}`)
    try {
      await apiFetch(API_ENDPOINTS.luminosContest.replace(":id", String(id)), { method: "DELETE" })
      setContests(prev => prev.filter(c => c.id !== id))
    } catch (e: any) {
      toast({ title: t("contests.deleteFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`contest:${id}`)
    }
  }

  async function submitDaily() {
    if (!daily || daily.submitted) return
    setSubmittingDaily(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosDailySubmit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: dailyAnswers }),
      })
      setDaily(prev => (prev ? { ...prev, submitted: res } : prev))
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("daily.submitFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSubmittingDaily(false)
    }
  }

  async function postBounty() {
    setSavingBounty(true)
    try {
      await apiFetch(API_ENDPOINTS.luminosBounties, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bountyTitle,
          description: bountyDescription || undefined,
          repoUrl: bountyRepoUrl || undefined,
        }),
      })
      setBountyTitle("")
      setBountyDescription("")
      setBountyRepoUrl("")
      setShowBountyForm(false)
      await loadClubData()
    } catch (e: any) {
      toast({ title: t("bounties.postFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSavingBounty(false)
    }
  }

  const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"]
  const SEVERITY_POINTS: Record<string, number> = { critical: 1000, high: 500, medium: 200, low: 50 }
  const VULN_TYPE_OPTIONS = [
    "xss", "sql_injection", "rce", "csrf", "idor", "ssrf",
    "auth_bypass", "info_disclosure", "dos", "logic", "other",
  ]

  async function submitFinding(b: Bounty) {
    const content = (findingText[b.id] ?? "").trim()
    const title = (findingTitle[b.id] ?? "").trim()
    if (!content || !title) {
      toast({ title: t("bounties.submitFindingFailed"), variant: "destructive" })
      return
    }
    setSubmittingFinding(b.id)
    try {
      const created = await apiFetch(API_ENDPOINTS.luminosBountyFindings.replace(":id", String(b.id)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          vulnType: findingVulnType[b.id] || undefined,
          affectedAsset: findingAsset[b.id]?.trim() || undefined,
          severity: findingSeverity[b.id],
        }),
      })
      setFindingText(prev => ({ ...prev, [b.id]: "" }))
      setFindingTitle(prev => ({ ...prev, [b.id]: "" }))
      setFindingVulnType(prev => ({ ...prev, [b.id]: "" }))
      setFindingAsset(prev => ({ ...prev, [b.id]: "" }))
      setShowFindingForm(prev => ({ ...prev, [b.id]: false }))
      setBounties(prev =>
        prev.map(x =>
          x.id === b.id
            ? { ...x, findings: [...x.findings, { ...created, displayName: user?.displayName || "You" }] }
            : x
        )
      )
    } catch (e: any) {
      toast({ title: t("bounties.submitFindingFailed"), description: e.message, variant: "destructive" })
    } finally {
      setSubmittingFinding(null)
    }
  }

  async function triageFinding(b: Bounty, fid: number) {
    if (busyRef.current.has(`finding:${fid}`)) return
    busyRef.current.add(`finding:${fid}`)
    try {
      await apiFetch(
        API_ENDPOINTS.luminosBountyFindingTriage.replace(":id", String(b.id)).replace(":fid", String(fid)),
        { method: "POST" }
      )
      setBounties(prev =>
        prev.map(x =>
          x.id === b.id
            ? { ...x, findings: x.findings.map(f => (f.id === fid ? { ...f, status: "triaged" } : f)) }
            : x
        )
      )
    } catch (e: any) {
      toast({ title: t("bounties.markFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`finding:${fid}`)
    }
  }

  async function disclosureAction(b: Bounty, f: BountyFinding, action: "request" | "approve" | "decline") {
    const key = `finding:${f.id}`
    if (busyRef.current.has(key)) return
    busyRef.current.add(key)
    try {
      await apiFetch(
        API_ENDPOINTS.luminosBountyFindingDisclosure.replace(":id", String(b.id)).replace(":fid", String(f.id)),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }
      )
      setBounties(prev =>
        prev.map(x =>
          x.id === b.id
            ? {
                ...x,
                findings: x.findings.map(xf =>
                  xf.id === f.id
                    ? { ...xf, disclosureRequested: action === "request", disclosed: action === "approve" }
                    : xf
                ),
              }
            : x
        )
      )
    } catch (e: any) {
      toast({ title: t("bounties.markFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(key)
    }
  }

  async function markFinding(b: Bounty, fid: number, status: "valid" | "invalid") {
    if (busyRef.current.has(`finding:${fid}`)) return
    busyRef.current.add(`finding:${fid}`)
    const finding = b.findings.find(f => f.id === fid)
    const severity = markSeverity[fid] ?? finding?.severity ?? "medium"
    try {
      await apiFetch(
        API_ENDPOINTS.luminosBountyFindingStatus.replace(":id", String(b.id)).replace(":fid", String(fid)),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, severity: status === "valid" ? severity : undefined }),
        }
      )
      setBounties(prev =>
        prev.map(x =>
          x.id === b.id
            ? {
                ...x,
                findings: x.findings.map(f => (f.id === fid ? { ...f, status, severity: status === "valid" ? severity : f.severity } : f)),
              }
            : x
        )
      )
    } catch (e: any) {
      toast({ title: t("bounties.markFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`finding:${fid}`)
    }
  }

  async function awardFinding(b: Bounty, f: BountyFinding) {
    if (busyRef.current.has(`award:${f.id}`)) return
    busyRef.current.add(`award:${f.id}`)
    const points = SEVERITY_POINTS[f.severity ?? "low"] ?? SEVERITY_POINTS.low
    try {
      await apiFetch(
        API_ENDPOINTS.luminosBountyFindingAward.replace(":id", String(b.id)).replace(":fid", String(f.id)),
        { method: "POST" }
      )
      setBounties(prev =>
        prev.map(x =>
          x.id === b.id
            ? {
                ...x,
                findings: x.findings.map(xf => (xf.id === f.id ? { ...xf, status: "awarded", awardedPoints: points } : xf)),
              }
            : x
        )
      )
      const pts = await apiFetch(API_ENDPOINTS.luminosPoints)
      setPointsData(pts ?? null)
    } catch (e: any) {
      toast({ title: t("bounties.awardFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`award:${f.id}`)
    }
  }

  async function togglePublish(b: Bounty) {
    if (busyRef.current.has(`publish:${b.id}`)) return
    busyRef.current.add(`publish:${b.id}`)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosBountyPublish.replace(":id", String(b.id)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !b.isPublished }),
      })
      setBounties(prev => prev.map(x => (x.id === b.id ? { ...x, isPublished: res.isPublished } : x)))
    } catch (e: any) {
      toast({ title: t("bounties.publishFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`publish:${b.id}`)
    }
  }

  async function deleteFinding(b: Bounty, fid: number) {
    if (busyRef.current.has(`finding:${fid}`)) return
    busyRef.current.add(`finding:${fid}`)
    try {
      await apiFetch(
        API_ENDPOINTS.luminosBountyFinding.replace(":id", String(b.id)).replace(":fid", String(fid)),
        { method: "DELETE" }
      )
      setBounties(prev =>
        prev.map(x => (x.id === b.id ? { ...x, findings: x.findings.filter(f => f.id !== fid) } : x))
      )
    } catch (e: any) {
      toast({ title: t("bounties.deleteFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`finding:${fid}`)
    }
  }

  async function deleteBounty(id: number) {
    if (busyRef.current.has(`bounty:${id}`)) return
    busyRef.current.add(`bounty:${id}`)
    try {
      await apiFetch(API_ENDPOINTS.luminosBounty.replace(":id", String(id)), { method: "DELETE" })
      setBounties(prev => prev.filter(b => b.id !== id))
    } catch (e: any) {
      toast({ title: t("bounties.deleteFailed"), description: e.message, variant: "destructive" })
    } finally {
      busyRef.current.delete(`bounty:${id}`)
    }
  }

  async function redeemPointsNow() {
    const points = Number(redeemPoints)
    if (!Number.isInteger(points) || points < 100 || points % 100 !== 0) {
      toast({ title: t("points.redeemFailed"), variant: "destructive" })
      return
    }
    setRedeeming(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.luminosPointsRedeem, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      })
      setRedeemPoints("")
      setPointsData(prev => (prev ? { ...prev, balance: res.balance } : prev))
      toast({ title: `${t("points.redeemed")} ${res.code} ($${res.value.toFixed(2)})` })
    } catch (e: any) {
      toast({ title: t("points.redeemFailed"), description: e.message, variant: "destructive" })
    } finally {
      setRedeeming(false)
    }
  }

  const mm = String(Math.floor(Math.max(0, secondsLeft) / 60)).padStart(2, "0")
  const ss = String(Math.max(0, secondsLeft) % 60).padStart(2, "0")
  const answeredCount = Object.keys(answers).length

  return (
    <ClubPageBoundary>
      <PanelHeader title={t("title")} description={t("subtitle")} />
      <ScrollArea className="flex-1">
        <PageLayout>

          {loading ? (
            <RouteSkeleton />
          ) : view === "intro" && isMember ? (
            <div className="space-y-6">
              <Card className="border-success/30 bg-success/5">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                      <Sparkles className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{t("memberBannerTitle")}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{t("memberBannerDesc")}</CardDescription>
                  <div className="mt-5">
                    <Button asChild>
                      <a href="/dashboard/chat?board=luminos">{t("viewChat")}</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="play" className="w-full">
                <TabsList className="flex w-full flex-wrap justify-start">
                  <TabsTrigger value="play">{t("tabs.play")}</TabsTrigger>
                  <TabsTrigger value="events">{t("tabs.events")}</TabsTrigger>
                  <TabsTrigger value="giveaways">{t("tabs.giveaways")}</TabsTrigger>
                  <TabsTrigger value="contests">{t("tabs.contests")}</TabsTrigger>
                  <TabsTrigger value="bounties">{t("tabs.bounties")}</TabsTrigger>
                  <TabsTrigger value="chat">{t("tabs.chat")}</TabsTrigger>
                  <TabsTrigger value="points">{t("tabs.points")}</TabsTrigger>
                </TabsList>

                <TabsContent value="events" className="mt-4 space-y-6">
              {/* Club events */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    {t("events.title")}
                  </CardTitle>
                  {isOrganizer && (
                    <Button size="sm" variant="outline" onClick={() => setShowEventForm(prev => !prev)}>
                      <Plus className="mr-1 h-4 w-4" />
                      {t("events.create")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {showEventForm && isOrganizer && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <input
                        value={eventTitle}
                        onChange={e => setEventTitle(e.target.value)}
                        placeholder={t("events.titleLabel")}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <textarea
                        value={eventDescription}
                        onChange={e => setEventDescription(e.target.value)}
                        placeholder={t("events.descriptionLabel")}
                        rows={2}
                        className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <input
                        type="datetime-local"
                        value={eventStartsAt}
                        onChange={e => setEventStartsAt(e.target.value)}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <Button onClick={createEvent} disabled={savingEvent} className="w-full">
                        {savingEvent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("events.create")}
                      </Button>
                    </div>
                  )}

                  {eventsLoading ? (
                    <div className="space-y-3 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : events.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("events.empty")}</p>
                  ) : (
                    <div className="divide-y">
                      {events.map(ev => (
                        <div key={ev.id} className="flex items-start justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium">{ev.title}</p>
                            {ev.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{ev.description}</p>
                            )}
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Timer className="h-3 w-3" />
                              {formatTimeAgo(ev.startsAt)}
                              {typeof ev.rsvpCount === "number" && ev.rsvpCount > 0 && (
                                <span>· {t("events.going", { count: ev.rsvpCount })}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="sm"
                              variant={ev.rsvped ? "default" : "outline"}
                              onClick={() => toggleRsvp(ev)}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              {ev.rsvped ? t("events.rsvped") : t("events.rsvp")}
                            </Button>
                            {isOrganizer && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => deleteEvent(ev.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

                </TabsContent>

                <TabsContent value="giveaways" className="mt-4 space-y-6">
              {/* Giveaways */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    {t("giveaways.title")}
                  </CardTitle>
                  {isOrganizer && (
                    <Button size="sm" variant="outline" onClick={() => setShowGiveawayForm(prev => !prev)}>
                      <Plus className="mr-1 h-4 w-4" />
                      {t("giveaways.create")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {showGiveawayForm && isOrganizer && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <input
                        value={giveawayTitle}
                        onChange={e => setGiveawayTitle(e.target.value)}
                        placeholder={t("giveaways.titleLabel")}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <input
                        value={giveawayPrize}
                        onChange={e => setGiveawayPrize(e.target.value)}
                        placeholder={t("giveaways.prizeLabel")}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <textarea
                        value={giveawayDescription}
                        onChange={e => setGiveawayDescription(e.target.value)}
                        placeholder={t("giveaways.descriptionLabel")}
                        rows={2}
                        className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <input
                        type="datetime-local"
                        value={giveawayEndsAt}
                        onChange={e => setGiveawayEndsAt(e.target.value)}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <Button onClick={createGiveaway} disabled={savingGiveaway} className="w-full">
                        {savingGiveaway ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("giveaways.create")}
                      </Button>
                    </div>
                  )}

                  {giveawaysLoading ? (
                    <div className="space-y-3 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : giveaways.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("giveaways.empty")}</p>
                  ) : (
                    <div className="divide-y">
                      {giveaways.map(g => (
                        <div key={g.id} className="flex items-start justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium">{g.title}</p>
                            {g.prize && <p className="mt-0.5 text-sm text-amber-500">{g.prize}</p>}
                            {g.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{g.description}</p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <Timer className="h-3 w-3" />
                              {formatTimeAgo(g.endsAt)}
                              <span>· {t("giveaways.entries", { count: g.entryCount ?? 0 })}</span>
                              {g.winnerId != null && g.winnerName && (
                                <span className="font-medium text-success">
                                  <Trophy className="mr-0.5 inline h-3 w-3" />
                                  {t("giveaways.winner", { name: g.winnerName })}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {g.winnerId == null && !g.entered && (
                              <Button size="sm" variant="outline" onClick={() => enterGiveaway(g.id)}>
                                {t("giveaways.enter")}
                              </Button>
                            )}
                            {g.winnerId == null && g.entered && (
                              <Button size="sm" variant="default" disabled>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                {t("giveaways.entered")}
                              </Button>
                            )}
                            {isOrganizer && g.winnerId == null && (
                              <Button size="sm" variant="outline" onClick={() => drawGiveaway(g.id)}>
                                <Trophy className="mr-1 h-3.5 w-3.5" />
                                {t("giveaways.draw")}
                              </Button>
                            )}
                            {isOrganizer && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => deleteGiveaway(g.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

                </TabsContent>

                <TabsContent value="contests" className="mt-4 space-y-6">
              {/* Contests */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    {t("contests.title")}
                  </CardTitle>
                  {isOrganizer && (
                    <Button size="sm" variant="outline" onClick={() => setShowContestForm(prev => !prev)}>
                      <Plus className="mr-1 h-4 w-4" />
                      {t("contests.create")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {showContestForm && isOrganizer && (
                    <div className="space-y-3 rounded-lg border p-4">
                      <input
                        value={contestTitle}
                        onChange={e => setContestTitle(e.target.value)}
                        placeholder={t("contests.titleLabel")}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <textarea
                        value={contestDescription}
                        onChange={e => setContestDescription(e.target.value)}
                        placeholder={t("contests.descriptionLabel")}
                        rows={2}
                        className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <input
                        type="datetime-local"
                        value={contestEndsAt}
                        onChange={e => setContestEndsAt(e.target.value)}
                        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <Button onClick={createContest} disabled={savingContest} className="w-full">
                        {savingContest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("contests.create")}
                      </Button>
                    </div>
                  )}

                  {contestsLoading ? (
                    <div className="space-y-3 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : contests.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("contests.empty")}</p>
                  ) : (
                    <div className="divide-y">
                      {contests.map(c => (
                        <div key={c.id} className="py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-medium">{c.title}</p>
                              {c.description && (
                                <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
                              )}
                              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                <Timer className="h-3 w-3" />
                                {formatTimeAgo(c.endsAt)}
                                <span>· {t("contests.entries", { count: c.submissionCount ?? 0 })}</span>
                                {c.winnerId != null && c.winnerName && (
                                  <span className="font-medium text-success">
                                    <Trophy className="mr-0.5 inline h-3 w-3" />
                                    {t("contests.winner", { name: c.winnerName })}
                                  </span>
                                )}
                              </p>
                            </div>
                            {isOrganizer && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteContest(c.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          {/* Submissions */}
                          {(c.submissions?.length ?? 0) > 0 && (
                            <div className="mt-3 space-y-2">
                              {c.submissions!.map(s => (
                                <div key={s.id} className="rounded-lg border p-3 text-sm">
                                  <p className="font-medium text-xs text-muted-foreground">{s.displayName}</p>
                                  <p className="mt-1 whitespace-pre-wrap">{s.content}</p>
                                  {s.imageUrl && (
                                    <img
                                      src={s.imageUrl}
                                      alt=""
                                      className="mt-2 max-h-40 rounded-md border object-cover"
                                    />
                                  )}
                                  {isOrganizer && c.winnerId == null && (
                                    <Button size="sm" variant="outline" className="mt-2" onClick={() => pickWinner(c, s.id)}>
                                      <Trophy className="mr-1 h-3.5 w-3.5" />
                                      {t("contests.pickWinner")}
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Submit form */}
                          {!c.mySubmission && c.winnerId == null && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={submissionText[c.id] ?? ""}
                                onChange={e => setSubmissionText(prev => ({ ...prev, [c.id]: e.target.value }))}
                                placeholder={t("contests.submissionLabel")}
                                rows={3}
                                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <input
                                value={submissionImage[c.id] ?? ""}
                                onChange={e => setSubmissionImage(prev => ({ ...prev, [c.id]: e.target.value }))}
                                placeholder={t("contests.imageUrlLabel")}
                                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <Button
                                onClick={() => submitContest(c)}
                                disabled={submittingContest === c.id}
                                className="w-full"
                              >
                                {submittingContest === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t("contests.submit")}
                              </Button>
                            </div>
                          )}
                          {c.mySubmission && c.winnerId == null && (
                            <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
                              <CheckCircle2 className="h-4 w-4" />
                              {t("contests.submitted")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

                </TabsContent>

                <TabsContent value="play" className="mt-4 space-y-6">
              {/* Daily Challenge */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    {t("daily.title")}
                  </CardTitle>
                  <CardDescription>{t("daily.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dailyLoading ? (
                    <div className="space-y-3 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : !daily ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("daily.empty")}</p>
                  ) : daily.submitted ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <div>
                          <p className="font-medium">{t("daily.done", { score: daily.submitted.correct, total: daily.submitted.total })}</p>
                          <p className="text-sm text-muted-foreground">{t("daily.score", { score: daily.submitted.score })}</p>
                        </div>
                      </div>
                      {daily.leaderboard.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("daily.leaderboard")}
                          </p>
                          <div className="space-y-1">
                            {daily.leaderboard.map(l => (
                              <div key={l.rank} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                                <span className="flex items-center gap-2">
                                  <span className={`font-mono text-xs ${l.rank === 1 ? "text-amber-500" : "text-muted-foreground"}`}>
                                    #{l.rank}
                                  </span>
                                  <span className="font-medium">{l.name}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {l.correct}/{daily.submitted.total}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        {daily.questions.map((q, qi) => (
                          <div key={q.id} className="rounded-lg border p-3">
                            <p className="text-sm font-medium">
                              <span className="mr-1.5 text-muted-foreground">{qi + 1}.</span>
                              {q.question}
                            </p>
                            {q.imageUrl && (
                              <img
                                src={q.imageUrl}
                                alt={q.question}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="mt-2 max-h-52 w-full rounded-md border object-cover"
                              />
                            )}
                            <RadioGroup
                              value={dailyAnswers[q.id] !== undefined ? String(dailyAnswers[q.id]) : ""}
                              onValueChange={(v) => setDailyAnswers(prev => ({ ...prev, [q.id]: Number(v) }))}
                              className="mt-2 grid gap-1.5"
                            >
                              {q.options.map((opt, oi) => (
                                <label
                                  key={oi}
                                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                                    dailyAnswers[q.id] === oi ? "border-primary bg-primary/5" : "hover:bg-muted"
                                  }`}
                                >
                                  <RadioGroupItem value={String(oi)} />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </div>
                        ))}
                      </div>
                      <Button onClick={submitDaily} disabled={submittingDaily} className="w-full">
                        {submittingDaily ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("daily.submit")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>


                </TabsContent>

                <TabsContent value="bounties" className="mt-4 space-y-6">
              {/* Bounties — HackerOne-style: list -> bounty detail -> report detail */}
              {(() => {
                const activeBounty = bounties.find(b => b.id === bountyView.bountyId)
                const activeFinding = activeBounty?.findings.find(f => f.id === bountyView.findingId)

                const backToList = () => setBountyView({ bountyId: null, findingId: null })
                const backToBounty = () => setBountyView({ bountyId: activeBounty?.id ?? null, findingId: null })

                return (
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="flex items-center gap-2">
                        <Bug className="h-5 w-5" />
                        {bountyView.bountyId
                          ? activeBounty?.title ?? t("bounties.title")
                          : t("bounties.title")}
                      </CardTitle>
                      {!bountyView.bountyId && (
                        <Button size="sm" variant="outline" onClick={() => setShowBountyForm(prev => !prev)}>
                          <Plus className="mr-1 h-4 w-4" />
                          {t("bounties.create")}
                        </Button>
                      )}
                      {(bountyView.bountyId || bountyView.findingId) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={bountyView.findingId ? backToBounty : backToList}
                        >
                          <ArrowLeft className="mr-1 h-4 w-4" />
                          {t("back")}
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {bountiesLoading ? (
                        <div className="space-y-3 py-1">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      ) : !bountyView.bountyId ? (
                        /* ---- LEVEL 1: bounty list ---- */
                        <>
                          {showBountyForm && (
                            <div className="space-y-3 rounded-lg border p-4">
                              <input
                                value={bountyTitle}
                                onChange={e => setBountyTitle(e.target.value)}
                                placeholder={t("bounties.titleLabel")}
                                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <textarea
                                value={bountyDescription}
                                onChange={e => setBountyDescription(e.target.value)}
                                placeholder={t("bounties.descriptionLabel")}
                                rows={2}
                                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <input
                                value={bountyRepoUrl}
                                onChange={e => setBountyRepoUrl(e.target.value)}
                                placeholder={t("bounties.repoUrlLabel")}
                                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <Button onClick={postBounty} disabled={savingBounty} className="w-full">
                                {savingBounty ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t("bounties.post")}
                              </Button>
                            </div>
                          )}

                          {bounties.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">{t("bounties.empty")}</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {bounties.map(b => (
                                <button
                                  key={b.id}
                                  onClick={() => setBountyView({ bountyId: b.id, findingId: null })}
                                  className="rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-medium">
                                      {b.title}
                                      {b.isPublished === false && (
                                        <span className="ml-2 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                                          {t("bounties.draft")}
                                        </span>
                                      )}
                                    </p>
                                    <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {t("bounties.by", { name: b.ownerName ?? `User#${b.ownerId}` })}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {b.findings.length} {b.findings.length === 1 ? t("bounties.finding") : t("bounties.findings")}
                                    {b.isPublished && b.findings.length > 0 && (
                                      <span className="ml-2">
                                        · {b.findings.filter(f => f.status === "awarded").length} {t("bounties.statusAwarded")}
                                      </span>
                                    )}
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : !bountyView.findingId && activeBounty ? (
                        /* ---- LEVEL 2: bounty detail ---- */
                        <>
                          <div className="rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-base font-semibold">{activeBounty.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t("bounties.by", { name: activeBounty.ownerName ?? `User#${activeBounty.ownerId}` })}
                                  {activeBounty.isPublished === false && (
                                    <span className="ml-2 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                                      {t("bounties.draft")}
                                    </span>
                                  )}
                                </p>
                                {activeBounty.description && (
                                  <p className="mt-2 text-sm text-muted-foreground">{activeBounty.description}</p>
                                )}
                                {safeRepoUrl(activeBounty.repoUrl) && (
                                  <a
                                    href={safeRepoUrl(activeBounty.repoUrl)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    {safeRepoUrl(activeBounty.repoUrl)}
                                  </a>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-1">
                                {(activeBounty.ownerId === user?.id || isOrganizer) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => togglePublish(activeBounty)}
                                  >
                                    {activeBounty.isPublished ? t("bounties.unpublish") : t("bounties.publish")}
                                  </Button>
                                )}
                                {(activeBounty.ownerId === user?.id || isOrganizer) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      deleteBounty(activeBounty.id)
                                      backToList()
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("bounties.reports")} ({activeBounty.findings.length})
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowFindingForm(prev => ({ ...prev, [activeBounty.id]: !prev[activeBounty.id] }))}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                {t("bounties.submitFinding")}
                              </Button>
                            </div>

                            {activeBounty.findings.length === 0 ? (
                              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                                {t("bounties.noFindings")}
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {activeBounty.findings.map(f => (
                                  <button
                                    key={f.id}
                                    onClick={() => setBountyView({ bountyId: activeBounty.id, findingId: f.id })}
                                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{f.title || t("bounties.statusPending")}</p>
                                      <p className="text-xs text-muted-foreground">{f.displayName}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                      {f.severity && (
                                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${severityBadgeClass(f.severity)}`}>
                                          {t(`bounties.severity.${f.severity}`)}
                                        </span>
                                      )}
                                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(f.status)}`}>
                                        {f.status === "awarded"
                                          ? `${t("bounties.statusAwarded")} (${f.awardedPoints})`
                                          : f.status === "valid"
                                            ? t("bounties.statusValid")
                                            : f.status === "triaged"
                                              ? t("bounties.statusTriaged")
                                              : f.status === "invalid"
                                                ? t("bounties.statusInvalid")
                                                : t("bounties.statusPending")}
                                      </span>
                                      <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}

                            {showFindingForm[activeBounty.id] && (
                              <div className="mt-3 space-y-2 rounded-lg border p-3">
                                <input
                                  value={findingTitle[activeBounty.id] ?? ""}
                                  onChange={e => setFindingTitle(prev => ({ ...prev, [activeBounty.id]: e.target.value }))}
                                  placeholder={t("bounties.findingTitleLabel")}
                                  autoFocus
                                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={findingVulnType[activeBounty.id] ?? ""}
                                    onChange={e => setFindingVulnType(prev => ({ ...prev, [activeBounty.id]: e.target.value }))}
                                    className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-primary"
                                  >
                                    <option value="">{t("bounties.vulnTypeLabel")}</option>
                                    {VULN_TYPE_OPTIONS.map(v => (
                                      <option key={v} value={v}>
                                        {t(`bounties.vulnTypes.${v}`)}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={findingSeverity[activeBounty.id] ?? "medium"}
                                    onChange={e => setFindingSeverity(prev => ({ ...prev, [activeBounty.id]: e.target.value }))}
                                    className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-primary"
                                  >
                                    {SEVERITY_OPTIONS.map(s => (
                                      <option key={s} value={s}>
                                        {t(`bounties.severity.${s}`)} (+{SEVERITY_POINTS[s]})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <input
                                  value={findingAsset[activeBounty.id] ?? ""}
                                  onChange={e => setFindingAsset(prev => ({ ...prev, [activeBounty.id]: e.target.value }))}
                                  placeholder={t("bounties.assetLabel")}
                                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                                <textarea
                                  value={findingText[activeBounty.id] ?? ""}
                                  onChange={e => setFindingText(prev => ({ ...prev, [activeBounty.id]: e.target.value }))}
                                  placeholder={t("bounties.findingLabel")}
                                  rows={3}
                                  className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button size="sm" onClick={() => submitFinding(activeBounty)} disabled={submittingFinding === activeBounty.id}>
                                    {submittingFinding === activeBounty.id ? (
                                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {t("bounties.submit")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowFindingForm(prev => ({ ...prev, [activeBounty.id]: false }))}
                                  >
                                    {t("cancel")}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : activeBounty && activeFinding ? (
                        /* ---- LEVEL 3: report detail ---- */
                        <div className="space-y-3">
                          <div className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-base font-semibold">{activeFinding.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t("bounties.by", { name: activeFinding.displayName ?? `User#${activeFinding.userId}` })} ·{" "}
                                  {t("bounties.bountyOf", { bounty: activeBounty.title })}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-1">
                                {activeFinding.vulnType && (
                                  <span className="rounded-full border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {t(`bounties.vulnTypes.${activeFinding.vulnType}`)}
                                  </span>
                                )}
                                {activeFinding.severity && (
                                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${severityBadgeClass(activeFinding.severity)}`}>
                                    {t(`bounties.severity.${activeFinding.severity}`)}
                                  </span>
                                )}
                                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(activeFinding.status)}`}>
                                  {activeFinding.status === "awarded"
                                    ? `${t("bounties.statusAwarded")} (${activeFinding.awardedPoints})`
                                    : activeFinding.status === "valid"
                                      ? t("bounties.statusValid")
                                      : activeFinding.status === "triaged"
                                        ? t("bounties.statusTriaged")
                                        : activeFinding.status === "invalid"
                                          ? t("bounties.statusInvalid")
                                          : t("bounties.statusPending")}
                                </span>
                                {activeFinding.disclosed && (
                                  <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                                    {t("bounties.disclosed")}
                                  </span>
                                )}
                              </div>
                            </div>
                            {activeFinding.affectedAsset && (
                              <p className="mt-2 font-mono text-xs text-primary/80">{activeFinding.affectedAsset}</p>
                            )}
                            <p className="mt-3 whitespace-pre-wrap text-sm">{activeFinding.content}</p>
                          </div>

                          {/* Actions */}
                          <div className="rounded-lg border p-3">
                            {(activeBounty.ownerId === user?.id || isOrganizer) && (activeFinding.status === "pending" || activeFinding.status === "triaged") && (
                              <div className="flex flex-wrap items-center gap-2">
                                {activeFinding.status === "pending" && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => triageFinding(activeBounty, activeFinding.id)}>
                                    {t("bounties.triage")}
                                  </Button>
                                )}
                                <select
                                  value={markSeverity[activeFinding.id] ?? activeFinding.severity ?? "medium"}
                                  onChange={e => setMarkSeverity(prev => ({ ...prev, [activeFinding.id]: e.target.value }))}
                                  className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-primary"
                                >
                                  {SEVERITY_OPTIONS.map(s => (
                                    <option key={s} value={s}>
                                      {t(`bounties.severity.${s}`)} (+{SEVERITY_POINTS[s]})
                                    </option>
                                  ))}
                                </select>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-success" onClick={() => markFinding(activeBounty, activeFinding.id, "valid")}>
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  {t("bounties.markValid")}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive" onClick={() => markFinding(activeBounty, activeFinding.id, "invalid")}>
                                  <XCircle className="mr-1 h-3 w-3" />
                                  {t("bounties.markInvalid")}
                                </Button>
                              </div>
                            )}
                            {isOrganizer && activeFinding.status === "valid" && (
                              <div>
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => awardFinding(activeBounty, activeFinding)}>
                                  <Sparkles className="mr-1 h-3 w-3" />
                                  {t("bounties.award")} (+{SEVERITY_POINTS[activeFinding.severity ?? "low"] ?? SEVERITY_POINTS.low})
                                </Button>
                              </div>
                            )}
                            {activeFinding.userId === user?.id && activeFinding.status === "awarded" && !activeFinding.disclosureRequested && !activeFinding.disclosed && (
                              <div>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => disclosureAction(activeBounty, activeFinding, "request")}>
                                  {t("bounties.requestDisclosure")}
                                </Button>
                              </div>
                            )}
                            {activeFinding.disclosureRequested && (activeBounty.ownerId === user?.id || isOrganizer) && (
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => disclosureAction(activeBounty, activeFinding, "approve")}>
                                  {t("bounties.approveDisclosure")}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive" onClick={() => disclosureAction(activeBounty, activeFinding, "decline")}>
                                  {t("bounties.declineDisclosure")}
                                </Button>
                              </div>
                            )}
                            {(activeBounty.ownerId === user?.id || isOrganizer || activeFinding.userId === user?.id) && activeFinding.status === "pending" && (
                              <div className="mt-2">
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => deleteFinding(activeBounty, activeFinding.id)}>
                                  <Trash2 className="mr-1 h-3 w-3" />
                                  {t("bounties.deleteFinding")}
                                </Button>
                              </div>
                            )}
                          </div>

                          <ReportComments bountyId={activeBounty.id} finding={activeFinding} />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })()}
                </TabsContent>

                <TabsContent value="chat" className="mt-4 space-y-6">
              {/* Club chat */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    {t("chat.title")}
                  </CardTitle>
                  <Button asChild size="sm">
                    <a href="/dashboard/chat?board=luminos">
                      {t("chat.open")}
                    </a>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={clubPostText}
                      onChange={e => setClubPostText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && postClubThread()}
                      placeholder={t("chat.postPlaceholder")}
                      className="h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <Button size="sm" onClick={postClubThread} disabled={postingThread || !clubPostText.trim() || !clubChannelId}>
                      {postingThread ? <Loader2 className="h-4 w-4 animate-spin" /> : t("chat.post")}
                    </Button>
                  </div>
                  {clubThreadsLoading ? (
                    <div className="space-y-3 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : clubThreads.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t("chat.empty")}</p>
                  ) : (
                    <div className="space-y-2">
                      {clubThreads.map(th => (
                        <a
                          key={th.id}
                          href={`/dashboard/chat?board=luminos&thread=${th.id}`}
                          className="block rounded-lg border px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">
                              {th.displayName ? <span className="mr-1.5 text-xs font-normal text-muted-foreground">{th.displayName}:</span> : null}
                              {(th.content || "").slice(0, 120)}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {th.replyCount ? `${th.replyCount} replies` : ""} ·{" "}
                              {formatTimeAgo(th.bumpedAt)}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
                </TabsContent>

                <TabsContent value="points" className="mt-4 space-y-6">
              {/* Points */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5" />
                    {t("points.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between rounded-lg border p-4">
                    <div>
                      <p className="text-3xl font-bold">{pointsData?.balance ?? 0}</p>
                      <p className="text-xs text-muted-foreground">{t("points.balanceLabel")}</p>
                    </div>
                    <div className="w-1/2 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={100}
                          step={100}
                          value={redeemPoints}
                          onChange={e => setRedeemPoints(e.target.value)}
                          placeholder="100"
                          className="w-24 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <Button onClick={redeemPointsNow} disabled={redeeming} className="flex-1">
                          {redeeming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {t("points.redeem")}
                        </Button>
                      </div>
                      <p className="text-right text-xs text-muted-foreground">
                        {t("points.redeemValue", { value: ((Number(redeemPoints) || 0) / 100).toFixed(2) })}
                      </p>
                    </div>
                  </div>

                  {(pointsData?.history?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      {pointsData!.history.slice(0, 8).map(h => (
                        <div key={h.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                          <span className="truncate text-muted-foreground">
                            {h.note || h.reason}
                          </span>
                          <span className={`shrink-0 font-mono text-xs ${h.amount > 0 ? "text-success" : "text-destructive"}`}>
                            {h.amount > 0 ? "+" : ""}{h.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : view === "intro" ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ListChecks className="h-5 w-5" />
                      {t("rulesTitle")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      {t("ruleTimer")}
                    </div>
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      {t("ruleQuestions")}
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      {t("ruleThreshold")}
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      {t("ruleAttempts")}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("rulesTitle")}</CardTitle>
                    <CardDescription>
                      {t("attemptsLeft", { count: status?.attemptsRemaining ?? 0 })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <LoadingBar value={((status?.attemptsRemaining ?? 0) / 3) * 100} />
                    <Button
                      onClick={() => setShowStartConfirm(true)}
                      disabled={starting || (status?.attemptsRemaining ?? 0) <= 0}
                      className="w-full"
                    >
                      {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {t("start")}
                    </Button>
                    {status?.activeAttempt && (
                      <p className="text-center text-xs text-muted-foreground">
                        {t("attemptsLeft", { count: 0 })} — {t("startWarning")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Public bounties — anyone can view and hunt */}
              {bounties.length > 0 && (
                (() => {
                  const pubBounty = bounties.find(b => b.id === bountyView.bountyId)
                  return (
                    <Card>
                      <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="flex items-center gap-2">
                          <Bug className="h-5 w-5" />
                          {t("bounties.title")}
                        </CardTitle>
                        {pubBounty && (
                          <Button size="sm" variant="ghost" onClick={() => setBountyView({ bountyId: null, findingId: null })}>
                            <ArrowLeft className="mr-1 h-4 w-4" />
                            {t("back")}
                          </Button>
                        )}
                      </CardHeader>
                      <CardDescription className="px-6 pb-2">{t("bounties.publicNote")}</CardDescription>
                      <CardContent className="space-y-3">
                        {!pubBounty ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {bounties.map(b => (
                              <button
                                key={b.id}
                                onClick={() => setBountyView({ bountyId: b.id, findingId: null })}
                                className="rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                              >
                                <p className="truncate text-sm font-medium">{b.title}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {t("bounties.by", { name: b.ownerName ?? `User#${b.ownerId}` })} ·{" "}
                                  {b.findings.length} {b.findings.length === 1 ? t("bounties.finding") : t("bounties.findings")}
                                </p>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="rounded-lg border p-4">
                              <p className="text-base font-semibold">{pubBounty.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("bounties.by", { name: pubBounty.ownerName ?? `User#${pubBounty.ownerId}` })}
                              </p>
                              {pubBounty.description && <p className="mt-2 text-sm text-muted-foreground">{pubBounty.description}</p>}
                              {safeRepoUrl(pubBounty.repoUrl) && (
                                <a href={safeRepoUrl(pubBounty.repoUrl)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                  <ExternalLink className="h-3 w-3" />
                                  {safeRepoUrl(pubBounty.repoUrl)}
                                </a>
                              )}
                            </div>

                            {pubBounty.findings.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  {t("bounties.reports")} ({pubBounty.findings.length})
                                </p>
                                {pubBounty.findings.map(f => (
                                  <div key={f.id} className="rounded-md border px-3 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{f.title || t("bounties.statusPending")}</p>
                                        <p className="text-xs text-muted-foreground">{f.displayName}</p>
                                      </div>
                                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                        {f.vulnType && (
                                          <span className="shrink-0 rounded-full border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            {t(`bounties.vulnTypes.${f.vulnType}`)}
                                          </span>
                                        )}
                                        {f.severity && (
                                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${severityBadgeClass(f.severity)}`}>
                                            {t(`bounties.severity.${f.severity}`)}
                                          </span>
                                        )}
                                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(f.status)}`}>
                                          {f.status === "awarded"
                                            ? `${t("bounties.statusAwarded")} (${f.awardedPoints})`
                                            : f.status === "valid"
                                              ? t("bounties.statusValid")
                                              : f.status === "triaged"
                                                ? t("bounties.statusTriaged")
                                                : f.status === "invalid"
                                                  ? t("bounties.statusInvalid")
                                                  : t("bounties.statusPending")}
                                        </span>
                                        {f.disclosed && (
                                          <span className="shrink-0 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                                            {t("bounties.disclosed")}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm">{f.content}</p>
                                    <div className="mt-2">
                                      <ReportComments bountyId={pubBounty.id} finding={f} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="space-y-2 rounded-lg border p-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("bounties.submitFinding")}
                              </p>
                              <input
                                value={findingTitle[pubBounty.id] ?? ""}
                                onChange={e => setFindingTitle(prev => ({ ...prev, [pubBounty.id]: e.target.value }))}
                                placeholder={t("bounties.findingTitleLabel")}
                                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={findingVulnType[pubBounty.id] ?? ""}
                                  onChange={e => setFindingVulnType(prev => ({ ...prev, [pubBounty.id]: e.target.value }))}
                                  className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-primary"
                                >
                                  <option value="">{t("bounties.vulnTypeLabel")}</option>
                                  {VULN_TYPE_OPTIONS.map(v => (
                                    <option key={v} value={v}>
                                      {t(`bounties.vulnTypes.${v}`)}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={findingSeverity[pubBounty.id] ?? "medium"}
                                  onChange={e => setFindingSeverity(prev => ({ ...prev, [pubBounty.id]: e.target.value }))}
                                  className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-primary"
                                >
                                  {SEVERITY_OPTIONS.map(s => (
                                    <option key={s} value={s}>
                                      {t(`bounties.severity.${s}`)} (+{SEVERITY_POINTS[s]})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <input
                                value={findingAsset[pubBounty.id] ?? ""}
                                onChange={e => setFindingAsset(prev => ({ ...prev, [pubBounty.id]: e.target.value }))}
                                placeholder={t("bounties.assetLabel")}
                                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <textarea
                                value={findingText[pubBounty.id] ?? ""}
                                onChange={e => setFindingText(prev => ({ ...prev, [pubBounty.id]: e.target.value }))}
                                placeholder={t("bounties.findingLabel")}
                                rows={2}
                                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                              <Button size="sm" onClick={() => submitFinding(pubBounty)} disabled={submittingFinding === pubBounty.id}>
                                {submittingFinding === pubBounty.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                                {t("bounties.submit")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })()
              )}
            </div>
          ) : view === "exam" ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{t("examTitle")}</CardTitle>
                  <CardDescription>
                    {t("questionOf", { current: current + 1, total: questions.length })}
                  </CardDescription>
                </div>
                <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${
                  secondsLeft < 300 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border"
                }`}>
                  <Timer className="h-4 w-4" />
                  {mm}:{ss}
                </div>
              </CardHeader>
              <CardContent>
                {/* Question grid */}
                <div className="mb-6 flex flex-wrap gap-2">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrent(i)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                        i === current
                          ? "border-primary bg-primary text-primary-foreground"
                          : answers[q.id] !== undefined
                            ? "border-success/50 bg-success/10 text-success"
                            : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <div className="mb-6">
                  <h3 className="mb-4 text-base font-medium">{questions[current]?.question}</h3>
                  {questions[current]?.imageUrl && (
                    <img
                      src={questions[current].imageUrl}
                      alt={questions[current].question}
                      referrerPolicy="no-referrer"
                      className="mb-4 max-h-64 w-full rounded-md border object-cover"
                    />
                  )}
                  <RadioGroup
                    value={questions[current] ? String(answers[questions[current].id] ?? "") : ""}
                    onValueChange={(v) => {
                      const q = questions[current]
                      if (!q) return
                      setAnswers(prev => ({ ...prev, [q.id]: Number(v) }))
                    }}
                  >
                    {questions[current]?.options.map((opt, i) => (
                      <label
                        key={i}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                          answers[questions[current].id] === i ? "border-primary bg-primary/5" : "hover:bg-muted"
                        }`}
                      >
                        <RadioGroupItem value={String(i)} id={`q-${questions[current].id}-${i}`} />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrent(prev => Math.max(0, prev - 1))}
                    disabled={current === 0}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> {t("prev")}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    {t("questionOf", { current: current + 1, total: questions.length })} · {answeredCount}/{questions.length}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setCurrent(prev => Math.min(questions.length - 1, prev + 1))}
                    disabled={current === questions.length - 1}
                  >
                    {t("next")} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-6 border-t pt-4">
                  <Button onClick={() => setShowSubmitConfirm(true)} disabled={submitting} className="w-full">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("submit")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : view === "results" && result ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    result.passed ? "bg-success/10" : "bg-destructive/10"
                  }`}>
                    {result.passed
                      ? <CheckCircle2 className="h-6 w-6 text-success" />
                      : <XCircle className="h-6 w-6 text-destructive" />}
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {result.passed ? t("passedTitle") : t("failedTitle")}
                    </CardTitle>
                    <CardDescription>
                      {result.passed ? t("passedDesc") : t("failedDesc")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-6">
                  <div>
                    <p className="text-3xl font-bold">
                      {result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">{t("percent")}</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{result.correct}/{result.total}</p>
                    <p className="text-xs text-muted-foreground">{t("correct")}</p>
                  </div>
                </div>
                {result.passed && (
                  <Button asChild>
                    <a href="/dashboard/chat?board=luminos">{t("viewChat")}</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : null}

        </PageLayout>
      </ScrollArea>

      {/* Start confirmation */}
      <Dialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("start")}</DialogTitle>
            <DialogDescription>{t("startWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={startExam} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("startConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit confirmation */}
      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("submit")}</DialogTitle>
            <DialogDescription>{t("submitConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={submitExam} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClubPageBoundary>
  )
}

// Page-level boundary: a render crash shows the error instead of a black page.
class ClubPageBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-sm font-medium text-destructive">Something went wrong on this page.</p>
          <p className="max-w-md break-words font-mono text-xs text-muted-foreground">{this.state.error}</p>
          <button
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Comment thread on a report — reporter, owner, and moderators discuss here.
function ReportComments({ bountyId, finding }: { bountyId: number; finding: BountyFinding }) {
  const t = useTranslations("luminosClub")
  const { toast } = useToast()
  const [comments, setComments] = useState<BountyComment[]>(finding.comments ?? [])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  async function send() {
    const content = text.trim()
    if (!content || busy || sending.current) return
    sending.current = true
    setBusy(true)
    try {
      const created = await apiFetch(
        API_ENDPOINTS.luminosBountyFindingComments
          .replace(":id", String(bountyId))
          .replace(":fid", String(finding.id)),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }
      )
      setComments(prev => [...prev, created])
      setText("")
    } catch (e: any) {
      toast({ title: t("bounties.commentFailed"), description: e.message, variant: "destructive" })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("bounties.comments")} ({comments.length})
      </p>
      {comments.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {comments.map(c => (
            <div key={c.id} className="rounded-md bg-secondary/40 px-3 py-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">{c.displayName}</p>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={t("bounties.commentPlaceholder")}
          className="h-8 w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" onClick={send} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("bounties.sendComment")}
        </Button>
      </div>
    </div>
  )
}
