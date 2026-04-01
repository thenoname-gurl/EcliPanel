"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
  ChevronDown
} from "lucide-react"
import { cn } from "@/lib/utils"

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
}

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
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={name} className="text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          aria-required={required}
          className={cn(
            "w-full rounded-lg border border-border bg-background py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "hover:border-muted-foreground/30",
            Icon ? "pl-10 pr-3" : "px-3",
            rightElement && "pr-10"
          )}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
    </div>
  )
}

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
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={name} className="text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          className={cn(
            "w-full rounded-lg border border-border py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "hover:border-muted-foreground/30",
            // Fixed background and text colors for proper contrast
            "bg-background text-foreground",
            Icon ? "pl-10 pr-10" : "pl-3 pr-10",
            !value && "text-muted-foreground/60"
          )}
          style={{
            colorScheme: 'dark'
          }}
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
      container: "border-blue-500/30 bg-blue-500/10",
      icon: "text-blue-400",
      title: "text-blue-300",
      text: "text-blue-200/80",
      IconComponent: Info,
    },
    warning: {
      container: "border-yellow-500/30 bg-yellow-500/10",
      icon: "text-yellow-400",
      title: "text-yellow-300",
      text: "text-yellow-200/80",
      IconComponent: AlertTriangle,
    },
    error: {
      container: "border-destructive/30 bg-destructive/10",
      icon: "text-destructive",
      title: "text-destructive",
      text: "text-destructive/80",
      IconComponent: AlertTriangle,
    },
    success: {
      container: "border-green-500/30 bg-green-500/10",
      icon: "text-green-400",
      title: "text-green-300",
      text: "text-green-200/80",
      IconComponent: CheckCircle2,
    },
  }

  const style = styles[variant]
  const IconComponent = style.IconComponent

  return (
    <div className={cn("rounded-xl border p-4", style.container)}>
      <div className="flex gap-3">
        <IconComponent className={cn("h-5 w-5 shrink-0 mt-0.5", style.icon)} />
        <div className="flex-1 min-w-0 space-y-1">
          {title && <p className={cn("text-sm font-semibold", style.title)}>{title}</p>}
          <div className={cn("text-sm", style.text)}>{children}</div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={cn(
                "mt-2 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors",
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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export default function RegisterPage() {
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
  })

  const [captchaImage, setCaptchaImage] = useState<string>("")
  const [captchaAudio, setCaptchaAudio] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [panelSettings, setPanelSettings] = useState<{
    registrationEnabled: boolean
    registrationNotice: string
    featureToggles?: Record<string, boolean>
  } | null>(null)
  const router = useRouter()

  const [domainOk, setDomainOk] = useState<boolean | null>(null)
  const [dismissedDomainWarning, setDismissedDomainWarning] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("domainWarningDismissed") === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => setPanelSettings(data))
      .catch(() => setPanelSettings({ registrationEnabled: true, registrationNotice: "" }))

    loadCaptcha()
  }, [])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const host = window.location.hostname || ""
      setDomainOk(host.endsWith("ecli.app"))
    } catch {
      setDomainOk(null)
    }
  }, [])

  const loadCaptcha = async () => {
    setCaptchaLoading(true)
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (panelSettings?.featureToggles?.captcha && !form.captchaToken) {
      setError("Captcha is not loaded or has expired. Please refresh the captcha and try again.")
      return
    }

    setError(null)
    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.userRegister, {
        method: "POST",
        body: JSON.stringify(form),
      })
      router.push("/login")
    } catch (err: any) {
      setError(err.message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const registrationDisabled = panelSettings !== null && !panelSettings.registrationEnabled
  const notice = panelSettings?.registrationNotice || ""

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-secondary/20 overflow-auto">
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative flex min-h-screen w-full items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-lg">
          {/* Logo/Brand */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Create an account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Join us to get started with your servers
            </p>
          </div>

          {/* Main Card */}
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="p-4 sm:p-6 md:p-8 space-y-5">
              {/* Alerts */}
              <div className="space-y-3">
                {/* Panel notice */}
                {notice && !registrationDisabled && (
                  <AlertBanner variant="info">{notice}</AlertBanner>
                )}

                {/* Domain warning */}
                {domainOk === false && !dismissedDomainWarning && (
                  <AlertBanner
                    variant="warning"
                    title="Security check — confirm domain"
                    onDismiss={() => {
                      try {
                        localStorage.setItem("domainWarningDismissed", "1")
                      } catch {}
                      setDismissedDomainWarning(true)
                    }}
                  >
                    <p>
                      This panel should be served from{" "}
                      <span className="font-medium">ecli.app</span>. If the address in your browser
                      is different, an attacker could intercept your credentials — navigate to{" "}
                      <a href="https://ecli.app" className="underline font-medium">
                        https://ecli.app
                      </a>{" "}
                      instead.
                    </p>
                  </AlertBanner>
                )}

                {/* Registration disabled */}
                {registrationDisabled && (
                  <AlertBanner variant="warning" title="Registration is currently unavailable">
                    {notice && <p>{notice}</p>}
                  </AlertBanner>
                )}

                {/* Error */}
                {error && (
                  <AlertBanner variant="error" title="Registration failed">
                    {error}
                  </AlertBanner>
                )}
              </div>

              {registrationDisabled ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">
                    Registration is not available at this time.
                  </p>
                  <a
                    href="/login"
                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Sign in to your account
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Personal Information */}
                  <SectionDivider label="Personal Information" />
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <InputField
                      icon={User}
                      name="firstName"
                      placeholder="First Name"
                      label="First Name"
                      value={form.firstName}
                      onChange={handleChange}
                      required
                    />
                    <InputField
                      icon={User}
                      name="lastName"
                      placeholder="Last Name"
                      label="Last Name"
                      value={form.lastName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <InputField
                      icon={Mail}
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      label="Email Address"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                    <InputField
                      icon={Lock}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      label="Password"
                      value={form.password}
                      onChange={handleChange}
                      required
                      rightElement={
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      }
                    />
                  </div>

                  <InputField
                    icon={Phone}
                    name="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    label="Phone Number"
                    value={form.phone}
                    onChange={handleChange}
                    required
                  />

                  {/* Billing Address */}
                  <SectionDivider label="Billing Address" />

                  <InputField
                    icon={Building2}
                    name="billingCompany"
                    placeholder="Company name"
                    label="Company (optional)"
                    value={form.billingCompany}
                    onChange={handleChange}
                  />

                  <InputField
                    icon={MapPin}
                    name="address"
                    placeholder="123 Main Street"
                    label="Street Address"
                    value={form.address}
                    onChange={handleChange}
                    required
                  />

                  <InputField
                    name="address2"
                    placeholder="Apt, suite, unit, etc."
                    label="Address Line 2 (optional)"
                    value={form.address2}
                    onChange={handleChange}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <InputField
                      name="billingCity"
                      placeholder="City"
                      label="City"
                      value={form.billingCity}
                      onChange={handleChange}
                      required
                    />
                    <InputField
                      name="billingState"
                      placeholder="State / Province"
                      label="State / Province"
                      value={form.billingState}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <InputField
                      name="billingZip"
                      placeholder="12345"
                      label="ZIP / Postal Code"
                      value={form.billingZip}
                      onChange={handleChange}
                      required
                    />
                    <SelectField
                      icon={Globe}
                      name="billingCountry"
                      label="Country"
                      value={form.billingCountry}
                      onChange={handleChange}
                      required
                    >
                      <option value="" className="bg-background text-muted-foreground">
                        Select country...
                      </option>
                      {COUNTRIES.map((country) => (
                        <option 
                          key={country.code} 
                          value={country.name}
                          className="bg-background text-foreground"
                        >
                          {country.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>

                  {/* Captcha */}
                  {panelSettings?.featureToggles?.captcha && (
                    <>
                      <SectionDivider label="Security Verification" />
                      <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="relative rounded-lg overflow-hidden bg-background border border-border">
                          {captchaLoading ? (
                            <div className="flex items-center justify-center h-20">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : captchaImage ? (
                            <img
                              src={captchaImage}
                              alt="captcha"
                              className="mx-auto h-20 w-full object-contain p-2"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-20">
                              <p className="text-xs text-muted-foreground">
                                Unable to load captcha
                              </p>
                            </div>
                          )}
                        </div>
                        {captchaAudio && (
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              type="button"
                              onClick={() => {
                                const audio = new Audio(captchaAudio)
                                audio.play().catch(() => {
                                  // ignore
                                })
                              }}
                              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/30"
                            >
                              Play audio captcha
                            </button>
                            <p className="text-xs text-muted-foreground">(accessible challenge)</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <InputField
                            name="captchaAnswer"
                            placeholder="Enter the text above"
                            label="Captcha Answer"
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
                              className="h-[42px] px-3 rounded-lg border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className={cn("h-4 w-4", captchaLoading && "animate-spin")} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Terms */}
                  <div className="rounded-xl bg-secondary/20 border border-border p-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      By creating an account, you agree to our{" "}
                      <a
                        href="https://ecli.app/documents/Terms%20of%20Service.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a
                        href="https://ecli.app/documents/Privacy%20Policy.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Privacy Policy
                      </a>
                      .
                      <br></br>
                      We'll occasionally send you account-related emails.
                    </p>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold transition-all",
                      "bg-primary text-primary-foreground",
                      "hover:bg-primary/90 active:scale-[0.98]",
                      "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        Create Account
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-secondary/30 px-4 sm:px-6 md:px-8 py-4">
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Sign in
                </a>
              </p>
            </div>
          </div>

          {/* Bottom text */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by industry-standard encryption
          </p>
        </div>
      </div>
    </div>
  )
}