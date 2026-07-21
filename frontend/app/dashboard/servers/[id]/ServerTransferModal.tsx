"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import {
  Server, Loader2, AlertCircle, X, AlertTriangle, RefreshCw,
  Archive, HardDrive, Trash2, Gauge, Wifi,
} from "lucide-react"

const ARCHIVE_FORMATS = [
  { value: "tar", label: "tar" },
  { value: "tar_gz", label: "tar.gz" },
  { value: "tar_xz", label: "tar.xz" },
  { value: "tar_lz4", label: "tar.lz4" },
  { value: "tar_zstd", label: "tar.zst" },
  { value: "itaf", label: "itaf" },
  { value: "itaf_gz", label: "itaf.gz" },
  { value: "itaf_zstd", label: "itaf.zst" },
]

const COMPRESSION_LEVELS = [
  { value: "best_speed", label: "Best Speed" },
  { value: "good_speed", label: "Good Speed" },
  { value: "good_compression", label: "Good Compression" },
  { value: "best_compression", label: "Best Compression" },
]

interface Node {
  id: number; name: string; fqdn?: string; url?: string
  nodeType?: string; memory?: number; disk?: number
}

interface TransferProgress {
  archive_bytes_processed: number
  network_bytes_processed: number
  bytes_total: number
  files_processed: number
}

interface Props {
  serverId: string
  server: any
  open: boolean
  onClose: () => void
}

