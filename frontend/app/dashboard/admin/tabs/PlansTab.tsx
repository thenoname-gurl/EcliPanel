"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, Check, Edit, Loader2, Plus, RefreshCw, Trash2, Zap } from "lucide-react"

export default function PlansTab({ ctx }: { ctx: any }) {
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
    planFeatures,
    setPlanFeatures,
    planError,
    planLoading,
    savePlan,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plans</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define resource tiers and pricing for users.
            {plans.length > 0 && (
              <span className="text-muted-foreground/60"> · {plans.length} {plans.length === 1 ? "plan" : "plans"} configured</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={ensurePortalPlans} disabled={ensureLoading}>
            {ensureLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Sync Portal
          </Button>
          <Button size="sm" onClick={openNewPlan} className="bg-primary text-primary-foreground">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Plan
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
              <p className="text-sm font-medium text-foreground">No plans configured</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first plan to define resource tiers for users.</p>
            </div>
            <Button size="sm" onClick={openNewPlan} className="mt-2 bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create First Plan
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan: any) => {
            const isReapplying = planReapplyLoading && planReapplyId === plan.id

            const resources = [
              { label: "RAM", value: plan.memory != null ? `${plan.memory} MB` : "∞" },
              { label: "Disk", value: plan.disk != null ? `${(plan.disk / 1024).toFixed(0)} GB` : "∞" },
              { label: "CPU", value: plan.cpu != null ? `${plan.cpu}%` : "∞" },
              { label: "Servers", value: plan.serverLimit != null ? `${plan.serverLimit}` : "∞" },
              { label: "DBs", value: plan.databases != null ? `${plan.databases}` : "∞" },
              { label: "Backups", value: plan.backups != null ? `${plan.backups}` : "∞" },
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
                          Default
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      ${(plan.price ?? 0).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground -mt-0.5">/month</p>
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
                      Reapply
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
                      Force
                    </Button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditPlan(plan)}
                      title="Edit plan"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deletePlan(plan)}
                      title="Delete plan"
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
          <DialogTitle className="text-foreground">{planEditTarget ? "Edit Plan" : "New Plan"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan Name *</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Starter"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
              <select value={planType} onChange={(e) => setPlanType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="educational">Educational</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price ($/mo)</label>
              <input type="number" min="0" step="0.01" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Brief description of the plan"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Resource Limits (leave blank for unlimited)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory (MB)</label>
              <input type="number" min="0" placeholder="e.g. 2048" value={planMemory} onChange={(e) => setPlanMemory(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disk (MB)</label>
              <input type="number" min="0" placeholder="e.g. 10240" value={planDisk} onChange={(e) => setPlanDisk(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU (%)</label>
              <input type="number" min="0" placeholder="e.g. 100" value={planCpu} onChange={(e) => setPlanCpu(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Server Limit</label>
              <input type="number" min="0" placeholder="e.g. 3" value={planServerLimit} onChange={(e) => setPlanServerLimit(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Databases</label>
              <input type="number" min="0" placeholder="e.g. 10" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Backups</label>
              <input type="number" min="0" placeholder="e.g. 20" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ports per Server</label>
              <input type="number" min="1" placeholder="1" value={planPortCount} onChange={(e) => setPlanPortCount(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Databases Limit</label>
              <input type="number" min="0" placeholder="0" value={planDatabases} onChange={(e) => setPlanDatabases(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Backups Limit</label>
              <input type="number" min="0" placeholder="0" value={planBackups} onChange={(e) => setPlanBackups(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 justify-end">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={planIsDefault} onChange={(e) => setPlanIsDefault(e.target.checked)} className="accent-primary" />
                Set as default plan
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Billing Page Features (one per line)
            </label>
            <textarea
              rows={4}
              value={planFeatures}
              onChange={(e) => setPlanFeatures(e.target.value)}
              placeholder={"e.g.\n3 Servers\n2048 MB RAM\n10 GB SSD\nPriority Support"}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground">These lines appear as feature bullets on the user's Billing page.</p>
          </div>
          {planError && <p className="text-xs text-destructive">{planError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={savePlan} disabled={planLoading} className="bg-primary text-primary-foreground">
            {planLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : (planEditTarget ? "Save Changes" : "Create Plan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
