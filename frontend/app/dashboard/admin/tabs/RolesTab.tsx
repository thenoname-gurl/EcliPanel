"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useTranslations } from "next-intl"
import { AlertTriangle, Key, List, Loader2, MousePointerClick, Plus, RefreshCw, Shield, Trash2, X } from "lucide-react"

export default function RolesTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminRolesTab")
  const {
    roles,
    selectedRole,
    setSelectedRole,
    setRoles,
    setRoleDialog,
    setRoleName,
    setRoleDesc,
    setRoleParentId,
    confirmAsync,
    newPermValue,
    setNewPermValue,
    permLoading,
    setPermLoading,
    forceRefreshTab,
  } = ctx

  type PermissionDefinition = {
    value: string
    category: string
    description?: string
    admin: boolean
  }

  const [permissionMetadata, setPermissionMetadata] = useState<Record<string, PermissionDefinition>>({})
  const [permissionList, setPermissionList] = useState<PermissionDefinition[]>([])

  useEffect(() => {
    const loadPermissionMetadata = async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.permissions)
        if (Array.isArray(data)) {
          const normalized = data as PermissionDefinition[]
          setPermissionList(normalized)
          setPermissionMetadata(Object.fromEntries(normalized.map((perm) => [perm.value, perm])))
        }
      } catch {
        setPermissionMetadata({})
        setPermissionList([])
      }
    }

    loadPermissionMetadata()
  }, [])

  const permissionGroups = permissionList.reduce<Record<string, PermissionDefinition[]>>((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = []
    acc[perm.category].push(perm)
    return acc
  }, {})

  const categoryOrder = [
    'Global',
    'Servers',
    'Nodes',
    'AI',
    'SOC',
    'Orders',
    'Organisations',
    'Roles',
    'Permissions',
    'Users',
    'Logs',
    'KYC',
    'OAuth',
    'Applications',
    'Deletions',
    'Tickets',
    'Databases',
    'Configuration',
    'Files',
    'Backups',
    'Commands',
    'Reinstall',
    'Schedules',
    'Sync',
    'Transfer',
    'Version',
    'Infra',
    'Wings',
  ]

  const orderedPermissionCategories = Object.keys(permissionGroups).sort((a, b) => {
    const ai = categoryOrder.indexOf(a)
    const bi = categoryOrder.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const isAdminPermission = (value: string) => permissionMetadata[value]?.admin === true

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("header.roleCount", { count: roles.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => { setRoleDialog(true); setRoleName(""); setRoleDesc(""); setRoleParentId(""); }}
              className="bg-primary text-primary-foreground h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("actions.newRole")}</span>
              <span className="sm:hidden">{t("actions.new")}</span>
            </Button>
            <button
              onClick={() => forceRefreshTab("roles")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={t("actions.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Roles List */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <List className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-foreground">{t("roles.title")}</p>
            <span className="ml-auto text-[10px] text-muted-foreground">{roles.length}</span>
          </div>

          {roles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-amber-400/60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t("roles.emptyTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("roles.emptySubtitle")}</p>
              </div>
              <Button
                size="sm"
                onClick={() => { setRoleDialog(true); setRoleName(""); setRoleDesc(""); setRoleParentId(""); }}
                className="bg-primary text-primary-foreground gap-1.5 mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> {t("actions.createRole")}
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Desktop list */}
              <div className="hidden md:flex flex-col divide-y divide-border">
                {roles.map((role: any) => {
                  const isSelected = selectedRole?.id === role.id
                  const permCount = role.permissions?.length || 0
                  const hasWildcard = role.permissions?.some((p: any) => p.value === "*")

                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRole(role)}
                      className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-all group ${
                        isSelected
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : "hover:bg-secondary/30 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {role.name}
                          </p>
                          {hasWildcard && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                              {t("roles.full")}
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{role.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Key className="h-2.5 w-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            {t("roles.permissionCount", { count: permCount })}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!(await confirmAsync(t("alerts.confirmDeleteRole", { name: role.name })))) return
                          await apiFetch(`${API_ENDPOINTS.roles}/${role.id}`, { method: "DELETE" })
                          setRoles((prev: any[]) => prev.filter((r: any) => r.id !== role.id))
                          if (selectedRole?.id === role.id) setSelectedRole(null)
                        }}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Mobile list */}
              <div className="flex flex-col gap-2 p-2 md:hidden">
                {roles.map((role: any) => {
                  const isSelected = selectedRole?.id === role.id
                  const permCount = role.permissions?.length || 0
                  const hasWildcard = role.permissions?.some((p: any) => p.value === "*")

                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRole(role)}
                      className={`rounded-lg border p-3 cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/20 hover:bg-secondary/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {role.name}
                            </p>
                            {hasWildcard && (
                              <span className="rounded px-1 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">
                                {t("roles.full")}
                              </span>
                            )}
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Key className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {t("roles.permissionCount", { count: permCount })}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!(await confirmAsync(t("alerts.confirmDeleteRole", { name: role.name })))) return
                            await apiFetch(`${API_ENDPOINTS.roles}/${role.id}`, { method: "DELETE" })
                            setRoles((prev: any[]) => prev.filter((r: any) => r.id !== role.id))
                            if (selectedRole?.id === role.id) setSelectedRole(null)
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Permissions Panel */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Key className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-foreground">
              {t("permissions.title")}
            </p>
            {selectedRole && (
              <>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs font-medium text-primary truncate">{selectedRole.name}</span>
                {selectedRole.parentRole && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                    inherits from {selectedRole.parentRole.name}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {selectedRole.permissions?.length || 0} direct
                </span>
                {selectedRole.permissions?.length ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {selectedRole.permissions.filter((p: any) => isAdminPermission(p.value)).length} admin
                  </span>
                ) : null}
              </>
            )}
          </div>

          {!selectedRole ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center">
                <MousePointerClick className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t("permissions.noRoleSelected")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {roles.length > 0 ? t("permissions.selectRoleHint") : t("permissions.createRoleFirst")}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Add permission section */}
              <div className="p-4 border-b border-border bg-secondary/10">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t("permissions.addPermission")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-muted-foreground mb-3">
                  <div className="rounded-lg border border-border bg-secondary/50 p-3">
                    <p className="font-medium text-foreground">User-level access</p>
                    <p className="mt-1 text-xs leading-5">
                      Permissions like <code>servers:*</code>, <code>files:*</code>, <code>tickets:*</code> and{" "}
                      <code>databases:*</code> allow normal users to manage servers, tickets, and data.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/50 p-3">
                    <p className="font-medium text-foreground">Admin-level access</p>
                    <p className="mt-1 text-xs leading-5">
                      These labels are driven from backend metadata, so only permissions actually classified as admin-level by the server are tagged here.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={newPermValue}
                    onChange={(e) => setNewPermValue(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 cursor-pointer"
                  >
                    <option value="">{t("permissions.selectPermission")}</option>
                    {orderedPermissionCategories.map((category) => (
                      <optgroup key={category} label={category}>
                        {permissionGroups[category]?.sort((a, b) => a.value.localeCompare(b.value)).map((perm) => (
                          <option key={perm.value} value={perm.value}>
                            {perm.value}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!newPermValue.trim() || permLoading}
                    onClick={async () => {
                      if (!newPermValue.trim()) return
                      setPermLoading(true)
                      try {
                        const data = await apiFetch(`${API_ENDPOINTS.roles}/${selectedRole.id}/permissions`, {
                          method: "POST",
                          body: JSON.stringify({ value: newPermValue.trim() }),
                        })
                        const updated = {
                          ...selectedRole,
                          permissions: [...(selectedRole.permissions || []), data.perm],
                        }
                        setSelectedRole(updated)
                        setRoles((prev: any[]) => prev.map((r: any) => (r.id === updated.id ? updated : r)))
                        setNewPermValue("")
                      } finally {
                        setPermLoading(false)
                      }
                    }}
                    className="bg-primary text-primary-foreground gap-1.5 h-9 px-3 text-xs shrink-0"
                  >
                    {permLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        <span className="hidden sm:inline">{t("actions.add")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Permissions list */}
              <div className="flex-1 overflow-y-auto">
                {(selectedRole.permissions || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
                    <Key className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">{t("permissions.noneAssigned")}</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const perms = selectedRole.permissions || []
                      const groups: Record<string, typeof perms> = {}

                      perms.forEach((p: any) => {
                        const [cat] = p.value.split(":")
                        const category =
                          p.value === "*" ? "Global" : cat.charAt(0).toUpperCase() + cat.slice(1)
                        if (!groups[category]) groups[category] = []
                        groups[category].push(p)
                      })

                      const categoryColors: Record<string, string> = {
                        Global: "text-destructive",
                        Servers: "text-blue-400",
                        Nodes: "text-emerald-400",
                        Ai: "text-violet-400",
                        Soc: "text-orange-400",
                        Orders: "text-amber-400",
                        Roles: "text-pink-400",
                        Permissions: "text-pink-400",
                        Wings: "text-cyan-400",
                        Dns: "text-teal-400",
                        Tickets: "text-indigo-400",
                      }

                      return (
                        <div className="divide-y divide-border">
                          {Object.entries(groups).map(([category, items]) => (
                            <div key={category} className="px-4 py-3">
                              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${categoryColors[category] || "text-muted-foreground"}`}>
                                {category}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map((p: any) => {
                                  const isWildcard = p.value === "*" || p.value.endsWith(":*")
                                  const admin = isAdminPermission(p.value)
                                  return (
                                    <div
                                      key={p.id}
                                      className={`group/perm inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                                        isWildcard
                                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                                          : admin
                                          ? "border-amber-300/30 bg-amber-300/10 hover:bg-amber-300/20"
                                          : "border-border bg-secondary/20 hover:bg-secondary/40"
                                      }`}
                                    >
                                      <span className={`font-mono text-xs ${isWildcard ? "text-destructive font-medium" : "text-foreground"}`}>
                                        {p.value}
                                      </span>
                                      {admin && (
                                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                                          Admin
                                        </span>
                                      )}
                                      <button
                                        onClick={async () => {
                                          await apiFetch(
                                            `${API_ENDPOINTS.roles}/${selectedRole.id}/permissions/${p.id}`,
                                            { method: "DELETE" }
                                          )
                                          const updated = {
                                            ...selectedRole,
                                            permissions: selectedRole.permissions.filter((x: any) => x.id !== p.id),
                                          }
                                          setSelectedRole(updated)
                                          setRoles((prev: any[]) =>
                                            prev.map((r: any) => (r.id === updated.id ? updated : r))
                                          )
                                        }}
                                        className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/perm:opacity-100 hover:text-destructive transition-all"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>

              {/* Full access warning */}
              {selectedRole.permissions?.some((p: any) => p.value === "*") && (
                <div className="flex items-start gap-2.5 border-t border-destructive/20 bg-destructive/5 px-4 py-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] text-destructive">
                    {t("permissions.fullAccessWarning")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}