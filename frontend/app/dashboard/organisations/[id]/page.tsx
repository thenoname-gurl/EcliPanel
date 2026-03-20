"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
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
  const params = useParams()
  const id = params?.id as string | undefined
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
  const [subdomainNewName, setSubdomainNewName] = useState("")

  const [subdomainRecordForm, setSubdomainRecordForm] = useState({ name: "", type: "A", ttl: 3600, content: "", proxied: false })
  const [subdomainEditId, setSubdomainEditId] = useState<string | null>(null)
  const [subdomainEditingRecord, setSubdomainEditingRecord] = useState<any|null>(null)

  const { user } = useAuth()
  const router = useRouter()

  const isManager = user && (user.orgRole === "admin" || user.orgRole === "owner")
  const isAdmin = user && (user.role === "admin" || user.role === "rootAdmin" || user.role === "*")

  const leaveOrg = async () => {
    if (!confirm('Leave organisation? This will remove your access and related subuser links.')) return
    try {
      await apiFetch(API_ENDPOINTS.organisationLeave.replace(":id", id), { method: 'POST' })
      setOrg((o: any) => ({ ...o, users: (o.users || []).filter((u: any) => u.id !== user.id) }))
      alert('You have left the organisation')
      router.push('/dashboard')
    } catch (err: any) {
      alert('Failed: ' + err.message)
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
    if (member.id != null) return `User #${member.id}`
    return "Unknown user"
  }

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setOrg(null)
    setMembers([])
    setOrders([])

    const load = async () => {
      try {
        const [o, u] = await Promise.all([
          apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id)),
          apiFetch(API_ENDPOINTS.organisationUsers.replace(":id", id)),
        ])
        const userOrg = user?.org && user.org.id?.toString() === id ? user.org : null
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
        setMembers(u || [])
        if (user && (user.orgRole === "admin" || user.orgRole === "owner")) {
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
  }, [id, user])

  const loadServers = useCallback(async () => {
    setServersLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.organisationServers.replace(":id", id))
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
      const data = await apiFetch(API_ENDPOINTS.organisationNodes.replace(":id", id))
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
      const data = await apiFetch(API_ENDPOINTS.organisationActivity.replace(":id", id))
      setActivity(Array.isArray(data) ? data : [])
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [id])

  const canManageSubdomain = (sub: any|null) => {
    if (!sub || !user || !org) return false
    if (user.role === 'admin' || user.role === '*') return true
    if (!(user.orgRole === 'admin' || user.orgRole === 'owner')) return false
    const handle = (org.handle || '').replace(/\.$/, '')
    const name = String(sub.name || '').replace(/\.$/, '')
    return name === handle || name.endsWith(`.${handle}`)
  }

  const loadSubdomains = async () => {
    if (!org?.handle) { setSubdomains([]); return }
    setSubdomainsLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.infraDnsZones)
      const handle = org.handle.replace(/\.$/, '')
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

  const loadSubdomainRecords = async (sub: any) => {
    if (!sub || !sub.id) return
    setSubdomainRecords([])
    try {
      const d = await apiFetch(API_ENDPOINTS.infraDns + `/zones/${sub.id}`)
      const list = d.recordsList || d.rrsets || []
      const normalized = (list || []).map((r: any) => {
        if (r.content) return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied }
        if (r.records && r.records.length) return { id: r.id || r.records[0].id, name: r.name, type: r.type, ttl: r.ttl, content: r.records.map((x:any)=>x.content).join(' | '), proxied: !!r.proxied }
        return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: '', proxied: !!r.proxied }
      })
      setSubdomainRecords(normalized || [])
    } catch {
      setSubdomainRecords([])
    }
  }

  const createSubdomain = async () => {
    if (!subdomainNewName) return
    try {
      await apiFetch(API_ENDPOINTS.infraDnsZones, { method: 'POST', body: JSON.stringify({ name: subdomainNewName, kind: 'Cloudflare' }) })
      setSubdomainNewName('')
      await loadSubdomains()
    } catch (e: any) {
      alert('Failed: ' + e.message)
    }
  }

  const handleTabChange = (tab: string) => {
    if (tab === "servers" && servers.length === 0 && !serversLoading) loadServers()
    if (tab === "nodes" && nodes.length === 0 && !nodesLoading) loadNodes()
    if (tab === "activity" && activity.length === 0 && !activityLoading) loadActivity()
    if (tab === "dns" && subdomains.length === 0 && !subdomainsLoading) loadSubdomains()
  }

  if (!id) return <p className="p-6 text-sm text-destructive">Invalid organisation.</p>
  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  if (!org) return <p className="p-6 text-sm text-destructive">Organisation not found.</p>

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    try {
      await apiFetch(API_ENDPOINTS.organisationInvite.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      })
      setInviteEmail("")
      alert("Invitation sent")
    } catch (err: any) {
      alert("Failed: " + err.message)
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
        alert("User added to organisation")
      }
    } catch (err: any) {
      alert("Failed: " + err.message)
    }
  }

  const resendInvite = async (inviteId: number) => {
    try {
      await apiFetch(API_ENDPOINTS.organisationResendInvite.replace(":id", id).replace(":inviteId", inviteId.toString()), { method: "POST" });
      alert("Invite resent")
    } catch (err: any) {
      alert("Failed: " + err.message)
    }
  }

  const revokeInvite = async (inviteId: number) => {
    if (!confirm('Revoke this invite?')) return
    try {
      await apiFetch(API_ENDPOINTS.organisationRevokeInvite.replace(":id", id).replace(":inviteId", inviteId.toString()), { method: "DELETE" });
      setOrg((o: any) => ({ ...o, invites: (o.invites || []).filter((iv: any) => iv.id !== inviteId) }))
      alert('Invite revoked')
    } catch (err: any) {
      alert('Failed: ' + err.message)
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

  const headerTitle = org.name || "Organisation"
  const headerDescription = `${org.handle || ""} · ${org.portalTier || "free"}`.replace(/^ · /, "")

  return (
    <>
      <PanelHeader title={headerTitle} description={headerDescription} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          {/* Org Header / Logo */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 min-w-0 box-border overflow-hidden">
            {org.avatarUrl ? (
              <img src={getAvatarUrl(org.avatarUrl)} alt="org logo" className="h-16 w-16 rounded-xl object-cover border border-border" />
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
                        alert("Failed to update tier: " + err.message)
                      }
                    }}
                    className="rounded-lg border border-border bg-input px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="free">Free</option>
                    <option value="paid">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  <label className="cursor-pointer">
                    <span className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80 transition-colors">
                      {logoUploading ? "Uploading…" : "Upload Logo"}
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
                          alert("Upload failed: " + err.message)
                        } finally {
                          setLogoUploading(false)
                        }
                      }}
                    />
                  </label>
                  {user && user.org?.id?.toString() === id && user.orgRole !== 'owner' && (
                    <Button size="sm" variant="destructive" onClick={leaveOrg}>Leave org</Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="members" onValueChange={handleTabChange} className="w-full">
            <TabsList className="flex gap-2 overflow-x-auto scrollbar-none border border-border bg-secondary/50 px-2">
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" /> Members
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Receipt className="h-3.5 w-3.5" /> Orders
              </TabsTrigger>
              <TabsTrigger value="servers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Server className="h-3.5 w-3.5" /> Servers
              </TabsTrigger>
              <TabsTrigger value="nodes" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Network className="h-3.5 w-3.5" /> Nodes
              </TabsTrigger>
              <TabsTrigger value="dns" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Globe className="h-3.5 w-3.5" /> DNS
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Activity className="h-3.5 w-3.5" /> Activity
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
                </div>
                {members.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No members in this organisation.</div>
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
                                alert("Failed to change role")
                              }
                            }}
                            className="rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
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
                    )})}
                  </div>
                )}
                {/* Pending invites */}
                {org.invites && org.invites.length > 0 && (
                  <div className="border-t border-border p-4">
                    <p className="text-xs font-medium text-foreground mb-2">Pending invitations</p>
                    <div className="space-y-2">
                      {org.invites.map((iv: any) => (
                        <div key={iv.id} className="flex items-center justify-between text-sm text-muted-foreground">
                          <div>{iv.email}</div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={iv.accepted ? 'secondary' : 'outline'}
                              className={iv.accepted ? 'text-xs' : 'text-xs border-warning/30 bg-warning/10 text-warning'}
                            >
                              {iv.accepted ? 'Accepted' : 'Pending'}
                            </Badge>
                            {(isManager || isAdmin) && !iv.accepted && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => resendInvite(iv.id)}>Resend</Button>
                                <Button size="sm" variant="destructive" onClick={() => revokeInvite(iv.id)}>Revoke</Button>
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
                    <p className="text-xs font-medium text-foreground mb-2">Add existing user (admin)</p>
                    <div className="flex gap-2 mb-2">
                      <Input placeholder="user id (optional)" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="w-28" />
                      <Input placeholder="or email@example.com" value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)} className="flex-1" />
                      <select value={addUserRole} onChange={(e) => setAddUserRole(e.target.value)} className="rounded-lg border border-border bg-input px-2 py-1 text-xs">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>
                    <div>
                      <Button size="sm" onClick={addUserDirect}>Add user</Button>
                    </div>
                  </div>
                )}
                {/* Invite */}
                <div className="border-t border-border p-4">
                  <p className="text-xs font-medium text-foreground mb-2">Invite a user</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={sendInvite}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              <div className="rounded-xl border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">Organisation Orders</p>
                </div>
                {orders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No orders for this organisation.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">ID</th>
                          <th className="px-4 py-3 text-left font-medium">Description</th>
                          <th className="px-4 py-3 text-left font-medium">Amount</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-sm text-foreground">{o.id}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{o.description || "—"}</td>
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
                              {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}
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
                  <p className="text-sm font-medium text-foreground">Organisation Servers</p>
                  <Button size="sm" variant="outline" onClick={loadServers} disabled={serversLoading}>
                    {serversLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
                  </Button>
                </div>
                {serversLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading servers…</div>
                ) : servers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No servers found for this organisation.</div>
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
                                <span className="text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</span>
                                <span className="text-foreground font-mono">{cpuPct}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(Number(cpuPct), 100)}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><MemoryStick className="h-3 w-3" /> RAM</span>
                                <span className="text-foreground font-mono">{formatBytes(memBytes)}{memLimit > 0 ? ` / ${formatBytes(memLimit)}` : ""}</span>
                              </div>
                              {memLimit > 0 && (
                                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${memPct}%` }} />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="h-3 w-3" /> Disk</span>
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
                  <p className="text-sm font-medium text-foreground">Organisation Nodes</p>
                  <Button size="sm" variant="outline" onClick={loadNodes} disabled={nodesLoading}>
                    {nodesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
                  </Button>
                </div>
                {nodesLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading nodes…</div>
                ) : nodes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No nodes assigned to this organisation.</div>
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
                              <span className="text-muted-foreground">Memory Limit</span>
                              <span className="text-foreground font-mono">{formatBytes(n.memory * 1024 * 1024)}</span>
                            </div>
                          )}
                          {n.disk != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Disk Limit</span>
                              <span className="text-foreground font-mono">{formatBytes(n.disk * 1024 * 1024)}</span>
                            </div>
                          )}
                          {n.cpu != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">CPU Limit</span>
                              <span className="text-foreground font-mono">{n.cpu}%</span>
                            </div>
                          )}
                          {n.serverLimit != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Server Limit</span>
                              <span className="text-foreground font-mono">{n.serverLimit}</span>
                            </div>
                          )}
                          {n.cost != null && n.cost > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Monthly Cost</span>
                              <span className="text-foreground font-mono">${Number(n.cost).toFixed(2)}/mo</span>
                            </div>
                          )}
                          {n.portRangeStart != null && n.portRangeEnd != null && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Port Range</span>
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
                              <Edit className="h-3 w-3" /> Edit
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">Organisation Activity</p>
                  <Button size="sm" variant="outline" onClick={loadActivity} disabled={activityLoading}>
                    {activityLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
                  </Button>
                </div>
                {activityLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading activity…</div>
                ) : activity.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No activity recorded for this organisation.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {activity.map((log: any) => {
                      const actionLabels: Record<string, string> = {
                        "org:create": "Created organisation",
                        "org:remove_member": "Removed member",
                        "org:change_role": "Changed member role",
                        "org:invite": "Sent invite",
                        "org:accept_invite": "Accepted invite",
                        "server:create": "Created server",
                        "server:delete": "Deleted server",
                        "server:update": "Updated server",
                        "server:suspend": "Suspended server",
                        "server:unsuspend": "Unsuspended server",
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
