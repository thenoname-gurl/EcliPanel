"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Rss } from "lucide-react"
import { BlogContentWarning } from "@/components/blog/content-warning"
import { renderTitleHtml } from "@/components/blog/blog-format"
import DOMPurify from "dompurify"

function readingTimeFromWords(words: number): string {
  return `${Math.max(1, Math.ceil((words || 0) / 200))} min read`
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}

export interface LayoutSection {
  id: string
  type: "header" | "hero" | "post-grid" | "post-list" | "about" | "video" | "custom-html" | "script" | "search"
  order: number
  config: Record<string, unknown>
}

interface BlogData {
  slug: string
  name: string
  description: string
  coverImageUrl: string
  theme?: Record<string, any>
  owner?: { name: string; avatarUrl: string } | null
}

interface PostData {
  id: number
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string
  tags: string[]
  contentFlags?: string[]
  wordCount?: number
  createdAt: string
  author?: { name: string; avatarUrl: string } | null
}

interface Props {
  sections: LayoutSection[]
  blog: BlogData
  posts: PostData[]
  primaryColor?: string
  fgColor?: string
  cardBg?: string
  headingFont?: string
  bodyFont?: string
}

function ScriptSection({ id, code }: { id: string; code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = document.createElement('script')
    el.setAttribute('data-blog-script', id)
    el.textContent = `(function(){var blog=window.__blogSdk;if(!blog)return;try{${code}}catch(e){console.warn('[Blog Script]',e.message)}})();`
    ref.current?.appendChild(el)
    return () => { el.remove() }
  }, [id, code])
  return <div ref={ref} style={{ display: 'none' }} />
}

