"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Server, LogIn, LogOut, CreditCard, Shield, Ticket, Cpu,
  UserPlus, Loader2, AlertCircle, Activity,
} from "lucide-react"

export const typeIcons: Record<string, any> = {
  server: Server,
  auth: LogIn,
  login: LogIn,
  logout: LogOut,
  register: UserPlus,
  billing: CreditCard,
  security: Shield,
  support: Ticket,
  compute: Cpu,
}

export const typeColors: Record<string, string> = {
  server: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  auth: "text-primary bg-primary/10 border-primary/20",
  login: "text-green-400 bg-green-400/10 border-green-400/20",
  logout: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  register: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  billing: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  security: "text-red-400 bg-red-400/10 border-red-400/20",
  support: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  compute: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
}

export const typeBadgeColors: Record<string, string> = {
  server: "border-blue-500/30 text-blue-400 bg-blue-500/5",
  auth: "border-primary/30 text-primary bg-primary/5",
  login: "border-green-500/30 text-green-400 bg-green-500/5",
  logout: "border-orange-500/30 text-orange-400 bg-orange-500/5",
  register: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
  billing: "border-yellow-500/30 text-yellow-400 bg-yellow-500/5",
  security: "border-red-500/30 text-red-400 bg-red-500/5",
  support: "border-purple-500/30 text-purple-400 bg-purple-500/5",
  compute: "border-cyan-500/30 text-cyan-400 bg-cyan-500/5",
}

export function guessType(action: string): string {
  const a = action.toLowerCase()
  const prefix = "activity.actions."
  const key = a.startsWith(prefix) ? a.slice(prefix.length) : a

  if (key.includes("logout") || key.includes("log_out") || key.includes("signout")) return "logout"
  if (key.includes("login") || key.includes("log_in") || key.includes("signin")) return "login"
  if (key.includes("register") || key.includes("signup") || key.includes("sign_up")) return "register"
  if (/passkey|2fa|mfa|otp/.test(key)) return "security"
  if (/server|start|stop|restart|power|console|file|reinstall|subuser|suspend|unsuspend/.test(key)) return "server"
  if (/billing|payment|invoice|order|subscription|credit/.test(key)) return "billing"
  if (/key|security|password|token/.test(key)) return "security"
  if (/ticket|support/.test(key)) return "support"
  if (/compute|instance|vm|container/.test(key)) return "compute"
  return "auth"
}

export function orgGuessType(action: string): string {
  const a = action.toLowerCase()
  if (/org:create|org:add_user|org:remove_member|org:change_role|org:invite|org:resend_invite|org:revoke_invite|org:accept_invite/.test(a)) return "member"
  if (/server:create|server:delete|server:update|server:suspend|server:unsuspend/.test(a)) return "server"
  if (/billing|payment|invoice|order|subscription|credit/.test(a)) return "billing"
  if (/ticket|support/.test(a)) return "support"
  if (/key|security|password|token|2fa|mfa/.test(a)) return "security"
  return "auth"
}

export function serverGuessType(action: string): string {
  const a = action.toLowerCase()
  if (/power:(start|stop|restart|kill)|suspend|unsuspend/.test(a)) return "power"
  if (/console/.test(a)) return "console"
  if (/file:/.test(a)) return "file"
  if (/subuser/.test(a)) return "subuser"
  if (/kvm|reinstall|update/.test(a)) return "settings"
  if (/backup/.test(a)) return "backup"
  if (/schedule/.test(a)) return "schedule"
  if (/database/.test(a)) return "database"
  return "server"
}

export const serverTypeIcons: Record<string, any> = {
  power: Server,
  console: Activity,
  file: Server,
  subuser: UserPlus,
  settings: Server,
  backup: Server,
  schedule: Server,
  database: Server,
  server: Server,
}

export const serverTypeColors: Record<string, string> = {
  power: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  console: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  file: "text-green-400 bg-green-400/10 border-green-400/20",
  subuser: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  settings: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  backup: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  schedule: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  database: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  server: "text-blue-400 bg-blue-400/10 border-blue-400/20",
}

export const serverTypeBadgeColors: Record<string, string> = {
  power: "border-blue-500/30 text-blue-400 bg-blue-500/5",
  console: "border-purple-500/30 text-purple-400 bg-purple-500/5",
  file: "border-green-500/30 text-green-400 bg-green-500/5",
  subuser: "border-orange-500/30 text-orange-400 bg-orange-500/5",
  settings: "border-cyan-500/30 text-cyan-400 bg-cyan-500/5",
  backup: "border-yellow-500/30 text-yellow-400 bg-yellow-500/5",
  schedule: "border-pink-500/30 text-pink-400 bg-pink-500/5",
  database: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
  server: "border-blue-500/30 text-blue-400 bg-blue-500/5",
}

export const orgTypeIcons: Record<string, any> = {
  member: UserPlus,
  server: Server,
  billing: CreditCard,
  security: Shield,
  support: Ticket,
  auth: LogIn,
}

