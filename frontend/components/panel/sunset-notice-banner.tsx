"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { AlertTriangle, CheckCircle } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

export function SunsetNoticeBanner() {
  const { user, refreshUser } = useAuth()
  const [confirmed, setConfirmed] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const prevNoticeRef = useRef(false)

  useEffect(() => {
    const hasNotice = !!user?.serverSunsetNoticeSentAt
    if (prevNoticeRef.current && !hasNotice && !confirmed) {
      setConfirmed(true)
      const timer = setTimeout(() => {
        setConfirmed(false)
      }, 8000)
      return () => clearTimeout(timer)
    }
    prevNoticeRef.current = hasNotice
  }, [user?.serverSunsetNoticeSentAt, confirmed])

  if (!user) return null
  if (dismissing) return null

  const hasPendingNotice = !!user.serverSunsetNoticeSentAt

  if (hasPendingNotice) {
    const graceHours = (user.settings as any)?.serverSunsetGraceHours ?? 48

    return (
      <div className="border-b border-warning/30 bg-warning/5">
        <div className="flex items-start gap-3 px-6 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Server usage confirmation required</p>
            <p className="text-xs text-muted-foreground mt-1">
              An administrator has requested that you confirm your server usage.
              Please confirm within {graceHours} hours to keep your server(s) online.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={async () => {
                  setDismissing(true)
                  try {
                    await apiFetch(API_ENDPOINTS.sunsetConfirm, { method: "POST" })
                    setConfirmed(true)
                    await refreshUser()
                  } catch {
                    setDismissing(false)
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                I confirm my usage
              </button>
              <button
                onClick={() => setDismissing(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="border-b border-success/30 bg-success/5">
        <div className="flex items-start gap-3 px-6 py-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-success mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Usage confirmed</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your server usage has been confirmed. Your servers will remain online.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}