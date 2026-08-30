"use client"

import { memo, type ReactNode, useEffect, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { type LucideIcon, Loader2, Search, X, Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: string
  className?: string
}

// Map a semantic color name to token-driven Tailwind classes. Default ("primary")
// stays theme-neutral; explicit colors (success/warning/info/destructive) pop
// against the shell, osu-style.
const COLOR_ACCENTS: Record<string, { chip: string; bar: string; glow: string }> = {
  primary: { chip: "bg-primary/10 text-primary group-hover:bg-primary/20", bar: "via-primary/50", glow: "hover:shadow-[0_0_15px_var(--glow)]" },
  success: { chip: "bg-success/10 text-success group-hover:bg-success/20", bar: "via-success/60", glow: "hover:shadow-[0_0_15px_var(--success)]" },
  warning: { chip: "bg-warning/10 text-warning group-hover:bg-warning/20", bar: "via-warning/60", glow: "hover:shadow-[0_0_15px_var(--warning)]" },
  info: { chip: "bg-info/10 text-info group-hover:bg-info/20", bar: "via-info/60", glow: "hover:shadow-[0_0_15px_var(--info)]" },
  destructive: { chip: "bg-destructive/10 text-destructive group-hover:bg-destructive/20", bar: "via-destructive/60", glow: "hover:shadow-[0_0_15px_var(--destructive)]" },
}
const accentFor = (color: string) => COLOR_ACCENTS[color] || COLOR_ACCENTS.primary

export const StatCard = memo(function StatCard({ title, value, subtitle, icon: Icon, trend, color = "primary", className }: StatCardProps) {
  const reduceMotion = useReducedMotion()
  const accent = accentFor(color)
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
      className={cn(
        "group relative overflow-hidden border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5",
        accent.glow,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn("p-2.5 transition-colors", accent.chip)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {/* Colored accent line */}
      <div className={cn("absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100", accent.bar)} />
    </motion.div>
  )
})

/**
 * Status indicator dot with label
 */
export function StatusBadge({ status }: { status: "online" | "offline" | "starting" | "running" | "stopped" | "pending" | "open" | "opened" | "replied" | "awaiting_staff_reply" | "closed" | "urgent" | "high" | "medium" | "low" }) {
  const t = useTranslations("panelShared")
  const config: Record<string, { color: string; label: string }> = {
    online: { color: "bg-success", label: t("status.online") },
    running: { color: "bg-success", label: t("status.running") },
    open: { color: "bg-info", label: t("status.open") },
    opened: { color: "bg-info", label: t("status.opened") },
    replied: { color: "bg-info", label: t("status.replied") },
    awaiting_staff_reply: { color: "bg-warning", label: t("status.awaitingStaff") },
    starting: { color: "bg-warning", label: t("status.starting") },
    pending: { color: "bg-warning", label: t("status.pending") },
    medium: { color: "bg-warning", label: t("status.medium") },
    offline: { color: "bg-destructive", label: t("status.offline") },
    stopped: { color: "bg-destructive", label: t("status.stopped") },
    closed: { color: "bg-muted-foreground", label: t("status.closed") },
    urgent: { color: "bg-destructive", label: t("status.urgent") },
    high: { color: "bg-destructive", label: t("status.high") },
    low: { color: "bg-success", label: t("status.low") },
  }

  const { color, label } = config[status] ?? { color: "bg-muted-foreground", label: status }

  // "Live" states get a soft pulse ring so the dashboard reads as alive, osu-flag style.
  const live = ["online", "running", "starting"].includes(status)

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn("relative flex h-2 w-2 rounded-full", color)}>
        {live && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", color)} />
        )}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/**
 * Section header for dashboard pages
 */
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
        {description && <p className="text-sm text-muted-foreground truncate">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// Always the osu ranked-bar blue (PrimaryDarker → Primary); the bar never turns
// amber/red regardless of value — a full bar is success, not a warning.
function BarColor(): { bar: string; tip: string } {
  return { bar: "bg-gradient-to-r from-[#4382ff]/45 via-[#4382ff] to-[#5ebfff]", tip: "bg-white" }
}

// TrianglesV2-style field: a handful of equilateral triangle outlines each
// independently placed/randomized at mount, drifting downward at its own speed,
// re-spawning at the top with fresh randomness. True per-triangle randomness
// (osu's feel), not a repeating tile — rendered as bounded SVGs so they paint.
function Triangles() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const COUNT = 5
    type Tri = { x: number; y: number; size: number; speed: number }
    const tris: Tri[] = Array.from({ length: COUNT }, () => ({
      x: rand(-5, 95),
      y: rand(-20, 110),
      size: rand(6, 18),
      speed: rand(0.6, 1.5),
    }))

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      for (let i = 0; i < COUNT; i++) {
        const t = tris[i]
        t.y += t.speed * dt * 22
        const h = el.clientHeight || 20
        if (t.y > h + t.size) {
          t.y = -t.size - rand(0, 12)
          t.x = rand(-5, 95)
          t.size = rand(6, 18)
          t.speed = rand(0.6, 1.5)
        }
        const node = el.children[i] as HTMLElement | undefined
        if (node) {
          node.style.left = `${t.x}%`
          node.style.top = `${t.y}px`
          node.style.width = `${t.size}px`
          node.style.height = `${t.size}px`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-plus-lighter">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className="absolute opacity-25"
          viewBox="0 0 48 48"
          preserveAspectRatio="none"
        >
          <polygon points="24,6 46,44 2,44" fill="none" stroke="white" strokeWidth="2" />
        </svg>
      ))}
    </div>
  )
}

