"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { renderTitleHtml } from "@/components/blog/blog-format"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus, Pencil, Globe, Eye, EyeOff, Users, Settings, Layout, BookOpen, Check, X, Loader2, HelpCircle, TrendingUp,
} from "lucide-react"

interface Post {
  id: number
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string
  status: "draft" | "published"
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface Blog {
  id: number
  slug: string
  name: string
  description: string
  coverImageUrl: string
  visibility: "public" | "members" | "unlisted"
  postCount: number
  publishedCount: number
  totalViews: number
}

export default function BlogDashboardPage() {
  const t = useTranslations("blogPage")
  const [blog, setBlog] = useState<Blog | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [createSlug, setCreateSlug] = useState("")
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle")
  const [creating, setCreating] = useState(false)
  const [blogList, setBlogList] = useState<any[]>([])
  const [currentBlogId, setCurrentBlogId] = useState<number | null>(null)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.blogList).then((res) => {
      setBlogList(res?.blogs || [])
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      const [blogData, postsData] = await Promise.all([
        apiFetch(API_ENDPOINTS.blogMine),
        apiFetch(API_ENDPOINTS.blogMinePosts).catch(() => ({ data: [] })),
      ])
      setBlog(blogData)
      if (postsData?.data) setPosts(postsData.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const checkSlug = useCallback(async (s: string) => {
    const raw = s.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setCreateSlug(raw)
    if (raw.length < 2) {
      setSlugStatus("idle")
      return
    }
    setSlugStatus("checking")
    try {
      const res = await apiFetch(`/api/public/blog/check-slug?slug=${encodeURIComponent(raw)}`)
      setSlugStatus(res?.available ? "available" : "taken")
    } catch {
      setSlugStatus("idle")
    }
  }, [])

  const handleCreate = async () => {
    if (slugStatus !== "available") return
    setCreating(true)
    try {
      const res = await apiFetch(API_ENDPOINTS.blogMine, {
        method: "POST",
        body: JSON.stringify({ slug: createSlug }),
      })
      if (res?.id) {
        setBlog(res)
        load()
      }
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  const visibilityIcon = (v: string) => {
    if (v === "public") return <Globe className="h-3 w-3" />
    if (v === "members") return <Users className="h-3 w-3" />
    return <EyeOff className="h-3 w-3" />
  }

  const publicUrl = blog ? `/blog/${blog.slug}` : ""

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("title", { defaultValue: "Blog" })}
        description={t("description", { defaultValue: "Write, publish, and share your story" })}
      />
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-6 max-w-5xl">
          {/* Blog selector */}
          {blogList.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Blog:</span>
              <select
                value={currentBlogId || blog?.id || ""}
                onChange={(e) => setCurrentBlogId(Number(e.target.value))}
                className="text-xs border border-border/60 bg-background px-2 py-1 rounded-lg"
              >
                {blogList.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.role}{b.isOwn ? ", yours" : ""})
                  </option>
                ))}
              </select>
            </div>
          )}
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !blog ? (
            <Card className="max-w-md mx-auto">
              <CardHeader className="text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <CardTitle>{t("createBlog", { defaultValue: "Create your blog" })}</CardTitle>
                <CardDescription>
                  {t("createBlogDescription", { defaultValue: "Pick a URL slug for your blog. This will be your public address." })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("blogUrl", { defaultValue: "Blog URL" })}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground shrink-0">/blog/</span>
                    <div className="relative flex-1">
                      <Input
                        value={createSlug}
                        onChange={(e) => checkSlug(e.target.value)}
                        placeholder="my-blog"
                        className="pr-8 font-mono text-sm"
                        maxLength={100}
                      />
                      {slugStatus === "checking" && (
                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {slugStatus === "available" && (
                        <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                      {slugStatus === "taken" && (
                        <X className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  {slugStatus === "available" && (
                    <p className="text-[10px] text-green-600">{t("slugAvailable", { defaultValue: "This URL is available!" })}</p>
                  )}
                  {slugStatus === "taken" && (
                    <p className="text-[10px] text-red-500">{t("slugTaken", { defaultValue: "This URL is already taken. Try another." })}</p>
                  )}
                  {slugStatus === "invalid" && (
                    <p className="text-[10px] text-red-500">{t("slugInvalid", { defaultValue: "Invalid slug. Use letters, numbers, and hyphens (min 2 chars)." })}</p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={slugStatus !== "available" || creating}
                >
                  {creating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />{t("creating", { defaultValue: "Creating..." })}</>
                  ) : (
                    t("createBlog", { defaultValue: "Create Blog" })
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : blog ? (
            <>
              {/* Blog info card */}
              <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{blog.name}</CardTitle>
                    <CardDescription>
                      {blog.description || t("noDescription", { defaultValue: "No description yet" })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      {visibilityIcon(blog.visibility)}
                      {blog.visibility}
                    </Badge>
                    <Link href={publicUrl} target="_blank">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {t("view", { defaultValue: "View" })}
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      {blog.publishedCount} {t("published", { defaultValue: "published" })}
                    </span>
                    <span>
                      {blog.postCount - blog.publishedCount} {t("drafts", { defaultValue: "drafts" })}
                    </span>
                    <span>
                      {blog.totalViews || 0} views
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Link href="/dashboard/blog/settings">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Settings className="h-3.5 w-3.5" />
                        {t("settings", { defaultValue: "Settings" })}
                      </Button>
                    </Link>
                    <Link href="/dashboard/blog/members">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {t("members", { defaultValue: "Members" })}
                      </Button>
                    </Link>
                    <Link href="/dashboard/blog/builder">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Layout className="h-3.5 w-3.5" />
                        {t("builder", { defaultValue: "Builder" })}
                      </Button>
                    </Link>
                    <Link href="/docs/blog-handbook">
                      <Button variant="outline" size="sm" className="gap-1">
                        <HelpCircle className="h-3.5 w-3.5" />
                        Handbook
                      </Button>
                    </Link>
                    <Link href="/dashboard/blog/analytics">
                      <Button variant="outline" size="sm" className="gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Analytics
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Posts */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  {t("posts", { defaultValue: "Posts" })}
                </h2>
                <Link href="/dashboard/blog/posts/new">
                  <Button size="sm" className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    {t("newPost", { defaultValue: "New Post" })}
                  </Button>
                </Link>
              </div>

              {posts.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Pencil className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t("noPosts", { defaultValue: "No posts yet. Write your first one!" })}
                    </p>
                    <Link href="/dashboard/blog/posts/new" className="mt-3">
                      <Button size="sm" className="gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        {t("newPost", { defaultValue: "New Post" })}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => (
                    <Card key={post.id} className="hover:bg-secondary/5 transition-colors">
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium truncate" dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
                            <Badge variant={post.status === "published" ? "default" : "secondary"} className="text-[10px]">
                              {post.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(post.createdAt).toLocaleDateString()}
                            {post.excerpt && ` - ${post.excerpt.substring(0, 100)}`}
                          </p>
                        </div>
                        <Link href={`/dashboard/blog/posts/${post.id}/edit`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Pencil className="h-3.5 w-3.5" />
                            {t("edit", { defaultValue: "Edit" })}
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("error", { defaultValue: "Could not load blog" })}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}