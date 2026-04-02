"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-react"

export default function ServersTab({ ctx }: { ctx: any }) {
  const {
    serverSearch,
    setServerSearch,
    fetchServers,
    serversTotal,
    setRedactServers,
    redactServers,
    forceRefreshTab,
    syncFromWings,
    syncingFromWings,
    loadTab,
    openCreateServer,
    filteredServers,
    servers,
    redactText,
    privateMode,
    serverPower,
    unsuspendServer,
    suspendServer,
    openEditServer,
    deleteServer,
    serversPage,
    SERVERS_PER,
    editServerDialog,
    setEditServerDialog,
    esName,
    setEsName,
    esDesc,
    setEsDesc,
    esUserId,
    setEsUserId,
    esMemory,
    setEsMemory,
    esDisk,
    setEsDisk,
    esCpu,
    setEsCpu,
    esSwap,
    setEsSwap,
    esDockerImage,
    setEsDockerImage,
    esStartup,
    setEsStartup,
    esEggId,
    setEsEggId,
    eggs,
    esAllocations,
    setEsAllocations,
    esEditFqdnIdx,
    setEsEditFqdnIdx,
    esEditFqdnVal,
    setEsEditFqdnVal,
    esAllocIp,
    setEsAllocIp,
    esAllocPort,
    setEsAllocPort,
    esAllocFqdn,
    setEsAllocFqdn,
    esError,
    reinstallServerFromDialog,
    esReinstalling,
    saveEditServer,
    esLoading,
    createServerOpen,
    setCreateServerOpen,
    csName,
    setCsName,
    csNodeId,
    setCsNodeId,
    nodes,
    csEggId,
    setCsEggId,
    csUserId,
    setCsUserId,
    csMemory,
    setCsMemory,
    csDisk,
    setCsDisk,
    csCpu,
    setCsCpu,
    csKvmPassthroughEnabled,
    setCsKvmPassthroughEnabled,
    csError,
    submitCreateServer,
    csLoading,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search servers…"
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchServers(1, serverSearch)}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {serverSearch && (
                  <button
                    onClick={() => {
                      setServerSearch("")
                      fetchServers(1, "")
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground hidden md:inline">
                {serversTotal ? `${serversTotal} server${serversTotal !== 1 ? "s" : ""}` : ""}
              </span>
              <button
                onClick={() => setRedactServers(!redactServers)}
                title={redactServers ? "Show full details" : "Redact details"}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                {redactServers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={() => forceRefreshTab("servers")}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={syncFromWings} disabled={syncingFromWings} className="h-8 gap-1.5 border-border text-muted-foreground">
              {syncingFromWings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Sync from Wings</span>
              <span className="sm:hidden">Sync</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                loadTab("nodes")
                loadTab("eggs")
                openCreateServer()
              }}
              className="bg-primary text-primary-foreground h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Create Server</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Server</th>
                <th className="px-4 py-3 text-left font-medium">UUID</th>
                <th className="px-4 py-3 text-left font-medium">Node</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredServers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Server className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{servers.length === 0 ? "Loading servers…" : "No servers match your search"}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredServers.map((srv: any, i: number) => {
                  const statusConfig: Record<string, { class: string; dot: string }> = {
                    running: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                    starting: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                    suspended: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                    stopping: { class: "border-orange-500/30 bg-orange-500/10 text-orange-400", dot: "bg-orange-400" },
                  }
                  const sc = srv.status && statusConfig[srv.status] ? statusConfig[srv.status] : { class: "border-border bg-secondary/50 text-muted-foreground", dot: "bg-muted-foreground" }

                  return (
                    <tr key={srv.uuid ? `${srv.uuid}-${srv.nodeId || ""}` : i} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-8 w-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{srv.name ? redactText(srv.name, privateMode ? redactServers : false) : "Unnamed Server"}</p>
                            {srv.description && <p className={`text-xs text-muted-foreground truncate max-w-xs ${privateMode && redactServers ? "blur-sm" : ""}`}>{srv.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigator.clipboard?.writeText(srv.uuid || "")}
                          title="Click to copy full UUID"
                          className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                        >
                          {(srv.uuid || "").substring(0, 8)}…
                          <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground">
                          {srv.nodeName || "Unknown"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={sc.class}>
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                          {srv.status || "unknown"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-0.5 border-r border-border pr-1 mr-1">
                            <button onClick={() => serverPower(srv.uuid, "start")} title="Start" className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                              <Play className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => serverPower(srv.uuid, "restart")} title="Restart" className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => serverPower(srv.uuid, "stop")} title="Stop" className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                              <Square className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {srv.status === "suspended" ? (
                            <button onClick={() => unsuspendServer(srv.uuid)} title="Unsuspend" className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button onClick={() => suspendServer(srv.uuid)} title="Suspend" className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                              <Shield className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => openEditServer(srv)} title="Edit server" className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteServer(srv.uuid)} title="Delete server" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {filteredServers.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <Server className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{servers.length === 0 ? "Loading servers…" : "No servers match your search"}</p>
            </div>
          </div>
        ) : (
          filteredServers.map((srv: any, i: number) => {
            const statusConfig: Record<string, { class: string; dot: string; bg: string }> = {
              running: { class: "text-emerald-400", dot: "bg-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
              starting: { class: "text-warning", dot: "bg-warning", bg: "bg-warning/10 border-warning/30" },
              suspended: { class: "text-destructive", dot: "bg-destructive", bg: "bg-destructive/10 border-destructive/30" },
              stopping: { class: "text-orange-400", dot: "bg-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
            }
            const sc = srv.status && statusConfig[srv.status] ? statusConfig[srv.status] : { class: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-secondary/50 border-border" }

            return (
              <div key={srv.uuid ? `${srv.uuid}-${srv.nodeId || ""}` : i} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div className="relative h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{srv.name ? redactText(srv.name, privateMode ? redactServers : false) : "Unnamed Server"}</p>
                        {srv.description && <p className={`text-xs text-muted-foreground truncate mt-0.5 ${privateMode && redactServers ? "blur-sm" : ""}`}>{srv.description}</p>}
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${sc.bg} ${sc.class}`}>
                        <span className={`mr-1 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                        {srv.status || "unknown"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Node</p>
                    <Badge variant="outline" className="text-[10px] border-border bg-secondary/50 text-muted-foreground">{srv.nodeName || "Unknown"}</Badge>
                  </div>
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">UUID</p>
                    <button onClick={() => navigator.clipboard?.writeText(srv.uuid || "")} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      {(srv.uuid || "").substring(0, 8)}…
                      <Copy className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-border bg-secondary/20">
                  <button onClick={() => serverPower(srv.uuid, "start")} title="Start" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                    <Play className="h-3.5 w-3.5" />
                    <span>Start</span>
                  </button>
                  <button onClick={() => serverPower(srv.uuid, "restart")} title="Restart" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restart</span>
                  </button>
                  <button onClick={() => serverPower(srv.uuid, "stop")} title="Stop" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
                    <Square className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </button>
                </div>

                <div className="flex items-center border-t border-border divide-x divide-border">
                  {srv.status === "suspended" ? (
                    <button onClick={() => unsuspendServer(srv.uuid)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Unsuspend</span>
                    </button>
                  ) : (
                    <button onClick={() => suspendServer(srv.uuid)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Suspend</span>
                    </button>
                  )}
                  <button onClick={() => openEditServer(srv)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button onClick={() => deleteServer(srv.uuid)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-medium text-foreground">{serversPage}</span>
            {serversTotal ? (
              <>
                {" "}
                of <span className="font-medium text-foreground">{Math.max(1, Math.ceil(serversTotal / SERVERS_PER))}</span>
              </>
            ) : null}
            {serversTotal ? <span className="hidden sm:inline"> · {serversTotal} total</span> : null}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (serversPage > 1) fetchServers(serversPage - 1, serverSearch)
              }}
              disabled={serversPage <= 1}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">Previous</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!serversTotal || serversPage < Math.ceil((serversTotal || 0) / SERVERS_PER)) fetchServers(serversPage + 1, serverSearch)
              }}
              disabled={serversTotal ? serversPage >= Math.ceil(serversTotal / SERVERS_PER) : servers.length < SERVERS_PER}
              className="h-8 px-3 text-xs"
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={!!editServerDialog} onOpenChange={(open) => !open && setEditServerDialog(null)}>
      <DialogContent className="border-border bg-card sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Server — {editServerDialog?.name || editServerDialog?.uuid}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <input value={esName} onChange={(e) => setEsName(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <input value={esDesc} onChange={(e) => setEsDesc(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner User ID</label>
              <input type="number" value={esUserId} onChange={(e) => setEsUserId(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory (MB)</label>
              <input type="number" min="128" value={esMemory} onChange={(e) => setEsMemory(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disk (MB)</label>
              <input type="number" min="512" value={esDisk} onChange={(e) => setEsDisk(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU (%)</label>
              <input type="number" min="10" value={esCpu} onChange={(e) => setEsCpu(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Swap (MB)</label>
              <input type="number" min="0" value={esSwap} onChange={(e) => setEsSwap(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Docker Image</label>
              <input value={esDockerImage} onChange={(e) => setEsDockerImage(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startup Command</label>
              <input value={esStartup} onChange={(e) => setEsStartup(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Egg / Template</label>
              <Select value={esEggId ?? "none"} onValueChange={(v) => setEsEggId(v === "none" ? undefined : v)}>
                <SelectTrigger className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full">
                  <SelectValue placeholder="— No template —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No template —</SelectItem>
                  {eggs.map((egg: any) => (
                    <SelectItem key={egg.id} value={String(egg.id)}>
                      <div className="flex flex-col">
                        <span className="font-medium">{egg.name}</span>
                        {egg.description && <span className="text-xs text-muted-foreground line-clamp-2">{egg.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Network Allocations</label>
              <div className="space-y-1.5">
                {esAllocations.length === 0 && <p className="text-xs text-muted-foreground italic">No allocations configured.</p>}
                {esAllocations.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5">
                    {esEditFqdnIdx === i ? (
                      <>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">{a.ip}:{a.port}</span>
                          <input autoFocus placeholder="Display FQDN (e.g. n1.ecli.app)" value={esEditFqdnVal}
                            onChange={(e) => setEsEditFqdnVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { setEsAllocations((prev: any[]) => prev.map((x, j) => j === i ? { ...x, fqdn: esEditFqdnVal.trim() || undefined } : x)); setEsEditFqdnIdx(null) }
                              else if (e.key === 'Escape') setEsEditFqdnIdx(null)
                            }}
                            className="flex-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
                        </div>
                        <button onClick={() => { setEsAllocations((prev: any[]) => prev.map((x, j) => j === i ? { ...x, fqdn: esEditFqdnVal.trim() || undefined } : x)); setEsEditFqdnIdx(null) }} title="Save FQDN" className="text-muted-foreground hover:text-green-400 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEsEditFqdnIdx(null)} title="Cancel" className="text-muted-foreground hover:text-destructive transition-colors"><XCircle className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-sm text-foreground">{a.ip}:{a.port}</span>
                          {a.fqdn && <span className="ml-2 text-xs text-muted-foreground">→ {a.fqdn}:{a.port}</span>}
                        </div>
                        <button onClick={() => { setEsEditFqdnIdx(i); setEsEditFqdnVal(a.fqdn || "") }} title="Edit FQDN" className="text-muted-foreground hover:text-primary transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                        {a.is_default
                          ? <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">default</span>
                          : <button onClick={() => setEsAllocations((prev: any[]) => prev.map((x, j) => ({ ...x, is_default: j === i })))} title="Set as default" className="text-muted-foreground hover:text-primary transition-colors"><Globe className="h-3.5 w-3.5" /></button>
                        }
                        <button onClick={() => setEsAllocations((prev: any[]) => { const next = prev.filter((_, j) => j !== i); if (a.is_default && next.length > 0) next[0].is_default = true; return next })} title="Remove" className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <input placeholder="Bind IP" value={esAllocIp} onChange={(e) => setEsAllocIp(e.target.value)} className="w-32 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                <input type="number" placeholder="Port" value={esAllocPort} onChange={(e) => setEsAllocPort(e.target.value)} className="w-24 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                <input placeholder="Display FQDN (e.g. n1.ecli.app)" value={esAllocFqdn} onChange={(e) => setEsAllocFqdn(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary/50" />
                <Button size="sm" variant="outline" className="border-border h-9" onClick={() => { const port = Number(esAllocPort); if (!esAllocIp || !port) return; setEsAllocations((prev: any[]) => [...prev, { ip: esAllocIp, port, fqdn: esAllocFqdn.trim(), is_default: prev.length === 0 }]); setEsAllocPort(""); setEsAllocFqdn("") }}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
              </div>
            </div>
          </div>
          {esError && <p className="text-xs text-destructive">{esError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={reinstallServerFromDialog} disabled={esReinstalling || esLoading} className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 mr-auto">
            {esReinstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Reinstall
          </Button>
          <Button variant="outline" onClick={() => setEditServerDialog(null)} className="border-border">Cancel</Button>
          <Button onClick={saveEditServer} disabled={esLoading} className="bg-primary text-primary-foreground">
            {esLoading ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={createServerOpen} onOpenChange={(open) => !open && setCreateServerOpen(false)}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create Server</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Server Name (optional)</label>
              <input value={csName} onChange={(e) => setCsName(e.target.value)} placeholder="My Server" className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node *</label>
              <select value={csNodeId} onChange={(e) => setCsNodeId(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="">Select node…</option>
                {nodes.map((n: any) => <option key={n.id} value={String(n.id)}>{n.name} ({n.nodeType})</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Egg (optional)</label>
              <Select value={csEggId ?? "none"} onValueChange={(v) => setCsEggId(v === "none" ? undefined : v)}>
                <SelectTrigger className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 w-full">
                  <SelectValue placeholder="Default (Node.js)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default (Node.js)</SelectItem>
                  {eggs.map((egg: any) => (
                    <SelectItem key={egg.id} value={String(egg.id)}>
                      <div className="flex flex-col">
                        <span className="font-medium">{egg.name}</span>
                        {egg.description && <span className="text-xs text-muted-foreground line-clamp-2">{egg.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner User ID (optional)</label>
              <input type="number" value={csUserId} onChange={(e) => setCsUserId(e.target.value)} placeholder="User ID" className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Resources</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Memory (MB)</label>
                <input type="number" min="1" value={csMemory} onChange={(e) => setCsMemory(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Disk (MB)</label>
                <input type="number" min="1" value={csDisk} onChange={(e) => setCsDisk(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">CPU (%)</label>
                <input type="number" min="5" value={csCpu} onChange={(e) => setCsCpu(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input id="cs-kvm-passthrough" type="checkbox" checked={csKvmPassthroughEnabled} onChange={(e) => setCsKvmPassthroughEnabled(e.target.checked)} className="h-4 w-4 rounded border-border bg-secondary/50 text-primary focus:ring-primary" />
              <label htmlFor="cs-kvm-passthrough" className="text-sm text-foreground">Enable KVM passthrough</label>
            </div>
          </div>
          {csError && <p className="text-xs text-destructive">{csError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateServerOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={submitCreateServer} disabled={csLoading || !csNodeId} className="bg-primary text-primary-foreground">
            {csLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Creating…</> : "Create Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
