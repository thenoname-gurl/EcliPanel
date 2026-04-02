"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Box, Copy, Edit, Eye, EyeOff, Loader2, Package, Plus, RefreshCw, Trash2, Upload } from "lucide-react"

export default function EggsTab({ ctx }: { ctx: any }) {
  const {
    eggs,
    forceRefreshTab,
    setImportEggError,
    setImportEggPreview,
    setImportEggJson,
    setImportEggUrl,
    setImportEggOpen,
    openNewEgg,
    deleteAllEggs,
    toggleEggVisible,
    openEditEgg,
    forceSyncEgg,
    syncingEggIds,
    deleteEgg,
    importEggOpen,
    importEggPreview,
    importEggMode,
    setImportEggMode,
    importEggJson,
    importEggUrl,
    importEggError,
    importEggLoading,
    doImportEgg,
    eggDialog,
    setEggDialog,
    eggTab,
    setEggTab,
    eggName,
    setEggName,
    eggAuthor,
    setEggAuthor,
    eggDesc,
    setEggDesc,
    eggImage,
    setEggImage,
    eggDockerImagesRaw,
    setEggDockerImagesRaw,
    eggStartup,
    setEggStartup,
    eggFeatures,
    setEggFeatures,
    eggUpdateUrl,
    setEggUpdateUrl,
    eggFileDenylist,
    setEggFileDenylist,
    eggVisible,
    setEggVisible,
    eggRootless,
    setEggRootless,
    eggRequiresKvm,
    setEggRequiresKvm,
    eggEnvVars,
    setEggEnvVars,
    eggProcessStop,
    setEggProcessStop,
    eggProcessDone,
    setEggProcessDone,
    eggInstallContainer,
    setEggInstallContainer,
    eggInstallEntrypoint,
    setEggInstallEntrypoint,
    eggInstallScript,
    setEggInstallScript,
    eggAllowedPortals,
    setEggAllowedPortals,
    portalMarkerByTier,
    saveEgg,
    eggLoading,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Server Templates</p>
                <p className="text-xs text-muted-foreground">
                  {eggs.length} egg{eggs.length !== 1 ? "s" : ""} configured
                </p>
              </div>
            </div>
            <button
              onClick={() => forceRefreshTab("eggs")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportEggError("")
                setImportEggPreview(null)
                setImportEggJson("")
                setImportEggUrl("")
                setImportEggOpen(true)
              }}
              className="h-8 gap-1.5 border-border text-muted-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import Egg</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button
              size="sm"
              onClick={openNewEgg}
              className="bg-primary text-primary-foreground h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Egg</span>
              <span className="sm:hidden">New</span>
            </Button>
            <div className="flex-1" />
            {eggs.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={deleteAllEggs}
                className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete All</span>
                <span className="sm:hidden">Clear</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {eggs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="h-6 w-6 text-primary/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No eggs configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a new egg or import one to get started.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportEggError("")
                setImportEggPreview(null)
                setImportEggJson("")
                setImportEggUrl("")
                setImportEggOpen(true)
              }}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" onClick={openNewEgg} className="bg-primary text-primary-foreground gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Egg
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Egg</th>
                    <th className="px-4 py-3 text-left font-medium">Docker Image</th>
                    <th className="px-4 py-3 text-left font-medium">Visibility</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eggs.map((egg: any, i: number) => (
                    <tr key={egg.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{egg.name}</p>
                            {egg.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-xs">{egg.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {egg.dockerImage}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleEggVisible(egg)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${egg.visible
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                            }`}
                        >
                          {egg.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {egg.visible ? "Visible" : "Hidden"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditEgg(egg)}
                            title="Edit egg"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => forceSyncEgg(egg)}
                            disabled={syncingEggIds.includes(egg.id)}
                            title="Sync to Wings"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-40"
                          >
                            {syncingEggIds.includes(egg.id)
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />
                            }
                          </button>
                          <button
                            onClick={() => deleteEgg(egg)}
                            title="Delete egg"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {eggs.map((egg: any, i: number) => (
              <div key={egg.id ?? i} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{egg.name}</p>
                        {egg.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{egg.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleEggVisible(egg)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0 ${egg.visible
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-secondary/50 text-muted-foreground"
                          }`}
                      >
                        {egg.visible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                        {egg.visible ? "Visible" : "Hidden"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Docker Image</p>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                    <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-xs text-muted-foreground truncate">{egg.dockerImage}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(egg.dockerImage || "")}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors ml-auto"
                      title="Copy image name"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center border-t border-border divide-x divide-border">
                  <button
                    onClick={() => openEditEgg(egg)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => forceSyncEgg(egg)}
                    disabled={syncingEggIds.includes(egg.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  >
                    {syncingEggIds.includes(egg.id)
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />
                    }
                    <span>Sync</span>
                  </button>
                  <button
                    onClick={() => deleteEgg(egg)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>

    <Dialog open={importEggOpen} onOpenChange={(open) => { if (!open) { setImportEggOpen(false); setImportEggPreview(null); setImportEggError("") } }}>
      <DialogContent className="border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import Pterodactyl Egg
          </DialogTitle>
        </DialogHeader>

        {importEggPreview ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex flex-col gap-2">
              <p className="text-sm font-medium text-green-400">Egg imported successfully!</p>
              <p className="text-sm text-foreground font-semibold">{importEggPreview.name}</p>
              {importEggPreview.description && <p className="text-xs text-muted-foreground">{importEggPreview.description}</p>}
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Image: <span className="font-mono text-foreground">{importEggPreview.dockerImage}</span></span>
                <span>Env vars: <span className="text-foreground">{(importEggPreview.envVars ?? []).length}</span></span>
                {importEggPreview.installScript && <span className="text-green-400">✓ Install script included</span>}
                {importEggPreview.processConfig && <span className="text-green-400">✓ Process config included</span>}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { setImportEggOpen(false); setImportEggPreview(null) }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex gap-1 rounded-lg border border-border p-1 bg-secondary/20">
              <button
                onClick={() => setImportEggMode("paste")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${importEggMode === "paste" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Paste JSON
              </button>
              <button
                onClick={() => setImportEggMode("url")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${importEggMode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Fetch from URL
              </button>
            </div>

            {importEggMode === "paste" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Egg JSON (PTDL_v1 or PTDL_v2)</label>
                <textarea
                  className="h-52 w-full rounded-md border border-border bg-secondary/30 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={'{\n  "meta": { "version": "PTDL_v2" },\n  "name": "My Egg",\n  ...\n}'}
                  value={importEggJson}
                  onChange={(e) => setImportEggJson(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Paste the full exported egg JSON from Pterodactyl / Pelican.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Raw JSON URL</label>
                <input
                  className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="https://raw.githubusercontent.com/pterodactyl/eggs/master/.../egg-paper.json"
                  value={importEggUrl}
                  onChange={(e) => setImportEggUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">The panel will fetch this URL server-side. Use a raw GitHub URL for community eggs.</p>
              </div>
            )}

            {importEggError && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{importEggError}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportEggOpen(false)} className="border-border">Cancel</Button>
              <Button onClick={doImportEgg} disabled={importEggLoading} className="bg-primary text-primary-foreground">
                {importEggLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Importing…</> : "Import Egg"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={eggDialog !== null} onOpenChange={(open) => !open && setEggDialog(null)}>
      <DialogContent className="border-border bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {eggDialog === "new" ? "New Egg" : `Edit Egg — ${eggDialog?.name || ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border border-border p-1 bg-secondary/20 mt-1">
          {(["basic", "variables", "config", "advanced"] as const).map((t) => (
            <button key={t} onClick={() => setEggTab(t)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${eggTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "config" ? "Process Config" : t === "advanced" ? "Install Script" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 py-1">
          {eggTab === "basic" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                  <input value={eggName} onChange={(e) => setEggName(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="Minecraft Java" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Author</label>
                  <input value={eggAuthor} onChange={(e) => setEggAuthor(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="support@pterodactyl.io" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                <input value={eggDesc} onChange={(e) => setEggDesc(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="Optional description" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Primary Docker Image *</label>
                <input value={eggImage} onChange={(e) => setEggImage(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" placeholder="ghcr.io/pterodactyl/yolks:java_21" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Docker Images <span className="normal-case text-muted-foreground/60">(JSON object, optional)</span></label>
                <textarea value={eggDockerImagesRaw} onChange={(e) => setEggDockerImagesRaw(e.target.value)} rows={3} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/50 resize-none" placeholder={'{\n  "Java 21": "ghcr.io/pterodactyl/yolks:java_21",\n  "Java 17": "ghcr.io/pterodactyl/yolks:java_17"\n}'} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startup Command *</label>
                <input value={eggStartup} onChange={(e) => setEggStartup(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Features <span className="normal-case text-muted-foreground/60">(comma-separated)</span></label>
                  <input value={eggFeatures} onChange={(e) => setEggFeatures(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="eula" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Update URL</label>
                  <input value={eggUpdateUrl} onChange={(e) => setEggUpdateUrl(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="https://…" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File Denylist <span className="normal-case text-muted-foreground/60">(one per line)</span></label>
                <textarea value={eggFileDenylist} onChange={(e) => setEggFileDenylist(e.target.value)} rows={2} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none" placeholder="/.env" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eggVisible} onChange={(e) => setEggVisible(e.target.checked)} className="accent-primary" />
                <span className="text-sm text-foreground">Visible to users</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eggRootless} onChange={(e) => setEggRootless(e.target.checked)} className="accent-primary" />
                <span className="text-sm text-foreground">Launch in rootless mode</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eggRequiresKvm} onChange={(e) => setEggRequiresKvm(e.target.checked)} className="accent-primary" />
                <span className="text-sm text-foreground">Requires KVM (enables KVM virtualization for this template)</span>
              </label>
            </>
          )}

          {eggTab === "variables" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Enter one <code className="font-mono bg-secondary/50 px-1 rounded">ENV_VARIABLE</code> name per line. Default values and metadata are preserved from imported eggs.</p>
              <textarea value={eggEnvVars} onChange={(e) => setEggEnvVars(e.target.value)} rows={12} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none" placeholder={"SERVER_MEMORY\nSERVER_JARFILE\nMC_VERSION"} />
              {(eggDialog !== "new" && eggDialog) && (
                <div className="rounded-lg border border-border bg-secondary/20 p-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Current variable definitions</p>
                  {((eggDialog.envVars ?? []) as any[]).map((v: any, i: number) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-mono text-foreground w-40 shrink-0">{v.env_variable ?? v.name ?? "?"}</span>
                      <span className="truncate">{v.description || "—"}</span>
                      <span className="ml-auto shrink-0 text-foreground/60">default: {String(v.default_value ?? v.defaultValue ?? "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {eggTab === "config" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stop Command</label>
                <input value={eggProcessStop} onChange={(e) => setEggProcessStop(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" placeholder="stop" />
                <p className="text-xs text-muted-foreground">Use <code className="font-mono bg-secondary/50 px-1 rounded">SIGKILL</code> or <code className="font-mono bg-secondary/50 px-1 rounded">SIGTERM</code> for signal-based stop, or any text command.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startup Done Patterns <span className="normal-case text-muted-foreground/60">(one regex per line)</span></label>
                <textarea value={eggProcessDone} onChange={(e) => setEggProcessDone(e.target.value)} rows={6} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 resize-none" placeholder={"Done ("} />
                <p className="text-xs text-muted-foreground">Wings watches stdout for these strings to mark the server as fully started.</p>
              </div>
            </div>
          )}

          {eggTab === "advanced" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Container</label>
                  <input value={eggInstallContainer} onChange={(e) => setEggInstallContainer(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" placeholder="ghcr.io/pterodactyl/installers:debian" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entrypoint</label>
                  <input value={eggInstallEntrypoint} onChange={(e) => setEggInstallEntrypoint(e.target.value)} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" placeholder="bash" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Install Script</label>
                <textarea value={eggInstallScript} onChange={(e) => setEggInstallScript(e.target.value)} rows={14} className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/50 resize-none" placeholder={"#!/bin/bash\napt-get install -y curl\n# ...\n"} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Allowed Portals</label>
                <div className="grid grid-cols-3 gap-2">
                  {['free', 'paid', 'enterprise'].map((tier) => (
                    <label key={tier} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eggAllowedPortals.includes(tier)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...eggAllowedPortals, tier] : eggAllowedPortals.filter((p: string) => p !== tier)
                          setEggAllowedPortals(next)
                        }}
                        className="accent-primary"
                      />
                      <span>{portalMarkerByTier[tier] ?? tier}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">When empty, this egg is available to all portals.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setEggDialog(null)} className="border-border">Cancel</Button>
          <Button onClick={saveEgg} disabled={eggLoading || !eggName.trim() || !eggImage.trim() || !eggStartup.trim()} className="bg-primary text-primary-foreground">
            {eggLoading ? "Saving…" : eggDialog === "new" ? "Create Egg" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
