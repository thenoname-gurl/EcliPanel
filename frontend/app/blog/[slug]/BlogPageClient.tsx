"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { use } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Calendar, Rss } from "lucide-react"
import { BlogSectionRenderer, type LayoutSection } from "@/components/blog/blog-section-renderer"
import { BlogContentWarning } from "@/components/blog/content-warning"
import { renderTitleHtml } from "@/components/blog/blog-format"

interface Blog {
  id: number; slug: string; name: string; description: string
  coverImageUrl: string; visibility: string; theme: Record<string, any>; createdAt: string
  owner: { id: number; name: string; avatarUrl: string } | null
  contentFlags?: string[]; isMature?: boolean
}
interface Post {
  id: number; title: string; slug: string; excerpt: string
  coverImageUrl: string; tags: string[]; createdAt: string
  author: { id: number; name: string; avatarUrl: string } | null
  contentFlags?: string[]; wordCount?: number; viewCount?: number
}

const FONT_MAP: Record<string, string> = {
  system: "system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
}

function readingTimeFromWords(words: number): string {
  return `${Math.max(1, Math.ceil((words || 0) / 200))} min read`
}

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function BlogPageClient({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [blog, setBlog] = useState<Blog | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([
        apiFetch(API_ENDPOINTS.publicBlog.replace(":slug", slug)),
        apiFetch(API_ENDPOINTS.publicBlogPosts.replace(":slug", slug)),
      ])
      setBlog(b); setPosts(p?.data || [])
    } catch (e: any) { setError(e?.message || "Blog not found") }
    finally { setLoading(false) }
  }, [slug])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!blog) return
    document.title = blog.name + " - Blog"
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
      if (!el) { el = document.createElement("meta"); el.setAttribute(name.startsWith("og:") ? "property" : "name", name); document.head.appendChild(el) }
      el.setAttribute("content", content)
    }
    setMeta("description", blog.description || `Read ${blog.name}'s blog on EcliPanel`)
    setMeta("og:title", blog.name)
    setMeta("og:description", blog.description || "")
    setMeta("og:type", "website")
    if (blog.coverImageUrl) setMeta("og:image", blog.coverImageUrl)
    let rss = document.querySelector('link[type="application/rss+xml"]')
    if (!rss) { rss = document.createElement('link'); rss.setAttribute('rel', 'alternate'); rss.setAttribute('type', 'application/rss+xml'); document.head.appendChild(rss) }
    rss.setAttribute('title', blog.name)
    rss.setAttribute('href', `/api/public/blog/${blog.slug}/rss`)
  }, [blog])

  const th = blog?.theme || {}
  const p = th.primary || "#8b5cf6"
  const bg = th.bg || "#0a0a12"
  const fg = th.foreground || "#e8e4f0"
  const card = th.card || "#12111f"
  const hFont = FONT_MAP[th.fontHeading] || FONT_MAP.system
  const bFont = FONT_MAP[th.fontBody] || FONT_MAP.system
  const hasLayout = (blog?.layout?.sections?.length || 0) > 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: p, borderTopColor: "transparent" }} />
          <span className="text-sm" style={{ color: fg, opacity: 0.4 }}>Loading...</span>
        </div>
      </div>
    )
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="text-center space-y-4 px-4">
          <h1 className="text-6xl font-bold tracking-tight" style={{ color: p }}>404</h1>
          <p className="text-base" style={{ color: fg, opacity: 0.5 }}>This blog doesn't exist yet.</p>
          <Link href="/" className="inline-block text-sm font-medium hover:underline" style={{ color: p }}>Go home</Link>
        </div>
      </div>
    )
  }

  if (hasLayout) {
    return (
      <div id="blog-root" className="min-h-screen" style={{ background: bg, color: fg, fontFamily: bFont }}>
        <script dangerouslySetInnerHTML={{ __html: SDK_SCRIPT }} />
        {th.customCss && <style dangerouslySetInnerHTML={{ __html: th.customCss }} />}
        <BlogSectionRenderer
          sections={blog.layout.sections as LayoutSection[]}
          blog={blog} posts={posts}
          primaryColor={p} fgColor={fg} cardBg={card}
          headingFont={hFont} bodyFont={bFont}
        />
      </div>
    )
  }

  return (
    <div id="blog-root" className="min-h-screen" style={{ background: bg, color: fg, fontFamily: bFont }}>
      <script dangerouslySetInnerHTML={{ __html: SDK_SCRIPT }} />
      {th.customCss && <style dangerouslySetInnerHTML={{ __html: th.customCss }} />}

      <header className="border-b" style={{ borderColor: fg + "0d", background: `linear-gradient(180deg, ${p}08, transparent)` }}>
        <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
          <div className="h-1.5 w-16 rounded-full mb-5" style={{ background: p }} />
          <BlogContentWarning flags={blog.contentFlags} type="banner" primaryColor={p} fgColor={fg} children={null} />
          <div className="flex items-center gap-3">
            <a href={`/api/public/blog/${blog.slug}/rss`} target="_blank" rel="noopener"
              className="shrink-0 p-1.5 rounded-lg transition-all hover:opacity-70" title="RSS feed"
              style={{ color: p, opacity: 0.45 }}>
              <Rss className="h-4 w-4" />
            </a>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: hFont }}>
            {blog.name}
          </h1>
          </div>
          {blog.description && (
            <p className="mt-3 text-base leading-relaxed max-w-lg" style={{ color: fg, opacity: 0.6 }}>
              {blog.description}
            </p>
          )}
          {blog.owner && (
            <div className="flex items-center gap-2.5 mt-4">
              {blog.owner.avatarUrl ? (
                <img src={blog.owner.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: p }}>
                  {(blog.owner.name || "?")[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium" style={{ color: fg, opacity: 0.5 }}>{blog.owner.name}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
        {posts.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center" style={{ background: p + "0f" }}>
              <Rss className="h-6 w-6" style={{ color: p, opacity: 0.35 }} />
            </div>
            <p className="text-sm font-medium" style={{ color: fg, opacity: 0.3 }}>No posts yet</p>
          </div>
        ) : (
          <div className="space-y-8">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${slug}/${post.slug}`} className="group block">
                <BlogContentWarning flags={post.contentFlags} type="overlay" primaryColor={p} fgColor={fg} title={post.title} excerpt={post.excerpt}>
                <article
                  className="rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md"
                  style={{ background: card, boxShadow: `0 1px 2px ${fg}06, 0 0 0 1px ${fg}07` }}
                >
                  <div className="h-1" style={{ background: p, opacity: 0.85 }} />

                  {post.coverImageUrl && (
                    <div className="overflow-hidden" style={{ maxHeight: "240px" }}>
                      <img
                        src={post.coverImageUrl} alt=""
                        className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                        style={{ maxHeight: "240px" }}
                      />
                    </div>
                  )}

                  <div className="p-5 md:p-6">
                    {(post.tags?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {post.tags!.map((tag) => (
                          <span key={tag} className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase"
                            style={{ background: p + "10", color: p }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="text-lg md:text-xl font-bold leading-snug" style={{ fontFamily: hFont }}>
                      <span dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
                    </h2>
                    {post.excerpt && (
                      <p className="mt-1.5 text-sm leading-relaxed line-clamp-2" style={{ color: fg, opacity: 0.5 }}>
                        {post.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-[11px] font-medium" style={{ color: fg, opacity: 0.35 }}>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {timeAgo(post.createdAt)}</span>
                      {post.author && <Link href={`/blog/${slug}/author/${post.author.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>by {post.author.name}</Link>}
                      {post.wordCount ? <span>&middot; {readingTimeFromWords(post.wordCount)}</span> : null}
                    </div>
                  </div>
                </article>
                </BlogContentWarning>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

const SDK_SCRIPT = `(function(){if(window.__blogSdk)return;var c=document.getElementById('blog-root');if(!c)return;function r(e){return typeof e==='string'?c.querySelector(e):e}window.__blogSdk={version:"1.0",theme:{setVar:function(n,v){c.style.setProperty(n,v)},getVar:function(n){return c.style.getPropertyValue(n)||null},setDarkMode:function(o){c.classList.toggle('dark',o)},isDarkMode:function(){return c.classList.contains('dark')}},dom:{onReady:function(f){if(document.readyState==='complete'||document.readyState==='interactive')setTimeout(f,0);else document.addEventListener('DOMContentLoaded',f)},select:function(s){return c.querySelector(s)},selectAll:function(s){return c.querySelectorAll(s)},on:function(e,s,f){c.addEventListener(e,function(ev){var t=ev.target.closest(s);if(t)f(ev,t)})}},anim:{fadeIn:function(e,d){return new Promise(function(res){var el=r(e);if(!el)return res();var dur=d||400;el.style.opacity='0';el.style.display='';el.style.transition='opacity '+dur+'ms ease';requestAnimationFrame(function(){el.style.opacity='1';setTimeout(function(){el.style.transition='';res()},dur)})})},fadeOut:function(e,d){return new Promise(function(res){var el=r(e);if(!el)return res();var dur=d||400;el.style.transition='opacity '+dur+'ms ease';el.style.opacity='0';setTimeout(function(){el.style.display='none';el.style.transition='';res()},dur)})},slideDown:function(e,d){return new Promise(function(res){var el=r(e);if(!el)return res();var dur=d||400;el.style.overflow='hidden';el.style.display='';var h=el.scrollHeight;el.style.height='0';el.style.transition='height '+dur+'ms ease';requestAnimationFrame(function(){el.style.height=h+'px';setTimeout(function(){el.style.height='';el.style.overflow='';el.style.transition='';res()},dur)})})},slideUp:function(e,d){return new Promise(function(res){var el=r(e);if(!el)return res();var dur=d||400;el.style.overflow='hidden';el.style.height=el.scrollHeight+'px';el.style.transition='height '+dur+'ms ease';requestAnimationFrame(function(){el.style.height='0';setTimeout(function(){el.style.display='none';el.style.height='';el.style.overflow='';el.style.transition='';res()},dur)})})},typewriter:function(e,t,s){return new Promise(function(res){var el=r(e);if(!el)return res();var sp=s||50;var i=0;el.textContent='';function type(){if(i<t.length){el.textContent+=t.charAt(i);i++;setTimeout(type,sp)}else res()}type()})},shake:function(e){return new Promise(function(res){var el=r(e);if(!el)return res();el.style.transition='transform 0.1s ease';var n=4;function tick(x){if(x<=0){el.style.transform='';el.style.transition='';res();return}el.style.transform='translateX('+(x%2===0?4:-4)+'px)';setTimeout(function(){tick(x-1)},80)}tick(n)})},pulse:function(e){return new Promise(function(res){var el=r(e);if(!el)return res();el.style.transition='transform 0.3s ease';el.style.transform='scale(1.08)';setTimeout(function(){el.style.transform='scale(1)';setTimeout(function(){el.style.transition='';res()},300)},150)})}},util:{debounce:function(f,m){var t;return function(){var ctx=this,args=arguments;clearTimeout(t);t=setTimeout(function(){f.apply(ctx,args)},m)}},onScroll:function(f){window.addEventListener('scroll',window.__blogSdk.util.debounce(f,100))},onResize:function(f){window.addEventListener('resize',window.__blogSdk.util.debounce(f,200))},now:function(){return Date.now()}}};})()`