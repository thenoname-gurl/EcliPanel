"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Users,
  Link2,
  CheckCircle,
  AlertTriangle,
  Baby,
  ShieldCheck,
  Mail,
  Loader2,
  UserPlus,
  Sliders,
} from "lucide-react"

const limitFields = [
  { key: "memory", label: "Memory (MB)" },
  { key: "disk", label: "Disk (MB)" },
  { key: "cpu", label: "CPU" },
  { key: "serverLimit", label: "Server Limit" },
  { key: "databases", label: "Databases" },
  { key: "backups", label: "Backups" },
]

function getAgeFromDob(dob?: string | null): number | null {
  if (!dob) return null
  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - date.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - date.getUTCMonth()
  const dayDiff = now.getUTCDate() - date.getUTCDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return age
}

export default function FamilyPage() {
  const { user, refreshUser } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [children, setChildren] = useState<any[]>([])
  const [parentEmail, setParentEmail] = useState("")
  const [childEmail, setChildEmail] = useState("")
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [invites, setInvites] = useState<any[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [acceptCodes, setAcceptCodes] = useState<Record<number, string>>({})
  const [limitEdits, setLimitEdits] = useState<Record<number, Record<string, string>>>({})
  const [childDobEdits, setChildDobEdits] = useState<Record<number, string>>({})
  const [childMessage, setChildMessage] = useState<string | null>(null)
  const [sendingRequest, setSendingRequest] = useState(false)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [savingLimits, setSavingLimits] = useState<Record<number, boolean>>({})
  const [savingChildDob, setSavingChildDob] = useState<Record<number, boolean>>({})
  const [acceptingRequest, setAcceptingRequest] = useState<Record<number, boolean>>({})

  const computedAge = useMemo(() => {
    if (!user) return null
    return typeof user.age === "number" ? user.age : getAgeFromDob(user?.dateOfBirth)
  }, [user])

  const hasKnownAge = typeof computedAge === "number"
  const isAdult = useMemo(() => {
    if (!user) return false
    if (hasKnownAge) return computedAge >= 18
    if (user.isChildAccount === true) return false
    return false
  }, [user, computedAge, hasKnownAge])

  const isLinkedChild = useMemo(() => {
    if (!user) return false
    return user.parentId != null && !isAdult
  }, [user, isAdult])

  const canViewChildren = useMemo(() => {
    if (!user) return false
    return hasKnownAge ? computedAge >= 18 : false
  }, [user, hasKnownAge, computedAge])

  const isParent = useMemo(() => {
    return canViewChildren
  }, [canViewChildren])

  const isChild = useMemo(() => {
    if (!user) return false
    if (user.parentId != null && !isAdult) return true
    if (hasKnownAge) return computedAge < 18
    return user.isChildAccount === true
  }, [user, hasKnownAge, computedAge, isAdult])

  const canRequestParent = useMemo(() => {
    if (!user) return false
    if (user.parentId != null) return false
    return isChild
  }, [user, isChild])

  useEffect(() => {
    if (!user) return
    fetchData()
  }, [user])

  async function fetchData() {
    setLoading(true)
    setFormError(null)
    setFormMessage(null)
    try {
      const requestData = await apiFetch(API_ENDPOINTS.parentLinkRequests)
      const requestArray = Array.isArray(requestData?.requests) ? requestData.requests : []
      setRequests(requestArray)

      let childrenArray: any[] = []
      if (canViewChildren) {
        try {
          const childrenData = await apiFetch(API_ENDPOINTS.usersMeChildren)
          childrenArray = Array.isArray(childrenData?.children) ? childrenData.children : []
          setChildren(childrenArray)
        } catch {
          setChildren([])
        }
      } else {
        setChildren([])
      }

      if (isParent) {
        try {
          const inviteData = await apiFetch(API_ENDPOINTS.parentRegistrationInvites)
          setInvites(Array.isArray(inviteData?.invites) ? inviteData.invites : [])
        } catch {
          setInvites([])
        }
      } else {
        setInvites([])
      }

      const nextLimits: Record<number, Record<string, string>> = {}
      const nextDobEdits: Record<number, string> = {}
      childrenArray.forEach((child: any) => {
        nextLimits[child.id] = {
          memory: child.limits?.memory != null ? String(child.limits.memory) : "",
          disk: child.limits?.disk != null ? String(child.limits.disk) : "",
          cpu: child.limits?.cpu != null ? String(child.limits.cpu) : "",
          serverLimit: child.limits?.serverLimit != null ? String(child.limits.serverLimit) : "",
          databases: child.limits?.databases != null ? String(child.limits.databases) : "",
          backups: child.limits?.backups != null ? String(child.limits.backups) : "",
        }
        nextDobEdits[child.id] = child.dateOfBirth || ""
      })
      setLimitEdits((prev) => ({ ...nextLimits, ...prev }))
      setChildDobEdits((prev) => ({ ...nextDobEdits, ...prev }))
    } catch (error: any) {
      setFormError(error?.message || "Unable to load family data.")
    } finally {
      setLoading(false)
    }
  }

  async function sendParentRequest() {
    setFormError(null)
    setFormMessage(null)
    if (!parentEmail.trim()) {
      setFormError("Please enter your parent's email address.")
      return
    }
    setSendingRequest(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.parentLinkRequests, {
        method: "POST",
        body: { parentEmail: parentEmail.trim() },
      })
      setParentEmail("")
      setFormMessage(`Link request created. Share this code with your parent: ${data.request.code}`)
      setRequests((prev) => [data.request, ...prev])
    } catch (error: any) {
      setFormError(error?.message || "Failed to request a parent link.")
    } finally {
      setSendingRequest(false)
    }
  }

  async function createParentInvite() {
    setFormError(null)
    setInviteMessage(null)
    setCreatingInvite(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.parentRegistrationInvites, {
        method: "POST",
        body: { childEmail: childEmail.trim() || undefined },
      })
      setChildEmail("")
      const inviteLink = data?.invite?.link
      setInviteMessage(`Invite created. Share this link with your child: ${inviteLink}`)
      setInvites((prev) => [data.invite, ...prev])
      toast({
        title: "Child invite created",
        description: (
          <span>
            Invite link created.{' '}
            <a href={inviteLink} target="_blank" rel="noreferrer" className="font-medium underline">
              Open link
            </a>
          </span>
        ),
      })
    } catch (error: any) {
      setFormError(error?.message || "Failed to create a child invite.")
    } finally {
      setCreatingInvite(false)
    }
  }

  async function revokeInvite(inviteId: number) {
    setChildMessage(null)
    try {
      await apiFetch(API_ENDPOINTS.parentRegistrationInviteRevoke.replace(":inviteId", String(inviteId)), {
        method: "DELETE",
      })
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId))
      setChildMessage("Invite revoked successfully.")
    } catch (error: any) {
      setChildMessage(error?.message || "Failed to revoke invite.")
    }
  }

  async function updateChildDob(childId: number) {
    setChildMessage(null)
    const newDob = (childDobEdits[childId] || "").trim()
    if (!newDob) {
      setChildMessage("Please provide a date of birth for the child.")
      return
    }

    setSavingChildDob((prev) => ({ ...prev, [childId]: true }))
    try {
      const data = await apiFetch(API_ENDPOINTS.childUpdate.replace(":childId", String(childId)), {
        method: "PUT",
        body: { dateOfBirth: newDob },
      })
      setChildren((prev) => prev.map((child) => (child.id === childId ? data.child : child)))
      setChildDobEdits((prev) => ({ ...prev, [childId]: data.child.dateOfBirth || "" }))
      setChildMessage("Child date of birth updated successfully.")
    } catch (error: any) {
      setChildMessage(error?.message || "Failed to update child date of birth.")
    } finally {
      setSavingChildDob((prev) => ({ ...prev, [childId]: false }))
    }
  }

  async function acceptRequest(requestId: number) {
    setChildMessage(null)
    const code = acceptCodes[requestId] || ""
    if (!code.trim()) {
      setChildMessage("Please enter the linking code to accept the request.")
      return
    }
    setAcceptingRequest((prev) => ({ ...prev, [requestId]: true }))
    try {
      await apiFetch(API_ENDPOINTS.parentLinkRequestAccept.replace(":id", String(requestId)), {
        method: "POST",
        body: { code: code.trim() },
      })
      setChildMessage("Request accepted successfully.")
      setAcceptCodes((prev) => ({ ...prev, [requestId]: "" }))
      fetchData()
    } catch (error: any) {
      setChildMessage(error?.message || "Failed to accept the request.")
    } finally {
      setAcceptingRequest((prev) => ({ ...prev, [requestId]: false }))
    }
  }

  async function updateChildLimits(childId: number) {
    setChildMessage(null)
    const edit = limitEdits[childId] || {}
    const limits: Record<string, number | null> = {}
    limitFields.forEach((field) => {
      const value = edit[field.key]
      if (value !== undefined && value !== null && value !== "") {
        limits[field.key] = Number(value)
      }
    })
    setSavingLimits((prev) => ({ ...prev, [childId]: true }))
    try {
      const data = await apiFetch(
        API_ENDPOINTS.childLimits.replace(":childId", String(childId)),
        {
          method: "PUT",
          body: { limits: Object.keys(limits).length ? limits : null },
        }
      )
      setChildMessage("Child limits updated successfully.")
      setChildren((prev) => prev.map((child) => (child.id === childId ? data.child : child)))
      refreshUser()
    } catch (error: any) {
      setChildMessage(error?.message || "Failed to update child limits.")
    } finally {
      setSavingLimits((prev) => ({ ...prev, [childId]: false }))
    }
  }

  function updateLimitField(childId: number, field: string, value: string) {
    setLimitEdits((prev) => ({
      ...prev,
      [childId]: { ...(prev[childId] || {}), [field]: value },
    }))
  }

  const age =
    typeof user?.age === "number" ? user.age : getAgeFromDob(user?.dateOfBirth)

  return (
    <>
      <PanelHeader
        title="Family Management"
        description="Manage parent-child account links and set custom resource limits for child accounts."
      />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">

          {/* Development Notice */}
          <div className="flex items-center gap-4 rounded-xl border border-warning/30 bg-warning/5 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">Development Preview</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                This feature is still in development and not fully rolled out publicly yet. Use with caution.
              </p>
            </div>
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
              Beta
            </Badge>
          </div>

          {/* Account Status Banner */}
          {user && (
            <div
              className={`flex items-center gap-4 rounded-xl border p-5 ${
                isParent
                  ? "border-success/30 bg-success/5"
                  : isLinkedChild
                  ? "border-primary/30 bg-primary/5"
                  : isChild
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  isParent
                    ? "bg-success/10"
                    : isLinkedChild
                    ? "bg-primary/10"
                    : isChild
                    ? "bg-primary/10"
                    : "bg-muted"
                }`}
              >
                {isParent ? (
                  <ShieldCheck className="h-6 w-6 text-success" />
                ) : isLinkedChild ? (
                  <Link2 className="h-6 w-6 text-primary" />
                ) : isChild ? (
                  <Baby className="h-6 w-6 text-primary" />
                ) : (
                  <Users className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">
                  {isParent
                    ? "Parent Account"
                    : isLinkedChild
                    ? "Linked Child Account"
                    : isChild
                    ? "Child Account"
                    : "Unknown Account"}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isParent
                    ? "You can manage linked child accounts and configure their resource limits."
                    : isLinkedChild
                    ? `Age: ${age ?? "unknown"} · ${user.dateOfBirth ? `DOB: ${user.dateOfBirth}` : "Linked to a parent account."}`
                    : isChild
                    ? `Age: ${age ?? "unknown"} · ${user.dateOfBirth ? `DOB: ${user.dateOfBirth}` : "Set your date of birth in Settings to unlock parent linking."}`
                    : "Your age is unknown. Set your date of birth in Settings to unlock family management features."}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  isParent
                    ? "border-success/30 bg-success/10 text-success"
                    : isLinkedChild
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : isChild
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground"
                }
              >
                {isParent
                  ? "Parent"
                  : isLinkedChild
                  ? "Linked child"
                  : isChild
                  ? "Child"
                  : "Unknown"}
              </Badge>
            </div>
          )}

          {user?.parentId != null && hasKnownAge && isAdult && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Legal age reached</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your account is now adult in your country. Please review and update your email, phone, and billing details in Settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading family data...
            </div>
          )}

          {/* Global error */}
          {!loading && formError && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {formError}
            </div>
          )}

          {/* Request Parent Link */}
          {canRequestParent && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Request Parent Linkage"
                description="Send a linking request to your parent. After creation, share the generated code with them so they can accept."
              />
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">
                    Parent email address
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="parent@example.com"
                        className="w-full rounded-lg border border-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <Button
                      onClick={sendParentRequest}
                      disabled={sendingRequest || !parentEmail.trim()}
                      className="shrink-0"
                    >
                      {sendingRequest ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Request Link
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {formMessage && (
                  <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {formMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Parent Invite */}
          {isParent && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Invite a Child Account"
                description="Create a child invite code that your child can use during registration. You can optionally prefill their email."
              />
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">
                    Child email address (optional)
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={childEmail}
                        onChange={(e) => setChildEmail(e.target.value)}
                        placeholder="child@example.com"
                        className="w-full rounded-lg border border-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <Button
                      onClick={createParentInvite}
                      disabled={creatingInvite}
                      className="shrink-0"
                    >
                      {creatingInvite ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Create Invite
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {inviteMessage && (
                  <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {inviteMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Child invites */}
          {isParent && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Child Invite Codes"
                description="View and revoke invites that children can use to register directly under your account."
              />
              <div className="mt-5 flex flex-col gap-4">
                {inviteMessage && (
                  <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {inviteMessage}
                  </div>
                )}
                {!invites.length ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                    <Users className="h-4 w-4 shrink-0" />
                    No child invites created yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {invites.map((invite) => (
                      <div key={invite.id} className="rounded-lg border border-border bg-secondary/10 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">Invite #{invite.id}</p>
                            <p className="text-xs text-muted-foreground">
                              {invite.childEmail ? `Child email: ${invite.childEmail}` : "Open invite"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigator.clipboard.writeText(invite.link)}
                            >
                              Copy link
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => revokeInvite(invite.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm font-mono text-foreground">
                          {invite.link}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Family Requests */}
          {!loading && requests.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Family Requests"
                description="Pending and completed link requests between parent and child accounts."
              />

              {childMessage && (
                <div
                  className={`mt-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${
                    childMessage.toLowerCase().includes("fail") ||
                    childMessage.toLowerCase().includes("error") ||
                    childMessage.toLowerCase().includes("please")
                      ? "border-destructive/30 bg-destructive/5 text-destructive"
                      : "border-success/30 bg-success/5 text-success"
                  }`}
                >
                  {childMessage.toLowerCase().includes("fail") ||
                  childMessage.toLowerCase().includes("error") ||
                  childMessage.toLowerCase().includes("please") ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {childMessage}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-4">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className={`rounded-lg border p-4 transition-all ${
                      request.status === "accepted"
                        ? "border-success/30 bg-success/5"
                        : request.status === "pending"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-secondary/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                            request.status === "accepted"
                              ? "bg-success/10 text-success"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          <Link2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Request #{request.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Child: {request.child?.email || "Unknown"}
                            {request.parentEmail ? ` · Parent: ${request.parentEmail}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          request.status === "accepted"
                            ? "border-success/30 bg-success/10 text-success"
                            : request.status === "pending"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-secondary/50 text-muted-foreground"
                        }
                      >
                        {request.status}
                      </Badge>
                    </div>

                    {/* Linking code display */}
                    {request.code && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          Linking Code
                        </p>
                        <p className="mt-1 font-mono text-sm font-medium text-foreground">
                          {request.code}
                        </p>
                      </div>
                    )}

                    {/* Accept form (shown to parent) */}
                    {request.parentId === user?.id && request.status === "pending" && (
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex flex-1 flex-col gap-1.5">
                          <label className="text-xs font-medium text-foreground">
                            Enter code from child
                          </label>
                          <input
                            value={acceptCodes[request.id] || ""}
                            onChange={(e) =>
                              setAcceptCodes((prev) => ({
                                ...prev,
                                [request.id]: e.target.value,
                              }))
                            }
                            placeholder="ABCDE1"
                            className="rounded-lg border border-border bg-input px-4 py-2.5 font-mono text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                        <Button
                          onClick={() => acceptRequest(request.id)}
                          disabled={acceptingRequest[request.id]}
                          className="shrink-0"
                        >
                          {acceptingRequest[request.id] ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Accepting...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Accept Request
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Child Account Limits (parents only) */}
          {isParent && !loading && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Child Account Limits"
                description="Set custom resource limits for your linked children. Leave fields blank to inherit account defaults."
              />

              {childMessage && !requests.length && (
                <div
                  className={`mt-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${
                    childMessage.toLowerCase().includes("fail") ||
                    childMessage.toLowerCase().includes("error")
                      ? "border-destructive/30 bg-destructive/5 text-destructive"
                      : "border-success/30 bg-success/5 text-success"
                  }`}
                >
                  {childMessage.toLowerCase().includes("fail") ||
                  childMessage.toLowerCase().includes("error") ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  {childMessage}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-4">
                {children.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                    <Users className="h-4 w-4 shrink-0" />
                    No linked children found.
                  </div>
                ) : (
                  children.map((child) => (
                    <div
                      key={child.id}
                      className="rounded-lg border border-border bg-secondary/10 p-4"
                    >
                      {/* Child header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Baby className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {child.firstName || child.email}
                            </p>
                            {child.firstName && (
                              <p className="text-xs text-muted-foreground">{child.email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="date"
                            value={childDobEdits[child.id] ?? ""}
                            onChange={(e) => setChildDobEdits((prev) => ({ ...prev, [child.id]: e.target.value }))}
                            className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateChildDob(child.id)}
                            disabled={savingChildDob[child.id]}
                          >
                            {savingChildDob[child.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save DOB"
                            )}
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => updateChildLimits(child.id)}
                          disabled={savingLimits[child.id]}
                        >
                          {savingLimits[child.id] ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Sliders className="mr-2 h-4 w-4" />
                              Save Limits
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Limit fields */}
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {limitFields.map((field) => (
                          <div key={field.key} className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              {field.label}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={limitEdits[child.id]?.[field.key] ?? ""}
                              onChange={(e) =>
                                updateLimitField(child.id, field.key, e.target.value)
                              }
                              placeholder="Default"
                              className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Account Info */}
          {user && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader
                title="Account Information"
                description="Your current account details and family status."
              />
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium text-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Account Role</p>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {isParent
                        ? "Parent"
                        : isLinkedChild
                        ? "Linked child"
                        : isChild
                        ? "Child"
                        : "Unknown"}
                    </p>
                  </div>
                  {isParent ? (
                    <CheckCircle className="ml-auto h-4 w-4 text-success" />
                  ) : isLinkedChild ? (
                    <Link2 className="ml-auto h-4 w-4 text-primary" />
                  ) : isChild ? (
                    <Baby className="ml-auto h-4 w-4 text-primary" />
                  ) : (
                    <AlertTriangle className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Age</p>
                    <p className="text-sm font-medium text-foreground">
                      {age != null ? `${age} years old` : "Not set"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <Link2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Linked Children</p>
                    <p className="text-sm font-medium text-foreground">
                      {isParent ? `${children.length} linked` : "N/A"}
                    </p>
                  </div>
                  {isParent && children.length > 0 && (
                    <CheckCircle className="ml-auto h-4 w-4 text-success" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}