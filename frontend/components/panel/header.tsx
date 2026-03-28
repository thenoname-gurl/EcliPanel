"use client"

import { Bell, Search, Command, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PORTALS, NAVIGATION, API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "@/lib/api-client"

const ALL_PAGES = NAVIGATION.flatMap((section) =>
  section.items.map((item: any) => ({
    label: item.label,
    href: item.href,
    section: section.title,
  }))
)

export function PanelHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  const { user } = useAuth()
  const router = useRouter()
  const portal = PORTALS[user?.tier as keyof typeof PORTALS] ?? PORTALS.free

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

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

  useEffect(() => {
    if (!notifOpen) return
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
  }, [notifOpen])

  const openNotifications = useCallback(async () => {
    const willOpen = !notifOpen
    setNotifOpen(willOpen)
    if (willOpen && user && notifications.length === 0) {
      setNotifLoading(true)
      try {
        const data = await apiFetch(
          API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
            "/logs"
        )
        setNotifications(Array.isArray(data) ? data.slice(0, 8) : [])
      } catch {
        setNotifications([])
      } finally {
        setNotifLoading(false)
      }
    }
  }, [notifOpen, user, notifications.length])

  const filteredPages =
    searchQuery.length > 0
      ? ALL_PAGES.filter(
          (p) =>
            p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.section.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : ALL_PAGES.slice(0, 8)

  return (
    <>
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3 sm:px-6 backdrop-blur-sm pl-12 md:pl-6 lg:pl-6 z-10">
        <div className="flex flex-col min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
            {title}
          </h1>
          {description && (
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate hidden sm:block">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-8 sm:h-9 items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-secondary/50 px-2 sm:px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-xs">Search...</span>
            <kbd className="ml-1 hidden md:inline rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              <Command className="inline h-2.5 w-2.5" />K
            </kbd>
          </button>

          <Badge
            variant="outline"
            className="hidden sm:flex border-primary/30 bg-primary/10 text-primary text-[10px] sm:text-xs px-2 py-0.5"
            style={{
              borderColor: portal?.color ? `${portal.color}40` : undefined,
              backgroundColor: portal?.color
                ? `${portal.color}15`
                : undefined,
              color: portal?.color ?? undefined,
            }}
          >
            <portal.icon className="mr-1 h-3 w-3" />
            {portal.name}
          </Badge>

          <div className="relative">
            <button
              ref={buttonRef}
              onClick={openNotifications}
              className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {notifications.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>

            {notifOpen && (
              <>
                <div
                  className="fixed inset-0 z-[999] bg-background/60 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
                  onClick={() => setNotifOpen(false)}
                />

                <div
                  ref={(el) => {
                    notifRef.current = el
                  }}
                  className="
                    fixed inset-x-3 top-[60px] z-[1000]
                    sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2
                    w-auto sm:w-80
                    rounded-xl border border-border bg-card
                    shadow-[0_0_30px_rgba(0,0,0,0.3)]
                    max-h-[70vh] sm:max-h-96
                    flex flex-col
                  "
                >
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
                    <span className="text-sm font-medium text-foreground">
                      Notifications
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    {notifLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <Bell className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                          No recent activity
                        </p>
                      </div>
                    ) : (
                      notifications.map((n, i) => (
                        <div
                          key={n.id ?? i}
                          className="flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0 hover:bg-secondary/30 transition-colors"
                        >
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate">
                              {n.action || n.event || "Account event"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {n.timestamp
                                ? new Date(n.timestamp).toLocaleString()
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-border px-4 py-2.5 shrink-0">
                    <button
                      onClick={() => {
                        setNotifOpen(false)
                        router.push("/dashboard/activity")
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      View all activity →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center bg-background/80 backdrop-blur-sm pt-[10vh] sm:pt-[15vh] px-3 sm:px-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false)
          }}
        >
          <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredPages.length > 0) {
                    setSearchOpen(false)
                    setSearchQuery("")
                    router.push(filteredPages[0].href)
                  }
                }}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[50vh] sm:max-h-72 overflow-y-auto py-1 overscroll-contain">
              {filteredPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Search className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    No pages found
                  </p>
                </div>
              ) : (
                filteredPages.map((page, idx) => (
                  <button
                    key={page.href}
                    onClick={() => {
                      setSearchOpen(false)
                      setSearchQuery("")
                      router.push(page.href)
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50 active:bg-secondary/70 ${
                      idx === 0 && searchQuery ? "bg-secondary/30" : ""
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50 shrink-0">
                      <Search className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {page.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {page.section}
                      </p>
                    </div>
                    {idx === 0 && searchQuery && (
                      <kbd className="hidden sm:inline rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        Enter
                      </kbd>
                    )}
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