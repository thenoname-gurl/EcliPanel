"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { Server, RefreshCw, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableLoading, TableEmpty, TableError } from "@/components/ui/table-states"

interface TransferServer {
  uuid: string; name?: string; nodeId: number; destinationNodeId: number; createdAt: string
}

export default function TransfersTab() {
  const t = useTranslations("serverDetailPage")
  const [transfers, setTransfers] = useState<TransferServer[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [nodes, setNodes] = useState<any[]>([])

  const load = async () => {
    try {
      const nodeData = await apiFetch("/api/admin/nodes")
      const nodeList = Array.isArray(nodeData) ? nodeData : nodeData?.data || nodeData?.nodes || []
      setNodes(nodeList)

      const allTransfers: TransferServer[] = []
      for (const node of nodeList) {
        try {
          const data = await apiFetch(`/api/admin/nodes/${node.id}/servers/transfers`)
          if (data?.transferring) allTransfers.push(...data.transferring)
        } catch {}
      }
      setTransfers(allTransfers)
    } catch (e: any) {
      setError(e?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (transfers.length === 0) return
    const poll = setInterval(async () => {
      const map: Record<string, any> = {}
      for (const ts of transfers) {
        try {
          const data = await apiFetch(`/api/servers/v1/${ts.uuid}/transfer`)
          if (data) map[ts.uuid] = data
        } catch {}
      }
      setProgressMap(map)
    }, 2000)
    return () => clearInterval(poll)
  }, [transfers])

  const getNodeName = (id: number) => nodes.find(n => n.id === id)?.name || `Node #${id}`

  if (loading) return <TableLoading message={t("states.loadingServers") || "Loading transfers..."} />
  if (error) return <TableError message={error} onRetry={load} />

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("transfer.title") || "Active Transfers"}</h2>
          <p className="text-xs text-muted-foreground">{transfers.length} {t("transfer.transferring")?.toLowerCase() || "transferring"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />{t("actions.refresh") || "Refresh"}</Button>
      </div>

      {transfers.length === 0 ? (
        <TableEmpty message={t("states.empty") || "No active transfers."} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t("header.server") || "Server"}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t("transfer.transferring") || "From → To"}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t("transfer.progress", { pct: "" }).replace(" %", "") || "Progress"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfers.map(ts => {
                const p = progressMap[ts.uuid]
                const pct = p?.bytes_total ? Math.round((p.archive_bytes_processed / p.bytes_total) * 100) : 0
                return (
                  <tr key={ts.uuid} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-xs">{ts.name || ts.uuid.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{ts.uuid}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs">{getNodeName(ts.nodeId)}</span>
                      <ArrowRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                      <span className="text-xs">{getNodeName(ts.destinationNodeId)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-muted rounded-full flex-1 max-w-[120px] overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}