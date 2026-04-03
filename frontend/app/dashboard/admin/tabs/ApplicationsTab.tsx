"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import {
  Plus,
  Trash2,
  Copy,
  Link2,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Edit3,
  Archive,
  Eye,
  Users,
  Lock,
  Globe,
  UserCheck,
  Send,
  Clock,
  AlertCircle,
  Loader2,
  GripVertical,
  Tag,
  Mail,
  Hash,
  RefreshCw,
  ExternalLink,
  Filter,
  Layers,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Inbox,
} from "lucide-react"
import { cn } from "@/lib/utils"

type FormQuestion = {
  id: string
  label: string
  type: "short_text" | "long_text" | "email" | "number" | "select" | "multi_select" | "checkbox" | "date" | "url"
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
type FormStatus = "active" | "archived" | "closed"

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

const QUESTION_TYPES: Array<FormQuestion["type"]> = [
  "short_text", "long_text", "email", "number",
  "select", "multi_select", "checkbox", "date", "url",
]

const QUESTION_TYPE_LABELS: Record<FormQuestion["type"], string> = {
  short_text: "Short Text",
  long_text: "Long Text",
  email: "Email",
  number: "Number",
  select: "Single Select",
  multi_select: "Multi Select",
  checkbox: "Checkbox",
  date: "Date",
  url: "URL",
}

function makeQuestion(idx: number): FormQuestion {
  return {
    id: `q${idx}_${Date.now()}`,
    label: `Question ${idx}`,
    type: "short_text",
    required: false,
    placeholder: "",
    options: [],
  }
}

function getOrigin() {
  if (typeof window === "undefined") return ""
  return window.location.origin
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; dot: string }> = {
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
    closed: { label: "Closed", className: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
    archived: { label: "Archived", className: "bg-gray-500/10 text-gray-400 border-gray-500/20", dot: "bg-gray-400" },
    pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400" },
    accepted: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
    rejected: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
  }
  const c = config[status] || config.active
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium", c.className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  )
}

function VisibilityIcon({ visibility }: { visibility: FormVisibility }) {
  const config = {
    public_anonymous: { icon: Globe, label: "Anonymous", className: "text-blue-400" },
    public_users: { icon: Users, label: "Users", className: "text-purple-400" },
    private_invite: { icon: Lock, label: "Invite Only", className: "text-orange-400" },
  }
  const c = config[visibility]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.className)}>
      <c.icon className="h-3.5 w-3.5" />
      {c.label}
    </span>
  )
}

