"use client"

import { PanelHeader } from "@/components/panel/header"
import { StatCard, SectionHeader } from "@/components/panel/shared"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { PORTALS, API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { applyTax, formatMoney, resolveTaxRate, sanitizeCurrencyCode } from "@/lib/billing-display"
import {
  CreditCard,
  DollarSign,
  Receipt,
  Calendar,
  Download,
  Check,
  ArrowRight,
} from "lucide-react"

const HACKCLUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED === 'true'
const GITHUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_STUDENT_ENABLED === 'true'

export default function BillingPage() {
  const t = useTranslations("billingPage")
  const { user, refreshUser } = useAuth()
  const currentUser = user as any
  const [orders, setOrders] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [activePlan, setActivePlan] = useState<{ plan: any; order: any } | null>(null)
  const [latestOrder, setLatestOrder] = useState<any | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [demoActiveUntil, setDemoActiveUntil] = useState<string | null>(null)
  const [demoUsed, setDemoUsed] = useState(false)
  const [billingCurrency, setBillingCurrency] = useState("USD")
  const [billingTaxRules, setBillingTaxRules] = useState("")

  const portalMarkerByTier: Record<string, string> = {
    free: t("portal.free"),
    paid: t("portal.paid"),
    educational: t("portal.educational"),
    enterprise: t("portal.enterprise"),
  }
  const getPortalMarker = (tier?: string) => {
    if (!tier) return t("portal.free")
    return portalMarkerByTier[String(tier).toLowerCase()] ?? t("portal.free")
  }

  const userPlanType = (currentUser?.portalType ?? currentUser?.tier ?? 'free').toString().toLowerCase()
  const activeTierRaw = (activePlan?.plan?.type ?? userPlanType).toString().toLowerCase()
  const activeTierEffective = (activeTierRaw === 'educational' ? 'paid' : activeTierRaw) as keyof typeof PORTALS
  const activeTierLabel = activeTierRaw === 'educational' ? 'educational' : activeTierRaw
  const currentPlan = PORTALS[activeTierEffective] ?? PORTALS.free

  const userPlanLabel = userPlanType === 'enterprise' ? t("portal.enterprise") : getPortalMarker(userPlanType)
  const activePlanTitle = activePlan?.plan?.name ?? userPlanLabel
  const activePlanType = activePlan?.plan?.type ?? userPlanType
  const normalizedCurrency = sanitizeCurrencyCode(billingCurrency)
  const taxRate = resolveTaxRate(billingTaxRules, currentUser?.billingCountry)
  const formatPrice = (amount: number, includeTax = false) => {
    if (!includeTax || taxRate <= 0) return formatMoney(amount, normalizedCurrency)
    return formatMoney(applyTax(amount, taxRate).total, normalizedCurrency)
  }

  const activePlanPrice = activePlan
    ? activePlan.plan.type === 'enterprise'
      ? activePlan.order?.amount
        ? formatPrice(Number(activePlan.order.amount), true)
        : t("pricing.priceVaries")
      : formatPrice(Number(activePlan.plan.price ?? 0), true)
    : currentPlan.id === 'free'
      ? formatPrice(0, true)
      : currentPlan.id === 'paid'
        ? formatPrice(12, true)
        : t("pricing.custom")
  const activeBaseMonthly = activePlan
    ? activePlan.plan.type === 'enterprise'
      ? (activePlan.order?.amount != null ? Number(activePlan.order.amount) : null)
      : Number(activePlan.plan.price ?? 0)
    : currentPlan.id === 'free'
      ? 0
      : currentPlan.id === 'paid'
        ? 12
        : null
  const activeTaxBreakdown = activeBaseMonthly != null ? applyTax(activeBaseMonthly, taxRate) : null

  const activePlanExpires = activePlan?.order?.expiresAt || null

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => {
        setBillingCurrency(data?.billingCurrency || "USD")
        setBillingTaxRules(data?.billingTaxRules || "")
      })
      .catch(() => {
        setBillingCurrency("USD")
        setBillingTaxRules("")
      })

    apiFetch(API_ENDPOINTS.plans)
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch(() => setPlans([]))

    apiFetch(API_ENDPOINTS.orders)
      .then(async (data) => {
        setOrders(data)
        if (Array.isArray(data) && data.length > 0) {
          const sortedOrders = [...data].sort((a: any, b: any) => {
            const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime()
            const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime()
            return bDate - aDate
          })
          setLatestOrder(sortedOrders[0])

          const activeOrders = sortedOrders.filter((o: any) => o.status === 'active' && o.planId)
          const planOrder = activeOrders[0] || sortedOrders[0]
          if (planOrder?.planId) {
            try {
              const plan = await apiFetch(API_ENDPOINTS.planDetail.replace(":id", String(planOrder.planId)))
              setActivePlan({ plan, order: planOrder })
            } catch {
              // skip
            }
          }
        } else {
          setLatestOrder(null)
        }
      })
      .catch((err) => {
        console.error("failed to load orders", err)
      })
      .finally(() => setOrdersLoading(false))
  }, [user])

  useEffect(() => {
    if (user) {
      setDemoActiveUntil(currentUser?.demoExpiresAt || null)
      setDemoUsed(!!currentUser?.demoUsed)
    }
  }, [user, currentUser])

  const livePlanCards = plans.map((plan) => {
    const tier = String(plan?.type ?? "").toLowerCase()
    const tierEffective = tier === 'educational' ? 'paid' : tier
    const portalConfig = PORTALS[tier as keyof typeof PORTALS]
    const featuresFromPlan = Array.isArray(plan?.features)
      ? plan.features
      : Array.isArray(plan?.features?.list)
        ? plan.features.list
        : []

    return {
      key: String(plan.id),
      id: tier || String(plan.id),
      type: tier,
      effectiveType: tierEffective,
      name: plan.name || portalConfig?.name || t("pricing.customPlan"),
      description: plan.description || portalConfig?.description || "",
      features: featuresFromPlan,
      color: portalConfig?.color,
      icon: portalConfig?.icon,
      price: tier === 'enterprise' ? null : Number(plan?.price ?? 0),
      hiddenFromBilling: Boolean(plan?.hiddenFromBilling),
      isActive:
        !!activePlan &&
        (Number(activePlan.plan?.id) === Number(plan.id) || String(activePlan.plan?.type ?? "") === tier),
    }
  })

  const fallbackCards = Object.values(PORTALS).map((portal) => {
    return {
      key: portal.id,
      id: portal.id,
      type: portal.id,
      name: portal.name,
      description: portal.description,
      features: [...portal.features],
      color: portal.color,
      icon: portal.icon,
      price: portal.id === "free" || portal.id === "educational" ? 0 : portal.id === "paid" ? 29.99 : null,
      isActive: portal.id === activeTierLabel,
    }
  })

  const visibleLivePlanCards = livePlanCards.filter((planCard: any) => !planCard?.hiddenFromBilling)
  const subscriptionCards = livePlanCards.length > 0 ? visibleLivePlanCards : fallbackCards

  const startDemo = async () => {
    setDemoError(null)
    setDemoLoading(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.authDemo, {
        method: 'POST',
        body: JSON.stringify({ minutes: 30 }),
      })
      setDemoActiveUntil(res.demoExpiresAt || null)
      setDemoUsed(true)
      refreshUser()
    } catch (err: any) {
      setDemoError(err.message || t("demo.errors.failedStart"))
    } finally {
      setDemoLoading(false)
    }
  }

  const finishDemo = async () => {
    setDemoError(null)
    setDemoLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.authDemoFinish, {
        method: 'POST',
      })
      setDemoActiveUntil(null)
      refreshUser()
      toast({ title: t("demo.toast.endedTitle"), description: t("demo.toast.endedDescription") })
    } catch (err: any) {
      setDemoError(err.message || t("demo.errors.failedFinish"))
    } finally {
      setDemoLoading(false)
    }
  }

  const normalizedPortalType = String(currentUser?.portalType || currentUser?.tier || '').toLowerCase()
  const isEnterprisePortal = normalizedPortalType === 'enterprise'
  const demoActive = !!demoActiveUntil && new Date(demoActiveUntil) > new Date()
  const demoExpired = !!demoActiveUntil && new Date(demoActiveUntil) <= new Date()
  const showDemoPanel = !!user && (demoActive || (!demoUsed && !isEnterprisePortal))

  return (
    <FeatureGuard feature="billing">
      <>
        <div data-guide-id="billing-panel">
        <PanelHeader title={t("header.title")} description={t("header.description")} />
      </div>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Demo */}
          {showDemoPanel ? (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 min-w-0 box-border overflow-hidden">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("demo.title")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("demo.description")}
                    </p>
                  </div>
                  <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning">{t("demo.badge")}</span>
                </div>
                {demoActive ? (
                  <p className="text-sm text-muted-foreground">{t("demo.expiresAt")} <span className="font-medium text-foreground">{new Date(demoActiveUntil!).toLocaleString()}</span>.</p>
                ) : demoExpired ? (
                  <p className="text-sm text-muted-foreground">{t("demo.expired")}</p>
                ) : demoUsed ? (
                  <p className="text-sm text-muted-foreground">{t("demo.used")}</p>
                ) : null}
                {demoError && <p className="text-sm text-destructive">{demoError}</p>}
                <p className="text-sm text-muted-foreground">
                  {t("demo.footnote")}
                </p>
                <button
                  onClick={demoActive ? finishDemo : startDemo}
                  disabled={(demoUsed && !demoActive) || demoLoading}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {demoLoading ? (demoActive ? t("demo.actions.finishing") : t("demo.actions.starting")) : demoActive ? t("demo.actions.endDemo") : demoUsed ? t("demo.actions.demoUsed") : t("demo.actions.startDemo")}
                </button>
              </div>
            </div>
          ) : null}

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-[100vw] w-full box-border">
            <StatCard
              title={t("stats.currentPlan")}
              value={activePlanTitle}
              icon={CreditCard}
            />
            <StatCard
              title={t("stats.monthlyCost")}
              value={activePlanPrice}
              icon={DollarSign}
              subtitle={
                activePlan?.plan?.type === 'enterprise' && !activePlan?.order?.amount
                  ? t("stats.priceFromOrder")
                  : taxRate > 0
                    ? t("stats.includesTax", { taxRate: taxRate.toString(), country: currentUser?.billingCountry || t("stats.yourBillingCountry") })
                    : undefined
              }
            />
            <StatCard title={t("stats.totalInvoices")} value={ordersLoading ? '...' : String(orders.length)} icon={Receipt} />
            <StatCard
              title={t("stats.planExpires")}
              value={activePlan?.order?.expiresAt ? new Date(activePlan.order.expiresAt).toLocaleDateString() : t("common.na")}
              icon={Calendar}
              subtitle={activePlan ? undefined : t("stats.managedViaSales")}
            />
          </div>

          {/* Tax Information */}
          <div className="rounded-xl border border-border bg-card p-5 min-w-0 box-border overflow-hidden">
            <SectionHeader
              title={t("tax.title")}
              description={t("tax.description")}
            />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.billingCountry")}</p>
                <p className="text-foreground font-medium">{currentUser?.billingCountry || t("tax.notSet")}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.taxRate")}</p>
                <p className="text-foreground font-medium">{taxRate.toFixed(2)}%</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.preTaxMonthly")}</p>
                <p className="text-foreground font-medium">{activeTaxBreakdown ? formatMoney(activeTaxBreakdown.base, normalizedCurrency) : t("common.na")}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.taxAmount")}</p>
                <p className="text-foreground font-medium">{activeTaxBreakdown ? formatMoney(activeTaxBreakdown.tax, normalizedCurrency) : t("common.na")}</p>
              </div>
            </div>
          </div>

          {/* Live Active Plan Details */}
          {activePlan && (
            <div className="rounded-xl border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
              <SectionHeader
                title={t("activeSubscription.title")}
                description={activePlan.plan.description || t("activeSubscription.descriptionFallback")}
                action={
                  <a
                    href="mailto:sales@ecli.app"
                    className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                  >
                    {t("activeSubscription.manage")}
                  </a>
                }
              />
              <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-foreground">{activePlanTitle}</h3>
                    <Badge className="bg-primary/20 text-primary border-0 text-xs">{getPortalMarker(activePlanType)}</Badge>
                  </div>
                  {activePlan.plan.features?.list && Array.isArray(activePlan.plan.features.list) && (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {activePlan.plan.features.list.map((f: string) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
                    <p>{t("activeSubscription.configuredLimits")}</p>
                    <ul className="mt-1 space-y-1">
                      <li>{t("activeSubscription.memory")}: <span className="text-foreground font-medium">{activePlan.plan.memory ?? currentUser?.limits?.memory ?? t("common.unlimited")}</span></li>
                      <li>{t("activeSubscription.disk")}: <span className="text-foreground font-medium">{activePlan.plan.disk ?? currentUser?.limits?.disk ?? t("common.unlimited")}</span></li>
                      <li>{t("activeSubscription.cpu")}: <span className="text-foreground font-medium">{activePlan.plan.cpu ?? currentUser?.limits?.cpu ?? t("common.unlimited")}</span></li>
                      <li>{t("activeSubscription.serverLimit")}: <span className="text-foreground font-medium">{activePlan.plan.serverLimit ?? currentUser?.limits?.serverLimit ?? t("common.unlimited")}</span></li>
                      <li>{t("activeSubscription.databases")}: <span className="text-foreground font-medium">{activePlan.plan.databases ?? currentUser?.limits?.databases ?? t("common.unlimited")}</span></li>
                      <li>{t("activeSubscription.backups")}: <span className="text-foreground font-medium">{activePlan.plan.backups ?? currentUser?.limits?.backups ?? t("common.unlimited")}</span></li>
                    </ul>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-primary">
                    {activePlanPrice}
                    {activePlanType !== 'enterprise' && <span className="text-sm font-normal text-muted-foreground">{t("common.perMonth")}</span>}
                  </p>
                  {activePlanExpires && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("activeSubscription.renews")} {new Date(activePlanExpires).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current Plan */}
          <div className="rounded-xl border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
            <SectionHeader
              title={t("currentSubscription.title")}
              description={t("currentSubscription.description")}
              action={
                <a
                  href="mailto:sales@ecli.app"
                  className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                >
                  {t("currentSubscription.requestChange")}
                </a>
              }
            />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 max-w-[100vw] w-full box-border">
              {subscriptionCards.map((planCard) => {
                const Icon = planCard.icon || CreditCard
                return (
                  <div
                    key={planCard.key}
                    className={`rounded-xl border p-5 transition-all ${
                      planCard.isActive
                        ? "border-primary/50 bg-primary/5 shadow-[0_0_20px_var(--glow)]"
                        : "border-border bg-secondary/30 hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" style={planCard.color ? { color: planCard.color } : undefined} />
                      <h3 className="font-medium text-foreground">{planCard.name}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {getPortalMarker(planCard.type === 'educational' ? 'educational' : planCard.type)}
                      </Badge>
                      {planCard.isActive && (
                        <Badge className="bg-primary/20 text-primary border-0 text-[10px]">{t("currentSubscription.active")}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{planCard.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {planCard.type === 'enterprise'
                        ? t("pricing.priceVaries")
                        : planCard.price != null
                          ? `${formatPrice(Number(planCard.price), true)}${t("common.perMonth")}${taxRate > 0 ? ` (${t("pricing.inclTax", { taxRate: taxRate.toString() })})` : ''}`
                          : t("currentSubscription.contactSales")}
                    </p>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {planCard.features.map((feature: string) => (
                        <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Check className="h-3 w-3 text-success" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {(planCard.type === 'educational' && currentUser?.portalType !== 'educational' && (HACKCLUB_STUDENT_ENABLED || GITHUB_STUDENT_ENABLED)) && (
                      <button
                        onClick={async () => {
                          try {
                            const endpoint = HACKCLUB_STUDENT_ENABLED
                              ? API_ENDPOINTS.hackclubStudentStart
                              : API_ENDPOINTS.githubStudentStart
                            const res:any = await apiFetch(endpoint, { method: 'GET' })
                            if (res?.redirect) window.location.href = res.redirect
                          } catch (e:any) {
                            alert(e?.message || t("errors.failedStudentVerification"))
                          }
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        {t("currentSubscription.connect")} {HACKCLUB_STUDENT_ENABLED ? 'Hack Club' : 'GitHub'}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {!planCard.isActive && planCard.type !== 'free' && planCard.type !== 'educational' && (
                      <a
                        href="mailto:sales@ecli.app"
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        {t("currentSubscription.contactSales")}
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )
              })}
              {livePlanCards.length > 0 && subscriptionCards.length === 0 && (
                <div className="rounded-xl border border-border bg-secondary/20 p-5 text-sm text-muted-foreground lg:col-span-3">
                  {t("currentSubscription.noPlansVisible")}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <SectionHeader
                title={t("invoices.title")}
                description={`${t("invoices.descriptionBase")}${taxRate > 0 ? ` · ${t("invoices.taxRate", { taxRate: taxRate.toFixed(2), country: currentUser?.billingCountry || t("invoices.billingCountry") })}` : ''}`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">{t("invoices.columns.invoice")}</th>
                    <th className="px-5 py-3 text-left font-medium">{t("invoices.columns.description")}</th>
                    <th className="px-5 py-3 text-left font-medium">{t("invoices.columns.date")}</th>
                    <th className="px-5 py-3 text-left font-medium">{t("invoices.columns.amountTaxIncl")}</th>
                    <th className="px-5 py-3 text-left font-medium">{t("invoices.columns.status")}</th>
                    <th className="px-5 py-3 text-right font-medium">{t("invoices.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersLoading ? (
              <tr><td colSpan={6} className="px-5 py-3 text-center text-sm text-muted-foreground">{t("invoices.loading")}</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-3 text-center text-sm text-muted-foreground">{t("invoices.empty")}</td></tr>
            ) : orders.map((invoice) => {
                    const invoiceBase = Number(invoice.amount ?? 0)
                    const invoiceBreakdown = applyTax(invoiceBase, taxRate)
                    return (
                    <tr key={invoice.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                      <td className="px-5 py-3 font-mono text-sm text-foreground">{invoice.id}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{invoice.description}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <div className="font-mono text-sm text-foreground">{formatMoney(invoiceBreakdown.total, normalizedCurrency)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(invoiceBreakdown.base, normalizedCurrency)} + {formatMoney(invoiceBreakdown.tax, normalizedCurrency)} {t("invoices.tax")}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                          {t("invoices.paid")}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/orders/${invoice.id}/invoice`, { credentials: 'include' });
                              if (!res.ok) throw new Error(t("errors.failedFetchInvoice"));
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `invoice-${invoice.id}.pdf`;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              URL.revokeObjectURL(url);
                            } catch (e) {
                              console.error(e);
                              alert(t("errors.unableDownloadInvoice"));
                            }
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  </FeatureGuard>
  )
}
