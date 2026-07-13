"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useAuth, hasPermission } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { isExternalUrlSync } from "@/lib/internal-domains"
import { Loader2, Lock, Paperclip, X, Link2, PanelLeft, Globe, Hash, Users, Plus, TriangleAlert } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

function safeUrl(url: string | null | undefined, allowedProtocols: string[]): string | undefined {
  if (!url) return undefined
  if (/[\r\n\t]/.test(url)) return undefined
  if (url.startsWith('/')) return url.startsWith('//') ? undefined : url
  try {
    const parsed = new URL(url)
    if (allowedProtocols.includes(parsed.protocol)) return parsed.toString()
  } catch {
    return undefined
  }
  return undefined
}

const ALLOWED_DATA_IMAGE_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/webp',
  'data:image/gif',
  'data:image/bmp',
]

function safeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('data:')) {
    return ALLOWED_DATA_IMAGE_PREFIXES.some(p => url.startsWith(p)) ? url : undefined
  }
  return safeUrl(url, ['http:', 'https:'])
}

function safeHrefUrl(url: string | null | undefined): string | undefined {
  const safe = safeUrl(url, ['http:', 'https:'])
  if (!safe) return undefined
  if (safe.startsWith('/')) return safe
  return isExternalUrlSync(safe) ? undefined : safe
}

function proxyImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const safe = safeImageUrl(url)
  if (!safe) return undefined
  if (safe.startsWith('/')) return safe
  if (!isExternalUrlSync(safe)) return safe
  return `/api/proxy/image?url=${encodeURIComponent(safe)}`
}

interface Channel {
  id: number; slug: string; name: string; description: string | null
  type: "community" | "public_anonymous"; createdById: number | null
  isListed: boolean; isArchived: boolean; isMature: boolean; createdAt: string
  isMember?: boolean; myRole?: string | null; threadCount?: number; postCount?: number
}

interface Post {
  id: number; channelId: number; parentId: number | null
  userId: number | null; anonymousId: string | null
  anonymousName: string | null; displayName: string | null
  avatarUrl: string | null; imageUrl: string | null; content: string
  posterId?: string | null; bumpedAt: string | null; isLocked: boolean; createdAt: string
  formattedId?: string; replyCount?: number; recentReplies?: Post[]
  authorIsStaff?: boolean; isHidden?: boolean
}

interface ThreadView {
  op: Post; replies: Post[]
  channel: { id: number; name: string; slug: string; type: string } | null
}

type ViewMode = "board" | "thread"

function formatPostId(id: number): string {
  const s = String(id)
  return s.length >= 9 ? s : "0".repeat(9 - s.length) + s
}

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  return `${date} ${time}`
}

function getPostName(post: Post): string {
  return post.displayName || post.anonymousName || "Anonymous"
}

function normalizePostMarkdown(text: string): string {
  return text
    .replace(/>>>\/([^\s/]+)\/((?:\d+)(?:#p\d+)?)?/g, (_, boardSlug: string, threadPart?: string) => {
      if (!threadPart) return `[>>>/${boardSlug}/](/dashboard/chat?board=${boardSlug})`
      const [threadId, postAnchor] = threadPart.split("#p")
      return `[>>>/${boardSlug}/${threadPart}](/dashboard/chat?board=${boardSlug}&thread=${threadId}${postAnchor ? `#p${postAnchor}` : ""})`
    })
    .replace(/(?<!>)>>(\d+)/g, (_, postId: string) => `[>>${formatPostId(Number(postId))}](#p${postId})`)
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const normalized = normalizePostMarkdown(text)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <>{children}</>,
        a: ({ href, children }) => {
          const safeHref = safeHrefUrl(href) ?? ((href?.startsWith("/") || href?.startsWith("#")) ? href : undefined)
          if (!safeHref) return <>{children}</>
          return (
            <a
              href={safeHref}
              target={safeHref.startsWith("#") ? undefined : "_blank"}
              rel={safeHref.startsWith("#") ? undefined : "noopener noreferrer"}
              className="text-primary hover:text-primary/80 underline decoration-primary/30"
            >
              {children}
            </a>
          )
        },
        strong: ({ children }) => <strong className="font-bold text-foreground/90">{children}</strong>,
        em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
        del: ({ children }) => <del className="line-through text-foreground/50">{children}</del>,
        code: ({ children }) => (
          <code className="bg-muted/60 border border-border/30 px-1 py-0.5 rounded text-[11px] font-mono">
            {children}
          </code>
        ),
      }}
    >
      {normalized}
    </ReactMarkdown>
  )
}

