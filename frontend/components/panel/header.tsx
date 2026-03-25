"use client"

import { Bell, Search, Command, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PORTALS, NAVIGATION, API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "@/lib/api-client"

// Flatten navigation items for search
const ALL_PAGES = NAVIGATION.flatMap((section) =>
  section.items.map((item: any) => ({
    label: item.label,
    href: item.href,
    section: section.title,
  }))
)

export function PanelHeader({ title, description }: { title: string; description?: string }) {
  const { user } = useAuth()
  const router = useRouter()
  const portal = PORTALS[user?.tier as keyof typeof PORTALS] ?? PORTALS.free

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  // Notifications state
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [notifPos, setNotifPos] = useState<{ top: number; left: number } | null>(null)

  // keyboard shortcut Ctrl+K / ⌘K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === "Escape") {
        setSearchOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50)
  }, [searchOpen])

  const openNotifications = async () => {
    const willOpen = !notifOpen
    setNotifOpen(willOpen)
    if (willOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const width = 320
      const left = Math.max(8, rect.right - width)
      setNotifPos({ top: rect.bottom + 8, left })
    }
    if (willOpen && user && notifications.length === 0) {
      setNotifLoading(true)
      try {
        const data = await apiFetch(
          API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) + "/logs"
        )
        setNotifications(Array.isArray(data) ? data.slice(0, 8) : [])
      } catch {
        setNotifications([])
      } finally {
        setNotifLoading(false)
      }
    }
  }

  // close notifications on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        notifRef.current &&
        !notifRef.current.contains(target) &&
        !(buttonRef.current && buttonRef.current.contains(target))
      ) {
        setNotifOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filteredPages = searchQuery.length > 0
    ? ALL_PAGES.filter((p) =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.section.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : ALL_PAGES.slice(0, 8)

  return (
    <>
      <header className="panel-header flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/50 px-6 backdrop-blur-sm pl-12 md:pl-6 lg:pl-6">
        <div className="panel-header__title-group flex flex-col">
          <h1 className="panel-header__title text-lg font-semibold text-foreground">{title}</h1>
          {description && (
            <p className="panel-header__description text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="panel-header__actions flex items-center gap-3">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="panel-header__search-button flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <Search className="panel-header__search-icon h-3.5 w-3.5" />
            <span className="panel-header__search-label hidden md:inline">Search...</span>
            <kbd className="panel-header__search-kbd ml-2 hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
              <Command className="panel-header__search-kbd-icon inline h-2.5 w-2.5" />K
            </kbd>
          </button>

          {/* Portal Badge */}
          <Badge
            variant="outline"
            className="panel-header__portal-badge hidden border-primary/30 bg-primary/10 text-primary sm:flex"
            style={{
              borderColor: portal?.color ? `${portal.color}40` : undefined,
              backgroundColor: portal?.color ? `${portal.color}15` : undefined,
              color: portal?.color ?? undefined,
            }}
          >
            <portal.icon className="mr-1 h-3 w-3" />
            {portal.name}
          </Badge>

          {/* Notifications */}
          <div className="panel-header__notifications relative">
            <button
              ref={buttonRef}
              onClick={openNotifications}
              className="panel-header__notifications-button relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="panel-header__notifications-icon h-4 w-4" />
              {notifications.length > 0 && (
                <span className="panel-header__notifications-dot absolute right-1 top-1 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              )}
            </button>

            {notifOpen && notifPos &&
              createPortal(
                <div
                  ref={(el) => { notifRef.current = el }}
                  style={{ position: 'fixed', top: notifPos.top, left: notifPos.left }}
                  className="panel-header__notifications-popup z-[99999] w-80 rounded-xl border border-border bg-card shadow-[0_0_30px_rgba(0,0,0,0.4)]"
                >
                  <div className="panel-header__notifications-header flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="panel-header__notifications-title text-sm font-medium text-foreground">Notifications</span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="panel-header__notifications-close text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="panel-header__notifications-close-icon h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="panel-header__notifications-list max-h-72 overflow-y-auto">
                    {notifLoading ? (
                      <p className="panel-header__notifications-loading px-4 py-3 text-xs text-muted-foreground">Loading...</p>
                    ) : notifications.length === 0 ? (
                      <p className="panel-header__notifications-empty px-4 py-6 text-center text-xs text-muted-foreground">No recent activity</p>
                    ) : (
                      notifications.map((n, i) => (
                        <div
                          key={n.id ?? i}
                          className="panel-header__notification-item flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0 hover:bg-secondary/30 transition-colors"
                        >
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate">{n.action || n.event || "Account event"}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border px-4 py-2">
                    <button
                      onClick={() => { setNotifOpen(false); setTimeout(() => { window.location.href = "/dashboard/activity" }, 50) }}
                      className="text-xs text-primary hover:underline"
                    >
                      View all activity →
                    </button>
                  </div>
                </div>,
                document.body
              )}
          </div>
        </div>
      </header>

      {/* Search Overlay */}
      {searchOpen && (
        <div
          className="panel-header__search-overlay fixed inset-0 z-[9999] flex items-start justify-center bg-background/80 backdrop-blur-sm pt-[15vh]"
          onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}
        >
          <div className="panel-header__search-panel w-full max-w-xl rounded-xl border border-border bg-card shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <div className="panel-header__search-header flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="panel-header__search-icon h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="panel-header__search-input flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="panel-header__search-close rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                ESC
              </button>
            </div>
            <div className="panel-header__search-results max-h-72 overflow-y-auto py-2">
              {filteredPages.length === 0 ? (
                <p className="panel-header__search-empty px-4 py-6 text-center text-xs text-muted-foreground">No pages found</p>
              ) : (
                filteredPages.map((page) => (
                  <button
                    key={page.href}
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); router.push(page.href) }}
                    className="panel-header__search-item flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <div className="panel-header__search-item-text flex-1">
                      <p className="panel-header__search-item-title text-sm text-foreground">{page.label}</p>
                      <p className="panel-header__search-item-subtitle text-xs text-muted-foreground">{page.section}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
