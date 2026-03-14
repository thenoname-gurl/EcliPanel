"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Lock,
  X,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NAVIGATION, BRAND, type NavItem } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"

function ContactSalesModal({ item, onClose }: { item: NavItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
          <Lock className="h-6 w-6 text-primary" />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {item.label} requires an upgrade
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          This feature is available on the{" "}
          <span className="font-medium text-foreground capitalize">{item.requiredTier}</span>{" "}
          plan and above. Contact our sales team to unlock it for your account.
        </p>

        <div className="flex flex-col gap-2">
          <a
            href="mailto:sales@eclipsesystems.org"
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Mail className="h-4 w-4" />
            Contact Sales
          </a>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

export function PanelSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const [lockedItem, setLockedItem] = useState<NavItem | null>(null)

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(item.href)
  }

  const isLocked = (item: NavItem) => {
    if (!item.requiredTier || !user) return false
    // basic and pro are treated as paid tier
    const tierOrder: Record<string, number> = { free: 0, basic: 1, pro: 1, paid: 1, educational: 1, enterprise: 2 }
    const userTier = tierOrder[user.tier ?? "free"] ?? 0
    const reqTier = tierOrder[item.requiredTier] ?? 0
    return userTier < reqTier
  }

  const displayName = user?.displayName
    || (user?.firstName
      ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
      : user?.email ?? "")

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "sticky top-0 h-screen flex flex-col border-r border-border bg-sidebar transition-all duration-300 overflow-hidden",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {BRAND.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                v{BRAND.version}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1 py-3">
          <nav className="flex flex-col gap-1 px-3">
            {NAVIGATION.map((section) => (
              <div key={section.title} className="mb-2">
                {!collapsed && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                )}
                {collapsed && <div className="mb-1 h-px bg-border" />}
                {section.items.map((item) => {
                  const locked = isLocked(item)
                  const active = isActive(item)
                  const Icon = item.icon

                  const linkContent = locked ? (
                    <button
                      type="button"
                      onClick={() => setLockedItem(item)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                        "cursor-not-allowed opacity-60 text-muted-foreground hover:bg-secondary/50 hover:opacity-80"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </>
                      )}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                        active
                          ? "bg-primary/15 text-primary glow-border"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active && "text-primary"
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <Badge
                              variant="outline"
                              className="h-5 border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  )

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" className="bg-card text-card-foreground border-border">
                          <p>{item.label}</p>
                          {locked && (
                            <p className="text-xs text-muted-foreground">
                              Requires {item.requiredTier} plan — click to upgrade
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return <div key={item.href}>{linkContent}</div>
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* User Section */}
        <div className="shrink-0 border-t border-border p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {user?.email ?? ""}
                </p>
              </div>
              <button
                onClick={logout}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary cursor-pointer overflow-hidden">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card text-card-foreground border-border">
                <p>{displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-10 shrink-0 items-center justify-center border-t border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </aside>

      {/* Contact Sales modal */}
      {lockedItem && (
        <ContactSalesModal item={lockedItem} onClose={() => setLockedItem(null)} />
      )}
    </TooltipProvider>
  )
}
