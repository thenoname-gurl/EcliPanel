"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { use } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { ArrowLeft, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { renderTitleHtml } from "@/components/blog/blog-format"

interface AuthorProfile {
  author: {
    id: number; name: string; avatarUrl: string | null
    bio: string | null; role: string | null
  }
  posts: Array<{
    id: number; title: string; slug: string; excerpt: string
    coverImageUrl: string; tags: string[]
    wordCount: number; createdAt: string
    contentFlags?: string[]
  }>
}

export function AuthorPageClient({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = use(params)
  const [data, setData] = useState<AuthorProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(API_ENDPOINTS.blogAuthorProfile.replace(":slug", slug).replace(":userId", userId))
      setData(res)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [slug, userId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-sm opacity-40">Loading...</div></div>
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold opacity-30">404</h1>
          <p className="text-sm opacity-50">Author not found</p>
          <Link href={`/blog/${slug}`} className="text-xs underline opacity-40">Back to blog</Link>
        </div>
      </div>
    )
  }

  const { author, posts } = data

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href={`/blog/${slug}`} className="inline-flex items-center gap-1.5 text-sm mb-8 opacity-40 hover:opacity-60">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to blog
        </Link>

        {/* Profile header */}
        <div className="flex items-start gap-5 mb-10">
          <div className="w-20 h-20 rounded-full overflow-hidden shrink-0 bg-muted flex items-center justify-center text-2xl font-bold">
            {author.avatarUrl ? (
              <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              author.name[0].toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{author.name}</h1>
            {author.role && (
              <Badge className="mt-1 capitalize">{author.role}</Badge>
            )}
            {author.bio && (
              <div className="text-sm mt-2 leading-relaxed opacity-70 max-w-lg space-y-1.5">
                {author.bio.split("\n").map((line, i) => {
                  if (!line.trim()) return <br key={i} />
                  // Handle images: ![alt](url)
                  const imgMatch = line.match(/^!\[(.*)\]\((.*)\)$/)
                  if (imgMatch) {
                    const imgUrl = imgMatch[2]
                    if (/^https?:\/\//i.test(imgUrl)) return <img key={i} src={imgUrl} alt={imgMatch[1]} className="rounded-lg max-h-16" />
                  }
                  // Handle links in text
                  const html = renderTitleHtml(line)
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, text: string, url: string) => {
                      if (/^(https?:|\/)/i.test(url)) return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${text}</a>`
                      return text
                    })
                  return <p key={i} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />
                })}
              </div>
            )}
          </div>
        </div>

        {/* Posts */}
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-30 mb-4">
          Posts by {author.name} ({posts.length})
        </h2>

        {posts.length === 0 ? (
          <p className="text-sm opacity-30">No posts yet.</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${slug}/${post.slug}`} className="block group">
                <article className="rounded-xl border p-4 transition-all hover:shadow-sm">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {(post.tags || []).slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                  <h3 className="font-semibold group-hover:underline" dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
                  {post.excerpt && (
                    <p className="text-xs mt-1 opacity-50 line-clamp-2">{post.excerpt}</p>
                  )}
                  <p className="text-[10px] mt-2 opacity-30 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(post.createdAt).toLocaleDateString()}
                    <span className="mx-1">·</span>
                    {Math.max(1, Math.ceil((post.wordCount || 0) / 200))} min read
                  </p>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}