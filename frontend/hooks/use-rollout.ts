"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"

export type RolloutState = {
  inRollout: boolean
  treatment: string | null
}

const CACHE_TTL = 60_000

let cachedRollouts: Record<string, RolloutState> = {}
let fetchPromise: Promise<Record<string, RolloutState>> | null = null
let lastFetchTime = 0

function isCacheStale(): boolean {
  return Date.now() - lastFetchTime > CACHE_TTL
}

async function getAllRollouts(): Promise<Record<string, RolloutState>> {
  if (!isCacheStale() && Object.keys(cachedRollouts).length > 0) {
    return cachedRollouts
  }
  if (fetchPromise && !isCacheStale()) return fetchPromise

  fetchPromise = (async () => {
    try {
      const data = await apiFetch("/api/rollouts")
      cachedRollouts = data || {}
      lastFetchTime = Date.now()
      return cachedRollouts
    } catch {
      return {}
    }
  })()

  return fetchPromise
}

export function useRollout(key: string): RolloutState {
  const { user } = useAuth()
  const [state, setState] = useState<RolloutState>(() => {
    if (!isCacheStale() && cachedRollouts[key]) return cachedRollouts[key]
    return { inRollout: false, treatment: null }
  })

  useEffect(() => {
    if (!user) return

    if (!isCacheStale() && cachedRollouts[key]) {
      setState(cachedRollouts[key])
      return
    }

    getAllRollouts().then((rollouts) => {
      const result = rollouts[key] || { inRollout: false, treatment: null }
      cachedRollouts[key] = result
      setState(result)
    })
  }, [key, user])

  return state
}

export function useAllRollouts(): Record<string, RolloutState> {
  const { user } = useAuth()
  const [rollouts, setRollouts] = useState<Record<string, RolloutState>>(() => ({ ...cachedRollouts }))

  const refresh = useCallback(async () => {
    lastFetchTime = 0
    const data = await getAllRollouts()
    setRollouts({ ...data })
  }, [])

  useEffect(() => {
    if (!user) return
    if (!isCacheStale() && Object.keys(cachedRollouts).length > 0) {
      setRollouts({ ...cachedRollouts })
    } else {
      refresh()
    }
  }, [user, refresh])

  return rollouts
}