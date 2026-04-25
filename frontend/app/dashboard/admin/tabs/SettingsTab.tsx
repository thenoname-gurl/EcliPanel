"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Code,
  Eye,
  FileCode,
  Globe,
  MessageSquare,
  Plus,
  Save,
  Search,
  Shield,
  UserPlus,
  Users,
  X,
  Sparkles,
  Lock,
  Unlock,
  TrendingUp,
  Activity,
  Loader2,
  Info,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

function ToggleCard({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  variant = "default",
}: {
  icon: React.ElementType
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  variant?: "default" | "success" | "warning" | "danger"
}) {
  const variants = {
    default: {
      active: "bg-primary/10 border-primary/30",
      inactive: "bg-secondary/20 border-border",
      iconActive: "text-primary",
      iconInactive: "text-muted-foreground",
    },
    success: {
      active: "bg-green-500/10 border-green-500/30",
      inactive: "bg-secondary/20 border-border",
      iconActive: "text-green-400",
      iconInactive: "text-muted-foreground",
    },
    warning: {
      active: "bg-yellow-500/10 border-yellow-500/30",
      inactive: "bg-secondary/20 border-border",
      iconActive: "text-yellow-400",
      iconInactive: "text-muted-foreground",
    },
    danger: {
      active: "bg-red-500/10 border-red-500/30",
      inactive: "bg-secondary/20 border-border",
      iconActive: "text-red-400",
      iconInactive: "text-muted-foreground",
    },
  }

  const variantConfig = variants[variant]

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all hover:shadow-md",
        enabled ? variantConfig.active : variantConfig.inactive
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={cn(
              "mt-0.5 rounded-lg p-2 transition-colors",
              enabled ? variantConfig.iconActive.replace("text-", "bg-") + "/10" : "bg-secondary/50"
            )}
          >
            <Icon
              className={cn("h-4 w-4 transition-colors", enabled ? variantConfig.iconActive : variantConfig.iconInactive)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background active:scale-95",
            enabled ? "bg-primary shadow-sm" : "bg-secondary"
          )}
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform",
              enabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  )
}