export function ServerTransferModal({ serverId, server, open, onClose }: Props) {
  const t = useTranslations("serverDetailPage")

  // State
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [targetNodeId, setTargetNodeId] = useState<number | null>(null)
  const [archiveFormat, setArchiveFormat] = useState("tar_zstd")
  const [compressionLevel, setCompressionLevel] = useState("good_compression")
  const [multiplexChannels, setMultiplexChannels] = useState(0)
  const [deleteSourceBackups, setDeleteSourceBackups] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [transferring, setTransferring] = useState(false)
  const [progress, setProgress] = useState<TransferProgress | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [forceTransfer, setForceTransfer] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [backups, setBackups] = useState<any[]>([])
  const [selectedBackups, setSelectedBackups] = useState<string[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)

  // Load nodes + backups
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadingBackups(true)
    Promise.all([
      apiFetch(API_ENDPOINTS.nodesAvailable || "/api/admin/nodes").catch(() => []),
      apiFetch(API_ENDPOINTS.serverBackups.replace(":id", serverId)).catch(() => []),
    ]).then(([nodeData, backupData]) => {
      const list = Array.isArray(nodeData) ? nodeData : nodeData?.data || []
      setNodes(list.filter((n: Node) => {
        if (n.id === server?.nodeId || n.id === server?.configuration?.node_id) return false
        if (n.nodeType === "all_in_one" || n.nodeType === "aio") return false
        return true
      }))
      const bkList = Array.isArray(backupData) ? backupData : backupData?.data || []
      setBackups(bkList.filter((b: any) => !b.locked && !b.is_locked))
    }).catch(() => {
      setNodes([]); setBackups([])
    }).finally(() => {
      setLoading(false); setLoadingBackups(false)
    })
  }, [open, server])

  // Poll transfer progress
  useEffect(() => {
    if (!transferring) return
    const poll = setInterval(async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", serverId))
        if (data?.archive_bytes_processed != null) {
          setProgress(data)
        }
      } catch { /* ignore */ }
    }, 1000)
    return () => clearInterval(poll)
  }, [transferring, serverId])

  const handleTransfer = async () => {
    if (!targetNodeId) { setError("Please select a target node"); return }
    setSubmitting(true)
    setError("")
    try {
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({
          node_uuid: targetNodeId,
          archive_format: archiveFormat,
          compression_level: compressionLevel,
          multiplex_channels: multiplexChannels,
          delete_source_backups: deleteSourceBackups,
          ...(selectedBackups.length > 0 ? { backups: selectedBackups } : {}),
        }),
      })
      setSubmitting(false)
      setTransferring(true)
    } catch (e: any) {
      setError(e?.message || "Transfer failed")
      setSubmitting(false)
    }
  }

  const handleForceTransfer = async () => {
    setSubmitting(true)
    setError("")
    try {
      await apiFetch(API_ENDPOINTS.serverForceTransfer.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ targetNodeId }),
      })
      setSubmitting(false)
      setTransferring(true)
      setForceTransfer(false)
    } catch (e: any) {
      setError(e?.message || "Force transfer failed")
      setSubmitting(false)
    }
  }

  const handleRestartTransfer = async () => {
    setRestarting(true)
    try {
      // Cancel current transfer
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", serverId), { method: "DELETE" }).catch(() => {})
      // Small delay for Wings to process cancellation
      await new Promise(r => setTimeout(r, 1000))
      // Re-initiate
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({
          node_uuid: targetNodeId,
          archive_format: archiveFormat,
          compression_level: compressionLevel,
          multiplex_channels: multiplexChannels,
          delete_source_backups: deleteSourceBackups,
          ...(selectedBackups.length > 0 ? { backups: selectedBackups } : {}),
        }),
      })
      setProgress(null)
    } catch (e: any) {
      setError(e?.message || "Restart failed")
    } finally {
      setRestarting(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await apiFetch(API_ENDPOINTS.serverTransfer.replace(":id", serverId), { method: "DELETE" })
    } catch { /* ignore */ }
    setCancelling(false)
    setTransferring(false)
    onClose()
  }

  if (!open) return null

  const pct = progress?.bytes_total ? Math.round((progress.archive_bytes_processed / progress.bytes_total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">{transferring ? t("transfer.transferring") : t("transfer.title")}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Server info */}
          <div className="text-sm text-muted-foreground">
            Transferring <span className="font-medium text-foreground">{server?.name || serverId}</span> to another node.
          </div>

          {!transferring ? (
            <>
              {/* Node selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Target Node</label>
                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading nodes...</div>
                ) : nodes.length === 0 ? (
                  <div className="text-xs text-destructive">No available nodes found.</div>
                ) : (
                  <select
                    value={targetNodeId ?? ""}
                    onChange={e => setTargetNodeId(Number(e.target.value) || null)}
                    className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md"
                  >
                    <option value="" disabled>Select a node...</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name || n.fqdn || n.url || `Node #${n.id}`}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Backups multi-select */}
              {backups.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium flex items-center gap-1.5"><HardDrive className="h-3 w-3" /> Transfer Backups ({selectedBackups.length}/{backups.length})</label>
                  <div className="border border-border rounded-md max-h-32 overflow-y-auto divide-y divide-border/50">
                    {backups.map((b: any) => {
                      const uuid = b.uuid || b.id
                      const selected = selectedBackups.includes(uuid)
                      return (
                        <label key={uuid} className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}>
                          <input type="checkbox" checked={selected} onChange={e => {
                            setSelectedBackups(e.target.checked ? [...selectedBackups, uuid] : selectedBackups.filter(x => x !== uuid))
                          }} />
                          <span className="truncate flex-1">{b.displayName || b.display_name || b.name || uuid}</span>
                          <span className="text-muted-foreground shrink-0">{b.bytes ? formatBytes(b.bytes) : ""}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Archive format */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5"><Archive className="h-3 w-3" /> Archive Format</label>
                <select value={archiveFormat} onChange={e => setArchiveFormat(e.target.value)}
                  className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md">
                  {ARCHIVE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              {/* Compression level */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5"><Gauge className="h-3 w-3" /> Compression</label>
                <select value={compressionLevel} onChange={e => setCompressionLevel(e.target.value)}
                  className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md"
                  disabled={archiveFormat === "tar" || archiveFormat === "itaf"}>
                  {COMPRESSION_LEVELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {(archiveFormat === "tar" || archiveFormat === "itaf") && (
                  <p className="text-[10px] text-muted-foreground">Not available for uncompressed formats.</p>
                )}
              </div>

              {/* Multiplex channels */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5"><Wifi className="h-3 w-3" /> Multiplex Channels</label>
                <input type="number" min={0} max={16} value={multiplexChannels}
                  onChange={e => setMultiplexChannels(Math.max(0, Math.min(16, Number(e.target.value) || 0)))}
                  className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md" />
                <p className="text-[10px] text-muted-foreground">Parallel transfer streams (0-16). Higher = faster but more bandwidth.</p>
              </div>

              {/* Delete source backups */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={deleteSourceBackups} onChange={e => setDeleteSourceBackups(e.target.checked)} />
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                Delete source backups after transfer
              </label>

              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 px-3 py-2 rounded-md">
                  <AlertCircle className="h-3.5 w-3.5" /> {error}
                </div>
              )}
            </>
          ) : (
            /* Progress view */
            <div className="space-y-3">
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">{pct}% complete</p>
              {progress && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="border border-border bg-muted/20 px-3 py-2 rounded-md">
                    <p className="text-muted-foreground">Files</p>
                    <p className="font-mono font-medium">{progress.files_processed?.toLocaleString() || 0}</p>
                  </div>
                  <div className="border border-border bg-muted/20 px-3 py-2 rounded-md">
                    <p className="text-muted-foreground">Archived</p>
                    <p className="font-mono font-medium">{formatBytes(progress.archive_bytes_processed || 0)}</p>
                  </div>
                  <div className="border border-border bg-muted/20 px-3 py-2 rounded-md">
                    <p className="text-muted-foreground">Sent</p>
                    <p className="font-mono font-medium">{formatBytes(progress.network_bytes_processed || 0)}</p>
                  </div>
                  <div className="border border-border bg-muted/20 px-3 py-2 rounded-md">
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-mono font-medium">{formatBytes(progress.bytes_total || 0)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
          {!transferring && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setForceTransfer(!forceTransfer)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Force Transfer
            </Button>
          )}
          <div className="flex items-center gap-2 ml-auto">
          {transferring ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRestartTransfer} disabled={restarting || cancelling}>
                {restarting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Restart Transfer
              </Button>
              <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling || restarting}>
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <X className="h-3.5 w-3.5 mr-1.5" />}
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              {forceTransfer ? (
                <Button variant="destructive" size="sm" onClick={handleForceTransfer} disabled={submitting || !targetNodeId}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                  Force Transfer (Delete Source)
                </Button>
              ) : (
                <Button size="sm" onClick={handleTransfer} disabled={submitting || !targetNodeId}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Server className="h-3.5 w-3.5 mr-1.5" />}
                  Start Transfer
                </Button>
              )}
            </>
          )}
          </div>
        </div>
        {forceTransfer && (
          <div className="px-5 pb-3">
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 px-3 py-2 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Warning: Force Transfer</p>
                <p className="mt-0.5">This will delete all server data on the source node and recreate the server on the target node. Files, databases, and configurations will be permanently lost.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}
