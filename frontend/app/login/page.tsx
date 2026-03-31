"use client"

import { useState, useEffect } from "react"
import { 
  AlertTriangle, 
  Info, 
  Mail, 
  Lock, 
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Smartphone,
  MailCheck
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { OtpMethodSelector, OtpMethod } from "@/components/panel/OtpMethodSelector"
import { cn } from "@/lib/utils"

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ""
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
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
          autoComplete={autoComplete}
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
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function TwoFactorMethodButton({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: any
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left",
        selected
          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
          : "border-border hover:border-muted-foreground/30 hover:bg-secondary/30"
      )}
    >
      <div className={cn(
        "p-2 rounded-lg",
        selected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {selected && (
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
      )}
    </button>
  )
}

export default function LoginPage() {
  const { login, refreshUser } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [sendingEmail, setSendingEmail] = useState(false)
  const [otpMethod, setOtpMethod] = useState<OtpMethod | null>(null)
  const [domainOk, setDomainOk] = useState<boolean | null>(null)
  const [dismissedDomainWarning, setDismissedDomainWarning] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("domainWarningDismissed") === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const host = window.location.hostname || ""
      setDomainOk(host.endsWith("ecli.app"))
    } catch {
      setDomainOk(null)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res: any = await login(email, password)
      if (res && res.twoFactorRequired) {
        setTempToken(res.tempToken)
        setError(null)
        return
      }
      router.replace("/dashboard")
    } catch (err: any) {
      setError(err.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  const sendEmailCode = async () => {
    if (!tempToken) return
    setSendingEmail(true)
    try {
      await apiFetch(API_ENDPOINTS.twoFactorSendEmail, {
        method: "POST",
        body: JSON.stringify({ tempToken }),
      })
      setError(null)
    } catch (e: any) {
      setError(e.message || "Failed to send email code")
    }
    setSendingEmail(false)
  }

  const verify2fa = async () => {
    if (!tempToken) return setError("Missing temporary session")
    setLoading(true)
    try {
      const body: any = { tempToken }
      if (otpMethod === "totp" && twoFactorCode) body.token = twoFactorCode
      if (otpMethod === "backup" && backupCode) body.backupCode = backupCode
      if (otpMethod === "email" && emailCode) body.emailCode = emailCode
      if (!body.token && !body.backupCode && !body.emailCode) {
        setError("Please enter a code for the selected method.")
        setLoading(false)
        return
      }
      const data: any = await apiFetch(API_ENDPOINTS.twoFactorVerifyLogin, {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (data.token) {
        await refreshUser()
        router.replace("/dashboard")
      } else {
        setError("Invalid response from server")
      }
    } catch (e: any) {
      setError(e.message || "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const handlePasskey = async () => {
    if (!email) {
      setError("Enter your email address first, then click Sign in with Passkey.")
      return
    }
    setError(null)
    setPasskeyLoading(true)
    try {
      const opts = await apiFetch(API_ENDPOINTS.passkeyAuthChallenge, {
        method: "POST",
        body: JSON.stringify({ email }),
      })

      const publicKey: PublicKeyCredentialRequestOptions = {
        ...opts,
        challenge: base64urlToBuffer(opts.challenge),
        allowCredentials: (opts.allowCredentials || []).map((c: any) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      }

      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
      if (!credential) throw new Error("Passkey authentication cancelled.")

      const assertionResponse = credential.response as AuthenticatorAssertionResponse

      const authenticationResponse = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
        },
      }

      const data = await apiFetch(API_ENDPOINTS.passkeyAuthenticate, {
        method: "POST",
        body: JSON.stringify({ email, authenticationResponse }),
      })

      if (data && data.token) {
        if (typeof window !== "undefined") {
          localStorage.setItem("token", data.token)
        }
      }

      await refreshUser()
      router.push("/dashboard")
    } catch (err: any) {
      setError(err.message || "Passkey authentication failed.")
    } finally {
      setPasskeyLoading(false)
    }
  }

  const cancelTwoFactor = () => {
    setTempToken(null)
    setTwoFactorCode("")
    setBackupCode("")
    setEmailCode("")
    setOtpMethod(null)
    setError(null)
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-secondary/20 overflow-auto">
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex min-h-screen w-full items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your Eclipse Panel account
            </p>
          </div>

          {/* Main Card */}
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="p-4 sm:p-6 md:p-8 space-y-5">
              {/* Alerts */}
              <div className="space-y-3">
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

                {/* Error */}
                {error && (
                  <AlertBanner variant="error" title="Authentication failed">
                    {error}
                  </AlertBanner>
                )}
              </div>

              {/* Two-Factor Authentication */}
              {tempToken ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                      <KeyRound className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Two-factor authentication</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select your verification method and enter the code
                    </p>
                  </div>

                  <div className="space-y-2">
                    <TwoFactorMethodButton
                      icon={Smartphone}
                      label="Authenticator App"
                      description="Use your TOTP authenticator app"
                      selected={otpMethod === "totp"}
                      onClick={() => setOtpMethod("totp")}
                    />
                    <TwoFactorMethodButton
                      icon={MailCheck}
                      label="Email Code"
                      description="Receive a code via email"
                      selected={otpMethod === "email"}
                      onClick={() => setOtpMethod("email")}
                    />
                    <TwoFactorMethodButton
                      icon={KeyRound}
                      label="Backup Code"
                      description="Use one of your backup codes"
                      selected={otpMethod === "backup"}
                      onClick={() => setOtpMethod("backup")}
                    />
                  </div>

                  {otpMethod && (
                    <div className="pt-2 space-y-3">
                      {otpMethod === "totp" && (
                        <InputField
                          icon={Smartphone}
                          name="totp"
                          placeholder="Enter 6-digit code"
                          label="Authenticator Code"
                          value={twoFactorCode}
                          onChange={(e) => setTwoFactorCode(e.target.value)}
                          autoComplete="one-time-code"
                        />
                      )}

                      {otpMethod === "backup" && (
                        <InputField
                          icon={KeyRound}
                          name="backup"
                          placeholder="Enter backup code"
                          label="Backup Code"
                          value={backupCode}
                          onChange={(e) => setBackupCode(e.target.value)}
                        />
                      )}

                      {otpMethod === "email" && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <InputField
                                icon={MailCheck}
                                name="emailCode"
                                placeholder="Enter email code"
                                label="Email Code"
                                value={emailCode}
                                onChange={(e) => setEmailCode(e.target.value)}
                                autoComplete="one-time-code"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={sendEmailCode}
                                disabled={sendingEmail}
                                className={cn(
                                  "h-[42px] px-4 rounded-lg border border-border text-sm font-medium transition-all",
                                  "bg-secondary/50 text-foreground",
                                  "hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                              >
                                {sendingEmail ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Send"
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={verify2fa}
                          disabled={loading}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold transition-all",
                            "bg-primary text-primary-foreground",
                            "hover:bg-primary/90 active:scale-[0.98]",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              Verify
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelTwoFactor}
                          className={cn(
                            "px-4 py-2.5 rounded-xl border border-border text-sm font-medium transition-all",
                            "hover:bg-secondary"
                          )}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Login Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <InputField
                    icon={Mail}
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    label="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />

                  <InputField
                    icon={Lock}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
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

                  <div className="flex items-center justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || passkeyLoading}
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
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign In
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <SectionDivider label="or continue with" />

                  <button
                    type="button"
                    onClick={handlePasskey}
                    disabled={loading || passkeyLoading}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-medium transition-all",
                      "border border-border bg-secondary/30",
                      "hover:bg-secondary active:scale-[0.98]",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {passkeyLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Waiting for passkey...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4" />
                        Sign in with Passkey
                      </>
                    )}
                  </button>

                  {/* Terms */}
                  <p className="text-xs text-muted-foreground text-center leading-relaxed pt-2">
                    By signing in, you agree to our{" "}
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
                  </p>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-secondary/30 px-4 sm:px-6 md:px-8 py-4">
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Create an account
                </Link>
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