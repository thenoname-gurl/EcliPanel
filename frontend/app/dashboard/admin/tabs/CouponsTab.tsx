"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useToast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  RefreshCw,
  Dice5,
  Copy,
  Check,
  Clock,
  Calendar,
  Tag,
} from "lucide-react"

interface CouponData {
  id: number
  code: string
  discountType: string
  discountValue: number
  minOrderAmount?: number | null
  maxDiscountAmount?: number | null
  maxUsesTotal?: number | null
  maxUsesPerUser?: number | null
  currentUsesTotal: number
  expiresAt?: string | null
  isActive: boolean
  createdBy?: number | null
  createdAt: string
}

export default function CouponsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminCouponsTab")
  const { toast } = useToast()
  const panelSettings = ctx?.panelSettings || {}
  const billingCurrency = panelSettings?.billingCurrency || "USD"

  const [coupons, setCoupons] = useState<CouponData[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CouponData | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formCode, setFormCode] = useState("")
  const [formDiscountType, setFormDiscountType] = useState<string>("percentage")
  const [formDiscountValue, setFormDiscountValue] = useState("")
  const [formMinOrderAmount, setFormMinOrderAmount] = useState("")
  const [formMaxDiscountAmount, setFormMaxDiscountAmount] = useState("")
  const [formMaxUsesTotal, setFormMaxUsesTotal] = useState("")
  const [formMaxUsesPerUser, setFormMaxUsesPerUser] = useState("")
  const [formExpiresAt, setFormExpiresAt] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)

  const [bulkCount, setBulkCount] = useState("1")

  async function fetchCoupons() {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.adminCoupons)
      setCoupons(data?.coupons || [])
    } catch (e: any) {
      toast({ title: "Failed to load coupons", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCoupons()
  }, [])

  function resetForm() {
    setFormCode("")
    setFormDiscountType("percentage")
    setFormDiscountValue("")
    setFormMinOrderAmount("")
    setFormMaxDiscountAmount("")
    setFormMaxUsesTotal("")
    setFormMaxUsesPerUser("")
    setFormExpiresAt("")
    setFormIsActive(true)
    setEditTarget(null)
  }

  function openCreate() {
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(coupon: CouponData) {
    setEditTarget(coupon)
    setFormCode(coupon.code)
    setFormDiscountType(coupon.discountType)
    setFormDiscountValue(String(coupon.discountValue))
    setFormMinOrderAmount(coupon.minOrderAmount != null ? String(coupon.minOrderAmount) : "")
    setFormMaxDiscountAmount(coupon.maxDiscountAmount != null ? String(coupon.maxDiscountAmount) : "")
    setFormMaxUsesTotal(coupon.maxUsesTotal != null ? String(coupon.maxUsesTotal) : "")
    setFormMaxUsesPerUser(coupon.maxUsesPerUser != null ? String(coupon.maxUsesPerUser) : "")
    setFormExpiresAt(coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : "")
    setFormIsActive(coupon.isActive)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formDiscountValue || Number(formDiscountValue) <= 0) {
      toast({ title: "Invalid discount value", variant: "destructive" })
      return
    }
    if (formDiscountType === "percentage" && Number(formDiscountValue) > 100) {
      toast({ title: "Percentage must be 0-100", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        code: formCode || undefined,
        discountType: formDiscountType,
        discountValue: Number(formDiscountValue),
        minOrderAmount: formMinOrderAmount ? Number(formMinOrderAmount) : null,
        maxDiscountAmount: formMaxDiscountAmount ? Number(formMaxDiscountAmount) : null,
        maxUsesTotal: formMaxUsesTotal ? Number(formMaxUsesTotal) : null,
        maxUsesPerUser: formMaxUsesPerUser ? Number(formMaxUsesPerUser) : null,
        expiresAt: formExpiresAt || null,
        isActive: formIsActive,
      }

      if (editTarget) {
        await apiFetch(API_ENDPOINTS.adminCouponDetail.replace(":id", String(editTarget.id)), {
          method: "PUT",
          body: JSON.stringify(payload),
        })
        toast({ title: "Coupon updated" })
      } else {
        await apiFetch(API_ENDPOINTS.adminCoupons, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast({ title: "Coupon created" })
      }

      setDialogOpen(false)
      resetForm()
      fetchCoupons()
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this coupon?")) return
    try {
      await apiFetch(API_ENDPOINTS.adminCouponDetail.replace(":id", String(id)), { method: "DELETE" })
      toast({ title: "Coupon deleted" })
      fetchCoupons()
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message, variant: "destructive" })
    }
  }

  async function handleBulkGenerate() {
    const count = Number(bulkCount)
    if (count < 1 || count > 50) {
      toast({ title: "Count must be 1-50", variant: "destructive" })
      return
    }
    if (!formDiscountValue || Number(formDiscountValue) <= 0) {
      toast({ title: "Invalid discount value", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.adminCouponGenerateRandom, {
        method: "POST",
        body: JSON.stringify({
          count,
          discountType: formDiscountType,
          discountValue: Number(formDiscountValue),
          minOrderAmount: formMinOrderAmount ? Number(formMinOrderAmount) : null,
          maxDiscountAmount: formMaxDiscountAmount ? Number(formMaxDiscountAmount) : null,
          maxUsesTotal: formMaxUsesTotal ? Number(formMaxUsesTotal) : null,
          maxUsesPerUser: formMaxUsesPerUser ? Number(formMaxUsesPerUser) : null,
          expiresAt: formExpiresAt || null,
          isActive: formIsActive,
        }),
      })
      toast({ title: `${res?.count || count} coupon(s) generated` })
      setBulkDialogOpen(false)
      resetForm()
      fetchCoupons()
    } catch (e: any) {
      toast({ title: "Failed to generate", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  function formatDiscount(coupon: CouponData): string {
    if (coupon.discountType === "percentage") {
      return `${coupon.discountValue}%`
    }
    return `${billingCurrency} ${coupon.discountValue.toFixed(2)}`
  }

  const formFields = (
    <>
      {!editTarget && (
        <div>
          <Label className="text-xs text-muted-foreground">Code (leave empty to auto-generate)</Label>
          <Input
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            placeholder="e.g. SUMMER20"
            className="mt-1 font-mono"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Discount Type</Label>
          <Select value={formDiscountType} onValueChange={setFormDiscountType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="fixed">Fixed Amount ({billingCurrency})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Discount Value</Label>
          <Input
            type="number"
            value={formDiscountValue}
            onChange={(e) => setFormDiscountValue(e.target.value)}
            placeholder={formDiscountType === "percentage" ? "e.g. 20" : "e.g. 5.00"}
            className="mt-1"
            min={0}
            step={0.01}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Min Order Amount (optional)</Label>
          <Input
            type="number"
            value={formMinOrderAmount}
            onChange={(e) => setFormMinOrderAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1"
            min={0}
            step={0.01}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Max Discount Cap (optional)</Label>
          <Input
            type="number"
            value={formMaxDiscountAmount}
            onChange={(e) => setFormMaxDiscountAmount(e.target.value)}
            placeholder="Unlimited"
            className="mt-1"
            min={0}
            step={0.01}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Max Global Uses (optional)</Label>
          <Input
            type="number"
            value={formMaxUsesTotal}
            onChange={(e) => setFormMaxUsesTotal(e.target.value)}
            placeholder="Unlimited"
            className="mt-1"
            min={0}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Max Per-User Uses (optional)</Label>
          <Input
            type="number"
            value={formMaxUsesPerUser}
            onChange={(e) => setFormMaxUsesPerUser(e.target.value)}
            placeholder="Unlimited"
            className="mt-1"
            min={0}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Expires At (optional)</Label>
        <Input
          type="datetime-local"
          value={formExpiresAt}
          onChange={(e) => setFormExpiresAt(e.target.value)}
          className="mt-1"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formIsActive}
          onChange={(e) => setFormIsActive(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm text-muted-foreground">Active</span>
      </label>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">Coupons</h3>
          <Badge variant="outline" className="text-xs">{coupons.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchCoupons} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            resetForm()
            setBulkDialogOpen(true)
          }}>
            <Dice5 className="h-4 w-4 mr-1" />
            Generate Random
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Create Coupon
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="border border-border bg-secondary/10 p-8 text-center text-sm text-muted-foreground">
          <Tag className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No coupons created yet.</p>
        </div>
      ) : (
        <div className="border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="p-3">Code</th>
                  <th className="p-3">Discount</th>
                  <th className="p-3">Usage</th>
                  <th className="p-3">Limits</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b border-border hover:bg-secondary/10 transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => copyCode(coupon.code)}
                        className="font-mono font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        {coupon.code}
                        {copiedCode === coupon.code ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-30" />
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-foreground">{formatDiscount(coupon)}</span>
                      {coupon.minOrderAmount != null && (
                        <span className="block text-xs text-muted-foreground">Min {billingCurrency} {coupon.minOrderAmount.toFixed(2)}</span>
                      )}
                      {coupon.maxDiscountAmount != null && (
                        <span className="block text-xs text-muted-foreground">Max {billingCurrency} {coupon.maxDiscountAmount.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-foreground">{coupon.currentUsesTotal}</span>
                      {coupon.maxUsesTotal != null && (
                        <span className="text-muted-foreground"> / {coupon.maxUsesTotal}</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {coupon.maxUsesPerUser != null && (
                        <span className="block">Per user: {coupon.maxUsesPerUser}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {coupon.expiresAt ? (
                        <span className={`text-xs flex items-center gap-1 ${new Date(coupon.expiresAt) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                          <Calendar className="h-3 w-3" />
                          {new Date(coupon.expiresAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant={coupon.isActive ? "default" : "secondary"} className="text-xs">
                        {coupon.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(coupon)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(coupon.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Coupon" : "Create Coupon"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {editTarget && (
              <div className="flex items-center gap-2 p-2 border border-border bg-secondary/10 rounded">
                <span className="text-xs text-muted-foreground">Code:</span>
                <code className="font-mono text-sm text-foreground">{editTarget.code}</code>
                <span className="text-xs text-muted-foreground ml-auto">Uses: {editTarget.currentUsesTotal}</span>
              </div>
            )}
            {formFields}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {editTarget ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Generate Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Random Coupons</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Number of Coupons (1-50)</Label>
              <Input
                type="number"
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                className="mt-1"
                min={1}
                max={50}
              />
            </div>
            {formFields}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkGenerate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Dice5 className="h-4 w-4 mr-1" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
