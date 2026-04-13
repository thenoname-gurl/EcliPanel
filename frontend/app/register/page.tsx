"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { COUNTRIES } from "@/lib/countries"
import { apiFetch } from "@/lib/api-client"
import {
  AlertTriangle,
  Info,
  User,
  Mail,
  Lock,
  MapPin,
  Building2,
  Phone,
  Globe,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  CheckCircle2,
  ChevronDown,
  Volume2,
  VolumeX,
  Check,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface BehaviorMetrics {
  mouseMoves: number
  mouseClicks: number
  keyboardEvents: number
  firstInteraction?: number
  lastInteraction?: number
}

interface FormData {
  firstName: string
  lastName: string
  email: string
  password: string
  address: string
  address2: string
  billingCompany: string
  billingCity: string
  billingState: string
  billingZip: string
  billingCountry: string
  middleName: string
  phone: string
  captchaAnswer: string
  captchaToken: string
  invisibleCaptchaToken?: string
  invisibleCaptchaDelayMs?: number
  invisibleCaptchaDelay?: number
  behaviorData?: BehaviorMetrics
}

function getPasswordStrength(password: string): number {
  if (!password) return 0
  const lengthScore = Math.min(1, password.length / 16)
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const varietyScore = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length / 4
  return Math.min(1, Math.round((0.35 * lengthScore + 0.65 * varietyScore) * 100) / 100)
}

function getPasswordChecks(password: string) {
  return [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Symbol", met: /[^A-Za-z0-9]/.test(password) },
  ]
}

function getPasswordStrengthLabel(score: number): { label: string; color: string; trackColor: string } {
  if (score >= 0.8) return { label: "Strong", color: "bg-emerald-500", trackColor: "text-emerald-500" }
  if (score >= 0.55) return { label: "Moderate", color: "bg-amber-400", trackColor: "text-amber-400" }
  if (score > 0) return { label: "Weak", color: "bg-destructive", trackColor: "text-destructive" }
  return { label: "Too short", color: "bg-muted-foreground/40", trackColor: "text-muted-foreground" }
}

/* ─── Reusable Input ─── */
function InputField({
  icon: Icon,
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  className,
  rightElement,
  autoComplete,
}: {
  icon?: any
  label?: string
  name: string
  type?: string
  placeholder: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  className?: string
  rightElement?: React.ReactNode
  autoComplete?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={name} className="block text-[13px] font-medium text-foreground/80">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <div className="relative group">
        {Icon && (
          <div
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
              focused ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          autoComplete={autoComplete}
          aria-required={required}
          className={cn(
            "w-full rounded-xl border bg-background py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-all duration-150",
            "border-border/60",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "hover:border-muted-foreground/40",
            Icon ? "pl-10 pr-3" : "px-3.5",
            rightElement && "pr-11"
          )}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
        )}
      </div>
    </div>
  )
}

/* ─── Reusable Select ─── */
function SelectField({
  icon: Icon,
  label,
  name,
  value,
  onChange,
  required,
  children,
  className,
}: {
  icon?: any
  label?: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={name} className="block text-[13px] font-medium text-foreground/80">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <div className="relative group">
        {Icon && (
          <div
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors duration-150",
              focused ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          className={cn(
            "w-full rounded-xl border py-3 text-sm outline-none transition-all duration-150 appearance-none cursor-pointer",
            "border-border/60 bg-background text-foreground",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "hover:border-muted-foreground/40",
            Icon ? "pl-10 pr-10" : "pl-3.5 pr-10",
            !value && "text-muted-foreground/50"
          )}
          style={{ colorScheme: "dark" }}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

/* ─── Alert Banner ─── */
function AlertBanner({
  variant = "info",
  title,
  children,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  variant?: "info" | "warning" | "error" | "success"
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}) {
  const styles = {
    info: {
      container: "border-blue-500/20 bg-blue-500/5",
      icon: "text-blue-400",
      title: "text-blue-300",
      text: "text-blue-200/70",
      IconComponent: Info,
    },
    warning: {
      container: "border-yellow-500/20 bg-yellow-500/5",
      icon: "text-yellow-400",
      title: "text-yellow-300",
      text: "text-yellow-200/70",
      IconComponent: AlertTriangle,
    },
    error: {
      container: "border-destructive/20 bg-destructive/5",
      icon: "text-destructive",
      title: "text-destructive",
      text: "text-destructive/70",
      IconComponent: AlertTriangle,
    },
    success: {
      container: "border-green-500/20 bg-green-500/5",
      icon: "text-green-400",
      title: "text-green-300",
      text: "text-green-200/70",
      IconComponent: CheckCircle2,
    },
  }

  const style = styles[variant]
  const IconComp = style.IconComponent

  return (
    <div className={cn("rounded-xl border p-3.5 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-300", style.container)}>
      <div className="flex gap-3">
        <IconComp className={cn("h-5 w-5 shrink-0 mt-0.5", style.icon)} />
        <div className="flex-1 min-w-0 space-y-1">
          {title && <p className={cn("text-sm font-semibold", style.title)}>{title}</p>}
          <div className={cn("text-sm leading-relaxed", style.text)}>{children}</div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={cn(
                "mt-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                "border-current/20 hover:bg-white/5"
              )}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Section Divider ─── */
function SectionDivider({ label, icon: Icon }: { label: string; icon?: any }) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <div className="h-px flex-1 bg-border/50" />
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  )
}

/* ─── Step Indicator ─── */
function StepIndicator({
  steps,
  current,
  onStepClick,
}: {
  steps: string[]
  current: number
  onStepClick: (i: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-0 w-full px-2">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <button
            type="button"
            onClick={() => onStepClick(i)}
            className={cn(
              "flex items-center gap-2 transition-all duration-200 group",
              i <= current ? "cursor-pointer" : "cursor-default"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-all duration-200 shrink-0",
                i < current
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === current
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground"
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:block transition-colors",
                i === current ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div className="flex-1 mx-2 sm:mx-3">
              <div
                className={cn(
                  "h-0.5 rounded-full transition-colors duration-300",
                  i < current ? "bg-primary" : "bg-border/50"
                )}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Main Component ─── */
export default function RegisterPage() {
  const t = useTranslations("register")
  const [step, setStep] = useState(0)
  const steps = [t("steps.account"), t("steps.address"), t("steps.verify")]

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    address: "",
    address2: "",
    billingCompany: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "",
    middleName: "",
    phone: "",
    captchaAnswer: "",
    captchaToken: "",
    invisibleCaptchaToken: "",
    invisibleCaptchaDelayMs: 0,
  })

  const [captchaImage, setCaptchaImage] = useState("")
  const [captchaAudio, setCaptchaAudio] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [panelSettings, setPanelSettings] = useState<{
    registrationEnabled: boolean
    registrationNotice: string
    featureToggles?: Record<string, boolean>
  } | null>(null)
  const router = useRouter()

  const [domainOk, setDomainOk] = useState<boolean | null>(null)
  const [backendReady, setBackendReady] = useState<boolean | null>(null)
  const [backendStatusMessage, setBackendStatusMessage] = useState<string | null>(null)
  const [backendChecking, setBackendChecking] = useState(false)
  const [invisibleTokenRequestedAt, setInvisibleTokenRequestedAt] = useState<number | null>(null)
  const [behaviorData, setBehaviorData] = useState<BehaviorMetrics>({
    mouseMoves: 0,
    mouseClicks: 0,
    keyboardEvents: 0,
  })
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [dismissedDomainWarning, setDismissedDomainWarning] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("domainWarningDismissed") === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => {
        setPanelSettings(data)
        if (data?.featureToggles?.captchaInvisible) {
          loadInvisibleCaptcha()
        }
      })
      .catch(() => setPanelSettings({ registrationEnabled: true, registrationNotice: "" }))
    loadCaptcha()
  }, [])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      setDomainOk(window.location.hostname.endsWith("ecli.app"))
    } catch {
      setDomainOk(null)
    }
  }, [])

  const checkBackend: () => Promise<void> = useCallback(async () => {
    if (typeof window === "undefined") return
    setBackendChecking(true)

    const controller = new AbortController()
    let timeoutId: number | null = null
    try {
      timeoutId = window.setTimeout(() => controller.abort(), 3000)
      const res = await fetch(API_ENDPOINTS.health, { method: "GET", cache: "no-store", signal: controller.signal })

      if (!res.ok) {
        let message = t("backendUnavailableMessage")
        try {
          const json = await res.json()
          if (json?.status) {
            message = `${message} (${json.status})`
          }
        } catch {}
        setBackendReady(false)
        setBackendStatusMessage(message)
        return
      }

      const data = await res.json()
      if (data?.status !== "ok") {
        setBackendReady(false)
        setBackendStatusMessage(t("backendUnavailableMessage"))
        return
      }

      setBackendReady(true)
      setBackendStatusMessage(null)
    } catch {
      setBackendReady(false)
      setBackendStatusMessage(t("backendUnavailableMessage"))
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      setBackendChecking(false)
    }
  }, [t])

  useEffect(() => {
    if (typeof window === "undefined") return
    checkBackend()
  }, [checkBackend])

  useEffect(() => {
    if (typeof window === "undefined") return
    const nonPiiFields = new Set(["billingCompany", "billingCity", "billingState", "billingZip", "billingCountry", "address2"])

    const onMouseMove = () => {
      setBehaviorData((prev) => {
        const now = Date.now()
        return { ...prev, mouseMoves: prev.mouseMoves + 1, firstInteraction: prev.firstInteraction || now, lastInteraction: now }
      })
    }
    const onMouseClick = () => {
      const now = Date.now()
      setBehaviorData((prev) => ({ ...prev, mouseClicks: prev.mouseClicks + 1, firstInteraction: prev.firstInteraction || now, lastInteraction: now }))
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const name = (e.target as HTMLInputElement)?.name || ""
      if (!name || !nonPiiFields.has(name)) return
      const now = Date.now()
      setBehaviorData((prev) => ({ ...prev, keyboardEvents: prev.keyboardEvents + 1, firstInteraction: prev.firstInteraction || now, lastInteraction: now }))
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mousedown", onMouseClick)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseClick)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const loadCaptcha = async () => {
    setCaptchaLoading(true)
    setAudioError(false)
    try {
      const data = await apiFetch("/api/auth/captcha")
      if (data?.token) {
        setForm((prev) => ({ ...prev, captchaToken: String(data.token), captchaAnswer: "" }))
        setCaptchaImage(data.image || "")
        setCaptchaAudio(data.audio || "")
      } else {
        setForm((prev) => ({ ...prev, captchaToken: "", captchaAnswer: "" }))
        setCaptchaImage("")
        setCaptchaAudio("")
      }
    } catch {
      setForm((prev) => ({ ...prev, captchaToken: "", captchaAnswer: "" }))
      setCaptchaImage("")
    } finally {
      setCaptchaLoading(false)
    }
  }

  const loadInvisibleCaptcha = async () => {
    try {
      const data = await apiFetch("/api/auth/captcha/invisible")
      if (data?.token) {
        setForm((prev) => ({ ...prev, invisibleCaptchaToken: String(data.token) }))
        setInvisibleTokenRequestedAt(Date.now())
      } else {
        setForm((prev) => ({ ...prev, invisibleCaptchaToken: "" }))
        setInvisibleTokenRequestedAt(null)
      }
    } catch {
      setForm((prev) => ({ ...prev, invisibleCaptchaToken: "" }))
      setInvisibleTokenRequestedAt(null)
    }
  }

  const playAudio = () => {
    if (!captchaAudio) { setAudioError(true); return }
    setAudioError(false)
    setAudioPlaying(true)
    const audio = new Audio(captchaAudio)
    audio.addEventListener("ended", () => setAudioPlaying(false))
    audio.addEventListener("error", () => { setAudioPlaying(false); setAudioError(true) })
    audio.play().catch(() => { setAudioPlaying(false); setAudioError(true) })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === "password") setPasswordStrength(getPasswordStrength(value))
  }

  /* ─── Step validation ─── */
  const canProceedStep0 = form.firstName && form.lastName && form.email && form.password && form.phone && passwordStrength >= 0.55
  const canProceedStep1 = form.address && form.billingCity && form.billingState && form.billingZip && form.billingCountry

  const nextStep = () => {
    if (step === 0 && !canProceedStep0) {
      setError(t("requiredFieldsStep0"))
      return
    }
    if (step === 1 && !canProceedStep1) {
      setError(t("requiredFieldsStep1"))
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  const prevStep = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  const handleStepClick = (i: number) => {
    if (i < step) {
      setError(null)
      setStep(i)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const usingCustomCaptcha = !!panelSettings?.featureToggles?.captcha
    const usingInvisibleCaptcha = !!panelSettings?.featureToggles?.captchaInvisible
    const hasCustomCaptcha = !!form.captchaToken && !!form.captchaAnswer
    const hasInvisibleCaptcha = !!form.invisibleCaptchaToken

    if (usingCustomCaptcha && usingInvisibleCaptcha) {
      if (!hasCustomCaptcha && !hasInvisibleCaptcha) {
        setError(t("captchaChallengeOrWait"))
        return
      }
    } else if (usingCustomCaptcha && !hasCustomCaptcha) {
      setError(t("captchaExpired"))
      return
    } else if (usingInvisibleCaptcha && !hasInvisibleCaptcha) {
      setError(t("invisibleCaptchaMissing"))
      return
    }

    setError(null)
    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.userRegister, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          behaviorData,
          invisibleCaptchaDelay: invisibleTokenRequestedAt ? Date.now() - invisibleTokenRequestedAt : undefined,
        }),
      })
      router.push("/login")
    } catch (err: any) {
      setError(err.message || t("registrationFailed"))
    } finally {
      setLoading(false)
    }
  }

  const registrationDisabled = panelSettings !== null && !panelSettings.registrationEnabled
  const notice = panelSettings?.registrationNotice || ""
  const passwordChecks = getPasswordChecks(form.password)
  const strengthInfo = getPasswordStrengthLabel(passwordStrength)
  const hasCaptcha = !!panelSettings?.featureToggles?.captcha

  return (
    <div className="min-h-[100dvh] w-full bg-background overflow-auto">
      {/* Side gradient glow — left */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
      {/* Side gradient glow — right (subtle secondary) */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-secondary/[0.08] via-transparent to-transparent pointer-events-none" />

      <div className="relative flex min-h-[100dvh] w-full items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[520px]">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5 shadow-lg shadow-primary/5">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
              {t("subtitle")}
            </p>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-border/60 bg-card/80 backdrop-blur-md shadow-2xl shadow-black/5 overflow-hidden">
            {!registrationDisabled && (
              <div className="px-4 sm:px-8 pt-6 pb-2">
                <StepIndicator steps={steps} current={step} onStepClick={handleStepClick} />
              </div>
            )}

            <div className="p-4 sm:p-8 space-y-5">
              <div className="space-y-3">
                {notice && !registrationDisabled && (
                  <AlertBanner variant="info">{notice}</AlertBanner>
                )}
                {domainOk === false && !dismissedDomainWarning && (
                  <AlertBanner
                    variant="warning"
                    title={t("verifyDomain")}
                    onDismiss={() => {
                      try { localStorage.setItem("domainWarningDismissed", "1") } catch {}
                      setDismissedDomainWarning(true)
                    }}
                  >
                    <p>
                      {t.rich("domainWarning", {
                        domain: (chunks: ReactNode) => <span className="font-medium">{chunks}</span>,
                        link: (chunks: ReactNode) => (
                          <a href="https://ecli.app" className="underline font-medium">
                            {chunks}
                          </a>
                        ),
                      })}
                    </p>
                  </AlertBanner>
                )}
                {backendReady === false && (
                  <AlertBanner variant="error" title={t("backendUnavailableTitle")}> 
                    <div className="space-y-3">
                      <p>{t("backendUnavailableMessage")}</p>
                      {backendStatusMessage && (
                        <p className="text-xs text-muted-foreground">{backendStatusMessage}</p>
                      )}
                      <button
                        type="button"
                        onClick={checkBackend}
                        disabled={backendChecking}
                        className={cn(
                          "inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-medium transition-all",
                          "hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed",
                          "focus:outline-none focus:ring-2 focus:ring-primary/20"
                        )}
                      >
                        {backendChecking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("retry")
                        )}
                      </button>
                    </div>
                  </AlertBanner>
                )}
                {registrationDisabled && (
                  <AlertBanner variant="warning" title={t("registrationUnavailable")}>
                    {notice && <p>{notice}</p>}
                  </AlertBanner>
                )}
                {error && (
                  <AlertBanner variant="error" title={t("somethingWentWrong")}>
                    {error}
                  </AlertBanner>
                )}
              </div>

              {registrationDisabled ? (
                <div className="text-center py-10">
                  <p className="text-muted-foreground mb-5">{t("registrationNotAvailable")}</p>
                  <a href="/login" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors">
                    {t("signInInstead")} <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className={cn("space-y-4 transition-all duration-300", step !== 0 && "hidden")}>
                    <SectionDivider label={t("personalInfo")} icon={User} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <InputField
                        icon={User}
                        name="firstName"
                        placeholder={t("firstNamePlaceholder")}
                        label={t("firstName")}
                        value={form.firstName}
                        onChange={handleChange}
                        required
                        autoComplete="given-name"
                      />
                      <InputField
                        icon={User}
                        name="lastName"
                        placeholder={t("lastNamePlaceholder")}
                        label={t("lastName")}
                        value={form.lastName}
                        onChange={handleChange}
                        required
                        autoComplete="family-name"
                      />
                    </div>

                    <InputField
                      icon={Mail}
                      name="email"
                      type="email"
                      placeholder={t("emailPlaceholder")}
                      label={t("emailAddress")}
                      value={form.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                    />

                    <div className="space-y-2">
                      <InputField
                        icon={Lock}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t("passwordPlaceholder")}
                        label={t("password")}
                        value={form.password}
                        onChange={(e) => {
                          handleChange(e)
                          setPasswordFocused(true)
                        }}
                        required
                        autoComplete="new-password"
                        rightElement={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />

                      <div className="space-y-2">
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                "h-1.5 flex-1 rounded-full transition-all duration-300",
                                passwordStrength > i * 0.25 && form.password
                                  ? strengthInfo.color
                                  : "bg-border/40"
                              )}
                            />
                          ))}
                        </div>

                        {(passwordFocused || form.password) && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                            {passwordChecks.map((check) => (
                              <div
                                key={check.label}
                                className={cn(
                                  "flex items-center gap-1.5 text-[11px] transition-colors duration-200",
                                  check.met ? "text-emerald-500" : "text-muted-foreground/60"
                                )}
                              >
                                {check.met ? (
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                ) : (
                                  <div className="h-3 w-3 rounded-full border border-current shrink-0" />
                                )}
                                {check.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <InputField
                      icon={Phone}
                      name="phone"
                      type="tel"
                      placeholder={t("phonePlaceholder")}
                      label={t("phoneNumber")}
                      value={form.phone}
                      onChange={handleChange}
                      required
                      autoComplete="tel"
                    />
                  </div>

                  <div className={cn("space-y-4 transition-all duration-300", step !== 1 && "hidden")}>
                    <SectionDivider label={t("billingAddress")} icon={MapPin} />

                    <InputField
                      icon={Building2}
                      name="billingCompany"
                      placeholder={t("companyPlaceholder")}
                      label={t("companyOptional")}
                      value={form.billingCompany}
                      onChange={handleChange}
                      autoComplete="organization"
                    />

                    <InputField
                      icon={MapPin}
                      name="address"
                      placeholder={t("streetAddressPlaceholder")}
                      label={t("streetAddress")}
                      value={form.address}
                      onChange={handleChange}
                      required
                      autoComplete="address-line1"
                    />

                    <InputField
                      name="address2"
                      placeholder={t("addressLine2Placeholder")}
                      label={t("addressLine2Optional")}
                      value={form.address2}
                      onChange={handleChange}
                      autoComplete="address-line2"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <InputField
                        name="billingCity"
                        placeholder={t("cityPlaceholder")}
                        label={t("city")}
                        value={form.billingCity}
                        onChange={handleChange}
                        required
                        autoComplete="address-level2"
                      />
                      <InputField
                        name="billingState"
                        placeholder={t("stateProvincePlaceholder")}
                        label={t("stateProvince")}
                        value={form.billingState}
                        onChange={handleChange}
                        required
                        autoComplete="address-level1"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <InputField
                        name="billingZip"
                        placeholder={t("zipPostalPlaceholder")}
                        label={t("zipPostal")}
                        value={form.billingZip}
                        onChange={handleChange}
                        required
                        autoComplete="postal-code"
                      />
                      <SelectField
                        icon={Globe}
                        name="billingCountry"
                        label={t("country")}
                        value={form.billingCountry}
                        onChange={handleChange}
                        required
                      >
                        <option value="" className="bg-background text-muted-foreground">
                          {t("selectCountry")}
                        </option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.name} className="bg-background text-foreground">
                            {c.name}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  </div>

                  <div className={cn("space-y-5 transition-all duration-300", step !== 2 && "hidden")}>
                    <div className="rounded-xl border border-border/50 bg-secondary/10 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {t("reviewTitle")}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">{t("name")}</span>
                          <p className="text-foreground">{form.firstName} {form.lastName}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">{t("email")}</span>
                          <p className="text-foreground truncate">{form.email}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">{t("phone")}</span>
                          <p className="text-foreground">{form.phone}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">{t("location")}</span>
                          <p className="text-foreground">{form.billingCity}, {form.billingCountry}</p>
                        </div>
                      </div>
                    </div>

                    {hasCaptcha && (
                      <>
                        <SectionDivider label={t("securityCheck")} icon={Shield} />
                        <div className="rounded-xl border border-border/50 bg-secondary/10 p-4 space-y-4">
                          <div className="relative rounded-lg overflow-hidden bg-background border border-border/50">
                            {captchaLoading ? (
                              <div className="flex items-center justify-center h-24">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : captchaImage ? (
                              <img src={captchaImage} alt="Captcha" className="mx-auto h-24 w-full object-contain p-2" />
                            ) : (
                              <div className="flex items-center justify-center h-24">
                                <p className="text-xs text-muted-foreground">{t("captchaLoadFailed")}</p>
                              </div>
                            )}
                          </div>

                          {captchaAudio && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={playAudio}
                                disabled={audioPlaying || captchaLoading}
                                className={cn(
                                  "w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                                  "bg-secondary/30 border-border/50 text-foreground",
                                  "hover:bg-secondary/60 hover:border-muted-foreground/40",
                                  "disabled:opacity-50 disabled:cursor-not-allowed",
                                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                                  audioPlaying && "bg-primary/10 border-primary/30"
                                )}
                              >
                                {audioPlaying ? (
                                  <><VolumeX className="h-4 w-4 animate-pulse" /><span>{t("playing")}</span></>
                                ) : (
                                  <><Volume2 className="h-4 w-4" /><span>{t("listenAudioCaptcha")}</span></>
                                )}
                              </button>
                              {audioError && (
                                <p className="text-xs text-destructive flex items-center gap-1.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  {t("audioPlayFailed")}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <InputField
                              name="captchaAnswer"
                              placeholder={t("yourAnswerPlaceholder")}
                              label={t("yourAnswer")}
                              value={form.captchaAnswer}
                              onChange={handleChange}
                              required
                              className="flex-1"
                            />
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={loadCaptcha}
                                disabled={captchaLoading}
                                className={cn(
                                  "h-[46px] w-[46px] flex items-center justify-center rounded-xl border border-border/50 transition-all",
                                  "bg-secondary/30 text-muted-foreground",
                                  "hover:bg-secondary/60 hover:text-foreground",
                                  "disabled:opacity-50 disabled:cursor-not-allowed",
                                  "focus:outline-none focus:ring-2 focus:ring-primary/20"
                                )}
                                aria-label={t("refreshCaptchaAria")}
                                title={t("newCaptchaTitle")}
                              >
                                <RefreshCw className={cn("h-4 w-4", captchaLoading && "animate-spin")} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="rounded-xl bg-secondary/10 border border-border/40 p-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t.rich("termsNotice", {
                          legal: (chunks: ReactNode) => (
                            <a
                              href="/legal"
                              className="text-primary hover:underline font-medium"
                            >
                              {chunks}
                            </a>
                          ),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    {step > 0 && (
                      <button
                        type="button"
                        onClick={prevStep}
                        className={cn(
                          "flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-medium transition-all",
                          "border border-border/60 bg-secondary/30 text-foreground",
                          "hover:bg-secondary/60 active:scale-[0.98]",
                          "focus:outline-none focus:ring-2 focus:ring-primary/20"
                        )}
                      >
                        {t("back")}
                      </button>
                    )}

                    {step < steps.length - 1 ? (
                      <button
                        type="button"
                        onClick={nextStep}
                        disabled={backendReady === false}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-semibold transition-all",
                          "bg-primary text-primary-foreground",
                          "hover:bg-primary/90 active:scale-[0.98]",
                          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                        )}
                      >
                        {t("continue")}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading || backendReady === false}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-semibold transition-all",
                          "bg-primary text-primary-foreground",
                          "hover:bg-primary/90 active:scale-[0.98]",
                          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                        )}
                      >
                        {loading ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />{t("creatingAccount")}</>
                        ) : (
                          <>{t("createAccount")}<ChevronRight className="h-4 w-4" /></>
                        )}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>

            <div className="border-t border-border/40 bg-secondary/10 px-4 sm:px-8 py-4">
              <p className="text-center text-sm text-muted-foreground">
                {t("alreadyHaveAccount")}{" "}
                <a href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                  {t("signIn")}
                </a>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
            {t("securityNote")}
          </p>
        </div>
      </div>
    </div>
  )
}