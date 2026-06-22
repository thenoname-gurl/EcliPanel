"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatMoney, sanitizeCurrencyCode } from "@/lib/billing-display"
import { AlertTriangle, Bot, Check, ChevronDown, ChevronUp, Edit, Gift, Loader2, Plus, RefreshCw, Trash2, X, Zap } from "lucide-react"
import { useTranslations } from "next-intl"
import type { AdminPlan, PanelSettings } from "@/types/admin"

interface PlansTabCtx {
  plans: AdminPlan[]
  panelSettings: PanelSettings
  ensurePortalPlans: () => void
  ensureLoading: boolean
  openNewPlan: () => void
  planReapplyLoading: boolean
  planReapplyId: number | null
  getPortalMarker: (tier?: string) => string
  reapplyPlanLimits: (planId: number, force?: boolean) => void
  openEditPlan: (plan: AdminPlan) => void
  deletePlan: (plan: AdminPlan) => void
  planDialogOpen: boolean
  setPlanDialogOpen: (open: boolean) => void
  planEditTarget: AdminPlan | null
  planName: string
  setPlanName: (v: string) => void
  planType: string
  setPlanType: (v: string) => void
  planPrice: string
  setPlanPrice: (v: string) => void
  planDesc: string
  setPlanDesc: (v: string) => void
  planMemory: string
  setPlanMemory: (v: string) => void
  planDisk: string
  setPlanDisk: (v: string) => void
  planCpu: string
  setPlanCpu: (v: string) => void
  planServerLimit: string
  setPlanServerLimit: (v: string) => void
  planDatabases: string
  setPlanDatabases: (v: string) => void
  planBackups: string
  setPlanBackups: (v: string) => void
  planEmailSendDailyLimit: string
  setPlanEmailSendDailyLimit: (v: string) => void
  planEmailSendQueueLimit: string
  setPlanEmailSendQueueLimit: (v: string) => void
  planPortCount: string
  setPlanPortCount: (v: string) => void
  planTunnelPortCount: string
  setPlanTunnelPortCount: (v: string) => void
  planIsDefault: boolean
  setPlanIsDefault: (v: boolean) => void
  planHiddenFromBilling: boolean
  setPlanHiddenFromBilling: (v: boolean) => void
  planFeatures: string
  setPlanFeatures: (v: string) => void
  planError: string
  planLoading: boolean
  savePlan: () => void
  planBoostOpen: boolean
  setPlanBoostOpen: (open: boolean) => void
  planBoostTarget: AdminPlan | null
  planBoostPercent: string
  setPlanBoostPercent: (v: string) => void
  planBoostDurationDays: string
  setPlanBoostDurationDays: (v: string) => void
  planBoostReason: string
  setPlanBoostReason: (v: string) => void
  planBoostSaving: boolean
  planBoostError: string
  openBoostDialog: (plan: AdminPlan) => void
  savePlanBoost: () => void
  removePlanBoost: (plan: AdminPlan) => void
}

interface AiModelItem {
  id: number
  model?: { id: number; name: string }
}

