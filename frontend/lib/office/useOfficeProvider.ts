"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { OfficeProvider } from "./collab"
import { useAuth } from "@/hooks/useAuth"
import type { OfficePermission } from "./types"

const CURSOR_COLORS = [
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
]

export function nameForUser(user: any): string {
  if (!user) return "Guest"
  return (
    user.displayName ||
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    (user.email || "").split("@")[0] ||
    "User"
  )
}

function colorForUser(user: any): string {
  const seed = user?.id ?? 0
  return CURSOR_COLORS[Math.abs(Number(seed) || 0) % CURSOR_COLORS.length]
}

export function useOfficeProvider(docId: number | null) {
  const { user } = useAuth()
  const providerRef = useRef<OfficeProvider | null>(null)
  const [status, setStatus] = useState<"connecting" | "connected" | "synced" | "disconnected">(
    "disconnected"
  )
  const [participants, setParticipants] = useState(0)
  const [permission, setPermission] = useState<OfficePermission | null>(null)
  const [error, setError] = useState<{ message: string } | null>(null)

  const userName = useMemo(() => nameForUser(user), [user])
  const userColor = useMemo(() => colorForUser(user), [user])

  const provider = useMemo<OfficeProvider | null>(() => {
    if (!docId || typeof window === "undefined") return null
    return new OfficeProvider(docId, { user: { name: userName, color: userColor } })
  }, [docId])

  useEffect(() => {
    if (!provider) return
    const p = provider

    const onStatus = (s: string) => {
      setStatus(s as any)
      if (s === "synced") setError(null)
    }
    const onError = (err: any) => setError({ message: String(err?.message || "collab_error") })
    const onSync = (info: any) => {
      setPermission(info?.permission as OfficePermission)
    }

    p.on("status", onStatus)
    p.on("error", onError)
    p.on("sync", onSync)

    setPermission(p.getPermission())
    p.connect()

    return () => {
      p.off("status", onStatus)
      p.off("error", onError)
      p.off("sync", onSync)
      p.destroy()
      providerRef.current = null
    }
  }, [provider])

  useEffect(() => {
    if (!provider) return
    const last = { count: -1 }
    const interval = setInterval(() => {
      let count = provider.awareness.getStates().size
      if (!Number.isFinite(count) || count < 1) count = 1
      if (count === last.count) return
      last.count = count
      setParticipants(count)
    }, 1000)
    return () => clearInterval(interval)
  }, [provider])

  const disconnect = useCallback(() => {
    provider?.disconnect()
  }, [provider])

  return { provider, status, participants, permission, error, disconnect, userName, userColor }
}