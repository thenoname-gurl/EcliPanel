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
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"
import { Building2, ChevronLeft, ChevronRight, Edit, Eye, EyeOff, RefreshCw, Search, Trash2, Users, X } from "lucide-react"

export default function OrganisationsTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminOrganisationsTab")
  const {
    orgSearch,
    setOrgSearch,
    fetchOrganisations,
    organisationsTotal,
    setRedactOrganisations,
    redactOrganisations,
    forceRefreshTab,
    filteredOrgs,
    organisations,
    redactOrg,
    redactOrgName,
    openEditOrg,
    deleteOrg,
    organisationsPage,
    ORGS_PER,
    editOrgDialog,
    setEditOrgDialog,
    editOrgName,
    setEditOrgName,
    editOrgHandle,
    setEditOrgHandle,
    editOrgTier,
    setEditOrgTier,
    TIERS,
    editOrgOwnerId,
    setEditOrgOwnerId,
    editOrgIsStaff,
    setEditOrgIsStaff,
    editOrgAddMemberId,
    setEditOrgAddMemberId,
    editOrgAddMemberRole,
    setEditOrgAddMemberRole,
    editOrgMemberLoading,
    setEditOrgMemberLoading,
    saveEditOrg,
    editOrgLoading,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
          <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                  placeholder={t("search.placeholder")}
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchOrganisations(1, orgSearch)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
              {orgSearch && (
                <button
                  onClick={() => {
                    setOrgSearch("")
                    fetchOrganisations(1, "")
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">{organisationsTotal ? t("header.orgCount", { count: organisationsTotal }) : ""}</span>
            <button
              onClick={() => setRedactOrganisations(!redactOrganisations)}
              title={redactOrganisations ? t("actions.showFullDetails") : t("actions.redactDetails")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {redactOrganisations ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => forceRefreshTab("organisations")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={t("actions.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{t("table.organisation")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.handle")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.owner")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.tier")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.members")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{organisations.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org: any) => (
                  <tr key={org.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {org.avatarUrl ? (
                          <img src={org.avatarUrl} alt={`${org.name} ${t("common.logo")}`} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {org.name?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{redactOrg(org.name)}</p>
                          <p className="font-mono text-[11px] text-muted-foreground truncate">#{redactOrg(org.id)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">@{redactOrg(org.handle)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {org.owner ? (
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{redactOrgName(org.owner.firstName, org.owner.lastName)}</p>
                          <p className="text-xs text-muted-foreground truncate">{redactOrg(org.owner.email)}</p>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{redactOrg(org.ownerId)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          org.portalTier === "enterprise"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : org.portalTier === "pro"
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-secondary/50 text-muted-foreground"
                        }
                      >
                        {org.portalTier}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{org.memberCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditOrg(org)} title={t("actions.editOrganisation")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteOrg(org)} title={t("actions.deleteOrganisation")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {filteredOrgs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <Building2 className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{organisations.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
            </div>
          </div>
        ) : (
          filteredOrgs.map((org: any) => (
            <div key={org.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-start gap-3 p-4 pb-3">
                {org.avatarUrl ? (
                  <img src={org.avatarUrl} alt={`${org.name} ${t("common.logo")}`} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">{org.name?.[0]?.toUpperCase() || "?"}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{redactOrg(org.name)}</p>
                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground mt-0.5">@{redactOrg(org.handle)}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] ${org.portalTier === "enterprise" ? "border-warning/30 bg-warning/10 text-warning" : org.portalTier === "pro" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground"}`}
                    >
                      {org.portalTier}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                <div className="bg-card px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("table.owner")}</p>
                  {org.owner ? (
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{redactOrgName(org.owner.firstName, org.owner.lastName)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{redactOrg(org.owner.email)}</p>
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-muted-foreground truncate">{redactOrg(org.ownerId)}</p>
                  )}
                </div>
                <div className="bg-card px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("table.members")}</p>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{org.memberCount}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-secondary/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("table.id")}</span>
                <span className="font-mono text-[11px] text-muted-foreground truncate">#{redactOrg(org.id)}</span>
              </div>

              <div className="flex items-center border-t border-border divide-x divide-border">
                <button onClick={() => openEditOrg(org)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                  <span>{t("actions.edit")}</span>
                </button>
                <button onClick={() => deleteOrg(org)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t("actions.delete")}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            {t("pagination.page")} <span className="font-medium text-foreground">{organisationsPage}</span>
            {organisationsTotal ? (
              <>
                {" "}
                {t("pagination.of")} <span className="font-medium text-foreground">{Math.max(1, Math.ceil(organisationsTotal / ORGS_PER))}</span>
              </>
            ) : null}
            {organisationsTotal ? <span className="hidden sm:inline"> · {t("pagination.total", { count: organisationsTotal })}</span> : null}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (organisationsPage > 1) fetchOrganisations(organisationsPage - 1, orgSearch)
              }}
              disabled={organisationsPage <= 1}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">{t("actions.previous")}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!organisationsTotal || organisationsPage < Math.ceil((organisationsTotal || 0) / ORGS_PER)) fetchOrganisations(organisationsPage + 1, orgSearch)
              }}
              disabled={organisationsTotal ? organisationsPage >= Math.ceil(organisationsTotal / ORGS_PER) : organisations.length < ORGS_PER}
              className="h-8 px-3 text-xs"
            >
              <span className="hidden sm:inline mr-1">{t("actions.next")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={!!editOrgDialog} onOpenChange={(open) => !open && setEditOrgDialog(null)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("editDialog.title")} — {editOrgDialog?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.name")}</label>
            <input value={editOrgName} onChange={(e) => setEditOrgName(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.handle")}</label>
            <input value={editOrgHandle} onChange={(e) => setEditOrgHandle(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.tier")}</label>
              <select value={editOrgTier} onChange={(e) => setEditOrgTier(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
                {TIERS.map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.ownerUserId")}</label>
              <input type="number" value={editOrgOwnerId} onChange={(e) => setEditOrgOwnerId(e.target.value)}
                placeholder={t("editDialog.fields.userIdPlaceholder")}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.staffOrganisation")}</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="checkbox" checked={editOrgIsStaff} onChange={(e) => setEditOrgIsStaff(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm text-foreground">{t("editDialog.fields.staffOrgHint")}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/10 p-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("editDialog.fields.addMemberByUserId")}</p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={t("editDialog.fields.userIdPlaceholder")}
                value={editOrgAddMemberId}
                onChange={(e) => setEditOrgAddMemberId(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
              />
              <select
                value={editOrgAddMemberRole}
                onChange={(e) => setEditOrgAddMemberRole(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
              <Button
                size="sm"
                disabled={!editOrgAddMemberId.trim() || editOrgMemberLoading || !editOrgDialog}
                onClick={async () => {
                  if (!editOrgDialog || !editOrgAddMemberId.trim()) return
                  setEditOrgMemberLoading(true)
                  try {
                    await apiFetch(`${API_ENDPOINTS.adminOrgMembers.replace(":id", String(editOrgDialog.id))}`, {
                      method: "POST",
                      body: JSON.stringify({ userId: Number(editOrgAddMemberId), orgRole: editOrgAddMemberRole }),
                    })
                    setEditOrgAddMemberId("")
                  } catch (e: any) {
                    alert(t("alerts.failed", { reason: e.message }))
                  } finally {
                    setEditOrgMemberLoading(false)
                  }
                }}
                className="bg-primary text-primary-foreground px-3 text-xs h-9 shrink-0"
              >
                {editOrgMemberLoading ? t("actions.adding") : t("actions.add")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOrgDialog(null)} className="border-border">{t("actions.cancel")}</Button>
          <Button onClick={saveEditOrg} disabled={editOrgLoading} className="bg-primary text-primary-foreground">
            {editOrgLoading ? t("actions.saving") : t("actions.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
