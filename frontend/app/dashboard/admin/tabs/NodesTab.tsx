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
import { Edit, FileCode, HardDrive, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

export default function NodesTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminNodesTab")
  const {
    nodes,
    forceRefreshTab,
    syncToWings,
    syncingToWings,
    openAddNode,
    redact,
    openEditNode,
    viewNodeConfig,
    deleteNode,
    openHeartbeatHistory,
    NodeSparkline,
    nodeHeartbeats,
    addNodeOpen,
    setAddNodeOpen,
    addNodeStep,
    addNodeName,
    setAddNodeName,
    addNodeType,
    setAddNodeType,
    addNodeFqdn,
    setAddNodeFqdn,
    addNodePort,
    setAddNodePort,
    addNodeSftpPort,
    setAddNodeSftpPort,
    addNodeSsl,
    setAddNodeSsl,
    addNodeDataPath,
    setAddNodeDataPath,
    addNodeToken,
    setAddNodeToken,
    generateAddNodeToken,
    addNodeTokenLoading,
    addNodeCreated,
    addNodeIpv6Subnet,
    setAddNodeIpv6Subnet,
    addNodeIpv6ExcludedPorts,
    setAddNodeIpv6ExcludedPorts,
    addNodeIpv6ReservedCount,
    setAddNodeIpv6ReservedCount,
    buildWingsConfig,
    submitAddNode,
    addNodeLoading,
    editNodeDialog,
    setEditNodeDialog,
    editNodeType,
    setEditNodeType,
    editNodePortStart,
    setEditNodePortStart,
    editNodePortEnd,
    setEditNodePortEnd,
    editNodeDefaultIp,
    setEditNodeDefaultIp,
    editNodeIpv6Subnet,
    setEditNodeIpv6Subnet,
    editNodeIpv6ExcludedPorts,
    setEditNodeIpv6ExcludedPorts,
    editNodeIpv6ReservedCount,
    setEditNodeIpv6ReservedCount,
    saveEditNode,
    editNodeLoading,
    heartbeatDialogNode,
    setHeartbeatDialogNode,
    setHeartbeatDialogData,
    heartbeatDialogWindow,
    setHeartbeatDialogWindow,
    heartbeatDialogLoading,
    heartbeatDialogData,
    viewConfigNode,
    setViewConfigNode,
    setViewConfigToken,
    viewConfigLoading,
    viewConfigToken,
    buildNodeConfigYaml,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t("header.nodeCount", { count: nodes.length })}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => forceRefreshTab("nodes")} className="border-border h-8 gap-1">
            <RefreshCw className="h-3 w-3" /> {t("actions.refresh")}
          </Button>
          <Button size="sm" variant="outline" onClick={syncToWings} disabled={syncingToWings} className="border-border h-8 gap-1">
            {syncingToWings ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {t("actions.syncToWings")}
          </Button>
          <Button size="sm" onClick={openAddNode} className="bg-primary text-primary-foreground h-8 gap-1">
            <Plus className="h-3 w-3" /> {t("actions.addNode")}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {nodes.length === 0 ? (
          <div className="col-span-2 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
            <HardDrive className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">{t("states.noNodes")}</p>
            <p className="text-xs text-muted-foreground">{t("states.noNodesSubtitle")}</p>
            <Button size="sm" onClick={openAddNode} className="bg-primary text-primary-foreground gap-1 mt-1">
              <Plus className="h-3 w-3" /> {t("actions.addNode")}
            </Button>
          </div>
        ) : (
          nodes.map((node: any) => {
            const typeColors: Record<string, string> = {
              free: "border-green-500/30 bg-green-500/10 text-green-400",
              paid: "border-blue-500/30 bg-blue-500/10 text-blue-400",
              free_and_paid: "border-purple-500/30 bg-purple-500/10 text-purple-400",
              enterprise: "border-orange-500/30 bg-orange-500/10 text-orange-400",
            }
            const typeLabel: Record<string, string> = {
              free: "Free", paid: "Paid", free_and_paid: "Free + Paid", enterprise: "Enterprise",
            }
            return (
              <div key={node.id} className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">{node.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{redact(node.url)}</p>
                    {node.organisation && <p className="mt-1 text-xs text-muted-foreground">{t("fields.org")}: {redact(node.organisation.name)}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground text-xs">#{node.id}</Badge>
                    <Badge variant="outline" className={`text-xs ${typeColors[node.nodeType] || typeColors.free}`}>{typeLabel[node.nodeType] || node.nodeType}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEditNode(node)} className="border-border h-7 px-2 text-xs gap-1"><Edit className="h-3 w-3" /> {t("actions.classify")}</Button>
                      <Button size="sm" variant="outline" onClick={() => viewNodeConfig(node)} className="border-border h-7 px-2 text-xs gap-1" title={t("actions.viewWingsConfig")}><FileCode className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => deleteNode(node)} className="border-destructive/50 text-destructive h-7 px-2 text-xs"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{t("fields.responseTimeLast120")}</span>
                    <button className="text-[11px] text-primary/70 hover:text-primary transition-colors" onClick={() => openHeartbeatHistory(node)}>{t("actions.fullHistory")}</button>
                  </div>
                  <NodeSparkline data={nodeHeartbeats[node.id] || []} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>

    <Dialog open={addNodeOpen} onOpenChange={(open) => { if (!open) setAddNodeOpen(false) }}>
      <DialogContent className="border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            {addNodeStep === "config" ? t("addDialog.configTitle") : t("addDialog.title")}
          </DialogTitle>
        </DialogHeader>

        {addNodeStep === "form" && (
          <div className="flex flex-col gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.nodeName")}</label>
                <input value={addNodeName} onChange={(e) => setAddNodeName(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder={t("addDialog.fields.nodeNamePlaceholder")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.nodeType")}</label>
                <select value={addNodeType} onChange={(e) => setAddNodeType(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                  <option value="free">{t("types.free")}</option>
                  <option value="paid">{t("types.paid")}</option>
                  <option value="free_and_paid">{t("types.freeAndPaid")}</option>
                  <option value="enterprise">{t("types.enterprise")}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.fqdn")}</label>
              <input value={addNodeFqdn} onChange={(e) => setAddNodeFqdn(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                placeholder={t("addDialog.fields.fqdnPlaceholder")} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.wingsPort")}</label>
                <input value={addNodePort} onChange={(e) => setAddNodePort(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder={t("addDialog.fields.wingsPortPlaceholder")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.sftpPort")}</label>
                <input value={addNodeSftpPort} onChange={(e) => setAddNodeSftpPort(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder={t("addDialog.fields.sftpPortPlaceholder")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.ssl")}</label>
                <div className="flex gap-2 h-9 items-center">
                  {["https", "http"].map((s) => (
                    <button key={s} type="button"
                      onClick={() => setAddNodeSsl(s === "https")}
                      className={`rounded-md px-3 py-1.5 text-xs border transition-colors ${(s === "https") === addNodeSsl
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-border bg-secondary/50 text-muted-foreground"
                        }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.wingsDataDirectory")}</label>
              <input value={addNodeDataPath} onChange={(e) => setAddNodeDataPath(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Subnet</label>
                <input value={addNodeIpv6Subnet} onChange={(e) => setAddNodeIpv6Subnet(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder="e.g. 2001:db8:100::/64" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Excluded Ports</label>
                <input value={addNodeIpv6ExcludedPorts} onChange={(e) => setAddNodeIpv6ExcludedPorts(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  placeholder="e.g. 25,465,587" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Reserved Count</label>
                <input type="number" min="0" value={addNodeIpv6ReservedCount} onChange={(e) => setAddNodeIpv6ReservedCount(e.target.value)}
                  className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("addDialog.fields.authToken")}</label>
              <div className="flex gap-2">
                <input value={addNodeToken} onChange={(e) => setAddNodeToken(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
                  placeholder={t("addDialog.fields.authTokenPlaceholder")} />
                <Button type="button" size="sm" variant="outline" onClick={generateAddNodeToken}
                  disabled={addNodeTokenLoading} className="border-border shrink-0 h-9 px-3 text-xs">
                  {addNodeTokenLoading ? "…" : t("actions.generate")}
                </Button>
              </div>
              {addNodeToken && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5">
                  <span className="flex-1 font-mono text-xs text-green-400 break-all truncate">{addNodeToken}</span>
                  <button onClick={() => navigator.clipboard.writeText(addNodeToken)} className="text-green-400 hover:text-green-300 shrink-0">
                    {t("actions.copy")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {addNodeStep === "config" && (
          <div className="flex flex-col gap-3 py-1">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-xs text-green-400">
              ✓ {t("addDialog.configReady", { name: addNodeCreated?.name })} 
              <code className="font-mono">/etc/eclipanel/config.yml</code> on your Wings server.
            </div>
            <div className="relative">
              <pre className="rounded-lg border border-border bg-black/40 p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed">
                {buildWingsConfig()}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(buildWingsConfig())}
                className="absolute top-2 right-2 rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("actions.copy")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("addDialog.afterSaving")}{" "}
              <code className="font-mono text-foreground">systemctl restart wings</code>.
            </p>
          </div>
        )}

        <DialogFooter>
          {addNodeStep === "form" ? (
            <>
              <Button variant="outline" onClick={() => setAddNodeOpen(false)} className="border-border">{t("actions.cancel")}</Button>
              <Button
                onClick={submitAddNode}
                disabled={addNodeLoading || !addNodeName.trim() || !addNodeFqdn.trim() || !addNodeToken.trim()}
                className="bg-primary text-primary-foreground"
              >
                {addNodeLoading ? t("actions.creating") : !addNodeToken ? t("actions.generateTokenFirst") : t("actions.createNode")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setAddNodeOpen(false)} className="bg-primary text-primary-foreground">
              {t("actions.done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!editNodeDialog} onOpenChange={(open) => !open && setEditNodeDialog(null)}>
      <DialogContent className="border-border bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("editDialog.title", { name: editNodeDialog?.name || "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.nodeType")}</label>
            <select value={editNodeType} onChange={(e) => setEditNodeType(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
              <option value="free">{t("types.free")}</option>
              <option value="paid">{t("types.paid")}</option>
              <option value="free_and_paid">{t("types.freeAndPaid")}</option>
              <option value="enterprise">{t("types.enterprise")}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.portRangeStart")}</label>
              <input type="number" placeholder={t("editDialog.fields.portRangeStartPlaceholder")} value={editNodePortStart}
                onChange={(e) => setEditNodePortStart(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.portRangeEnd")}</label>
              <input type="number" placeholder={t("editDialog.fields.portRangeEndPlaceholder")} value={editNodePortEnd}
                onChange={(e) => setEditNodePortEnd(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.defaultBindIp")}</label>
            <input type="text" placeholder="0.0.0.0" value={editNodeDefaultIp}
              onChange={(e) => setEditNodeDefaultIp(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            <p className="text-xs text-muted-foreground">{t("editDialog.fields.defaultBindIpHint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Subnet</label>
              <input type="text" value={editNodeIpv6Subnet} onChange={(e) => setEditNodeIpv6Subnet(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder="e.g. 2001:db8:100::/64" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Excluded Ports</label>
              <input type="text" value={editNodeIpv6ExcludedPorts} onChange={(e) => setEditNodeIpv6ExcludedPorts(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder="e.g. 25,465,587" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IPv6 Reserved Count</label>
              <input type="number" min="0" value={editNodeIpv6ReservedCount} onChange={(e) => setEditNodeIpv6ReservedCount(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditNodeDialog(null)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={saveEditNode} disabled={editNodeLoading} className="bg-primary text-primary-foreground">
            {editNodeLoading ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={!!heartbeatDialogNode}
      onOpenChange={(open) => { if (!open) { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) } }}
    >
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            {t("heartbeatDialog.title", { name: heartbeatDialogNode?.name || "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          {(["24h", "7d"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setHeartbeatDialogWindow(w)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${heartbeatDialogWindow === w
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
                }`}
            >
              {w === "24h" ? t("heartbeatDialog.last24Hours") : t("heartbeatDialog.last7Days")}
            </button>
          ))}
        </div>
        {heartbeatDialogLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("states.loading")}
          </div>
        ) : heartbeatDialogData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("heartbeatDialog.cards.uptime")}</p>
                <p className={`text-xl font-bold ${heartbeatDialogData.summary.uptime_pct >= 99 ? "text-green-400"
                  : heartbeatDialogData.summary.uptime_pct >= 95 ? "text-yellow-400"
                    : "text-red-400"
                  }`}>
                  {heartbeatDialogData.summary.uptime_pct}%
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("heartbeatDialog.cards.avgResponse")}</p>
                <p className="text-xl font-bold text-foreground">
                  {heartbeatDialogData.summary.avg_ms != null ? `${heartbeatDialogData.summary.avg_ms}ms` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("heartbeatDialog.cards.checks")}</p>
                <p className="text-xl font-bold text-foreground">{heartbeatDialogData.summary.total_checks}</p>
              </div>
            </div>
            <div>
              <NodeSparkline data={heartbeatDialogData.points} compact={false} />
            </div>
            {heartbeatDialogData.points.length > 1 && (
              <p className="text-[11px] text-muted-foreground text-center">
                {new Date(heartbeatDialogData.points[0].timestamp).toLocaleString()} →{" "}
                {new Date(heartbeatDialogData.points[heartbeatDialogData.points.length - 1].timestamp).toLocaleString()}
              </p>
            )}
            <div className="flex items-center gap-4 justify-center text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 rounded" style={{ background: '#22c55e' }} /> OK</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{ background: 'rgba(234,179,8,0.6)' }} /> {t("heartbeatDialog.legend.timeout")}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded" style={{ background: 'rgba(239,68,68,0.6)' }} /> {t("heartbeatDialog.legend.error")}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("heartbeatDialog.noData")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setHeartbeatDialogNode(null); setHeartbeatDialogData(null) }} className="border-border">
            {t("actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!viewConfigNode} onOpenChange={(open) => { if (!open) { setViewConfigNode(null); setViewConfigToken("") } }}>
      <DialogContent className="max-w-xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("configDialog.title", { name: viewConfigNode?.name || "" })}</DialogTitle>
        </DialogHeader>
        {viewConfigLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("configDialog.loadingToken")}
          </div>
        ) : viewConfigToken ? (
          <div className="flex flex-col gap-3 py-1">
            <p className="text-xs text-muted-foreground">
              Copy to <code className="font-mono text-foreground">/etc/eclipanel/config.yml</code> on the Wings server, then run{" "}
              <code className="font-mono text-foreground">systemctl restart wings</code>.
            </p>
            <div className="relative">
              <pre className="rounded-lg border border-border bg-black/40 p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-relaxed">
                {buildNodeConfigYaml(viewConfigNode, viewConfigToken)}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(buildNodeConfigYaml(viewConfigNode, viewConfigToken))}
                className="absolute top-2 right-2 rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t("actions.copy")}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-destructive py-4">{t("configDialog.failedToken")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setViewConfigNode(null); setViewConfigToken("") }} className="border-border">{t("actions.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
