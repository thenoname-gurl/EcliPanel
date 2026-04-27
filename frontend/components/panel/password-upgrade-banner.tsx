"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { ShieldAlert } from "lucide-react"

export function PasswordUpgradeBanner() {
  const t = useTranslations("settingsPage.security")
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  if (!user || !user.usesLegacyPasswordHash || dismissed) return null

  return (
    <div className="border-b border-warning/30 bg-warning/5">
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t("passwordUpgrade.title")}</p>
            <p className="text-xs text-muted-foreground">{t("passwordUpgrade.description")}</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("passwordUpgrade.dismiss")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard/settings?tab=security")}
            className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white hover:bg-warning/90 transition-colors"
          >
            {t("passwordUpgrade.action")}
          </button>
        </div>
      </div>
    </div>
  )
}