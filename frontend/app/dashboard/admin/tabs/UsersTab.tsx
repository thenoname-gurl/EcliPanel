"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import { useTranslations } from "next-intl"
import {
  Ban,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserCog,
  UserMinus,
  Users,
  X,
} from "lucide-react"

export default function UsersTab({ ctx }: { ctx: any }) {
  const t = useTranslations("adminUsersTab")
  const { user } = useAuth()
  const {
    userSearch,
    setUserSearch,
    fetchUsers,
    setUserSearchFocused,
    userSearchFocused,
    filteredUsers,
    openViewUser,
    redactName,
    redact,
    usersTotal,
    forceRefreshTab,
    users,
    openEditUser,
    toggleSuspend,
    resetDemo,
    startExportJob,
    userExportJobId,
    exportJobs,
    deassignStudent,
    requireStudentReverify,
    deleteUser,
    usersPage,
    USERS_PER,
  } = ctx

  const canEditUser = !!user && hasPermission(user, 'admin:user:edit')
  const canSuspendUser = !!user && hasPermission(user, 'users:suspend')
  const canDeleteUser = !!user && hasPermission(user, 'users:delete')
  const canResetDemo = !!user && hasPermission(user, 'users:write')
  const canRequireStudentReverify = !!user && hasPermission(user, 'users:write')
  const canDeassignStudent = !!user && hasPermission(user, 'admin:student:deassign')

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">
          <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder={t("search.placeholder")}
                value={userSearch}
                onChange={(e) => {
                  const q = e.target.value
                  setUserSearch(q)
                  fetchUsers(1, q)
                }}
                onKeyDown={(e) => e.key === "Enter" && fetchUsers(1, userSearch)}
                onFocus={() => setUserSearchFocused(true)}
                onBlur={() => setTimeout(() => setUserSearchFocused(false), 150)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
              {userSearch && (
                <button
                  onClick={() => {
                    setUserSearch("")
                    fetchUsers(1, "")
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {userSearchFocused && userSearch.trim().length > 0 && filteredUsers.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                {filteredUsers.slice(0, 5).map((u: any) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      openViewUser(u)
                      setUserSearch("")
                      setUserSearchFocused(false)
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/40 last:border-0"
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={`${u.firstName || t("common.user")} ${t("common.avatar")}`} className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {u.firstName?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{redactName(u.firstName, u.lastName, u.displayName)}</p>
                      <p className="text-xs text-muted-foreground truncate">{redact(u.email)}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
                {filteredUsers.length > 5 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground text-center bg-secondary/30">+{filteredUsers.length - 5} {t("search.moreResults")}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">{usersTotal ? t("search.totalUsers", { count: usersTotal }) : ""}</span>
            <button
              onClick={() => forceRefreshTab("users")}
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
                <th className="px-4 py-3 text-left font-medium">{t("table.user")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.role")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.tier")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.verification")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">{users.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: any) => (
                  <tr key={user.id} className="border-b border-border/50 transition-colors hover:bg-secondary/20 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={`${user.firstName || t("common.user")} ${t("common.avatar")}`} className="h-8 w-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {user.firstName?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{redactName(user.firstName, user.lastName, user.displayName)}</p>
                          <p className="text-xs text-muted-foreground truncate">{redact(user.email)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        user.role === "*" || user.role === "rootAdmin"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : user.role === "admin"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-border bg-secondary/50 text-muted-foreground"
                      }>
                          {user.role || t("common.user")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        user.portalType === "enterprise"
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : user.portalType === "paid" || user.portalType === "pro" || user.portalType === "educational"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-secondary/50 text-muted-foreground"
                      }>
                        {user.portalType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: t("verification.email"), verified: user.emailVerified },
                          { label: t("verification.student"), verified: user.studentVerified },
                          { label: t("verification.id"), verified: user.idVerified },
                        ].map((v) => (
                          <span
                            key={v.label}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.verified ? "bg-emerald-500/10 text-emerald-400" : "bg-secondary/50 text-muted-foreground"}`}
                          >
                            {v.verified ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                            {v.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {user.suspended ? (
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{t("status.suspended")}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">{t("status.active")}</Badge>
                        )}
                        {user.supportBanned && (
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]">{t("status.supportBanned")}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openViewUser(user)} title={t("actions.viewProfile")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEditUser && (
                          <button onClick={() => openEditUser(user)} title={t("actions.editUser")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                            <UserCog className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canSuspendUser && (
                          <button
                            onClick={() => toggleSuspend(user)}
                            title={user.suspended ? t("actions.unsuspend") : t("actions.suspend")}
                            className={`rounded-md p-1.5 transition-colors ${user.suspended ? "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"}`}
                          >
                            {user.suspended ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {user.demoUsed && canResetDemo && (
                          <button onClick={() => resetDemo(user)} title={t("actions.resetDemo")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => startExportJob(user)} title={t("actions.startExportJob")} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        {userExportJobId[user.id] && exportJobs[userExportJobId[user.id]] && (
                          <>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {exportJobs[userExportJobId[user.id]].status} {exportJobs[userExportJobId[user.id]].progress}%
                            </span>
                            {exportJobs[userExportJobId[user.id]].status === "completed" && exportJobs[userExportJobId[user.id]].downloadUrl && (
                              <a href={exportJobs[userExportJobId[user.id]].downloadUrl} className="text-xs text-sky-400 hover:text-sky-300 ml-2" target="_blank" rel="noreferrer">
                                {t("actions.download")}
                              </a>
                            )}
                          </>
                        )}
                        {(user.studentVerified || user.portalType === "educational") && canDeassignStudent && (
                          <button onClick={() => deassignStudent(user)} title={t("actions.deassignStudent")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canRequireStudentReverify && (user.studentVerified || user.portalType === "educational") && (
                          <button onClick={() => requireStudentReverify(user)} title={t("actions.requireReverify")} className="rounded-md p-1.5 text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteUser && (
                          <button onClick={() => deleteUser(user)} title={t("actions.deleteAccount")} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
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
        {filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{users.length === 0 ? t("states.loading") : t("states.noMatch")}</p>
            </div>
          </div>
        ) : (
          filteredUsers.map((user: any) => (
            <div key={user.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-start gap-3 p-4 pb-3">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={`${user.firstName || t("common.user")} ${t("common.avatar")}`} className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {user.firstName?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{redactName(user.firstName, user.lastName, user.displayName)}</p>
                      <p className="text-xs text-muted-foreground truncate">{redact(user.email)}</p>
                    </div>
                    {user.suspended ? (
                      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive shrink-0 text-[10px]">{t("status.suspended")}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0 text-[10px]">{t("status.active")}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                <div className="bg-card px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("table.role")}</p>
                  <Badge variant="outline" className={`text-[10px] ${user.role === "*" || user.role === "rootAdmin" ? "border-destructive/30 bg-destructive/10 text-destructive" : user.role === "admin" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-secondary/50 text-muted-foreground"}`}>
                    {user.role || t("common.user")}
                  </Badge>
                </div>
                <div className="bg-card px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("table.tier")}</p>
                  <Badge variant="outline" className={`text-[10px] ${user.portalType === "enterprise" ? "border-warning/30 bg-warning/10 text-warning" : user.portalType === "paid" || user.portalType === "pro" || user.portalType === "educational" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground"}`}>
                    {user.portalType}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-secondary/20">
                {[
                  { label: t("verification.email"), verified: user.emailVerified },
                  { label: t("verification.student"), verified: user.studentVerified },
                  { label: t("verification.id"), verified: user.idVerified },
                ].map((v) => (
                  <span key={v.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${v.verified ? "bg-emerald-500/10 text-emerald-400" : "bg-secondary/80 text-muted-foreground"}`}>
                    {v.verified ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    {v.label}
                  </span>
                ))}
                {user.supportBanned && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive">
                    <Ban className="h-2.5 w-2.5" />
                    {t("status.banned")}
                  </span>
                )}
              </div>

              <div className="flex items-center border-t border-border divide-x divide-border">
                <button onClick={() => openViewUser(user)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t("actions.view")}</span>
                </button>
                {canEditUser && (
                  <button onClick={() => openEditUser(user)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <UserCog className="h-3.5 w-3.5" />
                    <span>{t("actions.edit")}</span>
                  </button>
                )}
                {canSuspendUser && (
                  <button
                    onClick={() => toggleSuspend(user)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${user.suspended ? "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                  >
                    {user.suspended ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    <span>{user.suspended ? t("actions.unsuspend") : t("actions.suspend")}</span>
                  </button>
                )}

                <div className="relative group/more">
                  <button className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute bottom-full right-0 mb-1 hidden group-focus-within/more:block rounded-lg border border-border bg-card shadow-xl overflow-hidden z-50 min-w-[160px]">
                    {user.demoUsed && canResetDemo && (
                      <button onClick={() => resetDemo(user)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("actions.resetDemo")}
                      </button>
                    )}
                    {(user.studentVerified || user.portalType === "educational") && canDeassignStudent && (
                      <button onClick={() => deassignStudent(user)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <UserMinus className="h-3.5 w-3.5" />
                        {t("actions.deassignStudent")}
                      </button>
                    )}
                    {(user.studentVerified || user.portalType === "educational") && canRequireStudentReverify && (
                      <button onClick={() => requireStudentReverify(user)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors">
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("actions.requireReverify")}
                      </button>
                    )}
                    {canDeleteUser && (
                      <button onClick={() => deleteUser(user)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-t border-border">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("actions.deleteAccount")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            {t("pagination.page")} <span className="font-medium text-foreground">{usersPage}</span>
            {usersTotal ? (
              <>
                {" "}{t("pagination.of")} <span className="font-medium text-foreground">{Math.max(1, Math.ceil(usersTotal / USERS_PER))}</span>
              </>
            ) : null}
            {usersTotal ? <span className="hidden sm:inline"> · {t("pagination.total", { count: usersTotal })}</span> : null}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (usersPage > 1) fetchUsers(usersPage - 1, userSearch)
              }}
              disabled={usersPage <= 1}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">{t("actions.previous")}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!usersTotal || usersPage < Math.ceil((usersTotal || 0) / USERS_PER)) fetchUsers(usersPage + 1, userSearch)
              }}
              disabled={usersTotal ? usersPage >= Math.ceil(usersTotal / USERS_PER) : users.length < USERS_PER}
              className="h-8 px-3 text-xs"
            >
              <span className="hidden sm:inline mr-1">{t("actions.next")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
