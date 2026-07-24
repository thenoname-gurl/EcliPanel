"use client"

import {
  Shield, ShieldAlert, AlertTriangle, AlertCircle,
  Bug, Check, CheckCircle, Flag, Send, EyeOff, Trash2,
  Clock, RefreshCw,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────────

export type Finding = {
  id: number; title: string; description: string; severity: string
  category: string; source: string; sourceName?: string
  serverId?: string; nodeId?: number; userId?: number
  status: string; metadata?: any; detectedAt: string
  resolvedAt?: string; resolvedByUserId?: number
}

export type ScanResult = {
  created: number; resolved: number; totalOpen: number
  timestamp?: string
}

export type EventLogEntry = {
  id: number; action: string; targetId?: string; targetType?: string
  userId?: number; timestamp: string; metadata?: any
}

export type AuditEntry = {
  id: number; adminUserId: number; adminName: string; adminEmail?: string
  adminAvatarUrl?: string; action: string; targetId?: string
  targetType?: string; metadata?: any; sessionId?: string
  durationMs?: number; ipAddress?: string; timestamp: string
}

// ─── Severity config ────────────────────────────────────────────────────────────

export const severityConfig: Record<string, {
  border: string; bg: string; text: string; badge: string; dot: string; row: string
}> = {
  critical: {
    border: "border-red-500/40", bg: "bg-red-500/8", text: "text-red-500",
    badge: "bg-red-500/15 text-red-500 border-red-500/30",
    dot: "bg-red-500", row: "border-l-red-500",
  },
  high: {
    border: "border-orange-500/40", bg: "bg-orange-500/8", text: "text-orange-500",
    badge: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    dot: "bg-orange-500", row: "border-l-orange-500",
  },
  medium: {
    border: "border-yellow-500/40", bg: "bg-yellow-500/8", text: "text-yellow-500",
    badge: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    dot: "bg-yellow-500", row: "border-l-yellow-500",
  },
  low: {
    border: "border-blue-500/40", bg: "bg-blue-500/8", text: "text-blue-500",
    badge: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    dot: "bg-blue-500", row: "border-l-blue-500",
  },
  info: {
    border: "border-slate-500/40", bg: "bg-slate-500/8", text: "text-slate-400",
    badge: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    dot: "bg-slate-400", row: "border-l-slate-400",
  },
}

export const severityIcons: Record<string, LucideIcon> = {
  critical: ShieldAlert, high: AlertTriangle, medium: AlertCircle,
  low: Bug, info: Shield,
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Reusable UI atoms ──────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, color = "default" }: {
  label: string; value: string | number; sub?: string
  color?: "red" | "orange" | "green" | "blue" | "default"
}) {
  const colors = {
    red: "border-red-500/20 bg-red-500/5",
    orange: "border-orange-500/20 bg-orange-500/5",
    green: "border-green-500/20 bg-green-500/5",
    blue: "border-blue-500/20 bg-blue-500/5",
    default: "border-border bg-card",
  }
  const textColors = {
    red: "text-red-500", orange: "text-orange-500",
    green: "text-green-500", blue: "text-blue-500", default: "text-foreground",
  }
  return (
    <div className={`border rounded p-3 flex flex-col gap-0.5 ${colors[color]}`}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ActionBtn({ onClick, title, icon: Icon, variant = "default" }: {
  onClick: (e: React.MouseEvent) => void; title: string
  icon: LucideIcon; variant?: "default" | "success" | "warning" | "danger" | "muted"
}) {
  const styles = {
    default: "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
    success: "hover:bg-green-500/15 text-muted-foreground hover:text-green-500",
    warning: "hover:bg-orange-500/15 text-muted-foreground hover:text-orange-500",
    danger: "hover:bg-red-500/15 text-muted-foreground hover:text-red-500",
    muted: "hover:bg-secondary/60 text-muted-foreground/50 hover:text-muted-foreground",
  }
  return (
    <button
      onClick={(e) => { e.preventDefault(); onClick(e) }}
      title={title}
      className={`p-1.5 rounded transition-colors ${styles[variant]} min-w-[32px] min-h-[32px] flex items-center justify-center`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cfg = severityConfig[severity]
  const Icon = severityIcons[severity] || Shield
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.badge}`}>
      <Icon className="h-2.5 w-2.5" />
      {severity}
    </span>
  )
}

export function SectionHeader({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description?: string
}) {
  return (
    <div className="flex items-start gap-3 pb-1">
      <div className="p-1.5 rounded bg-secondary/60 border border-border/60 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground/80">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export const inputCls = "w-full border border-border bg-card px-3 py-2 text-xs rounded text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
export const selectCls = "w-full border border-border bg-card px-2.5 py-2 text-xs rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"

// ─── Common action row for findings ─────────────────────────────────────────────

export function FindingActions({ finding, onUpdate, onEscalate, onDelete, showAdminActions }: {
  finding: Finding
  onUpdate: (id: number, status: string) => void
  onEscalate: (id: number) => void
  onDelete: (id: number, title: string) => void
  showAdminActions: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      <ActionBtn onClick={() => onUpdate(finding.id, "acknowledged")} title="Acknowledge" icon={Check} />
      <ActionBtn onClick={() => onUpdate(finding.id, "resolved")} title="Resolve" icon={CheckCircle} variant="success" />
      <ActionBtn onClick={() => onUpdate(finding.id, "false_positive")} title="Mark False Positive" icon={Flag} variant="warning" />
      {showAdminActions && (
        <>
          <ActionBtn onClick={() => onUpdate(finding.id, "internal_resolved")} title="Internal Resolve (hide)" icon={EyeOff} variant="muted" />
          <ActionBtn onClick={() => onEscalate(finding.id)} title="Escalate to ticket" icon={Send} variant="default" />
          <ActionBtn onClick={() => onDelete(finding.id, finding.title)} title="Force Delete" icon={Trash2} variant="danger" />
        </>
      )}
    </div>
  )
}
