/**
 * Reusable stat card component for dashboards.
 * Wire with backend by passing dynamic values to the props.
 */
import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: string
  className?: string
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, color = "primary", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)]",
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
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary/20">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {/* Glow accent line */}
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}

/**
 * Status indicator dot with label
 */
export function StatusBadge({ status }: { status: "online" | "offline" | "starting" | "running" | "stopped" | "pending" | "open" | "closed" | "urgent" | "high" | "medium" | "low" }) {
  const config: Record<string, { color: string; label: string }> = {
    online: { color: "bg-success", label: "Online" },
    running: { color: "bg-success", label: "Running" },
    open: { color: "bg-info", label: "Open" },
    starting: { color: "bg-warning", label: "Starting" },
    pending: { color: "bg-warning", label: "Pending" },
    medium: { color: "bg-warning", label: "Medium" },
    offline: { color: "bg-destructive", label: "Offline" },
    stopped: { color: "bg-destructive", label: "Stopped" },
    closed: { color: "bg-muted-foreground", label: "Closed" },
    urgent: { color: "bg-destructive", label: "Urgent" },
    high: { color: "bg-destructive", label: "High" },
    low: { color: "bg-success", label: "Low" },
  }

  const { color, label } = config[status] ?? { color: "bg-muted-foreground", label: status }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/**
 * Section header for dashboard pages
 */
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
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
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percentage > 90 ? "bg-destructive" : percentage > 70 ? "bg-warning" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