export const orgTypeColors: Record<string, string> = {
  member: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  server: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  billing: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  security: "text-red-400 bg-red-400/10 border-red-400/20",
  support: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  auth: "text-primary bg-primary/10 border-primary/20",
}

export const orgTypeBadgeColors: Record<string, string> = {
  member: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
  server: "border-blue-500/30 text-blue-400 bg-blue-500/5",
  billing: "border-yellow-500/30 text-yellow-400 bg-yellow-500/5",
  security: "border-red-500/30 text-red-400 bg-red-500/5",
  support: "border-purple-500/30 text-purple-400 bg-purple-500/5",
  auth: "border-primary/30 text-primary bg-primary/5",
}

export function formatTimeAgo(timestamp: string, t: (key: string, values?: Record<string, any>) => string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t("time.justNow")
  if (diffMins < 60) return t("time.minutesAgo", { count: diffMins })
  if (diffHours < 24) return t("time.hoursAgo", { count: diffHours })
  if (diffDays < 7) return t("time.daysAgo", { count: diffDays })
  return then.toLocaleDateString()
}

export function formatAction(action: string): string {
  return action
    .replace(/[:_.-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export function translateActivityAction(action: string, t: (key: string) => string): string {
  const prefix = "activity.actions."
  const normalized = action.toLowerCase()
  if (normalized.startsWith(prefix)) {
    return t("actionLabels." + action.slice(prefix.length))
  }
  return formatAction(action)
}

export function InfoItem({ icon: Icon, label, value, mono, copyable }: {
  icon?: any
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (copyable && value && value !== "-") {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className={cn(
        "border border-border bg-secondary/20 p-2.5 sm:p-3 min-w-0 overflow-hidden",
        copyable && value !== "-" && "cursor-pointer hover:bg-secondary/40 active:bg-secondary/50 transition-colors"
      )}
      onClick={handleCopy}
    >
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
        {copyable && value !== "-" && (
          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
            {copied ? "✓" : ""}
          </span>
        )}
      </div>
      <p className={cn(
        "text-xs sm:text-sm text-foreground truncate",
        mono && "font-mono text-[10px] sm:text-xs"
      )}>
        {value || "-"}
      </p>
    </div>
  )
}

export function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(true)
  const isComplex = typeof data === 'object' && data !== null

  if (!isComplex) {
    return (
      <div className="border border-border bg-secondary/20 p-2.5 sm:p-3 min-w-0 overflow-hidden">
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate mb-1">{label}</p>
        <p className="font-mono text-[10px] sm:text-xs text-foreground break-all">
          {data !== null ? String(data) : "-"}
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-secondary/20 min-w-0 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full p-2.5 sm:p-3 hover:bg-secondary/40 transition-colors text-left"
      >
        <span className="text-muted-foreground text-[8px] w-2.5">{open ? '▼' : '▶'}</span>
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate flex-1">{label}</p>
        <span className="text-[10px] text-muted-foreground font-mono">
          {Array.isArray(data) ? `[${data.length}]` : `{${Object.keys(data).length}}`}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40">
          <EntryList value={data} />
        </div>
      )}
    </div>
  )
}

export function EntryList({ value }: { value: object }) {
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value)

  return (
    <div className="divide-y divide-border/40 font-mono text-[10px] sm:text-xs">
      {entries.map(([key, val]) => (
        <Entry key={key} k={key} v={val} />
      ))}
    </div>
  )
}

function Entry({ k, v }: { k: string; v: unknown }) {
  const [open, setOpen] = useState(false)
  const isComplex = typeof v === 'object' && v !== null
  const isArray = Array.isArray(v)
  const entries = isComplex
    ? (isArray ? v.map((x, i) => [String(i), x]) : Object.entries(v)) as [string, unknown][]
    : []

  if (!isComplex) {
    return (
      <div className="flex items-start gap-1.5 px-2.5 sm:px-3 py-1 hover:bg-secondary/20">
        <span className="text-muted-foreground shrink-0">"{k}":</span>
        <span className="text-foreground break-all">
          {v === null ? <span className="text-muted-foreground italic">null</span> : typeof v === 'string' ? `"${v}"` : String(v)}
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 sm:px-3 py-1 hover:bg-secondary/30 transition-colors text-left"
      >
        <span className="text-muted-foreground text-[8px] w-2.5">{open ? '▼' : '▶'}</span>
        <span className="text-muted-foreground shrink-0">"{k}":</span>
        <span className="text-muted-foreground">{isArray ? `[${(v as any[]).length}]` : `{${Object.keys(v as object).length}}`}</span>
      </button>
      {open && entries.length > 0 && (
        <div className="ml-4 border-l border-border/40">
          <EntryList value={v} />
        </div>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = AlertCircle, title, message }: {
  icon?: any
  title?: string
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div className="bg-secondary/50 p-4 mb-4">
        <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
      </div>
      {title && <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>}
      <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  )
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16">
      <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 rounded-full animate-spin text-muted-foreground mb-3" />
      <p className="text-xs sm:text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