function StatCard({
  label,
  sublabel,
  value,
  icon: Icon,
  color = "text-foreground",
  trend,
}: {
  label: string
  sublabel?: string
  value: number | string
  icon?: React.ElementType
  color?: string
  trend?: { value: number; positive: boolean }
}) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card to-card/50 p-4 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{sublabel}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-lg p-1.5", color.replace("text-", "bg-") + "/10")}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <p className={cn("text-2xl font-bold tabular-nums", color)}>{value ?? "—"}</p>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-md mb-0.5",
              trend.positive ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
            )}
          >
            <TrendingUp className={cn("h-3 w-3", !trend.positive && "rotate-180")} />
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminSettingsTab")
  const {
    settingsSaved,
    settingsSaving,
    setSettingsSaving,
    setSettingsSaved,
    panelSettings,
    setPanelSettings,
    geoBlockMetricsLoading,
    setGeoBlockMetricsLoading,
    geoBlockMetricsError,
    geoBlockMetrics,
    setGeoBlockMetrics,
  } = ctx

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    geoMetrics: false,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSettingsSaving(true)
    setSettingsSaved(false)
    try {
      const data = await apiFetch(API_ENDPOINTS.adminSettings, {
        method: "PUT",
        body: JSON.stringify(panelSettings),
      })
      if (data?.settings) setPanelSettings(data.settings)
      try {
        const fresh = await apiFetch(API_ENDPOINTS.panelSettings)
        const toggles =
          fresh?.featureToggles ??
          data?.featureToggles ??
          data?.settings?.featureToggles ??
          panelSettings?.featureToggles
        if (fresh?.featureToggles && typeof fresh.featureToggles === "object") {
          setPanelSettings((s: any) => ({
            ...s,
            featureToggles: { ...(s.featureToggles || {}), ...(fresh.featureToggles || {}) },
          }))
        }
        window.dispatchEvent(new CustomEvent("panelSettingsUpdated", { detail: { featureToggles: toggles } }))
      } catch (err) {}
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
      setGeoBlockMetricsLoading(true)
      try {
        const m = await apiFetch("/api/admin/geo-block/metrics")
        setGeoBlockMetrics(m)
      } catch {
        // ignore
      } finally {
        setGeoBlockMetricsLoading(false)
      }
    } catch (e: any) {
      alert(e.message || t("alerts.failedToSaveSettings"))
    } finally {
      setSettingsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t("header.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("header.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {settingsSaved && (
            <div className="flex items-center gap-2 text-sm text-green-400 animate-in fade-in slide-in-from-right-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t("states.changesSaved")}</span>
            </div>
          )}
          <Button disabled={settingsSaving} onClick={handleSave} className="bg-primary text-primary-foreground shadow-sm" size="sm">
            {settingsSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("actions.saving")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("actions.saveSettings")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Toggles */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t("sections.quickToggles")}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToggleCard
            icon={panelSettings.registrationEnabled ? Unlock : Lock}
            label={t("toggles.registration.label")}
            description={
              panelSettings.registrationEnabled
                ? t("toggles.registration.enabled")
                : t("toggles.registration.disabled")
            }
            enabled={panelSettings.registrationEnabled}
            onToggle={() => setPanelSettings((s: any) => ({ ...s, registrationEnabled: !s.registrationEnabled }))}
            variant={panelSettings.registrationEnabled ? "success" : "danger"}
          />


          <ToggleCard
            icon={Shield}
            label={t("toggles.tempEmailFilter.label")}
            description={
              panelSettings.featureToggles?.tempEmailFilter
                ? t("toggles.tempEmailFilter.enabled")
                : t("toggles.tempEmailFilter.disabled")
            }
            enabled={!!panelSettings.featureToggles?.tempEmailFilter}
            onToggle={() =>
              setPanelSettings((s: any) => ({
                ...s,
                featureToggles: {
                  ...s.featureToggles,
                  tempEmailFilter: !s.featureToggles?.tempEmailFilter,
                },
              }))
            }
            variant="warning"
          />

          <ToggleCard
            icon={Shield}
            label={t("toggles.classicCaptcha.label")}
            description={
              panelSettings.featureToggles?.captcha
                ? t("toggles.classicCaptcha.enabled")
                : t("toggles.classicCaptcha.disabled")
            }
            enabled={!!panelSettings.featureToggles?.captcha}
            onToggle={() =>
              setPanelSettings((s: any) => ({
                ...s,
                featureToggles: {
                  ...s.featureToggles,
                  captcha: !s.featureToggles?.captcha,
                },
              }))
            }
            variant="success"
          />

          <ToggleCard
            icon={Shield}
            label={t("toggles.invisibleCaptcha.label")}
            description={
              panelSettings.featureToggles?.captchaInvisible
                ? t("toggles.invisibleCaptcha.enabled")
                : t("toggles.invisibleCaptcha.disabled")
            }
            enabled={!!panelSettings.featureToggles?.captchaInvisible}
            onToggle={() =>
              setPanelSettings((s: any) => ({
                ...s,
                featureToggles: {
                  ...s.featureToggles,
                  captchaInvisible: !s.featureToggles?.captchaInvisible,
                },
              }))
            }
            variant="success"
          />

          <ToggleCard
            icon={BarChart3}
            label={t("toggles.gamblingMode.label")}
            description={
              panelSettings.gamblingEnabled
                ? t("toggles.gamblingMode.enabled")
                : t("toggles.gamblingMode.disabled")
            }
            enabled={!!panelSettings.gamblingEnabled}
            onToggle={() =>
              setPanelSettings((s: any) => ({
                ...s,
                gamblingEnabled: !s.gamblingEnabled,
                featureToggles: {
                  ...s.featureToggles,
                  gambling: !s.gamblingEnabled,
                },
              }))
            }
            variant="warning"
          />
        </div>
      </div>

      {/* Feature Toggles Grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4 bg-gradient-to-r from-card to-secondary/20">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("sections.featureFlags")}</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "ai", label: t("featureFlags.ai.label"), note: t("featureFlags.ai.note") },
              { key: "billing", label: t("featureFlags.billing.label"), note: t("featureFlags.billing.note") },
              { key: "dns", label: t("featureFlags.dns.label"), note: t("featureFlags.dns.note") },
              { key: "ticketing", label: t("featureFlags.ticketing.label"), note: t("featureFlags.ticketing.note") },
              { key: "applications", label: t("featureFlags.applications.label"), note: t("featureFlags.applications.note") },
              { key: "oauth", label: t("featureFlags.oauth.label"), note: t("featureFlags.oauth.note") },
              { key: "tunnels", label: t("featureFlags.tunnels.label"), note: t("featureFlags.tunnels.note") },
              { key: "captcha", label: t("featureFlags.captcha.label"), note: t("featureFlags.captcha.note") },
              { key: "captchaInvisible", label: t("featureFlags.captchaInvisible.label"), note: t("featureFlags.captchaInvisible.note") },
            ].map((feature) => (
              <div
                key={feature.key}
                className={cn(
                  "rounded-lg border p-3 transition-all hover:shadow-sm",
                  panelSettings.featureToggles[feature.key]
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-secondary/20"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{feature.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.note}</p>
                  </div>
                  <button
                    onClick={() =>
                      setPanelSettings((s: any) => ({
                        ...s,
                        featureToggles: {
                          ...s.featureToggles,
                          [feature.key]: !s.featureToggles[feature.key],
                        },
                      }))
                    }
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 active:scale-95",
                      panelSettings.featureToggles[feature.key] ? "bg-primary" : "bg-secondary"
                    )}
                    role="switch"
                    aria-checked={panelSettings.featureToggles[feature.key]}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                        panelSettings.featureToggles[feature.key] ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gambling Chances */}
      {panelSettings.gamblingEnabled && (
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 border-b border-amber-500/20 px-5 py-4">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">{t("gambling.title")}</h3>
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {t("common.advanced")}
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {t("gambling.info")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{t("gambling.luckyRollChance")}</span>
                  <span className="text-amber-400 font-mono">{((panelSettings.gamblingResourceLuckyChance ?? 0.0777) * 100).toFixed(2)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={panelSettings.gamblingResourceLuckyChance ?? 0.0777}
                  onChange={(e) =>
                    setPanelSettings((s: any) => ({
                      ...s,
                      gamblingResourceLuckyChance: Number(e.target.value),
                    }))
                  }
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <p className="text-[11px] text-muted-foreground">{t("gambling.luckyRollHint")}</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{t("gambling.powerDenyChance")}</span>
                  <span className="text-red-400 font-mono">{((panelSettings.gamblingPowerDenyChance ?? 0.5) * 100).toFixed(2)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={panelSettings.gamblingPowerDenyChance ?? 0.5}
                  onChange={(e) =>
                    setPanelSettings((s: any) => ({
                      ...s,
                      gamblingPowerDenyChance: Number(e.target.value),
                    }))
                  }
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <p className="text-[11px] text-muted-foreground">{t("gambling.powerDenyHint")}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration Notice */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4 bg-gradient-to-r from-card to-secondary/20">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {panelSettings.registrationEnabled ? t("registration.titleEnabled") : t("registration.titleDisabled")}
          </h3>
          {!panelSettings.registrationEnabled && (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              {t("common.required")}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <textarea
              rows={3}
              value={panelSettings.registrationNotice}
              onChange={(e) => setPanelSettings((s: any) => ({ ...s, registrationNotice: e.target.value }))}
              placeholder={
                panelSettings.registrationEnabled
                  ? t("registration.placeholderEnabled")
                  : t("registration.placeholderDisabled")
              }
              className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {panelSettings.registrationEnabled
                ? t("registration.hintEnabled")
                : t("registration.hintDisabled")}
            </p>
          </div>

          {/* Preview */}
          {(panelSettings.registrationNotice || !panelSettings.registrationEnabled) && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Live Preview</p>
              </div>
              {!panelSettings.registrationEnabled ? (
                <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 animate-in fade-in slide-in-from-bottom-1">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-yellow-300">{t("registration.unavailableTitle")}</p>
                    {panelSettings.registrationNotice && (
                      <p className="mt-1.5 text-sm text-yellow-200/90 leading-relaxed">{panelSettings.registrationNotice}</p>
                    )}
                  </div>
                </div>
              ) : panelSettings.registrationNotice ? (
                <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 animate-in fade-in slide-in-from-bottom-1">
                  <Info className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
                  <p className="text-sm text-blue-300 leading-relaxed">{panelSettings.registrationNotice}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Billing & Tax */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4 bg-gradient-to-r from-card to-secondary/20">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("billing.title")}</h3>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("billing.currencyLabel")}</label>
              <input
                value={panelSettings.billingCurrency || "USD"}
                onChange={(e) =>
                  setPanelSettings((s: any) => ({
                    ...s,
                    billingCurrency: e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3),
                  }))
                }
                placeholder="USD"
                maxLength={3}
                className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all uppercase"
              />
              <p className="text-xs text-muted-foreground">{t("billing.currencyExamples")}</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("billing.quickExamples")}</label>
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <code className="px-1.5 py-0.5 rounded bg-secondary/80 text-foreground font-mono text-[11px]">eu:20</code> → 20% for
                  all EU countries
                </p>
                <p>
                  <code className="px-1.5 py-0.5 rounded bg-secondary/80 text-foreground font-mono text-[11px]">de:19</code> → 19% for
                  Germany
                </p>
                <p>
                  <code className="px-1.5 py-0.5 rounded bg-secondary/80 text-foreground font-mono text-[11px]">*:0</code> or{" "}
                  <code className="px-1.5 py-0.5 rounded bg-secondary/80 text-foreground font-mono text-[11px]">default:0</code> →
                  fallback
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("billing.taxRulesLabel")}
            </label>
            <textarea
              rows={5}
              value={panelSettings.billingTaxRules || ""}
              onChange={(e) => setPanelSettings((s: any) => ({ ...s, billingTaxRules: e.target.value }))}
              placeholder={"eu:20\nde:19\nfr:20\ndefault:0"}
              className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 resize-y transition-all"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Supported keys: country code (e.g. <code className="text-foreground">DE</code>), country name,{" "}
              <code className="text-foreground">EU</code>, <code className="text-foreground">*</code>, or{" "}
              <code className="text-foreground">default</code>. One rule per line.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("billing.ageRulesLabel")}
            </label>
            <textarea
              rows={5}
              value={panelSettings.countryAgeRules || ""}
              onChange={(e) => setPanelSettings((s: any) => ({ ...s, countryAgeRules: e.target.value }))}
              placeholder={"us:13\ngb:14\neu:14\ndefault:13"}
              className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 resize-y transition-all"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("billing.ageRulesHint")}
            </p>
          </div>
        </div>
      </div>

      {/* Geo-Block Rules */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-gradient-to-r from-card to-secondary/20">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{t("geoRules.title")}</h3>
          </div>
          {(() => {
            const entries = panelSettings.geoBlockCountries
              ? panelSettings.geoBlockCountries.split(",").map((s: string) => s.trim()).filter(Boolean)
              : []
            return entries.length > 0 ? (
              <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                {t("geoRules.ruleCount", { count: entries.length })}
              </span>
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">
                {t("geoRules.noRules")}
              </span>
            )
          })()}
        </div>
        <div className="flex flex-col gap-0 divide-y divide-border">
          {(() => {
            const [newCountry, setNewCountry] = React.useState("")
            const [newLevel, setNewLevel] = React.useState("2")
            const [searchFilter, setSearchFilter] = React.useState("")

            const levelConfig: Record<
              string,
              {
                label: string
                shortLabel: string
                color: string
                bgColor: string
                borderColor: string
                description: string
              }
            > = {
              "1": {
                label: "ID Verification Block",
                shortLabel: "ID",
                color: "text-blue-400",
                bgColor: "bg-blue-500/10",
                borderColor: "border-blue-500/30",
                description: "Blocks identity verification services",
              },
              "2": {
                label: "Free Tier Block",
                shortLabel: "Free",
                color: "text-yellow-400",
                bgColor: "bg-yellow-500/10",
                borderColor: "border-yellow-500/30",
                description: "Blocks access to free tier services",
              },
              "3": {
                label: "Educational + Free Block",
                shortLabel: "Edu+Free",
                color: "text-orange-400",
                bgColor: "bg-orange-500/10",
                borderColor: "border-orange-500/30",
                description: "Blocks educational and free tier access",
              },
              "4": {
                label: "All Services (Subuser Only)",
                shortLabel: "All Svc",
                color: "text-red-400",
                bgColor: "bg-red-500/10",
                borderColor: "border-red-500/30",
                description: "Blocks all services except subuser access",
              },
              "5": {
                label: "Complete Registration Block",
                shortLabel: "Reg Block",
                color: "text-red-500",
                bgColor: "bg-red-500/15",
                borderColor: "border-red-500/40",
                description: "Completely blocks new registrations",
              },
            }

            const entries: { country: string; level: string }[] = panelSettings.geoBlockCountries
              ? panelSettings.geoBlockCountries
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean)
                  .map((s: string) => {
                    const [country, level] = s.split(":")
                    return { country: country?.toUpperCase() || "", level: level || "0" }
                  })
                  .filter((e: { country: string }) => e.country.length === 2)
              : []

            const filteredEntries = searchFilter ? entries.filter((e) => e.country.includes(searchFilter.toUpperCase())) : entries

            const updateEntries = (newEntries: { country: string; level: string }[]) => {
              const str = newEntries.map((e) => `${e.country.toLowerCase()}:${e.level}`).join(",")
              setPanelSettings((s: any) => ({ ...s, geoBlockCountries: str }))
            }

            const addEntry = () => {
              const code = newCountry.trim().toUpperCase()
              if (code.length !== 2) return
              if (entries.some((e) => e.country === code)) {
                updateEntries(entries.map((e) => (e.country === code ? { ...e, level: newLevel } : e)))
              } else {
                updateEntries([...entries, { country: code, level: newLevel }])
              }
              setNewCountry("")
            }

            const removeEntry = (country: string) => {
              updateEntries(entries.filter((e) => e.country !== country))
            }

            const updateLevel = (country: string, level: string) => {
              updateEntries(entries.map((e) => (e.country === country ? { ...e, level } : e)))
            }

            return (
              <>
                {/* Level Reference */}
                <div className="px-5 py-4 bg-secondary/10">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    {t("geoRules.restrictionLevels")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(levelConfig).map(([lvl, config]) => (
                      <div
                        key={lvl}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border transition-all hover:shadow-sm cursor-help",
                          config.bgColor,
                          config.borderColor,
                          config.color
                        )}
                        title={config.description}
                      >
                        <span className="font-mono font-bold text-base">{lvl}</span>
                        <span className="opacity-90">{config.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Country */}
                <div className="px-5 py-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <input
                        type="text"
                        maxLength={2}
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && addEntry()}
                        placeholder="CC"
                        className="w-full sm:w-20 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 uppercase font-mono text-center transition-all"
                      />
                    </div>
                    <select
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
                    >
                      {Object.entries(levelConfig).map(([lvl, config]) => (
                        <option key={lvl} value={lvl}>
                          Level {lvl} — {config.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={newCountry.trim().length !== 2}
                      onClick={addEntry}
                      className="bg-primary text-primary-foreground shadow-sm w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {t("geoRules.addRule")}
                    </Button>
                  </div>
                  {newCountry.length === 2 && entries.some((e) => e.country === newCountry.toUpperCase()) && (
                    <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                      <p className="text-xs text-yellow-300">
                        {t("geoRules.updateExisting", { country: newCountry.toUpperCase() })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rules List */}
                <div className="px-5 py-4">
                  {entries.length > 0 ? (
                    <div className="space-y-4">
                      {/* Search */}
                      {entries.length > 5 && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value.replace(/[^a-zA-Z]/g, ""))}
                            placeholder="Filter by country code…"
                            className="w-full rounded-lg border border-border bg-secondary/50 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      )}

                      {/* Rules grid */}
                      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="max-h-80 overflow-y-auto">
                          {filteredEntries.length === 0 ? (
                            <div className="py-12 text-center">
                              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">{t("geoRules.noMatchingCountries")}</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {filteredEntries
                                .sort((a, b) => a.country.localeCompare(b.country))
                                .map((entry) => {
                                  const config = levelConfig[entry.level] || levelConfig["1"]
                                  return (
                                    <div
                                      key={entry.country}
                                      className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors group"
                                    >
                                      {/* Country Badge */}
                                      <div className="flex items-center justify-center w-12 h-10 rounded-lg bg-gradient-to-br from-secondary/80 to-secondary/50 border border-border shadow-sm">
                                        <span className="text-sm font-mono font-bold text-foreground tracking-wider">
                                          {entry.country}
                                        </span>
                                      </div>

                                      {/* Level Badge */}
                                      <div className="flex-1 min-w-0">
                                        <span
                                          className={cn(
                                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border",
                                            config.bgColor,
                                            config.borderColor,
                                            config.color
                                          )}
                                        >
                                          <span className="font-mono text-sm">{entry.level}</span>
                                          <span>{config.shortLabel}</span>
                                        </span>
                                      </div>

                                      {/* Level Selector */}
                                      <select
                                        value={entry.level}
                                        onChange={(e) => updateLevel(entry.country, e.target.value)}
                                        className="rounded-lg border border-border bg-secondary/50 text-sm text-foreground outline-none cursor-pointer hover:border-primary/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 px-3 py-1.5 transition-all"
                                      >
                                        {Object.entries(levelConfig).map(([lvl, c]) => (
                                          <option key={lvl} value={lvl}>
                                            {lvl} — {c.label}
                                          </option>
                                        ))}
                                      </select>

                                      {/* Remove Button */}
                                      <button
                                        onClick={() => removeEntry(entry.country)}
                                        className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                        title={`Remove ${entry.country}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )
                                })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Summary Footer */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                        <span className="font-medium">
                          {t("geoRules.blockedCount", { count: entries.length })}
                        </span>
                        {entries.length > 0 && (
                          <button
                            onClick={() => {
                              if (confirm(t("geoRules.confirmRemoveAll", { count: entries.length }))) {
                                setPanelSettings((s: any) => ({ ...s, geoBlockCountries: "" }))
                              }
                            }}
                            className="text-destructive/70 hover:text-destructive transition-colors font-medium"
                          >
                            {t("geoRules.clearAll")}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 gap-3">
                      <Globe className="h-12 w-12 text-muted-foreground/30" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">{t("geoRules.noneConfigured")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("geoRules.noneConfiguredHint")}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Raw Value */}
                <details className="group">
                  <summary className="flex items-center gap-2 px-5 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground hover:bg-secondary/20 transition-colors select-none">
                    <Code className="h-4 w-4" />
                    {t("geoRules.rawConfig")}
                    <ChevronDown className="h-4 w-4 ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-4">
                    <textarea
                      rows={3}
                      value={panelSettings.geoBlockCountries}
                      onChange={(e) => setPanelSettings((s: any) => ({ ...s, geoBlockCountries: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                      placeholder="de:2,fr:3,ru:5"
                    />
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Format: <code className="text-foreground">country:level,country:level</code>
                    </p>
                  </div>
                </details>
              </>
            )
          })()}
        </div>
      </div>

      {/* Geo-Block Metrics */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("geoMetrics")}
          className="flex items-center justify-between gap-3 w-full px-5 py-4 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{t("geoMetrics.title")}</span>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.geoMetrics && "rotate-180")}
          />
        </button>
        {expandedSections.geoMetrics && (
          <div className="border-t border-border animate-in slide-in-from-top-2">
            <div className="p-5">
              {geoBlockMetricsLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">{t("geoMetrics.loading")}</p>
                </div>
              ) : geoBlockMetricsError ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{t("geoMetrics.failedToLoad")}</p>
                    <p className="text-xs text-destructive/80 mt-1">{geoBlockMetricsError}</p>
                  </div>
                </div>
              ) : geoBlockMetrics ? (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard label={t("geoMetrics.cards.totalUsers")} value={geoBlockMetrics.totalUsers} icon={Users} color="text-primary" />
                    <StatCard
                      label={t("geoMetrics.cards.regBlocked")}
                      sublabel={t("geoMetrics.levelGte5")}
                      value={geoBlockMetrics.blocked.registration}
                      color="text-red-400"
                    />
                    <StatCard
                      label={t("geoMetrics.cards.idBlocked")}
                      sublabel={t("geoMetrics.levelGte1")}
                      value={geoBlockMetrics.blocked.idVerification}
                      color="text-blue-400"
                    />
                    <StatCard label={t("geoMetrics.cards.freeBlocked")} sublabel={t("geoMetrics.levelGte2")} value={geoBlockMetrics.blocked.free} color="text-yellow-400" />
                    <StatCard
                      label={t("geoMetrics.cards.eduBlocked")}
                      sublabel={t("geoMetrics.levelGte3")}
                      value={geoBlockMetrics.blocked.educational}
                      color="text-orange-400"
                    />
                    <StatCard
                      label={t("geoMetrics.cards.subuserOnly")}
                      sublabel={t("geoMetrics.level4")}
                      value={geoBlockMetrics.blocked.subuserOnly}
                      color="text-red-400"
                    />
                  </div>

                  {/* Per-Country Breakdown */}
                  {geoBlockMetrics.byCountry && Object.keys(geoBlockMetrics.byCountry).length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users by Country</h4>
                      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 bg-secondary/40 border-b border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Code</p>
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Distribution</p>
                          <p className="text-xs font-semibold text-muted-foreground uppercase text-right">Level</p>
                        </div>
                        <div className="max-h-96 overflow-y-auto divide-y divide-border">
                          {Object.entries(geoBlockMetrics.byCountry)
                            .sort(([, a]: any, [, b]: any) => (b.users || 0) - (a.users || 0))
                            .map(([country, stats]: any) => (
                              <div
                                key={country}
                                className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-secondary/20 transition-colors"
                              >
                                <div className="flex items-center justify-center w-10 h-7 rounded-lg bg-gradient-to-br from-secondary/80 to-secondary/50 border border-border">
                                  <span className="text-xs font-mono font-bold text-foreground">{country.toUpperCase()}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-semibold text-foreground tabular-nums w-12">{stats.users}</span>
                                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all"
                                      style={{ width: `${Math.min(100, (stats.users / geoBlockMetrics.totalUsers) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                                    {((stats.users / geoBlockMetrics.totalUsers) * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <span className="text-xs font-mono font-medium text-muted-foreground">
                                  {stats.minLevel === stats.maxLevel ? `L${stats.minLevel}` : `L${stats.minLevel}–${stats.maxLevel}`}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">{t("geoMetrics.noMetrics")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("geoMetrics.noMetricsHint")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sticky Save Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl pointer-events-auto">
          {settingsSaved && (
            <div className="flex items-center gap-2 text-sm text-green-400 animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t("states.saved")}</span>
            </div>
          )}
          <div className="flex-1" />
          <Button disabled={settingsSaving} onClick={handleSave} className="bg-primary text-primary-foreground shadow-lg" size="sm">
            {settingsSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("actions.saving")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("actions.save")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}