export function BlogSectionRenderer({
  sections,
  blog,
  posts,
  primaryColor = "#8b5cf6",
  fgColor = "#e8e4f0",
  cardBg = "#12111f",
  headingFont = "system-ui, sans-serif",
  bodyFont = "system-ui, sans-serif",
}: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const [searchQuery, setSearchQuery] = useState("")
  const [gridPage, setGridPage] = useState(0)
  const [listPage, setListPage] = useState(0)

  function filterPosts(ps: PostData[]) {
    if (!searchQuery.trim()) return ps
    const q = searchQuery.toLowerCase()
    return ps.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      (p.excerpt || "").toLowerCase().includes(q) ||
      (p.tags || []).some((t: string) => t.toLowerCase().includes(q))
    )
  }

  const filteredPosts = filterPosts(posts)

  return (
    <>
      {sorted.map((section) => {
        switch (section.type) {
          case "header": {
            const showName = section.config.showName !== false
            const showRss = section.config.showRss === true
            return (
              <header key={section.id} className="border-b" style={{ borderColor: fgColor + "0d", background: `linear-gradient(180deg, ${primaryColor}08, transparent)` }}>
                <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
                  <div className="h-1.5 w-16 rounded-full mb-5" style={{ background: primaryColor }} />
                  {blog.coverImageUrl && (
                    <img src={blog.coverImageUrl} alt="" className="w-full h-48 md:h-60 object-cover rounded-xl mb-6" />
                  )}
                  {showName && (
                    <div className="flex items-center gap-3">
                      {showRss && (
                        <a href={`/api/public/blog/${blog.slug}/rss`} target="_blank" rel="noopener"
                          className="shrink-0 p-1.5 rounded-lg transition-all hover:opacity-70" title="RSS feed"
                          style={{ color: primaryColor, opacity: 0.45 }}>
                          <Rss className="h-4 w-4" />
                        </a>
                      )}
                      <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: headingFont }}>
                        {blog.name}
                      </h1>
                    </div>
                  )}
                  {blog.description && (
                    <p className="mt-3 text-base leading-relaxed max-w-lg" style={{ opacity: 0.6 }}>{blog.description}</p>
                  )}
                  {blog.owner && (
                    <div className="flex items-center gap-2.5 mt-4">
                      {blog.owner.avatarUrl ? (
                        <img src={blog.owner.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: primaryColor }}>
                          {(blog.owner.name || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium" style={{ opacity: 0.5 }}>{blog.owner.name}</span>
                    </div>
                  )}
                </div>
              </header>
            )
          }

          case "hero": {
            const title = (section.config.title as string) || blog.name
            const subtitle = (section.config.subtitle as string) || blog.description || ""
            const showCover = section.config.showCover !== false
            const showRss = section.config.showRss === true
            return (
              <section key={section.id} className="border-b" style={{ borderColor: fgColor + "0d", background: `linear-gradient(180deg, ${primaryColor}08, transparent)` }}>
                <div className="max-w-3xl mx-auto px-4 py-12 md:py-16 text-center">
                  <div className="h-1.5 w-16 rounded-full mb-5 mx-auto" style={{ background: primaryColor }} />
                  {showCover && blog.coverImageUrl && (
                    <img src={blog.coverImageUrl} alt="" className="w-full max-h-64 object-cover rounded-xl mb-6" />
                  )}
                  {showRss && (
                    <div className="flex justify-center mb-4">
                      <a href={`/api/public/blog/${blog.slug}/rss`} target="_blank" rel="noopener"
                        className="shrink-0 p-1.5 rounded-lg transition-all hover:opacity-70" title="RSS feed"
                        style={{ color: primaryColor, opacity: 0.45 }}>
                        <Rss className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: headingFont }}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="mt-3 text-base leading-relaxed max-w-lg mx-auto" style={{ opacity: 0.6 }}>{subtitle}</p>
                  )}
                  {blog.owner && (
                    <div className="flex items-center justify-center gap-2.5 mt-4">
                      {blog.owner.avatarUrl ? (
                        <img src={blog.owner.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: primaryColor }}>
                          {(blog.owner.name || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium" style={{ opacity: 0.5 }}>{blog.owner.name}</span>
                    </div>
                  )}
                </div>
              </section>
            )
          }

          case "search": {
            const placeholder = (section.config.placeholder as string) || "Search posts..."
            const showCount = section.config.showCount !== false
            const results = searchQuery.trim() ? filteredPosts.length : 0
            return (
              <section key={section.id} className="py-4">
                <div className="max-w-xl mx-auto px-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setGridPage(0); setListPage(0) }}
                      placeholder={placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm bg-transparent outline-none focus:ring-2 transition-all"
                      style={{ borderColor: fgColor + "20", color: fgColor }}
                    />
                    {showCount && searchQuery.trim() && (
                      <span className="text-[10px] mt-1.5 block" style={{ color: fgColor, opacity: 0.4 }}>
                        {results} post{results !== 1 ? "s" : ""} found
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )
          }

          case "post-grid": {
            const count = (section.config.count as number) || 6
            const showExcerpt = section.config.showExcerpt !== false
            const showCover = section.config.showCover !== false
            const hasPagination = count > 0
            const allPosts = filteredPosts
            const page = hasPagination ? gridPage : 0
            const start = hasPagination ? page * count : 0
            const end = hasPagination ? start + count : allPosts.length
            const visible = allPosts.slice(start, end)
            const totalPages = hasPagination ? Math.ceil(allPosts.length / count) : 1
            return (
              <section key={section.id} className="py-8">
                <div className="max-w-4xl mx-auto px-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visible.map((post) => (
                      <Link key={post.id} href={`/blog/${blog.slug}/${post.slug}`} className="group block">
                        <BlogContentWarning flags={post.contentFlags} type="overlay" primaryColor={primaryColor} fgColor={fgColor} title={post.title} excerpt={post.excerpt}>
                        <article className="rounded-xl overflow-hidden h-full transition-all duration-200 hover:shadow-md" style={{ background: cardBg, boxShadow: `0 1px 2px ${fgColor}06, 0 0 0 1px ${fgColor}07` }}>
                          <div className="h-1" style={{ background: primaryColor, opacity: 0.85 }} />
                          {showCover && post.coverImageUrl && (
                            <img src={post.coverImageUrl} alt="" className="w-full h-36 object-cover" />
                          )}
                          <div className="p-4 space-y-2">
                            <div className="flex gap-1 flex-wrap">
                              {(post.tags || []).slice(0, 2).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                            <h3 className="font-semibold group-hover:underline" style={{ fontFamily: headingFont }}>
                              <span dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
                            </h3>
                            {showExcerpt && post.excerpt && (
                              <p className="text-xs" style={{ opacity: 0.6 }}>{post.excerpt}</p>
                            )}
                            <p className="text-[10px]" style={{ opacity: 0.4 }}>
                              {new Date(post.createdAt).toLocaleDateString()}
                              {post.wordCount ? <span className="mx-1">&middot;</span> : null}
                              {post.wordCount ? readingTimeFromWords(post.wordCount) : null}
                            </p>
                          </div>
                        </article>
                        </BlogContentWarning>
                      </Link>
                    ))}
                  </div>
                  {visible.length === 0 && !searchQuery.trim() && (
                    <p className="text-center text-sm py-10" style={{ opacity: 0.4 }}>No posts yet.</p>
                  )}
                  {visible.length === 0 && searchQuery.trim() && (
                    <p className="text-center text-sm py-10" style={{ opacity: 0.4 }}>No posts match your search.</p>
                  )}
                  {hasPagination && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <button onClick={() => setGridPage(Math.max(0, page - 1))} disabled={page === 0}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-20"
                        style={{ borderColor: fgColor + "20", color: fgColor }}>
                        ← Prev
                      </button>
                      <span className="text-[10px]" style={{ color: fgColor, opacity: 0.3 }}>
                        {page + 1} / {totalPages}
                      </span>
                      <button onClick={() => setGridPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-20"
                        style={{ borderColor: fgColor + "20", color: fgColor }}>
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )
          }

          case "post-list": {
            const count = (section.config.count as number) || 10
            const showDate = section.config.showDate !== false
            const hasPagination = count > 0
            const allPosts = filteredPosts
            const page = hasPagination ? listPage : 0
            const start = hasPagination ? page * count : 0
            const end = hasPagination ? start + count : allPosts.length
            const visible = allPosts.slice(start, end)
            const totalPages = hasPagination ? Math.ceil(allPosts.length / count) : 1
            return (
              <section key={section.id} className="py-8">
                <div className="max-w-2xl mx-auto px-4 space-y-4">
                  {visible.map((post) => (
                    <Link key={post.id} href={`/blog/${blog.slug}/${post.slug}`} className="block group">
                      <BlogContentWarning flags={post.contentFlags} type="overlay" primaryColor={primaryColor} fgColor={fgColor}>
                      <article className="rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md" style={{ background: cardBg, boxShadow: `0 1px 2px ${fgColor}06, 0 0 0 1px ${fgColor}07` }}>
                        <div className="h-1" style={{ background: primaryColor, opacity: 0.85 }} />
                        <div className="p-4">
                        <div className="flex gap-1 flex-wrap mb-1.5">
                          {(post.tags || []).slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                        <h3 className="font-semibold group-hover:underline" style={{ fontFamily: headingFont }}>
                          <span dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
                        </h3>
                        {post.excerpt && (
                          <p className="text-xs mt-1" style={{ opacity: 0.6 }}>{post.excerpt}</p>
                        )}
                        {showDate && (
                          <p className="text-[10px] mt-2" style={{ opacity: 0.4 }}>
                            {new Date(post.createdAt).toLocaleDateString()}
                            {post.wordCount ? <span className="mx-1">&middot;</span> : null}
                            {post.wordCount ? readingTimeFromWords(post.wordCount) : null}
                          </p>
                        )}
                        </div>
                      </article>
                      </BlogContentWarning>
                    </Link>
                  ))}
                  {visible.length === 0 && (
                    <p className="text-center text-sm py-10" style={{ opacity: 0.4 }}>No posts yet.</p>
                  )}
                  {hasPagination && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <button onClick={() => setListPage(Math.max(0, page - 1))} disabled={page === 0}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-20"
                        style={{ borderColor: fgColor + "20", color: fgColor }}>
                        ← Prev
                      </button>
                      <span className="text-[10px]" style={{ color: fgColor, opacity: 0.3 }}>
                        {page + 1} / {totalPages}
                      </span>
                      <button onClick={() => setListPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-20"
                        style={{ borderColor: fgColor + "20", color: fgColor }}>
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )
          }

          case "about": {
            const content = (section.config.content as string) || ""
            return (
              <section key={section.id} className="py-8">
                <div className="max-w-2xl mx-auto px-4">
                  <div className="rounded-xl overflow-hidden" style={{ background: cardBg, boxShadow: `0 1px 2px ${fgColor}06, 0 0 0 1px ${fgColor}07` }}>
                    <div className="h-1" style={{ background: primaryColor, opacity: 0.85 }} />
                    <div className="p-5 md:p-6">
                      {content ? (
                        <div className="whitespace-pre-wrap leading-relaxed text-sm">{content}</div>
                      ) : (
                        <p className="text-sm italic" style={{ opacity: 0.35 }}>About - edit this section in the builder to tell your story.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )
          }

          case "video": {
            const url = (section.config.url as string) || ""
            if (!url) return null
            const title = (section.config.title as string) || ""
            const autoplay = section.config.autoplay === true
            let embedUrl = ""
            const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
            const vimMatch = url.match(/vimeo\.com\/(\d+)/)
            if (ytMatch) {
              embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}${autoplay ? "?autoplay=1&mute=1" : ""}`
            } else if (vimMatch) {
              embedUrl = `https://player.vimeo.com/video/${vimMatch[1]}${autoplay ? "?autoplay=1&muted=1" : ""}`
            } else {
              embedUrl = url
            }
            return (
              <section key={section.id} className="py-8">
                <div className="max-w-3xl mx-auto px-4">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: `0 1px 2px ${fgColor}06, 0 0 0 1px ${fgColor}07` }}>
                    <div className="h-1" style={{ background: primaryColor, opacity: 0.85 }} />
                    {title && (
                      <h2 className="text-lg font-semibold px-5 pt-4" style={{ fontFamily: headingFont }}>{title}</h2>
                    )}
                  <div className="relative w-full overflow-hidden" style={{ paddingBottom: "56.25%", background: "#000" }}>
                    <iframe
                      src={embedUrl}
                      className="absolute inset-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={title || "Embedded video"}
                    />
                  </div>
                  </div>
                </div>
              </section>
            )
          }

          case "custom-html": {
            const html = sanitizeHtml((section.config.html as string) || "")
            return (
              <section key={section.id} className="py-4">
                <div className="max-w-4xl mx-auto px-4">
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              </section>
            )
          }

          case "script": {
            const code = (section.config.code as string) || ""
            if (!code.trim()) {
              return (
                <section key={section.id} className="py-2">
                  <div className="max-w-4xl mx-auto px-4">
                    <p className="text-[10px] italic" style={{ opacity: 0.3 }}>Script section (empty)</p>
                  </div>
                </section>
              )
            }
            return <ScriptSection key={section.id} id={section.id} code={code} />
          }

          case "video": {
          }

          default:
            return null
        }
      })}
    </>
  )
}
