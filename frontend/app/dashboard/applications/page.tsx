"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ExternalLink,
  Clock,
  XCircle,
  ChevronRight,
  Globe,
  Lock,
  Users,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Inbox,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Archive,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

type FormKind = "staff_application" | "abuse_report"

type ApplicationForm = {
  id: number
  title: string
  description?: string
  kind: FormKind
  slug?: string
  visibility?: "public_anonymous" | "public_users" | "private_invite"
  status?: "active" | "closed" | "archived"
  publicLink?: string | null
  active: boolean
  requiresAccount: boolean
  maxSubmissionsPerUser: number
  ipCooldownSeconds: number
}

type ApplicationSubmission = {
  id: number
  formId: number
  status: "pending" | "accepted" | "rejected" | "archived"
}

function getSubmissionDisplay(status: ApplicationSubmission["status"]) {
  switch (status) {
    case "accepted":
      return {
        label: "Approved",
        icon: BadgeCheck,
        className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        dot: "bg-emerald-400",
      }
    case "rejected":
      return {
        label: "Rejected",
        icon: Ban,
        className: "text-red-400 bg-red-500/10 border-red-500/20",
        dot: "bg-red-400",
      }
    case "archived":
      return {
        label: "Archived",
        icon: Archive,
        className: "text-gray-400 bg-gray-500/10 border-gray-500/20",
        dot: "bg-gray-400",
      }
    default:
      return {
        label: "Processing",
        icon: Clock,
        className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
        dot: "bg-yellow-400 animate-pulse",
      }
  }
}

function getKindConfig(kind: FormKind) {
  return kind === "abuse_report"
    ? {
        label: "Abuse Report",
        className: "text-orange-400 bg-orange-500/10 border-orange-500/20",
      }
    : {
        label: "Staff Application",
        className: "text-primary bg-primary/10 border-primary/20",
      }
}

function getVisibilityConfig(
  visibility: ApplicationForm["visibility"],
  requiresAccount: boolean
) {
  if (visibility === "public_anonymous" || !requiresAccount) {
    return { label: "Public", icon: Globe, className: "text-blue-400" }
  }
  if (visibility === "private_invite") {
    return { label: "Invite Only", icon: Lock, className: "text-orange-400" }
  }
  return { label: "Account Required", icon: Users, className: "text-purple-400" }
}

function StatusPill({
  status,
}: {
  status: ApplicationSubmission["status"]
}) {
  const config = getSubmissionDisplay(status)
  const Icon = config.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold",
        config.className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
      <Icon className="h-3 w-3 shrink-0" />
      {config.label}
    </span>
  )
}

