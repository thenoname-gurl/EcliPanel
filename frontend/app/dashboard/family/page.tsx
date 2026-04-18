"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Users,
  Link2,
  CheckCircle,
  AlertTriangle,
  Baby,
  ShieldCheck,
  Mail,
  Loader2,
  UserPlus,
  Server,
  Building2,
  Receipt,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Check,
  AlertCircle,
  RefreshCw,
  Globe,
  KeyRound,
} from "lucide-react"

// ─── Primitives (exact same css as settings page) ────────────────────────────

function SettingsCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4 md:p-6 min-w-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow",
        className
      )}
    >
      {children}
    </div>
  )
}

function FormInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon: Icon,
  className = "",
  error,
  hint,
  disabled,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  icon?: React.ElementType
  className?: string
  error?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative min-w-0">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border bg-secondary/30 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-0 disabled:opacity-50 disabled:cursor-not-allowed",
            Icon ? "pl-10" : "px-3",
            error
              ? "border-destructive focus:border-destructive"
              : "border-border focus:border-primary/50"
          )}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  onClick,
}: {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      {...(onClick ? { onClick } : {})}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 md:p-4 min-w-0 transition-all",
        onClick &&
          "cursor-pointer hover:bg-secondary/40 active:scale-[0.98] w-full text-left",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Tag>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAgeFromDob(dob?: string | null): number | null {
  if (!dob) return null
  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - date.getUTCFullYear()
  const m = now.getUTCMonth() - date.getUTCMonth()
  const d = now.getUTCDate() - date.getUTCDate()
  if (m < 0 || (m === 0 && d < 0)) age -= 1
  return age
}

function InlineAlert({
  type,
  message,
}: {
  type: "success" | "error" | "warning" | "info"
  message: string
}) {
  const styles = {
    success:
      "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400",
    error:   "border-destructive/20 bg-destructive/5 text-destructive",
    warning: "border-yellow-500/20 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400",
    info:    "border-primary/20 bg-primary/5 text-primary",
  }
  const Icon =
    type === "success" ? CheckCircle : type === "warning" ? AlertTriangle : AlertCircle
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-xs",
        styles[type]
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/10 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-xs mt-1">{description}</p>
        )}
      </div>
    </div>
  )
}

// ─── Child card ───────────────────────────────────────────────────────────────

