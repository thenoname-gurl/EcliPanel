"use client"

import { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Loader2, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface InfoRowProps {
  label: string
  value: string | ReactNode
  mono?: boolean
  copyable?: boolean
  className?: string
}

export function InfoRow({ label, value, mono, copyable, className }: InfoRowProps) {
  const handleCopy = () => {
    if (copyable && typeof value === "string") {
      navigator.clipboard.writeText(value)
    }
  }

  return (
    <div 
      className={cn(
        "rounded-lg border border-border bg-secondary/20 p-3",
        copyable && "cursor-pointer hover:bg-secondary/30 transition-colors",
        className
      )}
      onClick={handleCopy}
    >
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn(
        "text-sm text-foreground truncate",
        mono && "font-mono"
      )}>
        {value}
      </p>
    </div>
  )
}

interface LoadingStateProps {
  message?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

export function LoadingState({ message = "Loading...", size = "md", className }: LoadingStateProps) {
  const t = useTranslations("serverTabShared")
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-8 w-8"
  }

  const paddingClasses = {
    sm: "py-6",
    md: "py-12",
    lg: "py-16"
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center",
      paddingClasses[size],
      className
    )}>
      <Loader2 className={cn("animate-spin text-muted-foreground mb-2", sizeClasses[size])} />
      <p className="text-sm text-muted-foreground">{message === "Loading..." ? t("loading") : message}</p>
    </div>
  )
}

interface EmptyStateProps {
  icon?: any
  title?: string
  message: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Info, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      className
    )}>
      <div className="rounded-full bg-secondary/50 p-3 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      {title && (
        <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      )}
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  const t = useTranslations("serverTabShared")
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      className
    )}>
      <div className="rounded-full bg-destructive/10 p-3 mb-3">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">{title === "Something went wrong" ? t("error.title") : title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-primary hover:underline"
        >
          {t("error.tryAgain")}
        </button>
      )}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon: any
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  className?: string
}

export function StatCard({ label, value, icon: Icon, trend, trendValue, className }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        {trend && trendValue && (
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded",
            trend === "up" && "text-green-500 bg-green-500/10",
            trend === "down" && "text-red-500 bg-red-500/10",
            trend === "neutral" && "text-muted-foreground bg-secondary"
          )}>
            {trend === "up" && "↑"}{trend === "down" && "↓"} {trendValue}
          </span>
        )}
      </div>
      <p className="text-lg sm:text-xl font-mono font-semibold text-foreground truncate">
        {value}
      </p>
    </div>
  )
}

interface MiniStatProps {
  label: string
  value: string | number
  sub?: string
  color: string
  className?: string
}

export function MiniStat({ label, value, sub, color, className }: MiniStatProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-2.5 sm:p-3 min-w-0",
      className
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <div 
          className="h-2 w-2 rounded-full flex-shrink-0" 
          style={{ backgroundColor: color }} 
        />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
      <p className="text-sm sm:text-base font-mono font-semibold text-foreground truncate">
        {value}
        {sub && (
          <span className="text-[10px] sm:text-xs font-normal text-muted-foreground ml-1">
            {sub}
          </span>
        )}
      </p>
    </div>
  )
}

interface ProgressStatProps {
  label: string
  value: number
  max: number
  unit?: string
  color?: string
  formatValue?: (v: number) => string
  className?: string
}

export function ProgressStat({ 
  label, 
  value, 
  max, 
  unit = "", 
  color = "#3b82f6",
  formatValue = (v) => v.toString(),
  className 
}: ProgressStatProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-3 min-w-0",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground">
          {formatValue(value)}{unit} / {formatValue(max)}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color
          }} 
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 text-right">
        {percentage.toFixed(1)}%
      </p>
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon: any
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function ChartCard({ title, icon: Icon, children, action, className }: ChartCardProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0 overflow-hidden",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <h4 className="text-xs sm:text-sm font-semibold text-foreground">{title}</h4>
        </div>
        {action}
      </div>
      <div className="min-w-0 overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  icon?: any
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, icon: Icon, action, className }: SectionHeaderProps) {
  return (
    <div className={cn(
      "flex items-center justify-between",
      className
    )}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {action}
    </div>
  )
}

interface ToggleOption<T> {
  value: T
  label: string
}

interface ToggleGroupProps<T> {
  options: ToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function ToggleGroup<T extends string>({ 
  options, 
  value, 
  onChange, 
  className 
}: ToggleGroupProps<T>) {
  return (
    <div className={cn(
      "flex items-center gap-0.5 rounded-lg border border-border bg-secondary/30 p-0.5 overflow-x-auto",
      className
    )}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors whitespace-nowrap",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface CardGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}

export function CardGrid({ children, columns = 2, className }: CardGridProps) {
  const gridClasses = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-5",
  }

  return (
    <div className={cn(
      "grid gap-2 sm:gap-3",
      gridClasses[columns],
      className
    )}>
      {children}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "animate-pulse rounded-md bg-secondary/50",
      className
    )} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-6 w-20" />
    </div>
  )
}

export function ChartCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-[200px] w-full" />
    </div>
  )
}