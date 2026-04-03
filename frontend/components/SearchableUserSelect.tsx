"use client"

import { useState, useEffect, useRef } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { ChevronRight, Search, X } from "lucide-react"

interface UserItem {
  id: number
  firstName?: string
  lastName?: string
  email?: string
  role?: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  endpoint?: string
  initialList?: UserItem[]
  filter?: (u: UserItem) => boolean
  disabled?: boolean
}

export default function SearchableUserSelect({ value, onChange, placeholder = "Select user…", endpoint = API_ENDPOINTS.adminUsers, initialList = [], filter, disabled }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [hasLoaded, setHasLoaded] = useState(false)
  const timer = useRef<number | null>(null)

  const extractUsers = (data: any): UserItem[] => {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.users)) return data.users
    if (Array.isArray(data?.data?.users)) return data.data.users
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data?.data?.items)) return data.data.items
    return []
  }

  const applyFilter = (list: UserItem[]) => (filter ? list.filter(filter) : list)

  const localSearch = (search: string): UserItem[] => {
    const q = search.trim().toLowerCase()
    const list = applyFilter(initialList || [])
    if (!q) return list
    return list.filter((u) => {
      const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase()
      return (
        String(u.id) === q ||
        (u.email || "").toLowerCase().includes(q) ||
        fullName.includes(q)
      )
    })
  }

  const loadUsers = async (search: string): Promise<UserItem[]> => {
    const q = (search || "").trim()
    const url = `${endpoint}?page=1&q=${encodeURIComponent(q)}`
    const data = await apiFetch(url)
    const list = applyFilter(extractUsers(data))
    return list
  }

  useEffect(() => {
    if (!open || disabled || hasLoaded) return

    let cancelled = false
    setLoading(true)
    setError("")
    loadUsers("")
      .then((list) => {
        if (cancelled) return
        setResults(list)
        setHasLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setResults(localSearch(""))
        setError("Could not load users")
        setHasLoaded(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, disabled, hasLoaded])

  useEffect(() => {
    if (!open || disabled) return

    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const list = await loadUsers(query)
        setResults(list)
      } catch {
        setResults(localSearch(query))
        setError("Could not load users")
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [query, endpoint, filter, open, disabled])

  useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
  }, [open])

  const allCandidates = [...(results || []), ...(initialList || [])]
  const selected = allCandidates.find((r) => String(r.id) === String(value))
  const selectedLabel = selected
    ? `${selected.firstName || ""} ${selected.lastName || ""}`.trim() || selected.email || `User #${selected.id}`
    : value
      ? `User #${value}`
      : ""

  const shownResults = results.slice(0, 8)

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={open ? query : selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
        />
        {(query || value) && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("")
              onChange("")
              setOpen(true)
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching users…</div>}
          {!loading && error && <div className="px-3 py-2 text-xs text-warning">{error}</div>}
          {!loading && shownResults.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No users found</div>
          )}
          {!loading && shownResults.map((u) => {
            const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim()
            const primary = fullName || u.email || `User #${u.id}`
            const secondary = u.email || `ID: ${u.id}`
            return (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(String(u.id))
                setOpen(false)
                setQuery("")
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/40 last:border-0"
            >
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                {(u.firstName || u.email || "?")[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{primary}</p>
                <p className="text-xs text-muted-foreground truncate">{secondary}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
            )
          })}
          {!loading && results.length > shownResults.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground text-center bg-secondary/30">
              +{results.length - shownResults.length} more results
            </p>
          )}
        </div>
      )}
    </div>
  )
}
