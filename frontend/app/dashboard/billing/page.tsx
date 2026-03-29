"use client"

import { PanelHeader } from "@/components/panel/header"
import { StatCard, SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { PORTALS, API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { useEffect, useState } from "react"
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
  const { user, refreshUser } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [activePlan, setActivePlan] = useState<{ plan: any; order: any } | null>(null)
  const [latestOrder, setLatestOrder] = useState<any | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [demoActiveUntil, setDemoActiveUntil] = useState<string | null>(null)
  const [demoUsed, setDemoUsed] = useState(false)

  const portalMarkerByTier: Record<string, string> = {
    free: "Free Portal",
    paid: "Paid Portal",
    educational: "Educational Portal",
    enterprise: "Enterprise Portal",
  }
  const getPortalMarker = (tier?: string) => {
    if (!tier) return "Free Portal"
    return portalMarkerByTier[String(tier).toLowerCase()] ?? "Free Portal"
  }

  const userPlanType = (user?.portalType ?? user?.tier ?? 'free').toString().toLowerCase()
  const activeTierRaw = (activePlan?.plan?.type ?? userPlanType).toString().toLowerCase()
  const activeTierEffective = (activeTierRaw === 'educational' ? 'paid' : activeTierRaw) as keyof typeof PORTALS
  const activeTierLabel = activeTierRaw === 'educational' ? 'educational' : activeTierRaw
  const currentPlan = PORTALS[activeTierEffective] ?? PORTALS.free

  const userPlanLabel = userPlanType === 'enterprise' ? 'Enterprise Portal' : getPortalMarker(userPlanType)
  const activePlanTitle = activePlan?.plan?.name ?? userPlanLabel
  const activePlanType = activePlan?.plan?.type ?? userPlanType
  const activePlanPrice = activePlan
    ? activePlan.plan.type === 'enterprise'
      ? activePlan.order?.amount
        ? `$${Number(activePlan.order.amount).toFixed(2)}`
        : 'Price Varies'
      : `$${Number(activePlan.plan.price ?? currentPlan.price ?? 0).toFixed(2)}`
    : currentPlan.id === 'free'
      ? '$0'
      : currentPlan.id === 'paid'
        ? '$12.00'
        : 'Custom'
  const activePlanExpires = activePlan?.order?.expiresAt || null

  useEffect(() => {
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
      setDemoActiveUntil(user.demoExpiresAt || null)
      setDemoUsed(!!user.demoUsed)
    }
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
      id: tier || String(plan.id),
      type: tier,
      effectiveType: tierEffective,
      name: plan.name || portalConfig?.name || "Custom Plan",
      description: plan.description || portalConfig?.description || "",
      features: featuresFromPlan,
      color: portalConfig?.color,
      icon: portalConfig?.icon,
      price: tier === 'enterprise' ? null : Number(plan?.price ?? 0),
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

  const subscriptionCards = livePlanCards.length > 0 ? livePlanCards : fallbackCards

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
      setDemoError(err.message || 'Failed to start demo mode')
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
      toast({ title: 'Demo ended', description: 'Your demo session has ended and your account is restored.' })
    } catch (err: any) {
      setDemoError(err.message || 'Failed to finish demo mode')
    } finally {
      setDemoLoading(false)
    }
  }

  const normalizedPortalType = String(user?.portalType || user?.tier || '').toLowerCase()
  const isEnterprisePortal = normalizedPortalType === 'enterprise'
  const demoActive = !!demoActiveUntil && new Date(demoActiveUntil) > new Date()
  const demoExpired = !!demoActiveUntil && new Date(demoActiveUntil) <= new Date()
  const showDemoPanel = !!user && (demoActive || (!demoUsed && !isEnterprisePortal))

  return (
    <>
      <div data-guide-id="billing-panel">
        <PanelHeader title="Billing" description="Manage your subscription and payment methods" />
      </div>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Demo */}
          {showDemoPanel ? (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 min-w-0 box-border overflow-hidden">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Demo Mode</h3>
                    <p className="text-sm text-muted-foreground">
                      Demo mode simulates temporary enterprise access with limited resources
                      and provides limited accessibility to AI models such as openai/gpt-oss-20b which 
                      can be used in AI Studio, AI Chat or for AI assistant (inline suggestions) features.
                      Intended for testing and evaluation purposes before purchasing enterprise plan.
                    </p>
                  </div>
                  <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning">Demo</span>
                </div>
                {demoActive ? (
                  <p className="text-sm text-muted-foreground">Your demo expires at <span className="font-medium text-foreground">{new Date(demoActiveUntil!).toLocaleString()}</span>.</p>
                ) : demoExpired ? (
                  <p className="text-sm text-muted-foreground">Your demo has expired. You can no longer start a new demo.</p>
                ) : demoUsed ? (
                  <p className="text-sm text-muted-foreground">Demo mode has already been used for this account. Contact support if you believe this is a mistake.</p>
                ) : null}
                {demoError && <p className="text-sm text-destructive">{demoError}</p>}
                <p className="text-sm text-muted-foreground">
                  Demo mode is a temporary sandbox. Changes made during demo may not persist after it ends, and infrastructure actions are limited.
                </p>
                <button
                  onClick={demoActive ? finishDemo : startDemo}
                  disabled={(demoUsed && !demoActive) || demoLoading}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {demoLoading ? (demoActive ? 'Finishing…' : 'Starting…') : demoActive ? 'End Demo' : demoUsed ? 'Demo Used' : 'Start Demo'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-[100vw] w-full box-border">
            <StatCard
              title="Current Plan"
              value={activePlanTitle}
              icon={CreditCard}
            />
            <StatCard
              title="Monthly Cost"
              value={activePlanPrice}
              icon={DollarSign}
              subtitle={activePlan?.plan?.type === 'enterprise' && !activePlan?.order?.amount ? 'Price from order or contact sales' : undefined}
            />
            <StatCard title="Total Invoices" value={ordersLoading ? '...' : String(orders.length)} icon={Receipt} />
            <StatCard
              title="Plan Expires"
              value={activePlan?.order?.expiresAt ? new Date(activePlan.order.expiresAt).toLocaleDateString() : 'N/A'}
              icon={Calendar}
              subtitle={activePlan ? undefined : "Managed via sales"}
            />
          </div>

          {/* Live Active Plan Details */}
          {activePlan && (
            <div className="rounded-xl border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
              <SectionHeader
                title="Your Active Subscription"
                description={activePlan.plan.description || "Plan applied by administrator"}
                action={
                  <a
                    href="mailto:sales@ecli.app"
                    className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                  >
                    Manage Subscription
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
                    <p>Configured limits:</p>
                    <ul className="mt-1 space-y-1">
                      <li>Memory: <span className="text-foreground font-medium">{activePlan.plan.memory ?? user?.limits?.memory ?? 'unlimited'}</span></li>
                      <li>Disk: <span className="text-foreground font-medium">{activePlan.plan.disk ?? user?.limits?.disk ?? 'unlimited'}</span></li>
                      <li>CPU: <span className="text-foreground font-medium">{activePlan.plan.cpu ?? user?.limits?.cpu ?? 'unlimited'}</span></li>
                      <li>Server limit: <span className="text-foreground font-medium">{activePlan.plan.serverLimit ?? user?.limits?.serverLimit ?? 'unlimited'}</span></li>
                      <li>Databases: <span className="text-foreground font-medium">{activePlan.plan.databases ?? user?.limits?.databases ?? 'unlimited'}</span></li>
                      <li>Backups: <span className="text-foreground font-medium">{activePlan.plan.backups ?? user?.limits?.backups ?? 'unlimited'}</span></li>
                    </ul>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-primary">
                    {activePlanPrice}
                    {activePlanType !== 'enterprise' && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                  </p>
                  {activePlanExpires && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Renews {new Date(activePlanExpires).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current Plan */}
          <div className="rounded-xl border border-primary/30 bg-card p-6 glow-border min-w-0 box-border overflow-hidden">
            <SectionHeader
              title="Current Subscription"
              description="Your active plan and features. To upgrade or change, contact your administrator."
              action={
                <a
                  href="mailto:sales@ecli.app"
                  className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
                >
                  Request Change
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
                        <Badge className="bg-primary/20 text-primary border-0 text-[10px]">Active</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{planCard.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {planCard.type === 'enterprise' ? 'Price Varies' : planCard.price != null ? `$${Number(planCard.price).toFixed(2)}/mo` : 'Contact Sales'}
                    </p>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {planCard.features.map((feature: string) => (
                        <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Check className="h-3 w-3 text-success" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {(planCard.type === 'educational' && user?.portalType !== 'educational' && (HACKCLUB_STUDENT_ENABLED || GITHUB_STUDENT_ENABLED)) && (
                      <button
                        onClick={async () => {
                          try {
                            const endpoint = HACKCLUB_STUDENT_ENABLED
                              ? API_ENDPOINTS.hackclubStudentStart
                              : API_ENDPOINTS.githubStudentStart
                            const res:any = await apiFetch(endpoint, { method: 'GET' })
                            if (res?.redirect) window.location.href = res.redirect
                          } catch (e:any) {
                            alert(e?.message || 'Failed to start student verification flow')
                          }
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        Connect {HACKCLUB_STUDENT_ENABLED ? 'Hack Club' : 'GitHub'}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {!planCard.isActive && planCard.type !== 'free' && planCard.type !== 'educational' && (
                      <a
                        href="mailto:sales@ecli.app"
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 py-2 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        Contact Sales
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <SectionHeader title="Invoice History" description="Past payments and invoices" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Invoice</th>
                    <th className="px-5 py-3 text-left font-medium">Description</th>
                    <th className="px-5 py-3 text-left font-medium">Date</th>
                    <th className="px-5 py-3 text-left font-medium">Amount</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersLoading ? (
              <tr><td colSpan={6} className="px-5 py-3 text-center text-sm text-muted-foreground">Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-3 text-center text-sm text-muted-foreground">No orders found.</td></tr>
            ) : orders.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                      <td className="px-5 py-3 font-mono text-sm text-foreground">{invoice.id}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{invoice.description}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3 font-mono text-sm text-foreground">{invoice.amount}</td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                          Paid
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/orders/${invoice.id}/invoice`, { credentials: 'include' });
                              if (!res.ok) throw new Error('Failed to fetch invoice');
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
                              alert('Unable to download invoice');
                            }
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
