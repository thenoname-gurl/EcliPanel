"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react"

export default function OrdersTab({ ctx }: { ctx: any }) {
  const {
    adminOrders,
    ordersTotal,
    ordersPage,
    ordersQuery,
    ordersLoading,
    setOrdersQuery,
    fetchOrders,
    openIssueOrder,
    openEditOrder,
    cancelOrder,
    deleteOrder,
    privateMode,
    ORDERS_PER,
    issueOrderOpen,
    setIssueOrderOpen,
    ioUserId,
    setIoUserId,
    ioDesc,
    setIoDesc,
    ioPlanId,
    setIoPlanId,
    ioAmount,
    setIoAmount,
    ioExpiresAt,
    setIoExpiresAt,
    ioNotes,
    setIoNotes,
    ioError,
    submitIssueOrder,
    ioLoading,
    plans,
    applyPlanOpen,
    setApplyPlanOpen,
    applyPlanUserId,
    applyPlanId,
    setApplyPlanId,
    applyPlanExpiry,
    setApplyPlanExpiry,
    applyPlanOrgId,
    setApplyPlanOrgId,
    applyPlanNotes,
    setApplyPlanNotes,
    applyPlanError,
    submitApplyPlan,
    applyPlanLoading,
    editOrderOpen,
    setEditOrderOpen,
    editOrderTarget,
    eoDescription,
    setEoDescription,
    eoAmount,
    setEoAmount,
    eoPlanId,
    setEoPlanId,
    eoNotes,
    setEoNotes,
    eoExpiresAt,
    setEoExpiresAt,
    eoStatus,
    setEoStatus,
    eoError,
    submitEditOrder,
    eoLoading,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      {/* Header Bar */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Orders</p>
                <p className="text-xs text-muted-foreground">
                  {ordersTotal ? `${ordersTotal} order${ordersTotal !== 1 ? "s" : ""}` : "Manage plans & resource packs"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={openIssueOrder}
                className="bg-primary text-primary-foreground h-8 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Issue Order</span>
                <span className="sm:hidden">Issue</span>
              </Button>
              <button
                onClick={() => fetchOrders(ordersPage, ordersQuery)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search by user ID or email…"
                  value={ordersQuery}
                  onChange={(e) => setOrdersQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchOrders(1, ordersQuery)}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {ordersQuery && (
                  <button
                    onClick={() => {
                      setOrdersQuery("")
                      fetchOrders(1, "")
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {ordersLoading ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading orders…</p>
          </div>
        </div>
      ) : adminOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Receipt className="h-6 w-6 text-emerald-400/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No orders yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Issue an order to assign a plan or resource pack to a user.
            </p>
          </div>
          <Button size="sm" onClick={openIssueOrder} className="bg-primary text-primary-foreground gap-1.5 mt-1">
            <Plus className="h-3.5 w-3.5" /> Issue Order
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="rounded-xl border border-border bg-card hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Order</th>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Dates</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminOrders.map((order: any) => {
                    const statusConfig: Record<string, { class: string; dot: string }> = {
                      active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                      pending: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                      cancelled: { class: "border-muted-foreground/30 bg-secondary/50 text-muted-foreground", dot: "bg-muted-foreground" },
                      expired: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                    }
                    const sc = statusConfig[order.status] || statusConfig.pending

                    return (
                      <tr key={order.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {order.description || `Order #${order.id}`}
                              </p>
                              {order.planId && (
                                <p className="text-xs text-muted-foreground">
                                  Plan #{privateMode ? "████" : order.planId}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                            #{privateMode ? "████" : order.userId}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-foreground">
                            ${(order.amount ?? 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${sc.class}`}>
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                            {order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                            </div>
                            {order.expiresAt && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" />
                                <span>Expires {new Date(order.expiresAt).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditOrder(order)}
                              title="Edit order"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            {order.status === "active" && (
                              <button
                                onClick={() => cancelOrder(order)}
                                title="Cancel order"
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteOrder(order)}
                              title="Delete order"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="flex flex-col gap-3 md:hidden">
            {adminOrders.map((order: any) => {
              const statusConfig: Record<string, { class: string; dot: string; borderTint: string }> = {
                active: { class: "text-emerald-400", dot: "bg-emerald-400", borderTint: "border-emerald-500/20" },
                pending: { class: "text-warning", dot: "bg-warning", borderTint: "border-warning/20" },
                cancelled: { class: "text-muted-foreground", dot: "bg-muted-foreground", borderTint: "border-border" },
                expired: { class: "text-destructive", dot: "bg-destructive", borderTint: "border-destructive/20" },
              }
              const sc = statusConfig[order.status] || statusConfig.pending

              return (
                <div
                  key={order.id}
                  className={`rounded-xl border bg-card overflow-hidden ${order.status === "active" ? sc.borderTint : "border-border"}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <div className="relative h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4 text-emerald-400" />
                      <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {order.description || `Order #${order.id}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            User #{privateMode ? "████" : order.userId}
                            {order.planId && ` · Plan #${privateMode ? "████" : order.planId}`}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10 capitalize`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount</p>
                      <p className="text-sm font-bold text-foreground">${(order.amount ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Created</p>
                      <p className="text-xs text-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Expires</p>
                      <p className="text-xs text-foreground">
                        {order.expiresAt ? new Date(order.expiresAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Notes (if present) */}
                  {order.notes && (
                    <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
                      <p className="text-[11px] text-muted-foreground italic line-clamp-2">{order.notes}</p>
                    </div>
                  )}

                  {/* Card Actions */}
                  <div className="flex items-center border-t border-border divide-x divide-border">
                    <button
                      onClick={() => openEditOrder(order)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    {order.status === "active" && (
                      <button
                        onClick={() => cancelOrder(order)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                    <button
                      onClick={() => deleteOrder(order)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      {!ordersLoading && adminOrders.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">
              Page <span className="font-medium text-foreground">{ordersPage}</span>
              {ordersTotal ? (
                <>
                  {" "}
                  of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(ordersTotal / ORDERS_PER))}</span>
                </>
              ) : null}
              {ordersTotal ? (
                <span className="hidden sm:inline"> · {ordersTotal} total</span>
              ) : null}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (ordersPage > 1) fetchOrders(ordersPage - 1, ordersQuery)
                }}
                disabled={ordersPage <= 1}
                className="h-8 px-3 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
                <span className="hidden sm:inline ml-1">Previous</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!ordersTotal || ordersPage < Math.ceil((ordersTotal || 0) / ORDERS_PER))
                    fetchOrders(ordersPage + 1, ordersQuery)
                }}
                disabled={ordersTotal ? ordersPage >= Math.ceil(ordersTotal / ORDERS_PER) : adminOrders.length < ORDERS_PER}
                className="h-8 px-3 text-xs"
              >
                <span className="hidden sm:inline mr-1">Next</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>

    <Dialog open={issueOrderOpen} onOpenChange={(open) => !open && setIssueOrderOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Issue Order</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User ID *</label>
            <input type="number" placeholder="User ID" value={ioUserId} onChange={(e) => setIoUserId(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
            <input placeholder="e.g. Monthly hosting plan" value={ioDesc} onChange={(e) => setIoDesc(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan (optional)</label>
              <select value={ioPlanId} onChange={(e) => setIoPlanId(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="">— none —</option>
                {plans.map((p: any) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount ($)</label>
              <input type="number" min="0" step="0.01" value={ioAmount} onChange={(e) => setIoAmount(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At (optional)</label>
            <input type="date" value={ioExpiresAt} onChange={(e) => setIoExpiresAt(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <input placeholder="Internal notes" value={ioNotes} onChange={(e) => setIoNotes(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          {ioError && <p className="text-xs text-destructive">{ioError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIssueOrderOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={submitIssueOrder} disabled={ioLoading} className="bg-primary text-primary-foreground">
            {ioLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Issuing…</> : "Issue Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={applyPlanOpen} onOpenChange={(open) => !open && setApplyPlanOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">Apply Plan to User #{applyPlanUserId}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan *</label>
            <select value={applyPlanId} onChange={(e) => setApplyPlanId(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
              <option value="">— select a plan —</option>
              {plans.map((p: any) => <option key={p.id} value={String(p.id)}>{p.name} ({p.type})</option>)}
            </select>
            {applyPlanId && (() => {
              const p = plans.find((x: any) => x.id === Number(applyPlanId))
              if (!p) return null
              return <p className="text-xs text-muted-foreground">{p.description} · {p.memory ? `${p.memory} MB RAM` : "∞"} · {p.disk ? `${(p.disk / 1024).toFixed(0)} GB` : "∞"} · {p.cpu ? `${p.cpu}% CPU` : "∞"} · {p.serverLimit ?? "∞"} servers</p>
            })()}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At (optional)</label>
            <input type="date" value={applyPlanExpiry} onChange={(e) => setApplyPlanExpiry(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          {(() => {
            const selectedPlan = plans.find((x: any) => x.id === Number(applyPlanId))
            if (!selectedPlan || selectedPlan.type !== 'enterprise') return null
            return (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assign to Organisation ID (optional)</label>
                <input type="number" min="1" placeholder="Leave blank for user-only" value={applyPlanOrgId} onChange={(e) => setApplyPlanOrgId(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                <p className="text-xs text-muted-foreground">If set, the organisation's tier will also be upgraded to enterprise.</p>
              </div>
            )
          })()}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (internal)</label>
            <input placeholder="e.g. Trial period" value={applyPlanNotes} onChange={(e) => setApplyPlanNotes(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          {applyPlanError && <p className="text-xs text-destructive">{applyPlanError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setApplyPlanOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={submitApplyPlan} disabled={applyPlanLoading} className="bg-primary text-primary-foreground">
            {applyPlanLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Applying…</> : "Apply Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={editOrderOpen} onOpenChange={(open) => !open && setEditOrderOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{editOrderTarget ? `Edit Order #${editOrderTarget.id}` : 'Edit Order'}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Modify order details or change status.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
            <input value={eoDescription} onChange={(e) => setEoDescription(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</label>
              <input type="number" value={eoAmount} onChange={(e) => setEoAmount(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan ID</label>
              <input value={eoPlanId} onChange={(e) => setEoPlanId(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <input value={eoNotes} onChange={(e) => setEoNotes(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires At</label>
              <input type="date" value={eoExpiresAt?.split("T")?.[0] || eoExpiresAt} onChange={(e) => setEoExpiresAt(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <input value={eoStatus} onChange={(e) => setEoStatus(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none w-full" />
            </div>
          </div>
          {eoError && <p className="text-xs text-destructive">{eoError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOrderOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={submitEditOrder} disabled={eoLoading} className="bg-primary text-primary-foreground">
            {eoLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
