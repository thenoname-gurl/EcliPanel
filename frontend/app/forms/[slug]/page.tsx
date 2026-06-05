"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useTranslations } from "next-intl"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  Info,
  Globe,
  Users,
  Key,
  Hash,
  FileText,
  ListChecks,
  Signal,
  Clock,
  Server,
} from "lucide-react"

type Question = {
  id: string
  label: string
  type: "short_text" | "long_text" | "email" | "number" | "select" | "multi_select" | "checkbox" | "date" | "url"
  required?: boolean
  placeholder?: string
  options?: string[]
}

type PublicForm = {
  id: number
  title: string
  description?: string
  slug: string
  visibility: "public_anonymous" | "public_users" | "private_invite"
  status: "active" | "closed" | "archived"
  canSubmit: boolean
  inviteValidated?: boolean
  schema?: { questions?: Question[] }
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i?: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: (i ?? 0) * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
} as any

function FormInput({ q, value, onChange }: { q: Question; value: any; onChange: (v: any) => void }) {
  const base =
    "w-full bg-white/5 border border-white/10 px-4 py-2.5 text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20"

  if (q.type === "long_text") {
    return (
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder || `Enter ${q.label.toLowerCase()}...`}
        rows={4}
        className={`${base} resize-y min-h-24`}
      />
    )
  }

  if (q.type === "select") {
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} h-11 cursor-pointer appearance-none`}
      >
        <option value="" className="bg-[#1a1a1a] text-white/50">
          Select an option...
        </option>
        {(q.options || []).map((opt) => (
          <option key={opt} value={opt} className="bg-[#1a1a1a] text-white">
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (q.type === "multi_select" || q.type === "checkbox") {
    const current: string[] = Array.isArray(value) ? value : []
    return (
      <div className="grid gap-2">
        {(q.options || []).map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-3 px-4 py-2.5 border cursor-pointer transition-colors group ${
              current.includes(opt)
                ? "border-white/30 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80"
            }`}
          >
            <div
              className={`h-4 w-4 flex items-center justify-center flex-shrink-0 border transition-colors ${
                current.includes(opt) ? "bg-white border-white" : "border-white/30"
              }`}
            >
              {current.includes(opt) && <CheckCircle2 className="h-3 w-3 text-black" />}
            </div>
            <input
              type="checkbox"
              checked={current.includes(opt)}
              onChange={(e) => {
                const next = e.target.checked ? [...current, opt] : current.filter((v) => v !== opt)
                onChange(next)
              }}
              className="sr-only"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  const typeMap: Record<string, string> = {
    short_text: "text",
    email: "email",
    number: "number",
    date: "date",
    url: "url",
  }

  return (
    <input
      type={typeMap[q.type] || "text"}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.placeholder || `Enter ${q.label.toLowerCase()}...`}
      className={`${base} h-11`}
    />
  )
}

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const config: Record<string, { icon: typeof CheckCircle2; className: string }> = {
    active: { icon: CheckCircle2, className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    closed: { icon: AlertCircle, className: "text-red-400 bg-red-400/10 border-red-400/20" },
    archived: { icon: Clock, className: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  }
  const c = config[status] || config.archived
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs ${c.className}`}>
      <Icon className="h-3 w-3" />
      {labels[status] || status}
    </span>
  )
}

function VisibilityBadge({ visibility, labels }: { visibility: string; labels: Record<string, string> }) {
  const config: Record<string, any> = {
    public_anonymous: { icon: Globe, label: labels.publicAnonymous },
    public_users: { icon: Users, label: labels.publicUsers },
    private_invite: { icon: Key, label: labels.privateInvite },
  }
  const c = config[visibility] || { icon: Info, label: visibility }
  const Icon = c.icon
  return (
    <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}

export default function PublicFormPage() {
  const t = useTranslations("publicFormPage")
  const params = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const slug = String(params?.slug || "")
  const inviteToken = searchParams.get("invite") || ""

  const [form, setForm] = useState<PublicForm | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [reporterEmail, setReporterEmail] = useState("")
  const [servers, setServers] = useState<Array<{ uuid?: string; name?: string; label?: string }>>([])
  const [selectedServerUuid, setSelectedServerUuid] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const badgeLabels = useMemo(() => ({
    active: t("badges.active"),
    closed: t("badges.closed"),
    archived: t("badges.archived"),
    publicAnonymous: t("badges.publicAnonymous"),
    publicUsers: t("badges.publicUsers"),
    privateInvite: t("badges.privateInvite"),
  }), [t])

  const questions = useMemo(
    () => (Array.isArray(form?.schema?.questions) ? form!.schema!.questions! : []),
    [form]
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const url =
          API_ENDPOINTS.publicApplicationFormBySlug.replace(":slug", encodeURIComponent(slug)) +
          (inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "")
        const data = await apiFetch(url)
        setForm(data)
      } catch (err: any) {
        setError(err?.message || t("errors.formUnavailable"))
      } finally {
        setLoading(false)
      }
    }
    if (slug) load()
  }, [slug, inviteToken, t])

  useEffect(() => {
    const loadServers = async () => {
      if (slug !== "ip-request" || !user) return
      try {
        const data = await apiFetch(API_ENDPOINTS.servers)
        if (Array.isArray(data)) {
          const owned = data.filter((server: any) => String(server.userId || server.ownerId || "") === String(user.id))
          const visibleServers = owned.length > 0 ? owned : []
          setServers(visibleServers)
          if (visibleServers.length === 1) {
            setSelectedServerUuid(String(visibleServers[0].uuid || visibleServers[0].id || ""))
          }
        }
      } catch {
        setServers([])
      }
    }
    loadServers()
  }, [slug, user])

  const isIpRequestForm = slug === "ip-request"

  const canSubmit = useMemo(() => {
    if (!form) return false
    if (form.status !== "active" || !form.canSubmit) return false
    if (form.visibility === "public_users" && !user) return false
    if (form.visibility === "private_invite" && !inviteToken) return false
    if (isIpRequestForm && !selectedServerUuid) return false
    return true
  }, [form, user, inviteToken, isIpRequestForm, selectedServerUuid])

  const validate = () => {
    if (isIpRequestForm && !selectedServerUuid) {
      return "Please select the server for this IP request."
    }
    for (const q of questions) {
      if (!q.required) continue
      const value = answers[q.id]
      if (q.type === "checkbox" || q.type === "multi_select") {
        if (!Array.isArray(value) || value.length === 0) return t("errors.questionRequired", { question: q.label })
      } else if (value == null || String(value).trim() === "") {
        return t("errors.questionRequired", { question: q.label })
      }
    }
    return null
  }

  const submit = async () => {
    if (!form) return
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const bodyData: Record<string, any> = {
        answers,
      }
      if (isIpRequestForm) {
        bodyData.meta = { serverUuid: selectedServerUuid }
      }
      if (form.visibility === "public_users") {
        await apiFetch(API_ENDPOINTS.applicationsSubmitBySlug.replace(":slug", encodeURIComponent(form.slug)), {
          method: "POST",
          body: JSON.stringify(bodyData),
        })
      } else {
        await apiFetch(API_ENDPOINTS.publicApplicationsSubmitBySlug.replace(":slug", encodeURIComponent(form.slug)), {
          method: "POST",
          body: JSON.stringify({
            ...bodyData,
            inviteToken: inviteToken || undefined,
            reporterEmail: reporterEmail || undefined,
          }),
        })
      }
      setSuccess(t("messages.transmitted"))
      setAnswers({})
      setReporterEmail("")
    } catch (err: any) {
      setError(err?.message || t("errors.submitFailed"))
    } finally {
      setSaving(false)
    }
  }

  const progressPercent = useMemo(() => {
    if (questions.length === 0) return 0
    const answered = questions.filter((q) => {
      const v = answers[q.id]
      if (q.type === "checkbox" || q.type === "multi_select") return Array.isArray(v) && v.length > 0
      return v != null && String(v).trim() !== ""
    }).length
    return Math.round((answered / questions.length) * 100)
  }, [questions, answers])

  return (
    <div className="min-h-screen bg-black text-white **:font-flink flex flex-col">
      {/* Header */}
      <header className="relative z-50 border-b border-white/10">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/assets/icons/logo.png"
              alt="Eclipse Systems"
              className="h-7 w-7 sm:h-8 sm:w-8 object-contain"
            />
            <span className="text-base sm:text-lg font-semibold text-white group-hover:text-white/80 transition-colors">
              {t("brand")}
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-6 text-sm text-white/60">
            <Link href="/" className="hover:text-white transition-colors">{t("nav.home")}</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">{t("nav.dashboard")}</Link>
            <Link href="/login" className="hover:text-white transition-colors">{t("nav.login")}</Link>
          </nav>

          <Link
            href="/dashboard"
            className="text-sm bg-white text-black px-4 py-1.5 font-semibold transition-colors hover:bg-white/90"
          >
            {t("nav.dashboard")}
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
        {/* Loading */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Loader2 className="h-8 w-8 text-white/40" />
              </motion.div>
              <p className="text-lg text-white/60">{t("loading.title")}</p>
              <p className="text-sm text-white/30">{t("loading.subtitle")}</p>
            </motion.div>
          )}

          {/* Error — No Form */}
          {!loading && error && !form && (
            <motion.div
              key="error"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="flex flex-col items-center text-center py-12 gap-6"
            >
              <div className="flex items-center justify-center h-16 w-16 bg-red-400/10 border border-red-400/20">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{t("errorState.title")}</h1>
                <p className="text-white/50 text-sm sm:text-base max-w-md">
                  {t("errorState.subtitle")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="flex items-center gap-2 text-sm bg-white text-black px-5 py-2 font-semibold transition-colors hover:bg-white/90"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("errorState.returnHome")}
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-sm border border-white/20 text-white px-5 py-2 transition-colors hover:bg-white/10"
                >
                  {t("errorState.goDashboard")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          )}

          {/* Form Loaded */}
          {!loading && form && (
            <motion.div
              key="form"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="space-y-8"
            >
              {/* Success State */}
              {success ? (
                <div className="flex flex-col items-center text-center py-8 gap-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="flex items-center justify-center h-16 w-16 bg-emerald-400/10 border border-emerald-400/20"
                  >
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </motion.div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{t("success.title")}</h1>
                    <p className="text-white/50 text-sm sm:text-base max-w-md">{t("success.value")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSuccess(null)}
                      className="text-sm bg-white text-black px-5 py-2 font-semibold transition-colors hover:bg-white/90"
                    >
                      {t("success.submitAgain")}
                    </button>
                    <Link
                      href="/"
                      className="text-sm border border-white/20 text-white px-5 py-2 transition-colors hover:bg-white/10"
                    >
                      {t("success.navigateHome")}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {/* Form Header */}
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <motion.h1
                        className="text-3xl sm:text-4xl font-bold text-white leading-tight"
                        variants={fadeUp}
                        custom={0}
                      >
                        {form.title}
                      </motion.h1>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={form.status} labels={badgeLabels} />
                        <VisibilityBadge visibility={form.visibility} labels={badgeLabels} />
                      </div>
                    </div>
                    {form.description && (
                      <motion.p
                        className="text-white/50 text-sm sm:text-base leading-relaxed"
                        variants={fadeUp}
                        custom={0.1}
                      >
                        {form.description}
                      </motion.p>
                    )}
                  </div>

                  {/* Info Card */}
                  <motion.div
                    className="border border-white/10 bg-white/[0.02] p-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
                    variants={fadeUp}
                    custom={0.2}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Form ID</p>
                        <p className="text-sm text-white/70">{form.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Questions</p>
                        <p className="text-sm text-white/70">{questions.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Access</p>
                        <p className="text-sm text-white/70">{(
                          form.visibility === "public_anonymous" ? badgeLabels.publicAnonymous :
                          form.visibility === "public_users" ? badgeLabels.publicUsers : badgeLabels.privateInvite
                        )}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Signal className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Status</p>
                        <p className={`text-sm ${form.status === "active" ? "text-emerald-400" : "text-red-400"}`}>
                          {badgeLabels[form.status as keyof typeof badgeLabels]}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Warnings */}
                  <div className="space-y-3">
                    {form.visibility === "public_users" && !user && (
                      <motion.div
                        className="flex items-start gap-3 border border-yellow-400/20 bg-yellow-400/5 p-4"
                        variants={fadeUp}
                        custom={0.25}
                      >
                        <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="text-yellow-100 font-semibold">{t("warnings.authRequired")}</p>
                          <p className="text-yellow-100/60 mt-1">
                            <Link
                              href={`/login?next=${encodeURIComponent(`/forms/${form.slug}`)}`}
                              className="text-yellow-300 hover:underline"
                            >
                              {t("warnings.login")}
                            </Link>
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {(form.visibility === "public_anonymous" || form.visibility === "private_invite") && (
                      <motion.div
                        className="flex items-start gap-3 border border-white/10 bg-white/5 p-4"
                        variants={fadeUp}
                        custom={0.25}
                      >
                        <Info className="h-5 w-5 text-white/30 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-white/50">{t("warnings.anonymousInfo")}</p>
                      </motion.div>
                    )}

                    {form.status !== "active" && (
                      <motion.div
                        className="flex items-start gap-3 border border-red-400/20 bg-red-400/5 p-4"
                        variants={fadeUp}
                        custom={0.25}
                      >
                        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="text-red-100 font-semibold">{t("warnings.formClosed")}</p>
                          <p className="text-red-100/60 mt-1">{t("warnings.formClosedDetail")}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* IP Request Server Select */}
                  {isIpRequestForm && (
                    <motion.div
                      className="border border-white/10 bg-white/[0.02] p-5 space-y-3"
                      variants={fadeUp}
                      custom={0.3}
                    >
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-white/40" />
                        <label className="text-xs uppercase tracking-wider text-white/40">
                          Select Server
                        </label>
                      </div>
                      {servers.length > 0 ? (
                        <select
                          value={selectedServerUuid}
                          onChange={(e) => setSelectedServerUuid(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 px-4 py-2.5 h-11 text-white outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20 appearance-none"
                        >
                          <option value="" className="bg-[#1a1a1a] text-white/50">Select a server...</option>
                          {servers.map((server) => (
                            <option
                              key={String(server.uuid || server.label || server.name || "")}
                              value={String(server.uuid || server.label || server.name || "")}
                              className="bg-[#1a1a1a] text-white"
                            >
                              {server.name || server.label || server.uuid || "Untitled server"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-white/40">
                          You need at least one server in your account to submit an IP request.
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* Contact Email */}
                  {form.visibility !== "public_users" && (
                    <motion.div
                      className="border border-white/10 bg-white/[0.02] p-5 space-y-3"
                      variants={fadeUp}
                      custom={0.3}
                    >
                      <label className="text-xs uppercase tracking-wider text-white/40">
                        {t("contactEmail.label")}
                      </label>
                      <input
                        type="email"
                        value={reporterEmail}
                        onChange={(e) => setReporterEmail(e.target.value)}
                        placeholder={t("contactEmail.placeholder")}
                        className="w-full bg-white/5 border border-white/10 px-4 py-2.5 h-11 text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20"
                      />
                      <p className="text-xs text-white/30">{t("contactEmail.help")}</p>
                    </motion.div>
                  )}

                  {/* Progress */}
                  {questions.length > 0 && (
                    <motion.div className="space-y-2" variants={fadeUp} custom={0.35}>
                      <div className="flex items-center justify-between text-xs text-white/40">
                        <span>{t("progress.label")}</span>
                        <span className="text-white/60">{progressPercent}%</span>
                      </div>
                      <div className="h-px w-full bg-white/10">
                        <motion.div
                          className="h-px bg-white/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Questions */}
                  <div className="space-y-4">
                    {questions.length === 0 ? (
                      <motion.div
                        className="border border-white/10 bg-white/5 p-5"
                        variants={fadeUp}
                        custom={0.4}
                      >
                        <p className="text-sm text-white/40 flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          {t("questions.none")}
                        </p>
                      </motion.div>
                    ) : (
                      questions.map((q, index) => (
                        <motion.div
                          key={q.id}
                          className="border border-white/10 bg-white/[0.02] p-5 space-y-4 transition-colors hover:border-white/20"
                          variants={fadeUp}
                          custom={0.4 + index * 0.03}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <label className="text-sm font-semibold text-white flex items-center gap-2.5">
                              <span className="text-white/20 text-xs tabular-nums min-w-5">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              {q.label}
                              {q.required && (
                                <span className="text-red-400/70 text-xs font-normal">Required</span>
                              )}
                            </label>
                            <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-white/20 border border-white/10 px-1.5 py-0.5">
                              {q.type.replace(/_/g, " ")}
                            </span>
                          </div>
                          <FormInput
                            q={q}
                            value={answers[q.id]}
                            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                          />
                        </motion.div>
                      ))
                    )}
                  </div>

                  {/* Validation Error */}
                  {error && (
                    <motion.div
                      className="flex items-start gap-3 border border-red-400/20 bg-red-400/5 p-4"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="text-red-100 font-semibold">{t("errors.validationTitle")}</p>
                        <p className="text-red-100/60 mt-1">{error}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Submit */}
                  <motion.div
                    className="flex flex-wrap items-center gap-4 pt-2"
                    variants={fadeUp}
                    custom={0.6}
                  >
                    <button
                      onClick={submit}
                      disabled={!canSubmit || saving}
                      className="flex items-center gap-2 text-sm bg-white text-black px-6 py-2.5 font-semibold transition-colors hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("actions.transmitting")}
                        </>
                      ) : (
                        t("actions.submit")
                      )}
                    </button>
                    <Link
                      href="/"
                      className="text-sm border border-white/20 text-white px-6 py-2.5 transition-colors hover:bg-white/10"
                    >
                      {t("actions.navigateHome")}
                    </Link>
                    {!canSubmit && form.status === "active" && form.visibility === "public_users" && !user && (
                      <p className="text-sm text-red-400/60">{t("actions.loginRequired")}</p>
                    )}
                  </motion.div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 text-center">
          <p className="text-xs text-white/30">
            {t("footer.questions")}{" "}
            <a href="mailto:contact@ecli.app" className="text-white/50 hover:text-white transition-colors">
              contact@ecli.app
            </a>{" "}
            {t("footer.orReturn")}{" "}
            <Link href="/" className="text-white/50 hover:text-white transition-colors">
              {t("footer.home")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