function SectionCard({
  title,
  icon: Icon,
  badge,
  children,
  action,
  className,
}: {
  title: string
  icon?: React.ElementType
  badge?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden shadow-sm", className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-card to-secondary/20">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function FormInput({
  label,
  required,
  children,
  hint,
}: {
  label?: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputClass = "h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
const selectClass = "h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
const textareaClass = "w-full rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"

export default function ApplicationsTab() {
  const [forms, setForms] = useState<AppForm[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [slug, setSlug] = useState("")
  const [kind, setKind] = useState<"staff_application" | "abuse_report">("staff_application")
  const [visibility, setVisibility] = useState<FormVisibility>("public_users")
  const [status, setStatus] = useState<FormStatus>("active")
  const [questions, setQuestions] = useState<FormQuestion[]>([makeQuestion(1)])

  const [inviteLabel, setInviteLabel] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteMaxUses, setInviteMaxUses] = useState("")
  const [inviteExpiresHours, setInviteExpiresHours] = useState("")
  const [formSearch, setFormSearch] = useState("")
  const [optionDrafts, setOptionDrafts] = useState<Record<number, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [submissionFilter, setSubmissionFilter] = useState<string>("all")
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<number>>(new Set())

  const selectedForm = useMemo(
    () => forms.find((f) => Number(f.id) === Number(selectedFormId)) || null,
    [forms, selectedFormId]
  )

  const filteredForms = useMemo(() => {
    const q = formSearch.trim().toLowerCase()
    if (!q) return forms
    return forms.filter((form) => {
      const parts = [form.title, form.description, form.slug, form.visibility, form.status, form.kind]
      return parts.some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [forms, formSearch])

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [f, s] = await Promise.all([
        apiFetch(API_ENDPOINTS.adminApplicationsForms),
        apiFetch(API_ENDPOINTS.adminApplicationsSubmissions),
      ])
      const formsData = Array.isArray(f) ? f : []
      setForms(formsData)
      setSubmissions(Array.isArray(s) ? s : [])
      if (!selectedFormId && formsData.length > 0) setSelectedFormId(Number(formsData[0].id))
    } catch (err: any) {
      setError(err?.message || "Failed to load applications data")
    } finally {
      setLoading(false)
    }
  }

  const loadInvites = async (formId: number, formSlug?: string) => {
    try {
      const data = await apiFetch(
        API_ENDPOINTS.adminApplicationInvites.replace(":id", String(formId)) +
        (formSlug ? `?slug=${encodeURIComponent(formSlug)}` : "")
      )
      setInvites(Array.isArray(data) ? data : [])
    } catch {
      setInvites([])
    }
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (!selectedForm) { setInvites([]); return }
    if (selectedForm.visibility === "private_invite") {
      loadInvites(selectedForm.id, selectedForm.slug)
    } else {
      setInvites([])
    }
  }, [selectedForm?.id, selectedForm?.visibility, selectedForm?.slug])

  const resetBuilder = () => {
    setSelectedFormId(null)
    setTitle(""); setDescription(""); setSlug("")
    setKind("staff_application"); setVisibility("public_users"); setStatus("active")
    setQuestions([makeQuestion(1)])
  }

  const editForm = (form: AppForm) => {
    setSelectedFormId(form.id)
    setTitle(form.title || ""); setDescription(form.description || "")
    setSlug(form.slug || ""); setKind(form.kind || "staff_application")
    setVisibility((form.visibility as FormVisibility) || "public_users")
    setStatus((form.status as FormStatus) || "active")
    setQuestions(
      Array.isArray(form.schema?.questions) && form.schema!.questions.length > 0
        ? form.schema!.questions
        : [makeQuestion(1)]
    )
  }

  const duplicateFormAsTemplate = (form: AppForm) => {
    setSelectedFormId(null)
    setTitle(`${form.title} (Copy)`); setDescription(form.description || ""); setSlug("")
    setKind(form.kind || "staff_application")
    setVisibility((form.visibility as FormVisibility) || "public_users"); setStatus("active")
    setQuestions(
      Array.isArray(form.schema?.questions) && form.schema!.questions.length > 0
        ? form.schema!.questions.map((q, i) => ({ ...q, id: q.id || `q${i + 1}`, options: Array.isArray(q.options) ? [...q.options] : [] }))
        : [makeQuestion(1)]
    )
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const addQuestion = () => setQuestions((p) => [...p, makeQuestion(p.length + 1)])

  const removeQuestion = (idx: number) => setQuestions((p) => p.filter((_, i) => i !== idx))

  const updateQuestion = (idx: number, patch: Partial<FormQuestion>) =>
    setQuestions((p) => p.map((q, i) => (i === idx ? { ...q, ...patch } : q)))

  const addQuestionOption = (idx: number) => {
    const draft = String(optionDrafts[idx] || "").trim()
    if (!draft) return
    const current = Array.isArray(questions[idx]?.options) ? questions[idx].options || [] : []
    if (current.includes(draft)) { setOptionDrafts((p) => ({ ...p, [idx]: "" })); return }
    updateQuestion(idx, { options: [...current, draft] })
    setOptionDrafts((p) => ({ ...p, [idx]: "" }))
  }

  const removeQuestionOption = (idx: number, optIdx: number) => {
    const current = Array.isArray(questions[idx]?.options) ? questions[idx].options || [] : []
    updateQuestion(idx, { options: current.filter((_, i) => i !== optIdx) })
  }

  const saveForm = async () => {
    if (!title.trim()) { setError("Form title is required"); return }
    setSaving(true); setError(null)
    try {
      const schema: FormSchema = {
        title: title.trim(), description: description.trim() || undefined,
        questions: questions.map((q, i) => ({
          ...q,
          id: q.id?.trim() || `q${i + 1}`,
          label: q.label?.trim() || `Question ${i + 1}`,
          options: Array.isArray(q.options) ? q.options.map((o) => String(o || "").trim()).filter(Boolean) : [],
        })),
      }
      const payload = { title: title.trim(), description: description.trim(), slug: slug.trim() || undefined, kind, visibility, status, schema }
      if (selectedFormId) {
        await apiFetch(API_ENDPOINTS.adminApplicationForm.replace(":id", String(selectedFormId)), { method: "PUT", body: JSON.stringify(payload) })
      } else {
        await apiFetch(API_ENDPOINTS.adminApplicationsForms, { method: "POST", body: JSON.stringify(payload) })
      }
      await loadAll()
      if (!selectedFormId) resetBuilder()
    } catch (err: any) {
      setError(err?.message || "Failed to save form")
    } finally {
      setSaving(false)
    }
  }

  const deleteForm = async (id: number) => {
    if (!confirm("Delete this form and all its submissions? This cannot be undone.")) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationForm.replace(":id", String(id)), { method: "DELETE" })
      if (selectedFormId === id) resetBuilder()
      await loadAll()
    } catch (err: any) {
      setError(err?.message || "Failed to delete form")
    }
  }

  const createInvite = async () => {
    if (!selectedForm) return
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationInvites.replace(":id", String(selectedForm.id)), {
        method: "POST",
        body: JSON.stringify({
          label: inviteLabel.trim() || undefined,
          email: inviteEmail.trim() || undefined,
          maxUses: inviteMaxUses.trim() ? Number(inviteMaxUses) : undefined,
          expiresHours: inviteExpiresHours.trim() ? Number(inviteExpiresHours) : undefined,
        }),
      })
      setInviteLabel(""); setInviteEmail(""); setInviteMaxUses(""); setInviteExpiresHours("")
      await loadInvites(selectedForm.id, selectedForm.slug)
    } catch (err: any) {
      setError(err?.message || "Failed to create invite")
    }
  }

  const revokeInvite = async (inviteId: number) => {
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationInvite.replace(":inviteId", String(inviteId)), { method: "DELETE" })
      if (selectedForm) await loadInvites(selectedForm.id, selectedForm.slug)
    } catch (err: any) {
      setError(err?.message || "Failed to revoke invite")
    }
  }

  const updateSubmissionStatus = async (submissionId: number, next: Submission["status"]) => {
    try {
      await apiFetch(API_ENDPOINTS.adminApplicationSubmission.replace(":id", String(submissionId)), {
        method: "PUT", body: JSON.stringify({ status: next }),
      })
      await loadAll()
    } catch (err: any) {
      setError(err?.message || "Failed to update submission")
    }
  }

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  const toggleExpand = (id: number) => {
    setExpandedSubmissions((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleSubmissions = useMemo(() => {
    let list = selectedFormId
      ? submissions.filter((s) => Number(s.formId) === Number(selectedFormId))
      : submissions
    if (submissionFilter !== "all") list = list.filter((s) => s.status === submissionFilter)
    return list
  }, [submissions, selectedFormId, submissionFilter])

  const submissionCounts = useMemo(() => {
    const base = selectedFormId ? submissions.filter((s) => Number(s.formId) === Number(selectedFormId)) : submissions
    return {
      all: base.length,
      pending: base.filter((s) => s.status === "pending").length,
      accepted: base.filter((s) => s.status === "accepted").length,
      rejected: base.filter((s) => s.status === "rejected").length,
      archived: base.filter((s) => s.status === "archived").length,
    }
  }, [submissions, selectedFormId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading application forms...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 animate-in slide-in-from-top-2">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-destructive/60 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
        {/* Left: Form List */}
        <SectionCard
          title="Forms"
          icon={Layers}
          badge={
            <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {forms.length}
            </span>
          }
          action={
            <button
              onClick={resetBuilder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Form
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                placeholder="Search forms..."
                className={cn(inputClass, "pl-9")}
              />
            </div>

            {filteredForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <ClipboardList className="h-12 w-12 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {formSearch ? "No forms match your search" : "No forms yet"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formSearch ? "Try a different search term" : "Create your first form to get started"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-0.5">
                {filteredForms.map((form) => {
                  const publicLink = form.slug ? `${getOrigin()}/forms/${form.slug}` : ""
                  const selected = Number(selectedFormId) === Number(form.id)
                  const formSubmissions = submissions.filter((s) => Number(s.formId) === Number(form.id))
                  const pendingCount = formSubmissions.filter((s) => s.status === "pending").length

                  return (
                    <div
                      key={form.id}
                      className={cn(
                        "rounded-xl border p-4 transition-all cursor-pointer hover:shadow-sm",
                        selected
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : "border-border bg-secondary/20 hover:border-border/80 hover:bg-secondary/40"
                      )}
                      onClick={() => editForm(form)}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-semibold text-foreground truncate">{form.title}</p>
                            {pendingCount > 0 && (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                {pendingCount} pending
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={form.status} />
                            <VisibilityIcon visibility={form.visibility} />
                          </div>
                        </div>
                        {selected && (
                          <div className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1" />
                        )}
                      </div>

                      {form.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                          {form.description}
                        </p>
                      )}

                      {publicLink && (
                        <div className="flex items-center gap-1.5 mb-3 p-2 rounded-lg bg-secondary/40 border border-border/50">
                          <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
                            {publicLink}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copy(publicLink, `link-${form.id}`) }}
                            className="shrink-0 p-1 rounded hover:bg-secondary transition-colors"
                            title="Copy link"
                          >
                            {copiedId === `link-${form.id}` ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => editForm(form)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => duplicateFormAsTemplate(form)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Template
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => deleteForm(form.id)}
                          className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete form"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Right: Form Builder */}
        <SectionCard
          title={selectedFormId ? "Edit Form" : "Create Form"}
          icon={selectedFormId ? Edit3 : Plus}
          action={
            selectedFormId ? (
              <button
                onClick={resetBuilder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Form
              </button>
            ) : null
          }
        >
          <div className="flex flex-col gap-5">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="Form Title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Staff Application Form"
                  className={inputClass}
                />
              </FormInput>
              <FormInput label="Custom Slug" hint="Used in the public URL /forms/{slug}">
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. staff-application"
                  className={inputClass}
                />
              </FormInput>
              <FormInput label="Form Type">
                <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={selectClass}>
                  <option value="staff_application">Staff Application</option>
                  <option value="abuse_report">Abuse Report</option>
                </select>
              </FormInput>
              <FormInput label="Visibility">
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as FormVisibility)} className={selectClass}>
                  <option value="public_anonymous">Public Anonymous (1hr rate limit)</option>
                  <option value="public_users">Public — Panel Account Required</option>
                  <option value="private_invite">Private — Invite Only</option>
                </select>
              </FormInput>
              <FormInput label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value as FormStatus)} className={selectClass}>
                  <option value="active">Active</option>
                  <option value="closed">Closed (view only)</option>
                  <option value="archived">Archived</option>
                </select>
              </FormInput>
            </div>

            <FormInput label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the form's purpose..."
                rows={3}
                className={textareaClass}
              />
            </FormInput>

            {/* Questions Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Questions</h4>
                  <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {questions.length}
                  </span>
                </div>
                <button
                  onClick={addQuestion}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Question
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {questions.map((q, idx) => (
                  <div
                    key={`${q.id}-${idx}`}
                    className="rounded-xl border border-border bg-secondary/20 overflow-hidden hover:border-border/80 transition-colors"
                  >
                    {/* Question Header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30 border-b border-border/50">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-md font-mono">
                        Q{idx + 1}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {q.label || `Question ${idx + 1}`}
                      </span>
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        {QUESTION_TYPE_LABELS[q.type]}
                      </span>
                      <button
                        onClick={() => removeQuestion(idx)}
                        disabled={questions.length === 1}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Question Body */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FormInput label="Label">
                        <input
                          value={q.label || ""}
                          onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                          placeholder={`Question ${idx + 1} label`}
                          className={inputClass}
                        />
                      </FormInput>
                      <FormInput label="Type">
                        <select
                          value={q.type}
                          onChange={(e) => {
                            const nextType = e.target.value as FormQuestion["type"]
                            const isSelectable = nextType === "select" || nextType === "multi_select" || nextType === "checkbox"
                            updateQuestion(idx, { type: nextType, options: isSelectable ? (q.options || []) : [] })
                          }}
                          className={selectClass}
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      </FormInput>
                      <FormInput label="Placeholder">
                        <input
                          value={q.placeholder || ""}
                          onChange={(e) => updateQuestion(idx, { placeholder: e.target.value })}
                          placeholder="Optional hint text..."
                          className={inputClass}
                        />
                      </FormInput>
                      <div className="flex items-end pb-0.5">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div
                            className={cn(
                              "relative w-10 h-5 rounded-full transition-colors border-2 border-transparent",
                              q.required ? "bg-primary" : "bg-secondary border-border"
                            )}
                            onClick={() => updateQuestion(idx, { required: !q.required })}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                q.required ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </div>
                          <span className="text-sm font-medium text-foreground">Required</span>
                        </label>
                      </div>
                    </div>

                    {/* Options Editor */}
                    {(q.type === "select" || q.type === "multi_select" || q.type === "checkbox") && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Options</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(q.options || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No options yet — add some below</p>
                          ) : (
                            (q.options || []).map((option, optIdx) => (
                              <span
                                key={`${q.id}-opt-${optIdx}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground"
                              >
                                {option}
                                <button
                                  type="button"
                                  onClick={() => removeQuestionOption(idx, optIdx)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={optionDrafts[idx] || ""}
                            onChange={(e) => setOptionDrafts((p) => ({ ...p, [idx]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestionOption(idx) } }}
                            placeholder="Type option and press Enter..."
                            className={cn(inputClass, "flex-1")}
                          />
                          <button
                            onClick={() => addQuestionOption(idx)}
                            className="px-3 py-2 rounded-lg border border-border bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors whitespace-nowrap"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <button
                onClick={saveForm}
                disabled={saving || !title.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                ) : (
                  <><Send className="h-4 w-4" />{selectedFormId ? "Update Form" : "Create Form"}</>
                )}
              </button>
              {selectedFormId && (
                <button
                  onClick={resetBuilder}
                  className="px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              )}
              {!title.trim() && (
                <p className="text-xs text-muted-foreground">Title is required</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Invite Links */}
      {selectedForm?.visibility === "private_invite" && (
        <SectionCard
          title={`Invite Links — ${selectedForm.title}`}
          icon={Link2}
          badge={
            <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {invites.length}
            </span>
          }
        >
          <div className="flex flex-col gap-5">
            {/* Create Invite Form */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Create New Invite</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <FormInput label="Label">
                  <input value={inviteLabel} onChange={(e) => setInviteLabel(e.target.value)} placeholder="e.g. John's invite" className={inputClass} />
                </FormInput>
                <FormInput label="Email (optional)">
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className={inputClass} />
                </FormInput>
                <FormInput label="Max Uses" hint="Leave blank for unlimited">
                  <input value={inviteMaxUses} onChange={(e) => setInviteMaxUses(e.target.value)} placeholder="e.g. 1" type="number" min="1" className={inputClass} />
                </FormInput>
                <FormInput label="Expires (hours)" hint="Leave blank for no expiry">
                  <input value={inviteExpiresHours} onChange={(e) => setInviteExpiresHours(e.target.value)} placeholder="e.g. 24" type="number" min="1" className={inputClass} />
                </FormInput>
              </div>
              <button
                onClick={createInvite}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Create Invite Link
              </button>
            </div>

            {/* Invite List */}
            {invites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Link2 className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No invite links yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {invites.map((invite) => {
                  const link = `${getOrigin()}/forms/${selectedForm.slug}?invite=${invite.token}`
                  const copyId = `invite-${invite.id}`
                  const usagePct = invite.maxUses ? (invite.uses / invite.maxUses) * 100 : 0

                  return (
                    <div
                      key={invite.id}
                      className={cn(
                        "rounded-xl border p-4 transition-all",
                        invite.revoked ? "border-red-500/20 bg-red-500/5 opacity-60" : "border-border bg-secondary/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-semibold text-foreground">{invite.label || `Invite #${invite.id}`}</p>
                            {invite.revoked && <StatusBadge status="archived" />}
                            {invite.email && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {invite.email}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {invite.uses}{invite.maxUses != null ? `/${invite.maxUses}` : ""} uses
                            </span>
                            {invite.expiresAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(invite.expiresAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {!invite.revoked && (
                          <button
                            onClick={() => revokeInvite(invite.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Revoke
                          </button>
                        )}
                      </div>

                      {invite.maxUses && (
                        <div className="mb-3">
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(100, usagePct)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border/50">
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{link}</span>
                        <button
                          onClick={() => copy(link, copyId)}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          {copiedId === copyId ? (
                            <><Check className="h-3.5 w-3.5 text-emerald-400" />Copied</>
                          ) : (
                            <><Copy className="h-3.5 w-3.5" />Copy</>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Submissions */}
      <SectionCard
        title={`Submissions${selectedForm ? ` — ${selectedForm.title}` : ""}`}
        icon={Inbox}
        badge={
          <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {visibleSubmissions.length}
          </span>
        }
        action={
          <button
            onClick={loadAll}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {(["all", "pending", "accepted", "rejected", "archived"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSubmissionFilter(f)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                  submissionFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  submissionFilter === f ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}>
                  {submissionCounts[f as keyof typeof submissionCounts]}
                </span>
              </button>
            ))}
          </div>

          {visibleSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Inbox className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">No submissions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {submissionFilter !== "all" ? `No ${submissionFilter} submissions` : "Submissions will appear here"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleSubmissions.map((submission) => {
                const isExpanded = expandedSubmissions.has(submission.id)
                let parsed: Record<string, any> | null = null
                try {
                  parsed = JSON.parse(submission.content)
                } catch {}

                return (
                  <div
                    key={submission.id}
                    className="rounded-xl border border-border bg-secondary/20 overflow-hidden hover:border-border/80 transition-all"
                  >
                    {/* Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => toggleExpand(submission.id)}
                    >
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-muted-foreground font-mono">#{submission.id}</span>
                          <span className="text-sm font-medium text-foreground truncate">
                            {submission.form?.title || `Form ${submission.formId}`}
                          </span>
                          <StatusBadge status={submission.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <UserCheck className="h-3.5 w-3.5" />
                            {submission.user?.email ||
                              [submission.user?.firstName, submission.user?.lastName].filter(Boolean).join(" ") ||
                              submission.ipAddress ||
                              "Anonymous"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(submission.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", isExpanded && "rotate-180")} />
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {/* Content */}
                        <div className="p-4">
                          {parsed && typeof parsed === "object" ? (
                            <div className="space-y-3">
                              {Object.entries(parsed).map(([key, val]) => (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{key}</p>
                                  <p className="text-sm text-foreground bg-secondary/30 rounded-lg px-3 py-2 border border-border/50">
                                    {Array.isArray(val) ? val.join(", ") : String(val ?? "—")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="whitespace-pre-wrap text-xs bg-secondary/40 rounded-lg p-4 border border-border overflow-x-auto text-foreground">
                              {submission.content}
                            </pre>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-border bg-secondary/10">
                          <button
                            onClick={() => updateSubmissionStatus(submission.id, "accepted")}
                            disabled={submission.status === "accepted"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Accept
                          </button>
                          <button
                            onClick={() => updateSubmissionStatus(submission.id, "rejected")}
                            disabled={submission.status === "rejected"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => updateSubmissionStatus(submission.id, "archived")}
                            disabled={submission.status === "archived"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </button>
                          <button
                            onClick={() => updateSubmissionStatus(submission.id, "pending")}
                            disabled={submission.status === "pending"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}