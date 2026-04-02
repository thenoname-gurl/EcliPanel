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
} from "lucide-react"

export default function SettingsTab({ ctx }: { ctx: any }) {
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

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Panel Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure registration, services, and access restrictions.</p>
        </div>
        <div className="flex items-center gap-3">
          {settingsSaved && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 animate-in fade-in slide-in-from-right-2">
              <Check className="h-3.5 w-3.5" />
              <span>Saved</span>
            </div>
          )}
          <Button
            disabled={settingsSaving}
            onClick={async () => {
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
                alert(e.message || "Failed to save settings")
              } finally {
                setSettingsSaving(false)
              }
            }}
            className="bg-primary text-primary-foreground"
            size="sm"
          >
            {settingsSaving ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Toggles Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Registration Toggle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-lg p-2 ${panelSettings.registrationEnabled ? "bg-green-500/10" : "bg-red-500/10"}`}
              >
                <UserPlus className={`h-4 w-4 ${panelSettings.registrationEnabled ? "text-green-400" : "text-red-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Registration</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {panelSettings.registrationEnabled ? "New users can sign up" : "Sign-ups are blocked (HTTP 503)"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPanelSettings((s: any) => ({ ...s, registrationEnabled: !s.registrationEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                panelSettings.registrationEnabled ? "bg-green-500" : "bg-secondary"
              }`}
              role="switch"
              aria-checked={panelSettings.registrationEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  panelSettings.registrationEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Code Instances Toggle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-lg p-2 ${panelSettings.codeInstancesEnabled ? "bg-green-500/10" : "bg-red-500/10"}`}
              >
                <FileCode className={`h-4 w-4 ${panelSettings.codeInstancesEnabled ? "text-green-400" : "text-red-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Code Instances</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {panelSettings.codeInstancesEnabled ? "Users can create instances" : "Creation blocked for non-admins"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setPanelSettings((s: any) => ({
                  ...s,
                  codeInstancesEnabled: !s.codeInstancesEnabled,
                  featureToggles: {
                    ...s.featureToggles,
                    codeInstances: !s.featureToggles?.codeInstances,
                  },
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                panelSettings.codeInstancesEnabled ? "bg-green-500" : "bg-secondary"
              }`}
              role="switch"
              aria-checked={panelSettings.codeInstancesEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  panelSettings.codeInstancesEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Temp Email Filter Toggle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-lg p-2 ${panelSettings.featureToggles?.tempEmailFilter ? "bg-green-500/10" : "bg-red-500/10"}`}
              >
                <Shield className={`h-4 w-4 ${panelSettings.featureToggles?.tempEmailFilter ? "text-green-400" : "text-red-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Temp Email Filter</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {panelSettings.featureToggles?.tempEmailFilter ? "Disposable emails are blocked" : "Disposable emails are allowed"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setPanelSettings((s: any) => ({
                  ...s,
                  featureToggles: {
                    ...s.featureToggles,
                    tempEmailFilter: !s.featureToggles?.tempEmailFilter,
                  },
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                panelSettings.featureToggles?.tempEmailFilter ? "bg-green-500" : "bg-secondary"
              }`}
              role="switch"
              aria-checked={panelSettings.featureToggles?.tempEmailFilter}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  panelSettings.featureToggles?.tempEmailFilter ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Captcha Toggle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-lg p-2 ${panelSettings.featureToggles?.captcha ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <Shield className={`h-4 w-4 ${panelSettings.featureToggles?.captcha ? "text-green-400" : "text-red-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Captcha</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {panelSettings.featureToggles?.captcha
                    ? "Classic captcha for registration is enabled"
                    : "Classic captcha for registration is disabled"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setPanelSettings((s: any) => ({
                  ...s,
                  featureToggles: {
                    ...s.featureToggles,
                    captcha: !s.featureToggles?.captcha,
                  },
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                panelSettings.featureToggles?.captcha ? "bg-green-500" : "bg-secondary"
              }`}
              role="switch"
              aria-checked={panelSettings.featureToggles?.captcha}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  panelSettings.featureToggles?.captcha ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Invisible Captcha Toggle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-lg p-2 ${panelSettings.featureToggles?.captchaInvisible ? "bg-green-500/10" : "bg-red-500/10"}`}
              >
                <Shield
                  className={`h-4 w-4 ${panelSettings.featureToggles?.captchaInvisible ? "text-green-400" : "text-red-400"}`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Invisible Captcha</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {panelSettings.featureToggles?.captchaInvisible
                    ? "Invisible captcha path is enabled"
                    : "Invisible captcha path is disabled"}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setPanelSettings((s: any) => ({
                  ...s,
                  featureToggles: {
                    ...s.featureToggles,
                    captchaInvisible: !s.featureToggles?.captchaInvisible,
                  },
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                panelSettings.featureToggles?.captchaInvisible ? "bg-green-500" : "bg-secondary"
              }`}
              role="switch"
              aria-checked={panelSettings.featureToggles?.captchaInvisible}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                  panelSettings.featureToggles?.captchaInvisible ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 col-span-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: "ai", label: "AI", note: "AI control plane and models" },
              { key: "billing", label: "Billing", note: "Order and plan management" },
              { key: "dns", label: "DNS", note: "Organisation DNS zone management" },
              { key: "ticketing", label: "Ticketing", note: "Support tickets and chat logs" },
              { key: "oauth", label: "OAuth", note: "OAuth client and token server" },
              { key: "codeInstances", label: "Code Instances", note: "Temporary code-server access" },
              { key: "captcha", label: "Captcha", note: "Simple image captcha for registration" },
              {
                key: "captchaInvisible",
                label: "Invisible Captcha",
                note: "Behaviour-based challenge for registration (no explicit user input)",
              },
            ].map((t) => (
              <div key={t.key} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.note}</p>
                  </div>
                  <button
                    onClick={() =>
                      setPanelSettings((s: any) => ({
                        ...s,
                        featureToggles: {
                          ...s.featureToggles,
                          [t.key]: !s.featureToggles[t.key],
                        },
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      panelSettings.featureToggles[t.key] ? "bg-green-500" : "bg-secondary"
                    }`}
                    role="switch"
                    aria-checked={panelSettings.featureToggles[t.key]}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                        panelSettings.featureToggles[t.key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Registration Notice */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageSquare className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">
            {panelSettings.registrationEnabled ? "Registration Notice" : "Registration Disabled Message"}
          </p>
          {!panelSettings.registrationEnabled && (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              Required
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-3">
          <textarea
            rows={2}
            value={panelSettings.registrationNotice}
            onChange={(e) => setPanelSettings((s: any) => ({ ...s, registrationNotice: e.target.value }))}
            placeholder={
              panelSettings.registrationEnabled
                ? "e.g. This is a development build. Data may be reset."
                : "e.g. Registration is temporarily closed for maintenance."
            }
            className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
          />
          <p className="text-[11px] text-muted-foreground">
            {panelSettings.registrationEnabled
              ? "Optional info banner shown on the login/register page."
              : "Shown to users who try to access the registration page."}
          </p>

          {/* Preview */}
          {(panelSettings.registrationNotice || !panelSettings.registrationEnabled) && (
            <div className="flex flex-col gap-1.5 pt-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Live Preview</p>
              {!panelSettings.registrationEnabled ? (
                <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-300">Registration is currently unavailable</p>
                    {panelSettings.registrationNotice && (
                      <p className="mt-1 text-sm text-yellow-200/80">{panelSettings.registrationNotice}</p>
                    )}
                  </div>
                </div>
              ) : panelSettings.registrationNotice ? (
                <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                  <Eye className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <p className="text-sm text-blue-300">{panelSettings.registrationNotice}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Geo-Block Card — Redesigned */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Geo-Block Rules</p>
          </div>
          {(() => {
            const entries = panelSettings.geoBlockCountries
              ? panelSettings.geoBlockCountries.split(",").map((s: string) => s.trim()).filter(Boolean)
              : []
            return entries.length > 0 ? (
              <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                {entries.length} {entries.length === 1 ? "rule" : "rules"} active
              </span>
            ) : null
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
                label: "ID Block",
                shortLabel: "ID",
                color: "text-blue-400",
                bgColor: "bg-blue-500/10",
                borderColor: "border-blue-500/20",
                description: "Blocks identity verification",
              },
              "2": {
                label: "Free Block",
                shortLabel: "Free",
                color: "text-yellow-400",
                bgColor: "bg-yellow-500/10",
                borderColor: "border-yellow-500/20",
                description: "Blocks free tier services",
              },
              "3": {
                label: "Edu + Free Block",
                shortLabel: "Edu+Free",
                color: "text-orange-400",
                bgColor: "bg-orange-500/10",
                borderColor: "border-orange-500/20",
                description: "Blocks educational and free tiers",
              },
              "4": {
                label: "All Services (subuser)",
                shortLabel: "All Svc",
                color: "text-red-400",
                bgColor: "bg-red-500/10",
                borderColor: "border-red-500/20",
                description: "Blocks all services except subuser access",
              },
              "5": {
                label: "Registration Block",
                shortLabel: "Reg Block",
                color: "text-red-500",
                bgColor: "bg-red-500/15",
                borderColor: "border-red-500/30",
                description: "Completely blocks registration from this country",
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
                {/* Level Reference — Horizontal pills */}
                <div className="px-4 py-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
                    Restriction Levels
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(levelConfig).map(([lvl, config]) => (
                      <div
                        key={lvl}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${config.bgColor} ${config.borderColor} ${config.color}`}
                        title={config.description}
                      >
                        <span className="font-mono font-bold">{lvl}</span>
                        <span className="opacity-80">{config.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Country — Compact inline form */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <input
                        type="text"
                        maxLength={2}
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && addEntry()}
                        placeholder="CC"
                        className="w-16 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 uppercase font-mono text-center transition-colors"
                      />
                    </div>
                    <select
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 cursor-pointer transition-colors"
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
                      className="bg-primary text-primary-foreground shrink-0 gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  {newCountry.length === 2 && entries.some((e) => e.country === newCountry.toUpperCase()) && (
                    <p className="text-[11px] text-yellow-400 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      This will update the existing rule for {newCountry.toUpperCase()}
                    </p>
                  )}
                </div>

                {/* Rules List */}
                <div className="px-4 py-3">
                  {entries.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {/* Search/filter when many rules */}
                      {entries.length > 5 && (
                        <div className="relative mb-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value.replace(/[^a-zA-Z]/g, ""))}
                            placeholder="Filter countries…"
                            className="w-full rounded-lg border border-border bg-secondary/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                          />
                        </div>
                      )}

                      {/* Rules grid */}
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          {filteredEntries.length === 0 ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">No matching countries</div>
                          ) : (
                            <div className="divide-y divide-border">
                              {filteredEntries
                                .sort((a, b) => a.country.localeCompare(b.country))
                                .map((entry) => {
                                  const config = levelConfig[entry.level] || levelConfig["1"]
                                  return (
                                    <div
                                      key={entry.country}
                                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors group"
                                    >
                                      {/* Country code with flag-like styling */}
                                      <div className="flex items-center justify-center w-10 h-8 rounded-md bg-secondary/60 border border-border">
                                        <span className="text-sm font-mono font-bold text-foreground tracking-wide">
                                          {entry.country}
                                        </span>
                                      </div>

                                      {/* Level badge */}
                                      <div className="flex-1 min-w-0">
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                            config.bgColor
                                          } ${config.borderColor} ${config.color}`}
                                        >
                                          <span className="font-mono">{entry.level}</span>
                                          <span className="hidden sm:inline">{config.shortLabel}</span>
                                        </span>
                                      </div>

                                      {/* Level selector */}
                                      <select
                                        value={entry.level}
                                        onChange={(e) => updateLevel(entry.country, e.target.value)}
                                        className="rounded-md border border-border bg-secondary/50 text-xs text-foreground outline-none cursor-pointer hover:border-primary/40 focus:border-primary/50 px-2 py-1 transition-colors"
                                      >
                                        {Object.entries(levelConfig).map(([lvl, c]) => (
                                          <option key={lvl} value={lvl}>
                                            {lvl} — {c.label}
                                          </option>
                                        ))}
                                      </select>

                                      {/* Remove button */}
                                      <button
                                        onClick={() => removeEntry(entry.country)}
                                        className="p-1.5 rounded-md opacity-40 hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                        title={`Remove ${entry.country}`}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )
                                })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Summary footer */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                        <span>
                          {entries.length} {entries.length === 1 ? "country" : "countries"} blocked
                        </span>
                        {entries.length > 0 && (
                          <button
                            onClick={() => {
                              if (confirm(`Remove all ${entries.length} geo-block rules?`)) {
                                setPanelSettings((s: any) => ({ ...s, geoBlockCountries: "" }))
                              }
                            }}
                            className="text-destructive/60 hover:text-destructive transition-colors"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 gap-2">
                      <Globe className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No geo-block rules</p>
                      <p className="text-xs text-muted-foreground/60">Add a country code above to get started</p>
                    </div>
                  )}
                </div>

                {/* Raw value */}
                <details className="group">
                  <summary className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground hover:bg-secondary/20 transition-colors select-none">
                    <Code className="h-3 w-3" />
                    Raw value
                    <ChevronDown className="h-3 w-3 ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-3">
                    <textarea
                      rows={2}
                      value={panelSettings.geoBlockCountries}
                      onChange={(e) => setPanelSettings((s: any) => ({ ...s, geoBlockCountries: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none transition-colors"
                      placeholder="de:2,fr:3,ru:5"
                    />
                  </div>
                </details>
              </>
            )
          })()}
        </div>
      </div>

      {/* Geo-Block Metrics — Standalone card */}
      <div className="rounded-xl border border-border bg-card">
        <button
          onClick={() => {
            const el = document.getElementById("geo-metrics-content")
            if (el) el.classList.toggle("hidden")
            const chevron = document.getElementById("geo-metrics-chevron")
            if (chevron) chevron.classList.toggle("rotate-180")
          }}
          className="flex items-center justify-between gap-2 w-full px-4 py-3 hover:bg-secondary/20 transition-colors rounded-t-xl"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Geo-Block Impact & Metrics</span>
          </div>
          <ChevronDown id="geo-metrics-chevron" className="h-4 w-4 text-muted-foreground transition-transform" />
        </button>
        <div id="geo-metrics-content" className="hidden border-t border-border">
          <div className="p-4">
            {geoBlockMetricsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading metrics…</p>
              </div>
            ) : geoBlockMetricsError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-destructive">{geoBlockMetricsError}</p>
              </div>
            ) : geoBlockMetrics ? (
              <div className="flex flex-col gap-5">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Total Users", value: geoBlockMetrics.totalUsers, icon: Users, color: "text-foreground", iconColor: "text-primary" },
                    {
                      label: "Reg. Blocked",
                      sublabel: "Level ≥ 5",
                      value: geoBlockMetrics.blocked.registration,
                      color: "text-red-400",
                      iconColor: "text-red-400",
                    },
                    {
                      label: "ID Blocked",
                      sublabel: "Level ≥ 1",
                      value: geoBlockMetrics.blocked.idVerification,
                      color: "text-blue-400",
                      iconColor: "text-blue-400",
                    },
                    {
                      label: "Free Blocked",
                      sublabel: "Level ≥ 2",
                      value: geoBlockMetrics.blocked.free,
                      color: "text-yellow-400",
                      iconColor: "text-yellow-400",
                    },
                    {
                      label: "Edu Blocked",
                      sublabel: "Level ≥ 3",
                      value: geoBlockMetrics.blocked.educational,
                      color: "text-orange-400",
                      iconColor: "text-orange-400",
                    },
                    {
                      label: "Subuser Only",
                      sublabel: "Level 4",
                      value: geoBlockMetrics.blocked.subuserOnly,
                      color: "text-red-400",
                      iconColor: "text-red-400",
                    },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-lg border border-border bg-secondary/20 px-3 py-3 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
                        {stat.sublabel && <span className="text-[9px] text-muted-foreground/60 font-mono">{stat.sublabel}</span>}
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value ?? "—"}</p>
                    </div>
                  ))}
                </div>

                {/* Per-country breakdown */}
                {geoBlockMetrics.byCountry && Object.keys(geoBlockMetrics.byCountry).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Users by Country</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[56px_1fr_60px] gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase">Code</p>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase">Users</p>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase text-right">Level</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-border">
                        {Object.entries(geoBlockMetrics.byCountry)
                          .sort(([, a]: any, [, b]: any) => (b.users || 0) - (a.users || 0))
                          .map(([country, stats]: any) => (
                            <div
                              key={country}
                              className="grid grid-cols-[56px_1fr_60px] gap-2 items-center px-3 py-2 hover:bg-secondary/20 transition-colors"
                            >
                              <div className="flex items-center justify-center w-9 h-6 rounded bg-secondary/60 border border-border">
                                <span className="text-xs font-mono font-bold text-foreground">{country.toUpperCase()}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground tabular-nums">{stats.users}</span>
                                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[140px]">
                                  <div
                                    className="h-full bg-primary/70 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, (stats.users / geoBlockMetrics.totalUsers) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {((stats.users / geoBlockMetrics.totalUsers) * 100).toFixed(1)}%
                                </span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground text-right">
                                {stats.minLevel === stats.maxLevel ? stats.minLevel : `${stats.minLevel}–${stats.maxLevel}`}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Save settings to generate impact metrics</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky save bar for mobile */}
      <div className="sm:hidden sticky bottom-4 z-10">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-lg">
          {settingsSaved && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Check className="h-3.5 w-3.5" />
              <span>Saved</span>
            </div>
          )}
          <div className="flex-1" />
          <Button
            disabled={settingsSaving}
            onClick={async () => {
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
                alert(e.message || "Failed to save settings")
              } finally {
                setSettingsSaving(false)
              }
            }}
            className="bg-primary text-primary-foreground"
            size="sm"
          >
            {settingsSaving ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
