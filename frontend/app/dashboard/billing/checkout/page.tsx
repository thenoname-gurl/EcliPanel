"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { formatMoney, sanitizeCurrencyCode } from "@/lib/billing-display"
import {
  Wallet,
  Copy,
  Check,
  ArrowLeft,
  Clock,
  Send,
  Loader2,
  AlertTriangle,
  Tag,
  ExternalLink,
} from "lucide-react"

export default function CheckoutPage() {
  const t = useTranslations("checkoutPage")
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get("order")

  const [state, setState] = useState<"loading" | "select_method" | "instructions" | "sent" | "error">("loading")
  const [errorReason, setErrorReason] = useState<string>("")
  const [order, setOrder] = useState<any>(null)
  const [planDetails, setPlanDetails] = useState<any>(null)
  const [methods, setMethods] = useState<any[]>([])
  const [selectedMethod, setSelectedMethod] = useState<string>("")
  const [paymentDetails, setPaymentDetails] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [billingCurrency, setBillingCurrency] = useState("USD")
  const [markingSent, setMarkingSent] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [activateMode, setActivateMode] = useState<"now" | "renewal">("now")
  const [couponCode, setCouponCode] = useState("")
  const [couponApplying, setCouponApplying] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null)
  const [couponError, setCouponError] = useState("")
  const currentUser = user as any
  const hasNonFreePlan = currentUser?.portalType && currentUser.portalType !== 'free'

  const normalizedCurrency = sanitizeCurrencyCode(billingCurrency)

  useEffect(() => {
    const currentOrderId = orderId
    if (!currentOrderId) {
      setState("error")
      setErrorReason("no_order_id")
      return
    }
    const safeOrderId: string = currentOrderId

    async function load() {
      try {
        apiFetch(API_ENDPOINTS.panelSettings)
          .then((data) => setBillingCurrency(data?.billingCurrency || "USD"))
          .catch(() => setBillingCurrency("USD"))

        const [orderData, methodsData] = await Promise.all([
          apiFetch(API_ENDPOINTS.orderDetail.replace(":id", safeOrderId)),
          apiFetch(API_ENDPOINTS.paymentMethods),
        ])

        setOrder(orderData)
        setMethods(methodsData?.methods || [])
        if (orderData?.plan) {
          setPlanDetails(orderData.plan)
        }

        if (orderData?.status === "awaiting_payment" || orderData?.status === "payment_sent") {
          try {
            const statusData = await apiFetch(
              API_ENDPOINTS.orderPaymentStatus.replace(":id", safeOrderId)
            )
            if (statusData?.status === "active") {
              router.push("/dashboard/billing")
              return
            }
            if (statusData?.payment) {
              setPaymentDetails(statusData.payment)
              setState(statusData.status === "payment_sent" ? "sent" : "instructions")
              return
            }
          } catch {}
        }

        if (orderData?.status !== "pending" && orderData?.status !== "awaiting_payment" && orderData?.status !== "payment_sent") {
          if (orderData?.status === "active") {
            router.push("/dashboard/billing")
            return
          }
          setState("error")
          setErrorReason("invalid_status")
          return
        }

        if (methodsData?.methods?.length === 0) {
          setState("error")
          setErrorReason("no_methods")
          return
        }

        if (orderData?.status === "awaiting_payment" || orderData?.status === "payment_sent") {
          setState(orderData.status === "payment_sent" ? "sent" : "instructions")
        } else {
          setState("select_method")
        }
      } catch (e) {
        console.error("failed to load checkout data", e)
        setState("error")
        setErrorReason("load_failed")
      }
    }

    load()
  }, [orderId])

  async function handleSelectMethod() {
    if (!selectedMethod || !orderId) return
    setState("loading")
    try {
      const res = await apiFetch(
        API_ENDPOINTS.orderCheckout.replace(":id", orderId),
        {
          method: "POST",
          body: JSON.stringify({ paymentMethodId: selectedMethod, activateMode }),
        }
      )
      setPaymentDetails(res.payment)
      setState("instructions")
    } catch (e: any) {
      console.error("checkout failed", e)
      setState("error")
    }
  }

  async function handleMarkSent() {
    if (!orderId) return
    setMarkingSent(true)
    try {
      await apiFetch(
        API_ENDPOINTS.orderMarkSent.replace(":id", orderId),
        { method: "POST", body: JSON.stringify({}) }
      )
      setState("sent")
    } catch (e: any) {
      console.error("failed to mark sent", e)
    } finally {
      setMarkingSent(false)
    }
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim() || !orderId) return
    setCouponApplying(true)
    setCouponError("")
    try {
      const res = await apiFetch(API_ENDPOINTS.couponRedeem, {
        method: "POST",
        body: JSON.stringify({ code: couponCode.trim(), orderId: Number(orderId) }),
      })
      if (res?.success) {
        setAppliedCoupon(res.order)
        setCouponCode("")
        if (res.order.autoActivated) {
          router.push("/dashboard/billing")
          return
        }
        setOrder({ ...order, amount: res.order.amount, discountAmount: res.order.discountAmount, couponCode: res.order.couponCode, status: res.order.status })
      } else {
        setCouponError(res?.error || "Failed to apply coupon")
      }
    } catch (e: any) {
      setCouponError(e?.message || "Invalid coupon")
    } finally {
      setCouponApplying(false)
    }
  }

  async function handleCancelOrder() {
    if (!orderId) return
    setCancelling(true)
    try {
      await apiFetch(
        API_ENDPOINTS.orderCancel.replace(":id", orderId),
        { method: "POST", body: JSON.stringify({}) }
      )
      router.push("/dashboard/billing")
    } catch (e: any) {
      toast({ title: t("error.cancelFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setCancelling(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const NETWORK_URI_SCHEMES: Record<string, string> = {
    bitcoin: "bitcoin",
    ethereum: "ethereum",
    litecoin: "litecoin",
    monero: "monero",
  }

  const getWalletUri = (network: string, address: string): string | null => {
    const scheme = NETWORK_URI_SCHEMES[network]
    if (!scheme) return null
    return `${scheme}:${address}`
  }

  const getMethodIcon = (type: string, network?: string) => {
    if (type === "crypto" && network === "monero") {
      return (
        <svg className="h-4 w-4 text-foreground" viewBox="0 0 108 108" fill="none">
          <path d="M54 99C78.8528 99 99 78.8528 99 54C99 29.1472 78.8528 9 54 9C29.1472 9 9 29.1472 9 54C9 78.8528 29.1472 99 54 99Z" fill="currentColor"/>
          <path d="M91.5086 78.1122H73.7488V54L54 73.486L34.2511 54V78.1122H16.4913H15.923C23.8794 90.5888 37.9451 99 54 99C70.0548 99 84.1205 90.729 92.0769 78.1122H91.5086Z" fill="#4C4C4C"/>
          <path d="M24.8991 67.8462V30.7689L54 59.5599L83.1009 30.7689V67.8462H96.5867C98.1483 63.3519 99 58.5768 99 53.5208C99 28.9431 78.8423 9 54 9C29.1577 9 9 28.9431 9 53.5208C9 58.5768 9.85174 63.3519 11.4132 67.8462H24.8991V67.8462Z" fill="#FF6B01"/>
        </svg>
      )
    }
    switch (type) {
      case "crypto": return <Wallet className="h-4 w-4" />
      case "paypal": return (
        <svg className="h-4 w-4" viewBox="0 0 48 48" fill="none">
          <path fill="#002991" d="M38.914 13.35c0 5.574-5.144 12.15-12.927 12.15H18.49l-.368 2.322L16.373 39H7.056l5.605-36h15.095c5.083 0 9.082 2.833 10.555 6.77a9.687 9.687 0 0 1 .603 3.58z"/>
          <path fill="#60CDFF" d="M44.284 23.7A12.894 12.894 0 0 1 31.53 34.5h-5.206L24.157 48H14.89l1.483-9 1.75-11.178.367-2.322h7.497c7.773 0 12.927-6.576 12.927-12.15 3.825 1.974 6.055 5.963 5.37 10.35z"/>
          <path fill="#008CFF" d="M38.914 13.35C37.31 12.511 35.365 12 33.248 12h-12.64L18.49 25.5h7.497c7.773 0 12.927-6.576 12.927-12.15z"/>
        </svg>
      )
      default: return <Wallet className="h-4 w-4" />
    }
  }

  if (state === "error") {
    const errorMessages: Record<string, string> = {
      no_order_id: t("error.missingOrder"),
      invalid_status: t("error.invalidStatus"),
      no_methods: t("error.noPaymentMethods"),
      load_failed: t("error.loadFailed"),
    }
    return (
      <FeatureGuard feature="billing">
        <div data-guide-id="checkout-panel">
          <PanelHeader title={t("title")} description={t("description")} />
        </div>
        <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
          <div className="flex flex-col items-center justify-center gap-4 p-12">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <p className="text-lg text-muted-foreground">{errorMessages[errorReason] || t("error.loadFailed")}</p>
            <button
              onClick={() => router.push("/dashboard/billing")}
              className="flex items-center gap-2 border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("error.backToBilling")}
            </button>
          </div>
        </ScrollArea>
      </FeatureGuard>
    )
  }

  return (
    <FeatureGuard feature="billing">
      <div data-guide-id="checkout-panel">
        <PanelHeader title={t("title")} description={t("description")} />
      </div>
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full min-w-0 box-border">

          {/* Back button */}
          <button
            onClick={() => router.push("/dashboard/billing")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToBilling")}
          </button>

          {/* Order Summary */}
          {order && (
            <div className="border border-border bg-card p-5">
              <SectionHeader title={t("orderSummary")} description={`#${order.id}`} />
              <div className="mt-3 flex flex-col gap-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("orderDescription")}</p>
                    <p className="text-foreground font-medium">{order.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t("orderAmount")}</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatMoney(Number(order.amount ?? 0), normalizedCurrency)}
                    </p>
                  </div>
                </div>

                {/* Coupon */}
                {!appliedCoupon && order.status === "pending" && (
                  <div className="border-t border-border pt-4 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 border border-border bg-secondary/10 px-3 h-9">
                        <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError("") }}
                          onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                          placeholder={t("coupon.placeholder") || "Coupon code"}
                          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none uppercase font-mono"
                        />
                      </div>
                      <button
                        onClick={handleApplyCoupon}
                        disabled={!couponCode.trim() || couponApplying}
                        className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {couponApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("coupon.apply") || "Apply"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-destructive mt-1">{couponError}</p>
                    )}
                  </div>
                )}
                {appliedCoupon && (
                  <div className="border-t border-border pt-4 mt-2">
                    <div className="flex items-center gap-2 p-2 border border-success/30 bg-success/5 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      <span className="text-success font-medium">{t("coupon.applied") || "Coupon applied"}: {appliedCoupon.couponCode}</span>
                      <span className="text-muted-foreground">(-{formatMoney(Number(appliedCoupon.discountAmount ?? 0), normalizedCurrency)})</span>
                    </div>
                  </div>
                )}
                {/* Dates */}
                <div className="border border-border bg-secondary/20 p-3">
                  {(() => {
                    const isQueued = (order.notes || '').includes('queue_for_renewal')
                    const startDate = isQueued && order.expiresAt
                      ? new Date(new Date(order.expiresAt).setMonth(new Date(order.expiresAt).getMonth() - 1))
                      : order.createdAt
                        ? new Date(order.createdAt)
                        : new Date()
                    return (
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">{isQueued ? t("orderStarts") : t("orderCreated")}</p>
                          <p className="text-foreground font-medium">{startDate.toLocaleDateString()}</p>
                        </div>
                        {order.expiresAt && (
                          <div>
                            <p className="text-muted-foreground">{t("orderExpiresAt")}</p>
                            <p className="text-foreground font-medium">{new Date(order.expiresAt).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Plan Specs */}
                <div className="border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground mb-2">{order.description}</p>
                  {planDetails && (() => {
                    const features = Array.isArray(planDetails.features)
                      ? planDetails.features
                      : Array.isArray(planDetails.features?.list)
                        ? planDetails.features.list
                        : []
                    return features.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {features.map((f: string) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-foreground">
                            <Check className="h-3 w-3 text-success shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {state === "loading" && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Method Selection */}
          {state === "select_method" && (
            <div className="border border-border bg-card p-5">
              <SectionHeader
                title={t("selectMethod.title")}
                description={t("selectMethod.description")}
              />
              <div className="mt-4 flex flex-col gap-3">
                {methods.map((method: any) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex items-center gap-3 border p-4 text-left transition-all ${
                      selectedMethod === method.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-secondary/20 hover:border-primary/20"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                      {getMethodIcon(method.type, method.network)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{method.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">{method.type}</p>
                    </div>
                    {selectedMethod === method.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {hasNonFreePlan && (
                  <div className="border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground mb-2">{t("selectMethod.activationTitle")}</p>
                    <div className="flex flex-col gap-2">
                      <label className={`flex items-center gap-2 p-2 cursor-pointer border transition-colors ${activateMode === 'now' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                        <input type="radio" name="activateMode" checked={activateMode === 'now'} onChange={() => setActivateMode('now')} className="accent-primary" />
                        <span className="text-sm text-foreground">{t("selectMethod.activateNow")}</span>
                      </label>
                      <label className={`flex items-center gap-2 p-2 cursor-pointer border transition-colors ${activateMode === 'renewal' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/20'}`}>
                        <input type="radio" name="activateMode" checked={activateMode === 'renewal'} onChange={() => setActivateMode('renewal')} className="accent-primary" />
                        <span className="text-sm text-foreground">{t("selectMethod.activateOnRenewal")}</span>
                      </label>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleSelectMethod}
                  disabled={!selectedMethod}
                  className="flex w-full items-center justify-center gap-2 bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("selectMethod.continue")}
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex w-full items-center justify-center gap-2 border border-destructive/30 bg-destructive/10 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  {t("selectMethod.cancelOrder")}
                </button>
              </div>
            </div>
          )}

          {/* Payment Instructions */}
          {(state === "instructions" || state === "sent") && paymentDetails && (
            <div className="border border-primary/30 bg-card p-5 glow-border">
              <SectionHeader
                title={t("instructions.title")}
                description={t("instructions.description")}
              />
              <div className="mt-4 flex flex-col gap-4">
                {/* Method info */}
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    {getMethodIcon(paymentDetails.type, paymentDetails.network)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{paymentDetails.label}</p>
                    {paymentDetails.type === "crypto" && (paymentDetails.currency || paymentDetails.network) && (
                      <p className="text-xs text-muted-foreground">
                        {paymentDetails.currency}
                        {paymentDetails.network ? ` · ${paymentDetails.network}` : ""}
                      </p>
                    )}
                    {paymentDetails.type === "paypal" && (
                      <p className="text-xs text-muted-foreground">PayPal</p>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("instructions.amountToSend")}</p>
                  <p className="text-3xl font-bold text-primary">
                    {formatMoney(Number(order?.amount ?? 0), normalizedCurrency)}
                  </p>
                </div>

                {/* Address */}
                <div className="border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    {paymentDetails.type === "crypto" ? t("instructions.walletAddress") : t("instructions.payTo")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all text-sm text-foreground font-mono">
                      {paymentDetails.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(paymentDetails.address)}
                      className="shrink-0 p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Quick Action: Open in Wallet */}
                {paymentDetails.type === "crypto" && paymentDetails.network && NETWORK_URI_SCHEMES[paymentDetails.network] && (
                  <a
                    href={getWalletUri(paymentDetails.network, paymentDetails.address) ?? "#"}
                    className="flex items-center justify-center gap-2 border border-primary/30 bg-primary/5 py-3 text-sm font-medium text-primary transition-all hover:bg-primary/10 hover:border-primary/50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in {paymentDetails.network.charAt(0).toUpperCase() + paymentDetails.network.slice(1)} Wallet
                  </a>
                )}

                {/* Instructions */}
                {paymentDetails.instructions && (
                  <div className="border border-warning/20 bg-warning/5 p-3 text-sm">
                    <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-warning" />
                    <span className="text-warning-foreground">{paymentDetails.instructions}</span>
                  </div>
                )}

                {/* Action buttons */}
                {state === "instructions" && (
                  <>
                    <div className="border border-border bg-secondary/20 p-3 text-sm text-muted-foreground text-center">
                      <Clock className="inline h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      {t("instructions.processingTime")}
                    </div>
                    <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground text-center">
                      <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5 text-destructive" />
                      {t("instructions.fraudWarning")}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button
                          onClick={handleMarkSent}
                          disabled={markingSent}
                          className="flex flex-1 items-center justify-center gap-2 bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {markingSent ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {t("instructions.markSent")}
                        </button>
                        <button
                          onClick={() => router.push("/dashboard/billing")}
                          className="flex items-center justify-center gap-2 border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
                        >
                          {t("instructions.later")}
                        </button>
                      </div>
                      <button
                        onClick={handleCancelOrder}
                        disabled={cancelling}
                        className="flex w-full items-center justify-center gap-2 border border-destructive/30 bg-destructive/10 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                      >
                        {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                        {t("instructions.cancelOrder")}
                      </button>
                    </div>
                  </>
                )}

                {/* Sent confirmation */}
                {state === "sent" && (
                  <div className="border border-success/30 bg-success/5 p-4 text-center">
                    <Check className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="font-medium text-success">{t("instructions.sentTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("instructions.sentDescription")}</p>
                    <p className="text-xs text-muted-foreground mt-2 opacity-70">
                      <Clock className="inline h-3 w-3 mr-1" />
                      {t("instructions.processingTime")}
                    </p>
                    <button
                      onClick={() => router.push("/dashboard/billing")}
                      className="mt-4 flex items-center gap-2 mx-auto border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {t("instructions.backToBilling")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}