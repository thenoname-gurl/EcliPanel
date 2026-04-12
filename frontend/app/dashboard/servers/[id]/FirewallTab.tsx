"use client"

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Shield,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Network,
  Hash,
  ArrowRight,
} from "lucide-react"
import { LoadingState } from "./serverTabShared"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface FirewallTabProps {
  serverId: string
  server: any
}

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>
  title?: string
  message: string
  action?: ReactNode
}

type Protocol = "tcp" | "udp" | "both"

interface PortRule {
  id: string
  vmPort: string      // guest/internal port
  globalPort: string  // host/external port
  protocol: Protocol
}

type PortRuleError = {
  vmPort?: string
  globalPort?: string
  conflict?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

function isValidPort(value: string): boolean {
  if (!value.trim()) return false
  const n = Number(value.trim())
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

/** Parse "8080:80/tcp", "25565/udp", "3000", etc. into a PortRule */
function parseRawEntry(raw: string): PortRule {
  const id = generateId()
  const normalized = raw.trim()

  // Match: hostPort:guestPort/proto  OR  port/proto  OR  port
  const match =
    /^([0-9]{1,5})(?::([0-9]{1,5}))?(?:\/(tcp|udp))?$/i.exec(normalized)

  if (!match) {
    return { id, vmPort: "", globalPort: normalized, protocol: "tcp" }
  }

  const hostPort = match[1]
  const guestPort = match[2] ?? match[1]
  const proto = (match[3] ?? "tcp").toLowerCase() as Protocol

  return {
    id,
    vmPort: guestPort,
    globalPort: hostPort,
    protocol: proto,
  }
}

/** Serialize a PortRule back to "hostPort:guestPort/proto" */
function serializeRule(rule: PortRule): string[] {
  const { vmPort, globalPort, protocol } = rule
  if (!vmPort.trim() || !globalPort.trim()) return []

  if (protocol === "both") {
    return [
      `${globalPort}:${vmPort}/tcp`,
      `${globalPort}:${vmPort}/udp`,
    ]
  }
  return [`${globalPort}:${vmPort}/${protocol}`]
}

function parseVmPortsString(value: string): PortRule[] {
  return String(value)
    .split(/\s*,\s*/)
    .map((e) => e.trim())
    .filter(Boolean)
    .map(parseRawEntry)
}

function validateRule(
  rule: PortRule,
  defaultSshPort: number,
  t: (key: string, values?: Record<string, any>) => string
): PortRuleError {
  const errors: PortRuleError = {}

  if (rule.vmPort && !isValidPort(rule.vmPort)) {
    errors.vmPort = t("firewall.portMustBeValid")
  }
  if (rule.globalPort && !isValidPort(rule.globalPort)) {
    errors.globalPort = t("firewall.portMustBeValid")
  }

  const vp = Number(rule.vmPort)
  const gp = Number(rule.globalPort)

  if (isValidPort(rule.vmPort) && isValidPort(rule.globalPort)) {
    if (vp === 22 || gp === defaultSshPort) {
      errors.conflict = t("firewall.sshConflict", { hostPort: defaultSshPort })
    }
  }

  return errors
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon = AlertCircle,
  title,
  message,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-secondary/60 p-4 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      {title && (
        <h3 className="text-sm font-semibold text-foreground mb-1.5">
          {title}
        </h3>
      )}
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        {message}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function Banner({
  variant,
  icon: Icon,
  children,
}: {
  variant: "info" | "warning" | "error" | "success"
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  }

  const defaultIcons = {
    info: Info,
    warning: AlertTriangle,
    error: XCircle,
    success: CheckCircle2,
  }

  const BannerIcon = Icon ?? defaultIcons[variant]

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-3.5 text-sm",
        styles[variant]
      )}
    >
      <BannerIcon className="h-4 w-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

function SectionCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 border-b border-border bg-secondary/5">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="rounded-lg bg-secondary/60 p-2 shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// Protocol selector pill group
function ProtocolSelector({
  value,
  onChange,
}: {
  value: Protocol
  onChange: (p: Protocol) => void
}) {
  const t = useTranslations("serverDetailPage")
  const options: { label: string; value: Protocol }[] = [
    { label: t("firewall.protocolTcp"), value: "tcp" },
    { label: t("firewall.protocolUdp"), value: "udp" },
    { label: t("firewall.protocolBoth"), value: "both" },
  ]

  return (
    <div className="flex rounded-lg border border-border bg-secondary/20 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            value === opt.value
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Port input with label
function PortInput({
  label,
  sublabel,
  value,
  placeholder,
  error,
  onChange,
}: {
  label: string
  sublabel?: string
  value: string
  placeholder: string
  error?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-baseline gap-1.5">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {sublabel && (
          <span className="text-[10px] text-muted-foreground">{sublabel}</span>
        )}
      </div>
      <input
        type="number"
        min={1}
        max={65535}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border bg-input px-3 py-2.5 text-sm font-mono",
          "h-11 sm:h-10 outline-none transition-all",
          "placeholder:text-muted-foreground/40",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          "focus:ring-2",
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-600 dark:focus:ring-red-900/50"
            : "border-border focus:border-primary focus:ring-primary/20"
        )}
      />
      {error && (
        <p className="text-[11px] text-red-500 flex items-center gap-1">
          <XCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// Single port rule row
function PortRuleRow({
  rule,
  errors,
  index,
  onUpdate,
  onRemove,
}: {
  rule: PortRule
  errors: PortRuleError
  index: number
  onUpdate: (updates: Partial<PortRule>) => void
  onRemove: () => void
}) {
  const t = useTranslations("serverDetailPage")
  const hasError =
    !!errors.vmPort || !!errors.globalPort || !!errors.conflict

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 space-y-3 transition-colors",
        hasError
          ? "border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/10"
          : "border-border bg-secondary/5 hover:bg-secondary/10"
      )}
    >
      {/* Row header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
            {index + 1}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {t("firewall.portRule")}
          </span>
          {hasError && (
            <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
              <XCircle className="h-3 w-3" />
              {t("firewall.fixErrors")}
            </span>
          )}
          {!hasError &&
            isValidPort(rule.vmPort) &&
            isValidPort(rule.globalPort) && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                {t("firewall.validLabel")}
              </span>
            )}
        </div>
        <button
          onClick={onRemove}
          aria-label={t("firewall.removeRule")}
          className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            "text-muted-foreground hover:text-red-500 hover:bg-red-50",
            "dark:hover:bg-red-950/40 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Port fields: VM port → Global port */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <PortInput
          label={t("firewall.vmPortLabel")}
          sublabel={t("firewall.vmPortHelp")}
          value={rule.vmPort}
          placeholder={t("firewall.vmPortPlaceholder")}
          error={errors.vmPort}
          onChange={(v) => onUpdate({ vmPort: v })}
        />

        {/* Arrow connector */}
        <div className="flex items-center justify-center pb-2.5 sm:pb-2">
          <div className="flex flex-col items-center gap-0.5">
            <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
          </div>
        </div>

        <PortInput
          label={t("firewall.globalPortLabel")}
          sublabel={t("firewall.globalPortHelp")}
          value={rule.globalPort}
          placeholder={t("firewall.globalPortPlaceholder")}
          error={errors.globalPort}
          onChange={(v) => onUpdate({ globalPort: v })}
        />
      </div>

      {/* Protocol selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t("firewall.protocolLabel")}
        </label>
        <ProtocolSelector
          value={rule.protocol}
          onChange={(p) => onUpdate({ protocol: p })}
        />
      </div>

      {/* Conflict warning */}
      {errors.conflict && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.conflict}
          </p>
        </div>
      )}

      {/* Preview serialized output */}
      {isValidPort(rule.vmPort) && isValidPort(rule.globalPort) && !hasError && (
        <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
            {t("firewall.outputLabel")}
          </span>
          <div className="flex flex-wrap gap-1">
            {serializeRule(rule).map((s) => (
              <code
                key={s}
                className="text-[11px] font-mono bg-secondary rounded px-1.5 py-0.5 text-foreground"
              >
                {s}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FirewallTab({ serverId, server }: FirewallTabProps) {
  const t = useTranslations("serverDetailPage")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [startup, setStartup] = useState<any>(null)
  const [rules, setRules] = useState<PortRule[]>([])
  const [hostAddr, setHostAddr] = useState<string>("")
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId))
      .then((data) => {
        if (!mounted) return
        setStartup(data)
        const env = data?.environment || {}
        setRules(parseVmPortsString(env.VM_PORTS || ""))
        setHostAddr(String(env.VM_HOSTADDR || ""))
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [serverId])

  const defaultSshPort = Number(
    server?.allocations?.find((a: any) => a.is_default)?.port ||
      server?.allocations?.[0]?.port ||
      0
  )

  const vmpPortsDefined = useMemo(
    () =>
      Array.isArray(startup?.envVars) &&
      startup.envVars.some(
        (v: any) =>
          (v.env_variable || v.key || v.name || "").toUpperCase() === "VM_PORTS"
      ),
    [startup]
  )

  const vmHostAddrDefined = useMemo(
    () =>
      Array.isArray(startup?.envVars) &&
      startup.envVars.some(
        (v: any) =>
          (v.env_variable || v.key || v.name || "").toUpperCase() ===
          "VM_HOSTADDR"
      ),
    [startup]
  )

  // Validate all rules
  const ruleErrors = useMemo(
    () => rules.map((r) => validateRule(r, defaultSshPort, t)),
    [rules, defaultSshPort, t]
  )

  const hasErrors = ruleErrors.some(
    (e) => e.vmPort || e.globalPort || e.conflict
  )

  const validRuleCount = rules.filter(
    (r, i) =>
      !ruleErrors[i].vmPort &&
      !ruleErrors[i].globalPort &&
      !ruleErrors[i].conflict &&
      isValidPort(r.vmPort) &&
      isValidPort(r.globalPort)
  ).length

  const addRule = () => {
    setSaveSuccess(false)
    setRules((prev) => [
      ...prev,
      { id: generateId(), vmPort: "", globalPort: "", protocol: "tcp" },
    ])
  }

  const updateRule = (id: string, updates: Partial<PortRule>) => {
    setSaveSuccess(false)
    setSaveError(null)
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    )
  }

  const removeRule = (id: string) => {
    setSaveSuccess(false)
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaveSuccess(false)
    if (!startup) return
    if (hasErrors) {
      setSaveError(t("firewall.fixErrorsBeforeSaving"))
      return
    }

    // Serialize all rules
    const allEntries = rules.flatMap(serializeRule)
    const vmPortsValue = allEntries.join(",")

    const nextEnvironment = {
      ...startup.environment,
      VM_PORTS: vmPortsValue,
    } as Record<string, string>

    if (hostAddr.trim()) {
      nextEnvironment.VM_HOSTADDR = hostAddr.trim()
    } else {
      delete nextEnvironment.VM_HOSTADDR
    }

    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId), {
        method: "PUT",
        body: JSON.stringify({
          environment: nextEnvironment,
          processConfig: {
            startup: {
              done: Array.isArray(startup?.processConfig?.startup?.done)
                ? startup.processConfig.startup.done
                : [],
            },
          },
        }),
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (e: any) {
      setSaveError(
        t("firewall.saveFailed", { reason: e.message || "Unknown error" })
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!startup) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t("firewall.loadFailedTitle")}
        message={t("firewall.loadFailed")}
      />
    )
  }

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-4 min-w-0">
      {/* Page header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <Shield className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("firewall.description")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("firewall.helpText")}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {!vmpPortsDefined && (
        <Banner variant="warning">{t("firewall.noVmPortsDefined")}</Banner>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        {/* Left column */}
        <div className="space-y-4 min-w-0">
          {/* SSH info */}
          {defaultSshPort ? (
            <SectionCard>
              <div className="p-4 flex items-center gap-3">
                <div className="rounded-lg bg-secondary/60 p-2 shrink-0">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground font-medium">
                      {t("firewall.defaultSshPortLabel")}
                    </p>
                    <code className="text-xs font-mono font-bold text-foreground bg-secondary/60 rounded px-2 py-0.5">
                      {defaultSshPort}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t("firewall.defaultSshPortHint")}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* Port rules card */}
          <SectionCard>
            <SectionHeader
              icon={Network}
              title={t("firewall.extraPortsTitle")}
              description={t("firewall.extraPortsDescription")}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addRule}
                  className="h-9 gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("firewall.addPortRule")}
                </Button>
              }
            />

            <div className="p-4 space-y-3">
              {/* Stats */}
              {rules.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("firewall.rulesCount", { count: rules.length })}</span>
                  {validRuleCount > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("firewall.validCount", { count: validRuleCount })}
                    </span>
                  )}
                  {hasErrors && (
                    <span className="text-red-500 flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {t("firewall.errorsCount", {
                        count: ruleErrors.filter(
                          (e) => e.vmPort || e.globalPort || e.conflict
                        ).length,
                      })}
                    </span>
                  )}
                </div>
              )}

              {/* Empty state */}
              {rules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/10 py-10 px-4 text-center">
                  <Network className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">
                    {t("firewall.noPortRules")}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t("firewall.noRulesDescription")}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addRule}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("firewall.addFirstRule")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule, index) => (
                    <PortRuleRow
                      key={rule.id}
                      rule={rule}
                      errors={ruleErrors[index]}
                      index={index}
                      onUpdate={(updates) => updateRule(rule.id, updates)}
                      onRemove={() => removeRule(rule.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Host bind address */}
          <SectionCard>
            <SectionHeader
              title={t("firewall.hostBindAddress")}
              description={t("firewall.hostBindHelp")}
            />
            <div className="p-4 space-y-2">
              <input
                type="text"
                value={hostAddr}
                onChange={(e) => {
                  setHostAddr(e.target.value)
                  setSaveSuccess(false)
                }}
                placeholder="0.0.0.0"
                className={cn(
                  "w-full rounded-lg border border-border bg-input px-3 py-2.5",
                  "text-sm font-mono h-11 sm:h-10 outline-none transition-all",
                  "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  "placeholder:text-muted-foreground/40"
                )}
              />
              {vmHostAddrDefined && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("firewall.hostBindNote")}
                </p>
              )}
            </div>
          </SectionCard>

          {/* Save area */}
          <div className="space-y-3">
            {saveError && <Banner variant="error">{saveError}</Banner>}
            {saveSuccess && (
              <Banner variant="success">
                {t("firewall.saved")}
              </Banner>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || hasErrors}
              className="w-full sm:w-auto h-11 sm:h-10 gap-2 font-medium"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {saving ? t("firewall.saving") : t("firewall.save")}
            </Button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Visual diagram */}
          <SectionCard>
            <SectionHeader icon={Info} title={t("firewall.howItWorksTitle")} />
            <div className="p-4 space-y-3">
              {/* Traffic flow diagram */}
              <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  {t("firewall.trafficFlow")}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  <div className="min-w-0 max-w-[8rem] rounded bg-blue-100 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-2 py-1 text-blue-700 dark:text-blue-300 text-[11px] whitespace-normal break-words">
                    {t("firewall.internet")}
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="min-w-0 max-w-[9rem] rounded bg-secondary border border-border px-2 py-1 text-[11px] whitespace-normal break-words">
                    {t("firewall.globalPortTag")}
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="min-w-0 max-w-[8rem] rounded bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-1 text-emerald-700 dark:text-emerald-300 text-[11px] whitespace-normal break-words">
                    {t("firewall.vmPortTag")}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <div className="rounded px-1.5 py-0.5 bg-secondary border border-border text-[10px] font-mono shrink-0 mt-0.5">
                    {t("firewall.vmPortTag")}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {t("firewall.vmPortDesc")}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="rounded px-1.5 py-0.5 bg-secondary border border-border text-[10px] font-mono shrink-0 mt-0.5">
                    {t("firewall.globalTag")}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {t("firewall.globalDesc")}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Protocol info */}
          <SectionCard>
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                {t("firewall.protocolsTitle")}
              </p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono bg-secondary rounded px-1.5 py-0.5 text-foreground w-8 text-center">
                    {t("firewall.protocolTcp")}
                  </code>
                  <span>{t("firewall.protocolTcpDesc")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono bg-secondary rounded px-1.5 py-0.5 text-foreground w-8 text-center">
                    {t("firewall.protocolUdp")}
                  </code>
                  <span>{t("firewall.protocolUdpDesc")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono bg-secondary rounded px-1.5 py-0.5 text-foreground w-8 text-center">
                    {t("firewall.protocolBoth")}
                  </code>
                  <span>{t("firewall.protocolBothDesc")}</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}