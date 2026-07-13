"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { X } from "lucide-react"

const CURRENT_TERMS_VERSION = "2026-07-13"

export function TermsUpdateBanner() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    const consented = (user as any)?.termsConsentVersion ?? null
    if (consented !== CURRENT_TERMS_VERSION) {
      setVisible(true)
    }
  }, [user])

  const accept = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.termsConsent, {
        method: "POST",
        body: { version: CURRENT_TERMS_VERSION },
      })
      if (user) (user as any).termsConsentVersion = CURRENT_TERMS_VERSION
      setVisible(false)
    } catch {
      meow
    } finally {
      setSaving(false)
    }
  }, [saving, user])

  if (!visible) return null

  return (
    <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
      <div className="flex-1 min-w-0">
        <p className="text-amber-600 dark:text-amber-400 font-medium">
          We&apos;ve updated our legal documents.
        </p>
        <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
          Please review the updated{" "}
          <Link href="/legal/terms-of-service" className="font-medium text-primary hover:underline" target="_blank">
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/legal/privacy-policy" className="font-medium text-primary hover:underline" target="_blank">
            Privacy Policy
          </Link>
          , and{" "}
          <Link href="/legal/cookies-policy" className="font-medium text-primary hover:underline" target="_blank">
            Cookies Policy
          </Link>
          . By continuing to use the service, you agree to the updated terms.
        </p>
        <button
          onClick={accept}
          disabled={saving}
          data-telemetry="terms-update:accept"
          className="mt-2 bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "I Agree, Continue"}
        </button>
      </div>
      <button
        onClick={accept}
        disabled={saving}
        data-telemetry="terms-update:dismiss"
        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
        aria-label="Dismiss and accept"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
