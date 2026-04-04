"use client"

import { Bell, Search, Command, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  PORTALS,
  NAVIGATION,
  API_ENDPOINTS,
  NAV_SECTION_I18N_KEYS,
  NAV_ITEM_I18N_KEYS,
  NAV_BADGE_I18N_KEYS,
  type NavItem,
  type FeatureFlag,
  type PortalTier,
} from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"

type SearchPageItem = {
  label: string
  href: string
  section: string
  requiredTier?: PortalTier
  feature?: FeatureFlag
  badge?: string
}

const tierOrder: Record<string, number> = { free: 0, basic: 1, pro: 1, paid: 1, educational: 1, enterprise: 2 }

function isUserAllowedByPlan(item: { requiredTier?: PortalTier }, userTier?: string): boolean {
  if (!item.requiredTier) return true
  const userTierRank = tierOrder[userTier ?? "free"] ?? 0
  const requiredRank = tierOrder[item.requiredTier] ?? 0
  return userTierRank >= requiredRank
}

function toBool(value: any): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return value === true || value === 'true' || value === 1 || value === '1' || Boolean(value)
}

function isItemVisible(item: SearchPageItem | NavItem, user: any, featureToggles: Record<FeatureFlag, boolean>): boolean {
  if (item.badge === 'Staff' && !(user?.role === 'admin' || user?.role === 'rootAdmin' || user?.role === '*')) return false
  if (item.feature && !toBool(featureToggles[item.feature])) return false
  if (!isUserAllowedByPlan(item, user?.tier)) return false
  return true
}

