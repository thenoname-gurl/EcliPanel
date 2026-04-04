"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useTranslations } from "next-intl"

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

function BinaryStrip() {
  const [binary, setBinary] = useState("")
  useEffect(() => {
    const chars = "01"
    let str = ""
    for (let i = 0; i < 200; i++) str += chars[Math.floor(Math.random() * chars.length)]
    setBinary(str)
  }, [])
  return (
    <div className="overflow-hidden py-4 text-[10px] font-mono text-purple-500/30 select-none">
      {binary}
    </div>
  )
}

function TerminalBlock({ children, title = "Terminal" }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-purple-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-yellow-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-green-500 flex-shrink-0" />
        <span className="ml-2 text-xs text-purple-400/60 whitespace-nowrap">{title}</span>
      </div>
      {children}
    </div>
  )
}

function TypingText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)
  useEffect(() => {
    let i = 0
    setDisplayed("")
    setDone(false)
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(interval); setDone(true) }
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])
  return (
    <span>
      {displayed}
      <span style={{ animation: "blink 1s step-end infinite" }} className={done ? "inline" : "hidden"}>_</span>
    </span>
  )
}

function FormInput({ q, value, onChange }: { q: Question; value: any; onChange: (v: any) => void }) {
  const base =
    "w-full rounded border border-purple-500/20 bg-black/40 px-3 py-2 font-mono text-sm text-purple-100 placeholder:text-purple-400/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all backdrop-blur-sm"

  if (q.type === "long_text") {
    return (
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder || `// enter ${q.label.toLowerCase()}...`}
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
        className={`${base} h-10 cursor-pointer`}
      >
        <option value="">// select option...</option>
        {(q.options || []).map((opt) => (
          <option key={opt} value={opt} className="bg-[#0a0a0a]">{opt}</option>
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
            className="flex items-center gap-3 rounded border border-purple-500/20 bg-black/40 px-3 py-2 cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
          >
            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${current.includes(opt) ? "border-purple-500 bg-purple-500/20" : "border-purple-500/30"}`}>
              {current.includes(opt) && (
                <span className="font-mono text-[10px] text-purple-400">✓</span>
              )}
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
            <span className="font-mono text-sm text-purple-300 group-hover:text-purple-200 transition-colors">{opt}</span>
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
      placeholder={q.placeholder || `// ${q.label.toLowerCase()}...`}
      className={`${base} h-10`}
    />
  )
}

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const config: Record<string, { color: string; bg: string; border: string; label: string }> = {
    active: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: labels.active },
    closed: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: labels.closed },
    archived: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: labels.archived },
  }
  const c = config[status] || config.archived
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs border ${c.color} ${c.bg} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.color.replace("text-", "bg-")} ${status === "active" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  )
}

