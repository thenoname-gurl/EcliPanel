"use client"

import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useToast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"
import { useState, useEffect } from "react"
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Wallet,
  RefreshCw,
  X,
} from "lucide-react"

interface PaymentMethodDef {
  id: string
  type: "crypto" | "paypal" | "bank_transfer" | "other"
  label: string
  enabled: boolean
  address: string
  currency?: string
  network?: string
  instructions?: string
}

const METHOD_TYPES = [
  { value: "crypto", label: "Crypto Wallet" },
  { value: "paypal", label: "PayPal Email" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
]

const NETWORK_OPTIONS = [
  { value: "bitcoin", label: "Bitcoin (BTC)" },
  { value: "ethereum", label: "Ethereum (ETH)" },
  { value: "usdt_erc20", label: "USDT (ERC-20)" },
  { value: "usdt_trc20", label: "USDT (TRC-20)" },
  { value: "litecoin", label: "Litecoin (LTC)" },
  { value: "monero", label: "Monero (XMR)" },
  { value: "solana", label: "Solana (SOL)" },
  { value: "lightning", label: "Lightning Network" },
]

export default function PaymentMethodsTab() {
  const t = useTranslations("adminPaymentMethodsTab")
  const { toast } = useToast()

  const [methods, setMethods] = useState<PaymentMethodDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newMethod, setNewMethod] = useState<PaymentMethodDef | null>(null)

  useEffect(() => {
    loadMethods()
  }, [])

  async function loadMethods() {
    setLoading(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.adminPaymentMethods)
      setMethods(res?.methods || [])
    } catch (e) {
      console.error("failed to load payment methods", e)
    } finally {
      setLoading(false)
    }
  }

  function handleAdd() {
    const id = `method_${Date.now()}`
    setNewMethod({
      id,
      type: "crypto",
      label: "",
      enabled: true,
      address: "",
      currency: "BTC",
      network: "bitcoin",
      instructions: "",
    })
    setEditingId(id)
  }

  function handleUpdate(id: string, updates: Partial<PaymentMethodDef>) {
    if (newMethod && id === newMethod.id) {
      setNewMethod({ ...newMethod, ...updates })
      return
    }
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    )
  }

  function handleSaveNew() {
    if (!newMethod) return
    if (!newMethod.label.trim() || !newMethod.address.trim()) return
    setMethods((prev) => [...prev, { ...newMethod, id: newMethod.id }])
    setNewMethod(null)
    setEditingId(null)
  }

  function handleCancelNew() {
    setNewMethod(null)
    setEditingId(null)
  }

  function handleDelete(id: string) {
    setMethods((prev) => prev.filter((m) => m.id !== id))
  }

  function handleToggle(id: string) {
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    )
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.adminPaymentMethods, {
        method: "POST",
        body: JSON.stringify({ methods }),
      })
      toast({
        title: t("toasts.saved"),
      })
    } catch (e: any) {
      toast({
        title: t("toasts.saveFailed"),
        description: e?.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  function renderMethodForm(
    method: PaymentMethodDef,
    isNew: boolean,
    onDelete: () => void,
    onSave?: () => void,
    onCancel?: () => void
  ) {
    return (
      <div className="border border-border bg-secondary/20 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("form.label")}</label>
            <input
              type="text"
              value={method.label}
              onChange={(e) => isNew ? setNewMethod({ ...method, label: e.target.value }) : handleUpdate(method.id, { label: e.target.value })}
              placeholder={t("form.labelPlaceholder")}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("form.type")}</label>
            <select
              value={method.type}
              onChange={(e) => {
                const type = e.target.value as PaymentMethodDef["type"]
                isNew ? setNewMethod({ ...method, type }) : handleUpdate(method.id, { type })
              }}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              {METHOD_TYPES.map((mt) => (
                <option key={mt.value} value={mt.value}>{mt.label}</option>
              ))}
            </select>
          </div>
          {method.type === "crypto" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("form.currency")}</label>
                <input
                  type="text"
                  value={method.currency || ""}
                  onChange={(e) => isNew ? setNewMethod({ ...method, currency: e.target.value }) : handleUpdate(method.id, { currency: e.target.value })}
                  placeholder="BTC"
                  className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("form.network")}</label>
                <select
                  value={method.network || ""}
                  onChange={(e) => isNew ? setNewMethod({ ...method, network: e.target.value }) : handleUpdate(method.id, { network: e.target.value })}
                  className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">{t("form.selectNetwork")}</option>
                  {NETWORK_OPTIONS.map((no) => (
                    <option key={no.value} value={no.value}>{no.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">{t("form.address")}</label>
            <input
              type="text"
              value={method.address}
              onChange={(e) => isNew ? setNewMethod({ ...method, address: e.target.value }) : handleUpdate(method.id, { address: e.target.value })}
              placeholder={method.type === "crypto" ? t("form.addressPlaceholderCrypto") : method.type === "paypal" ? t("form.addressPlaceholderPaypal") : t("form.addressPlaceholder")}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">{t("form.instructions")} <span className="text-muted-foreground/50">({t("form.optional")})</span></label>
            <input
              type="text"
              value={method.instructions || ""}
              onChange={(e) => isNew ? setNewMethod({ ...method, instructions: e.target.value }) : handleUpdate(method.id, { instructions: e.target.value })}
              placeholder={t("form.instructionsPlaceholder")}
              className="w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => handleToggle(method.id)}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              method.enabled ? "text-emerald-400" : "text-muted-foreground"
            }`}
          >
            <div className={`h-3 w-3 rounded-full ${method.enabled ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
            {method.enabled ? t("form.enabled") : t("form.disabled")}
          </button>
          <div className="flex items-center gap-2">
            {isNew ? (
              <>
                <button
                  onClick={onSave}
                  className="flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Save className="h-3 w-3" />
                  {t("actions.save")}
                </button>
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  {t("actions.cancel")}
                </button>
              </>
            ) : (
              <button
                onClick={onDelete}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadMethods}
              className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={t("actions.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              {t("actions.addMethod")}
            </button>
          </div>
        </div>
      </div>

      {/* Methods List */}
      <div className="flex flex-col gap-3">
        {methods.map((method) => (
          <div key={method.id}>
            {renderMethodForm(
              method,
              false,
              () => handleDelete(method.id)
            )}
          </div>
        ))}
        {newMethod && (
          <div className="border border-primary/30 bg-primary/5 p-1">
            {renderMethodForm(
              newMethod,
              true,
              () => handleCancelNew(),
              () => handleSaveNew(),
              () => handleCancelNew()
            )}
          </div>
        )}
        {methods.length === 0 && !newMethod && (
          <div className="border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
            <div className="h-12 w-12 bg-primary/10 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-primary/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t("states.emptyTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("states.emptySubtitle")}</p>
            </div>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("actions.addMethod")}
            </button>
          </div>
        )}
      </div>

      {/* Save All */}
      <div className="border border-primary/30 bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("footer.changesCount", { count: methods.length })}
          </p>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-1.5 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("actions.saveAll")}
          </button>
        </div>
      </div>
    </div>
  )
}
