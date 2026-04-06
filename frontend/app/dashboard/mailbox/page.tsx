"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Server, Building2, Bell, Check, X, Loader2, Mail } from "lucide-react"

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value?: string | number) {
  return new Date(value || Date.now()).toLocaleString()
}

type MailboxItem = {
  id: string
  inviteId: number
  type: "organisation" | "subuser" | "notification"
  title: string
  description: string
  details: string
  sender: string
  badge: string
  date: string
  avatarLabel: string
}

export default function MailboxPage() {
  const t = useTranslations("mailboxPage")
  const [orgInvites, setOrgInvites] = useState<any[]>([])
  const [subuserInvites, setSubuserInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    setLoading(true)
    try {
      const [orgData, subData] = await Promise.all([
        apiFetch(API_ENDPOINTS.organisationInvites),
        apiFetch(API_ENDPOINTS.serverSubuserInvites),
      ])
      setOrgInvites(Array.isArray(orgData) ? orgData : [])
      setSubuserInvites(Array.isArray(subData) ? subData : [])
    } catch (e) {
      setOrgInvites([])
      setSubuserInvites([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  const items = useMemo<MailboxItem[]>(() => {
    const orgItems = orgInvites.map((invite) => ({
      id: `organisation-${invite.id}`,
      inviteId: invite.id,
      type: "organisation" as const,
      title: invite.organisationName
        ? t("sections.organisations")
        : t("sections.organisationInviteFallback"),
      description: t("sections.organisationsDescription"),
      details: t("detail.organisationBody", {
        organisation: invite.organisationName || t("unknownOrganisation"),
        email: invite.email,
      }),
      sender: invite.organisationName || t("sections.organisations"),
      badge: t("sections.organisations"),
      date: formatDate(invite.createdAt),
      avatarLabel: invite.organisationName || invite.email,
    }))

    const subuserItems = subuserInvites.map((invite) => ({
      id: `subuser-${invite.id}`,
      inviteId: invite.id,
      type: "subuser" as const,
      title: invite.serverName || invite.serverUuid || t("sections.serverSubusers"),
      description: t("sections.serverSubusersDescription"),
      details: t("detail.subuserBody", {
        server: invite.serverName || invite.serverUuid || t("detail.unknownServer"),
        email: invite.email || invite.userEmail,
      }),
      sender: invite.serverName || invite.serverUuid || t("sections.serverSubusers"),
      badge: t("sections.serverSubusers"),
      date: formatDate(invite.createdAt),
      avatarLabel: invite.serverName || invite.serverUuid || "S",
    }))

    return [...orgItems, ...subuserItems]
  }, [orgInvites, subuserInvites, t])

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(items[0].id)
    }
  }, [items, selectedItemId])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  const handleAction = async (
    type: "organisation" | "subuser",
    inviteId: number,
    action: "accept" | "reject"
  ) => {
    setActionLoading((prev) => ({ ...prev, [`${type}-${inviteId}`]: true }))
    try {
      const endpoint =
        type === "organisation"
          ? action === "accept"
            ? API_ENDPOINTS.organisationInviteAccept.replace(":inviteId", String(inviteId))
            : API_ENDPOINTS.organisationInviteReject.replace(":inviteId", String(inviteId))
          : action === "accept"
          ? API_ENDPOINTS.serverSubuserInviteAccept.replace(":inviteId", String(inviteId))
          : API_ENDPOINTS.serverSubuserInviteReject.replace(":inviteId", String(inviteId))

      await apiFetch(endpoint, { method: "POST" })
      await loadInvites()
    } catch (e: any) {
      alert(e?.message || t("errors.failedAction"))
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${type}-${inviteId}`]: false }))
    }
  }

  const inviteCount = orgInvites.length + subuserInvites.length

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader title={t("title")} description={t("description")} />
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="p-6 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t("summary.title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("summary.description")}</p>
            </div>
            <Badge variant="outline" className="text-sm">
              {inviteCount} {t("summary.invites")}
            </Badge>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("sections.inbox")}</h2>
                      <p className="text-sm text-muted-foreground">{t("sections.inboxDescription")}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    {inviteCount}
                  </Badge>
                </div>

                {loading ? (
                  <div className="mt-6 flex items-center justify-center rounded-xl border border-border bg-secondary/20 p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-border bg-secondary/20 p-8 text-center text-sm text-muted-foreground">
                    {t("list.empty")}
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className={`w-full text-left rounded-2xl border p-4 transition-all ${
                          selectedItemId === item.id
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card hover:border-primary/20 hover:bg-secondary/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-11 w-11 flex-shrink-0">
                            <AvatarFallback>{getInitials(item.avatarLabel)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                              <span className="text-xs text-muted-foreground">{item.date}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{item.sender}</span>
                              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                {item.badge}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{item.details}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-6 min-h-[320px]">
                {selectedItem ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{selectedItem.badge}</p>
                        <h1 className="text-xl font-semibold text-foreground">{selectedItem.title}</h1>
                        <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{selectedItem.date}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("details.sender")}</p>
                        <p className="mt-2 font-medium text-foreground">{selectedItem.sender}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("details.received")}</p>
                        <p className="mt-2 font-medium text-foreground">{selectedItem.date}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("details.body")}</p>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{selectedItem.details}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAction(selectedItem.type, selectedItem.inviteId, "accept")}
                        disabled={actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`]}
                      >
                        {actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            {t("actions.accept")}
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(selectedItem.type, selectedItem.inviteId, "reject")}
                        disabled={actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`]}
                      >
                        <X className="mr-2 h-4 w-4" />
                        {t("actions.reject")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-border bg-secondary/20 p-8 text-center">
                    <p className="text-sm font-medium text-foreground">{t("details.selectItem")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{t("details.selectItemDescription")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
