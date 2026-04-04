"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import SearchableUserSelect from "@/components/SearchableUserSelect"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Brain, CheckCircle, Edit, FileCode, Image, Loader2, MessageSquare, Plus, RefreshCw, Timer, Trash2, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"

export default function AiTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminAiTab")
  const {
    aiModels,
    openNewAIModel,
    loadTab,
    openAssignAiModel,
    openEditAIModel,
    deleteAIModel,
    aiModelCooldowns,
    assignAiModel,
    setAssignAiModel,
    assignAiUserId,
    setAssignAiUserId,
    users,
    assignAiLimitTokens,
    setAssignAiLimitTokens,
    assignAiLimitRequests,
    setAssignAiLimitRequests,
    submitAssignAiModel,
    assignAiLoading,
    aiModelDialog,
    setAiModelDialog,
    aiModelName,
    setAiModelName,
    aiModelType,
    setAiModelType,
    aiModelStatus,
    setAiModelStatus,
    aiModelMaxTokens,
    setAiModelMaxTokens,
    aiModelDescription,
    setAiModelDescription,
    aiModelTags,
    setAiModelTags,
    aiModelEndpoint,
    setAiModelEndpoint,
    aiModelApiKey,
    setAiModelApiKey,
    aiModelExtraEndpoints,
    setAiModelExtraEndpoints,
    saveAIModel,
    aiModelLoading,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Brain className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("header.modelCount", { count: aiModels.length })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={openNewAIModel}
                className="bg-primary text-primary-foreground h-8 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("actions.newModel")}</span>
                <span className="sm:hidden">{t("actions.new")}</span>
              </Button>
              <button
                onClick={() => loadTab("ai")}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title={t("actions.refresh")}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {aiModels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Brain className="h-6 w-6 text-violet-400/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t("states.noModels")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("states.noModelsSubtitle")}</p>
          </div>
          <Button size="sm" onClick={openNewAIModel} className="bg-primary text-primary-foreground gap-1.5 mt-1">
            <Plus className="h-3.5 w-3.5" /> {t("actions.newModel")}
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">{t("table.model")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("table.type")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("table.tags")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("table.endpoints")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aiModels.map((m: any, i: number) => {
                    const statusConfig: Record<string, { class: string; dot: string }> = {
                      active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                      beta: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                      disabled: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                    }
                    const sc = statusConfig[m.config?.status || "active"] || statusConfig.active

                    const typeConfig: Record<string, { class: string; icon: any }> = {
                      text: { class: "border-blue-500/30 bg-blue-500/10 text-blue-400", icon: MessageSquare },
                      image: { class: "border-purple-500/30 bg-purple-500/10 text-purple-400", icon: Image },
                      code: { class: "border-amber-500/30 bg-amber-500/10 text-amber-400", icon: FileCode },
                    }
                    const tc = typeConfig[m.config?.type || "text"] || typeConfig.text
                    const TypeIcon = tc.icon

                    const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

                    return (
                      <tr key={m.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                              <Brain className="h-3.5 w-3.5 text-violet-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                              {m.config?.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs">{m.config.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${tc.class}`}>
                            <TypeIcon className="h-2.5 w-2.5 mr-1" />
                            {m.config?.type || "text"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${sc.class}`}>
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                            {m.config?.status || "active"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(m.tags) && m.tags.length > 0 ? (
                              m.tags.map((tag: string) => (
                                <span key={tag} className="inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground italic">{t("common.none")}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-2 w-2 rounded-full shrink-0 ${endpointCount > 0 ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                            <span className="text-xs text-muted-foreground">
                              {endpointCount > 0 ? t("endpoints.configured", { count: endpointCount }) : t("endpoints.notSet")}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openAssignAiModel(m)} title={t("actions.assignToUsers")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEditAIModel(m)} title={t("actions.editModel")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteAIModel(m)} title={t("actions.deleteModel")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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

          <div className="rounded-xl border border-border bg-card hidden md:block lg:hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-3 text-left font-medium">{t("table.model")}</th>
                    <th className="px-3 py-3 text-left font-medium">{t("table.status")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {aiModels.map((m: any, i: number) => {
                    const statusConfig: Record<string, { class: string; dot: string }> = {
                      active: { class: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
                      beta: { class: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
                      disabled: { class: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
                    }
                    const sc = statusConfig[m.config?.status || "active"] || statusConfig.active
                    const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

                    return (
                      <tr key={m.id ?? i} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 group">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                              <Brain className="h-3.5 w-3.5 text-violet-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <span className="capitalize">{m.config?.type || "text"}</span>
                                {" · "}
                                {endpointCount > 0 ? t("endpoints.endpointCount", { count: endpointCount }) : t("endpoints.noEndpoints")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className={`text-[10px] ${sc.class}`}>
                            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${sc.dot} inline-block`} />
                            {m.config?.status || "active"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => openAssignAiModel(m)} title={t("actions.assign")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEditAIModel(m)} title={t("actions.edit")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteAIModel(m)} title={t("actions.delete")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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

          <div className="flex flex-col gap-3 md:hidden">
            {aiModels.map((m: any, i: number) => {
              const statusConfig: Record<string, { class: string; dot: string; label: string }> = {
                active: { class: "text-emerald-400", dot: "bg-emerald-400", label: t("status.active") },
                beta: { class: "text-warning", dot: "bg-warning", label: t("status.beta") },
                disabled: { class: "text-destructive", dot: "bg-destructive", label: t("status.disabled") },
              }
              const sc = statusConfig[m.config?.status || "active"] || statusConfig.active
              const endpointCount = Array.isArray(m.endpoints) ? m.endpoints.length : m.endpoint ? 1 : 0

              return (
                <div key={m.id ?? i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <div className="relative h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Brain className="h-4 w-4 text-violet-400" />
                      <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${sc.dot}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                          {m.config?.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.config.description}</p>
                          )}
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${sc.class} bg-current/10`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-px bg-border/50 border-t border-border">
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.type")}</p>
                      <p className="text-xs font-medium text-foreground capitalize">{m.config?.type || "text"}</p>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.endpoints")}</p>
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${endpointCount > 0 ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                        <span className="text-xs font-medium text-foreground">{endpointCount || t("common.dash")}</span>
                      </div>
                    </div>
                    <div className="bg-card px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("table.tags")}</p>
                      <p className="text-xs text-foreground truncate">
                        {Array.isArray(m.tags) && m.tags.length > 0 ? m.tags.join(", ") : t("common.dash")}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(m.tags) && m.tags.length > 2 && (
                    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border bg-secondary/20 overflow-x-auto no-scrollbar">
                      {m.tags.map((tag: string) => (
                        <span key={tag} className="inline-flex items-center rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center border-t border-border divide-x divide-border">
                    <button
                      onClick={() => openAssignAiModel(m)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>{t("actions.assign")}</span>
                    </button>
                    <button
                      onClick={() => openEditAIModel(m)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>{t("actions.edit")}</span>
                    </button>
                    <button
                      onClick={() => deleteAIModel(m)}
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

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <Timer className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("cooldowns.title")}</p>
              <p className="text-xs text-muted-foreground">{t("cooldowns.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={() => loadTab("ai")}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title={t("actions.refresh")}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {aiModelCooldowns.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6 justify-center">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <p className="text-sm text-muted-foreground">{t("cooldowns.empty")}</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block max-h-64 overflow-y-auto divide-y divide-border">
              {aiModelCooldowns.map((c: any, i: number) => {
                const waitSec = Math.round((c.waitMs || 0) / 1000)
                const isLong = waitSec >= 30

                return (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isLong ? "bg-destructive/10" : "bg-orange-500/10"
                      }`}>
                      <Timer className={`h-3.5 w-3.5 ${isLong ? "text-destructive" : "text-orange-400"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.modelName || c.modelId || t("common.unknown")}
                        </p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${isLong
                          ? "bg-destructive/10 text-destructive"
                          : "bg-orange-500/10 text-orange-400"
                          }`}>
                          {t("cooldowns.wait", { seconds: waitSec })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="truncate font-mono">{c.endpoint}</span>
                        <span>·</span>
                        <span className="whitespace-nowrap">{new Date(c.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="sm:hidden max-h-80 overflow-y-auto divide-y divide-border">
              {aiModelCooldowns.map((c: any, i: number) => {
                const waitSec = Math.round((c.waitMs || 0) / 1000)
                const isLong = waitSec >= 30

                return (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.modelName || c.modelId || t("common.unknown")}
                      </p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium shrink-0 ${isLong
                        ? "bg-destructive/10 text-destructive"
                        : "bg-orange-500/10 text-orange-400"
                        }`}>
                        {waitSec}s
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{c.endpoint}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(c.timestamp).toLocaleString()}
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>

    <Dialog open={!!assignAiModel} onOpenChange={(open) => !open && setAssignAiModel(null)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            {t("assignDialog.title", { name: assignAiModel?.name || "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("assignDialog.selectUser")}</label>
            <SearchableUserSelect
              value={assignAiUserId}
              onChange={(v) => setAssignAiUserId(v)}
              placeholder={t("assignDialog.searchPlaceholder")}
              initialList={users}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("assignDialog.limitsHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("assignDialog.tokenLimit")}</label>
              <input
                type="number"
                placeholder={t("assignDialog.tokenPlaceholder")}
                value={assignAiLimitTokens}
                onChange={(e) => setAssignAiLimitTokens(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("assignDialog.requestLimit")}</label>
              <input
                type="number"
                placeholder={t("assignDialog.requestPlaceholder")}
                value={assignAiLimitRequests}
                onChange={(e) => setAssignAiLimitRequests(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAssignAiModel(null)} className="border-border">{t("actions.cancel")}</Button>
          <Button
            onClick={submitAssignAiModel}
            disabled={assignAiLoading || !assignAiUserId}
            className="bg-primary text-primary-foreground"
          >
            {assignAiLoading ? t("actions.assigning") : t("actions.assignAccess")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={aiModelDialog !== null} onOpenChange={(open) => !open && setAiModelDialog(null)}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            {aiModelDialog === "new" ? t("modelDialog.newTitle") : t("modelDialog.editTitle", { name: aiModelDialog?.name || "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.name")}</label>
              <input value={aiModelName} onChange={(e) => setAiModelName(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder={t("modelDialog.fields.namePlaceholder")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.type")}</label>
              <select value={aiModelType} onChange={(e) => setAiModelType(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="text">Text</option>
                <option value="code">Code</option>
                <option value="vision">Vision</option>
                <option value="image">Image</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.status")}</label>
              <select value={aiModelStatus} onChange={(e) => setAiModelStatus(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="active">Active</option>
                <option value="beta">Beta</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.maxTokens")}</label>
              <input value={aiModelMaxTokens} onChange={(e) => setAiModelMaxTokens(e.target.value)} type="number"
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                placeholder={t("modelDialog.fields.maxTokensPlaceholder")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.description")}</label>
            <input value={aiModelDescription} onChange={(e) => setAiModelDescription(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              placeholder={t("modelDialog.fields.descriptionPlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.tags")}</label>
            <input value={aiModelTags} onChange={(e) => setAiModelTags(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              placeholder={t("modelDialog.fields.tagsPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("modelDialog.fields.tagsHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.endpointUrl")}</label>
            <input value={aiModelEndpoint} onChange={(e) => setAiModelEndpoint(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
              placeholder={t("modelDialog.fields.endpointPlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.apiKey")}</label>
            <input value={aiModelApiKey} onChange={(e) => setAiModelApiKey(e.target.value)} type="password"
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
              placeholder={t("modelDialog.fields.apiKeyPlaceholder")} />
          </div>
          <div className="mt-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("modelDialog.fields.fallbackEndpoints")}</div>
            {aiModelExtraEndpoints.map((ep: any, index: number) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end mt-2">
                <div className="col-span-4">
                  <input
                    value={ep.endpoint}
                    placeholder={t("modelDialog.fields.fallbackEndpointPlaceholder")}
                    onChange={(e) => {
                      const next = [...aiModelExtraEndpoints]
                      next[index] = { ...next[index], endpoint: e.target.value }
                      setAiModelExtraEndpoints(next)
                    }}
                    className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                  />
                </div>
                <div className="col-span-4">
                  <input
                    value={ep.apiKey || ""}
                    placeholder={t("modelDialog.fields.fallbackApiKeyPlaceholder")}
                    onChange={(e) => {
                      const next = [...aiModelExtraEndpoints]
                      next[index] = { ...next[index], apiKey: e.target.value }
                      setAiModelExtraEndpoints(next)
                    }}
                    className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                  />
                </div>
                <div className="col-span-3">
                  <input
                    value={ep.id || ""}
                    placeholder={t("modelDialog.fields.fallbackIdPlaceholder")}
                    onChange={(e) => {
                      const next = [...aiModelExtraEndpoints]
                      next[index] = { ...next[index], id: e.target.value }
                      setAiModelExtraEndpoints(next)
                    }}
                    className="w-full rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={() => setAiModelExtraEndpoints(aiModelExtraEndpoints.filter((_: any, i: number) => i !== index))}
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  >{t("actions.remove")}</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAiModelExtraEndpoints([...aiModelExtraEndpoints, { endpoint: "", apiKey: "" }])}
              className="mt-2 rounded-lg border border-border bg-secondary/60 px-3 py-1 text-xs"
            >{t("actions.addEndpoint")}</button>
            <p className="text-xs text-muted-foreground mt-1">{t("modelDialog.fields.fallbackHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAiModelDialog(null)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={saveAIModel} disabled={aiModelLoading || !aiModelName.trim()}
            className="bg-primary text-primary-foreground">
            {aiModelLoading ? t("actions.saving") : aiModelDialog === "new" ? t("actions.createModel") : t("actions.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
