"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { LoadingState, SectionHeader } from "./serverTabShared"
import { cn } from "@/lib/utils"
import {
  Loader2,
  Plus,
  Trash2,
  Shield,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface FirewallRule {
  action?: "allow" | "deny"
  protocols?: string[]
  sources?: string[]
  ports?: number[]
  source_file?: string
}

interface NativeFirewallTabProps {
  serverId: string
}

function FriendlyRule({ rule, t }: { rule: FirewallRule; t: (k: string, v?: Record<string, any>) => any }) {
  const actionLabel = rule.action === "deny" ? t("nativeFirewall.deny") : t("nativeFirewall.allow")
  const protos = Array.isArray(rule.protocols) && rule.protocols.length ? rule.protocols.join("/") : t("nativeFirewall.allProtocols")
  const sources = Array.isArray(rule.sources) && rule.sources.length ? rule.sources.join(", ") : t("nativeFirewall.allSources")
  const ports = Array.isArray(rule.ports) && rule.ports.length ? rule.ports.join(", ") : t("nativeFirewall.allPorts")
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span className={cn("font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded",
        rule.action === "deny" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400")}>
        {actionLabel}
      </span>
      <span className="text-muted-foreground">
        {protos} · {ports} · {t("nativeFirewall.from")} {sources}
      </span>
    </span>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function NativeFirewallTab({ serverId }: NativeFirewallTabProps) {
  const t = useTranslations("serverDetailPage")

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Firewall
  const [rules, setRules] = useState<FirewallRule[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fw = await apiFetch(API_ENDPOINTS.serverFirewall.replace(":id", serverId))
      setRules(Array.isArray((fw as any)?.rules) ? (fw as any).rules : [])
    } catch (e: any) {
      setError(e?.message || t("nativeFirewall.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [serverId, t])

  useEffect(() => {
    load()
  }, [load])

  const saveAll = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch(API_ENDPOINTS.serverFirewall.replace(":id", serverId), {
        method: "PUT",
        body: JSON.stringify({ rules }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e?.message || t("nativeFirewall.saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  const updateRule = (idx: number, patch: Partial<FirewallRule>) => {
    setRules(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeRule = (idx: number) => {
    setRules(prev => prev.filter((_, i) => i !== idx))
  }

  const addRule = () => {
    setRules(prev => [...prev, { action: "allow", protocols: ["tcp", "udp"], sources: [], ports: [] }])
  }

  const validPorts = useCallback((value: string): number[] => {
    return value.split(",").map(s => s.trim()).filter(Boolean)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0 && n <= 65535)
  }, [])

  const toggleProtocol = (idx: number, proto: string) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const cur = Array.isArray(r.protocols) ? r.protocols : []
      const next = cur.includes(proto) ? cur.filter(p => p !== proto) : [...cur, proto]
      if (next.length === 0) next.push("tcp")
      return { ...r, protocols: next }
    }))
  }

  if (loading) return <LoadingState message={t("nativeFirewall.loading")} />

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 min-w-0 overflow-hidden">
      <SectionHeader
        title={t("nativeFirewall.firewallTitle")}
        icon={Shield}
        action={
          <Button size="sm" onClick={saveAll} disabled={busy} className="gap-1.5" data-telemetry="servers:savefirewall">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
            {saved ? t("nativeFirewall.saved") : t("nativeFirewall.save")}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 🔥 Native Firewall Rules */}
      <div className="border border-border bg-secondary/5 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              {t("nativeFirewall.rulesTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("nativeFirewall.rulesHint")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={addRule} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("nativeFirewall.addRule")}
          </Button>
        </div>

        <div className="divide-y divide-border/60">
          {rules.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("nativeFirewall.noRules")}
            </div>
          ) : (
            rules.map((rule, idx) => (
              <div key={idx} className="px-4 py-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <FriendlyRule rule={rule} t={t} />
                  </div>
                  <button
                    onClick={() => removeRule(idx)}
                    className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                    aria-label={t("nativeFirewall.removeRule")}
                    data-telemetry="servers:removefirewallrule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Action */}
                  <div className="flex rounded border border-border overflow-hidden">
                    {(["allow", "deny"] as const).map(a => (
                      <button
                        key={a}
                        onClick={() => updateRule(idx, { action: a })}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium transition-colors",
                          rule.action === a
                            ? a === "deny"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-emerald-500/20 text-emerald-300"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        )}
                        data-telemetry="servers:firewallaction"
                      >
                        {a === "deny" ? t("nativeFirewall.deny") : t("nativeFirewall.allow")}
                      </button>
                    ))}
                  </div>

                  {/* Protocols */}
                  <div className="flex rounded border border-border overflow-hidden">
                    {["tcp", "udp"].map(p => (
                      <button
                        key={p}
                        onClick={() => toggleProtocol(idx, p)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium uppercase transition-colors",
                          (rule.protocols || []).includes(p)
                            ? "bg-primary/20 text-primary"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Ports */}
                  <input
                    type="text"
                    defaultValue={(rule.ports || []).join(", ")}
                    onBlur={e => updateRule(idx, { ports: validPorts(e.target.value) })}
                    placeholder={t("nativeFirewall.portsPlaceholder")}
                    className="w-40 border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />

                  {/* Sources (CIDRs) */}
                  <input
                    type="text"
                    defaultValue={(rule.sources || []).join(", ")}
                    onBlur={e => updateRule(idx, { sources: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    placeholder={t("nativeFirewall.sourcesPlaceholder")}
                    className="w-56 border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}