"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Play,
  Square,
  RotateCcw,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Loader2,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Server,
  Box,
  Globe,
  Terminal,
  FileText,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatBytes } from "./serverTabHelpers"

interface ServerViewV2Props {
  server: any
  id: string
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <motion.div
      className="border border-white/20 p-5 flex flex-col gap-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className={`${color}`}>{icon}</div>
      <p className="text-white/60 text-xs font-inter tracking-widest uppercase">{label}</p>
      <p className="text-white text-2xl font-flink tabular-nums">{value}</p>
      {sub && <p className="text-white/50 text-xs font-inter">{sub}</p>}
    </motion.div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <span className="text-white/60 text-sm font-inter">{label}</span>
      <span className="text-white text-sm font-inter font-medium">{value}</span>
    </div>
  )
}

export function ServerViewV2({ server, id }: ServerViewV2Props) {
  const [powerLoading, setPowerLoading] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [devlogBlock, setDevlogBlock] = useState<{
    action: string
    projectId: number
    skipTokensRemaining: number
    message: string
  } | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.serverV2Stats.replace(":id", id))
      setStats(data)
    } catch {
      try {
        const data = await apiFetch(API_ENDPOINTS.serverStats.replace(":id", id))
        setStats(data)
      } catch {
        // stats are optional
      }
    }
  }, [id])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [loadStats])

  const handlePower = async (action: string) => {
    setPowerLoading(action)
    setError(null)
    let res: any
    try {
      res = await apiFetch(API_ENDPOINTS.serverV2Power.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ action }),
      })
    } catch {
      try {
        res = await apiFetch(API_ENDPOINTS.serverPower.replace(":id", id), {
          method: "POST",
          body: JSON.stringify({ action }),
        })
      } catch (e2: any) {
        setError(e2?.message || "Power action failed")
        setPowerLoading(null)
        return
      }
    }
    if (res && typeof res === "object" && res.needsDevlog) {
      setDevlogBlock({
        action,
        projectId: res.projectId,
        skipTokensRemaining: res.skipTokensRemaining ?? 0,
        message: res.message || "A recent devlog is required.",
      })
    }
    setPowerLoading(null)
  }

  const vmType = server?.configuration?.vmType || (server?.uuid?.startsWith("qemu") ? "qemu" : "lxc")
  const vmid = server?.configuration?.vmid || server?.uuid?.split("-").pop()
  const template = server?.configuration?.template || server?.configuration?.isoFile || "—"
  const cores = server?.configuration?.cores || "—"
  const sockets = server?.configuration?.sockets || "—"
  const resources = stats || server?.resources

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 sm:px-12 lg:px-40 py-6">
        <motion.div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center">
              <Server className="h-6 w-6 text-[#8b5cf6]" />
            </div>
            <div>
              <h1 className="text-2xl font-flink font-bold text-white">{server?.name || id}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    server?.status === "running"
                      ? "bg-green-400"
                      : server?.status === "stopped"
                        ? "bg-red-400"
                        : "bg-yellow-400"
                  }`}
                />
                <span className="text-white/60 text-sm font-inter capitalize">{server?.status}</span>
                <span className="w-px h-3 bg-white/20 mx-1" />
                <span className="inline-flex items-center gap-1 text-xs font-inter font-medium text-[#8b5cf6]">
                  <Box className="h-3 w-3" />
                  Proxmox {vmType === "qemu" ? "KVM" : "LXC"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => handlePower("start")}
              disabled={powerLoading !== null}
              className="flex items-center gap-2 border border-white/20 px-4 py-2 font-inter text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
              whileTap={{ scale: 0.97 }}
            >
              {powerLoading === "start" ? (
                <Loader2 className="h-4 w-4 rounded-full animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start
            </motion.button>
            <motion.button
              onClick={() => handlePower("stop")}
              disabled={powerLoading !== null}
              className="flex items-center gap-2 border border-white/20 px-4 py-2 font-inter text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
              whileTap={{ scale: 0.97 }}
            >
              {powerLoading === "stop" ? (
                <Loader2 className="h-4 w-4 rounded-full animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop
            </motion.button>
            <motion.button
              onClick={() => handlePower("restart")}
              disabled={powerLoading !== null}
              className="flex items-center gap-2 border border-white/20 px-4 py-2 font-inter text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
              whileTap={{ scale: 0.97 }}
            >
              {powerLoading === "restart" ? (
                <Loader2 className="h-4 w-4 rounded-full animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restart
            </motion.button>
          </div>
        </motion.div>

        {error && (
          <motion.div
            className="mt-4 flex items-center gap-2 text-red-400 text-sm font-inter border border-red-400/20 bg-red-400/5 px-4 py-2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertTriangle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </div>

      {/* Resource Stats */}
      <div className="px-6 sm:px-12 lg:px-40 py-8">
        <motion.p
          className="text-white/50 text-xs font-inter tracking-widest uppercase mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Resource Usage
        </motion.p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MiniStat
            icon={<Cpu className="h-5 w-5" />}
            label="CPU"
            value={resources?.cpu?.used != null ? `${Math.round(resources.cpu.used)}%` : "—"}
            sub={resources?.cpu?.total != null ? `of ${resources.cpu.total} cores` : undefined}
            color="text-[#8b5cf6]"
          />
          <MiniStat
            icon={<MemoryStick className="h-5 w-5" />}
            label="Memory"
            value={resources?.memory?.used != null ? formatBytes(resources.memory.used) : "—"}
            sub={resources?.memory?.total != null ? `of ${formatBytes(resources.memory.total)}` : undefined}
            color="text-[#06b6d4]"
          />
          <MiniStat
            icon={<HardDrive className="h-5 w-5" />}
            label="Disk"
            value={resources?.disk?.used != null ? formatBytes(resources.disk.used) : "—"}
            sub={resources?.disk?.total != null ? `of ${formatBytes(resources.disk.total)}` : undefined}
            color="text-[#10b981]"
          />
          <MiniStat
            icon={<Activity className="h-5 w-5" />}
            label="Network"
            value={resources?.network?.rx != null ? formatBytes(resources.network.rx) : "—"}
            sub={resources?.network?.tx != null ? `${formatBytes(resources.network.tx)} tx` : undefined}
            color="text-[#f59e0b]"
          />
        </div>
      </div>

      {/* VM/CT Details & Actions */}
      <div className="px-6 sm:px-12 lg:px-40 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration */}
          <motion.div
            className="border border-white/20 p-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-4 w-4 text-[#8b5cf6]" />
              <h2 className="text-white font-flink text-lg">Configuration</h2>
            </div>
            <div className="space-y-1">
              <DetailRow label="Type" value={vmType === "qemu" ? "KVM Virtual Machine" : "LXC Container"} />
              <DetailRow label="VM/CT ID" value={String(vmid)} />
              <DetailRow label="Template / ISO" value={template} />
              <DetailRow label="Cores" value={String(cores)} />
              <DetailRow label="Sockets" value={String(sockets)} />
              <DetailRow label="Memory" value={server?.configuration?.memory ? formatBytes(server.configuration.memory * 1024 * 1024) : "—"} />
              <DetailRow label="Disk" value={server?.configuration?.disk ? formatBytes(server.configuration.disk * 1024 * 1024) : "—"} />
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            className="border border-white/20 p-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="h-4 w-4 text-[#8b5cf6]" />
              <h2 className="text-white font-flink text-lg">Quick Actions</h2>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={`https://${server?.node || "localhost"}:8006`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between border border-white/20 px-4 py-3 font-inter text-sm text-white hover:bg-white/5 transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-white/50 group-hover:text-[#8b5cf6] transition-colors" />
                  Open Proxmox Web UI
                </span>
                <ExternalLink className="h-4 w-4 text-white/30 group-hover:text-white/70 transition-colors" />
              </a>
              <div className="mt-2 border border-white/20 p-4 bg-white/[0.02]">
                <p className="text-white/50 text-xs font-inter tracking-widest uppercase mb-2">
                  Proxmox Management
                </p>
                <p className="text-white/60 text-xs font-inter leading-relaxed">
                  Advanced management is available directly through the Proxmox VE web interface.
                  For console access, file management, and detailed monitoring, use the Proxmox
                  dashboard at the link above.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Devlog Required Dialog */}
      <Dialog open={devlogBlock !== null} onOpenChange={(open) => { if (!open) setDevlogBlock(null) }}>
        <DialogContent className="border-border bg-card max-w-[92vw] sm:max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">Devlog Required</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-foreground break-words min-w-0">
                  {devlogBlock?.message}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Publish a devlog for your community to keep them updated, or use a skip token to bypass this requirement.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDevlogBlock(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Link href="/dashboard/elo">
              <Button variant="outline" className="w-full sm:w-auto">
                <FileText className="h-4 w-4 mr-2" />
                Publish Devlog
              </Button>
            </Link>
            {devlogBlock && devlogBlock.skipTokensRemaining > 0 && (
              <Button
                onClick={async () => {
                  const block = devlogBlock
                  setDevlogBlock(null)
                  try {
                    await apiFetch(API_ENDPOINTS.eloSkip.replace(":id", String(block.projectId)), {
                      method: "POST",
                    })
                    await handlePower(block.action)
                  } catch {
                    setError("Failed to use skip token.")
                  }
                }}
                className="w-full sm:w-auto"
               data-telemetry="servers:async">
                <Check className="h-4 w-4 mr-2" />
                Use Skip Token ({devlogBlock.skipTokensRemaining})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}