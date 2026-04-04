"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { AlertTriangle, Mail, KeyRound, Loader2, CheckCircle } from "lucide-react"

export function EnforcementBanner() {
  const t = useTranslations("enforcementBanner")
  const { user } = useAuth()
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [showCodeInput, setShowCodeInput] = useState(false)

  if (!user) return null

  const emailDone = !!user.emailVerified
  const passkeyDone = (user.passkeyCount ?? 0) > 0
  const twoFactorDone = !!user.twoFactorEnabled
  const securityDone = passkeyDone || twoFactorDone

  if (emailDone && securityDone) return null

  const handleResend = async () => {
    setResending(true)
    try {
      await apiFetch(API_ENDPOINTS.resendVerification, { method: "POST", body: JSON.stringify({}) })
      setResent(true)
      setShowCodeInput(true)
    } catch {
      // ignore
    } finally {
      setResending(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!code.trim()) return
    setVerifying(true)
    setVerifyError(null)
    try {
      await apiFetch(API_ENDPOINTS.verifyEmail, { method: "POST", body: JSON.stringify({ code: code.trim() }) })
      // reload page to refresh user session data
      window.location.reload()
    } catch (e: any) {
      setVerifyError(e.message || t("invalidCode"))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="border-b border-warning/30 bg-warning/5">
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t("title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>

        <div className="ml-8 flex flex-col gap-2">
          {/* Email verification */}
          <div className="flex items-center gap-3">
            {emailDone ? (
              <CheckCircle className="h-4 w-4 text-success" />
            ) : (
              <Mail className="h-4 w-4 text-warning" />
            )}
            <span className={`text-sm ${emailDone ? "text-success" : "text-foreground"}`}>
              {emailDone ? t("emailVerified") : t("emailNotVerified")}
            </span>
            {!emailDone && !showCodeInput && (
              <button
                onClick={handleResend}
                disabled={resending}
                className="ml-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
              >
                {resending ? t("sending") : resent ? t("resendShort") : t("sendVerificationEmail")}
              </button>
            )}
          </div>

          {/* Code input */}
          {!emailDone && showCodeInput && (
            <div className="flex items-center gap-2 ml-7">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("codePlaceholder")}
                maxLength={6}
                className="w-28 rounded-md border border-border bg-input px-3 py-1.5 text-center font-mono text-sm tracking-widest text-foreground outline-none focus:border-primary/50 transition-all"
              />
              <button
                onClick={handleVerifyCode}
                disabled={verifying || code.length < 6}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : t("verify")}
              </button>
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {resending ? t("sending") : t("resend")}
              </button>
              {verifyError && <span className="text-xs text-destructive">{verifyError}</span>}
            </div>
          )}

          {/* Security method */}
          {(() => {
            return (
              <div className="flex items-center gap-3">
                {securityDone ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <KeyRound className="h-4 w-4 text-warning" />
                )}
                <span className={`text-sm ${securityDone ? "text-success" : "text-foreground"}`}>
                  {securityDone ? t("securityMethodEnabled") : t("securityMethodMissing")}
                </span>
                {!securityDone && (
                  <a
                    href="/dashboard/settings"
                    className="ml-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors"
                  >
                    {t("goToSecurity")}
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  )
}