/**
 * Ranked-play waiting-room health bar (lazer's RankedPlay HealthBar): a sheared
 * glassy bar with a gradient border, a `PrimaryDarker→Primary` gradient fill,
 * and translucent equilateral triangles that drift downward inside the fill
 * (the TrianglesV2 animation), with an optional heart + health number.
 *
 * `value`/`max` set the determinate fill width; omit `value` for the empty
 * trough with just the drifting triangles. `color` overrides the base accent.
 */
export function LoadingBar({
  value,
  max = 100,
  color = "primary",
  className,
  showLabel,
  dangerous = false,
}: {
  value?: number
  max?: number
  color?: string
  className?: string
  showLabel?: boolean
  dangerous?: boolean
}) {
  const pct = value == null ? null : Math.max(0, Math.min(100, (value / max) * 100))
  const { bar, tip } = BarColor()
  const fillColor = color === "primary" ? bar : "bg-gradient-to-r from-secondary/50 via-secondary to-secondary"
  const display = value == null ? "-" : Math.round(value)

  return (
    <div
      className={cn("group/lbar relative h-5 w-full skew-x-[-12deg] overflow-hidden rounded-[3px]", className)}
    >
      {/* glassy surface with gradient border (Surface → SurfaceBorder) */}
      <div className="absolute inset-0 rounded-[3px] border border-white/15 bg-black/50" />

      {/* sheared gradient fill: PrimaryDarker → Primary */}
      <div
        className={cn(
          "absolute inset-y-[1px] left-[1px] overflow-hidden rounded-[2px] transition-all duration-500",
          fillColor,
        )}
        style={{ width: pct == null ? "100%" : `${pct}%` }}
      >
        {/* drifting outlined triangles (TrianglesV2): large, sparse outline
            triangles scrolled downward */}
        <Triangles />
        {/* bright leading tip spanning the fill height, at the fill's right edge */}
        <div className="absolute inset-y-0 right-0 w-1 rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.5)]" style={{ background: tip }} />
      </div>

      {/* heart + value, unsheared over the top */}
      {showLabel && (
        <div className="absolute inset-0 z-10 flex items-center gap-1 px-2 skew-x-[12deg]">
          <Heart className="h-2.5 w-2.5 fill-white/80 text-white/80" />
          <span className="font-mono text-[10px] font-medium text-white/90 tabular-nums">
            {new Intl.NumberFormat("en-US").format(Number(display))}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Progress bar with label
 */
export function UsageBar({ label, value, max = 100, color = "primary" }: { label: string; value: number; max?: number; color?: string }) {
  const percentage = Math.min((value / max) * 100, 100)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[70%]" title={label}>{label}</span>
        <span className="font-mono text-foreground shrink-0">{value}%</span>
      </div>
      <LoadingBar value={value} max={max} color={color} dangerous />
    </div>
  )
}

export function PageLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 p-3 sm:p-5 md:p-6 max-w-[100vw] w-full min-w-0 box-border", className)}>
      {children}
    </div>
  )
}

export function CardStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  )
}

export function CardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3", className)}>
      {children}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative flex-1 min-w-0", className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border bg-card pl-10 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-2 active:scale-90 transition-all touch-target"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function AlertBanner({
  variant = "warning",
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  variant?: "warning" | "destructive" | "info" | "success"
  icon?: LucideIcon
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const styles: Record<string, string> = {
    warning: "border-amber-500/30 bg-amber-500/5 text-foreground",
    destructive: "border-destructive/30 bg-destructive/5 text-foreground",
    info: "border-info/30 bg-info/5 text-foreground",
    success: "border-success/30 bg-success/5 text-foreground",
  }
  return (
    <div className={cn("border p-4 text-sm", styles[variant], className)}>
      <div className="flex items-start gap-2">
        {Icon && <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", {
          "text-amber-400": variant === "warning",
          "text-destructive": variant === "destructive",
          "text-info": variant === "info",
          "text-success": variant === "success",
        })} />}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "mt-1", "text-xs text-muted-foreground")}>{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      {Icon && (
        <div className="h-16 w-16 bg-secondary/30 flex items-center justify-center mb-5">
          <Icon className="h-7 w-7 text-muted-foreground/40" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function LoadingState({ label }: { label?: string }) {
  // Skeleton-first loading: rounded, pulsing placeholders instead of a spinner,
  // matching the aesthetic the rest of the panel uses.
  return (
    <div className="flex flex-col gap-4">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-4 h-3 w-1/2" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