function PlanAiModels({ planId, canManage }: { planId: number; canManage: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [models, setModels] = useState<AiModelItem[]>([])
  const [allModels, setAllModels] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState("")
  const [error, setError] = useState("")

  const fetchAssigned = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data: AiModelItem[] = await apiFetch(`/api/admin/ai/plans/${planId}/models`)
      setModels(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load assigned models")
    }
    setLoading(false)
  }, [planId])

  const fetchAllModels = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/ai/models")
      setAllModels(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError(prev => prev || (e instanceof Error ? e.message : "Failed to load available models"))
    }
  }, [])

  useEffect(() => {
    if (expanded) {
      fetchAssigned()
      fetchAllModels()
    }
  }, [expanded, fetchAssigned, fetchAllModels])

  const assignedIds = new Set(models.map(m => m.model?.id))
  const availableModels = allModels.filter(m => !assignedIds.has(m.id))

  const handleLink = async () => {
    if (!selectedModelId) return
    setLinking(true)
    try {
      await apiFetch(`/api/admin/ai/models/${selectedModelId}/link-plan`, {
        method: "POST",
        body: JSON.stringify({ planId }),
      })
      setSelectedModelId("")
      await fetchAssigned()
    } catch {}
    setLinking(false)
  }

  const handleUnlink = async (modelId: number) => {
    try {
      await apiFetch(`/api/admin/ai/models/${modelId}/unlink-plan/${planId}`, { method: "DELETE" })
      await fetchAssigned()
    } catch {}
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bot className="h-3 w-3" />
        <span>AI Models</span>
        {models.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
            {models.length}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">{error}</p>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : models.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No AI models assigned to this plan.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {models.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-secondary/30 border border-border/50 px-2.5 py-1.5">
                  <span className="text-xs text-foreground truncate">{m.model?.name || `Model #${m.model?.id}`}</span>
                  {canManage && (
                    <button
                      onClick={() => m.model?.id != null && handleUnlink(m.model.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && availableModels.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="flex-1 border border-border bg-secondary/50 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                <option value="">Select model...</option>
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-border"
                onClick={handleLink}
                disabled={!selectedModelId || linking}
              >
                {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          )}
          {canManage && !loading && availableModels.length === 0 && allModels.length === 0 && !error && (
            <p className="text-xs text-muted-foreground py-1">No AI models available. Create models in the AI tab first.</p>
          )}
          {canManage && !loading && availableModels.length === 0 && allModels.length > 0 && (
            <p className="text-xs text-muted-foreground py-1">All available models are already assigned.</p>
          )}
        </div>
      )}
    </div>
  )
}

function getBoostStatus(plan: AdminPlan): { active: boolean; expiresAt: Date | null; remaining: string } {
  if (!plan.boostPercent || plan.boostPercent <= 0 || !plan.boostExpiresAt) {
    return { active: false, expiresAt: null, remaining: "" }
  }
  const now = Date.now()
  const startsAt = plan.boostStartsAt ? new Date(plan.boostStartsAt).getTime() : 0
  const expiresAt = new Date(plan.boostExpiresAt)
  const expiresMs = expiresAt.getTime()
  if (startsAt > 0 && now >= startsAt && now <= expiresMs) {
    const daysLeft = Math.ceil((expiresMs - now) / 86400000)
    return { active: true, expiresAt, remaining: daysLeft > 1 ? `${daysLeft} days` : daysLeft === 1 ? "1 day" : "expiring soon" }
  }
  if (now > expiresMs) {
    return { active: false, expiresAt, remaining: "expired" }
  }
  return { active: false, expiresAt, remaining: "not yet started" }
}

export default function PlansTab({ ctx }: { ctx: PlansTabCtx }) {
  const t = useTranslations("adminPlansTab")
  const { user } = useAuth()
  const canManagePlans = !!user && hasPermission(user, 'admin:plans:manage')
  const canDeletePlans = !!user && hasPermission(user, 'admin:plans:delete')
  const canReapplyPlans = !!user && hasPermission(user, 'admin:plans:reapply')
  const canForceReapplyPlans = !!user && hasPermission(user, 'admin:plans:forcereapply')
  const {
    plans,
    ensurePortalPlans,
    ensureLoading,
    openNewPlan,
    planReapplyLoading,
    planReapplyId,
    getPortalMarker,
    reapplyPlanLimits,
    openEditPlan,
    deletePlan,
    planDialogOpen,
    setPlanDialogOpen,
    planEditTarget,
    planName,
    setPlanName,
    planType,
    setPlanType,
    planPrice,
    setPlanPrice,
    planDesc,
    setPlanDesc,
    planMemory,
    setPlanMemory,
    planDisk,
    setPlanDisk,
    planCpu,
    setPlanCpu,
    planServerLimit,
    setPlanServerLimit,
    planDatabases,
    setPlanDatabases,
    planBackups,
    setPlanBackups,
    planEmailSendDailyLimit,
    setPlanEmailSendDailyLimit,
    planEmailSendQueueLimit,
    setPlanEmailSendQueueLimit,
    planPortCount,
    setPlanPortCount,
    planTunnelPortCount,
    setPlanTunnelPortCount,
    planIsDefault,
    setPlanIsDefault,
    planHiddenFromBilling,
    setPlanHiddenFromBilling,
    planFeatures,
    setPlanFeatures,
    planError,
    planLoading,
    savePlan,
    panelSettings,
    planBoostOpen,
    setPlanBoostOpen,
    planBoostTarget,
    planBoostPercent,
    setPlanBoostPercent,
    planBoostDurationDays,
    setPlanBoostDurationDays,
    planBoostReason,
    setPlanBoostReason,
    planBoostSaving,
    planBoostError,
    openBoostDialog,
    savePlanBoost,
    removePlanBoost,
  } = ctx

  const currencyCode = sanitizeCurrencyCode(panelSettings?.billingCurrency || "USD")

  return (
    <>
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("header.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("header.subtitle")}
            {plans.length > 0 && (
              <span className="text-muted-foreground/60"> · {t("header.planCount", { count: plans.length })}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManagePlans && (
            <Button size="sm" variant="outline" onClick={ensurePortalPlans} disabled={ensureLoading}>
              {ensureLoading ? <Loader2 className="h-3.5 w-3.5 rounded-full animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              {t("actions.syncPortal")}
            </Button>
          )}
          {canManagePlans && (
            <Button size="sm" onClick={openNewPlan} className="bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("actions.newPlan")}
            </Button>
          )}
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="border border-dashed border-border bg-card">
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="rounded-full bg-secondary/50 p-4">
              <Zap className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t("states.noPlans")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("states.noPlansSubtitle")}</p>
            </div>
            <Button size="sm" onClick={openNewPlan} className="mt-2 bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("actions.createFirstPlan")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map(plan => {
            const isReapplying = planReapplyLoading && planReapplyId === plan.id
            const boost = getBoostStatus(plan)

            const resources = [
              { label: t("resources.ram"), value: plan.memory != null ? `${plan.memory} MB` : t("common.infinity") },
              { label: t("resources.disk"), value: plan.disk != null ? `${(plan.disk / 1024).toFixed(0)} GB` : t("common.infinity") },
              { label: t("resources.cpu"), value: plan.cpu != null ? `${plan.cpu}%` : t("common.infinity") },
              { label: t("resources.servers"), value: plan.serverLimit != null ? `${plan.serverLimit}` : t("common.infinity") },
              { label: t("resources.dbs"), value: plan.databases != null ? `${plan.databases}` : t("common.infinity") },
              { label: t("resources.backups"), value: plan.backups != null ? `${plan.backups}` : t("common.infinity") },
              { label: t("resources.tunnelPorts"), value: plan.tunnelPortCount != null ? `${plan.tunnelPortCount}` : t("common.infinity") },
            ]

            return (
              <div
                key={plan.id}
                className={`group border bg-card transition-all hover:shadow-md hover:border-primary/20 ${plan.isDefault ? "border-green-500/30 ring-1 ring-green-500/10" : "border-border"
                  } ${boost.active ? "ring-1 ring-amber-500/20" : ""}`}
              >
                <div className="flex items-start justify-between p-4 pb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">{plan.name}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${plan.type === "free"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : plan.type === "premium"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : plan.type === "educational"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}>
                        {getPortalMarker(plan.type)}
                      </span>
                      {plan.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          <Check className="h-2.5 w-2.5" />
                          {t("badges.default")}
                        </span>
                      )}
                      {plan.hiddenFromBilling && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/30 text-muted-foreground border border-border">
                          {t("badges.hiddenInBilling")}
                        </span>
                      )}
                      {boost.active && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Gift className="h-2.5 w-2.5" />
                          +{plan.boostPercent}% boost
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                    )}
                    {boost.active && (
                      <p className="text-[11px] text-amber-400/70 mt-1.5">
                        +{plan.boostPercent}% resource boost · {boost.remaining}{plan.boostReason ? ` · ${plan.boostReason}` : ""}
                      </p>
                    )}
                    {boost.remaining === "expired" && (
                      <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                        Resource boost expired
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      {formatMoney(Number(plan.price ?? 0), currencyCode)}
                    </p>
                    <p className="text-[10px] text-muted-foreground -mt-0.5">{t("common.perMonth")}</p>
                  </div>
                </div>

                <div className="px-4 pb-3">
                  <div className="grid grid-cols-3 gap-2">
                    {resources.map(res => (
                      <div
                        key={res.label}
                        className="bg-secondary/30 border border-border/50 px-2.5 py-2 text-center"
                      >
                        <p className="text-[10px] text-muted-foreground">{res.label}</p>
                        <p className={`text-xs font-semibold mt-0.5 tabular-nums ${res.value === "∞" ? "text-muted-foreground" : "text-foreground"
                          }`}>
                          {res.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <PlanAiModels planId={plan.id} canManage={canManagePlans} />

                <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-secondary/10 rounded-b-xl">
                  <div className="flex items-center gap-1">
                    {canReapplyPlans && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                        disabled={isReapplying}
                        onClick={() => reapplyPlanLimits(plan.id)}
                      >
                        {isReapplying ? (
                          <Loader2 className="h-3 w-3 rounded-full animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        {t("actions.reapply")}
                      </Button>
                    )}
                    {canForceReapplyPlans && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/10 gap-1"
                        disabled={isReapplying}
                        onClick={() => reapplyPlanLimits(plan.id, true)}
                      >
                        {isReapplying ? (
                          <Loader2 className="h-3 w-3 rounded-full animate-spin" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {t("actions.force")}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {canManagePlans && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openBoostDialog(plan)}
                        title="Manage resource boost"
                      >
                        <Gift className={`h-3.5 w-3.5 ${boost.active ? "text-amber-400" : ""}`} />
                      </Button>
                    )}
                    {canManagePlans && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditPlan(plan)}
                        title={t("actions.editPlan")}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDeletePlans && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deletePlan(plan)}
                        title={t("actions.deletePlan")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>

    <Dialog open={planDialogOpen} onOpenChange={(open: boolean) => !open && setPlanDialogOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">{planEditTarget ? t("dialog.editTitle") : t("dialog.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.planName")}</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={t("dialog.fields.planNamePlaceholder")}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.type")}</label>
              <select value={planType} onChange={(e) => setPlanType(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="free">{t("types.free")}</option>
                <option value="paid">{t("types.paid")}</option>
                <option value="educational">{t("types.educational")}</option>
                <option value="enterprise">{t("types.enterprise")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.price", { currency: currencyCode })}</label>
              <input type="number" min="0" step="0.01" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.description")}</label>
              <input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder={t("dialog.fields.descriptionPlaceholder")}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">{t("dialog.resourceLimits")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.memoryMb")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.memoryPlaceholder")} value={planMemory} onChange={(e) => setPlanMemory(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.diskMb")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.diskPlaceholder")} value={planDisk} onChange={(e) => setPlanDisk(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.cpuPercent")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.cpuPlaceholder")} value={planCpu} onChange={(e) => setPlanCpu(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.serverLimit")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.serverLimitPlaceholder")} value={planServerLimit} onChange={(e) => setPlanServerLimit(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.databases")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.databasesPlaceholder")} value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.backups")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.backupsPlaceholder")} value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email send per day</label>
              <input type="number" min="0" placeholder="e.g. 50" value={planEmailSendDailyLimit} onChange={(e) => setPlanEmailSendDailyLimit(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email queue limit</label>
              <input type="number" min="0" placeholder="e.g. 10" value={planEmailSendQueueLimit} onChange={(e) => setPlanEmailSendQueueLimit(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.portsPerServer")}</label>
              <input type="number" min="1" placeholder="1" value={planPortCount} onChange={(e) => setPlanPortCount(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.tunnelPortCount")}</label>
              <input type="number" min="1" placeholder="10" value={planTunnelPortCount} onChange={(e) => setPlanTunnelPortCount(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.accountDatabasesLimit")}</label>
              <input type="number" min="0" placeholder="0" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.accountBackupsLimit")}</label>
              <input type="number" min="0" placeholder="0" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 justify-end">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={planIsDefault} onChange={(e) => setPlanIsDefault(e.target.checked)} className="accent-primary" />
                {t("dialog.fields.setAsDefaultPlan")}
              </label>
            </div>
            <div className="flex flex-col gap-1.5 justify-end col-span-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={planHiddenFromBilling} onChange={(e) => setPlanHiddenFromBilling(e.target.checked)} className="accent-primary" />
                {t("dialog.fields.hideFromBillingShowcases")}
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("dialog.fields.billingPageFeatures")}
            </label>
            <textarea
              rows={4}
              value={planFeatures}
              onChange={(e) => setPlanFeatures(e.target.value)}
              placeholder={t("dialog.fields.billingPageFeaturesPlaceholder")}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground">{t("dialog.fields.billingPageFeaturesHint")}</p>
          </div>
          {planError && <p className="text-xs text-destructive">{planError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={savePlan} disabled={planLoading} className="bg-primary text-primary-foreground">
            {planLoading ? <><Loader2 className="h-3.5 w-3.5 rounded-full animate-spin mr-1" />{t("actions.saving")}</> : (planEditTarget ? t("actions.saveChanges") : t("actions.createPlan"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={planBoostOpen} onOpenChange={(open: boolean) => !open && setPlanBoostOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber-400" />
            Resource Boost — {planBoostTarget?.name || "Plan"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-muted-foreground">
            Set a temporary virtual resource boost for all servers on this plan. Resources are displayed as boosted in the panel but not actually modified on the provider.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Boost percent</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="1000"
                value={planBoostPercent}
                onChange={(e) => setPlanBoostPercent(e.target.value)}
                className="flex-1 border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <span className="text-sm text-muted-foreground font-medium">%</span>
            </div>
            <p className="text-[10px] text-muted-foreground">E.g. 20 = 20% extra virtual resources (memory, disk, CPU)</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</label>
            <select
              value={planBoostDurationDays}
              onChange={(e) => setPlanBoostDurationDays(e.target.value)}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">1 month</option>
              <option value="60">2 months</option>
              <option value="90">3 months</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason (optional)</label>
            <input
              value={planBoostReason}
              onChange={(e) => setPlanBoostReason(e.target.value)}
              placeholder="e.g. Downtime compensation, promo, etc."
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          {planBoostError && <p className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">{planBoostError}</p>}
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div>
            {planBoostTarget?.boostPercent && planBoostTarget.boostPercent > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  removePlanBoost(planBoostTarget)
                  setPlanBoostOpen(false)
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Remove boost
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPlanBoostOpen(false)} className="border-border">{t("actions.cancel")}</Button>
            <Button onClick={savePlanBoost} disabled={planBoostSaving} className="bg-primary text-primary-foreground">
              {planBoostSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving...</> : "Set Boost"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
