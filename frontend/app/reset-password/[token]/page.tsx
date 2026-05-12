"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { getPasswordChecks, getPasswordStrength, getPasswordStrengthLabel, isPasswordValid, PASSWORD_MAX } from "@/lib/password-validation"
import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ResetPasswordPage() {
  const t = useTranslations("resetPasswordPage")
  const { token } = useParams() as { token: string }
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const passwordChecks = getPasswordChecks(password)
  const pwStrength = getPasswordStrength(password)
  const strengthInfo = getPasswordStrengthLabel(pwStrength)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!password || !confirm) {
      setError(t("errors.fillBoth"))
      return
    }
    if (password !== confirm) {
      setError(t("errors.noMatch"))
      return
    }
    if (!isPasswordValid(password)) {
      setError("Password must be 8-128 characters with uppercase, lowercase, number, and symbol.")
      return
    }

    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.passwordResetConfirm, {
        method: "POST",
        body: JSON.stringify({ token, password }),
      })
      setMessage(t("messages.updated"))
      setTimeout(() => router.push("/login"), 1500)
    } catch (err: any) {
      setError(err.message || t("errors.failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <h2 className="mb-4 text-center text-2xl font-semibold text-foreground">{t("title")}</h2>

        {message && <div className="mb-4 rounded bg-success/10 px-4 py-2 text-success">{message}</div>}
        {error && <div className="mb-4 rounded bg-destructive/10 px-4 py-2 text-destructive">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder={t("newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={PASSWORD_MAX}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          {password && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
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
          <input
            type="password"
            placeholder={t("confirmPassword")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? t("resetting") : t("resetPassword")}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">{t("backToSignIn")}</Link>
        </p>
      </div>
    </div>
  )
}
