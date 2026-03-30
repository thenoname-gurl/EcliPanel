"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { FeatureGuard } from "@/components/panel/feature-guard"

export default function DnsPage() {
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    if (user.org?.id) {
      router.replace(`/dashboard/organisations/${user.org.id}?tab=dns`)
      return
    }

    router.replace('/dashboard/organisations')
  }, [user, router])

  return (
    <FeatureGuard feature="dns">
      <div className="p-6 text-sm text-muted-foreground">Redirecting to organisation DNS…</div>
    </FeatureGuard>
  )
}