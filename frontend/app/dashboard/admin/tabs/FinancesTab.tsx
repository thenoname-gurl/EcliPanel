"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { StatCard, SectionHeader } from "@/components/panel/shared"
import { useTranslations } from "next-intl"
import { toast } from "@/hooks/use-toast"
import {
  Wallet,
  TrendingUp,
  Receipt,
  RefreshCw,
  Paperclip,
  Download,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

interface HistoryRow {
  id: number | string
  orderId?: number | null
  date?: string | null
  amount: number
  currency: string
  nature: string
  name: string
  notes: string | null
  status: string
  error: string | null
  invoicePath: string | null
  invoiceLocalId?: number | null
  createdAt: string
  externalId?: string | null
  source?: string | null
  account?: string | null
  category?: string | null
  categoryId?: string | null
  merchant?: string | null
  merchantId?: string | null
  tags?: string[]
  transfer?: any
  updatedAt?: string | null
  local?: {
    id: number
    orderId: number | null
    externalId: string
    status: string
    error: string | null
    sureTransactionId: string | null
  } | null
}

interface FinancesData {
  sure: { name: string | null; balanceCents: number; currency: string | null; updatedAt: string | null } | null
  sureEnabled: boolean
  usdPlnRate: number | null
  sureLast30: { income: number; expense: number }
  panel: { totalPaid: number; paidLast30: number; pendingAwaiting: number; paidCount: number }
  history: HistoryRow[]
}

const MAX_INVOICE_BYTES = 3 * 1024 * 1024

function formatCents(cents: number, currency: string | null): string {
  return `${(Number(cents) / 100).toFixed(2)} ${currency || ""}`.trim()
}

export default function FinancesTab() {
  const t = useTranslations("adminFinancesTab")
  const [data, setData] = useState<FinancesData | null>(null)
  const [sureRows, setSureRows] = useState<HistoryRow[] | null>(null)
  const [sureSummary, setSureSummary] = useState<{ income: number; expense: number; count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [mAmount, setMAmount] = useState("")
  const [mNature, setMNature] = useState<"income" | "expense">("expense")
  const [mName, setMName] = useState("")
  const [mNotes, setMNotes] = useState("")
  const [mInvoice, setMInvoice] = useState<string | null>(null)
  const [mInvoiceName, setMInvoiceName] = useState("")
  const [mSubmitting, setMSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit dialog
  const [editRow, setEditRow] = useState<HistoryRow | null>(null)
  const [eAmount, setEAmount] = useState("")
  const [eNature, setENature] = useState<"income" | "expense">("expense")
  const [eName, setEName] = useState("")
  const [eNotes, setENotes] = useState("")
  const [eInvoice, setEInvoice] = useState<string | null>(null)
  const [eInvoiceName, setEInvoiceName] = useState("")
  const [eSaving, setESaving] = useState(false)
  const [eDate, setEDate] = useState("")
  const [eCurrency, setECurrency] = useState("USD")
  const [eCategoryId, setECategoryId] = useState("")
  const [eMerchantId, setEMerchantId] = useState("")
  const [eTagIds, setETagIds] = useState("")
  const eFileRef = useRef<HTMLInputElement>(null)
  const [rowBusy, setRowBusy] = useState<number | string | null>(null)
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null)

  async function load() {
    setLoading(true)
    setError("")
    try {
      const [finances, sureList] = await Promise.all([
        apiFetch(API_ENDPOINTS.adminFinances),
        apiFetch(`${API_ENDPOINTS.adminFinances}/sure-transactions`)
          .then((r) => (Array.isArray(r?.transactions) ? r : null))
          .catch(() => null),
      ])
      setData(finances)
      setSureRows(sureList?.transactions ?? null)
      setSureSummary(sureList?.summary ?? null)
    } catch (e: any) {
      setError(e?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function readInvoiceFile(file: File, setDataUrl: (v: string) => void, setName: (v: string) => void) {
    if (file.size > MAX_INVOICE_BYTES) {
      toast({ title: t("invoiceTooLarge"), variant: "destructive" })
      return
    }
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      toast({ title: t("invoiceInvalidType"), variant: "destructive" })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDataUrl(String(reader.result || ""))
      setName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function submitManual() {
    const amount = Number(mAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: t("amountInvalid"), variant: "destructive" })
      return
    }
    if (!mName.trim()) {
      toast({ title: t("nameRequired"), variant: "destructive" })
      return
    }
    setMSubmitting(true)
    try {
      const res = await apiFetch(`${API_ENDPOINTS.adminFinances}/manual`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          nature: mNature,
          name: mName.trim(),
          notes: mNotes.trim() || undefined,
          invoiceBase64: mInvoice || undefined,
        }),
      })
      if (res?.success) {
        toast({ title: t("manualSuccess") })
        setMAmount("")
        setMName("")
        setMNotes("")
        setMInvoice(null)
        setMInvoiceName("")
        if (fileRef.current) fileRef.current.value = ""
        load()
      } else {
        toast({ title: t("manualFailed"), description: res?.error || "", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: t("manualFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setMSubmitting(false)
    }
  }

  function openEdit(row: HistoryRow) {
    setEditRow(row)
    setEAmount(String(row.amount ?? ""))
    setENature(row.nature === "expense" ? "expense" : "income")
    setEName(row.name || "")
    setENotes(row.notes || "")
    setEInvoice(null)
    setEInvoiceName("")
    setEDate(String(row.date || (row.createdAt || "").slice(0, 10)))
    setECurrency(row.currency || "USD")
    setECategoryId(row.categoryId || "")
    setEMerchantId(row.merchantId || "")
    setETagIds((row.tags || []).join(", "))
  }

  async function saveEdit() {
    if (!editRow) return
    const amount = Number(eAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: t("amountInvalid"), variant: "destructive" })
      return
    }
    if (!eName.trim()) {
      toast({ title: t("nameRequired"), variant: "destructive" })
      return
    }
    setESaving(true)
    try {
      const res = await apiFetch(`${API_ENDPOINTS.adminFinances}/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount,
          nature: eNature,
          name: eName.trim(),
          notes: eNotes.trim() || undefined,
          invoiceBase64: eInvoice || undefined,
          date: eDate || undefined,
          currency: eCurrency.trim().toUpperCase() || undefined,
          categoryId: eCategoryId.trim() || null,
          merchantId: eMerchantId.trim() || null,
          tagIds: eTagIds.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (res?.success) {
        toast({ title: t("editSuccess") })
        setEditRow(null)
        load()
      } else {
        toast({ title: t("editFailed"), description: res?.error || "", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: t("editFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setESaving(false)
    }
  }

  async function deleteRow(row: HistoryRow) {
    if (!confirm(t("deleteConfirm", { name: row.name }))) return
    setRowBusy(row.id)
    try {
      const res = await apiFetch(`${API_ENDPOINTS.adminFinances}/${row.id}`, { method: "DELETE" })
      if (res?.success) {
        toast({ title: t("deleteSuccess") })
        load()
      } else {
        toast({ title: t("deleteFailed"), description: res?.error || "", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: t("deleteFailed"), description: e?.message, variant: "destructive" })
    } finally {
      setRowBusy(null)
    }
  }

  async function downloadInvoice(row: HistoryRow) {
    try {
      const localId = row.invoiceLocalId ?? row.id
      const res = await fetch(`${API_ENDPOINTS.adminFinances}/invoice/${localId}`, { credentials: "include" })
      if (!res.ok) throw new Error("HTTP " + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `finance-${row.id}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: t("invoiceDownloadFailed"), variant: "destructive" })
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }
  if (!data) return null

  const sureBalance = data.sure
    ? formatCents(data.sure.balanceCents, data.sure.currency)
    : t("notConnected")
  const balanceUsd =
    data.sure && data.usdPlnRate
      ? `≈ $${(data.sure.balanceCents / 100 / data.usdPlnRate).toFixed(2)}`
      : null
  const sureBalanceSubtitle = data.sure?.name
    ? `${t("sureAccount")}: ${data.sure.name}${balanceUsd ? ` · ${balanceUsd}` : ""}`
    : t("sureNotLinked")

  // History comes solely from the Sure gateway. Our local log is internal
  // only (invoice attachments + audit) and never shown here.
  const historyRows: HistoryRow[] = sureRows ?? []
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000
  const sure30 = (sureRows ?? []).reduce(
    (acc, r) => {
      if (new Date(r.createdAt || 0).getTime() < cutoff) return acc
      if (r.nature === "expense") acc.expense += Number(r.amount ?? 0)
      else acc.income += Number(r.amount ?? 0)
      return acc
    },
    { income: 0, expense: 0 }
  )
  const last30Net = sure30.income - sure30.expense

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <SectionHeader title={t("title")} description={t("description")} />
        <button
          onClick={load}
          className="flex items-center gap-1.5 border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          {t("refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t("sureBalance")}
          value={sureBalance}
          icon={Wallet}
          subtitle={sureBalanceSubtitle}
        />
        <StatCard
          title={t("totalPaid")}
          value={sureSummary != null ? `$${sureSummary.income.toFixed(2)}` : t("notConnected")}
          icon={Receipt}
        />
        <StatCard
          title={t("sureLast30")}
          value={`$${last30Net.toFixed(2)}`}
          icon={TrendingUp}
          subtitle={t("sureLast30Hint", {
            income: `$${sure30.income.toFixed(2)}`,
            expense: `$${sure30.expense.toFixed(2)}`,
          })}
        />
      </div>

      <div className="border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {data.sure?.updatedAt
            ? t("sureUpdatedAt", { time: new Date(data.sure.updatedAt).toLocaleString() })
            : t("sureUpdatedNever")}
          {data.usdPlnRate ? ` · ${t("usdPlnRate", { rate: data.usdPlnRate.toFixed(4) })}` : ""}
        </p>
      </div>

      {/* Manual entry */}
      <div className="border border-primary/30 bg-card p-5">
        <SectionHeader title={t("manualTitle")} description={t("manualHint")} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualAmount")}</label>
            <input
              type="number" min="0.01" step="0.01" value={mAmount}
              onChange={(e) => setMAmount(e.target.value)}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualNature")}</label>
            <select
              value={mNature}
              onChange={(e) => setMNature(e.target.value as "income" | "expense")}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="income">{t("income")}</option>
              <option value="expense">{t("expense")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualName")}</label>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder={t("manualNamePlaceholder")}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualNotes")}</label>
            <input
              value={mNotes}
              onChange={(e) => setMNotes(e.target.value)}
              placeholder={t("manualNotesPlaceholder")}
              className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualInvoice")}</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground hover:border-primary/30 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {mInvoiceName || t("manualInvoiceChoose")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) readInvoiceFile(f, setMInvoice, setMInvoiceName)
                }}
              />
              {mInvoice && (
                <button
                  type="button"
                  onClick={() => { setMInvoice(null); setMInvoiceName(""); if (fileRef.current) fileRef.current.value = "" }}
                  className="text-xs text-destructive hover:underline"
                >
                  {t("manualInvoiceRemove")}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("manualInvoiceHint")}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              onClick={submitManual}
              disabled={mSubmitting}
              className="flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {mSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              {t("manualSubmit")}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="border border-border bg-card">
        <div className="border-b border-border p-5">
          <SectionHeader title={t("history")} description={t("historyHint")} />
        </div>
        {sureRows === null && (
          <div className="border-b border-border bg-destructive/5 px-5 py-3 text-sm text-destructive">
            {t("historySourceLocal")}
          </div>
        )}
        {historyRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("noHistory")}</div>
        ) : (
          <div className="divide-y divide-border/50">
            {historyRows.map((row) => {
              const isIncome = row.nature === "income"
              const expanded = expandedRow === row.id
              return (
                <Fragment key={String(row.id)}>
                  <div
                    className={`group cursor-pointer px-5 py-4 transition-colors hover:bg-secondary/30 ${expanded ? "bg-secondary/20" : !row.category ? "bg-yellow-500/[0.04]" : ""}`}
                    onClick={() => setExpandedRow(expanded ? null : row.id)}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={`mt-1 shrink-0 ${isIncome ? "text-success" : "text-destructive"}`}
                        title={isIncome ? t("income") : t("expense")}
                      >
                        {isIncome ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground" title={row.name}>
                            {row.name}
                          </span>
                          {row.merchant && (
                            <span className="truncate text-xs text-muted-foreground">· {row.merchant}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        {row.notes && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground/70" title={row.notes}>
                            {row.notes}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {row.category ? (
                            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {row.category}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                              {t("uncategorized")}
                            </span>
                          )}
                          {row.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={`font-mono text-sm font-semibold ${isIncome ? "text-success" : "text-destructive"}`}>
                          {isIncome ? "+" : "−"}${Number(row.amount ?? 0).toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">{row.currency || "USD"}</span>
                        </span>
                        <div
                          className="flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.invoicePath && row.invoiceLocalId != null && (
                            <button
                              onClick={() => downloadInvoice(row)}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              title={t("invoiceDownload")}
                            >
                              <Download className="h-3 w-3" />
                              {t("receiptBadge")}
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            title={t("editAction")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            disabled={rowBusy === row.id}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            title={t("deleteAction")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {expanded
                        ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-border/50 bg-secondary/20 px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="border border-border bg-card p-4">
                          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("sureFields")}</p>
                          <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 text-sm">
                            <dt className="text-muted-foreground">{t("fieldAccount")}</dt><dd className="text-foreground">{row.account || "—"}</dd>
                            <dt className="text-muted-foreground">{t("fieldCategory")}</dt><dd className="text-foreground">{row.category || t("uncategorized")}</dd>
                            <dt className="text-muted-foreground">{t("fieldMerchant")}</dt><dd className="text-foreground">{row.merchant || "—"}</dd>
                            <dt className="text-muted-foreground">{t("fieldTags")}</dt><dd className="text-foreground">{row.tags && row.tags.length > 0 ? row.tags.join(", ") : t("noTags")}</dd>
                            <dt className="text-muted-foreground">{t("fieldTransfer")}</dt><dd className="text-foreground">{row.transfer ? String(row.transfer?.id ?? JSON.stringify(row.transfer)) : "—"}</dd>
                            <dt className="text-muted-foreground">{t("fieldSource")}</dt><dd className="text-foreground">{row.source || "—"}</dd>
                            <dt className="text-muted-foreground">{t("fieldExternalId")}</dt><dd className="font-mono text-foreground">{row.externalId || "—"}</dd>
                            <dt className="text-muted-foreground">{t("fieldUpdated")}</dt><dd className="text-foreground">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</dd>
                          </dl>
                        </div>
                        <div className="border border-border bg-card p-4">
                          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("localRecord")}</p>
                          {row.local ? (
                            <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 text-sm">
                              <dt className="text-muted-foreground">{t("fieldLocalId")}</dt><dd className="text-foreground">#{row.local.id}</dd>
                              <dt className="text-muted-foreground">{t("fieldOrder")}</dt><dd className="text-foreground">{row.local.orderId ? `#${row.local.orderId}` : "—"}</dd>
                              <dt className="text-muted-foreground">{t("fieldExternalId")}</dt><dd className="font-mono text-foreground">{row.local.externalId}</dd>
                              <dt className="text-muted-foreground">{t("fieldLocalStatus")}</dt><dd className="text-foreground">{row.local.status}</dd>
                              {row.local.error && (
                                <>
                                  <dt className="text-muted-foreground">{t("fieldLocalError")}</dt>
                                  <dd className="text-destructive">{row.local.error}</dd>
                                </>
                              )}
                            </dl>
                          ) : (
                            <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditRow(null)}>
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">{t("editTitle", { id: editRow.id })}</h3>
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualAmount")}</label>
                  <input
                    type="number" min="0.01" step="0.01" value={eAmount}
                    onChange={(e) => setEAmount(e.target.value)}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualNature")}</label>
                  <select
                    value={eNature}
                    onChange={(e) => setENature(e.target.value as "income" | "expense")}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="income">{t("income")}</option>
                    <option value="expense">{t("expense")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fieldDate")}</label>
                  <input
                    type="date" value={eDate}
                    onChange={(e) => setEDate(e.target.value)}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fieldCurrency")}</label>
                  <input
                    value={eCurrency}
                    onChange={(e) => setECurrency(e.target.value)}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fieldCategoryId")}</label>
                  <input
                    value={eCategoryId}
                    onChange={(e) => setECategoryId(e.target.value)}
                    placeholder={t("fieldCategoryIdPlaceholder")}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fieldMerchantId")}</label>
                  <input
                    value={eMerchantId}
                    onChange={(e) => setEMerchantId(e.target.value)}
                    placeholder={t("fieldMerchantIdPlaceholder")}
                    className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fieldTagIds")}</label>
                <input
                  value={eTagIds}
                  onChange={(e) => setETagIds(e.target.value)}
                  placeholder={t("fieldTagIdsPlaceholder")}
                  className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground">{t("fieldTagIdsHint")}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualName")}</label>
                <input
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("manualNotes")}</label>
                <input
                  value={eNotes}
                  onChange={(e) => setENotes(e.target.value)}
                  className="border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {editRow.invoicePath ? t("editInvoiceReplace") : t("editInvoiceAdd")}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => eFileRef.current?.click()}
                    className="flex items-center gap-1.5 border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground hover:border-primary/30 transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {eInvoiceName || t("manualInvoiceChoose")}
                  </button>
                  <input
                    ref={eFileRef}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) readInvoiceFile(f, setEInvoice, setEInvoiceName)
                    }}
                  />
                  {eInvoice && (
                    <button
                      type="button"
                      onClick={() => { setEInvoice(null); setEInvoiceName(""); if (eFileRef.current) eFileRef.current.value = "" }}
                      className="text-xs text-destructive hover:underline"
                    >
                      {t("manualInvoiceRemove")}
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("manualInvoiceHint")}</p>
              </div>
              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  onClick={() => setEditRow(null)}
                  className="border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground hover:bg-secondary"
                >
                  {t("cancelAction")}
                </button>
                <button
                  onClick={saveEdit}
                  disabled={eSaving}
                  className="flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {eSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("editSave")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
