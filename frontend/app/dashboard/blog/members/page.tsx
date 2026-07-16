"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft, Plus, Trash2, Shield, User, Users, Pencil, Upload,
} from "lucide-react"
import Link from "next/link"

interface Member {
  id: number
  userId: number
  role: "owner" | "admin" | "author"
  createdAt: string
  user: {
    id: number
    name: string
    email: string
    avatarUrl: string
  } | null
}

export default function BlogMembersPage() {
  const t = useTranslations("blogPage")
  const [blogId, setBlogId] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("author")
  const [adding, setAdding] = useState(false)
  const [myProfile, setMyProfile] = useState<any>(null)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [profileBio, setProfileBio] = useState("")
  const [profileAvatar, setProfileAvatar] = useState("")
  const [profileUploading, setProfileUploading] = useState(false)
  const profileFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const blog = await apiFetch(API_ENDPOINTS.blogMine)
      setBlogId(blog.id)
      try {
        const mp = await apiFetch(API_ENDPOINTS.blogMemberProfile.replace(":blogId", String(blog.id)))
        setMyProfile(mp)
        setProfileName(mp?.displayName || "")
        setProfileBio(mp?.bio || "")
        setProfileAvatar(mp?.avatarUrl || "")
      } catch { /* */ }
      const data = await apiFetch(
        API_ENDPOINTS.blogMembers.replace(":blogId", String(blog.id)),
      )
      setMembers(data?.data || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!email.trim() || !blogId) return
    setAdding(true)
    try {
      await apiFetch(
        API_ENDPOINTS.blogMembers.replace(":blogId", String(blogId)),
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), role }),
        },
      )
      setDialogOpen(false)
      setEmail("")
      setRole("author")
      load()
    } catch {
      // ignore
    } finally {
      setAdding(false)
    }
  }

  const handleChangeRole = async (userId: number, newRole: string) => {
    if (!blogId) return
    try {
      await apiFetch(
        API_ENDPOINTS.blogMemberDetail
          .replace(":blogId", String(blogId))
          .replace(":userId", String(userId)),
        {
          method: "PUT",
          body: JSON.stringify({ role: newRole }),
        },
      )
      load()
    } catch {
      // ignore
    }
  }

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setProfileUploading(true)
    try {
      const form = new FormData(); form.append("file", file)
      const res = await apiFetch(API_ENDPOINTS.blogMineUpload, { method: "POST", body: form })
      if (res?.url) setProfileAvatar(res.url)
    } catch { /* */ }
    finally { setProfileUploading(false) }
  }

  const handleSaveProfile = async () => {
    if (!blogId) return
    try {
      await apiFetch(API_ENDPOINTS.blogMemberProfile.replace(":blogId", String(blogId)), {
        method: "PUT",
        body: JSON.stringify({ displayName: profileName.trim() || null, bio: profileBio.trim() || null, avatarUrl: profileAvatar || null }),
      })
      setShowProfileEdit(false)
      load()
    } catch { /* */ }
  }

  const handleRemove = async (userId: number) => {
    if (!blogId || !confirm(t("confirmRemoveMember", { defaultValue: "Remove this member?" }))) return
    try {
      await apiFetch(
        API_ENDPOINTS.blogMemberDetail
          .replace(":blogId", String(blogId))
          .replace(":userId", String(userId)),
        { method: "DELETE" },
      )
      load()
    } catch {
      // ignore
    }
  }

  const roleBadge = (r: string) => {
    if (r === "owner") return <Badge className="gap-1"><Shield className="h-3 w-3" />Owner</Badge>
    if (r === "admin") return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" />Admin</Badge>
    return <Badge variant="outline" className="gap-1"><User className="h-3 w-3" />Author</Badge>
  }

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("members", { defaultValue: "Blog Members" })}
        description={t("membersDescription", { defaultValue: "Manage who can write on your blog" })}
      />
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-4 max-w-3xl">
          <div className="flex items-center justify-between">
            <Link href="/dashboard/blog">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("back", { defaultValue: "Back to blog" })}
              </Button>
            </Link>
            <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("addMember", { defaultValue: "Add Member" })}
            </Button>
          </div>

          {/* My Profile */}
          <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm">My blog profile</CardTitle>
                <CardDescription className="text-xs">Customise how you appear on this blog</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowProfileEdit(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profileAvatar || myProfile?.avatarUrl || ""} />
                  <AvatarFallback>{(profileName || myProfile?.displayName || "?")[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{profileName || myProfile?.displayName || "Set your display name"}</p>
                  <p className="text-xs text-muted-foreground">{myProfile?.role || "Member"}</p>
                </div>
              </div>
              {(profileBio || myProfile?.bio) && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{profileBio || myProfile?.bio}</p>
              )}
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : members.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("noMembers", { defaultValue: "No members yet. Invite authors to your blog!" })}
                </p>
                <Button size="sm" className="gap-1 mt-3" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("addMember", { defaultValue: "Add Member" })}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <Card key={member.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.user?.avatarUrl || ""} />
                        <AvatarFallback>
                          {(member.user?.name || "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.user?.name || `User #${member.userId}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.user?.email || ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {roleBadge(member.role)}
                      {member.role !== "owner" && (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                            className="text-xs border border-border/60 bg-background px-1.5 py-1 rounded"
                          >
                            <option value="admin">Admin</option>
                            <option value="author">Author</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 h-8 w-8 p-0"
                            onClick={() => handleRemove(member.userId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add member dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addMember", { defaultValue: "Add Member" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t("memberEmail", { defaultValue: "User email" })}
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t("memberRole", { defaultValue: "Role" })}
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-sm rounded-lg"
              >
                <option value="author">Author / write posts</option>
                <option value="admin">Admin / manage members + write posts</option>
                <option value="owner">Owner / full control</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={adding || !email.trim()}>
              {adding ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile edit dialog */}
      <Dialog open={showProfileEdit} onOpenChange={setShowProfileEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit blog profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label>Display name</Label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="How you appear on this blog" maxLength={128} />
            </div>
            <div className="grid gap-1.5">
              <Label>Avatar</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-1" type="button" disabled={profileUploading} onClick={() => profileFileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {profileUploading ? "Uploading..." : "Upload"}
                </Button>
                <input ref={profileFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleProfileUpload} />
                {profileAvatar && <img src={profileAvatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-border" />}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Bio</Label>
              <Textarea value={profileBio} onChange={(e) => setProfileBio(e.target.value)} placeholder="Write a short bio..." rows={3} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowProfileEdit(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveProfile}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FeatureGuard>
  )
}