function FormCard({
  form,
  submission,
  suspended,
}: {
  form: ApplicationForm
  submission?: ApplicationSubmission
  suspended?: boolean
}) {
  const effectiveStatus = form.status || (form.active ? "active" : "archived")
  const isPublicAnonymous =
    form.visibility === "public_anonymous" || !form.requiresAccount
  const isClosed = effectiveStatus !== "active"

  const visibilityConfig = getVisibilityConfig(form.visibility, form.requiresAccount)
  const kindConfig = getKindConfig(form.kind)
  const VisibilityIcon = visibilityConfig.icon

  const formUrl = form.slug
    ? `/forms/${form.slug}`
    : form.publicLink || null

  const getActionState = () => {
    if (suspended)
      return { type: "suspended" as const }
    if (submission)
      return { type: "submitted" as const, submission }
    if (isClosed)
      return { type: "closed" as const, status: effectiveStatus }
    if (isPublicAnonymous && formUrl)
      return { type: "public" as const, url: formUrl }
    if (!isPublicAnonymous && formUrl)
      return { type: "apply" as const, url: formUrl }
    return { type: "no_link" as const }
  }

  const action = getActionState()

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-md",
        action.type === "apply" || action.type === "public"
          ? "border-border hover:border-primary/30 cursor-pointer"
          : "border-border",
        isClosed && "opacity-75",
        submission?.status === "accepted" && "border-emerald-500/20"
      )}
    >
      {/* Top accent bar */}
      <div
        className={cn(
          "h-0.5 w-full",
          submission?.status === "accepted"
            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
            : submission?.status === "rejected"
              ? "bg-gradient-to-r from-red-500 to-red-400"
              : submission
                ? "bg-gradient-to-r from-yellow-500 to-yellow-400"
                : isClosed
                  ? "bg-secondary"
                  : "bg-gradient-to-r from-primary to-primary/50"
        )}
      />

      <div className="p-4 md:p-5">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className={cn(
                "mt-0.5 shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border",
                kindConfig.className
              )}
            >
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate leading-tight mb-1">
                {form.title}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium",
                    kindConfig.className
                  )}
                >
                  {kindConfig.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium",
                    visibilityConfig.className
                  )}
                >
                  <VisibilityIcon className="h-3 w-3" />
                  {visibilityConfig.label}
                </span>
                {isClosed && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-secondary bg-secondary/50 text-[11px] font-medium text-muted-foreground">
                    {effectiveStatus === "archived" ? "Archived" : "Closed"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {submission && (
            <div className="shrink-0">
              <StatusPill status={submission.status} />
            </div>
          )}
        </div>

        {/* Description */}
        {form.description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2 pl-12">
            {form.description}
          </p>
        )}

        {/* Action Area */}
        <div className="pl-12">
          {action.type === "suspended" && (
            <div className="flex items-center gap-2 text-sm text-destructive/80">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Account suspended — cannot submit applications</span>
            </div>
          )}

          {action.type === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Application submitted •{" "}
                <span className="font-medium text-foreground">
                  {getSubmissionDisplay(action.submission.status).label}
                </span>
              </span>
            </div>
          )}

          {action.type === "closed" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>Not accepting submissions</span>
            </div>
          )}

          {action.type === "no_link" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Form link unavailable</span>
            </div>
          )}

          {(action.type === "apply" || action.type === "public") && (
            <a
              href={action.url}
              target={action.type === "public" ? "_blank" : undefined}
              rel={action.type === "public" ? "noreferrer" : undefined}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98]",
                action.type === "apply"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  : "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
              )}
            >
              {action.type === "apply" ? (
                <>
                  Open Application
                  <ArrowUpRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Open Form
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: number
  icon: React.ElementType
  className?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", className)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default function ApplicationsPage() {
  const { user } = useAuth()
  const [forms, setForms] = useState<ApplicationForm[]>([])
  const [mySubmissions, setMySubmissions] = useState<ApplicationSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [formsRes, publicFormsRes, myRes] = await Promise.all([
        apiFetch(API_ENDPOINTS.applicationsForms),
        apiFetch(API_ENDPOINTS.publicApplicationsForms),
        apiFetch(API_ENDPOINTS.applicationsMy),
      ])

      const merged: ApplicationForm[] = []
      const seen = new Set<number>()
      for (const source of [formsRes, publicFormsRes]) {
        if (!Array.isArray(source)) continue
        for (const row of source) {
          const id = Number((row as any)?.id)
          if (!Number.isFinite(id) || seen.has(id)) continue
          seen.add(id)
          merged.push(row as ApplicationForm)
        }
      }

      setForms(merged)
      setMySubmissions(Array.isArray(myRes) ? myRes : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load application data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const myFormSubmissionMap = useMemo(() => {
    const map = new Map<number, ApplicationSubmission>()
    for (const row of mySubmissions) {
      if (!map.has(Number(row.formId))) map.set(Number(row.formId), row)
    }
    return map
  }, [mySubmissions])

  const stats = useMemo(() => ({
    total: forms.length,
    active: forms.filter((f) => (f.status || (f.active ? "active" : "archived")) === "active").length,
    submitted: mySubmissions.length,
    approved: mySubmissions.filter((s) => s.status === "accepted").length,
  }), [forms, mySubmissions])

  const sortedForms = useMemo(() => {
    return [...forms].sort((a, b) => {
      const aStatus = a.status || (a.active ? "active" : "archived")
      const bStatus = b.status || (b.active ? "active" : "archived")
      const aSubmitted = myFormSubmissionMap.has(a.id)
      const bSubmitted = myFormSubmissionMap.has(b.id)
      if (aStatus === "active" && bStatus !== "active") return -1
      if (bStatus === "active" && aStatus !== "active") return 1
      if (!aSubmitted && bSubmitted) return -1
      if (aSubmitted && !bSubmitted) return 1
      return 0
    })
  }, [forms, myFormSubmissionMap])

  return (
    <FeatureGuard feature="applications">
      <>
        <PanelHeader
          title="Applications"
          description="Apply for roles and track your submissions"
        />
        <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
          <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl mx-auto">

            {/* Suspended Banner */}
            {user?.suspended && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-destructive">Account Suspended</p>
                  <p className="text-xs text-destructive/80 mt-0.5">
                    You cannot submit applications while your account is suspended.
                  </p>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="shrink-0 text-destructive/60 hover:text-destructive transition-colors"
                >
                  ×
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading applications...</p>
              </div>
            ) : (
              <>
                {/* Stats Row */}
                {forms.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      label="Available Forms"
                      value={stats.total}
                      icon={FileText}
                      className="bg-primary/10 text-primary"
                    />
                    <StatCard
                      label="Open Now"
                      value={stats.active}
                      icon={CheckCircle2}
                      className="bg-emerald-500/10 text-emerald-400"
                    />
                    <StatCard
                      label="My Submissions"
                      value={stats.submitted}
                      icon={Clock}
                      className="bg-blue-500/10 text-blue-400"
                    />
                    <StatCard
                      label="Approved"
                      value={stats.approved}
                      icon={BadgeCheck}
                      className="bg-purple-500/10 text-purple-400"
                    />
                  </div>
                )}

                {/* How it works */}
                {forms.length > 0 && mySubmissions.length === 0 && !user?.suspended && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground mb-1">How to apply</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Click <strong className="text-foreground">Open Application</strong> on any active form below.
                          You'll be taken to the form page where you can fill in your details and submit.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Forms List */}
                {forms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
                      <Inbox className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">No forms available</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        Application forms will appear here when they're available.
                      </p>
                    </div>
                    <button
                      onClick={loadData}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Available Forms ({sortedForms.length})
                      </h2>
                      <button
                        onClick={loadData}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {sortedForms.map((form) => (
                      <FormCard
                        key={form.id}
                        form={form}
                        submission={myFormSubmissionMap.get(form.id)}
                        suspended={!!user?.suspended}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </>
    </FeatureGuard>
  )
}