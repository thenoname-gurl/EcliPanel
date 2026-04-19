"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import {
  Users,
  Receipt,
  Server,
  Network,
  Trash2,
  UserPlus,
  Loader2,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
  Edit,
  Globe,
} from "lucide-react"

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export default function OrganisationDetail() {
  const t = useTranslations("organisationsDetailPage")
  const params = useParams()
  const id = params?.id as string | undefined
  const orgId = id ?? ""
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [addUserEmail, setAddUserEmail] = useState("")
  const [addUserId, setAddUserId] = useState("")
  const [addUserRole, setAddUserRole] = useState("member")
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [nodes, setNodes] = useState<any[]>([])
  const [logoUploading, setLogoUploading] = useState(false)
  const [serversLoading, setServersLoading] = useState(false)
  const [nodesLoading, setNodesLoading] = useState(false)
  const [activity, setActivity] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  const [subdomains, setSubdomains] = useState<any[]>([])
  const [subdomainsLoading, setSubdomainsLoading] = useState(false)
  const [subdomainSelection, setSubdomainSelection] = useState<any | null>(null)
  const [subdomainRecords, setSubdomainRecords] = useState<any[]>([])
  const [subdomainRecordsLoading, setSubdomainRecordsLoading] = useState(false)
  const [subdomainNewName, setSubdomainNewName] = useState("")

  const [subdomainRecordForm, setSubdomainRecordForm] = useState({ name: "", type: "A", ttl: 3600, content: "", proxied: false, autoTtl: false })
  const [subdomainEditId, setSubdomainEditId] = useState<string | null>(null)
  const [subdomainEditingRecord, setSubdomainEditingRecord] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState("members")
  const searchParams = useSearchParams()

  const { user } = useAuth()
  const router = useRouter()

  const activeMembership = user?.orgs?.find((x: any) => String(x.id) === String(id))
  const activeOrgRole = activeMembership?.orgRole || (user?.org?.id?.toString() === id ? user?.orgRole : undefined)
  const isManager = user && (activeOrgRole === "admin" || activeOrgRole === "owner")
  const isAdmin = user && (user.role === "admin" || user.role === "rootAdmin" || user.role === "*")

  const leaveOrg = async () => {
    if (!confirm(t('confirm.leaveOrg'))) return
    if (!orgId || !user) return
    try {
      await apiFetch(API_ENDPOINTS.organisationLeave.replace(":id", orgId), { method: 'POST' })
      setOrg((o: any) => ({ ...o, users: (o.users || []).filter((u: any) => u.id !== user.id) }))
      alert(t('alerts.leftOrg'))
      router.push('/dashboard')
    } catch (err: any) {
      alert(t('alerts.failed', { reason: err.message }))
    }
  }

  const getAvatarUrl = (url?: string) => {
    if (!url) return undefined
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    const base = process.env.NEXT_PUBLIC_API_BASE || ""
    if (!base) return url
    try {
      return new URL(url, base).toString()
    } catch {
      return url
    }
  }

  const getMemberAvatarUrl = (member: any) => {
    const avatarUrl = member.avatarUrl || member.settings?.avatarUrl || member.settings?.avatar?.url
    return getAvatarUrl(avatarUrl)
  }

  const getMemberDisplayName = (member: any) => {
    const display = (member.displayName || "").trim()
    const legal = [member.firstName, member.lastName].filter(Boolean).join(" ").trim()

    if (display && legal && display !== legal) {
      return `${display} (${legal})`
    }

    if (display) return display
    if (legal) return legal
    if (member.email) return member.email
    if (member.id != null) return t('members.userIdLabel', { id: member.id })
    return t('members.unknownUser')
  }

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setOrg(null)
    setMembers([])
    setOrders([])

    const load = async () => {
      try {
        const o = await apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id))
        const userOrg: any = user?.org && user.org.id?.toString() === id ? user.org : null
        const mergedOrg = {
          id: o?.id ?? userOrg?.id,
          name: o?.name ?? userOrg?.name,
          handle: o?.handle ?? userOrg?.handle,
          portalTier: o?.portalTier ?? userOrg?.portalTier ?? 'unknown',
          avatarUrl: o?.avatarUrl ?? userOrg?.avatarUrl,
          users: o?.users ?? userOrg?.users ?? [],
          invites: o?.invites ?? userOrg?.invites ?? [],
          ...o,
        }
        setOrg(mergedOrg)
        if (!subdomainNewName && mergedOrg.handle) {
          setSubdomainNewName(mergedOrg.handle)
        }
        if (user && (activeOrgRole === "admin" || activeOrgRole === "owner" || user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*')) {
          try {
            const u = await apiFetch(API_ENDPOINTS.organisationUsers.replace(":id", id))
            setMembers(Array.isArray(u) ? u : (mergedOrg.users || []))
          } catch {
            setMembers(mergedOrg.users || [])
          }
        } else {
          setMembers(mergedOrg.users || [])
        }
        if (user && (activeOrgRole === "admin" || activeOrgRole === "owner")) {
          const ords = await apiFetch(API_ENDPOINTS.orders)
          setOrders(Array.isArray(ords) ? ords : [])
        }
      } catch (err) {
        console.error(err)
        if (user?.org?.id?.toString() === id) {
          setOrg(user.org)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, user, activeOrgRole])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) {
      setActiveTab(tab)
      if (tab === 'dns') {
        loadSubdomains()
      }
    }
  }, [searchParams])

  const loadServers = useCallback(async () => {
    setServersLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.organisationServers.replace(":id", orgId))
      setServers(Array.isArray(data) ? data : [])
    } catch {
      setServers([])
    } finally {
      setServersLoading(false)
    }
  }, [id])

  const loadNodes = useCallback(async () => {
    setNodesLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.organisationNodes.replace(":id", orgId))
      setNodes(Array.isArray(data) ? data : [])
    } catch {
      setNodes([])
    } finally {
      setNodesLoading(false)
    }
  }, [id])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.organisationActivity.replace(":id", orgId))
      setActivity(Array.isArray(data) ? data : [])
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [id])

  const canManageSubdomain = (sub: any | null) => {
    if (!sub || !user || !org) return false
    if (user.role === 'admin' || user.role === 'rootAdmin' || user.role === 'staff' || user.role === '*') return true
    if (!(activeOrgRole === 'owner' || activeOrgRole === 'admin' || activeOrgRole === 'member')) return false
    const handle = (org.handle || '').replace(/\.$/, '')
    const name = String(sub.name || '').replace(/\.$/, '')
    return name === handle || name.endsWith(`.${handle}`)
  }

  const loadSubdomains = async (forceRefresh = false) => {
    if (!org?.handle) { setSubdomains([]); return }
    setSubdomainsLoading(true)
    try {
      const endpoint = API_ENDPOINTS.organisationDnsZones.replace(':id', orgId)
      let data = await apiFetch(endpoint)
      const handle = org.handle.replace(/\.$/, '')

      const normalizedData = (data || []).map((z: any) => ({
        ...z,
        name: String(z.name || '').replace(/\.$/, ''),
        kind: z.kind ? String(z.kind).toLowerCase() : 'cloudflare',
      }))
      if (normalizedData.length === 0 && handle) {
        try {
          await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ name: handle, kind: 'Cloudflare' }) })
          data = await apiFetch(endpoint)
        } catch {
          // skip
        }
      }

      const list = (data || []).map((z: any) => ({
        ...z,
        name: String(z.name || '').replace(/\.$/, ''),
        kind: z.kind ? String(z.kind).toLowerCase() : 'cloudflare',
      }))
      setSubdomains(list.filter((z: any) => {
        const n = String(z.name || '').replace(/\.$/, '')
        return n === handle || n.endsWith(`.${handle}`)
      }))
    } catch {
      setSubdomains([])
    } finally {
      setSubdomainsLoading(false)
    }
  }

  const loadSubdomainRecords = async (sub: any, forceRefresh = false) => {
    if (!sub || !sub.id) return
    setSubdomainSelection(sub)
    setSubdomainRecords([])
    setSubdomainRecordsLoading(true)
    try {
      const d = await apiFetch(API_ENDPOINTS.organisationDnsZone.replace(':id', orgId).replace(':zoneId', sub.id))
      const list = d.recordsList || d.rrsets || []
      const normalized = (list || []).map((r: any) => {
        if (r.content) return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied }
        if (r.records && r.records.length) return { id: r.id || r.records[0].id, name: r.name, type: r.type, ttl: r.ttl, content: r.records.map((x: any) => x.content).join(' | '), proxied: !!r.proxied }
        return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: '', proxied: !!r.proxied }
      })
      setSubdomainRecords(normalized || [])
    } catch {
      setSubdomainRecords([])
    } finally {
      setSubdomainRecordsLoading(false)
    }
  }

  const createSubdomain = async () => {
    const endpoint = API_ENDPOINTS.organisationDnsZones.replace(':id', orgId)
    const handle = org?.handle?.replace(/\.$/, '')
    let name = subdomainNewName.trim() || handle || ''
    if (!name) {
      alert(t('alerts.subdomainNameRequired'))
      return
    }

    if (!handle) {
      alert(t('alerts.orgHandleNotSet'))
      return
    }

    if (name !== handle) {
      alert(t('alerts.onlyHandleZone'))
      return
    }

    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ name, kind: 'Cloudflare' }) })
      setSubdomainNewName('')
      await loadSubdomains()
    } catch (e: any) {
      alert(t('alerts.failed', { reason: e.message }))
    }
  }

  const refreshSubdomainRecords = async () => {
    if (!subdomainSelection) return
    await loadSubdomainRecords(subdomainSelection, true)
  }

  const addSubdomainRecord = async () => {
    if (!subdomainSelection) return
    if (!subdomainRecordForm.type || !subdomainRecordForm.content) return
    try {
      const body = { ...subdomainRecordForm }
      if (body.autoTtl) body.ttl = 1
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecords
        .replace(':id', orgId)
        .replace(':zoneId', subdomainSelection.id),
        { method: 'POST', body: JSON.stringify(body) }
      )
      setSubdomainRecordForm({ name: '', type: 'A', ttl: 3600, content: '', proxied: false, autoTtl: false })
      await loadSubdomainRecords(subdomainSelection)
    } catch (e: any) {
      alert(t('alerts.failed', { reason: e.message }))
    }
  }

  const updateSubdomainRecord = async () => {
    if (!subdomainSelection || !subdomainEditId || !subdomainEditingRecord) return
    try {
      const body = { ...subdomainEditingRecord }
      if (body.autoTtl) body.ttl = 1
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecord
        .replace(':id', orgId)
        .replace(':zoneId', subdomainSelection.id)
        .replace(':recordId', subdomainEditId),
        { method: 'PUT', body: JSON.stringify(body) }
      )
      setSubdomainEditId(null)
      setSubdomainEditingRecord(null)
      await loadSubdomainRecords(subdomainSelection)
    } catch (e: any) {
      alert(t('alerts.failedUpdate', { reason: e.message }))
    }
  }

  const deleteSubdomainRecord = async (record: any) => {
    if (!subdomainSelection || !record?.id) return
    if (!confirm(t('confirm.deleteRecord'))) return
    try {
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecord
        .replace(':id', orgId)
        .replace(':zoneId', subdomainSelection.id)
        .replace(':recordId', String(record.id)),
        { method: 'DELETE' }
      )
      await loadSubdomainRecords(subdomainSelection)
    } catch (e: any) {
      alert(t('alerts.failedDelete', { reason: e.message }))
    }
  }

  const handleTabChange = (tab: string) => {
    if (tab === "servers" && servers.length === 0 && !serversLoading) loadServers()
    if (tab === "nodes" && nodes.length === 0 && !nodesLoading) loadNodes()
    if (tab === "activity" && activity.length === 0 && !activityLoading) loadActivity()
    if (tab === "dns" && subdomains.length === 0 && !subdomainsLoading) loadSubdomains()
  }

  if (!id) return <p className="p-6 text-sm text-destructive">{t('states.invalidOrganisation')}</p>
  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t('states.loading')}</p>
  if (!org) return <p className="p-6 text-sm text-destructive">{t('states.organisationNotFound')}</p>

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    if (inviteEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      alert(t('alerts.cannotInviteYourself'))
      return
    }
    try {
      await apiFetch(API_ENDPOINTS.organisationInvite.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      })
      setInviteEmail("")
      alert(t('alerts.invitationSent'))
    } catch (err: any) {
      alert(t('alerts.failed', { reason: err.message }))
    }
  }

  const addUserDirect = async () => {
    if (!addUserEmail.trim() && !addUserId.trim()) return
    try {
      const body: any = { orgRole: addUserRole }
      if (addUserId.trim()) body.userId = Number(addUserId)
      else body.email = addUserEmail.trim()
      const res = await apiFetch(API_ENDPOINTS.organisationAddUser.replace(":id", id), {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (res?.target) {
        setMembers((m) => [...m, res.target])
        setAddUserEmail("")
        setAddUserId("")
        alert(t('alerts.userAdded'))
      }
    } catch (err: any) {
      alert(t('alerts.failed', { reason: err.message }))
    }
  }

  const resendInvite = async (inviteId: number) => {
    try {
      await apiFetch(API_ENDPOINTS.organisationResendInvite.replace(":id", id).replace(":inviteId", inviteId.toString()), { method: "POST" });
      alert(t('alerts.inviteResent'))
    } catch (err: any) {
      alert(t('alerts.failed', { reason: err.message }))
    }
  }

  const revokeInvite = async (inviteId: number) => {
    if (!confirm(t('confirm.revokeInvite'))) return
    try {
      await apiFetch(API_ENDPOINTS.organisationRevokeInvite.replace(":id", id).replace(":inviteId", inviteId.toString()), { method: "DELETE" });
      setOrg((o: any) => ({ ...o, invites: (o.invites || []).filter((iv: any) => iv.id !== inviteId) }))
      alert(t('alerts.inviteRevoked'))
    } catch (err: any) {
      alert(t('alerts.failed', { reason: err.message }))
    }
  }

  const removeMember = async (userId: number) => {
    try {
      await apiFetch(
        API_ENDPOINTS.organisationRemoveUser.replace(":id", id).replace(":userId", userId.toString()),
        { method: "DELETE" }
      )
      setMembers((m) => m.filter((u) => u.id !== userId))
    } catch (err) {
      console.error(err)
    }
  }

  const headerTitle = org.name || t('header.fallbackTitle')
  const headerDescription = `${org.handle || ""} · ${org.portalTier || "free"}`.replace(/^ · /, "")

  return (
    <>
      <PanelHeader title={headerTitle} description={headerDescription} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Org Header / Logo */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 min-w-0 box-border overflow-hidden">
            {org.avatarUrl ? (
              <img src={getAvatarUrl(org.avatarUrl)} alt={t('labels.orgLogoAlt')} className="h-16 w-16 rounded-xl object-cover border border-border" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-secondary/50 border border-border flex items-center justify-center text-2xl text-muted-foreground font-bold">
                {org.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground truncate">{org.name}</h2>
                <Badge variant="outline" className="text-xs">{org.portalTier || "free"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">@{org.handle}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isManager && (
                <>
                  <select
                    value={org.portalTier || "free"}
                    onChange={async (e) => {
                      const tier = e.target.value
                      try {
                        await apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id), {
                          method: "PUT",
                          body: JSON.stringify({ portalTier: tier }),
                        })
                        setOrg({ ...org, portalTier: tier })
                      } catch (err: any) {
                        alert(t('alerts.failedUpdateTier', { reason: err.message }))
                      }
                    }}
                    className="rounded-lg border border-border bg-input px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="free">{t('tiers.free')}</option>
                    <option value="paid">{t('tiers.pro')}</option>
                    <option value="enterprise">{t('tiers.enterprise')}</option>
                  </select>
                  <label className="cursor-pointer">
                    <span className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80 transition-colors">
                      {logoUploading ? t('actions.uploading') : t('actions.uploadLogo')}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={logoUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setLogoUploading(true)
                        try {
                          const fd = new FormData()
                          fd.append("file", file)
                          const res = await apiFetch(API_ENDPOINTS.orgAvatar.replace(":id", id), { method: "POST", body: fd })
                          setOrg((o: any) => ({ ...o, avatarUrl: res.url }))
                        } catch (err: any) {
                          alert(t('alerts.uploadFailed', { reason: err.message }))
                        } finally {
                          setLogoUploading(false)
                        }
                      }}
                    />
                  </label>
                  {user && activeOrgRole !== 'owner' && (
                    <Button size="sm" variant="destructive" onClick={leaveOrg}>{t('actions.leaveOrg')}</Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); handleTabChange(value); }} className="w-full">
            <TabsList className="flex gap-2 overflow-x-auto scrollbar-none border border-border bg-secondary/50 px-2">
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" /> {t('tabs.members')}
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Receipt className="h-3.5 w-3.5" /> {t('tabs.orders')}
              </TabsTrigger>
              <TabsTrigger value="servers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Server className="h-3.5 w-3.5" /> {t('tabs.servers')}
              </TabsTrigger>
              <TabsTrigger value="nodes" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Network className="h-3.5 w-3.5" /> {t('tabs.nodes')}
              </TabsTrigger>
              <TabsTrigger value="dns" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Globe className="h-3.5 w-3.5" /> {t('tabs.dns')}
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Activity className="h-3.5 w-3.5" /> {t('tabs.activity')}
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('members.count', { count: members.length })}</p>
                </div>
                {members.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('members.none')}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {members.map((m) => {
                      const memberName = getMemberDisplayName(m)
                      const memberAvatar = getMemberAvatarUrl(m)

                      return (
                        <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0 overflow-hidden">
                              {memberAvatar ? (
                                <img src={memberAvatar} alt="avatar" className="h-full w-full object-cover" />
                              ) : (
                                (memberName?.[0] || "?").toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{memberName}</p>
                              <p className="text-xs text-muted-foreground truncate">{m.email || `User #${m.id}`}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={m.orgRole}
                              onChange={async (e) => {
                                const newRole = e.target.value
                                try {
                                  await apiFetch(
                                    API_ENDPOINTS.organisationAddUserRole.replace(":id", id).replace(":userId", m.id.toString()),
                                    { method: "PUT", body: JSON.stringify({ orgRole: newRole }) }
                                  )
                                  setMembers((prev) => prev.map((u) => (u.id === m.id ? { ...u, orgRole: newRole } : u)))
                                } catch {
                                  alert(t('alerts.failedChangeRole'))
                                }
                              }}
                              className="rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground"
                            >
                              <option value="member">{t('roles.member')}</option>
                              <option value="admin">{t('roles.admin')}</option>
                              <option value="owner">{t('roles.owner')}</option>
                            </select>
                            <Badge variant="outline" className="text-[10px]">{m.orgRole}</Badge>
                            {isManager && (
                              <button
                                onClick={() => removeMember(m.id)}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* Pending invites */}
                {org.invites && org.invites.length > 0 && (
                  <div className="border-t border-border p-4">
                    <p className="text-xs font-medium text-foreground mb-2">{t('members.pendingInvitations')}</p>
                    <div className="space-y-2">
                      {org.invites.map((iv: any) => (
                        <div key={iv.id} className="flex items-center justify-between text-sm text-muted-foreground">
                          <div>{iv.email}</div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={iv.accepted ? 'secondary' : 'outline'}
                              className={iv.accepted ? 'text-xs' : 'text-xs border-warning/30 bg-warning/10 text-warning'}
                            >
                              {iv.accepted ? t('members.accepted') : t('members.pending')}
                            </Badge>
                            {(isManager || isAdmin) && !iv.accepted && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => resendInvite(iv.id)}>{t('actions.resend')}</Button>
                                <Button size="sm" variant="destructive" onClick={() => revokeInvite(iv.id)}>{t('actions.revoke')}</Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Admin: Add user directly */}
                {isAdmin && (
                  <div className="border-t border-border p-4">
                    <p className="text-xs font-medium text-foreground mb-2">{t('members.addExistingUser')}</p>
                    <div className="flex gap-2 mb-2">
                      <Input placeholder={t('members.userIdOptional')} value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="w-28" />
                      <Input placeholder={t('members.orEmail')} value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)} className="flex-1" />
                      <select value={addUserRole} onChange={(e) => setAddUserRole(e.target.value)} className="rounded-lg border border-border bg-input px-2 py-1 text-xs">
                        <option value="member">{t('roles.member')}</option>
                        <option value="admin">{t('roles.admin')}</option>
                        <option value="owner">{t('roles.owner')}</option>
                      </select>
                    </div>
                    <div>
                      <Button size="sm" onClick={addUserDirect}>{t('actions.addUser')}</Button>
                    </div>
                  </div>
                )}
                {/* Invite */}
                {(isManager || isAdmin) && (
                  <div className="border-t border-border p-4">
                    <p className="text-xs font-medium text-foreground mb-2">{t('members.inviteUser')}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('members.userEmail')}
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button size="sm" onClick={sendInvite}>
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" /> {t('actions.invite')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('orders.title')}</p>
                </div>
                {orders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('orders.none')}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">{t('orders.columns.id')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('orders.columns.description')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('orders.columns.amount')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('orders.columns.status')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('orders.columns.date')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-sm text-foreground">{o.id}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{o.description || t('common.dash')}</td>
                            <td className="px-4 py-3 font-mono text-sm text-foreground">${Number(o.amount ?? 0).toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={
                                  o.status === "active"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                                    : o.status === "cancelled"
                                      ? "border-destructive/30 bg-destructive/10 text-destructive text-xs"
                                      : "border-border text-muted-foreground text-xs"
                                }
                              >
                                {o.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : t('common.dash')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Servers Tab */}
            <TabsContent value="servers" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('servers.title')}</p>
                  <Button size="sm" variant="outline" onClick={loadServers} disabled={serversLoading}>
                    {serversLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('actions.refresh')}
                  </Button>
                </div>
                {serversLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('servers.loading')}</div>
                ) : servers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('servers.none')}</div>
                ) : (
                  <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 max-w-[100vw] w-full box-border">
                    {servers.map((s: any) => {
                      const uuid = s.configuration?.uuid || s.uuid
                      const name = s.configuration?.meta?.name || s.name || uuid
                      const state = s.state || s.status || "unknown"
                      const resources = s.utilization || s.resources
                      const build = s.configuration?.build || s.build || {}
                      const cpuPct = Number(resources?.cpu_absolute ?? 0).toFixed(1)
                      const memBytes = Number(resources?.memory_bytes ?? 0)
                      const memLimit = Number(build.memory_limit ?? 0) * 1024 * 1024
                      const memPct = memLimit > 0 ? Math.min((memBytes / memLimit) * 100, 100) : 0
                      const diskBytes = Number(resources?.disk_bytes ?? 0)
                      const stateColor =
                        state === "running" || state === "online"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : state === "stopped" || state === "offline"
                            ? "border-red-500/30 bg-red-500/10 text-red-400"
                            : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                      return (
                        <div key={uuid} className="rounded-lg border border-border bg-secondary/20 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate">{name}</span>
                            </div>
                            <Badge variant="outline" className={`${stateColor} text-[10px] shrink-0`}>{state}</Badge>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> {t('labels.cpu')}</span>
                                <span className="text-foreground font-mono">{cpuPct}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(Number(cpuPct), 100)}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><MemoryStick className="h-3 w-3" /> {t('labels.ram')}</span>
                                <span className="text-foreground font-mono">{formatBytes(memBytes)}{memLimit > 0 ? ` / ${formatBytes(memLimit)}` : ""}</span>
                              </div>
                              {memLimit > 0 && (
                                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${memPct}%` }} />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="h-3 w-3" /> {t('labels.disk')}</span>
                              <span className="text-foreground font-mono">{formatBytes(diskBytes)}</span>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-muted-foreground font-mono truncate">{uuid}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Nodes Tab */}
            <TabsContent value="nodes" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('nodes.title')}</p>
                  <Button size="sm" variant="outline" onClick={loadNodes} disabled={nodesLoading}>
                    {nodesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('actions.refresh')}
                  </Button>
                </div>
                {nodesLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('nodes.loading')}</div>
                ) : nodes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('nodes.none')}</div>
                ) : (
                  <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 max-w-[100vw] w-full box-border">
                    {nodes.map((n: any) => (
                      <div key={n.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Network className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{n.name}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{n.nodeType}</Badge>
                        </div>
                        <div className="flex flex-col gap-1.5 text-xs">
                          {n.memory != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.memoryLimit')}</span>
                              <span className="text-foreground font-mono">{formatBytes(n.memory * 1024 * 1024)}</span>
                            </div>
                          )}
                          {n.disk != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.diskLimit')}</span>
                              <span className="text-foreground font-mono">{formatBytes(n.disk * 1024 * 1024)}</span>
                            </div>
                          )}
                          {n.cpu != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.cpuLimit')}</span>
                              <span className="text-foreground font-mono">{n.cpu}%</span>
                            </div>
                          )}
                          {n.serverLimit != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.serverLimit')}</span>
                              <span className="text-foreground font-mono">{n.serverLimit}</span>
                            </div>
                          )}
                          {n.cost != null && n.cost > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.monthlyCost')}</span>
                              <span className="text-foreground font-mono">${Number(n.cost).toFixed(2)}/mo</span>
                            </div>
                          )}
                          {n.portRangeStart != null && n.portRangeEnd != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('nodes.portRange')}</span>
                              <span className="text-foreground font-mono">{n.portRangeStart}–{n.portRangeEnd}</span>
                            </div>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/dashboard/infrastructure/nodes?edit=${n.nodeId || n.id}`)}
                              className="border-border h-7 px-2 text-xs gap-1"
                            >
                                <Edit className="h-3 w-3" /> {t('actions.edit')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* DNS Tab */}
            <TabsContent value="dns" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('dns.title')}</p>
                  <div className="flex items-center gap-2">
                    {!(subdomains || []).some((z: any) => String(z.name || '').replace(/\.$/, '') === String(org?.handle || '').replace(/\.$/, '')) && (
                      <>
                        <Input
                          value={subdomainNewName}
                          onChange={(e) => setSubdomainNewName(e.target.value)}
                          placeholder={t('dns.subdomainPlaceholder')}
                          className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
                        />
                        <Button size="sm" onClick={createSubdomain} disabled={!org?.handle || subdomainNewName.trim() !== (org?.handle || '').replace(/\.$/, '')}>{t('actions.create')}</Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => loadSubdomains()} disabled={subdomainsLoading}>
                      {subdomainsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('actions.refresh')}
                    </Button>
                  </div>
                </div>

                {subdomainsLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('dns.loadingSubdomains')}</div>
                ) : subdomains.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('dns.noSubdomains')}</div>
                ) : (
                  <div className="grid gap-2 p-4">
                    {subdomains.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <button
                          onClick={() => loadSubdomainRecords(sub)}
                          className={`flex-1 text-left rounded-lg border border-border bg-card p-3 ${subdomainSelection?.id === sub.id ? 'ring-2 ring-primary' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm text-foreground">{sub.name}</span>
                            <span className="text-xs text-muted-foreground">{sub.kind}</span>
                          </div>
                        </button>
                        {String(sub.name || '').replace(/\.$/, '') !== String(org?.handle || '').replace(/\.$/, '') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              if (!confirm(t('confirm.removeSubdomain', { name: sub.name }))) return
                              try {
                                await apiFetch(API_ENDPOINTS.organisationDnsZone.replace(':id', orgId).replace(':zoneId', sub.id), { method: 'DELETE' })
                                if (subdomainSelection?.id === sub.id) setSubdomainSelection(null)
                                await loadSubdomains()
                              } catch (e: any) {
                                alert(t('alerts.failedDeleteSubdomain', { reason: e.message }))
                              }
                            }}
                          >
                            {t('actions.delete')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {subdomainSelection && (
                  <div className="p-4 border-t border-border">
                    <p className="text-sm font-medium text-foreground">{t('dns.zone', { name: subdomainSelection.name })}</p>
                    <p className="text-xs text-muted-foreground">{t('dns.id', { id: subdomainSelection.id })}</p>
                    <div className="mt-3">
                      {subdomainRecordsLoading ? (
                        <p className="text-sm text-muted-foreground">{t('dns.loadingRecords')}</p>
                      ) : subdomainRecords.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('dns.noRecords')}</p>
                      ) : (
                        <div className="space-y-2">
                          {subdomainRecords.map((r) => (
                            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                              <div className="min-w-0">
                                <p className="font-mono text-sm text-foreground truncate">{r.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{r.type} • {t('dns.ttl', { ttl: r.ttl })} • <Badge variant="outline" className="text-[10px]">{r.proxied ? t('dns.proxied') : t('dns.dns')}</Badge></p>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-sm text-foreground truncate max-w-[180px]">{r.content}</p>
                                <Button size="sm" variant="outline" onClick={() => {
                                  setSubdomainEditId(String(r.id))
                                  setSubdomainEditingRecord({ name: r.name, type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied, autoTtl: r.ttl === 1 })
                                }}>
                                  {t('actions.edit')}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteSubdomainRecord(r)}>
                                  {t('actions.delete')}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {subdomainEditId && subdomainEditingRecord && (
                      <div className="mt-4 p-3 rounded-lg border border-border bg-secondary/10">
                        <p className="text-sm font-medium mb-2">{t('dns.editRecord')}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                          <Input placeholder={t('dns.name')} value={subdomainEditingRecord.name}
                            onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, name: e.target.value }))}
                          />
                          <select className="rounded-lg border border-border bg-input px-3 py-2 text-sm" value={subdomainEditingRecord.type}
                            onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, type: e.target.value }))}>
                            <option>A</option> <option>AAAA</option> <option>CNAME</option> <option>TXT</option>
                          </select>
                          <Input type="number" placeholder={t('dns.ttlShort')} value={subdomainEditingRecord.ttl}
                            onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, ttl: Number(e.target.value) }))}
                            disabled={!!subdomainEditingRecord.autoTtl}
                          />
                          <Input placeholder={t('dns.content')} value={subdomainEditingRecord.content}
                            onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, content: e.target.value }))}
                          />
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center text-sm">
                              <input type="checkbox" className="mr-2" checked={!!subdomainEditingRecord.autoTtl} onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, autoTtl: e.target.checked }))} />
                              <span className="text-xs text-muted-foreground">{t('dns.autoTtl')}</span>
                            </label>
                            <label className="inline-flex items-center text-sm">
                              <input type="checkbox" className="mr-2" checked={!!subdomainEditingRecord.proxied} onChange={(e) => setSubdomainEditingRecord((f: any) => ({ ...f, proxied: e.target.checked }))} />
                              <span className="text-xs text-muted-foreground">{t('dns.proxied')}</span>
                            </label>
                          </div>
                          <Button onClick={updateSubdomainRecord}>{t('actions.save')}</Button>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button variant="outline" onClick={() => { setSubdomainEditId(null); setSubdomainEditingRecord(null); }}>{t('actions.cancel')}</Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-sm font-medium text-foreground mb-2">{t('dns.addRecordTitle')}</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                        <Input placeholder={t('dns.nameExample')} value={subdomainRecordForm.name}
                          onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, name: e.target.value }))}
                        />
                        <select className="rounded-lg border border-border bg-input px-3 py-2 text-sm" value={subdomainRecordForm.type}
                          onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, type: e.target.value }))}>
                          <option>A</option>
                          <option>AAAA</option>
                          <option>CNAME</option>
                          <option>TXT</option>
                        </select>
                        <Input type="number" placeholder={t('dns.ttlShort')} value={subdomainRecordForm.ttl}
                          onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, ttl: Number(e.target.value) }))}
                          disabled={subdomainRecordForm.autoTtl}
                        />
                        <Input placeholder={t('dns.content')} value={subdomainRecordForm.content}
                          onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, content: e.target.value }))}
                        />
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center text-sm">
                            <input type="checkbox" className="mr-2" checked={subdomainRecordForm.autoTtl} onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, autoTtl: e.target.checked }))} />
                            <span className="text-xs text-muted-foreground">{t('dns.autoTtl')}</span>
                          </label>
                          <label className="inline-flex items-center text-sm">
                            <input type="checkbox" className="mr-2" checked={subdomainRecordForm.proxied} onChange={(e) => setSubdomainRecordForm((f) => ({ ...f, proxied: e.target.checked }))} />
                            <span className="text-xs text-muted-foreground">{t('dns.proxied')}</span>
                          </label>
                        </div>
                        <Button onClick={addSubdomainRecord}>{t('actions.addRecord')}</Button>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-muted-foreground">
                          {`@ => ${subdomainSelection.name} ; subdomain name => name.${subdomainSelection.name}`}
                        </label>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t('activity.title')}</p>
                  <Button size="sm" variant="outline" onClick={loadActivity} disabled={activityLoading}>
                    {activityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('actions.refresh')}
                  </Button>
                </div>
                {activityLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('activity.loading')}</div>
                ) : activity.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">{t('activity.none')}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {activity.map((log: any) => {
                      const actionLabels: Record<string, string> = {
                        "org:create": t('activity.actions.orgCreate'),
                        "org:remove_member": t('activity.actions.orgRemoveMember'),
                        "org:change_role": t('activity.actions.orgChangeRole'),
                        "org:invite": t('activity.actions.orgInvite'),
                        "org:accept_invite": t('activity.actions.orgAcceptInvite'),
                        "server:create": t('activity.actions.serverCreate'),
                        "server:delete": t('activity.actions.serverDelete'),
                        "server:update": t('activity.actions.serverUpdate'),
                        "server:suspend": t('activity.actions.serverSuspend'),
                        "server:unsuspend": t('activity.actions.serverUnsuspend'),
                      }
                      const label = actionLabels[log.action] || log.action
                      const meta = log.metadata || {}
                      return (
                        <div key={log.id} className="px-4 py-3 hover:bg-secondary/20 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground">{label}</span>
                              {meta.email && (
                                <Badge variant="outline" className="text-[10px] shrink-0">{meta.email}</Badge>
                              )}
                              {meta.newRole && (
                                <Badge variant="outline" className="text-[10px] shrink-0">→ {meta.newRole}</Badge>
                              )}
                              {meta.command && (
                                <code className="text-[10px] bg-secondary/50 rounded px-1.5 py-0.5 text-muted-foreground truncate max-w-[200px]">{meta.command}</code>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {log.ipAddress && (
                                <span className="text-[10px] text-muted-foreground font-mono">{log.ipAddress}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}
                              </span>
                            </div>
                          </div>
                          {log.details && (
                            <p className="mt-1 text-xs text-muted-foreground pl-5">{log.details}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </>
  )
}
