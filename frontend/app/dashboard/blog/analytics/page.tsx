"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Eye, TrendingUp } from "lucide-react"
import { renderTitleHtml } from "@/components/blog/blog-format"
import Link from "next/link"

interface PostStat {
  id: number; title: string; slug: string; status: string
  viewCount: number; createdAt: string
}

export default function BlogAnalyticsPage() {
  const t = useTranslations("blogPage")
  const [data, setData] = useState<{ totalViews: number; recentViews: number; posts: PostStat[] } | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [blogSlug, setBlogSlug] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const blog = await apiFetch(API_ENDPOINTS.blogMine)
      setBlogSlug(blog?.slug || "")
      const res = await apiFetch(`${API_ENDPOINTS.blogAnalytics}?days=${days}`)
      setData(res)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const maxViews = data?.posts?.[0]?.viewCount || 1
  const published = data?.posts?.filter((p) => p.status === "published") || []
  const drafts = data?.posts?.filter((p) => p.status === "draft") || []

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("analytics", { defaultValue: "Analytics" })}
        description={t("analyticsDescription", { defaultValue: "Post performance and view statistics" })}
      />
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="p-3 sm:p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full overflow-hidden">
          <Link href="/dashboard/blog">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back", { defaultValue: "Back to blog" })}
            </Button>
          </Link>

          {/* Timeframe selector */}
          <div className="flex items-center gap-2">
            {[7, 30, 90, 365].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
                className="text-xs"
              >
                {d === 365 ? "All time" : `${d}d`}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Skeleton className="h-24" /><Skeleton className="h-24" />
              <Skeleton className="h-64 col-span-2" />
            </div>
          ) : data ? (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Total views
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.totalViews.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Last {days}d
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{data.recentViews.toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Bar chart — top posts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top posts by views</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {published.slice(0, 10).map((post, i) => (
                    <div key={post.id} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/blog/${blogSlug}/${post.slug}`} className="text-xs font-medium truncate hover:underline" target="_blank"
                            dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }}
                          />
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {post.viewCount} views
                          </Badge>
                        </div>
                        <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${(post.viewCount / maxViews) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {published.length === 0 && (
                    <p className="text-xs text-muted-foreground">No published posts yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* All posts table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">All posts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 font-medium">Title</th>
                          <th className="text-right py-2 font-medium w-16">Views</th>
                          <th className="text-right py-2 font-medium w-16">Status</th>
                          <th className="text-right py-2 font-medium w-24">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.posts.map((post) => (
                          <tr key={post.id} className="border-b border-border/30">
                            <td className="py-2 pr-4 truncate max-w-[200px]">
                              <Link href={`/blog/${blogSlug}/${post.slug}`} className="hover:underline" target="_blank"
                                dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }}
                              />
                            </td>
                            <td className="py-2 text-right">{post.viewCount}</td>
                            <td className="py-2 text-right">
                              <Badge variant={post.status === "published" ? "default" : "secondary"} className="text-[9px]">
                                {post.status}
                              </Badge>
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {new Date(post.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}
