"use client"

import { useState, useEffect, useRef } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"

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
  const [results, setResults] = useState<UserItem[]>(initialList || [])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setResults(initialList || [])
  }, [initialList])

  useEffect(() => {
    if (!query) {
      setResults(initialList || [])
      return
    }

    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setLoading(true)
      try {
        const data = await apiFetch(`${endpoint}?q=${encodeURIComponent(query)}`)
        const list = Array.isArray(data) ? data : []
        const filtered = filter ? list.filter(filter) : list
        setResults(filtered.slice(0, 50))
      } catch (e) {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [query, endpoint, filter])

  const selected = results.find((r) => String(r.id) === String(value)) || (initialList || []).find((r) => String(r.id) === String(value))

  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? `${selected.firstName || ''} ${selected.lastName || ''} (${selected.email || selected.id})` : query)}
        onFocus={() => { setOpen(true); setQuery("") }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full"
      />
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded border border-border bg-popover shadow max-h-52 overflow-auto">
          {loading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
          {!loading && results.length === 0 && <div className="p-2 text-xs text-muted-foreground">No users</div>}
          {!loading && results.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(String(u.id)); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-secondary/60"
            >
              {u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''} — ${u.email || u.id}` : u.email || u.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
