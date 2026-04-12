"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { FeatureFlag } from "@/lib/panel-config"

type FeatureGuardProps = {
  feature: FeatureFlag
  children: React.ReactNode
}

function toBool(value: any): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  if (value === undefined || value === null) return true
  return value === true || value === 'true' || value === 1 || value === '1' || Boolean(value)
}

export function FeatureGuard({ feature, children }: FeatureGuardProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    let isMounted = true

    apiFetch(API_ENDPOINTS.publicFeatures || API_ENDPOINTS.panelSettings)
      .then((data) => {
        const featureToggles = data?.featureToggles || {}
        const isEnabled = toBool(featureToggles[feature])

        if (!isMounted) return

        setEnabled(isEnabled)

        if (!isEnabled) {
          router.replace("/404")
        }
      })
      .catch(() => {
        if (!isMounted) return
        setEnabled(true)
      })

    return () => {
      isMounted = false
    }
  }, [feature, router])

  if (enabled === null) {
    return null
  }

  if (!enabled) {
    return null
  }

  return <>{children}</>
}