function NotificationDropdown({
  isOpen,
  onClose,
  notifications,
  loading,
  buttonRef,
  router,
  onMarkAll,
  onMarkOne,
  labels,
}: {
  isOpen: boolean
  onClose: () => void
  notifications: any[]
  loading: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  router: ReturnType<typeof useRouter>
  onMarkAll: () => void
  onMarkOne: (id: number) => void
  labels: {
    notifications: string
    markAllRead: string
    noRecentActivity: string
    accountEvent: string
    markRead: string
    viewAllActivity: string
  }
}) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen, buttonRef])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !(buttonRef.current && buttonRef.current.contains(target))
      ) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen, onClose, buttonRef])

  if (!isOpen || !mounted) return null

  const dropdownContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99999] bg-background/60 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        onClick={onClose}
      />

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        style={{
          position: 'fixed',
          top: position.top,
          right: position.right,
        }}
        className="
          z-[100000]
          w-80
          rounded-xl border border-border bg-card
          shadow-[0_0_30px_rgba(0,0,0,0.3)]
          max-h-96
          flex flex-col
        "
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <span className="text-sm font-medium text-foreground">
            {labels.notifications}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAll}
              className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {labels.markAllRead}
            </button>
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {labels.noRecentActivity}
              </p>
            </div>
          ) : (
            notifications.map((n, i) => (
              <div
                key={n.id ?? i}
                className={
                  "flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0 transition-colors " +
                  (n.isRead ? "" : "bg-secondary/20")
                }
              >
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">
                    {n.action || n.event || labels.accountEvent}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {n.timestamp
                      ? new Date(n.timestamp).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => onMarkOne(n.id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {labels.markRead}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5 shrink-0">
          <button
            onClick={() => {
              onClose()
              router.push("/dashboard/activity")
            }}
            className="text-xs text-primary hover:underline"
          >
            {labels.viewAllActivity}
          </button>
        </div>
      </div>
    </>
  )

  return createPortal(dropdownContent, document.body)
}

export function PanelHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  const { user } = useAuth()
  const router = useRouter()
  const tHeader = useTranslations("panelHeader")
  const tNav = useTranslations("panelNav")
  const portal = PORTALS[user?.tier as keyof typeof PORTALS] ?? PORTALS.free

  const translateNavSection = useCallback(
    (title: string) => {
      const key = NAV_SECTION_I18N_KEYS[title]
      return key ? tNav(`sections.${key}`) : title
    },
    [tNav]
  )

  const translateNavLabel = useCallback(
    (label: string) => {
      const key = NAV_ITEM_I18N_KEYS[label]
      return key ? tNav(`items.${key}`) : label
    },
    [tNav]
  )

  const translateBadge = useCallback(
    (badge?: string) => {
      if (!badge) return badge
      const key = NAV_BADGE_I18N_KEYS[badge]
      return key ? tNav(`badges.${key}`) : badge
    },
    [tNav]
  )

  const allPages: SearchPageItem[] = NAVIGATION.flatMap((section) =>
    section.items.map((item) => ({
      label: translateNavLabel(item.label),
      href: item.href,
      section: translateNavSection(section.title),
      requiredTier: item.requiredTier,
      feature: item.feature,
      badge: translateBadge(item.badge),
    }))
  )

  const [featureToggles, setFeatureToggles] = useState<Record<FeatureFlag, boolean>>({
    registration: true,
    codeInstances: true,
    billing: true,
    ai: true,
    dns: true,
    ticketing: true,
    applications: true,
    oauth: true,
  })

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => {
        if (data?.featureToggles && typeof data.featureToggles === "object") {
          setFeatureToggles((prev) => ({
            ...prev,
            ...data.featureToggles,
          }))
        }
      })
      .catch(() => {
        // skippy
      })
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0)
      return
    }

    try {
      const data = await apiFetch(
        API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
          "/logs/unread-count"
      )
      setUnreadCount(typeof data?.unread === "number" ? data.unread : 0)
    } catch {
      setUnreadCount(0)
    }
  }, [user])

  useEffect(() => {
    fetchUnreadCount()
    const id = setInterval(fetchUnreadCount, 15000)
    return () => clearInterval(id)
  }, [fetchUnreadCount])

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const incoming = e?.detail?.featureToggles ?? e?.detail ?? null
        if (!incoming || typeof incoming !== 'object') return
        setFeatureToggles((prev) => ({
          ...prev,
          ...Object.entries(incoming).reduce((acc: any, [k, v]) => {
            acc[k] = toBool(v)
            return acc
          }, {}),
        }))
      } catch (err) {
        // skip
      }
    }

    window.addEventListener('panelSettingsUpdated', handler as EventListener)

    const id = setInterval(() => {
      apiFetch(API_ENDPOINTS.panelSettings)
        .then((data) => {
          if (data?.featureToggles && typeof data.featureToggles === "object") {
            setFeatureToggles((prev) => ({
              ...prev,
              ...data.featureToggles,
            }))
          }
        })
        .catch(() => {})
    }, 15000)

    return () => {
      window.removeEventListener('panelSettingsUpdated', handler as EventListener)
      clearInterval(id)
    }
  }, [])

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

  const openNotifications = useCallback(async () => {
    const willOpen = !notifOpen
    setNotifOpen(willOpen)
    if (willOpen && user) {
      setNotifLoading(true)
      try {
        const data = await apiFetch(
          API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
            "/logs?limit=8"
        )
        const items = Array.isArray(data) ? data : []
        setNotifications(items)

        await apiFetch(
          API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
            "/logs/read-all",
          {
            method: "PATCH",
          }
        )
        setUnreadCount(0)

        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      } catch {
        setNotifications([])
      } finally {
        setNotifLoading(false)
      }
    }
  }, [notifOpen, user])

  const markAllRead = async () => {
    if (!user) return

    try {
      await apiFetch(
        API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
          "/logs/read-all",
        { method: "PATCH" }
      )
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch {
      // ignore
    }
  }

  const markNotificationRead = async (logId: number) => {
    if (!user) return

    try {
      await apiFetch(
        API_ENDPOINTS.userDetail.replace(":id", user.id.toString()) +
          `/logs/${logId}/read`,
        { method: "PATCH" }
      )
      setNotifications((prev) =>
        prev.map((n) => (n.id === logId ? { ...n, isRead: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // ignore
    }
  }

  const visiblePages = allPages.filter((p) => isItemVisible(p, user, featureToggles))

  const filteredPages =
    searchQuery.length > 0
      ? visiblePages.filter(
          (p) =>
            p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.section.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : visiblePages.slice(0, 8)

  return (
    <>
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3 sm:px-6 backdrop-blur-sm pl-12 md:pl-6 lg:pl-6">
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
            <span className="hidden md:inline text-xs">{tHeader("search")}</span>
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

          <button
            ref={buttonRef}
            onClick={openNotifications}
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </button>

          <NotificationDropdown
            isOpen={notifOpen}
            onClose={() => setNotifOpen(false)}
            notifications={notifications}
            loading={notifLoading}
            buttonRef={buttonRef}
            router={router}
            onMarkAll={markAllRead}
            onMarkOne={markNotificationRead}
            labels={{
              notifications: tHeader("notifications"),
              markAllRead: tHeader("markAllRead"),
              noRecentActivity: tHeader("noRecentActivity"),
              accountEvent: tHeader("accountEvent"),
              markRead: tHeader("markRead"),
              viewAllActivity: tHeader("viewAllActivity"),
            }}
          />
        </div>
      </header>

      {searchOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-start justify-center bg-background/80 backdrop-blur-sm pt-[10vh] sm:pt-[15vh] px-3 sm:px-0"
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
                placeholder={tHeader("searchPages")}
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
                    {tHeader("noPagesFound")}
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