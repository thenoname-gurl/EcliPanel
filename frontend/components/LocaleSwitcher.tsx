"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { defaultLocale, locales, type AppLocale } from "@/i18n/config"

const LOCALE_COOKIE_NAME = "locale"
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const localeOptions: Array<{ value: AppLocale; labelKey: string }> = [
  { value: "en", labelKey: "english" },
  { value: "ru", labelKey: "russian" },
]

function isSupportedLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale)
}

function setLocaleCookie(locale: AppLocale) {
  if (typeof document === "undefined") return
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
}

export function LocaleSwitcher() {
  const t = useTranslations("locale")
  const rawLocale = useLocale()
  const activeLocale: AppLocale = isSupportedLocale(rawLocale) ? rawLocale : defaultLocale
  const { user, refreshUser } = useAuth()
  const [value, setValue] = useState<AppLocale>(activeLocale)

  useEffect(() => {
    if (activeLocale) {
      setValue(activeLocale)
      setLocaleCookie(activeLocale)
    }
  }, [activeLocale])

  useEffect(() => {
    const persisted = user?.settings?.locale
    if (persisted && isSupportedLocale(persisted)) {
      setLocaleCookie(persisted)
      if (persisted !== value) {
        setValue(persisted)
      }
    }
  }, [user?.settings, value])

  const handleLocaleChange = async (nextLocale: string) => {
    if (!isSupportedLocale(nextLocale)) return

    const locale = nextLocale
    setValue(locale)
    setLocaleCookie(locale)

    if (user?.id) {
      try {
        await apiFetch(API_ENDPOINTS.userDetail.replace(":id", String(user.id)), {
          method: "PUT",
          body: JSON.stringify({
            settings: { ...(user.settings || {}), locale },
          }),
        })
        await refreshUser()
      } catch {
        // meow
      }
    }

    window.location.reload()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline">{t("label")}</span>
      <Select value={value} onValueChange={handleLocaleChange}>
        <SelectTrigger className="h-7 min-w-[120px] text-[11px]" size="sm" aria-label={t("label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {localeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}