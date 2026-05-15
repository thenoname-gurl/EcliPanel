"use client"

import { useRollout } from "@/hooks/use-rollout"

type RolloutGuardProps = {
  rolloutKey: string
  fallback?: React.ReactNode
  children: React.ReactNode
  treatment?: string
}

export function RolloutGuard({ rolloutKey, fallback = null, children, treatment }: RolloutGuardProps) {
  const { inRollout, treatment: userTreatment } = useRollout(rolloutKey)

  if (!inRollout) return <>{fallback}</>
  if (treatment && userTreatment !== treatment) return <>{fallback}</>

  return <>{children}</>
}