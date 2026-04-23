"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

type SubuserInvite = {
  id: number
  serverUuid: string
  serverName: string | null
  serverExists: boolean
  createdAt?: string
  userEmail?: string
}

export default function SubuserInvitesPage() {
  const t = useTranslations("serverDetailPage")
  const [invites, setInvites] = useState<SubuserInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadInvites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch(API_ENDPOINTS.serverSubuserInvites)
      setInvites(Array.isArray(result) ? result : [])
    } catch (e: any) {
      setError(e?.message || t("subusers.unableToLoadInvites"))
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  const handleInviteAction = useCallback(async (inviteId: number, accept: boolean) => {
    setActionLoading((prev) => ({ ...prev, [inviteId]: true }))
    setError(null)
    try {
      const endpoint = accept
        ? API_ENDPOINTS.serverSubuserInviteAccept
        : API_ENDPOINTS.serverSubuserInviteReject
      await apiFetch(endpoint.replace(":inviteId", String(inviteId)), { method: "POST" })
      setInvites((current) => current.filter((invite) => invite.id !== inviteId))
    } catch (e: any) {
      setError(e?.message || (accept ? t("subusers.failedAcceptInvite") : t("subusers.failedRejectInvite")))
    } finally {
      setActionLoading((prev) => ({ ...prev, [inviteId]: false }))
    }
  }, [t])
  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8">
      <PanelHeader
        title={t("subusers.pendingInvitesTitle")}
        description={t("subusers.pendingInvitesDescription")}
      />

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-secondary/10 p-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("subusers.invitesLoading")}
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/10 p-10 text-sm text-muted-foreground">
          {t("subusers.invitesEmpty")}
        </div>
      ) : (
        <div className="space-y-4">
          {invites.map((invite) => (
            <div key={invite.id} className="rounded-3xl border border-border bg-background/90 p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    {invite.serverName ? t("subusers.inviteServerName", { name: invite.serverName }) : t("subusers.inviteServerMissing")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {invite.serverExists ? invite.serverUuid : t("subusers.inviteServerMissing")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleInviteAction(invite.id, true)}
                    disabled={!!actionLoading[invite.id]}
                  >
                    {t("subusers.acceptInvite")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInviteAction(invite.id, false)}
                    disabled={!!actionLoading[invite.id]}
                  >
                    {t("subusers.rejectInvite")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
