"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { use } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { ArrowLeft, Calendar, User, Clock, BookOpen, Image } from "lucide-react"
import { BlogContentWarning } from "@/components/blog/content-warning"
import { renderTitleHtml } from "@/components/blog/blog-format"

interface Post {
  id: number; title: string; slug: string; content: string; excerpt: string
  coverImageUrl: string; tags: string[]; createdAt: string; updatedAt: string
  author: { id: number; name: string; avatarUrl: string } | null
  blog: { id: number; slug: string; name: string }
  contentFlags?: string[]
}

const FONT_MAP: Record<string, string> = {
  system: "system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
}

function readingTime(text: string): string {
  const words = (text || "").split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 200))} min read`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export function PostPageClient({ params }: { params: Promise<{ slug: string; postSlug: string }> }) {
  const { slug, postSlug } = use(params)
  const [post, setPost] = useState<Post | null>(null)
  const [blogTheme, setBlogTheme] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([
        apiFetch(API_ENDPOINTS.publicBlogPost.replace(":slug", slug).replace(":postSlug", postSlug)),
        apiFetch(API_ENDPOINTS.publicBlog.replace(":slug", slug)),
      ])
      setPost(p); setBlogTheme(b?.theme || {})
    } catch (e: any) { setError(e?.message || "Post not found") }
    finally { setLoading(false) }
  }, [slug, postSlug])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!post) return
    document.title = post.title + " - " + (post.blog?.name || "Blog")
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
      if (!el) { el = document.createElement("meta"); el.setAttribute(name.startsWith("og:") ? "property" : "name", name); document.head.appendChild(el) }
      el.setAttribute("content", content)
    }
    setMeta("description", post.excerpt || post.title)
    setMeta("og:title", post.title)
    setMeta("og:description", post.excerpt || "")
    setMeta("og:type", "article")
    if (post.coverImageUrl) setMeta("og:image", post.coverImageUrl)
    if (post.author?.name) setMeta("author", post.author.name)
  }, [post])

  const t = blogTheme || {}
  const primary = t.primary || "#8b5cf6"
  const bg = t.bg || "#0a0a12"
  const fg = t.foreground || "#e8e4f0"
  const card = t.card || "#12111f"
  const hFont = FONT_MAP[t.fontHeading] || FONT_MAP.system
  const bFont = FONT_MAP[t.fontBody] || FONT_MAP.system

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: primary, borderTopColor: "transparent" }} />
          <span className="text-sm" style={{ color: fg, opacity: 0.5 }}>Loading...</span>
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="text-center space-y-4 px-4">
          <h1 className="text-6xl font-bold tracking-tight" style={{ color: primary }}>404</h1>
          <p className="text-lg" style={{ color: fg, opacity: 0.6 }}>Post not found.</p>
          <Link href={`/blog/${slug}`} className="inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: primary }}>
            <ArrowLeft className="h-3 w-3" /> Back to {post?.blog?.name || "blog"}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: bg, color: fg, fontFamily: bFont }}>
      {t.customCss && <style dangerouslySetInnerHTML={{ __html: t.customCss }} />}

      {/* Cover */}
      {post.coverImageUrl && (
        <div className="w-full" style={{ maxHeight: "420px", overflow: "hidden" }}>
          <img src={post.coverImageUrl} alt="" className="w-full object-cover" style={{ maxHeight: "420px" }} />
        </div>
      )}

      <article className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Back link */}
        <Link href={`/blog/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm mb-8 hover:underline underline-offset-4 transition-colors"
          style={{ color: fg, opacity: 0.45, textDecorationColor: primary + "40" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {post.blog.name}
        </Link>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight" style={{ fontFamily: hFont }}>
          <span dangerouslySetInnerHTML={{ __html: renderTitleHtml(post.title) }} />
        </h1>

        {/* Meta line */}
        <div className="flex flex-wrap items-center gap-4 mt-5 text-sm" style={{ color: fg, opacity: 0.45 }}>
          {post.author && (
            <span className="inline-flex items-center gap-2">
              {post.author.avatarUrl ? (
                <img src={post.author.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: primary, color: "#fff" }}>
                  {(post.author.name || "?")[0].toUpperCase()}
                </div>
              )}
              <Link href={`/blog/${slug}/author/${post.author?.id}`} className="hover:underline">{post.author.name}</Link>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {fmtDate(post.createdAt)}</span>
          <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> {readingTime(post.content || "")}</span>
          {post.createdAt !== post.updatedAt && (
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Updated {fmtDate(post.updatedAt)}</span>
          )}
        </div>

        {/* Tags */}
        {(post.tags?.length || 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-5">
            {post.tags!.map((tag) => (
              <span key={tag} className="inline-block px-3 py-1 rounded-full text-[11px] font-medium"
                style={{ background: primary + "10", color: primary }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <BlogContentWarning flags={post.contentFlags} type="modal" primaryColor={primary} fgColor={fg} title={post.title} excerpt={post.excerpt}>
        <div className="mt-8 md:mt-10">
          {post.content ? (
            <div className="max-w-none"
              style={{
                color: fg,
                fontFamily: bFont,
                lineHeight: "1.65",
                fontSize: "1rem",
              }}>
              {post.content.split("\n").map((line, i) => {
                if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-6 mb-2" style={{ fontFamily: hFont }} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(3)) }} />
                if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4 mb-1.5" style={{ fontFamily: hFont }} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(4)) }} />
                if (line.startsWith("![")) {
                  const m = line.match(/!\[(.*)\]\((.*)\)/)
                  if (m) return <img key={i} src={m[2]} alt={m[1]} className="rounded-lg my-3 w-full max-h-96 object-cover" />
                }
                if (line.startsWith("> ")) return <blockquote key={i} className="border-l-[3px] pl-3 my-2 italic text-sm" style={{ borderColor: primary + "40", opacity: 0.7 }} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(2)) }} />
                if (line.startsWith("```")) return <pre key={i} className="rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono" style={{ background: fg + "08", border: "1px solid " + fg + "10" }}>{line.slice(3, -3)}</pre>
                if (line.startsWith("- ")) return <li key={i} className="ml-4 my-0.5 text-sm" style={{ listStyle: "disc", opacity: 0.85 }} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(2)) }} />
                if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 my-0.5 text-sm" style={{ listStyle: "decimal", opacity: 0.85 }} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.replace(/^\d+\. /, "")) }} />
                if (line === "") return <br key={i} />
                return <p key={i} className="my-1.5 leading-relaxed text-[15px]" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line) }} />
              })}
            </div>
          ) : (
            <p className="italic" style={{ color: fg, opacity: 0.35 }}>No content.</p>
          )}
        </div>
        </BlogContentWarning>

        {/* Comments */}
        <CommentsSection postId={post.id} primary={primary} card={card} fg={fg} />

        {/* Bottom nav */}
        <div className="mt-8 pt-8 border-t" style={{ borderColor: fg + "0a" }}>
          <Link href={`/blog/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: primary }}>
            <ArrowLeft className="h-3.5 w-3.5" /> More from {post.blog.name}
          </Link>
        </div>
      </article>

    </div>
  )
}

function CommentsSection({ postId, primary, card, fg }: { postId: number; primary: string; card: string; fg: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState("")
  const [name, setName] = useState("")
  const [reveal, setReveal] = useState(false)
  const [imgUrl, setImgUrl] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const imgRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 10

  const loadMessages = useCallback(async (pg?: number) => {
    const p = pg || page
    try {
      const res = await apiFetch(API_ENDPOINTS.blogPostChat.replace(":postId", String(postId)) + `?page=${p}&limit=${PER_PAGE}`)
      setMessages(res?.messages || [])
      setTotal(res?.total || 0)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [postId, page])

  useEffect(() => { loadMessages() }, [loadMessages])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData(); form.append("file", file)
      const res = await apiFetch(API_ENDPOINTS.blogMineUpload, { method: "POST", body: form })
      if (res?.url) setImgUrl(res.url)
    } catch { /* */ }
    finally { setUploading(false) }
  }

  const send = async () => {
    if (!input.trim() && !imgUrl) return
    setSending(true)
    try {
      await apiFetch(API_ENDPOINTS.blogPostChatMessage.replace(":postId", String(postId)), {
        method: "POST",
        body: JSON.stringify({
          content: input.trim() || "(image)",
          anonymousName: reveal ? undefined : (name.trim() || undefined),
          revealIdentity: reveal || undefined,
          imageUrl: imgUrl || undefined,
        }),
      })
      setInput(""); setImgUrl(""); setPage(1)
      loadMessages(1)
    } catch { /* */ }
    finally { setSending(false) }
  }

  function renderMsg(msg: any) {
    const isIdentity = !!msg.displayName
    const label = isIdentity ? msg.displayName : (msg.anonymousName || "Anonymous")
    const av = isIdentity ? msg.avatarUrl : null
    return (
      <div key={msg.id} className="flex gap-3 group">
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
          style={{ background: isIdentity ? primary : (primary + "60") }}>
          {av ? <img src={av} alt="" className="w-full h-full object-cover" /> : label[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: isIdentity ? primary : (fg), opacity: isIdentity ? 1 : 0.6 }}>
              {label}
            </span>
            {msg.role && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold capitalize"
                style={{ background: msg.role === 'owner' ? primary : primary + "30", color: msg.role === 'owner' ? '#fff' : primary }}>
                {msg.role}
              </span>
            )}
            <span className="text-[10px]" style={{ color: fg, opacity: 0.3 }}>
              {new Date(msg.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words" style={{ color: fg, opacity: 0.85 }}>
            {msg.content.split(/(\*\*.*?\*\*|_.*?_|`.*?`)/g).map((part: string, i: number) => {
              if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>
              if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>
              if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="px-1 rounded text-xs" style={{ background: fg + "10" }}>{part.slice(1, -1)}</code>
              return <span key={i}>{part}</span>
            })}
          </div>
          {msg.imageUrl && (
            <img src={msg.imageUrl} alt="" className="mt-2 rounded-lg max-h-64 object-cover" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-10 pt-8 border-t" style={{ borderColor: fg + "0f" }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: fg, opacity: 0.5 }}>
        Comments ({total > 0 ? total : messages.length})
      </h3>

      <div className="space-y-4 mb-4">
        {loading ? (
          <p className="text-xs" style={{ opacity: 0.3 }}>Loading comments...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs" style={{ opacity: 0.3 }}>No comments yet. Be the first!</p>
        ) : (
          <>
            {messages.map(renderMsg)}
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 1 && (
                <button onClick={() => { const pg = page - 1; setPage(pg); loadMessages(pg) }}
                  className="text-[11px] px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: fg + "15", color: fg, opacity: 0.6 }}>
                  ← Newer
                </button>
              )}
              {total > page * PER_PAGE && (
                <button onClick={() => { const pg = page + 1; setPage(pg); loadMessages(pg) }}
                  className="text-[11px] px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: fg + "15", color: fg, opacity: 0.6 }}>
                  Older →
                </button>
              )}
            </div>
            {total > 0 && (
              <p className="text-center text-[10px]" style={{ color: fg, opacity: 0.25 }}>
                Page {page} of {Math.ceil(total / PER_PAGE)} · {total} comment{total !== 1 ? "s" : ""}
              </p>
            )}
          </>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: fg + "12", background: card + "80" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Write a comment... (Markdown supported)"
          maxLength={10000}
          rows={2}
          className="w-full text-sm px-3 py-2 rounded-lg border bg-transparent resize-none"
          style={{ borderColor: fg + "12", color: fg }}
        />
        {imgUrl && (
          <div className="flex items-center gap-2">
            <img src={imgUrl} alt="" className="h-12 rounded object-cover" />
            <button onClick={() => setImgUrl("")} className="text-[10px] text-red-500">Remove</button>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={reveal ? "" : name}
            onChange={(e) => setName(e.target.value)}
            placeholder={reveal ? "Posting as yourself" : "Your name (optional)"}
            maxLength={64}
            disabled={reveal}
            className="text-xs px-2.5 py-1.5 rounded-lg border bg-transparent flex-1 min-w-[120px]"
            style={{ borderColor: fg + "12", color: fg }}
          />
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none" style={{ color: fg, opacity: 0.6 }}>
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} className="rounded" />
            Post as myself
          </label>
          <button type="button" onClick={() => imgRef.current?.click()}
            className="text-[11px] px-2 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: fg + "15", color: fg, opacity: 0.6 }}>
            {uploading ? "..." : <><Image className="h-3.5 w-3.5 inline" /> Image</>}
          </button>
          <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleUpload} />
          <button
            onClick={send}
            disabled={sending || (!input.trim() && !imgUrl)}
            className="ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: primary }}>
            {sending ? "..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  )
}