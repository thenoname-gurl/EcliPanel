"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatMoney, sanitizeCurrencyCode } from "@/lib/billing-display"
import { AlertTriangle, Check, Edit, Loader2, Plus, RefreshCw, Trash2, Zap } from "lucide-react"
import { useTranslations } from "next-intl"

export default function PlansTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminPlansTab")
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
    planPortCount,
    setPlanPortCount,
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
          <Button size="sm" variant="outline" onClick={ensurePortalPlans} disabled={ensureLoading}>
            {ensureLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            {t("actions.syncPortal")}
          </Button>
          <Button size="sm" onClick={openNewPlan} className="bg-primary text-primary-foreground">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t("actions.newPlan")}
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
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
          {plans.map((plan: any) => {
            const isReapplying = planReapplyLoading && planReapplyId === plan.id

            const resources = [
              { label: t("resources.ram"), value: plan.memory != null ? `${plan.memory} MB` : t("common.infinity") },
              { label: t("resources.disk"), value: plan.disk != null ? `${(plan.disk / 1024).toFixed(0)} GB` : t("common.infinity") },
              { label: t("resources.cpu"), value: plan.cpu != null ? `${plan.cpu}%` : t("common.infinity") },
              { label: t("resources.servers"), value: plan.serverLimit != null ? `${plan.serverLimit}` : t("common.infinity") },
              { label: t("resources.dbs"), value: plan.databases != null ? `${plan.databases}` : t("common.infinity") },
              { label: t("resources.backups"), value: plan.backups != null ? `${plan.backups}` : t("common.infinity") },
            ]

            return (
              <div
                key={plan.id}
                className={`group rounded-xl border bg-card transition-all hover:shadow-md hover:border-primary/20 ${plan.isDefault ? "border-green-500/30 ring-1 ring-green-500/10" : "border-border"
                  }`}
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
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
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
                    {resources.map((res) => (
                      <div
                        key={res.label}
                        className="rounded-lg bg-secondary/30 border border-border/50 px-2.5 py-2 text-center"
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

                <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-secondary/10 rounded-b-xl">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                      disabled={isReapplying}
                      onClick={() => reapplyPlanLimits(plan.id)}
                    >
                      {isReapplying ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {t("actions.reapply")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/10 gap-1"
                      disabled={isReapplying}
                      onClick={() => reapplyPlanLimits(plan.id, true)}
                    >
                      {isReapplying ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {t("actions.force")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditPlan(plan)}
                      title={t("actions.editPlan")}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deletePlan(plan)}
                      title={t("actions.deletePlan")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>

    <Dialog open={planDialogOpen} onOpenChange={(open) => !open && setPlanDialogOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{planEditTarget ? t("dialog.editTitle") : t("dialog.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.planName")}</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={t("dialog.fields.planNamePlaceholder")}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.type")}</label>
              <select value={planType} onChange={(e) => setPlanType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="free">{t("types.free")}</option>
                <option value="paid">{t("types.paid")}</option>
                <option value="educational">{t("types.educational")}</option>
                <option value="enterprise">{t("types.enterprise")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.price", { currency: currencyCode })}</label>
              <input type="number" min="0" step="0.01" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.description")}</label>
              <input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder={t("dialog.fields.descriptionPlaceholder")}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">{t("dialog.resourceLimits")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.memoryMb")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.memoryPlaceholder")} value={planMemory} onChange={(e) => setPlanMemory(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.diskMb")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.diskPlaceholder")} value={planDisk} onChange={(e) => setPlanDisk(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.cpuPercent")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.cpuPlaceholder")} value={planCpu} onChange={(e) => setPlanCpu(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.serverLimit")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.serverLimitPlaceholder")} value={planServerLimit} onChange={(e) => setPlanServerLimit(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.databases")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.databasesPlaceholder")} value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.backups")}</label>
              <input type="number" min="0" placeholder={t("dialog.fields.backupsPlaceholder")} value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.portsPerServer")}</label>
              <input type="number" min="1" placeholder="1" value={planPortCount} onChange={(e) => setPlanPortCount(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.accountDatabasesLimit")}</label>
              <input type="number" min="0" placeholder="0" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dialog.fields.accountBackupsLimit")}</label>
              <input type="number" min="0" placeholder="0" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
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
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground">{t("dialog.fields.billingPageFeaturesHint")}</p>
          </div>
          {planError && <p className="text-xs text-destructive">{planError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={savePlan} disabled={planLoading} className="bg-primary text-primary-foreground">
            {planLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{t("actions.saving")}</> : (planEditTarget ? t("actions.saveChanges") : t("actions.createPlan"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