function ChildCard({
  child,
  servers,
  orders,
  orgs,
  dobEdit,
  savingDob,
  onDobChange,
  onSaveDob,
}: {
  child: any
  servers: any[]
  orders: any[]
  orgs: any[]
  dobEdit: string
  savingDob: boolean
  onDobChange: (value: string) => void
  onSaveDob: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { toast } = useToast()
  const t = useTranslations("familyPage")
  const childAge = getAgeFromDob(child.dateOfBirth)

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 overflow-hidden hover:bg-secondary/30 transition-colors">
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 p-3 md:p-4 text-left active:scale-[0.99] transition-all"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Baby className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {child.firstName || child.email}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{child.email}</p>
        </div>

        {/* Quick-stat pills – hidden on very small screens */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {[
            { label: t("childCard.servers"), value: servers.length },
            { label: t("childCard.orders"),  value: orders.length  },
            { label: t("childCard.orgs"),    value: orgs.length    },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xs font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            className={cn(
              "text-[10px] border-0 px-2",
              child.suspended
                ? "bg-destructive/10 text-destructive"
                : "bg-green-500/10 text-green-600 dark:text-green-400"
            )}
          >
            {child.suspended ? "Suspended" : "Active"}
          </Badge>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Mobile quick-stats bar */}
      <div className="sm:hidden grid grid-cols-3 divide-x divide-border border-t border-border/50">
        {[
          { label: "Servers", value: servers.length },
          { label: "Orders",  value: orders.length  },
          { label: "Orgs",    value: orgs.length    },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center py-2">
            <p className="text-sm font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t("childCard.age"),    value: childAge != null ? t("childCard.ageValue", { age: childAge }) : t("common.unknown") },
              { label: t("childCard.plan"),   value: child.portalType || t("childCard.freePlan") },
              { label: t("childCard.status"), value: child.suspended ? t("childCard.statuses.suspended") : t("childCard.statuses.active") },
              {
                label: t("childCard.resources"),
                value: child.limits
                  ? `${child.limits.memory ?? "–"} MB / ${child.limits.cpu ?? "–"}%`
                  : t("childCard.default")
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-border/50 bg-secondary/20 p-3"
              >
                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-sm font-semibold text-foreground mt-1 truncate">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Date of birth */}
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t("childCard.dateOfBirth")}</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={dobEdit}
                onChange={(e) => onDobChange(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
              />
              <button
                onClick={onSaveDob}
                disabled={savingDob}
                className="shrink-0 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {savingDob
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" />}
                <span className="hidden sm:inline">{t("childCard.save")}</span>
              </button>
            </div>
          </div>

          {/* Servers */}
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Server className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground flex-1">{t("childCard.servers")}</p>
              <Badge variant="outline" className="text-[10px]">{servers.length}</Badge>
            </div>
            {servers.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-12">{t("childCard.noServers")}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {servers.slice(0, 5).map((s: any) => (
                  <div
                    key={s.uuid}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.template}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                      {s.status}
                    </Badge>
                  </div>
                ))}
                {servers.length > 5 && (
                  <p className="text-xs text-muted-foreground pl-1">
                    +{servers.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Organisations */}
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground flex-1">{t("childCard.organisations")}</p>
              <Badge variant="outline" className="text-[10px]">{orgs.length}</Badge>
            </div>
            {orgs.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-12">{t("childCard.noOrganisations")}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orgs.map((org: any) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 hover:bg-secondary/40 transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground truncate">
                      {org.name || t("common.unknown")}
                    </p>
                    <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                      {org.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Billing */}
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Receipt className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground flex-1">{t("childCard.billing")}</p>
              <Badge variant="outline" className="text-[10px]">{orders.length}</Badge>
            </div>
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-12">{t("childCard.noBillingRecords")}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orders.slice(0, 5).map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        Order #{order.id}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {order.status}
                        {order.amount != null ? ` · $${order.amount}` : ""}
                      </p>
                    </div>
                    <a
                      href={API_ENDPOINTS.orderInvoice.replace(":id", String(order.id))}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 ml-2 flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-[10px] font-medium text-foreground hover:bg-secondary transition-colors active:scale-[0.98]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t("childCard.invoice")}
                    </a>
                  </div>
                ))}
                {orders.length > 5 && (
                  <p className="text-xs text-muted-foreground pl-1">
                    +{orders.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FamilyPage() {
  const t = useTranslations("familyPage")
  const { user, refreshUser } = useAuth()
  const { toast } = useToast()

  const [loading,        setLoading]        = useState(true)
  const [requests,       setRequests]        = useState<any[]>([])
  const [children,       setChildren]        = useState<any[]>([])
  const [invites,        setInvites]         = useState<any[]>([])
  const [parentInfo,     setParentInfo]      = useState<any | null>(null)

  const [parentEmail,    setParentEmail]     = useState("")
  const [childEmail,     setChildEmail]      = useState("")

  const [formMessage,    setFormMessage]     = useState<string | null>(null)
  const [inviteMessage,  setInviteMessage]   = useState<string | null>(null)
  const [childMessage,   setChildMessage]    = useState<string | null>(null)
  const [childMessageType, setChildMessageType] = useState<'success' | 'error'>('success')
  const [formError,      setFormError]       = useState<string | null>(null)

  const [acceptCodes,    setAcceptCodes]     = useState<Record<number, string>>({})
  const [childDobEdits,  setChildDobEdits]   = useState<Record<number, string>>({})

  const [sendingRequest,   setSendingRequest]   = useState(false)
  const [creatingInvite,   setCreatingInvite]   = useState(false)
  const [savingChildDob,   setSavingChildDob]   = useState<Record<number, boolean>>({})
  const [acceptingRequest, setAcceptingRequest] = useState<Record<number, boolean>>({})

  const [childServers, setChildServers] = useState<Record<number, any[]>>({})
  const [childOrders,  setChildOrders]  = useState<Record<number, any[]>>({})
  const [childOrgs,    setChildOrgs]    = useState<Record<number, any[]>>({})

  // ── derived ────────────────────────────────────────────────────────────────

  const computedAge = useMemo(() => {
    if (!user) return null
    return typeof user.age === "number" ? user.age : getAgeFromDob(user?.dateOfBirth)
  }, [user])

  const hasKnownAge  = typeof computedAge === "number"

  const isAdult = useMemo(() => {
    if (!user) return false
    if (hasKnownAge) return computedAge >= 18
    return user.isChildAccount !== true
  }, [user, computedAge, hasKnownAge])

  const isLinkedChild  = useMemo(() => user != null && user.parentId != null && !isAdult, [user, isAdult])
  const canViewChildren = useMemo(() => user != null && hasKnownAge && computedAge >= 18, [user, hasKnownAge, computedAge])
  const isParent        = canViewChildren

  const isChild = useMemo(() => {
    if (!user) return false
    if (user.parentId != null && !isAdult) return true
    if (hasKnownAge) return computedAge < 18
    return user.isChildAccount === true
  }, [user, hasKnownAge, computedAge, isAdult])

  const canRequestParent = useMemo(
    () => user != null && user.parentId == null && isChild,
    [user, isChild]
  )
  const showParentInfo = useMemo(
    () => user != null && user.parentId != null && !isParent,
    [user, isParent]
  )

  const age = typeof user?.age === "number" ? user.age : getAgeFromDob(user?.dateOfBirth)

  const accountRole = isParent
    ? t("roles.parent")
    : isLinkedChild
    ? t("roles.linkedChild")
    : isChild
    ? t("roles.child")
    : t("roles.unknown")

  const requestStatusLabels = {
    accepted: t("requestStatuses.accepted"),
    pending: t("requestStatuses.pending"),
    rejected: t("requestStatuses.rejected"),
  } as const

  // ── data ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    fetchData()
    if (showParentInfo) fetchParentInfo()
  }, [user, showParentInfo])

  async function fetchParentInfo() {
    try {
      const data = await apiFetch(API_ENDPOINTS.usersMeParent)
      setParentInfo(data?.parent || null)
    } catch { setParentInfo(null) }
  }

  async function fetchData() {
    setLoading(true)
    setFormError(null)
    try {
      const rd = await apiFetch(API_ENDPOINTS.parentLinkRequests)
      setRequests(Array.isArray(rd?.requests) ? rd.requests : [])

      let childrenArray: any[] = []
      if (canViewChildren) {
        try {
          const d = await apiFetch(API_ENDPOINTS.usersMeChildren)
          childrenArray = Array.isArray(d?.children) ? d.children : []
          setChildren(childrenArray)
        } catch { setChildren([]) }
      } else { setChildren([]) }

      if (isParent) {
        try {
          const d = await apiFetch(API_ENDPOINTS.parentRegistrationInvites)
          setInvites(Array.isArray(d?.invites) ? d.invites : [])
        } catch { setInvites([]) }
      }

      const nd: Record<number, string> = {}
      childrenArray.forEach((c: any) => {
        nd[c.id] = c.dateOfBirth || ""
      })
      setChildDobEdits((p) => ({ ...nd, ...p }))

      if (isParent && childrenArray.length) {
        const ns: Record<number, any[]> = {}
        const no: Record<number, any[]> = {}
        const ng: Record<number, any[]> = {}
        await Promise.all(childrenArray.map(async (c: any) => {
          try { const d = await apiFetch(API_ENDPOINTS.childServers.replace(":childId", String(c.id)));        ns[c.id] = Array.isArray(d?.servers)       ? d.servers       : [] } catch { ns[c.id] = [] }
          try { const d = await apiFetch(API_ENDPOINTS.childOrders.replace(":childId", String(c.id)));         no[c.id] = Array.isArray(d?.orders)        ? d.orders        : [] } catch { no[c.id] = [] }
          try { const d = await apiFetch(API_ENDPOINTS.childOrganisations.replace(":childId", String(c.id))); ng[c.id] = Array.isArray(d?.organisations) ? d.organisations : [] } catch { ng[c.id] = [] }
        }))
        setChildServers(ns); setChildOrders(no); setChildOrgs(ng)
      }
    } catch (e: any) {
      setFormError(e?.message || t("messages.unableToLoadFamilyData"))
    } finally {
      setLoading(false)
    }
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function sendParentRequest() {
    setFormError(null); setFormMessage(null)
    if (!parentEmail.trim()) { setFormError(t("messages.enterParentEmail")); return }
    setSendingRequest(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.parentLinkRequests, {
        method: "POST", body: { parentEmail: parentEmail.trim() },
      })
      setParentEmail("")
      setFormMessage(t("messages.requestCreated", { code: data.request.code }))
      setRequests((p) => [data.request, ...p])
    } catch (e: any) {
      setFormError(e?.message || t("messages.failedSendLinkRequest"))
    } finally { setSendingRequest(false) }
  }

  async function createParentInvite() {
    setFormError(null); setInviteMessage(null); setCreatingInvite(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.parentRegistrationInvites, {
        method: "POST", body: { childEmail: childEmail.trim() || undefined },
      })
      setChildEmail("")
      const link = data?.invite?.link
      setInviteMessage(t("messages.inviteCreated", { link }))
      setInvites((p) => [data.invite, ...p])
      toast({
        title: t("messages.childInviteCreated"),
        description: (
          <span>
            <a href={link} target="_blank" rel="noreferrer" className="underline font-medium">
              {t("messages.openLink")}
            </a>
          </span>
        ),
      })
    } catch (e: any) {
      setFormError(e?.message || t("messages.failedCreateInvite"))
    } finally { setCreatingInvite(false) }
  }

  async function revokeInvite(id: number) {
    try {
      await apiFetch(API_ENDPOINTS.parentRegistrationInviteRevoke.replace(":inviteId", String(id)), { method: "DELETE" })
      setInvites((p) => p.filter((i) => i.id !== id))
      setChildMessageType('success')
      setChildMessage(t("messages.inviteRevoked"))
    } catch (e: any) {
      setChildMessageType('error')
      setChildMessage(e?.message || t("messages.failedRevokeInvite"))
    }
  }

  async function acceptRequest(requestId: number) {
    setChildMessage(null)
    const code = acceptCodes[requestId] || ""
    if (!code.trim()) {
      setChildMessageType('error')
      setChildMessage(t("messages.enterLinkingCode"))
      return
    }
    setAcceptingRequest((p) => ({ ...p, [requestId]: true }))
    try {
      await apiFetch(API_ENDPOINTS.parentLinkRequestAccept.replace(":id", String(requestId)), {
        method: "POST", body: { code: code.trim() },
      })
      setChildMessageType('success')
      setChildMessage(t("messages.requestAccepted"))
      setAcceptCodes((p) => ({ ...p, [requestId]: "" }))
      fetchData()
    } catch (e: any) {
      setChildMessageType('error')
      setChildMessage(e?.message || t("messages.failedAcceptRequest"))
    } finally { setAcceptingRequest((p) => ({ ...p, [requestId]: false })) }
  }

  async function updateChildDob(childId: number) {
    setChildMessage(null)
    const dob = (childDobEdits[childId] || "").trim()
    if (!dob) {
      setChildMessageType('error')
      setChildMessage(t("messages.enterDateOfBirth"))
      return
    }
    setSavingChildDob((p) => ({ ...p, [childId]: true }))
    try {
      const data = await apiFetch(API_ENDPOINTS.childUpdate.replace(":childId", String(childId)), {
        method: "PUT", body: { dateOfBirth: dob },
      })
      setChildren((p) => p.map((c) => (c.id === childId ? data.child : c)))
      setChildDobEdits((p) => ({ ...p, [childId]: data.child.dateOfBirth || "" }))
      setChildMessageType('success')
      setChildMessage(t("messages.dateOfBirthUpdated"))
    } catch (e: any) {
      setChildMessageType('error')
      setChildMessage(e?.message || t("messages.failedUpdateDateOfBirth"))
    } finally { setSavingChildDob((p) => ({ ...p, [childId]: false })) }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-shrink-0">
        <PanelHeader
          title={t("page.title")}
          description={t("page.description")}
        />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 lg:p-8 max-w-4xl mx-auto pb-8 w-full min-w-0">

          {/* Beta notice – mirrors the yellow warning style used in settings */}
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3.5 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{t("beta.title")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("beta.description")}
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[10px]"
            >
              {t("beta.badge")}
            </Badge>
          </div>

          {/* Account status */}
          {user && (
            <div
              className={cn(
                "rounded-xl border p-4 md:p-5 min-w-0 overflow-hidden shadow-sm",
                isParent
                  ? "border-green-500/20 bg-green-500/5"
                  : isChild
                  ? "border-primary/20 bg-primary/5"
                  : "border-border bg-card/50"
              )}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                    isParent
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : isChild
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isParent ? <ShieldCheck className="h-6 w-6" />
                    : isLinkedChild ? <Link2 className="h-6 w-6" />
                    : isChild ? <Baby className="h-6 w-6" />
                    : <Users className="h-6 w-6" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      {accountRole} Account
                    </h2>
                    <Badge
                      className={cn(
                        "text-[10px] border-0 px-2",
                        isParent
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : isChild
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {accountRole}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isParent
                      ? t("accountStatus.managingChildren", { count: children.length })
                      : isLinkedChild
                      ? t("accountStatus.linkedChild", { age: age ?? t("common.unknown") })
                      : isChild
                      ? t("accountStatus.childAgeLabel", { age: age ?? t("common.unknown"), dob: user.dateOfBirth ?? t("accountStatus.setDobHint") })
                      : t("accountStatus.unlockFamilyFeatures")}
                  </p>
                </div>

                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </button>
              </div>
            </div>
          )}

          {/* Adult-age reached notice */}
          {user?.parentId != null && hasKnownAge && isAdult && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <p className="text-xs text-primary">
                {t("accountStatus.adultAgeNotice")}
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card/50 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading family data…
            </div>
          )}

          {/* Global error */}
          {!loading && formError && (
            <InlineAlert type="error" message={formError} />
          )}

          {/* ── Parent info (child view) ─────────────────────────────────── */}
          {!loading && showParentInfo && parentInfo && (
            <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t("parentInfo.title")}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("parentInfo.subtitle")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { label: t("parentInfo.fields.name"),    value: parentInfo.firstName || parentInfo.displayName || parentInfo.email, Icon: Users     },
                  { label: t("parentInfo.fields.email"),   value: parentInfo.email,                                                    Icon: Mail      },
                  { label: t("parentInfo.fields.role"),    value: parentInfo.role || t("parentInfo.fields.roleParent"),                 Icon: ShieldCheck },
                  { label: t("parentInfo.fields.country"), value: parentInfo.billingCountry || t("parentInfo.notSet"),                 Icon: Globe     },
                ].map(({ label, value, Icon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 min-w-0"
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {label}
                      </p>
                      <p className="text-sm font-medium text-foreground truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SettingsCard>
          )}

          {/* ── Request parent link ─────────────────────────────────────── */}
          {!loading && canRequestParent && (
            <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t("requestParent.title")}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("requestParent.subtitle")}
              </p>
              <div className="flex flex-col gap-3">
                <FormInput
                  label={t("requestParent.fields.parentEmail")}
                  type="email"
                  placeholder={t("requestParent.fields.parentEmailPlaceholder")}
                  value={parentEmail}
                  onChange={setParentEmail}
                  icon={Mail}
                />
                <div>
                  <button
                    onClick={sendParentRequest}
                    disabled={sendingRequest || !parentEmail.trim()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {sendingRequest
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("requestParent.actions.sending")}</>
                      : <><UserPlus className="h-4 w-4" /> {t("requestParent.actions.sendRequest")}</>}
                  </button>
                </div>
                {formMessage && <InlineAlert type="success" message={formMessage} />}
              </div>
            </SettingsCard>
          )}

          {/* ── Link requests ────────────────────────────────────────────── */}
          {!loading && requests.length > 0 && (
            <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <h3 className="text-sm font-semibold text-foreground mb-1">{t("linkRequests.title")}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("linkRequests.subtitle")}
              </p>

              {childMessage && (
                <div className="mb-4">
                  <InlineAlert type={childMessageType} message={childMessage} />
                </div>
              )}

              <div className="flex flex-col gap-2.5 min-w-0">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-lg border border-border/50 bg-secondary/20 overflow-hidden min-w-0"
                  >
                    {/* Row */}
                    <div className="flex items-start justify-between gap-3 p-3 md:p-4 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={cn(
                            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                            req.status === "accepted"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          <Link2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {t("linkRequests.requestNumber", { id: req.id })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {req.child?.email || t("common.unknown")}
                            {req.parentEmail && ` · ${req.parentEmail}`}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          "text-[10px] border-0 shrink-0 flex items-center gap-1",
                          req.status === "accepted"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : req.status === "pending"
                            ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                            : "bg-secondary text-muted-foreground"
                        )}
                      >
                        {req.status === "accepted"
                          ? <CheckCircle className="h-3 w-3" />
                          : <Clock className="h-3 w-3" />}
                        {req.status}
                      </Badge>
                    </div>

                    {/* Linking code */}
                    {req.code && (
                      <div className="mx-3 md:mx-4 mb-3 flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-4 py-3 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Linking Code
                          </p>
                          <p className="font-mono text-sm font-bold tracking-widest text-foreground mt-0.5">
                            {req.code}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(req.code)
                            toast({ title: t("messages.codeCopied") })
                          }}
                          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-[0.98]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Accept form */}
                    {req.parentId === user?.id && req.status === "pending" && (
                      <div className="px-3 md:px-4 pb-3 flex flex-col sm:flex-row gap-2 sm:items-end min-w-0">
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t("linkRequests.enterCodeLabel")}
                          </label>
                          <input
                            value={acceptCodes[req.id] || ""}
                            onChange={(e) =>
                              setAcceptCodes((p) => ({ ...p, [req.id]: e.target.value }))
                            }
                            placeholder={t("linkRequests.enterCodePlaceholder")}
                            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all min-w-0"
                          />
                        </div>
                        <button
                          onClick={() => acceptRequest(req.id)}
                          disabled={acceptingRequest[req.id]}
                          className="shrink-0 flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                        >
                          {acceptingRequest[req.id]
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("linkRequests.actions.accepting")}</>
                            : <><CheckCircle className="h-4 w-4" /> {t("linkRequests.actions.accept")}</>}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SettingsCard>
          )}

          {/* ── Parent-only ───────────────────────────────────────────────── */}
          {!loading && isParent && (
            <>
              {/* Create invite */}
              <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {t("inviteChild.title")}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("inviteChild.subtitle")}
                </p>
                <div className="flex flex-col gap-3">
                  <FormInput
                    label={t("inviteChild.fields.childEmail")}
                    type="email"
                    placeholder={t("inviteChild.fields.childEmailPlaceholder")}
                    value={childEmail}
                    onChange={setChildEmail}
                    icon={Mail}
                  />
                  <div>
                    <button
                      onClick={createParentInvite}
                      disabled={creatingInvite}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                      {creatingInvite
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("inviteChild.actions.creating")}</>
                        : <><UserPlus className="h-4 w-4" /> {t("inviteChild.actions.createInvite")}</>}
                    </button>
                  </div>
                  {inviteMessage && <InlineAlert type="success" message={inviteMessage} />}
                </div>
              </SettingsCard>

              {/* Active invites list */}
              <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-center justify-between mb-4 gap-3 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{t("activeInvites.title")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("activeInvites.subtitle")}
                    </p>
                  </div>
                  {invites.length > 0 && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {invites.length}
                    </Badge>
                  )}
                </div>

                {childMessage && (
                  <div className="mb-4">
                    <InlineAlert type={childMessageType} message={childMessage} />
                  </div>
                )}

                {invites.length === 0 ? (
                  <EmptyState
                    icon={UserPlus}
                    title={t("activeInvites.emptyTitle")}
                    description={t("activeInvites.emptyDescription")}
                  />
                ) : (
                  <div className="flex flex-col gap-2.5 min-w-0">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="rounded-lg border border-border/50 bg-secondary/20 p-3 md:p-4 hover:bg-secondary/30 transition-colors min-w-0 overflow-hidden"
                      >
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {invite.childEmail || t("activeInvites.openInvite")}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              #{invite.id}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(invite.link)
                                toast({ title: t("messages.codeCopied") })
                              }}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-[0.98]"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <a
                              href={invite.link}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => revokeInvite(invite.id)}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors active:scale-[0.98]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 min-w-0">
                          <p className="flex-1 truncate font-mono text-xs text-muted-foreground min-w-0">
                            {invite.link}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SettingsCard>

              {/* Linked children */}
              <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-center justify-between mb-4 gap-3 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{t("linkedChildren.title")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("linkedChildren.subtitle")}
                    </p>
                  </div>
                  {children.length > 0 && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {children.length}
                    </Badge>
                  )}
                </div>

                {childMessage && (
                  <div className="mb-4">
                    <InlineAlert type={childMessageType} message={childMessage} />
                  </div>
                )}

                {children.length === 0 ? (
                  <EmptyState
                    icon={Baby}
                    title={t("linkedChildren.emptyTitle")}
                    description={t("linkedChildren.emptyDescription")}
                  />
                ) : (
                  <div className="flex flex-col gap-2.5 min-w-0">
                    {children.map((child) => (
                      <ChildCard
                        key={child.id}
                        child={child}
                        servers={childServers[child.id] || []}
                        orders={childOrders[child.id]  || []}
                        orgs={childOrgs[child.id]      || []}
                        dobEdit={childDobEdits[child.id]   || ""}
                        savingDob={!!savingChildDob[child.id]}
                        onDobChange={(value) =>
                          setChildDobEdits((p) => ({ ...p, [child.id]: value }))
                        }
                        onSaveDob={() => updateChildDob(child.id)}
                      />
                    ))}
                  </div>
                )}
              </SettingsCard>
            </>
          )}

          {/* ── Account summary ──────────────────────────────────────────── */}
          {user && !loading && (
            <SettingsCard className="animate-in fade-in slide-in-from-bottom-3 duration-300">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {t("summary.title")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
                <SettingRow icon={Mail} title={t("summary.email")} description={user.email} />
                <SettingRow
                  icon={Users}
                  title={t("summary.accountRole")}
                  description={accountRole}
                  action={
                    isParent
                      ? <CheckCircle className="h-4 w-4 text-green-500" />
                      : isChild
                      ? <Baby className="h-4 w-4 text-primary" />
                      : <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  }
                />
                <SettingRow
                  icon={ShieldCheck}
                  title={t("summary.age")}
                  description={age != null ? t("summary.ageValue", { age }) : t("summary.ageNotSet")}
                />
                <SettingRow
                  icon={Link2}
                  title={t("summary.linkedChildren")}
                  description={isParent ? t("summary.linkedCount", { count: children.length }) : t("summary.na")}
                  action={
                    isParent && children.length > 0
                      ? <CheckCircle className="h-4 w-4 text-green-500" />
                      : undefined
                  }
                />
              </div>
            </SettingsCard>
          )}

        </div>
      </div>
    </div>
  )
}