function renderPostLine(line: string, key: number) {
  const trimmed = line.trim()

  if (trimmed.startsWith(">>>")) {
    const match = trimmed.match(/^>>>\/([^\/]+)\/(?:(\d+)(?:#p(\d+))?)?$/)
    if (match) {
      const [, boardSlug, threadId, postId] = match
      let label = `>>>/${boardSlug}/`
      if (threadId) { label += threadId; if (postId) label += `#p${postId}` }
      return (
        <span key={key} className="block">
          <a
            href={`/dashboard/chat?board=${boardSlug}${threadId ? `&thread=${threadId}` : ""}${postId ? `#p${postId}` : ""}`}
            className="text-primary hover:text-primary/80 underline decoration-primary/30"
          >
            {label}
          </a>
        </span>
      )
    }
  }

  if (trimmed.startsWith(">") && !trimmed.startsWith(">>")) {
    return <span key={key} className="block text-green-500/80">{line}</span>
  }

  return (
    <span key={key} className="block text-foreground/80">
      {renderInlineMarkdown(line) || "\u00A0"}
    </span>
  )
}

function PostContent({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
  const imgSrc = proxyImageUrl(imageUrl)
  const hrefUrl = safeHrefUrl(imageUrl)

  return (
    <div className="text-xs leading-relaxed space-y-0 break-words [overflow-wrap:break-word]">
      {content.split("\n").map((line, i) => renderPostLine(line, i))}
      {imgSrc && (
        <div className="mt-2">
          {hrefUrl ? (
            <a href={hrefUrl} target="_blank" rel="noopener noreferrer nofollow ugc">
              <img
                src={imgSrc}
                alt="Attached"
                className="max-h-48 md:max-h-64 max-w-[200px] md:max-w-xs border border-border/40 object-contain hover:opacity-90 transition-opacity cursor-pointer"
                loading="lazy"
              />
            </a>
          ) : (
            <img
              src={imgSrc}
              alt="Attached"
              className="max-h-48 md:max-h-64 max-w-[200px] md:max-w-xs border border-border/40 object-contain"
              loading="lazy"
            />
          )}
        </div>
      )}
    </div>
  )
}

function PostHeader({ post, isOp }: { post: Post; isOp?: boolean }) {
  const name = getPostName(post)
  const isAnon = !post.displayName
  const pid = post.formattedId || formatPostId(post.id)

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] mb-1 font-mono leading-tight">
      <span className={`font-bold text-[12px] ${isAnon ? "text-green-500/70" : "text-foreground/70"}`}>
        {name}
        {post.authorIsStaff && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary/15 text-primary/80 border border-primary/20 leading-none">
            Mod
          </span>
        )}
      </span>
      {post.posterId && (
        <span className="text-muted-foreground/40">
          ID:&nbsp;<span className="text-primary/60">{post.posterId}</span>
        </span>
      )}
      <span className="text-muted-foreground/50">{formatTimestamp(post.createdAt)}</span>
      <span className="text-primary/50">No.{pid}</span>
      {post.isLocked && <span className="text-destructive/60 text-[10px]">🔒 Locked</span>}
    </div>
  )
}

async function copyLink(path: string) {
  try { await navigator.clipboard.writeText(`${window.location.origin}${path}`) } catch { }
}

function getChannelIcon(type: string) {
  return type === "public_anonymous" ? Globe : Hash
}

export default function ChatPage() {
  const { user, isLoggedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [threads, setThreads] = useState<Post[]>([])
  const [activeThread, setActiveThread] = useState<ThreadView | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("board")

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [anonymousName, setAnonymousName] = useState(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem("chat_anonymous_name") || ""
  })

  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => { loadChannels() }, [])

  useEffect(() => {
    if (channels.length === 0) return
    const boardSlug = searchParams.get("board")?.trim().replace(/[)\s]+$/, "")
    const threadId = searchParams.get("thread")?.trim().replace(/\D+$/, "")
    if (!boardSlug) return

    const nextChannel = channels.find(c => c.slug === boardSlug)
    if (!nextChannel) return

    if (activeChannel?.id !== nextChannel.id) {
      setActiveChannel(nextChannel)
      return
    }

    if (threadId) {
      const tid = Number(threadId)
      if (Number.isFinite(tid) && tid > 0 && activeThread?.op.id !== tid) {
        setActiveThread(null)
        setViewMode("board")
        void (async () => {
          const found = await loadThread(nextChannel.id, tid)
          if (!found) { router.replace(`/dashboard/chat?board=${encodeURIComponent(nextChannel.slug)}`); return }
          setViewMode("thread")
        })()
      }
    }
  }, [activeChannel?.id, activeThread?.op.id, channels, router, searchParams])

  useEffect(() => {
    if (activeChannel) { loadThreads(activeChannel.id); setActiveThread(null); setViewMode("board") }
  }, [activeChannel?.id])

  useEffect(() => {
    if (!activeChannel) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${protocol}//${window.location.host}${API_ENDPOINTS.chatWs}`)
    wsRef.current = ws

    const queue: string[] = []

    function safeSend(msg: object) {
      const str = JSON.stringify(msg)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(str)
      } else if (ws.readyState === WebSocket.CONNECTING) {
        queue.push(str)
      }
    }

    ws.onopen = () => {
      while (queue.length > 0) {
        const msg = queue.shift()!
        if (ws.readyState === WebSocket.OPEN) ws.send(msg)
      }
      ws.send(JSON.stringify({ type: "subscribe", channelId: activeChannel.id }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "thread_update" && data.data?.channelId === activeChannel.id) {
          if (data.data.thread) {
            setThreads(prev => {
              const idx = prev.findIndex(t => t.id === data.data.thread.id)
              if (idx >= 0) {
                const next = [...prev]
                const [ex] = next.splice(idx, 1)
                next.unshift({ ...ex, ...data.data.thread })
                return next
              }
              return [data.data.thread, ...prev]
            })
          } else if (data.data.threadId) {
            setThreads(prev => {
              const idx = prev.findIndex(t => t.id === data.data.threadId)
              if (idx < 0) return prev
              const next = [...prev]
              const [b] = next.splice(idx, 1)
              next.unshift(b)
              return next
            })
          }
        }
        if (data.type === "new_message" && data.data?.channelId === activeChannel.id) {
          if (activeThread && data.data.threadId === activeThread.op.id) {
            setActiveThread(prev => {
              if (!prev || prev.replies.some(r => r.id === data.data.id)) return prev
              return { ...prev, replies: [...prev.replies, data.data] }
            })
          }
        }
      } catch { }
    }

    ws.onerror = (err) => {
      console.warn("[WS] error", err)
    }

    ws.onclose = (e) => {
      console.warn("[WS] closed", e.code, e.reason)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", channelId: activeChannel.id }))
      }
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close()
      }
    }
  }, [activeChannel?.id])

  async function loadChannels() {
    setLoading(true)
    try {
      const [community, pub, listed] = await Promise.all([
        apiFetch(API_ENDPOINTS.chatChannels).catch(() => null),
        apiFetch(API_ENDPOINTS.chatPublicChannels).catch(() => []),
        apiFetch(API_ENDPOINTS.chatChannelsAll).catch(() => null),
      ])
      const all: Channel[] = []; const seen = new Set<number>()
      const push = (arr: any) => {
        if (!Array.isArray(arr)) return
        for (const c of arr) { if (c?.id && !seen.has(c.id)) { seen.add(c.id); all.push(c as Channel) } }
      }
      if (listed && Array.isArray(listed)) push(listed)
      else { push(community); push(pub) }
      setChannels(all)
    } catch { }
    setLoading(false)
  }

  async function loadThreads(channelId: number) {
    try {
      const res = await apiFetch(`${API_ENDPOINTS.chatChannel.replace(":id", String(channelId))}/threads`)
      if (res?.threads) setThreads(res.threads as Post[])
    } catch { }
  }

  async function loadThread(channelId: number, threadId: number) {
    if (!Number.isSafeInteger(channelId) || channelId <= 0) return false
    if (!Number.isSafeInteger(threadId) || threadId <= 0) return false
    try {
      const safeChannelId = encodeURIComponent(String(channelId))
      const safeThreadId = encodeURIComponent(String(threadId))
      const res = await apiFetch(`${API_ENDPOINTS.chatChannel.replace(":id", safeChannelId)}/threads/${safeThreadId}`)
      if (res?.op) { setActiveThread(res as ThreadView); return true }
    } catch { }
    return false
  }

  async function createServerThread(content: string, isAnonymous: boolean, imageUrl?: string, revealIdentity?: boolean) {
    if (!activeChannel || !content.trim()) return
    setSending(true)
    try {
      const body: any = { content: content.trim() }
      if (imageUrl) body.imageUrl = imageUrl
      if (isAnonymous) {
        if (revealIdentity) body.revealIdentity = true
        else body.anonymousName = anonymousName || undefined
      }
      const base = API_ENDPOINTS.chatChannel.replace(":id", String(activeChannel.id))
      const res = await apiFetch(isAnonymous ? `${base}/threads/anonymous` : `${base}/threads`, {
        method: "POST", body: JSON.stringify(body),
      })
      if (res) setThreads(prev => [res as Post, ...prev])
    } catch { }
    setSending(false)
  }

  async function replyToThread(threadId: number, content: string, isAnonymous: boolean, imageUrl?: string, revealIdentity?: boolean) {
    if (!activeChannel || !content.trim()) return
    setSending(true)
    try {
      const body: any = { content: content.trim() }
      if (imageUrl) body.imageUrl = imageUrl
      if (isAnonymous) {
        if (revealIdentity) body.revealIdentity = true
        else body.anonymousName = anonymousName || undefined
      }
      const base = API_ENDPOINTS.chatChannel.replace(":id", String(activeChannel.id))
      const res = await apiFetch(
        isAnonymous ? `${base}/threads/${threadId}/reply/anonymous` : `${base}/threads/${threadId}/reply`,
        { method: "POST", body: JSON.stringify(body) }
      )
      if (res) setActiveThread(prev => prev ? { ...prev, replies: [...prev.replies, res as Post] } : prev)
    } catch { }
    setSending(false)
  }

  async function joinChannel(channelId: number) {
    try {
      await apiFetch(API_ENDPOINTS.chatJoin.replace(":id", String(channelId)), { method: "POST" })
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, isMember: true } : c))
    } catch { }
  }

  async function createChannel(name: string, description: string, type: "community" | "public_anonymous") {
    try {
      const ch = await apiFetch(API_ENDPOINTS.chatChannels, {
        method: "POST", body: JSON.stringify({ name, description, type }),
      })
      if (ch) { setChannels(prev => [...prev, ch as Channel]); setShowCreateModal(false) }
    } catch { }
  }

  async function updateChannel(channelId: number, data: { name?: string; slug?: string; description?: string | null; isMature?: boolean }) {
    try {
      const updated = await apiFetch(API_ENDPOINTS.chatChannel.replace(":id", String(channelId)), {
        method: "PUT", body: JSON.stringify(data),
      })
      if (updated) {
        setChannels(prev => prev.map(c => c.id === channelId ? { ...c, ...updated } as Channel : c))
        if (activeChannel?.id === channelId) setActiveChannel(prev => prev ? { ...prev, ...updated } as Channel : prev)
        setEditingChannel(null)
      }
    } catch { }
  }

  async function deleteChannel(channelId: number) {
    try {
      await apiFetch(API_ENDPOINTS.chatChannel.replace(":id", String(channelId)), { method: "DELETE" })
      setChannels(prev => prev.filter(c => c.id !== channelId))
      if (activeChannel?.id === channelId) { setActiveChannel(null); setActiveThread(null) }
      setDeletingChannel(null)
    } catch { }
  }

  async function toggleHideMessage(channelId: number, messageId: number, currentlyHidden: boolean) {
    try {
      await apiFetch(`/api/chat/channels/${channelId}/messages/${messageId}/${currentlyHidden ? "unhide" : "hide"}`, { method: "POST" })
      const patch = (p: Post) => p.id === messageId ? { ...p, isHidden: !currentlyHidden } : p
      setThreads(prev => prev.map(patch))
      if (activeThread) {
        setActiveThread(prev => prev ? {
          ...prev,
          op: prev.op.id === messageId ? { ...prev.op, isHidden: !currentlyHidden } : prev.op,
          replies: prev.replies.map(patch),
        } : prev)
      }
    } catch { }
  }

  async function deleteMessage(channelId: number, messageId: number) {
    try {
      await apiFetch(`/api/chat/channels/${channelId}/messages/${messageId}`, { method: "DELETE" })
      setThreads(prev => prev.filter(t => t.id !== messageId))
      if (activeThread) {
        if (activeThread.op.id === messageId) { setActiveThread(null); setViewMode("board") }
        else setActiveThread(prev => prev ? { ...prev, replies: prev.replies.filter(r => r.id !== messageId) } : prev)
      }
    } catch { }
  }

  async function lookupPost(posterId: string) {
    let res: any
    try {
      res = await apiFetch(`/api/chat/messages/lookup?posterId=${encodeURIComponent(posterId)}`)
    } catch { alert("Lookup failed"); return }
    if (!Array.isArray(res) || res.length === 0) { alert("No messages found for this poster ID"); return }
    const info = res[0]
    const msg = `Hash: ${info.ipHash || "N/A"}\nMsgs: ${res.length}\nPoster: ${posterId}\nUser ID: ${info.userId || "anon"}`
    if (info.ipHash) {
      if (!confirm(`${msg}\n\nBan IP for 24h?`)) return
      try {
        await apiFetch("/api/chat/ip-bans", {
          method: "POST",
          body: JSON.stringify({ ipHash: info.ipHash, reason: `Banned from #${info.formattedId}`, hours: 24 }),
        })
        alert("Banned for 24h")
      } catch { alert("Ban failed") }
    } else if (info.userId) {
      if (!confirm(`${msg}\n\nNo IP log. Ban account (user #${info.userId}) for 24h?`)) return
      try {
        await apiFetch("/api/chat/ip-bans", {
          method: "POST",
          body: JSON.stringify({ userId: info.userId, reason: `Banned from #${info.formattedId}`, hours: 24 }),
        })
        alert("Account banned for 24h")
      } catch { alert("Ban failed") }
    } else {
      alert(`${msg}\n\nNo IP hash or user ID to ban.`)
    }
  }

  async function massDeletePost(posterId: string) {
    if (!confirm(`Mass delete all posts from ${posterId} in the last 24h?`)) return
    try {
      const res = await apiFetch("/api/chat/messages/mass-delete", {
        method: "POST",
        body: JSON.stringify({ posterId, hours: 24 }),
      })
      if (res?.deleted) {
        setThreads(prev => prev.filter(t => t.posterId !== posterId))
        setActiveThread(prev => prev && prev.op.posterId === posterId ? null : prev ? {
          ...prev,
          replies: prev.replies.filter(r => r.posterId !== posterId),
        } : prev)
        alert(`Deleted ${res.deleted} posts`)
      }
    } catch { alert("Mass delete failed") }
  }

  function canManage(ch: Channel) {
    if (!isLoggedIn || !user) return false
    return ch.createdById === user.id || ch.myRole === "admin" || hasPermission(user, 'chat:manage')
  }

  const canPost = (c: Channel) =>
    c.type === "public_anonymous" || (!!isLoggedIn && c.type === "community" && !!c.isMember)

  const canModerate = isLoggedIn && user && hasPermission(user, 'chat:manage')

  const communityChannels = isLoggedIn ? channels.filter(c => c.type === "community") : []
  const publicChannels = channels.filter(c => c.type === "public_anonymous")

  function goToBoard(ch: Channel) {
    setActiveChannel(ch); router.push(`/dashboard/chat?board=${ch.slug}`)
  }
  function goToThread(ch: Channel, threadId: number) {
    router.push(`/dashboard/chat?board=${ch.slug}&thread=${threadId}`)
  }
  function goBack() {
    setViewMode("board"); setActiveThread(null)
    if (activeChannel) router.push(`/dashboard/chat?board=${activeChannel.slug}`)
  }
  function goToIndex() {
    setActiveChannel(null); setActiveThread(null); setViewMode("board"); router.push("/dashboard/chat")
  }

  function renderSidebarContent() {
    return (
      <>
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground/30 animate-spin" />
          </div>
        )}

        {publicChannels.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/30">
              Anonymous
            </div>
            {publicChannels.map(ch => (
              <BoardSidebarItem
                key={ch.id} channel={ch}
                active={activeChannel?.id === ch.id}
                manageable={canManage(ch)}
                onClick={() => { goToBoard(ch); setMobileSidebarOpen(false) }}
                onEdit={() => setEditingChannel(ch)}
                onDelete={() => setDeletingChannel(ch)}
              />
            ))}
          </>
        )}

        {communityChannels.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/30">
              Community
            </div>
            {communityChannels.map(ch => (
              <BoardSidebarItem
                key={ch.id} channel={ch}
                active={activeChannel?.id === ch.id}
                manageable={canManage(ch)}
                onClick={() => { goToBoard(ch); setMobileSidebarOpen(false) }}
                onEdit={() => setEditingChannel(ch)}
                onDelete={() => setDeletingChannel(ch)}
                onJoin={!ch.isMember ? () => joinChannel(ch.id) : undefined}
              />
            ))}
          </>
        )}
      </>
    )
  }

  return (
    <div className="flex h-full bg-background font-sans">

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="absolute left-0 top-0 bottom-0 w-56 bg-sidebar border-r border-border/50 flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 border-b border-border/50 bg-card flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Boards</span>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-muted-foreground/50 hover:text-foreground/70 font-mono text-sm">[×]</button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">{renderSidebarContent()}</div>
          </div>
        </div>
      )}

      {/* Desktop sidebar — collapsible */}
      {!sidebarCollapsed && (
        <div className="w-48 shrink-0 border-r border-border/50 bg-sidebar hidden md:flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/50 bg-card">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Boards
              </span>
              <div className="flex items-center gap-1">
                {isLoggedIn && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-[10px] text-primary/50 hover:text-primary font-mono transition-colors"
                  >
                    [+]
                  </button>
                )}
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-[10px] text-muted-foreground/30 hover:text-foreground/50 font-mono transition-colors"
                  title="Hide boards"
                >
                  [«]
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
            {renderSidebarContent()}
          </div>

          <div className="px-3 py-2 border-t border-border/50 bg-card">
            <p className="text-[9px] text-muted-foreground/30 font-mono">
              {isLoggedIn ? "Logged in" : "Anonymous"}
            </p>
          </div>
        </div>
      )}

      {/* Desktop collapsed sidebar tab */}
      {sidebarCollapsed && (
        <div className="hidden md:flex w-8 shrink-0 border-r border-border/50 bg-sidebar flex-col items-center pt-2 gap-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="text-muted-foreground/30 hover:text-foreground/60 transition-colors"
            title="Show boards"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <div className="shrink-0 bg-card border-b border-border/50 px-3 md:px-4 py-1.5 flex items-center gap-2">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setMobileSidebarOpen(true)
              else setSidebarCollapsed(!sidebarCollapsed)
            }}
            className="text-muted-foreground/50 hover:text-foreground/70 transition-colors"
            aria-label="Toggle boards"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToIndex}
            className="text-primary/70 font-mono font-semibold text-[12px] hover:text-primary transition-colors truncate"
          >
            /{activeChannel?.slug ?? "boards"}/
          </button>
          {activeChannel && (
            <>
              <span className="text-muted-foreground/30 text-[11px]">—</span>
              <span className="text-muted-foreground/50 text-[11px] font-mono">{activeChannel.name}</span>
              {viewMode === "thread" && activeThread && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">»</span>
                  <span className="text-primary/40 text-[11px] font-mono">
                    No.{activeThread.op.formattedId || formatPostId(activeThread.op.id)}
                  </span>
                </>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {activeChannel && (
              <button
                onClick={() => copyLink(
                  activeChannel
                    ? `/dashboard/chat?board=${activeChannel.slug}${viewMode === "thread" && activeThread ? `&thread=${activeThread.op.id}` : ""}`
                    : "/dashboard/chat"
                )}
                className="p-1 text-muted-foreground/30 hover:text-foreground/50 hover:bg-muted rounded transition-all"
                title="Copy link"
              >
                <Link2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {!activeChannel ? (
          <BoardIndex
            publicChannels={publicChannels}
            communityChannels={communityChannels}
            isLoggedIn={isLoggedIn}
            onSelect={goToBoard}
            onJoin={joinChannel}
            loading={loading}
          />
        ) : viewMode === "thread" && activeThread ? (
          <ThreadViewPanel
            thread={activeThread}
            channel={activeChannel}
            isLoggedIn={isLoggedIn}
            anonymousName={anonymousName}
            setAnonymousName={setAnonymousName}
            isAnonymous={activeChannel.type === "public_anonymous"}
            canPost={canPost(activeChannel)}
            canModerate={canModerate}
            sending={sending}
            onBack={goBack}
            onReply={(content, imageUrl, revealIdentity) =>
              replyToThread(activeThread.op.id, content, activeChannel.type === "public_anonymous", imageUrl, revealIdentity)
            }
            onToggleHideMessage={(messageId, hidden) => toggleHideMessage(activeChannel.id, messageId, hidden)}
            onDeleteMessage={(messageId) => deleteMessage(activeChannel.id, messageId)}
            onLookupPost={lookupPost}
            onMassDelete={massDeletePost}
          />
        ) : (
          <BoardPanel
            channel={activeChannel}
            threads={threads}
            isLoggedIn={isLoggedIn}
            anonymousName={anonymousName}
            setAnonymousName={setAnonymousName}
            canPost={canPost(activeChannel)}
            canModerate={canModerate}
            isAnonymous={activeChannel.type === "public_anonymous"}
            sending={sending}
            onSelectThread={t => {
              void loadThread(activeChannel.id, t.id).then(found => {
                if (found) { goToThread(activeChannel, t.id); setViewMode("thread") }
              })
            }}
            onNewThread={(content, imageUrl, revealIdentity) =>
              createServerThread(content, activeChannel.type === "public_anonymous", imageUrl, revealIdentity)
            }
            onToggleHideMessage={(messageId, hidden) => toggleHideMessage(activeChannel.id, messageId, hidden)}
            onDeleteMessage={(messageId) => deleteMessage(activeChannel.id, messageId)}
            onLookupPost={lookupPost}
            onMassDelete={massDeletePost}
          />
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateChannelModal onClose={() => setShowCreateModal(false)} onCreate={createChannel} />
        )}
        {editingChannel && (
          <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)}
            onSave={data => updateChannel(editingChannel.id, data)} />
        )}
        {deletingChannel && (
          <DeleteChannelModal channel={deletingChannel} onClose={() => setDeletingChannel(null)}
            onConfirm={() => deleteChannel(deletingChannel.id)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function BoardSidebarItem({ channel, active, manageable, onClick, onEdit, onDelete, onJoin }: {
  channel: Channel; active: boolean; manageable: boolean
  onClick: () => void; onEdit: () => void; onDelete: () => void; onJoin?: () => void
}) {
  const Icon = getChannelIcon(channel.type)
  return (
    <div className={`group flex items-center gap-1 px-2 py-0.5 transition-colors ${active ? "bg-primary/10" : "hover:bg-muted/50"}`}>
      <button onClick={onClick} className="flex-1 flex items-center gap-1.5 min-w-0 text-left py-1 px-1">
        <Icon className={`h-2.5 w-2.5 shrink-0 ${active ? "text-primary/60" : "text-muted-foreground/30"}`} />
        <span className={`text-[11px] font-mono truncate ${active ? "text-primary font-semibold" : "text-muted-foreground/60 hover:text-foreground/60"}`}>
          /{channel.slug}/
        </span>
        {channel.isMature && <span className="text-[8px] font-mono text-amber-500/70 shrink-0">18+</span>}
      </button>
      <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
        {onJoin && (
          <button onClick={e => { e.stopPropagation(); onJoin() }}
            className="text-[9px] text-primary/50 hover:text-primary font-mono px-0.5 transition-colors">
            [join]
          </button>
        )}
        {manageable && (
          <>
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="text-[9px] text-muted-foreground/40 hover:text-foreground/60 font-mono px-0.5 transition-colors">
              [e]
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="text-[9px] text-muted-foreground/40 hover:text-destructive/70 font-mono px-0.5 transition-colors">
              [x]
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function BoardIndex({ publicChannels, communityChannels, isLoggedIn, onSelect, onJoin, loading }: {
  publicChannels: Channel[]; communityChannels: Channel[]
  isLoggedIn: boolean; onSelect: (ch: Channel) => void
  onJoin: (id: number) => void; loading: boolean
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-3 md:px-4 py-4 md:py-6">

        <div className="border border-border/40 bg-card p-4 mb-6 text-center rounded">
          <h1 className="text-lg font-semibold text-foreground/70 tracking-tight mb-1">Boards</h1>
          <p className="text-[11px] text-muted-foreground/40 font-mono">
            {isLoggedIn
              ? "Select a board to begin posting."
              : "Select a public board. No account required for anonymous boards."}
          </p>
        </div>

        {loading && (
          <div className="text-center py-8">
            <Loader2 className="h-4 w-4 text-muted-foreground/30 animate-spin mx-auto" />
          </div>
        )}

        {publicChannels.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/40 border-b border-border/40 pb-1 mb-2 font-mono">
              Anonymous Boards
            </h2>
            {publicChannels.map(ch => (
              <BoardIndexRow key={ch.id} channel={ch} onSelect={onSelect} />
            ))}
          </div>
        )}

        {isLoggedIn && communityChannels.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/40 border-b border-border/40 pb-1 mb-2 font-mono">
              Community Boards
            </h2>
            {communityChannels.map(ch => (
              <BoardIndexRow key={ch.id} channel={ch} onSelect={onSelect}
                onJoin={!ch.isMember ? () => onJoin(ch.id) : undefined} />
            ))}
          </div>
        )}

        {!loading && publicChannels.length === 0 && communityChannels.length === 0 && (
          <div className="text-center py-10 text-muted-foreground/30 font-mono text-[11px]">
            [ No boards available ]
          </div>
        )}

        <div className="mt-8 text-center text-[10px] text-muted-foreground/20 font-mono">
          All posts are the responsibility of the individual poster.
        </div>
      </div>
    </div>
  )
}

function BoardIndexRow({ channel, onSelect, onJoin }: {
  channel: Channel; onSelect: (ch: Channel) => void; onJoin?: () => void
}) {
  const Icon = getChannelIcon(channel.type)
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-border/20 hover:bg-muted/30 px-2 transition-colors group rounded-sm">
      <button onClick={() => onSelect(channel)} className="text-left flex-1 flex items-baseline gap-3">
        <span className="font-mono font-semibold text-primary/60 text-[12px] shrink-0 w-auto md:w-28 truncate max-w-[120px] md:max-w-none">
          /{channel.slug}/
        </span>
        {channel.isMature && <span className="text-[10px] font-mono text-amber-500/60 shrink-0">[18+]</span>}
        <span className="text-foreground/60 text-[12px] font-medium group-hover:text-foreground/80 transition-colors">
          {channel.name}
        </span>
        {channel.description && (
          <span className="text-muted-foreground/30 text-[11px] truncate hidden sm:block font-mono">
            — {channel.description}
          </span>
        )}
      </button>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/30 font-mono shrink-0">
        <span>{channel.threadCount ?? 0}T</span>
        <span>{channel.postCount ?? 0}P</span>
        {onJoin && (
          <button onClick={e => { e.stopPropagation(); onJoin() }}
            className="text-primary/50 hover:text-primary transition-colors hover:underline">
            [join]
          </button>
        )}
      </div>
    </div>
  )
}

function PostForm({
  isAnonymous, isLoggedIn, anonymousName, setAnonymousName,
  placeholder, onSubmit, sending,
}: {
  isAnonymous: boolean; isLoggedIn?: boolean; anonymousName: string; setAnonymousName: (n: string) => void
  placeholder: string; onSubmit: (content: string, imageUrl?: string, revealIdentity?: boolean) => void; sending: boolean
}) {
  const [content, setContent] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [revealIdentity, setRevealIdentity] = useState(false)
  const [honeypot, setHoneypot] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImageUploading(true)
    try {
      const formData = new FormData(); formData.append("file", file)
      const res = await apiFetch(API_ENDPOINTS.chatUpload, { method: "POST", body: formData, headers: {} })
      if (res?.url) setImage(res.url)
    } catch { }
    setImageUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleSubmit() {
    if (!content.trim() || honeypot) return
    onSubmit(content.trim(), image || undefined, revealIdentity)
    setContent(""); setImage(null); setRevealIdentity(false); setHoneypot("")
  }

  const fieldLabelCls = "md:text-right md:pr-3 py-1 text-[11px] font-mono text-primary/50 md:w-24 md:align-top md:pt-2 shrink-0 block md:table-cell"
  const inputCls = "border border-border/40 bg-background rounded px-2 py-1 text-[12px] font-mono text-foreground/70 outline-none focus:border-primary/40 transition-colors w-full placeholder:text-muted-foreground/30"

  return (
    <div className="border border-border/40 bg-card rounded p-3 mb-4">
      <div aria-hidden="true" className="absolute opacity-0 pointer-events-none" style={{ height: 0, overflow: 'hidden' }}>
        <input type="text" name="website" tabIndex={-1} autoComplete="off"
          value={honeypot} onChange={e => setHoneypot(e.target.value)} />
      </div>
      <div className="text-[12px] w-full md:table border-collapse">
        <div className="md:table-row-group">
          {isAnonymous && (
            <>
              <div className="md:table-row">
                <div className={fieldLabelCls}>Name</div>
                <div className="py-1 md:table-cell">
                  <input
                    type="text" value={revealIdentity ? "" : anonymousName}
                    onChange={e => { setAnonymousName(e.target.value); localStorage.setItem("chat_anonymous_name", e.target.value) }}
                    placeholder="Anonymous" maxLength={64}
                    disabled={revealIdentity}
                    className={`${inputCls} max-w-[200px] ${revealIdentity ? "opacity-40 cursor-not-allowed" : ""}`}
                  />
                </div>
              </div>
              {isLoggedIn && (
                <div className="md:table-row">
                  <div className="md:table-cell" />
                  <div className="py-0.5 md:table-cell">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={revealIdentity} onChange={e => setRevealIdentity(e.target.checked)}
                        className="accent-primary h-3 w-3" />
                      <span className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground/60 transition-colors">
                        Post as <strong className="text-primary/60 font-semibold">your display name</strong>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="md:table-row">
            <div className={fieldLabelCls}>File</div>
            <div className="py-1 md:table-cell">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleImageSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()} disabled={imageUploading}
                className="border border-border/40 bg-background hover:bg-muted rounded px-2 py-0.5 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/60 disabled:opacity-40 transition-colors"
              >
                {imageUploading ? "Uploading…" : "Choose File"}
              </button>
              {image && (
                <span className="ml-2 text-[10px] text-green-500/60 font-mono">
                  Image ready
                  <button onClick={() => setImage(null)} className="ml-1 text-destructive/50 hover:text-destructive hover:underline">[x]</button>
                </span>
              )}
            </div>
          </div>
          <div className="md:table-row">
            <div className={fieldLabelCls}>Comment</div>
            <div className="py-1 md:table-cell">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSubmit() } }}
                placeholder={placeholder} rows={4}
                className={`${inputCls} resize-y max-w-lg`}
              />
            </div>
          </div>
          <div className="md:table-row">
            <div className="md:table-cell" />
            <div className="py-1.5 md:table-cell">
              <button
                onClick={handleSubmit} disabled={!content.trim() || sending}
                className="border border-border/50 bg-muted hover:bg-muted/80 rounded px-4 py-1 text-[11px] font-mono font-semibold text-foreground/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "Posting…" : "Post"}
              </button>
              <span className="ml-3 text-[10px] text-muted-foreground/25 font-mono">Ctrl+Enter to post</span>
            </div>
          </div>
        </div>
      </div>
      {image && (
        <div className="mt-2 md:ml-[96px]">
          <img src={image} alt="Preview"
            className="max-h-32 max-w-[200px] border border-border/30 object-contain rounded" />
        </div>
      )}
      <div className="mt-2 md:ml-[96px] flex flex-wrap gap-2 text-[10px] text-muted-foreground/25 font-mono">
        <span><strong className="text-muted-foreground/40">**bold**</strong></span>
        <span><em className="text-muted-foreground/40">*italic*</em></span>
        <span className="text-green-500/40">&gt;greentext</span>
        <span className="text-primary/40">&gt;&gt;No.</span>
        <span className="text-primary/40">&gt;&gt;&gt;/board/</span>
        <span><code className="bg-muted/40 px-0.5 rounded text-muted-foreground/40">`code`</code></span>
      </div>
    </div>
  )
}

function BoardPanel({
  channel, threads, isLoggedIn, anonymousName, setAnonymousName,
  canPost, canModerate, isAnonymous, sending, onSelectThread, onNewThread, onToggleHideMessage, onDeleteMessage,
  onLookupPost, onMassDelete,
}: {
  channel: Channel; threads: Post[]; isLoggedIn: boolean
  anonymousName: string; setAnonymousName: (n: string) => void
  canPost: boolean; canModerate?: boolean; isAnonymous: boolean; sending: boolean
  onSelectThread: (t: Post) => void
  onNewThread: (content: string, imageUrl?: string, revealIdentity?: boolean) => void
  onToggleHideMessage?: (messageId: number, currentlyHidden: boolean) => void; onDeleteMessage?: (messageId: number) => void
  onLookupPost?: (posterId: string) => void; onMassDelete?: (posterId: string) => void
}) {
  const [showMature, setShowMature] = useState(false)
  useEffect(() => { setShowMature(false) }, [channel.id])

  if (channel.isMature && !showMature) {
    return (
      <div className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
        <div className="max-w-lg mx-auto px-3 py-20 text-center">
          <div className="border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <TriangleAlert className="h-6 w-6 text-amber-400/80 mx-auto" />
            <h2 className="text-base font-semibold text-amber-400/80">Mature Content</h2>
            <p className="text-[12px] text-muted-foreground/60 font-mono leading-relaxed">
              This board may contain mature or NSFW content. Are you sure you want to proceed?
            </p>
            <button onClick={() => setShowMature(true)}
              className="border border-amber-500/40 text-amber-400/80 hover:bg-amber-500/10 px-4 py-2 text-[11px] font-mono font-semibold rounded transition-colors">
              I understand, show me
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
      <div className="max-w-5xl mx-auto px-2 md:px-3 py-3 md:py-4">

        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold text-foreground/60 tracking-tight">
            /{channel.slug}/ — {channel.name}
          </h2>
          {channel.isMature && <span className="inline-block text-[9px] font-mono text-amber-500/60 mt-1">[ Mature Content ]</span>}
          {channel.description && (
            <p className="text-[11px] text-muted-foreground/30 font-mono mt-0.5">{channel.description}</p>
          )}
          <hr className="mt-2 border-t border-border/40" />
        </div>

        {canPost && (
          <div className="mb-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/30 mb-2">
              [ Start a New Thread ]
            </p>
            <PostForm
              isAnonymous={isAnonymous}
              isLoggedIn={isLoggedIn}
              anonymousName={anonymousName}
              setAnonymousName={setAnonymousName}
              placeholder="Write something…"
              onSubmit={onNewThread}
              sending={sending}
            />
          </div>
        )}

        <hr className="border-t border-border/40 mb-4" />

        {threads.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground/30 font-mono text-[11px]">
            [ No threads. Be the first to post. ]
          </div>
        ) : (
          <div>
            {threads.map((thread, i) => (
              <div key={thread.id}>
                <ThreadCard thread={thread} onOpen={() => onSelectThread(thread)} canModerate={canModerate}
                  onToggleHide={canModerate && onToggleHideMessage ? () => onToggleHideMessage(thread.id, !!thread.isHidden) : undefined}
                  onDelete={canModerate && onDeleteMessage ? () => onDeleteMessage(thread.id) : undefined}
                  onLookupPost={canModerate && onLookupPost && thread.posterId ? () => onLookupPost(thread.posterId!) : undefined}
                  onMassDelete={canModerate && onMassDelete && thread.posterId ? () => onMassDelete(thread.posterId!) : undefined} />
                {i < threads.length - 1 && <hr className="border-t border-border/20" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadCard({ thread, onOpen, canModerate, onToggleHide, onDelete, onLookupPost, onMassDelete }: {
  thread: Post; onOpen: () => void
  canModerate?: boolean; onToggleHide?: () => void; onDelete?: () => void
  onLookupPost?: () => void; onMassDelete?: () => void
}) {
  const lines = thread.content.split("\n")
  const preview = lines.slice(0, 6)
  const truncated = lines.length > 6
  const thumbSrc = proxyImageUrl(thread.imageUrl)

  return (
    <div className="py-4 px-2 hover:bg-muted/20 transition-colors group">
      <PostHeader post={thread} isOp />
      <div className="flex flex-col sm:flex-row gap-3 mt-1">
        {thumbSrc && (
          <div className="shrink-0">
            <button onClick={onOpen}>
          <img
            src={thumbSrc}
            alt="Thread image"
                className="w-full sm:w-[120px] h-auto sm:h-[120px] max-h-48 sm:max-h-none object-cover border border-border/40 hover:opacity-90 transition-opacity rounded-sm"
                loading="lazy"
              />
            </button>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs leading-relaxed break-words [overflow-wrap:break-word]">
            {preview.map((line, i) => renderPostLine(line, i))}
            {truncated && (
              <button onClick={onOpen} className="text-primary/50 text-[11px] font-mono hover:underline block mt-1">
                [ Read more… ]
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={onOpen}
              className="text-primary/50 text-[11px] font-mono hover:underline hover:text-primary/70 transition-colors">
              [{thread.replyCount ?? 0} replies] [View Thread]
            </button>
            {canModerate && (
              <div className="md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-2">
                {onToggleHide && (
                  <button onClick={e => { e.stopPropagation(); onToggleHide() }}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-amber-400/70 transition-colors">
                    {thread.isHidden ? "[unhide]" : "[hide]"}
                  </button>
                )}
                {onDelete && (
                  <button onClick={e => { e.stopPropagation(); onDelete() }}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/70 transition-colors">
                    [delete]
                  </button>
                )}
                {onLookupPost && (
                  <button onClick={e => { e.stopPropagation(); onLookupPost() }}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-cyan-400/70 transition-colors">
                    [ip]
                  </button>
                )}
                {onMassDelete && (
                  <button onClick={e => { e.stopPropagation(); onMassDelete() }}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-orange-400/70 transition-colors">
                    [mass]
                  </button>
                )}
              </div>
            )}
          </div>
          {thread.recentReplies && thread.recentReplies.length > 0 && (
            <div className="mt-2 pl-2 md:pl-3 border-l border-border/30 space-y-1.5">
              {thread.recentReplies.map(reply => (
                <div key={reply.id} className="text-[11px]">
                  <PostHeader post={reply} />
                  <span className="text-foreground/50 font-mono">
                    {reply.content.replace(/\n/g, " ").slice(0, 120)}
                    {reply.content.length > 120 && "…"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ThreadViewPanel({
  thread, channel, isLoggedIn, anonymousName, setAnonymousName,
  isAnonymous, canPost, canModerate, sending, onBack, onReply, onToggleHideMessage, onDeleteMessage,
  onLookupPost, onMassDelete,
}: {
  thread: ThreadView; channel: Channel; isLoggedIn: boolean
  anonymousName: string; setAnonymousName: (n: string) => void
  isAnonymous: boolean; canPost: boolean; canModerate?: boolean; sending: boolean
  onBack: () => void; onReply: (content: string, imageUrl?: string, revealIdentity?: boolean) => void
  onToggleHideMessage?: (messageId: number, currentlyHidden: boolean) => void; onDeleteMessage?: (messageId: number) => void
  onLookupPost?: (posterId: string) => void; onMassDelete?: (posterId: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [thread.replies.length])

  const [showMature, setShowMature] = useState(false)
  useEffect(() => { setShowMature(false) }, [channel.id])

  if (channel.isMature && !showMature) {
    return (
      <div className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
        <div className="max-w-lg mx-auto px-3 py-20 text-center">
          <div className="border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <TriangleAlert className="h-6 w-6 text-amber-400/80 mx-auto" />
            <h2 className="text-base font-semibold text-amber-400/80">Mature Content</h2>
            <p className="text-[12px] text-muted-foreground/60 font-mono leading-relaxed">
              This board may contain mature or NSFW content. Are you sure you want to proceed?
            </p>
            <button onClick={() => setShowMature(true)}
              className="border border-amber-500/40 text-amber-400/80 hover:bg-amber-500/10 px-4 py-2 text-[11px] font-mono font-semibold rounded transition-colors">
              I understand, show me
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-border/30 scrollbar-track-transparent">
      <div className="max-w-5xl mx-auto px-2 md:px-3 py-3 md:py-4">

        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold text-foreground/60 tracking-tight">
            /{channel.slug}/ — {channel.name}
          </h2>
          {channel.isMature && <span className="inline-block text-[9px] font-mono text-amber-500/60 mt-1">[ Mature Content ]</span>}
          <hr className="mt-2 border-t border-border/40" />
        </div>

        <div className="flex items-center gap-4 mb-4 font-mono text-[11px]">
          <button onClick={onBack}
            className="text-primary/50 hover:text-primary hover:underline transition-colors">
            [Return]
          </button>
          <span className="text-muted-foreground/30">{thread.replies.length} replies</span>
        </div>

        {canPost && (
          <div className="mb-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/30 mb-2">
              [ Post a Reply ]
            </p>
            <PostForm
              isAnonymous={isAnonymous}
              isLoggedIn={isLoggedIn}
              anonymousName={anonymousName}
              setAnonymousName={setAnonymousName}
              placeholder="Write a reply…"
              onSubmit={onReply}
              sending={sending}
            />
          </div>
        )}

        <hr className="border-t border-border/40 mb-4" />

        <div id={`p${thread.op.id}`} className="mb-3 group">
          <div className="inline-block bg-card border border-border/40 rounded p-3 max-w-full">
            <PostHeader post={thread.op} isOp />
            {thread.op.imageUrl && (() => {
              const opImg = proxyImageUrl(thread.op.imageUrl)
              const opHref = safeHrefUrl(thread.op.imageUrl)
              if (!opImg) return null
              return (
                <div className="mb-2">
                  {opHref ? (
                    <a href={opHref} target="_blank" rel="noopener noreferrer nofollow ugc">
                      <img
                        src={opImg} alt="OP image"
                        className="max-h-48 md:max-h-72 max-w-[200px] md:max-w-xs border border-border/30 object-contain hover:opacity-90 transition-opacity rounded-sm"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <img
                      src={opImg} alt="OP image"
                      className="max-h-48 md:max-h-72 max-w-[200px] md:max-w-xs border border-border/30 object-contain rounded-sm"
                      loading="lazy"
                    />
                  )}
                </div>
              )
            })()}
            <PostContent content={thread.op.content} />
            {canModerate && (
              <div className="mt-1.5 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {onToggleHideMessage && (
                  <button onClick={() => onToggleHideMessage(thread.op.id, !!thread.op.isHidden)}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-amber-400/70 transition-colors">
                    {thread.op.isHidden ? "[unhide]" : "[hide]"}
                  </button>
                )}
                {onDeleteMessage && (
                  <button onClick={() => onDeleteMessage(thread.op.id)}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/70 transition-colors">
                    [delete]
                  </button>
                )}
                {onLookupPost && thread.op.posterId && (
                  <button onClick={() => onLookupPost(thread.op.posterId!)}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-cyan-400/70 transition-colors">
                    [ip]
                  </button>
                )}
                {onMassDelete && thread.op.posterId && (
                  <button onClick={() => onMassDelete(thread.op.posterId!)}
                    className="text-[10px] font-mono text-muted-foreground/40 hover:text-orange-400/70 transition-colors">
                    [mass]
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 mt-3">
          {thread.replies.map(reply => (
            <div key={reply.id} id={`p${reply.id}`} className="ml-3 md:ml-6 group">
              <div className="bg-card border border-border/30 rounded p-3 inline-block max-w-full w-full">
                <PostHeader post={reply} />
                <PostContent content={reply.content} imageUrl={reply.imageUrl} />
                {canModerate && (
                  <div className="mt-1.5 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {onToggleHideMessage && (
                      <button onClick={() => onToggleHideMessage(reply.id, !!reply.isHidden)}
                        className="text-[10px] font-mono text-muted-foreground/40 hover:text-amber-400/70 transition-colors">
                        {reply.isHidden ? "[unhide]" : "[hide]"}
                      </button>
                    )}
                    {onDeleteMessage && (
                      <button onClick={() => onDeleteMessage(reply.id)}
                        className="text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/70 transition-colors">
                        [delete]
                      </button>
                    )}
                    {onLookupPost && reply.posterId && (
                      <button onClick={() => onLookupPost(reply.posterId!)}
                        className="text-[10px] font-mono text-muted-foreground/40 hover:text-cyan-400/70 transition-colors">
                        [ip]
                      </button>
                    )}
                    {onMassDelete && reply.posterId && (
                      <button onClick={() => onMassDelete(reply.posterId!)}
                        className="text-[10px] font-mono text-muted-foreground/40 hover:text-orange-400/70 transition-colors">
                        [mass]
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div ref={bottomRef} />

        {!canPost && (
          <div className="mt-6 text-center text-[11px] text-muted-foreground/30 font-mono">
            {isLoggedIn
              ? "[ Join this community to reply ]"
              : "[ Login required to reply to community boards ]"}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4 font-mono text-[11px]">
          <button onClick={onBack}
            className="text-primary/50 hover:text-primary hover:underline transition-colors">
            [Return]
          </button>
          <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="text-primary/50 hover:text-primary hover:underline transition-colors">
            [Bottom]
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
        className="w-full max-w-sm border border-border/60 bg-card shadow-2xl rounded-lg overflow-hidden"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/50">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 font-mono">
        {title}
      </span>
      <button onClick={onClose}
        className="text-muted-foreground/40 hover:text-foreground/60 font-mono text-[13px] leading-none transition-colors">
        [×]
      </button>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <label className="text-[11px] font-mono text-primary/50 w-24 text-right shrink-0 pt-1">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const inputCls = "border border-border/40 bg-background rounded px-2 py-1 text-[12px] font-mono text-foreground/70 w-full outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/30"

function CreateChannelModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, description: string, type: "community" | "public_anonymous") => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<"community" | "public_anonymous">("public_anonymous")
  const [creating, setCreating] = useState(false)

  async function handle() {
    if (!name.trim() || creating) return
    setCreating(true); await onCreate(name.trim(), description.trim(), type); setCreating(false)
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="New Board" onClose={onClose} />
      <div className="p-4 space-y-1">
        <ModalField label="Type">
          <div className="flex gap-3">
            {(["public_anonymous", "community"] as const).map(t => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={type === t} onChange={() => setType(t)}
                  className="accent-primary" />
                <span className="text-[11px] font-mono text-foreground/60">
                  {t === "public_anonymous" ? "Anonymous" : "Community"}
                </span>
              </label>
            ))}
          </div>
        </ModalField>
        <ModalField label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Board name" maxLength={128} className={inputCls} />
        </ModalField>
        <ModalField label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Optional" rows={2} className={`${inputCls} resize-none`} />
        </ModalField>
      </div>
      <div className="px-4 pb-4 flex gap-2 justify-end">
        <button onClick={onClose}
          className="border border-border/40 px-3 py-1.5 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/60 hover:bg-muted rounded transition-colors">
          Cancel
        </button>
        <button onClick={handle} disabled={!name.trim() || creating}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-[11px] font-mono font-semibold rounded transition-colors">
          {creating ? "Creating…" : "Create Board"}
        </button>
      </div>
    </ModalShell>
  )
}

function EditChannelModal({ channel, onClose, onSave }: {
  channel: Channel; onClose: () => void
  onSave: (data: { name?: string; slug?: string; description?: string | null; isMature?: boolean }) => void
}) {
  const [name, setName] = useState(channel.name)
  const [slug, setSlug] = useState(channel.slug)
  const [description, setDescription] = useState(channel.description || "")
  const [isMature, setIsMature] = useState(channel.isMature)
  const [saving, setSaving] = useState(false)

  async function handle() {
    if (!name.trim() || saving) return
    setSaving(true)
    const data: { name?: string; slug?: string; description?: string | null; isMature?: boolean } = {}
    if (name.trim() !== channel.name) data.name = name.trim()
    if (slug.trim() !== channel.slug) {
      const s = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64)
      if (s.length >= 1) data.slug = s
    }
    if (description.trim() !== (channel.description || "")) data.description = description.trim() || null
    if (isMature !== channel.isMature) data.isMature = isMature
    if (Object.keys(data).length === 0) { setSaving(false); onClose(); return }
    await onSave(data); setSaving(false)
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={`Edit /${channel.slug}/`} onClose={onClose} />
      <div className="p-4 space-y-1">
        <ModalField label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            maxLength={128} className={inputCls} />
        </ModalField>
        <ModalField label="Slug">
          <input type="text" value={slug} onChange={e => setSlug(e.target.value)}
            maxLength={64} className={inputCls} />
          <p className="text-[9px] text-muted-foreground/30 font-mono mt-0.5">a-z, 0-9, hyphens only</p>
        </ModalField>
        <ModalField label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows={2} className={`${inputCls} resize-none`} />
        </ModalField>
        <ModalField label="Mature Content">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isMature}
              onChange={e => setIsMature(e.target.checked)}
              className="accent-primary" />
            <span className="text-[11px] text-muted-foreground/60 font-mono">
              Mark this board as containing mature/NSFW content
            </span>
          </label>
        </ModalField>
      </div>
      <div className="px-4 pb-4 flex gap-2 justify-end">
        <button onClick={onClose}
          className="border border-border/40 px-3 py-1.5 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/60 hover:bg-muted rounded transition-colors">
          Cancel
        </button>
        <button onClick={handle} disabled={!name.trim() || saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 text-[11px] font-mono font-semibold rounded transition-colors">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </ModalShell>
  )
}

function DeleteChannelModal({ channel, onClose, onConfirm }: {
  channel: Channel; onClose: () => void; onConfirm: () => void
}) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Delete Board" onClose={onClose} />
      <div className="p-4">
        <p className="text-[12px] font-mono text-foreground/60 leading-relaxed">
          Delete <strong className="text-foreground/80">/{channel.slug}/</strong> — {channel.name}?
        </p>
        <p className="text-[11px] text-muted-foreground/40 font-mono mt-1">
          All threads will be archived. This cannot be undone.
        </p>
      </div>
      <div className="px-4 pb-4 flex gap-2 justify-end">
        <button onClick={onClose}
          className="border border-border/40 px-3 py-1.5 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/60 hover:bg-muted rounded transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 text-[11px] font-mono font-semibold rounded transition-colors">
          Delete Board
        </button>
      </div>
    </ModalShell>
  )
}