function VisibilityBadge({ visibility, labels }: { visibility: string; labels: Record<string, string> }) {
  const map: Record<string, string> = {
    public_anonymous: labels.publicAnonymous,
    public_users: labels.publicUsers,
    private_invite: labels.privateInvite,
  }
  return (
    <span className="inline-flex items-center rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 font-mono text-xs text-purple-400">
      {map[visibility] || visibility.toUpperCase()}
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  const canSubmit = useMemo(() => {
    if (!form) return false
    if (form.status !== "active" || !form.canSubmit) return false
    if (form.visibility === "public_users" && !user) return false
    if (form.visibility === "private_invite" && !inviteToken) return false
    return true
  }, [form, user, inviteToken])

  const validate = () => {
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
      if (form.visibility === "public_users") {
        await apiFetch(API_ENDPOINTS.applicationsSubmitBySlug.replace(":slug", encodeURIComponent(form.slug)), {
          method: "POST",
          body: JSON.stringify({ answers }),
        })
      } else {
        await apiFetch(API_ENDPOINTS.publicApplicationsSubmitBySlug.replace(":slug", encodeURIComponent(form.slug)), {
          method: "POST",
          body: JSON.stringify({ answers, inviteToken: inviteToken || undefined, reporterEmail: reporterEmail || undefined }),
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
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      {/* Scanlines */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      {/* Grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(168,85,247,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      {/* Top glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.15),transparent_50%)]" />
      {/* Bottom right glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(147,51,234,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between border-b border-purple-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-purple-400">
              {t("brand")}
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-purple-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-purple-300">{t("nav.home")}</Link>
            <Link href="/dashboard" className="transition-colors hover:text-purple-300">{t("nav.dashboard")}</Link>
            <Link href="/login" className="transition-colors hover:text-purple-300">{t("nav.login")}</Link>
          </nav>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <p className="font-mono text-2xl sm:text-4xl font-black text-purple-400/60 animate-pulse">
                {t("loading.title")}
              </p>
              <p className="mt-3 font-mono text-sm text-purple-400/40">
                {t("loading.subtitle")}
              </p>
            </div>
            <TerminalBlock>
              <div className="text-purple-400">
                <p className="text-gray-500">eclipse@systems ~ % fetch /forms/{slug}</p>
                <p className="mt-2 text-yellow-400 animate-pulse">
                  <TypingText text={t("loading.terminal") } speed={60} />
                </p>
              </div>
            </TerminalBlock>
            <BinaryStrip />
          </div>
        )}

        {/* Error — No Form */}
        {!loading && error && !form && (
          <div className="space-y-6">
            <section className="text-center py-4">
              <h1 className="mb-4 font-mono text-5xl sm:text-7xl font-black tracking-tighter">
                <span className="bg-gradient-to-r from-red-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  {t("errorState.title")}
                </span>
              </h1>
              <p className="font-mono text-lg sm:text-xl text-purple-400/80">
                <span className="text-pink-400">{t("errorState.faultLabel")}</span> {t("errorState.faultValue")}
              </p>
              <p className="mt-2 font-mono text-xs sm:text-sm text-purple-400/50">
                {t("errorState.subtitle")}
              </p>
            </section>

            <TerminalBlock>
              <div className="text-purple-400">
                <p className="text-gray-500">eclipse@systems ~ % fetch /forms/{slug}</p>
                <p className="mt-2">
                  <span className="text-red-400">{t("errorState.terminalError")}</span>{" "}
                  <TypingText text={error} />
                </p>
                <p className="mt-1">
                  <span className="text-pink-400">{t("errorState.terminalSlug")}</span>{" "}
                  <span className="text-red-400/80">{slug}</span>
                </p>
                <p>
                  <span className="text-pink-400">{t("errorState.terminalStatus")}</span>{" "}
                  <span className="text-red-400">{t("errorState.notFound")}</span>
                </p>
              </div>
            </TerminalBlock>

            <BinaryStrip />

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm space-y-3">
              <h3 className="font-mono text-lg font-bold text-purple-400">{t("errorState.recoveryTitle")}</h3>
              <ul className="space-y-2 font-mono text-sm">
                <li>
                  <Link href="/" className="flex items-center gap-2 rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("errorState.returnHome")}
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="flex items-center gap-2 rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("errorState.goDashboard")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Form Loaded */}
        {!loading && form && (
          <div className="space-y-6">

            {/* Success State */}
            {success ? (
              <div className="space-y-6">
                <section className="text-center py-6">
                  <h1 className="mb-4 font-mono text-4xl sm:text-6xl font-black tracking-tighter">
                    <span className="bg-gradient-to-r from-emerald-400 via-green-300 to-purple-400 bg-clip-text text-transparent">
                      {t("success.title")}
                    </span>
                  </h1>
                  <p className="font-mono text-lg sm:text-xl text-purple-400/80">
                    <span className="text-emerald-400">{t("success.label")}</span> {t("success.value")}
                  </p>
                </section>

                <TerminalBlock>
                  <div className="text-purple-400">
                    <p className="text-gray-500">eclipse@systems ~ % submit /forms/{form.slug}</p>
                    <p className="mt-2">
                      <span className="text-emerald-400">OK:</span>{" "}
                      <TypingText text={t("success.terminalLine")} />
                    </p>
                    <p className="mt-1">
                      <span className="text-pink-400">{t("success.statusLabel")}</span>{" "}
                      <span className="text-emerald-400">{t("success.statusValue")}</span>
                    </p>
                    <p>
                      <span className="text-pink-400">{t("success.formLabel")}</span>{" "}
                      <span className="text-purple-300">{form.slug}</span>
                    </p>
                  </div>
                </TerminalBlock>

                <BinaryStrip />

                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    onClick={() => setSuccess(null)}
                    className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                  >
                    {t("success.submitAgain")}
                  </button>
                  <Link
                    href="/"
                    className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
                  >
                    {t("success.navigateHome")}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Form Header */}
                <section>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <h1 className="font-mono text-2xl sm:text-4xl font-black tracking-tight">
                      <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-purple-400 bg-clip-text text-transparent">
                        {form.title}
                      </span>
                    </h1>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={form.status} labels={{ active: t("badges.active"), closed: t("badges.closed"), archived: t("badges.archived") }} />
                      <VisibilityBadge visibility={form.visibility} labels={{ publicAnonymous: t("badges.publicAnonymous"), publicUsers: t("badges.publicUsers"), privateInvite: t("badges.privateInvite") }} />
                    </div>
                  </div>
                  {form.description && (
                    <p className="font-mono text-sm text-purple-400/60 leading-relaxed mt-2">
                      // {form.description}
                    </p>
                  )}
                </section>

                {/* Metadata Terminal */}
                <TerminalBlock title={`form://${form.slug}`}>
                  <div className="text-purple-400 space-y-1">
                    <p className="text-gray-500">eclipse@systems ~ % inspect /forms/{form.slug}</p>
                    <p className="mt-2">
                      <span className="text-pink-400">TITLE:</span>{" "}
                      <span className="text-purple-200">{form.title}</span>
                    </p>
                    <p>
                      <span className="text-pink-400">QUESTIONS:</span>{" "}
                      <span className="text-purple-200">{questions.length}</span>
                    </p>
                    <p>
                      <span className="text-pink-400">MODE:</span>{" "}
                      <span className="text-purple-200">{form.visibility}</span>
                    </p>
                    <p>
                      <span className="text-pink-400">STATUS:</span>{" "}
                      <span className={form.status === "active" ? "text-emerald-400" : "text-red-400"}>
                        {form.status.toUpperCase()}
                      </span>
                    </p>
                    {inviteToken && (
                      <p>
                        <span className="text-pink-400">INVITE:</span>{" "}
                        <span className="text-emerald-400">VALIDATED ✓</span>
                      </p>
                    )}
                  </div>
                </TerminalBlock>

                <BinaryStrip />

                {/* Warnings / Info */}
                {form.visibility === "public_users" && !user && (
                  <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 backdrop-blur-sm">
                    <span className="font-mono text-yellow-400 text-lg leading-none mt-0.5 flex-shrink-0">⚠</span>
                    <div className="font-mono text-sm">
                      <p className="text-yellow-300 font-semibold">AUTH_REQUIRED</p>
                      <p className="text-yellow-400/70 mt-1 text-xs">
                        {t("warnings.authRequired")}{" "}
                        <Link
                          href={`/login?next=${encodeURIComponent(`/forms/${form.slug}`)}`}
                          className="text-pink-400 hover:underline"
                        >
                          {t("warnings.login")}
                        </Link>
                      </p>
                    </div>
                  </div>
                )}

                {(form.visibility === "public_anonymous" || form.visibility === "private_invite") && (
                  <div className="flex items-start gap-3 rounded-lg border border-purple-500/20 bg-black/40 px-4 py-3 backdrop-blur-sm">
                    <span className="font-mono text-purple-400 text-sm leading-none mt-0.5 flex-shrink-0">//</span>
                    <p className="font-mono text-xs text-purple-400/60 leading-relaxed">
                      {t("warnings.anonymousInfo")}
                    </p>
                  </div>
                )}

                {form.status !== "active" && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 backdrop-blur-sm">
                    <span className="font-mono text-red-400 text-lg leading-none mt-0.5 flex-shrink-0">✕</span>
                    <div className="font-mono text-sm">
                      <p className="text-red-300 font-semibold">{t("warnings.formClosed")}</p>
                      <p className="text-red-400/70 mt-1 text-xs">
                        {t("warnings.formClosedDetail")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Contact Email */}
                {form.visibility !== "public_users" && (
                  <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-5 backdrop-blur-sm space-y-2">
                    <label className="font-mono text-xs text-purple-400/70 uppercase tracking-wider">
                      {t("contactEmail.label")}
                    </label>
                    <input
                      type="email"
                      value={reporterEmail}
                      onChange={(e) => setReporterEmail(e.target.value)}
                      placeholder={t("contactEmail.placeholder")}
                      className="w-full rounded border border-purple-500/20 bg-black/40 px-3 py-2 h-10 font-mono text-sm text-purple-100 placeholder:text-purple-400/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all"
                    />
                    <p className="font-mono text-[10px] text-purple-400/40">
                      {t("contactEmail.help")}
                    </p>
                  </div>
                )}

                {/* Progress Bar */}
                {questions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between font-mono text-xs text-purple-400/50">
                      <span>{t("progress.label")}</span>
                      <span className="text-purple-300">{progressPercent}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-purple-500/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Questions */}
                <div className="space-y-4">
                  {questions.length === 0 ? (
                    <TerminalBlock>
                      <p className="text-yellow-400">
                        <span className="text-gray-500">// </span>
                        {t("questions.none")}
                      </p>
                    </TerminalBlock>
                  ) : (
                    questions.map((q, index) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-5 backdrop-blur-sm space-y-3 hover:border-purple-500/30 transition-all"
                      >
                        {/* Question header */}
                        <div className="flex items-start justify-between gap-2">
                          <label className="font-mono text-sm font-semibold text-purple-200 flex items-center gap-2">
                            <span className="text-purple-500/50 text-xs font-normal">[{String(index + 1).padStart(2, "0")}]</span>
                            {q.label}
                            {q.required && (
                              <span className="text-red-400 text-xs">*required</span>
                            )}
                          </label>
                          <span className="flex-shrink-0 font-mono text-[10px] text-purple-400/40 border border-purple-500/20 rounded px-1.5 py-0.5 bg-purple-500/5">
                            {q.type}
                          </span>
                        </div>
                        <FormInput
                          q={q}
                          value={answers[q.id]}
                          onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                        />
                      </div>
                    ))
                  )}
                </div>

                {/* Error & Success */}
                {error && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 backdrop-blur-sm">
                    <span className="font-mono text-red-400 flex-shrink-0">✕</span>
                    <div>
                      <p className="font-mono text-xs font-semibold text-red-300">{t("errors.validationTitle")}</p>
                      <p className="font-mono text-xs text-red-400/80 mt-1">{error}</p>
                    </div>
                  </div>
                )}

                <BinaryStrip />

                {/* Submit */}
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={submit}
                    disabled={!canSubmit || saving}
                    className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-purple-500/10 disabled:hover:shadow-none"
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                          {t("actions.transmitting")}
                      </span>
                    ) : (
                        t("actions.submit")
                    )}
                  </button>
                  <Link
                    href="/"
                    className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
                  >
                      {t("actions.navigateHome")}
                  </Link>
                  {!canSubmit && form.status === "active" && form.visibility === "public_users" && !user && (
                      <p className="font-mono text-xs text-red-400/70">{t("actions.loginRequired")}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <BinaryStrip />

        {/* Footer */}
        <footer className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm mt-4">
          <p className="font-mono text-xs text-purple-400/50">
            {t("footer.questions")} {" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            {t("footer.orReturn")} {" "}
            <Link href="/" className="text-pink-400 hover:underline">
              {t("footer.home")}
            </Link>.
          </p>
        </footer>
      </div>

      {/* Blink keyframe */}
      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </main>
  )
}