"use client"

import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Brain, Loader2, RefreshCw, Shield } from "lucide-react"

export default function FraudTab({ ctx }: { ctx: any }) {
  const {
    setFraudScanningAll,
    fraudScanningAll,
    setFraudAlerts,
    displayedFraudAlerts,
    hideSuspendedFraud,
    setHideSuspendedFraud,
    selectAllFraud,
    setSelectAllFraud,
    setSelectedFraudIds,
    selectedFraudIds,
    confirmAsync,
    setBulkDismissing,
    bulkDismissing,
    redactName,
    redact,
    privateMode,
    setFraudScanning,
    fraudScanning,
    forceRefreshTab,
  } = ctx

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground">AI Fraud Detection</p>
          <p className="text-xs text-muted-foreground mt-0.5">AI scans user billing info for suspicious patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setFraudScanningAll(true)
              try {
                const res = await apiFetch(API_ENDPOINTS.adminFraudScanAll, { method: "POST" })
                alert(`Scan complete — ${res.flagged} user(s) flagged`)
                const data = await apiFetch(API_ENDPOINTS.adminFraudAlerts)
                setFraudAlerts(data || [])
              } catch (e: any) {
                alert("Scan failed: " + e.message)
              } finally {
                setFraudScanningAll(false)
              }
            }}
            disabled={fraudScanningAll}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors disabled:opacity-50"
          >
            {fraudScanningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            {fraudScanningAll ? "Scanning All…" : "Scan All Users"}
          </button>
          <button
            onClick={() => forceRefreshTab("fraud")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {displayedFraudAlerts.length === 0 ? (
        <div className="p-8 text-center">
          <Shield className="h-8 w-8 mx-auto text-success/60 mb-2" />
          <p className="text-sm text-muted-foreground">No fraud alerts — all users look clean</p>
        </div>
      ) : (
        <>
          <div className="p-2 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center text-xs text-muted-foreground gap-2">
                <input type="checkbox" checked={hideSuspendedFraud} onChange={(e) => setHideSuspendedFraud(e.target.checked)} className="accent-primary" />
                Hide suspended
              </label>
              <button
                onClick={() => {
                  const nowAll = !selectAllFraud
                  setSelectAllFraud(nowAll)
                  if (nowAll) setSelectedFraudIds(displayedFraudAlerts.map((a: any) => a.id))
                  else setSelectedFraudIds([])
                }}
                className="text-xs rounded px-2 py-1 border border-border bg-secondary/50 text-foreground"
              >
                {selectAllFraud ? "Unselect All" : "Select All"}
              </button>
              <button
                onClick={async () => {
                  if (selectedFraudIds.length === 0) return
                  if (!(await confirmAsync(`Dismiss ${selectedFraudIds.length} selected fraud alert(s)?`))) return
                  setBulkDismissing(true)
                  try {
                    await apiFetch(API_ENDPOINTS.adminFraudBulkDismiss, { method: "POST", body: JSON.stringify({ ids: selectedFraudIds }) })
                    setFraudAlerts((prev: any[]) => prev.filter((a: any) => !selectedFraudIds.includes(a.id)))
                    setSelectedFraudIds([])
                    setSelectAllFraud(false)
                  } catch (e: any) {
                    alert("Failed to dismiss: " + (e?.message || "error"))
                  } finally {
                    setBulkDismissing(false)
                  }
                }}
                disabled={selectedFraudIds.length === 0 || bulkDismissing}
                className="text-xs rounded px-2 py-1 border border-border bg-secondary/50 text-foreground disabled:opacity-50"
              >
                {bulkDismissing ? "Dismissing…" : `Dismiss Selected (${selectedFraudIds.length})`}
              </button>
            </div>
            <div />
          </div>
          <div className="divide-y divide-border">
            {displayedFraudAlerts.map((alert: any) => (
              <div key={alert.id} className="p-4 flex items-start gap-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    checked={selectedFraudIds.includes(alert.id)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelectedFraudIds((prev: any[]) => {
                        if (checked) return [...prev, alert.id]
                        return prev.filter((id: number) => id !== alert.id)
                      })
                    }}
                    className="mt-1 mr-3"
                  />
                </div>
                <div className="shrink-0 h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {redactName(alert.firstName, alert.lastName)}
                    </span>
                    <span className="text-xs text-muted-foreground">{redact(alert.email)}</span>
                    {alert.suspended && (
                      <Badge className="bg-destructive/20 text-destructive border-0 text-[10px]">Suspended</Badge>
                    )}
                  </div>
                  <p className={privateMode ? "text-xs text-destructive/80 mt-1 blur-sm" : "text-xs text-destructive/80 mt-1"}>
                    {privateMode ? "Sensitive fraud reason redacted" : alert.fraudReason}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {alert.address && <p><span className="text-foreground/60">Address:</span> {redact(alert.address)}{alert.address2 ? `, ${redact(alert.address2)}` : ""}</p>}
                    {alert.billingCity && <p><span className="text-foreground/60">City:</span> {redact(alert.billingCity)}{alert.billingState ? `, ${redact(alert.billingState)}` : ""} {redact(alert.billingZip)}</p>}
                    {alert.billingCountry && <p><span className="text-foreground/60">Country:</span> {redact(alert.billingCountry)}</p>}
                    {alert.billingCompany && <p><span className="text-foreground/60">Company:</span> {redact(alert.billingCompany)}</p>}
                    {alert.phone && <p><span className="text-foreground/60">Phone:</span> {redact(alert.phone)}</p>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Detected {alert.fraudDetectedAt ? new Date(alert.fraudDetectedAt).toLocaleString() : "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(API_ENDPOINTS.adminFraudAction.replace(":id", String(alert.id)), {
                          method: "PUT",
                          body: JSON.stringify({ action: "dismiss" }),
                        })
                        setFraudAlerts((prev: any[]) => prev.filter((a: any) => a.id !== alert.id))
                      } catch (e: any) {
                        alert("Failed: " + e.message)
                      }
                    }}
                    className="rounded-md border border-border bg-secondary/50 px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
                  >
                    Dismiss
                  </button>
                  {!alert.suspended && (
                    <button
                      onClick={async () => {
                        if (!(await confirmAsync(`Suspend user ${alert.firstName} ${alert.lastName}?`))) return
                        try {
                          await apiFetch(API_ENDPOINTS.adminFraudAction.replace(":id", String(alert.id)), {
                            method: "PUT",
                            body: JSON.stringify({ action: "suspend" }),
                          })
                          setFraudAlerts((prev: any[]) => prev.map((a: any) => a.id === alert.id ? { ...a, suspended: true } : a))
                        } catch (e: any) {
                          alert("Failed: " + e.message)
                        }
                      }}
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setFraudScanning(true)
                      try {
                        const res = await apiFetch(API_ENDPOINTS.adminFraudScan.replace(":id", String(alert.id)), { method: "POST" })
                        if (!res.isSuspicious) {
                          setFraudAlerts((prev: any[]) => prev.filter((a: any) => a.id !== alert.id))
                        } else {
                          setFraudAlerts((prev: any[]) => prev.map((a: any) => a.id === alert.id ? { ...a, fraudReason: res.reasons?.join("; ") } : a))
                        }
                      } catch (e: any) {
                        alert("Re-scan failed: " + e.message)
                      } finally {
                        setFraudScanning(false)
                      }
                    }}
                    disabled={fraudScanning}
                    className="rounded-md border border-border bg-secondary/50 px-3 py-1 text-xs text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors disabled:opacity-50"
                  >
                    Re-scan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
