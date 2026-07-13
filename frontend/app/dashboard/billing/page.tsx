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
import { useRouter } from "next/navigation"
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
  Wallet,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react"

const HACKCLUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED === 'true'
const GITHUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_STUDENT_ENABLED === 'true'

export default function BillingPage() {
  const t = useTranslations("billingPage")
  const { user } = useAuth()
  const router = useRouter()
  const currentUser = user as any
  const [orders, setOrders] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [regionalPrices, setRegionalPrices] = useState<Record<number, Record<string, number>>>({})
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [activePlans, setActivePlans] = useState<Array<{ plan: any; order: any }>>([])
  const [latestOrder, setLatestOrder] = useState<any | null>(null)
  const [billingCurrency, setBillingCurrency] = useState("USD")
  const [billingTaxRules, setBillingTaxRules] = useState("")
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState<{ plan: any; order: any } | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState<{ targetCard: any; targetPlan: any } | null>(null)
  const [switchLoading, setSwitchLoading] = useState(false)
  const [activateMode, setActivateMode] = useState<"now" | "renewal">("now")

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

  const getEffectiveCountry = () => currentUser?.countryOverride || currentUser?.billingCountry || null

  const getRegionalPrice = (planId: number): number | null => {
    const country = getEffectiveCountry()
    if (!country) return null
    const planPrices = regionalPrices[planId]
    if (!planPrices) return null
    return planPrices[country.toUpperCase()] ?? null
  }

  const getEffectivePlanPrice = (plan: any): number => {
    const regional = getRegionalPrice(plan.id)
    return regional ?? Number(plan.price ?? 0)
  }

  const primaryPlan = activePlans.length > 0 ? activePlans[0] : null
  const userPlanType = (currentUser?.portalType ?? currentUser?.tier ?? 'free').toString().toLowerCase()
  const activeTierRaw = (primaryPlan?.plan?.type ?? userPlanType).toString().toLowerCase()
  const activeTierEffective = (activeTierRaw === 'educational' ? 'paid' : activeTierRaw) as keyof typeof PORTALS
  const activeTierLabel = activeTierRaw === 'educational' ? 'educational' : activeTierRaw
  const currentPlan = PORTALS[activeTierEffective] ?? PORTALS.free

  const userPlanLabel = userPlanType === 'enterprise' ? t("portal.enterprise") : getPortalMarker(userPlanType)
  const activePlanTitle = primaryPlan?.plan?.name || primaryPlan?.order?.description || userPlanLabel
  const activePlanType = primaryPlan?.plan?.type ?? userPlanType
  const normalizedCurrency = sanitizeCurrencyCode(billingCurrency)
  const taxRate = resolveTaxRate(billingTaxRules, currentUser?.billingCountry)
  const formatPrice = (amount: number, includeTax = false) => {
    if (!includeTax || taxRate <= 0) return formatMoney(amount, normalizedCurrency)
    return formatMoney(applyTax(amount, taxRate).total, normalizedCurrency)
  }

  const activePlanPrice = primaryPlan
    ? primaryPlan.plan.type === 'enterprise'
      ? primaryPlan.order?.amount
        ? formatPrice(Number(primaryPlan.order.amount), true)
        : t("pricing.priceVaries")
      : formatPrice(Number(getEffectivePlanPrice(primaryPlan.plan) || primaryPlan.order?.amount || 0), true)
    : currentPlan.id === 'free'
      ? formatPrice(0, true)
      : currentPlan.id === 'paid'
        ? formatPrice(12, true)
        : t("pricing.custom")
  const currentPlanPrice = primaryPlan
    ? primaryPlan.plan.type === 'enterprise'
      ? (primaryPlan.order?.amount != null ? Number(primaryPlan.order.amount) : null)
      : Number(getEffectivePlanPrice(primaryPlan.plan) || primaryPlan.order?.amount || 0)
    : null
  const activeBaseMonthly = primaryPlan
    ? primaryPlan.plan.type === 'enterprise'
      ? (primaryPlan.order?.amount != null ? Number(primaryPlan.order.amount) : null)
      : Number(getEffectivePlanPrice(primaryPlan.plan) || primaryPlan.order?.amount || 0)
    : currentPlan.id === 'free'
      ? 0
      : currentPlan.id === 'paid'
        ? 12
        : null
  const activeTaxBreakdown = activeBaseMonthly != null ? applyTax(activeBaseMonthly, taxRate) : null

  const activePlanExpires = primaryPlan?.order?.expiresAt || null

  function getStatusBadge(status: string) {
    const statusMap: Record<string, { variant: "outline" | "default" | "destructive" | "secondary"; className: string; label: string }> = {
      active: {
        variant: "outline",
        className: "border-success/30 bg-success/10 text-success text-xs",
        label: t("invoices.paid"),
      },
      pending: {
        variant: "outline",
        className: "border-warning/30 bg-warning/10 text-warning text-xs",
        label: t("invoices.pending"),
      },
      awaiting_payment: {
        variant: "outline",
        className: "border-info/30 bg-info/10 text-info text-xs",
        label: t("invoices.awaitingPayment"),
      },
      payment_sent: {
        variant: "outline",
        className: "border-info/30 bg-info/10 text-info text-xs",
        label: t("invoices.paymentSent"),
      },
      cancelled: {
        variant: "outline",
        className: "border-destructive/30 bg-destructive/10 text-destructive text-xs",
        label: t("invoices.cancelled"),
      },
    }
    const cfg = statusMap[status] || statusMap.pending
    if (!cfg) return null
    return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>
  }

  async function handleCancelPlan(planOrder: { plan: any; order: any }) {
    setCancellingOrderId(planOrder.order.id)
    try {
      await apiFetch(
        API_ENDPOINTS.orderCancel.replace(":id", String(planOrder.order.id)),
        { method: "POST", body: JSON.stringify({}) }
      )
      setActivePlans(prev => prev.filter(ap => ap.order.id !== planOrder.order.id))
      setOrders(prev => prev.map((o: any) =>
        o.id === planOrder.order.id ? { ...o, status: "cancelled" } : o
      ))
      toast({ title: t("activeSubscription.cancelled") })
    } catch (e: any) {
      toast({ title: t("activeSubscription.cancelFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setCancellingOrderId(null)
      setShowCancelConfirm(null)
    }
  }

  async function handleSwitchPlan(targetCard: any, targetPlan: any) {
    setSwitchLoading(true)
    try {
      const planId = Number(targetPlan?.id ?? targetCard.id)
      if (!planId || isNaN(planId)) {
        toast({ title: "Invalid plan", variant: "destructive" })
        return
      }
      const targetAmount = targetCard.price ?? Number(targetPlan?.price ?? 0)
      const res = await apiFetch(API_ENDPOINTS.orders, {
        method: "POST",
        body: JSON.stringify({
          planId,
          amount: targetAmount,
          description: targetCard.name,
          activateMode,
          items: JSON.stringify([{ description: targetCard.name, quantity: 1, price: targetAmount }]),
        }),
      })
      if (res?.order?.id) {
        if (targetAmount === 0) {
          if (activateMode === 'renewal') {
            toast({ title: t("currentSubscription.queued"), description: targetCard.name })
          } else {
            toast({ title: t("currentSubscription.switched"), description: targetCard.name })
          }
          setTimeout(() => window.location.reload(), 1000)
        } else {
          router.push(`/dashboard/billing/checkout?order=${res.order.id}`)
        }
      }
    } catch (e: any) {
      toast({ title: t("errors.orderCreateFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setSwitchLoading(false)
      setConfirmSwitch(null)
    }
  }

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

    apiFetch("/api/public/regional-prices")
      .then((data) => {
        if (Array.isArray(data)) {
          const map: Record<number, Record<string, number>> = {}
          for (const rp of data) {
            if (!map[rp.planId]) map[rp.planId] = {}
            map[rp.planId][rp.countryCode] = rp.price
          }
          setRegionalPrices(map)
        }
      })
      .catch(() => {})

    apiFetch(API_ENDPOINTS.orders)
      .then(async (data) => {
        const sortedOrders = Array.isArray(data)
          ? [...data].sort((a: any, b: any) => {
              const aDate = new Date(a.createdAt || 0).getTime()
              const bDate = new Date(b.createdAt || 0).getTime()
              return bDate - aDate
            })
          : []
        setOrders(sortedOrders)
        if (sortedOrders.length > 0) {
          setLatestOrder(sortedOrders[0])

          const activeOrders = sortedOrders.filter((o: any) => o.status === 'active' && o.planId)
          const resolved = await Promise.all(
            activeOrders.map(async (order: any) => {
              try {
                const plan = await apiFetch(API_ENDPOINTS.planDetail.replace(":id", String(order.planId)))
                return { plan, order }
              } catch {
                return null
              }
            })
          )
          const valid = resolved.filter(Boolean)
          valid.sort((a: any, b: any) =>
            new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime()
          )
          if (valid.length > 1) {
            const newest = valid[0]
            setActivePlans([newest])
          } else {
            setActivePlans(valid)
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
      id: plan.id,
      type: tier,
      effectiveType: tierEffective,
      name: plan.name || portalConfig?.name || t("pricing.customPlan"),
      description: plan.description || portalConfig?.description || "",
      features: featuresFromPlan,
      color: portalConfig?.color,
      icon: portalConfig?.icon,
      price: tier === 'enterprise' ? null : getEffectivePlanPrice(plan),
      hiddenFromBilling: Boolean(plan?.hiddenFromBilling),
      isActive: activePlans.some(ap => Number(ap.plan?.id) === Number(plan.id)),
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

  return (
    <FeatureGuard feature="billing">
      <>
        <div data-guide-id="billing-panel">
        <PanelHeader title={t("header.title")} description={t("header.description")} />
      </div>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
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
                primaryPlan?.plan?.type === 'enterprise' && !primaryPlan?.order?.amount
                  ? t("stats.priceFromOrder")
                  : taxRate > 0
                    ? t("stats.includesTax", { taxRate: taxRate.toString(), country: currentUser?.billingCountry || t("stats.yourBillingCountry") })
                    : undefined
              }
            />
            <StatCard title={t("stats.totalInvoices")} value={ordersLoading ? '...' : String(orders.length)} icon={Receipt} />
            <StatCard
              title={t("stats.planExpires")}
              value={activePlanExpires ? new Date(activePlanExpires).toLocaleDateString() : t("common.na")}
              icon={Calendar}
              subtitle={primaryPlan ? undefined : t("stats.managedViaSales")}
            />
          </div>

          {/* Tax Information */}
          <div className="border border-border bg-card p-5 min-w-0 box-border overflow-hidden">
            <SectionHeader
              title={t("tax.title")}
              description={t("tax.description")}
            />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.billingCountry")}</p>
                <p className="text-foreground font-medium">{currentUser?.billingCountry || t("tax.notSet")}</p>
              </div>
              <div className="border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.taxRate")}</p>
                <p className="text-foreground font-medium">{taxRate.toFixed(2)}%</p>
              </div>
              <div className="border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.preTaxMonthly")}</p>
                <p className="text-foreground font-medium">{activeTaxBreakdown ? formatMoney(activeTaxBreakdown.base, normalizedCurrency) : t("common.na")}</p>
              </div>
              <div className="border border-border bg-secondary/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("tax.taxAmount")}</p>
                <p className="text-foreground font-medium">{activeTaxBreakdown ? formatMoney(activeTaxBreakdown.tax, normalizedCurrency) : t("common.na")}</p>
              </div>
            </div>
          </div>

          {/* Live Active Plan Details */}
          {activePlans.length > 0 && (
            <div className="border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
              <SectionHeader
                title={activePlans.length === 1 ? t("activeSubscription.title") : t("activeSubscription.title") + ` (${activePlans.length})`}
                description={activePlans[0].order.description || (activePlans[0].plan.type ? getPortalMarker(activePlans[0].plan.type) + " " + t("common.plan") : t("activeSubscription.descriptionFallback"))}
                action={
                  <button
                    onClick={() => setShowCancelConfirm(activePlans[0])}
                    className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <XCircle className="h-4 w-4" />
                    {t("activeSubscription.cancelRenewal")}
                  </button>
                }
              />
              <div className="mt-4 flex flex-col gap-6">
                {activePlans.map(({ plan, order }) => (
                  <div key={plan.id} className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-foreground">
                          {order.description && order.description !== plan.name
                            ? order.description
                            : plan.name}
                        </h3>
                        {order.status === "active" && (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-0 text-xs">{t("activeSubscription.activeBadge")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        #{order.id} · {t("activeSubscription.created")} {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                      {plan.features?.list && Array.isArray(plan.features.list) && (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {plan.features.list.map((f: string) => (
                            <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Check className="h-3.5 w-3.5 text-success shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-primary">
                        {plan.type === 'enterprise'
                          ? (order?.amount ? formatPrice(Number(order.amount), true) : t("pricing.priceVaries"))
                          : `${formatPrice(Number(getEffectivePlanPrice(plan) || order?.amount || 0), true)}${t("common.perMonth")}`}
                      </p>
                      {order?.expiresAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("activeSubscription.renews")} {new Date(order.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t border-border pt-4 text-sm text-muted-foreground">
                  <p>{t("activeSubscription.configuredLimits")}</p>
                  <ul className="mt-1 space-y-1">
                    <li>{t("activeSubscription.memory")}: <span className="text-foreground font-medium">{currentUser?.limits?.memory ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.disk")}: <span className="text-foreground font-medium">{currentUser?.limits?.disk ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.cpu")}: <span className="text-foreground font-medium">{currentUser?.limits?.cpu ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.serverLimit")}: <span className="text-foreground font-medium">{currentUser?.limits?.serverLimit ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.ports")}: <span className="text-foreground font-medium">{currentUser?.limits?.portsPerServer ?? currentUser?.limits?.portCount ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.tunnelPorts")}: <span className="text-foreground font-medium">{currentUser?.limits?.tunnelPortCount ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.emailDailyLimit")}: <span className="text-foreground font-medium">{currentUser?.limits?.emailSendDailyLimit ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.emailQueueLimit")}: <span className="text-foreground font-medium">{currentUser?.limits?.emailSendQueueLimit ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.databases")}: <span className="text-foreground font-medium">{currentUser?.limits?.databases ?? t("common.unlimited")}</span></li>
                    <li>{t("activeSubscription.backups")}: <span className="text-foreground font-medium">{currentUser?.limits?.backups ?? t("common.unlimited")}</span></li>
                  </ul>
                </div>
              </div>

              {/* Cancel Confirmation */}
              {showCancelConfirm && (
                <div className="border border-destructive/30 bg-destructive/5 p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{t("activeSubscription.cancelConfirmTitle")}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("activeSubscription.cancelConfirmDescription")}
                      </p>
                      {showCancelConfirm.order.expiresAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("activeSubscription.currentExpires")}: {new Date(showCancelConfirm.order.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={() => handleCancelPlan(showCancelConfirm)}
                          disabled={cancellingOrderId === showCancelConfirm.order.id}
                          className="flex items-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {cancellingOrderId === showCancelConfirm.order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          {t("activeSubscription.confirmCancel")}
                        </button>
                        <button
                          onClick={() => setShowCancelConfirm(null)}
                          className="border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground hover:bg-secondary"
                        >
                          {t("activeSubscription.keepPlan")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Plan */}
          <div className="border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
            <SectionHeader
              title={t("currentSubscription.title")}
              description={t("currentSubscription.description")}
              action={
                <a
                  href="mailto:sales@ecli.app"
                  className="flex items-center gap-2 border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                 data-telemetry="link:email">
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
                    className={`border p-5 transition-all ${
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
                    {planCard.isActive && (
                      <div className="mt-4 flex w-full items-center justify-center gap-2 border border-primary/30 bg-primary/10 py-2 text-xs font-medium text-primary">
                        <Check className="h-3 w-3" />
                        {t("currentSubscription.currentPlan")}
                      </div>
                    )}
                    {!planCard.isActive && planCard.type === 'educational' && currentUser?.portalType !== 'educational' && (HACKCLUB_STUDENT_ENABLED || GITHUB_STUDENT_ENABLED) && (
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
                        className="mt-4 flex w-full items-center justify-center gap-2 border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                       data-telemetry="billing:async">
                        {t("currentSubscription.connect")} {HACKCLUB_STUDENT_ENABLED ? 'Hack Club' : 'GitHub'}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {!planCard.isActive && planCard.type === 'enterprise' && (
                      <a
                        href="mailto:sales@ecli.app"
                        className="mt-4 flex w-full items-center justify-center gap-2 border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                       data-telemetry="link:email">
                        {t("currentSubscription.contactSales")}
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                    {!planCard.isActive && livePlanCards.length > 0 && planCard.type !== 'enterprise' && !(planCard.type === 'educational' && (HACKCLUB_STUDENT_ENABLED || GITHUB_STUDENT_ENABLED)) && (
                      <button
                        onClick={() => {
                          const livePlan = livePlanCards.find((lp: any) => lp.key === planCard.key)
                          setConfirmSwitch({ targetCard: planCard, targetPlan: livePlan })
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-2 bg-primary py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        {t("currentSubscription.switchTo")} {planCard.name}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )
              })}
              {livePlanCards.length > 0 && subscriptionCards.length === 0 && (
                <div className="border border-border bg-secondary/20 p-5 text-sm text-muted-foreground lg:col-span-3">
                  {t("currentSubscription.noPlansVisible")}
                </div>
              )}
            </div>
          </div>

          <div className="border border-border bg-card">
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
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{invoice.planName || invoice.description}</p>
                        {invoice.planSpecs && (
                          <p className="text-xs mt-0.5">
                            {[
                              invoice.planSpecs.cpu && `${invoice.planSpecs.cpu}% CPU`,
                              invoice.planSpecs.memory && `${invoice.planSpecs.memory}MB RAM`,
                              invoice.planSpecs.disk && `${invoice.planSpecs.disk}MB Disk`,
                              invoice.planSpecs.serverLimit && `${invoice.planSpecs.serverLimit} servers`,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {invoice.servicePeriod?.months && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {invoice.servicePeriod.months} Month{invoice.servicePeriod.months > 1 ? 's' : ''}
                            {invoice.servicePeriod.from && ` · ${new Date(invoice.servicePeriod.from).toLocaleDateString()}`}
                            {invoice.servicePeriod.to && ` — ${new Date(invoice.servicePeriod.to).toLocaleDateString()}`}
                          </p>
                        )}
                        {invoice.paymentMethodLabel && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {invoice.paymentMethodLabel}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <div className="font-mono text-sm text-foreground">{formatMoney(invoiceBreakdown.total, normalizedCurrency)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(invoiceBreakdown.base, normalizedCurrency)} + {formatMoney(invoiceBreakdown.tax, normalizedCurrency)} {t("invoices.tax")}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {getStatusBadge(invoice.status)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(invoice.status === "pending" || invoice.status === "awaiting_payment") && (
                            <button
                              onClick={() => router.push(`/dashboard/billing/checkout?order=${invoice.id}`)}
                              className="flex items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                            >
                              <Wallet className="h-3 w-3" />
                              {t("invoices.pay")}
                            </button>
                          )}
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
                            className="p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                           data-telemetry="billing:async">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ScrollArea>

      {confirmSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmSwitch(null)}>
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">{t("currentSubscription.switchTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("currentSubscription.switchDescription", {
                current: activePlanTitle || getPortalMarker(userPlanType),
                target: confirmSwitch.targetCard.name,
              })}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {((currentUser?.portalType && currentUser.portalType !== 'free') || activePlans.length > 0) && (
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="flex flex-col gap-2">
                    <label className={`flex items-center gap-2 p-2 cursor-pointer border transition-colors ${activateMode === 'now' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                      <input type="radio" name="activateMode" checked={activateMode === 'now'} onChange={() => setActivateMode('now')} className="accent-primary"  data-telemetry="billing:input:activatemode"/>
                      <span className="text-sm text-foreground">{t("currentSubscription.activateNow")}</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 cursor-pointer border transition-colors ${activateMode === 'renewal' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                      <input type="radio" name="activateMode" checked={activateMode === 'renewal'} onChange={() => setActivateMode('renewal')} className="accent-primary"  data-telemetry="billing:input:activatemode"/>
                      <span className="text-sm text-foreground">{t("currentSubscription.activateOnRenewal")}</span>
                    </label>
                  </div>
                </div>
              )}
              <button
                onClick={() => handleSwitchPlan(confirmSwitch.targetCard, confirmSwitch.targetPlan)}
                disabled={switchLoading}
                className="flex items-center justify-center gap-2 bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {switchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {t("currentSubscription.confirmSwitch")}
              </button>
              <button
                onClick={() => setConfirmSwitch(null)}
                disabled={switchLoading}
                className="flex items-center justify-center gap-2 border border-border py-3 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
              >
                {t("currentSubscription.goBack")}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  </FeatureGuard>
  )
}
