"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState, useEffect, useCallback, useMemo, forwardRef } from "react"
import {
  ChevronLeft,
  LogOut,
  Lock,
  X,
  Mail,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  NAVIGATION,
  BRAND,
  API_ENDPOINTS,
  NAV_SECTION_I18N_KEYS,
  NAV_ITEM_I18N_KEYS,
  NAV_BADGE_I18N_KEYS,
  type NavItem,
} from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"

function ContactSalesModal({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const t = useTranslations("panelSidebar")

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [onClose])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-95"
          aria-label={t("close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Lock className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
        </div>

        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">
          {t("requiresUpgrade", { feature: item.label })}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t("featureAvailableOn", { tier: item.requiredTier ?? "" })}
        </p>

        <div className="flex flex-col gap-2.5">
          <a
            href="mailto:sales@ecli.app"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Mail className="h-4 w-4" />
            {t("contactSales")}
          </a>
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-[0.98]"
          >
            {t("maybeLater")}
          </button>
        </div>
      </div>
    </div>
  )
}

function toBool(value: any): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0' || value === null || value === undefined) {
    return false
  }
  return value === true || value === 'true' || value === 1 || value === '1' || Boolean(value)
}

export function PanelSidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: (() => void) | undefined }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const [lockedItem, setLockedItem] = useState<NavItem | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [pendingSubuserInvites, setPendingSubuserInvites] = useState<number>(0)
  const [pendingOrganisationInvites, setPendingOrganisationInvites] = useState<number>(0)
  const tSidebar = useTranslations("panelSidebar")
  const tNav = useTranslations("panelNav")

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

  const isAdmin = useMemo(() => {
    return user && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')
  }, [user])

  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({
    registration: true,
    codeInstances: true,
    billing: true,
    ai: true,
    dns: true,
    ticketing: true,
    applications: true,
    oauth: true,
    tunnels: true,
  })

  useEffect(() => {
    let mounted = true
    
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => {
        if (!mounted || !data) return

        const toggles: Record<string, boolean> = {
          registration: true,
          codeInstances: true,
          billing: true,
          ai: true,
          dns: true,
          ticketing: true,
          applications: true,
          oauth: true,
          tunnels: true,
        }

        if (data?.featureToggles && typeof data.featureToggles === 'object') {
          Object.entries(data.featureToggles).forEach(([k, v]) => {
            toggles[k] = toBool(v)
          })
        }

        if (data?.codeInstancesEnabled !== undefined) {
          toggles.codeInstances = toBool(data.codeInstancesEnabled)
        }

        setFeatureToggles(toggles)
      })
      .catch(() => {})

    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true

    apiFetch(API_ENDPOINTS.serverSubuserInvites)
      .then((data) => {
        if (!mounted) return
        setPendingSubuserInvites(Array.isArray(data) ? data.length : 0)
      })
      .catch(() => {})

    apiFetch(API_ENDPOINTS.organisationInvites)
      .then((data) => {
        if (!mounted) return
        setPendingOrganisationInvites(Array.isArray(data) ? data.length : 0)
      })
      .catch(() => {})

    const intervalId = setInterval(() => {
      apiFetch(API_ENDPOINTS.serverSubuserInvites)
        .then((data) => {
          if (!mounted) return
          setPendingSubuserInvites(Array.isArray(data) ? data.length : 0)
        })
        .catch(() => {})

      apiFetch(API_ENDPOINTS.organisationInvites)
        .then((data) => {
          if (!mounted) return
          setPendingOrganisationInvites(Array.isArray(data) ? data.length : 0)
        })
        .catch(() => {})
    }, 60000)

    return () => {
      mounted = false
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const updateToggles = (incoming: Record<string, any>) => {
      if (!mounted) return
      setFeatureToggles((prev) => {
        const next = { ...prev }
        Object.entries(incoming).forEach(([k, v]) => {
          next[k] = toBool(v)
        })
        return next
      })
    }

    const handler = (e: CustomEvent) => {
      try {
        const incoming = e?.detail?.featureToggles ?? e?.detail ?? null
        if (incoming && typeof incoming === 'object') {
          updateToggles(incoming)
        }
      } catch {}
    }

    window.addEventListener('panelSettingsUpdated', handler as EventListener)

    const intervalId = setInterval(() => {
      apiFetch(API_ENDPOINTS.panelSettings)
        .then((data) => {
          if (!mounted || !data) return

          const updates: Record<string, boolean> = {}

          if (data?.featureToggles && typeof data.featureToggles === 'object') {
            Object.entries(data.featureToggles).forEach(([k, v]) => {
              updates[k] = toBool(v)
            })
          }

          if (data?.codeInstancesEnabled !== undefined) {
            updates.codeInstances = toBool(data.codeInstancesEnabled)
          }

          if (Object.keys(updates).length > 0) {
            updateToggles(updates)
          }
        })
        .catch(() => {})
    }, 15000)

    return () => {
      mounted = false
      window.removeEventListener('panelSettingsUpdated', handler as EventListener)
      clearInterval(intervalId)
    }
  }, [])

  const isItemVisible = useCallback((item: NavItem): boolean => {
    if (item.badge === 'Staff' && !isAdmin) {
      return false
    }
    if (item.feature && !toBool(featureToggles[item.feature])) {
      return false
    }
    return true
  }, [isAdmin, featureToggles])

  const isItemLocked = useCallback((item: NavItem): boolean => {
    if (!user) return false
    if (!item.requiredTier) return false

    const tierOrder: Record<string, number> = { 
      free: 0, 
      basic: 1, 
      pro: 1, 
      paid: 1, 
      educational: 1, 
      enterprise: 2 
    }
    const userTier = tierOrder[user.tier ?? "free"] ?? 0
    const reqTier = tierOrder[item.requiredTier] ?? 0
    return userTier < reqTier
  }, [user])

  const isActive = useCallback((item: NavItem): boolean => {
    if (item.href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(item.href)
  }, [pathname])

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
    }
  }, [logout, isLoggingOut])

  const handleMobileNavigate = useCallback(() => {
    if (onClose) {
      setTimeout(() => onClose(), 50)
    }
  }, [onClose])

  const displayName = useMemo(() => {
    return user?.displayName
      || (user?.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user?.email ?? tSidebar("userFallback"))
  }, [user, tSidebar])

  const userInitial = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow
      const originalPosition = document.body.style.position
      const originalWidth = document.body.style.width
      
      document.body.style.overflow = "hidden"
      document.body.style.position = "fixed"
      document.body.style.width = "100%"
      
      return () => {
        document.body.style.overflow = originalOverflow
        document.body.style.position = originalPosition
        document.body.style.width = originalWidth
      }
    }
  }, [mobileOpen])

  const filteredNavigation = useMemo(() => {
    return NAVIGATION.map((section) => ({
      ...section,
      title: translateNavSection(section.title),
      items: section.items.filter(isItemVisible).map((item) => ({
        ...item,
        label: translateNavLabel(item.label),
        badge:
          item.href === "/dashboard/mailbox" && pendingSubuserInvites + pendingOrganisationInvites > 0
            ? String(pendingSubuserInvites + pendingOrganisationInvites)
            : translateBadge(item.badge),
      }))
    })).filter((section) => section.items.length > 0)
  }, [isItemVisible, translateNavSection, translateNavLabel, translateBadge])

  const renderNavItem = (
    item: NavItem, 
    locked: boolean, 
    active: boolean, 
    isCollapsed: boolean,
    isMobile: boolean
  ) => {
    const Icon = item.icon

    const baseClasses = cn(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
      "active:scale-[0.98]"
    )

    const content = locked ? (
      <button
        type="button"
        onClick={() => setLockedItem(item)}
        className={cn(
          baseClasses,
          "w-full cursor-pointer opacity-50 text-muted-foreground",
          "hover:bg-secondary/50 hover:opacity-70"
        )}
      >
        <div className="relative flex-shrink-0">
          <Icon className="h-[18px] w-[18px]" />
          <Lock className="absolute -right-1 -bottom-1 h-2.5 w-2.5 text-muted-foreground" />
        </div>
        {!isCollapsed && (
          <>
            <span className="flex-1 truncate text-left">{item.label}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>
    ) : (
      <Link
        href={item.href}
        onClick={isMobile ? handleMobileNavigate : undefined}
        className={cn(
          baseClasses,
          active
            ? "bg-primary/15 text-primary shadow-sm shadow-primary/5"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors",
            active && "text-primary"
          )}
        />
        {!isCollapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-1.5 text-[10px] font-medium shrink-0",
                  item.badge === "New"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                    : item.badge === "Beta"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                    : "border-primary/30 bg-primary/10 text-primary"
                )}
              >
                {item.badge}
              </Badge>
            )}
          </>
        )}
      </Link>
    )

    if (isCollapsed && !isMobile) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>
            <div>{content}</div>
          </TooltipTrigger>
          <TooltipContent 
            side="right" 
            sideOffset={8}
            className="bg-popover text-popover-foreground border-border shadow-lg z-[60]"
          >
            <p className="font-medium">{item.label}</p>
            {locked && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {tSidebar("requiresPlan", { tier: item.requiredTier ?? "" })}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.href}>{content}</div>
  }

  const renderNavigation = (isMobile: boolean = false) => {
    const isCollapsed = collapsed && !isMobile

    return (
      <nav className="flex flex-col gap-1 px-3">
        {filteredNavigation.map((section) => (
          <div key={section.title} className="mb-3">
            {!isCollapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </p>
            )}
            {isCollapsed && <div className="mb-2 mx-2 h-px bg-border/50" />}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const locked = isItemLocked(item)
                const active = isActive(item)
                return renderNavItem(item, locked, active, isCollapsed, isMobile)
              })}
            </div>
          </div>
        ))}
      </nav>
    )
  }

  const renderUserSection = (isMobile: boolean = false) => {
    const showExpanded = !collapsed || isMobile

    return (
      <div className="shrink-0 border-t border-border p-3">
        {showExpanded ? (
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/settings"
              onClick={isMobile ? handleMobileNavigate : undefined}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-semibold text-primary overflow-hidden ring-2 ring-primary/10 hover:ring-primary/20 transition-all active:scale-95"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                userInitial
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.email ?? ""}
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/dashboard/settings"
                    onClick={isMobile ? handleMobileNavigate : undefined}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-95"
                    aria-label={tSidebar("accountSettings")}
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-popover text-popover-foreground border-border">
                  {tNav("items.settings")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className={cn(
                      "rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors active:scale-95",
                      isLoggingOut && "opacity-50 cursor-not-allowed"
                    )}
                    aria-label={tSidebar("logout")}
                  >
                    <LogOut className={cn("h-4 w-4", isLoggingOut && "animate-pulse")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-popover text-popover-foreground border-border">
                  {isLoggingOut ? tSidebar("loggingOut") : tSidebar("logout")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/settings"
                className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-semibold text-primary cursor-pointer overflow-hidden ring-2 ring-primary/10 hover:ring-primary/20 transition-all active:scale-95"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  userInitial
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="bg-popover text-popover-foreground border-border">
              <p className="font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
              <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  {tNav("items.settings")}
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="h-3 w-3" />
                  {tSidebar("logout")}
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:sticky md:top-0 md:h-screen md:flex md:flex-col md:border-r md:border-border md:bg-sidebar md:transition-all md:duration-300 md:ease-out",
          collapsed ? "md:w-[72px]" : "md:w-[260px]"
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <Link 
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80 active:scale-[0.98]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
              <Image
                src={BRAND.logo}
                alt={BRAND.name}
                width={36}
                height={36}
                className="h-8 w-8 object-contain"
                priority
              />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {BRAND.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {BRAND.version ? (
                    /[0-9a-f]{7,40}/i.test(String(BRAND.version)) && BRAND.repoUrl ? (
                      <span className="hover:underline">
                        #{String(BRAND.version).slice(0, 7)}
                      </span>
                    ) : (
                      `v${BRAND.version}`
                    )
                    ) : tSidebar("dashboardFallback")}
                </span>
              </div>
            )}
          </Link>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {renderNavigation(false)}
        </div>

        {renderUserSection(false)}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex h-11 shrink-0 items-center justify-center border-t border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-95"
              aria-label={collapsed ? tSidebar("expandSidebar") : tSidebar("collapseSidebar")}
            >
              <div className={cn("transition-transform duration-200", collapsed && "rotate-180")}>
                <ChevronLeft className="h-4 w-4" />
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? "right" : "top"} sideOffset={8} className="bg-popover text-popover-foreground border-border">
            {collapsed ? tSidebar("expandSidebar") : tSidebar("collapseSidebar")}
          </TooltipContent>
        </Tooltip>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200" 
            onClick={onClose}
            aria-hidden="true"
          />
          
          <div 
            className="absolute inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] animate-in slide-in-from-left duration-300"
            role="dialog"
            aria-modal="true"
            aria-label={tSidebar("navigationMenu")}
          >
            <div className="flex h-full w-full flex-col bg-sidebar shadow-2xl">
              <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-border">
                <Link 
                  href="/dashboard"
                  onClick={handleMobileNavigate}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                    <Image
                      src={BRAND.logo}
                      alt={BRAND.name}
                      width={32}
                      height={32}
                      className="h-7 w-7 object-contain"
                      priority
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {BRAND.name}
                  </span>
                </Link>
                <button 
                  onClick={onClose} 
                  className="rounded-lg p-2 -mr-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-95"
                  aria-label={tSidebar("closeMenu")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div 
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain py-4"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {renderNavigation(true)}
              </div>

              {renderUserSection(true)}

              <div className="shrink-0 bg-sidebar" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
          </div>
        </div>
      )}

      {lockedItem && (
        <ContactSalesModal item={lockedItem} onClose={() => setLockedItem(null)} />
      )}
    </TooltipProvider>
  )
}