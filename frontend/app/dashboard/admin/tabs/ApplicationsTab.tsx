"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Edit3,
  FileText,
  Globe,
  GripVertical,
  Hash,
  Inbox,
  Layers,
  Link2,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Tag,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type FormQuestion = {
  id: string
  label: string
  type:
    | "short_text" | "long_text" | "email" | "number"
    | "select" | "multi_select" | "checkbox" | "date" | "url"
  required?: boolean
  placeholder?: string
  options?: string[]
}

type FormSchema = {
  title?: string
  description?: string
  questions: FormQuestion[]
}

type FormVisibility = "public_anonymous" | "public_users" | "private_invite"
type FormStatus     = "active" | "archived" | "closed"

type AppForm = {
  id: number
  title: string
  description?: string
  slug?: string
  kind: "staff_application" | "abuse_report"
  visibility: FormVisibility
  status: FormStatus
  schema?: FormSchema
  publicLink?: string | null
}

type Invite = {
  id: number
  token: string
  label?: string | null
  email?: string | null
  uses: number
  maxUses?: number | null
  expiresAt?: string | null
  revoked: boolean
  link?: string
}

type Submission = {
  id: number
  formId: number
  status: "pending" | "accepted" | "rejected" | "archived"
  content: string
  createdAt: string
  form?: { id: number; title: string; slug?: string } | null
  user?: { email?: string; firstName?: string; lastName?: string } | null
  ipAddress?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES: Array<FormQuestion["type"]> = [
  "short_text", "long_text", "email", "number",
  "select", "multi_select", "checkbox", "date", "url",
]

const FORM_STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
  active:   { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: "Active"   },
  closed:   { badge: "border-red-500/30 bg-red-500/10 text-red-400",             dot: "bg-red-400",     label: "Closed"   },
  archived: { badge: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",          dot: "bg-zinc-400",    label: "Archived" },
}

const SUBMISSION_STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
  pending:  { badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",   dot: "bg-yellow-400",  label: "Pending"  },
  accepted: { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", label: "Accepted" },
  rejected: { badge: "border-red-500/30 bg-red-500/10 text-red-400",            dot: "bg-red-400",     label: "Rejected" },
  archived: { badge: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",         dot: "bg-zinc-400",    label: "Archived" },
}

const VISIBILITY_CONFIG: Record<FormVisibility, { icon: React.ElementType; label: string; badge: string }> = {
  public_anonymous: { icon: Globe, label: "Public",      badge: "border-blue-500/30 bg-blue-500/10 text-blue-400"       },
  public_users:     { icon: Users, label: "Users only",  badge: "border-purple-500/30 bg-purple-500/10 text-purple-400" },
  private_invite:   { icon: Lock,  label: "Invite only", badge: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQuestion(idx: number): FormQuestion {
  return { id: `q${idx}_${Date.now()}`, label: "", type: "short_text", required: false, placeholder: "", options: [] }
}

function getOrigin() {
  if (typeof window === "undefined") return ""
  return window.location.origin
}

function formatDate(d?: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full min-w-0 rounded-lg border border-border bg-secondary/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
const selectCls =
  "h-10 w-full min-w-0 rounded-lg border border-border bg-secondary/30 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all cursor-pointer"
const textareaCls =
  "w-full min-w-0 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all resize-none"

function StatusDot({ status, config }: { status: string; config: Record<string, { badge: string; dot: string; label: string }> }) {
  const c = config[status] ?? Object.values(config)[0]
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
      {c.label}
    </Badge>
  )
}

function VisiBadge({ visibility }: { visibility: FormVisibility }) {
  const c = VISIBILITY_CONFIG[visibility]
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.badge)}>
      <c.icon className="h-2.5 w-2.5 shrink-0" />
      {c.label}
    </Badge>
  )
}

function Field({ label, required, hint, children }: {
  label?: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      {label && (
        <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {label}{required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionHeader({
  icon: Icon, title, badge, action,
}: {
  icon?: React.ElementType; title: string
  badge?: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {Icon && (
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
        )}
        <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
        {badge}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-secondary border border-border text-[10px] font-bold text-muted-foreground tabular-nums shrink-0">
      {count}
    </span>
  )
}

function EmptyRow({ icon: Icon, text, colSpan = 6 }: {
  icon: React.ElementType; text: string; colSpan?: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-2">
          <Icon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </td>
    </tr>
  )
}

function EmptyCard({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-12">
      <div className="flex flex-col items-center gap-2">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

// ─── Question builder card ────────────────────────────────────────────────────

function QuestionCard({
  question, index, total, questionTypeLabels, optionDraft,
  onUpdate, onRemove, onOptionDraftChange, onAddOption, onRemoveOption,
}: {
  question: FormQuestion; index: number; total: number
  questionTypeLabels: Record<FormQuestion["type"], string>; optionDraft: string
  onUpdate: (p: Partial<FormQuestion>) => void; onRemove: () => void
  onOptionDraftChange: (v: string) => void; onAddOption: () => void
  onRemoveOption: (i: number) => void
}) {
  const t = useTranslations("adminApplicationsTab")
  const hasOptions = question.type === "select" || question.type === "multi_select" || question.type === "checkbox"

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary/20 border-b border-border/60">
        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
        <span className="text-[10px] font-black text-muted-foreground/60 font-mono bg-secondary px-1.5 py-0.5 rounded shrink-0">
          {t("questions.shortLabel")} {index + 1}
        </span>
        <span className="text-xs text-foreground font-medium truncate flex-1 min-w-0">
          {question.label || t("questions.questionFallback", { index: index + 1 })}
        </span>
        <span className="text-[10px] font-semibold text-primary/80 bg-primary/8 border border-primary/15 px-2 py-0.5 rounded-full hidden sm:inline shrink-0">
          {questionTypeLabels[question.type]}
        </span>
        <button
          onClick={onRemove} disabled={total === 1}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Fields */}
      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("builder.questionFields.label")}>
          <input value={question.label || ""} onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder={t("builder.questionFields.labelPlaceholder", { index: index + 1 })} className={inputCls} />
        </Field>
        <Field label={t("builder.questionFields.type")}>
          <select value={question.type} onChange={(e) => {
            const t = e.target.value as FormQuestion["type"]
            const sel = t === "select" || t === "multi_select" || t === "checkbox"
            onUpdate({ type: t, options: sel ? question.options || [] : [] })
          }} className={selectCls}>
            {QUESTION_TYPES.map((qt) => <option key={qt} value={qt}>{questionTypeLabels[qt]}</option>)}
          </select>
        </Field>
        <Field label={t("builder.questionFields.placeholder")}>
          <input value={question.placeholder || ""} onChange={(e) => onUpdate({ placeholder: e.target.value })}
            placeholder={t("builder.questionFields.placeholderHint")} className={inputCls} />
        </Field>
        <div className="flex items-end">
          <button type="button" onClick={() => onUpdate({ required: !question.required })}
            className={cn(
              "flex items-center gap-3 w-full h-10 px-3 rounded-lg border transition-all text-sm font-medium",
              question.required
                ? "border-primary/40 bg-primary/8 text-primary"
                : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
            )}>
            <div className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", question.required ? "bg-primary" : "bg-secondary border border-border")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", question.required ? "translate-x-4" : "translate-x-0")} />
            </div>
            {t("builder.questionFields.required")}
          </button>
        </div>
      </div>

      {/* Options */}
      {hasOptions && (
        <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-border/60 pt-3">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("builder.questionFields.options")}</span>
            <CountBadge count={(question.options || []).length} />
          </div>
          {(question.options || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(question.options || []).map((opt, oi) => (
                <span key={oi} className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground">
                  <span className="max-w-[120px] truncate">{opt}</span>
                  <button onClick={() => onRemoveOption(oi)} className="text-muted-foreground/60 hover:text-red-400 transition-colors shrink-0">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 italic">{t("builder.questionFields.noOptionsYet")}</p>
          )}
          <div className="flex gap-2 min-w-0">
            <input value={optionDraft} onChange={(e) => onOptionDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddOption() } }}
              placeholder={t("builder.questionFields.optionInputPlaceholder")}
              className={cn(inputCls, "flex-1 min-w-0 h-9 text-xs")} />
            <button onClick={onAddOption}
              className="shrink-0 h-9 px-3 rounded-lg border border-border bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors">
              {t("actions.add")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ApplicationsTab() {
  const t = useTranslations("adminApplicationsTab")

  const questionTypeLabels: Record<FormQuestion["type"], string> = {
    short_text:   t("questionTypes.shortText"),
    long_text:    t("questionTypes.longText"),
    email:        t("questionTypes.email"),
    number:       t("questionTypes.number"),
    select:       t("questionTypes.singleSelect"),
    multi_select: t("questionTypes.multiSelect"),
    checkbox:     t("questionTypes.checkbox"),
    date:         t("questionTypes.date"),
    url:          t("questionTypes.url"),
  }

  // ── State ──────────────────────────────────────────────────────────────────

  const [forms, setForms]           = useState<AppForm[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [invites, setInvites]       = useState<Invite[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Active form selection
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null)

  // Builder fields
  const [bTitle, setBTitle]         = useState("")
  const [bDesc, setBDesc]           = useState("")
  const [bSlug, setBSlug]           = useState("")
  const [bKind, setBKind]           = useState<"staff_application" | "abuse_report">("staff_application")
  const [bVis, setBVis]             = useState<FormVisibility>("public_users")
  const [bStatus, setBStatus]       = useState<FormStatus>("active")
  const [bQuestions, setBQuestions] = useState<FormQuestion[]>([makeQuestion(1)])
  const [showBuilder, setShowBuilder] = useState(false)

  // Invite fields
  const [invLabel, setInvLabel]     = useState("")
  const [invEmail, setInvEmail]     = useState("")
  const [invMaxUses, setInvMaxUses] = useState("")
  const [invExpires, setInvExpires] = useState("")

  // UI state
  const [formSearch, setFormSearch]       = useState("")
  const [subSearch, setSubSearch]         = useState("")
  const [subFilter, setSubFilter]         = useState("all")
  const [optionDrafts, setOptionDrafts]   = useState<Record<number, string>>({})
  const [copiedId, setCopiedId]           = useState<string | null>(null)
  const [expandedSubs, setExpandedSubs]   = useState<Set<number>>(new Set())
  const [selectedSubIds, setSelectedSubIds] = useState<number[]>([])
  const [subPage, setSubPage]             = useState(1)
  const SUB_PER_PAGE = 20

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedForm = useMemo(
    () => forms.find((f) => Number(f.id) === Number(selectedFormId)) ?? null,
    [forms, selectedFormId]
  )

  const filteredForms = useMemo(() => {
    const q = formSearch.trim().toLowerCase()
    if (!q) return forms
    return forms.filter((f) =>
      [f.title, f.description, f.slug, f.kind, f.visibility, f.status]
        .some((v) => String(v || "").toLowerCase().includes(q))
    )
  }, [forms, formSearch])

  const baseSubs = useMemo(() =>
    selectedFormId
      ? submissions.filter((s) => Number(s.formId) === Number(selectedFormId))
      : submissions,
    [submissions, selectedFormId]
  )

  const filteredSubs = useMemo(() => {
    let list = subFilter !== "all" ? baseSubs.filter((s) => s.status === subFilter) : baseSubs
    const q = subSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => {
        const name = [s.user?.firstName, s.user?.lastName].filter(Boolean).join(" ")
        return [s.user?.email, name, s.ipAddress, s.form?.title].some(
          (v) => String(v || "").toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [baseSubs, subFilter, subSearch])

  const pagedSubs = useMemo(() => {
    const start = (subPage - 1) * SUB_PER_PAGE
    return filteredSubs.slice(start, start + SUB_PER_PAGE)
  }, [filteredSubs, subPage])

  const subTotalPages = Math.max(1, Math.ceil(filteredSubs.length / SUB_PER_PAGE))

  const subCounts = useMemo(() => ({
    all:      baseSubs.length,
    pending:  baseSubs.filter((s) => s.status === "pending").length,
    accepted: baseSubs.filter((s) => s.status === "accepted").length,
    rejected: baseSubs.filter((s) => s.status === "rejected").length,
    archived: baseSubs.filter((s) => s.status === "archived").length,
  }), [baseSubs])

  const allPageSelected =
    pagedSubs.length > 0 && pagedSubs.every((s) => selectedSubIds.includes(s.id))

  // ── Data ───────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [f, s] = await Promise.all([
        apiFetch(API_ENDPOINTS.adminApplicationsForms),
        apiFetch(API_ENDPOINTS.adminApplicationsSubmissions),
      ])
      const fd: AppForm[] = Array.isArray(f) ? f : []
      setForms(fd)
      setSubmissions(Array.isArray(s) ? s : [])
      if (!selectedFormId && fd.length > 0) setSelectedFormId(Number(fd[0].id))
    } catch (err: any) {
      setError(err?.message || "Failed to load data")
    } finally { setLoading(false) }
  }, [selectedFormId])

  const loadInvites = useCallback(async (formId: number, slug?: string) => {
    try {
      const data = await apiFetch(
        API_ENDPOINTS.adminApplicationInvites.replace(":id", String(formId)) +
        (slug ? `?slug=${encodeURIComponent(slug)}` : "")
      )
      setInvites(Array.isArray(data) ? data : [])
    } catch { setInvites([]) }
  }, [])

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (!selectedForm) { setInvites([]); return }
    if (selectedForm.visibility === "private_invite") loadInvites(selectedForm.id, selectedForm.slug)
    else setInvites([])
  }, [selectedForm?.id, selectedForm?.visibility, selectedForm?.slug])

  // ── Builder ────────────────────────────────────────────────────────────────

  const openNewForm = useCallback(() => {
    setSelectedFormId(null)
    setBTitle(""); setBDesc(""); setBSlug("")
    setBKind("staff_application"); setBVis("public_users"); setBStatus("active")
    setBQuestions([makeQuestion(1)])
    setShowBuilder(true)
  }, [])

  const openEditForm = useCallback((form: AppForm) => {
    setSelectedFormId(form.id)
    setBTitle(form.title || ""); setBDesc(form.description || ""); setBSlug(form.slug || "")
    setBKind(form.kind || "staff_application")
    setBVis(form.visibility || "public_users"); setBStatus(form.status || "active")
    setBQuestions(
      Array.isArray(form.schema?.questions) && form.schema!.questions.length > 0
        ? form.schema!.questions : [makeQuestion(1)]
    )
    setShowBuilder(true)
  }, [])

  const duplicateForm = useCallback((form: AppForm) => {
    setSelectedFormId(null)
    setBTitle(`${form.title} (Copy)`); setBDesc(form.description || ""); setBSlug("")
    setBKind(form.kind); setBVis(form.visibility); setBStatus("active")
    setBQuestions(
      Array.isArray(form.schema?.questions) && form.schema!.questions.length > 0
        ? form.schema!.questions.map((q, i) => ({ ...q, id: q.id || `q${i + 1}`, options: [...(q.options || [])] }))
        : [makeQuestion(1)]
    )
    setShowBuilder(true)
  }, [])

  const saveForm = useCallback(async () => {
    if (!bTitle.trim()) { setError("Form title is required"); return }
    setSaving(true); setError(null)
    try {
      const schema: FormSchema = {
        title: bTitle.trim(), description: bDesc.trim() || undefined,
        questions: bQuestions.map((q, i) => ({
          ...q,
          id: q.id?.trim() || `q${i + 1}`,
          label: q.label?.trim() || `Question ${i + 1}`,
          options: (q.options || []).map((o) => String(o).trim()).filter(Boolean),
        })),
      }
      const payload = { title: bTitle.trim(), description: bDesc.trim(), slug: bSlug.trim() || undefined, kind: bKind, visibility: bVis, status: bStatus, schema }
      if (selectedFormId) {
        await apiFetch(API_ENDPOINTS.adminApplicationForm.replace(":id", String(selectedFormId)), { method: "PUT", body: JSON.stringify(payload) })
      } else {
        await apiFetch(API_ENDPOINTS.adminApplicationsForms, { method: "POST", body: JSON.stringify(payload) })
      }
      await loadAll()
      setShowBuilder(false)
    } catch (err: any) { setError(err?.message || "Failed to save") }
    finally { setSaving(false) }
  }, [bTitle, bDesc, bSlug, bKind, bVis, bStatus, bQuestions, selectedFormId, loadAll])

  const deleteForm = useCallback(async (id: number) => {
    if (!confirm(t("confirm.deleteFormWithSubmissions"))) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationForm.replace(":id", String(id)), { method: "DELETE" })
      if (selectedFormId === id) { setSelectedFormId(null); setShowBuilder(false) }
      await loadAll()
    } catch (err: any) { setError(err?.message || "Failed to delete") }
  }, [selectedFormId, loadAll, t])

  // ── Invites ────────────────────────────────────────────────────────────────

  const createInvite = useCallback(async () => {
    if (!selectedForm) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationInvites.replace(":id", String(selectedForm.id)), {
        method: "POST",
        body: JSON.stringify({
          label: invLabel.trim() || undefined, email: invEmail.trim() || undefined,
          maxUses: invMaxUses.trim() ? Number(invMaxUses) : undefined,
          expiresHours: invExpires.trim() ? Number(invExpires) : undefined,
        }),
      })
      setInvLabel(""); setInvEmail(""); setInvMaxUses(""); setInvExpires("")
      await loadInvites(selectedForm.id, selectedForm.slug)
    } catch (err: any) { setError(err?.message || "Failed to create invite") }
  }, [selectedForm, invLabel, invEmail, invMaxUses, invExpires, loadInvites])

  const revokeInvite = useCallback(async (inviteId: number) => {
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationInvite.replace(":inviteId", String(inviteId)), { method: "DELETE" })
      if (selectedForm) await loadInvites(selectedForm.id, selectedForm.slug)
    } catch (err: any) { setError(err?.message || "Failed to revoke") }
  }, [selectedForm, loadInvites])

  // ── Submissions ────────────────────────────────────────────────────────────

  const updateSubStatus = useCallback(async (id: number, status: Submission["status"]) => {
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationSubmission.replace(":id", String(id)), {
        method: "PUT", body: JSON.stringify({ status }),
      })
      await loadAll()
    } catch (err: any) { setError(err?.message || "Failed to update") }
  }, [loadAll])

  const deleteSub = useCallback(async (id: number) => {
    if (!confirm(t("confirm.deleteSubmission"))) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationSubmission.replace(":id", String(id)), { method: "DELETE" })
      setSelectedSubIds((p) => p.filter((v) => v !== id))
      await loadAll()
    } catch (err: any) { setError(err?.message || "Failed to delete") }
  }, [loadAll, t])

  const bulkDeleteSubs = useCallback(async () => {
    if (!selectedSubIds.length) return
    if (!confirm(t("confirm.bulkDeleteSubmissions", { count: selectedSubIds.length }))) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationsSubmissionsBulkDelete, {
        method: "POST", body: JSON.stringify({ ids: selectedSubIds }),
      })
      setSelectedSubIds([])
      await loadAll()
    } catch (err: any) { setError(err?.message || "Failed to bulk delete") }
  }, [selectedSubIds, loadAll, t])

  // ── Clipboard ──────────────────────────────────────────────────────────────

  const copy = useCallback(async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000) }
    catch {}
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 w-full overflow-x-hidden">

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <span className="text-sm text-destructive flex-1 min-w-0 break-words">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-destructive/60 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — FORMS
      ════════════════════════════════════════════════════════════════════ */}

      {/* Forms search / header bar */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
          <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text" placeholder={t("forms.searchPlaceholder")} value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
              {formSearch && (
                <button onClick={() => setFormSearch("")} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">{forms.length} {t("forms.formsCount")}</span>
            <button onClick={loadAll} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={t("actions.refresh")}>
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={openNewForm}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> {t("actions.newForm")}
            </button>
          </div>
        </div>
      </div>

      {/* Forms — desktop table */}
      <div className="rounded-xl border border-border bg-card hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{t("table.form")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.type")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.visibility")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.submissions")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 animate-pulse">
                    {[180, 100, 100, 80, 60, 80].map((w, j) => (
                      <td key={j} className={cn("px-4 py-3", j === 5 && "text-right")}>
                        <div className={cn("h-4 rounded bg-secondary", j === 5 && "ml-auto")} style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredForms.length === 0 ? (
                <EmptyRow icon={ClipboardList} text={formSearch ? t("forms.noFormsMatch") : t("forms.noFormsYet")} />
              ) : (
                filteredForms.map((form) => {
                  const publicLink = form.slug ? `${getOrigin()}/forms/${form.slug}` : ""
                  const formSubs = submissions.filter((s) => Number(s.formId) === Number(form.id))
                  const pending = formSubs.filter((s) => s.status === "pending").length
                  const isEditing = Number(selectedFormId) === Number(form.id) && showBuilder

                  return (
                    <tr key={form.id} className={cn("border-b border-border/50 transition-colors group", isEditing ? "bg-primary/5" : "hover:bg-secondary/20")}>
                      {/* Form name */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{form.title}</span>
                          {form.description && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{form.description}</span>
                          )}
                          {publicLink && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">/forms/{form.slug}</span>
                              <button onClick={() => copy(publicLink, `link-${form.id}`)} className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                                {copiedId === `link-${form.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Kind */}
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] border-border bg-secondary/50 text-muted-foreground">
                          {form.kind === "staff_application" ? t("builder.types.staffApplication") : t("builder.types.abuseReport")}
                        </Badge>
                      </td>

                      {/* Visibility */}
                      <td className="px-4 py-3">
                        <VisiBadge visibility={form.visibility} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusDot status={form.status} config={FORM_STATUS_CONFIG} />
                      </td>

                      {/* Submissions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">{formSubs.length}</span>
                          {pending > 0 && (
                            <span className="text-[10px] text-yellow-400">{pending} pending</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditForm(form)} title={t("actions.edit")}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => duplicateForm(form)} title={t("actions.template")}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                            <Layers className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { setSelectedFormId(form.id); setShowBuilder(false); setSubFilter("all") }}
                            title={t("actions.viewSubmissions")}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                            <Inbox className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteForm(form.id)} title={t("actions.deleteForm")}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Forms — mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
              <div className="h-4 w-40 rounded bg-secondary" />
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-secondary" />
                <div className="h-5 w-20 rounded-full bg-secondary" />
              </div>
              <div className="grid grid-cols-3 gap-px h-9 rounded bg-secondary" />
            </div>
          ))
        ) : filteredForms.length === 0 ? (
          <EmptyCard icon={ClipboardList} text={formSearch ? t("forms.noFormsMatch") : t("forms.noFormsYet")} />
        ) : (
          filteredForms.map((form) => {
            const publicLink = form.slug ? `${getOrigin()}/forms/${form.slug}` : ""
            const formSubs = submissions.filter((s) => Number(s.formId) === Number(form.id))
            const pending = formSubs.filter((s) => s.status === "pending").length

            return (
              <div key={form.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Top */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{form.title}</p>
                        {form.description && (
                          <p className="text-[11px] text-muted-foreground truncate">{form.description}</p>
                        )}
                      </div>
                      <StatusDot status={form.status} config={FORM_STATUS_CONFIG} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <VisiBadge visibility={form.visibility} />
                      <Badge variant="outline" className="text-[10px] border-border bg-secondary/50 text-muted-foreground">
                        {form.kind === "staff_application" ? "Staff" : "Abuse"}
                      </Badge>
                      {pending > 0 && (
                        <Badge variant="outline" className="text-[10px] border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                          {pending} pending
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.submissions")}</p>
                    <p className="text-sm font-semibold text-foreground">{formSubs.length}</p>
                  </div>
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.link")}</p>
                    {publicLink ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground truncate flex-1 min-w-0">/forms/{form.slug}</span>
                        <button onClick={() => copy(publicLink, `link-${form.id}`)} className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                          {copiedId === `link-${form.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">—</p>
                    )}
                  </div>
                </div>

                {/* Action bar — mirrors UsersTab */}
                <div className="flex items-center border-t border-border divide-x divide-border">
                  <button onClick={() => openEditForm(form)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>{t("actions.edit")}</span>
                  </button>
                  <button onClick={() => { setSelectedFormId(form.id); setShowBuilder(false); setSubFilter("all") }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <Inbox className="h-3.5 w-3.5" />
                    <span>{t("actions.view")}</span>
                  </button>
                  <button onClick={() => duplicateForm(form)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <Layers className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteForm(form.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — FORM BUILDER (slide-in panel style)
      ════════════════════════════════════════════════════════════════════ */}

      {showBuilder && (
        <div className="rounded-xl border border-border bg-card overflow-hidden w-full">
          <SectionHeader
            icon={selectedFormId ? Edit3 : Plus}
            title={selectedFormId ? t("builder.editForm") : t("builder.createForm")}
            badge={selectedFormId ? <CountBadge count={bQuestions.length} /> : undefined}
            action={
              <button onClick={() => setShowBuilder(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X className="h-4 w-4" />
              </button>
            }
          />

          <div className="p-4 space-y-4 min-w-0">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <Field label={t("builder.fields.formTitle")} required>
                <input value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder={t("builder.fields.formTitlePlaceholder")} className={inputCls} />
              </Field>
              <Field label={t("builder.fields.customSlug")} hint={t("builder.fields.customSlugHint")}>
                <input value={bSlug} onChange={(e) => setBSlug(e.target.value)} placeholder={t("builder.fields.customSlugPlaceholder")} className={inputCls} />
              </Field>
              <Field label={t("builder.fields.formType")}>
                <select value={bKind} onChange={(e) => setBKind(e.target.value as any)} className={selectCls}>
                  <option value="staff_application">{t("builder.types.staffApplication")}</option>
                  <option value="abuse_report">{t("builder.types.abuseReport")}</option>
                </select>
              </Field>
              <Field label={t("builder.fields.visibility")}>
                <select value={bVis} onChange={(e) => setBVis(e.target.value as FormVisibility)} className={selectCls}>
                  <option value="public_anonymous">{t("builder.visibility.publicAnonymous")}</option>
                  <option value="public_users">{t("builder.visibility.publicUsers")}</option>
                  <option value="private_invite">{t("builder.visibility.privateInvite")}</option>
                </select>
              </Field>
              <Field label={t("builder.fields.status")}>
                <select value={bStatus} onChange={(e) => setBStatus(e.target.value as FormStatus)} className={selectCls}>
                  <option value="active">{t("status.active")}</option>
                  <option value="closed">{t("status.closedViewOnly")}</option>
                  <option value="archived">{t("status.archived")}</option>
                </select>
              </Field>
            </div>

<Field label={t("builder.fields.description")}>
                <textarea value={bDesc} onChange={(e) => setBDesc(e.target.value)}
                  placeholder={t("builder.fields.descriptionPlaceholder")} rows={2} className={textareaCls} />
            </Field>

            {/* Questions */}
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-foreground">{t("questions.title")}</span>
                  <CountBadge count={bQuestions.length} />
                </div>
                <button
                  onClick={() => setBQuestions((p) => [...p, makeQuestion(p.length + 1)])}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("actions.add")}
                </button>
              </div>

              <div className="space-y-2.5 min-w-0">
                {bQuestions.map((q, idx) => (
                  <QuestionCard
                    key={`${q.id}-${idx}`} question={q} index={idx} total={bQuestions.length}
                    questionTypeLabels={questionTypeLabels} optionDraft={optionDrafts[idx] || ""}
                    onUpdate={(patch) => setBQuestions((p) => p.map((item, i) => i === idx ? { ...item, ...patch } : item))}
                    onRemove={() => setBQuestions((p) => p.filter((_, i) => i !== idx))}
                    onOptionDraftChange={(val) => setOptionDrafts((p) => ({ ...p, [idx]: val }))}
                    onAddOption={() => {
                      const draft = String(optionDrafts[idx] || "").trim()
                      if (!draft) return
                      const cur = q.options || []
                      if (cur.includes(draft)) { setOptionDrafts((p) => ({ ...p, [idx]: "" })); return }
                      setBQuestions((p) => p.map((item, i) => i === idx ? { ...item, options: [...(item.options || []), draft] } : item))
                      setOptionDrafts((p) => ({ ...p, [idx]: "" }))
                    }}
                    onRemoveOption={(oi) => setBQuestions((p) => p.map((item, i) => i === idx ? { ...item, options: (item.options || []).filter((_, j) => j !== oi) } : item))}
                  />
                ))}
              </div>
            </div>

            {/* Save row */}
            <div className="flex items-center gap-3 pt-2 border-t border-border flex-wrap">
              <button onClick={saveForm} disabled={saving || !bTitle.trim()}
                className="flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {saving
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> {t("actions.saving")}</>
                  : <><Send className="h-4 w-4" /> {selectedFormId ? t("actions.updateForm") : t("actions.createForm")}</>}
              </button>
              <button onClick={() => setShowBuilder(false)}
                className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                {t("actions.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — INVITE LINKS (only for private_invite forms)
      ════════════════════════════════════════════════════════════════════ */}

      {selectedForm?.visibility === "private_invite" && !showBuilder && (
        <div className="rounded-xl border border-border bg-card overflow-hidden w-full">
          <SectionHeader
            icon={Link2}
            title={`${t("invites.title")} — ${selectedForm.title}`}
            badge={<CountBadge count={invites.length} />}
          />

          <div className="p-4 space-y-4 min-w-0">
            {/* Create invite — compact inline grid */}
            <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3 min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("invites.createNewInvite")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
                <Field label={t("invites.fields.label")}>
                  <input value={invLabel} onChange={(e) => setInvLabel(e.target.value)} placeholder={t("invites.placeholders.label")} className={inputCls} />
                </Field>
                <Field label={t("invites.fields.emailOptional")}>
                  <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder={t("invites.placeholders.email")} className={inputCls} />
                </Field>
                <Field label={t("invites.fields.maxUses")} hint={t("invites.fields.maxUsesHint")}>
                  <input value={invMaxUses} onChange={(e) => setInvMaxUses(e.target.value)} placeholder={t("invites.placeholders.maxUses")} type="number" min="1" className={inputCls} />
                </Field>
                <Field label={t("invites.fields.expiresHours")} hint={t("invites.fields.expiresHoursHint")}>
                  <input value={invExpires} onChange={(e) => setInvExpires(e.target.value)} placeholder={t("invites.placeholders.expiresHours")} type="number" min="1" className={inputCls} />
                </Field>
              </div>
              <button onClick={createInvite}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> {t("actions.createInviteLink")}
              </button>
            </div>

            {/* Invite list — desktop table */}
            {invites.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden hidden lg:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground bg-secondary/10">
                      <th className="px-4 py-3 text-left font-medium">{t("invites.fields.label")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("invites.fields.emailOptional")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("invites.fields.maxUses")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("invites.fields.expiresHours")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("table.link")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => {
                      const link = `${getOrigin()}/forms/${selectedForm.slug}?invite=${inv.token}`
                      const usagePct = inv.maxUses ? Math.min(100, (inv.uses / inv.maxUses) * 100) : 0

                      return (
                        <tr key={inv.id} className={cn("border-b border-border/50 group transition-colors hover:bg-secondary/20", inv.revoked && "opacity-50")}>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-foreground">{inv.label || t("invites.inviteFallback", { id: inv.id })}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{inv.email || t("common.dash")}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-foreground">
                              {inv.maxUses != null
                                ? t("invites.usageCount", { used: inv.uses, max: inv.maxUses })
                                : t("invites.usageCountUnlimited", { used: inv.uses })}
                            </span>
                              {inv.maxUses != null && (
                                <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${usagePct}%` }} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">
                              {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : t("invites.never")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 max-w-[220px]">
                              <span className="text-[10px] font-mono text-muted-foreground truncate min-w-0">{link}</span>
                              <button onClick={() => copy(link, `inv-${inv.id}`)} className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                                {copiedId === `inv-${inv.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              {!inv.revoked && (
                                <button onClick={() => revokeInvite(inv.id)} title={t("actions.revoke")}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invite list — mobile cards */}
            {invites.length === 0 ? (
              <EmptyCard icon={Link2} text={t("invites.noInviteLinks")} />
            ) : (
              <div className="flex flex-col gap-2 lg:hidden">
                {invites.map((inv) => {
                  const link = `${getOrigin()}/forms/${selectedForm.slug}?invite=${inv.token}`
                  const usagePct = inv.maxUses ? Math.min(100, (inv.uses / inv.maxUses) * 100) : 0

                  return (
                    <div key={inv.id} className={cn("rounded-xl border border-border bg-card overflow-hidden", inv.revoked && "opacity-50")}>
                      <div className="flex items-start gap-3 p-4 pb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground">{inv.label || t("invites.inviteFallback", { id: inv.id })}</span>
                            {inv.revoked && <StatusDot status="archived" config={FORM_STATUS_CONFIG} />}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                            {inv.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{inv.email}</span>}
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {inv.maxUses != null
                                ? t("invites.usageCount", { used: inv.uses, max: inv.maxUses })
                                : t("invites.usageCountUnlimited", { used: inv.uses })}
                            </span>
                            {inv.expiresAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(inv.expiresAt).toLocaleDateString()}</span>}
                          </div>
                          {inv.maxUses != null && (
                            <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${usagePct}%` }} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Link pill */}
                      <div className="flex items-center gap-2 mx-4 mb-3 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/60 overflow-hidden min-w-0">
                        <Link2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-[10px] font-mono text-muted-foreground truncate flex-1 min-w-0">{link}</span>
                        <button onClick={() => copy(link, `inv-${inv.id}`)} className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                          {copiedId === `inv-${inv.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>

                      {!inv.revoked && (
                        <div className="border-t border-border">
                          <button onClick={() => revokeInvite(inv.id)}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                            <X className="h-3.5 w-3.5" /> {t("actions.revoke")}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — SUBMISSIONS
      ════════════════════════════════════════════════════════════════════ */}

      {/* Submissions search / header bar */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
          <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder={selectedForm ? `${t("submissions.searchIn")} ${selectedForm.title}…` : t("submissions.searchAll")}
                value={subSearch}
                onChange={(e) => { setSubSearch(e.target.value); setSubPage(1) }}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
              {subSearch && (
                <button onClick={() => { setSubSearch(""); setSubPage(1) }} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Filter tabs — scrollable on mobile */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {(["all", "pending", "accepted", "rejected", "archived"] as const).map((f) => (
                <button key={f} onClick={() => { setSubFilter(f); setSubPage(1) }}
                  className={cn(
                    "shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                    subFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}>
                  {t(`submissions.filters.${f}`)}
                  <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums",
                    subFilter === f ? "bg-white/20 text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                    {subCounts[f]}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={loadAll} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={t("actions.refresh")}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Bulk bar — inside header card when selection active */}
        {selectedSubIds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 pb-4 pt-0">
            <span className="text-xs font-semibold text-foreground shrink-0">{selectedSubIds.length} {t("bulk.selected")}</span>
            <button onClick={bulkDeleteSubs}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> {t("actions.bulkDelete", { count: selectedSubIds.length })}
            </button>
            <button onClick={() => setSelectedSubIds([])} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Submissions — desktop table */}
      <div className="rounded-xl border border-border bg-card hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left w-8">
                  <input type="checkbox" checked={allPageSelected}
                    onChange={() => {
                      if (allPageSelected) {
                        const s = new Set(pagedSubs.map((s) => s.id))
                        setSelectedSubIds((p) => p.filter((id) => !s.has(id)))
                      } else {
                        setSelectedSubIds((p) => Array.from(new Set([...p, ...pagedSubs.map((s) => s.id)])))
                      }
                    }}
                    className="h-4 w-4 rounded border-border accent-primary" />
                </th>
                <th className="px-4 py-3 text-left font-medium">{t("table.submitter")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.form")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.submitted")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-4 rounded bg-secondary" /></td>
                    {[120, 140, 80, 100, 100].map((w, j) => (
                      <td key={j} className={cn("px-4 py-3", j === 4 && "text-right")}>
                        <div className={cn("h-4 rounded bg-secondary", j === 4 && "ml-auto")} style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedSubs.length === 0 ? (
                <EmptyRow icon={Inbox} text={t("submissions.noSubmissions")} />
              ) : (
                pagedSubs.map((sub) => {
                  const submitter =
                    sub.user?.email ||
                    [sub.user?.firstName, sub.user?.lastName].filter(Boolean).join(" ") ||
                    sub.ipAddress || t("submissions.anonymous")
                  const isExpanded = expandedSubs.has(sub.id)
                  let parsed: Record<string, any> | null = null
                  try { parsed = JSON.parse(sub.content) } catch {}

                  return (
                    <>
                      <tr key={sub.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors group">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedSubIds.includes(sub.id)}
                            onChange={() => setSelectedSubIds((p) => p.includes(sub.id) ? p.filter((v) => v !== sub.id) : [...p, sub.id])}
                            className="h-4 w-4 rounded border-border accent-primary" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {(sub.user?.firstName?.[0] || sub.user?.email?.[0] || "?").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate max-w-[140px]">{submitter}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground truncate max-w-[140px] block">
                            {sub.form?.title || t("forms.formFallback", { id: sub.formId })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot status={sub.status} config={SUBMISSION_STATUS_CONFIG} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{formatDate(sub.createdAt)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setExpandedSubs((p) => { const n = new Set(p); n.has(sub.id) ? n.delete(sub.id) : n.add(sub.id); return n })}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                            </button>
                            <button onClick={() => updateSubStatus(sub.id, "accepted")} disabled={sub.status === "accepted"}
                              title={t("actions.accept")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-30 transition-colors">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => updateSubStatus(sub.id, "rejected")} disabled={sub.status === "rejected"}
                              title={t("actions.reject")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 transition-colors">
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => updateSubStatus(sub.id, "archived")} disabled={sub.status === "archived"}
                              title={t("actions.archive")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 transition-colors">
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteSub(sub.id)}
                              title={t("actions.delete")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded content row */}
                      {isExpanded && (
                        <tr key={`${sub.id}-exp`} className="border-b border-border/50 bg-secondary/10">
                          <td />
                          <td colSpan={5} className="px-4 py-4">
                            {parsed && typeof parsed === "object" ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(parsed).map(([k, v]) => (
                                  <div key={k} className="space-y-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{k}</p>
                                    <div className="px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm text-foreground break-words">
                                      {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <pre className="whitespace-pre-wrap break-words text-xs bg-secondary/40 rounded-lg p-4 border border-border text-foreground overflow-x-auto">
                                {sub.content}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submissions — mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-secondary shrink-0" />
                <div className="h-8 w-8 rounded-full bg-secondary shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-32 rounded bg-secondary" />
                  <div className="h-3 w-24 rounded bg-secondary" />
                </div>
                <div className="h-5 w-16 rounded-full bg-secondary" />
              </div>
              <div className="grid grid-cols-3 gap-px h-9 rounded bg-secondary" />
            </div>
          ))
        ) : pagedSubs.length === 0 ? (
          <EmptyCard icon={Inbox} text={t("submissions.noSubmissions")} />
        ) : (
          pagedSubs.map((sub) => {
            const submitter =
              sub.user?.email ||
              [sub.user?.firstName, sub.user?.lastName].filter(Boolean).join(" ") ||
              sub.ipAddress || t("submissions.anonymous")
            const isExpanded = expandedSubs.has(sub.id)
            let parsed: Record<string, any> | null = null
            try { parsed = JSON.parse(sub.content) } catch {}

            return (
              <div key={sub.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Top — avatar + name + status */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  <input type="checkbox" checked={selectedSubIds.includes(sub.id)}
                    onChange={() => setSelectedSubIds((p) => p.includes(sub.id) ? p.filter((v) => v !== sub.id) : [...p, sub.id])}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0" />
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {(sub.user?.firstName?.[0] || sub.user?.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">{submitter}</p>
                      <StatusDot status={sub.status} config={SUBMISSION_STATUS_CONFIG} />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {sub.form?.title || t("forms.formFallback", { id: sub.formId })}
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.submitted")}</p>
                    <p className="text-xs font-medium text-foreground">{formatDate(sub.createdAt)}</p>
                  </div>
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.id")}</p>
                    <p className="text-xs font-mono text-muted-foreground">#{sub.id}</p>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2.5 bg-secondary/10">
                    {parsed && typeof parsed === "object" ? (
                      Object.entries(parsed).map(([k, v]) => (
                        <div key={k} className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{k}</p>
                          <div className="px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-xs text-foreground break-words">
                            {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                          </div>
                        </div>
                      ))
                    ) : (
                      <pre className="whitespace-pre-wrap break-words text-xs bg-secondary/40 rounded-lg p-3 border border-border text-foreground overflow-x-auto">
                        {sub.content}
                      </pre>
                    )}
                  </div>
                )}

                {/* Action bar — mirrors UsersTab exactly */}
                <div className="flex items-center border-t border-border divide-x divide-border">
                  <button onClick={() => updateSubStatus(sub.id, "accepted")} disabled={sub.status === "accepted"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("actions.accept")}</span>
                  </button>
                  <button onClick={() => updateSubStatus(sub.id, "rejected")} disabled={sub.status === "rejected"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors">
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("actions.reject")}</span>
                  </button>
                  <button onClick={() => updateSubStatus(sub.id, "archived")} disabled={sub.status === "archived"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 disabled:opacity-30 transition-colors">
                    <Archive className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("actions.archive")}</span>
                  </button>
                  <button onClick={() => setExpandedSubs((p) => { const n = new Set(p); n.has(sub.id) ? n.delete(sub.id) : n.add(sub.id); return n })}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                  </button>
                  <button onClick={() => deleteSub(sub.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Submissions pagination */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            {t("pagination.page")}{" "}
            <span className="font-medium text-foreground">{subPage}</span>{" "}
            {t("pagination.of")}{" "}
            <span className="font-medium text-foreground">{subTotalPages}</span>
            {filteredSubs.length > 0 && (
              <span className="hidden sm:inline"> · {t("pagination.total", { count: filteredSubs.length })}</span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setSubPage((p) => Math.max(1, p - 1))}
              disabled={subPage <= 1} className="h-8 px-3 text-xs">
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">{t("pagination.previous")}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubPage((p) => Math.min(subTotalPages, p + 1))}
              disabled={subPage >= subTotalPages} className="h-8 px-3 text-xs">
              <span className="hidden sm:inline mr-1">{t("pagination.next")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>

    </div>
  )
}