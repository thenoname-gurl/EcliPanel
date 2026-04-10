"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Bell, Check, X, Loader2, Mail, Building2, Server,
  ChevronLeft, Trash2, Tag, Eye, EyeOff, RefreshCw,
  Search, Inbox, AlertCircle, ExternalLink, Paperclip,
  FileText, Image as ImageIcon, Download, Filter,
  AlertTriangle, ShieldCheck, ToggleLeft, ToggleRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getInitials(value: string) {
  const parts = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function parseSender(value: string) {
  const m = String(value || "").match(
    /^(?:"?([^"]+)"?\s*)?<([^>]+)>$|^(?:"?([^"]+)"?\s*)?([^\s@]+@[^\s@]+)$/
  )
  if (!m) return { name: value, email: "" }
  const name = (m[1] || m[3] || "").trim()
  const email = (m[2] || m[4] || "").trim()
  return { name: name || email.split("@")[0], email }
}

function formatDate(value?: string | number) {
  const d = new Date(value || Date.now())
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (isThisYear) return d.toLocaleDateString([], { month: "short", day: "numeric" })
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function formatDateLong(value?: string | number) {
  return new Date(value || Date.now()).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function formatBytes(bytes?: number) {
  if (!bytes) return "Unknown size"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ItemType = "organisation" | "subuser" | "notification" | "email"

type Attachment = {
  filename: string
  url: string
  contentType?: string
  size?: number
  cid?: string
}

type MailboxItem = {
  id: string
  inviteId: number
  type: ItemType
  title: string
  description: string
  details: string
  sender: string
  senderEmail?: string
  html?: string | null
  attachments?: Attachment[]
  category?: string | null
  read?: boolean
  badge: string
  date: string
  rawDate: string | number | undefined
  avatarLabel: string
}

type BodyView = "plain" | "html"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-rose-500", "bg-amber-500",
  "bg-emerald-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500",
]

function avatarColor(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const TYPE_PILL: Record<ItemType, string> = {
  email: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  organisation: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  subuser: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  notification: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the srcdoc that goes inside the sandboxed iframe
// Mirrors what Gmail does:
//   • all external fetches blocked via sandbox (no allow-same-origin)
//   • cid: images rewritten to blob: or data: URLs (if content supplied)
//   • <base target="_blank"> so any link that survives opens a new tab
//   • CSP meta tag inside the document as second layer
//   • auto-resize via postMessage so no scrollbar appears inside the frame
// ─────────────────────────────────────────────────────────────────────────────

function buildIframeSrcdoc(html: string, blockRemoteImages: boolean): string {
  // Rewrite http(s) src/srcset/url() to empty so they don't load
  let sanitized = html

  if (blockRemoteImages) {
    // blank out src="http…" / src='http…'
    sanitized = sanitized.replace(
      /(<[^>]+\s(?:src|background)=["'])https?:\/\/[^"']+/gi,
      "$1",
    )
    // blank out srcset
    sanitized = sanitized.replace(
      /(<[^>]+\s(?:srcset)=["'])[^"']*/gi,
      "$1",
    )
    // blank out CSS url(http…)
    sanitized = sanitized.replace(
      /url\(\s*["']?https?:\/\/[^)"']+["']?\s*\)/gi,
      "url()",
    )
  }

  // Strip <script> entirely (belt + braces on top of sandbox)
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "")

  // Strip on* event handlers
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")

  // Ensure every <a> opens in _blank (sandbox blocks navigation anyway,
  // but this makes intent clear and works if allow-popups is later added)
  sanitized = sanitized.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",         // inline styles only — no external sheets
    blockRemoteImages
      ? "img-src data: cid:"             // only data: / cid: images
      : "img-src data: cid: https: http:",
    "font-src data:",
    "frame-src 'none'",
    "object-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
  ].join("; ")

  // The resize script runs in the same sandboxed origin (no allow-same-origin
  // means it cannot reach the parent DOM — postMessage is the only bridge).
  const resizeScript = `
    <script>
      function resize() {
        var h = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
      }
      document.addEventListener('DOMContentLoaded', resize);
      new MutationObserver(resize).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true
      });
      window.addEventListener('load', resize);
    </script>
  `

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  /* Gmail-like reset inside the frame */
  html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #202124;
    background: #fff;
    word-break: break-word;
    overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }
  a { color: #1a73e8; }
  table { max-width: 100% !important; }
  /* hide anything that tries to overflow horizontally */
  body > * { max-width: 100% !important; overflow-x: hidden !important; }
</style>
${resizeScript}
</head>
<body>
${sanitized}
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// SandboxedEmailFrame
// Renders HTML email the Gmail way:
//   sandbox="allow-popups allow-popups-to-escape-sandbox"
//     • allow-popups  → links CAN open new tabs
//     • no allow-scripts → JS inside the frame is dead
//     • no allow-same-origin → frame cannot reach parent cookies / DOM
//   Auto-resizes via postMessage so no inner scrollbar.
// ─────────────────────────────────────────────────────────────────────────────

function SandboxedEmailFrame({
  html,
  blockRemoteImages,
}: {
  html: string
  blockRemoteImages: boolean
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(400)
  const srcdoc = useMemo(
    () => buildIframeSrcdoc(html, blockRemoteImages),
    [html, blockRemoteImages],
  )

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.data &&
        typeof e.data === "object" &&
        e.data.type === "iframe-height" &&
        typeof e.data.height === "number"
      ) {
        // clamp between 120 px and 6000 px
        setHeight(Math.min(Math.max(e.data.height + 24, 120), 6000))
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  // When srcdoc changes (e.g. blockRemoteImages toggled) reset height
  useEffect(() => { setHeight(400) }, [srcdoc])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      title="Email content"
      // Gmail's actual sandbox value:
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height }}
      className="w-full border-0 block bg-white"
      // prevent the frame itself from being a tab stop
      tabIndex={-1}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────────────────────

function TypeIcon({ type, className }: { type: ItemType; className?: string }) {
  const cls = cn("h-3.5 w-3.5", className)
  if (type === "organisation") return <Building2 className={cls} />
  if (type === "subuser") return <Server className={cls} />
  if (type === "notification") return <Bell className={cls} />
  return <Mail className={cls} />
}

function AttachmentIcon({ contentType }: { contentType?: string }) {
  if (contentType?.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />
  return <FileText className="h-4 w-4 text-muted-foreground" />
}

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} />
}

// ─────────────────────────────────────────────────────────────────────────────
// SenderAvatar
// ─────────────────────────────────────────────────────────────────────────────

function SenderAvatar({
  item,
  size = "md",
}: {
  item: MailboxItem
  size?: "sm" | "md" | "lg"
}) {
  const dim =
    size === "sm" ? "h-8 w-8 text-xs"
    : size === "lg" ? "h-12 w-12 text-base"
    : "h-10 w-10 text-sm"
  const color = avatarColor(item.avatarLabel)
  const [imgFailed, setImgFailed] = useState(false)

  const avatarSrc = item.senderEmail
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(
        item.senderEmail.split("@")[0],
      )}&rounded=true&size=80&background=random`
    : null

  return (
    <div
      className={cn(
        "rounded-full flex-shrink-0 flex items-center justify-center font-semibold text-white overflow-hidden",
        dim,
        color,
      )}
    >
      {avatarSrc && !imgFailed ? (
        <img
          src={avatarSrc}
          alt={item.avatarLabel}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        getInitials(item.avatarLabel)
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ToolbarBtn
// ─────────────────────────────────────────────────────────────────────────────

function ToolbarBtn({
  icon, label, onClick, loading, destructive, active,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  loading?: boolean
  destructive?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        destructive
          ? "text-destructive hover:bg-destructive/10 active:bg-destructive/20"
          : active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80",
        loading && "opacity-50 cursor-not-allowed pointer-events-none",
      )}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentCard
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.contentType?.startsWith("image/")
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border/70 bg-background overflow-hidden transition-shadow hover:shadow-sm">
      {isImage && (
        <button
          className="w-full block"
          onClick={() => setPreviewOpen((s) => !s)}
          title={previewOpen ? "Collapse preview" : "Preview image"}
        >
          <div
            className={cn(
              "overflow-hidden bg-muted transition-all duration-300",
              previewOpen ? "h-[200px]" : "h-[72px]",
            )}
          >
            <img
              src={attachment.url}
              alt={attachment.filename}
              className="w-full h-full object-cover"
            />
          </div>
        </button>
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <AttachmentIcon contentType={attachment.contentType} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {attachment.filename}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {attachment.contentType ?? "application/octet-stream"}
            {attachment.size ? <> · {formatBytes(attachment.size)}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isImage && (
            <button
              onClick={() => setPreviewOpen((s) => !s)}
              title={previewOpen ? "Hide preview" : "Show preview"}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <a
            href={attachment.url}
            download={attachment.filename}
            target="_blank"
            rel="noreferrer noopener"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BodyViewToggle
// ─────────────────────────────────────────────────────────────────────────────

function BodyViewToggle({
  hasHtml,
  view,
  onPlain,
  onHtml,
}: {
  hasHtml: boolean
  view: BodyView
  onPlain: () => void
  onHtml: () => void
}) {
  if (!hasHtml) return null
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 w-fit">
      <button
        onClick={onPlain}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
          view === "plain"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        Plain text
      </button>
      <button
        onClick={onHtml}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
          view === "html"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <AlertCircle className="h-3 w-3" />
        HTML
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoteImagesBar  – thin banner shown when remote images are blocked
// (identical UX to Gmail's "Images are not displayed" bar)
// ─────────────────────────────────────────────────────────────────────────────

function RemoteImagesBar({
  onAllow,
  onAlwaysAllow,
}: {
  onAllow: () => void
  onAlwaysAllow: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-[#f6f8fc] dark:bg-zinc-800 border-b border-border/50 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        Images are not displayed.
      </span>
      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={onAllow}
          className="font-medium text-primary hover:underline"
        >
          Display images
        </button>
        <button
          onClick={onAlwaysAllow}
          className="font-medium text-primary hover:underline"
        >
          Always display from this sender
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MailboxPage() {
  const t = useTranslations("mailboxPage")

  // ── raw data ────────────────────────────────────────────────────────────────
  const [orgInvites, setOrgInvites] = useState<any[]>([])
  const [subuserInvites, setSubuserInvites] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [mailboxAddress, setMailboxAddress] = useState<string | null>(null)
  const [mailboxUUID, setMailboxUUID] = useState<string | null>(null)
  const [mailboxAliases, setMailboxAliases] = useState<any[]>([])

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // ── per-message HTML state ────────────────────────────────────────────────────
  // null  = user hasn't chosen yet for this message
  const [bodyView, setBodyView] = useState<BodyView | null>(null)
  const [htmlConfirmed, setHtmlConfirmed] = useState(false)
  // block remote images by default (like Gmail)
  const [blockRemoteImages, setBlockRemoteImages] = useState(true)
  // set of sender emails the user said "always allow images"
  const [alwaysAllowImages, setAlwaysAllowImages] = useState<Set<string>>(new Set())

  const [currentMessageCategory, setCurrentMessageCategory] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── data fetching ───────────────────────────────────────────────────────────

  const loadInvites = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [orgData, subData, notifData, msgData, mbData, catData] =
        await Promise.all([
          apiFetch(API_ENDPOINTS.organisationInvites),
          apiFetch(API_ENDPOINTS.serverSubuserInvites),
          apiFetch(API_ENDPOINTS.mailboxNotifications),
          apiFetch(API_ENDPOINTS.mailboxMessages),
          apiFetch(API_ENDPOINTS.mailboxAddress),
          apiFetch(API_ENDPOINTS.mailboxMessageCategories).catch(() => []),
        ])
      setOrgInvites(Array.isArray(orgData) ? orgData : [])
      setSubuserInvites(Array.isArray(subData) ? subData : [])
      setNotifications(Array.isArray(notifData) ? notifData : [])
      setMessages(Array.isArray(msgData) ? msgData : [])
      setCategories(Array.isArray(catData) ? catData : [])
      setMailboxAddress(mbData?.address ?? null)
      setMailboxUUID(mbData?.uuid ?? null)
      setMailboxAliases(Array.isArray(mbData?.aliases) ? mbData.aliases : [])
    } catch {
      setOrgInvites([]); setSubuserInvites([]); setNotifications([])
      setMessages([]); setCategories([]); setMailboxAddress(null)
      setMailboxUUID(null); setMailboxAliases([])
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadInvites() }, [loadInvites])

  // ── derived data ─────────────────────────────────────────────────────────────

  const items = useMemo<MailboxItem[]>(() => {
    const orgItems: MailboxItem[] = orgInvites.map((inv) => ({
      id: `organisation-${inv.id}`,
      inviteId: inv.id,
      type: "organisation",
      title: inv.organisationName || t("sections.organisationInviteFallback"),
      description: t("sections.organisationsDescription"),
      details: t("detail.organisationBody", {
        organisation: inv.organisationName || t("unknownOrganisation"),
        email: inv.email,
      }),
      sender: inv.organisationName || t("sections.organisations"),
      badge: t("sections.organisations"),
      date: formatDate(inv.createdAt),
      rawDate: inv.createdAt,
      avatarLabel: inv.organisationName || inv.email || "Org",
    }))

    const subItems: MailboxItem[] = subuserInvites.map((inv) => ({
      id: `subuser-${inv.id}`,
      inviteId: inv.id,
      type: "subuser",
      title: inv.serverName || inv.serverUuid || t("sections.serverSubusers"),
      description: t("sections.serverSubusersDescription"),
      details: t("detail.subuserBody", {
        server: inv.serverName || inv.serverUuid || t("detail.unknownServer"),
        email: inv.email || inv.userEmail,
      }),
      sender: inv.serverName || inv.serverUuid || t("sections.serverSubusers"),
      badge: t("sections.serverSubusers"),
      date: formatDate(inv.createdAt),
      rawDate: inv.createdAt,
      avatarLabel: inv.serverName || inv.serverUuid || "S",
    }))

    const notifItems: MailboxItem[] = notifications.map((n) => ({
      id: `notification-${n.id}`,
      inviteId: n.id,
      type: "notification",
      title: n.title,
      description: t("sections.notificationsDescription"),
      details: n.body,
      sender: t("sections.notifications"),
      badge: t("sections.notifications"),
      date: formatDate(n.createdAt),
      rawDate: n.createdAt,
      avatarLabel: n.title || t("sections.notifications"),
      read: !!n.read,
    }))

    const emailItems: MailboxItem[] = messages.map((msg) => {
      const parsed = parseSender(msg.fromAddress || "")
      return {
        id: `email-${msg.id}`,
        inviteId: msg.id,
        type: "email",
        title: msg.subject || t("detail.emailFallback"),
        description: t("sections.emailDescription"),
        details: msg.body || "",
        sender: parsed.name || msg.fromAddress,
        senderEmail: parsed.email || "",
        html: msg.html || null,
        category: msg.category || null,
        attachments: msg.attachments || [],
        read: !!msg.read,
        badge: t("sections.email"),
        date: formatDate(msg.receivedAt),
        rawDate: msg.receivedAt,
        avatarLabel: parsed.name || parsed.email || t("detail.emailFallback"),
      }
    })

    return [...emailItems, ...notifItems, ...orgItems, ...subItems].sort(
      (a, b) =>
        new Date(b.rawDate || 0).getTime() - new Date(a.rawDate || 0).getTime(),
    )
  }, [orgInvites, subuserInvites, notifications, messages, t])

  const unreadCount = useMemo(
    () =>
      items.filter(
        (i) => (i.type === "email" || i.type === "notification") && i.read === false,
      ).length,
    [items],
  )

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (
        unreadOnly &&
        (item.type === "email" || item.type === "notification") &&
        item.read
      )
        return false
      if (selectedCategory) {
        if (item.type !== "email") return false
        if (selectedCategory === "__uncategorized__") return !item.category
        return item.category === selectedCategory
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.sender.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, selectedCategory, unreadOnly, searchQuery])

  const selectedItem = useMemo(
    () => filteredItems.find((i) => i.id === selectedItemId) ?? null,
    [filteredItems, selectedItemId],
  )

  // auto-select first on desktop
  useEffect(() => {
    if (!selectedItemId && filteredItems.length > 0) {
      setSelectedItemId(filteredItems[0].id)
    }
  }, [filteredItems, selectedItemId])

  // reset per-message state on selection change
  useEffect(() => {
    setBodyView(null)
    setHtmlConfirmed(false)
    setCurrentMessageCategory(
      selectedItem?.type === "email" ? selectedItem.category ?? null : null,
    )
    // auto-unblock images if sender is in always-allow list
    if (selectedItem?.senderEmail && alwaysAllowImages.has(selectedItem.senderEmail)) {
      setBlockRemoteImages(false)
    } else {
      setBlockRemoteImages(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id])

  // ── actions ──────────────────────────────────────────────────────────────────

  const setLoading_ = (key: string, val: boolean) =>
    setActionLoading((p) => ({ ...p, [key]: val }))

  const handleInviteAction = async (
    type: "organisation" | "subuser",
    inviteId: number,
    action: "accept" | "reject",
  ) => {
    const key = `${type}-${inviteId}`
    setLoading_(key, true)
    try {
      const ep =
        type === "organisation"
          ? action === "accept"
            ? API_ENDPOINTS.organisationInviteAccept
            : API_ENDPOINTS.organisationInviteReject
          : action === "accept"
          ? API_ENDPOINTS.serverSubuserInviteAccept
          : API_ENDPOINTS.serverSubuserInviteReject
      await apiFetch(ep.replace(":inviteId", String(inviteId)), { method: "POST" })
      await loadInvites()
    } catch (e: any) {
      alert(e?.message || t("errors.failedAction"))
    } finally {
      setLoading_(key, false)
    }
  }

  const handleMarkRead = async (item: MailboxItem) => {
    const key = `item-mark-${item.type}-${item.inviteId}`
    setLoading_(key, true)
    try {
      const target =
        item.type === "notification"
          ? API_ENDPOINTS.mailboxNotificationMark.replace(":id", String(item.inviteId))
          : API_ENDPOINTS.mailboxMessageMark.replace(":id", String(item.inviteId))
      await apiFetch(target, { method: "POST", body: { read: !item.read } })
      await loadInvites()
    } catch {
      alert(t("errors.failedAction"))
    } finally {
      setLoading_(key, false)
    }
  }

  const handleDelete = async (item: MailboxItem) => {
    if (!confirm(t("confirm.deleteEmail"))) return
    const key = `item-delete-${item.type}-${item.inviteId}`
    setLoading_(key, true)
    try {
      const target =
        item.type === "notification"
          ? API_ENDPOINTS.mailboxNotificationDelete.replace(":id", String(item.inviteId))
          : API_ENDPOINTS.mailboxMessageDelete.replace(":id", String(item.inviteId))
      await apiFetch(target, { method: "DELETE" })
      setSelectedItemId(null)
      setMobileView("list")
      await loadInvites()
    } catch {
      alert(t("errors.failedAction"))
    } finally {
      setLoading_(key, false)
    }
  }

  const handleAssignCategory = async (item: MailboxItem) => {
    const key = `email-category-${item.inviteId}`
    setLoading_(key, true)
    try {
      await apiFetch(
        API_ENDPOINTS.mailboxMessageCategory.replace(":id", String(item.inviteId)),
        { method: "POST", body: { category: currentMessageCategory || null } },
      )
      await loadInvites()
    } catch {
      alert(t("errors.failedAction"))
    } finally {
      setLoading_(key, false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST PANE
  // ─────────────────────────────────────────────────────────────────────────────

  const ListPane = (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-10",
              "text-sm placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background",
              "transition-all duration-200",
            )}
          />
          <button
            onClick={() => setShowFilters((s) => !s)}
            title="Filters"
            className={cn(
              "absolute right-2 p-1.5 rounded-lg transition-colors",
              showFilters || selectedCategory || unreadOnly
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          showFilters ? "max-h-40" : "max-h-0",
        )}
      >
        <div className="px-3 pb-2 space-y-2">
          <button
            onClick={() => setUnreadOnly((s) => !s)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
              unreadOnly
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border bg-muted/30 text-foreground hover:bg-muted/60",
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              {unreadOnly ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              Unread only
            </span>
            {unreadCount > 0 && (
              <Badge className="h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                {unreadCount}
              </Badge>
            )}
          </button>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  !selectedCategory
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/40">
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
          {filteredItems.length} {t("summary.filteredItems")}
        </span>
        <button
          onClick={() => loadInvites(true)}
          disabled={refreshing}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Spinner className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 px-6 text-center">
            <div className="rounded-full bg-muted p-5">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("list.empty")}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t("list.emptyDescription")}
              </p>
            </div>
            {(searchQuery || selectedCategory || unreadOnly) && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedCategory(null)
                  setUnreadOnly(false)
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="py-1">
            {filteredItems.map((item) => {
              const isSelected = selectedItemId === item.id
              const isUnread =
                (item.type === "email" || item.type === "notification") &&
                item.read === false
              const hasAttachments = (item.attachments?.length ?? 0) > 0

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id)
                    setMobileView("detail")
                  }}
                  className={cn(
                    "w-full text-left px-3 py-3 transition-colors relative group",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                    isSelected
                      ? "bg-primary/8 dark:bg-primary/12"
                      : "hover:bg-muted/50 active:bg-muted/80",
                  )}
                >
                  {isSelected && (
                    <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <div className="flex items-start gap-3 pl-1">
                    <SenderAvatar item={item} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            isUnread
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/75",
                          )}
                        >
                          {item.sender}
                        </span>
                        <span
                          className={cn(
                            "flex-shrink-0 text-[11px] tabular-nums",
                            isUnread ? "font-semibold text-primary" : "text-muted-foreground",
                          )}
                        >
                          {item.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isUnread && (
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                        )}
                        <p
                          className={cn(
                            "truncate text-[13px] leading-snug",
                            isUnread
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {item.title}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] text-muted-foreground/70 leading-snug flex-1">
                          {item.details.slice(0, 100)}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasAttachments && (
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              TYPE_PILL[item.type],
                            )}
                          >
                            <TypeIcon type={item.type} />
                            <span className="hidden sm:inline">{item.badge}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL PANE
  // ─────────────────────────────────────────────────────────────────────────────

  const hasHtml = Boolean(selectedItem?.html)
  const resolvedView: BodyView = bodyView ?? "plain"

  const handleChooseHtml = () => {
    setHtmlConfirmed(true)
    setBodyView("html")
  }

  const handleChoosePlain = () => {
    setBodyView("plain")
  }

  const DetailPane = (
    <div className="flex h-full flex-col">
      {selectedItem ? (
        <>
          {/* toolbar */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-background/80 backdrop-blur-sm">
            <button
              onClick={() => setMobileView("list")}
              className="lg:hidden p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Back to list"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 flex-1">
              {(selectedItem.type === "email" || selectedItem.type === "notification") && (
                <>
                  <ToolbarBtn
                    icon={
                      selectedItem.read ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )
                    }
                    label={selectedItem.read ? t("actions.markUnread") : t("actions.markRead")}
                    loading={actionLoading[`item-mark-${selectedItem.type}-${selectedItem.inviteId}`]}
                    onClick={() => handleMarkRead(selectedItem)}
                  />
                  <ToolbarBtn
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label={t("actions.delete")}
                    loading={actionLoading[`item-delete-${selectedItem.type}-${selectedItem.inviteId}`]}
                    onClick={() => handleDelete(selectedItem)}
                    destructive
                  />
                </>
              )}
            </div>

            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium flex-shrink-0",
                TYPE_PILL[selectedItem.type],
              )}
            >
              <TypeIcon type={selectedItem.type} />
              <span className="hidden sm:inline">{selectedItem.badge}</span>
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-4 sm:px-6 py-6 space-y-5 max-w-3xl mx-auto">

              {/* subject */}
              <h1 className="text-xl font-bold text-foreground leading-tight tracking-tight">
                {selectedItem.title}
              </h1>

              {/* sender card */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50">
                <SenderAvatar item={selectedItem} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {selectedItem.sender}
                  </p>
                  {selectedItem.senderEmail && (
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedItem.senderEmail}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {formatDateLong(selectedItem.rawDate)}
                  </p>
                  {(selectedItem.attachments?.length ?? 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-end gap-1">
                      <Paperclip className="h-3 w-3" />
                      {selectedItem.attachments!.length} attachment
                      {selectedItem.attachments!.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>

              <hr className="border-border/50" />

              {/* ── BODY ── */}
              {selectedItem.type === "email" && hasHtml && bodyView === null ? (
                // ── choice screen ──
                <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                  <div className="p-4 space-y-3">
                    <p className="text-sm font-semibold text-foreground">
                      How would you like to view this email?
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This message has both plain text and HTML versions.
                      HTML may contain tracking pixels and external resources.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        onClick={handleChoosePlain}
                        className={cn(
                          "flex-1 flex items-center gap-3 rounded-xl border-2 border-border px-4 py-3.5",
                          "hover:border-primary/40 hover:bg-primary/5 transition-all text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        )}
                      >
                        <div className="rounded-lg bg-muted p-2 flex-shrink-0">
                          <FileText className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Plain text</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Safe · No remote content
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={handleChooseHtml}
                        className={cn(
                          "flex-1 flex items-center gap-3 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 px-4 py-3.5",
                          "hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40",
                        )}
                      >
                        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2 flex-shrink-0">
                          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">HTML version</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Richer view · Remote images blocked by default
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                  {/* plain-text preview */}
                  <div className="border-t border-border/50 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                      Preview
                    </p>
                    <p className="text-sm leading-7 text-foreground/80 whitespace-pre-wrap line-clamp-6">
                      {selectedItem.details || (
                        <span className="italic text-muted-foreground">(empty)</span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                // ── chosen view ──
                <div className="space-y-4">
                  {/* view toggle tabs */}
                  {hasHtml && bodyView !== null && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <BodyViewToggle
                        hasHtml={hasHtml}
                        view={resolvedView}
                        onPlain={() => setBodyView("plain")}
                        onHtml={() => {
                          if (!htmlConfirmed) handleChooseHtml()
                          else setBodyView("html")
                        }}
                      />
                      {resolvedView === "html" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            window.open(
                              "data:text/html," +
                                encodeURIComponent(selectedItem.html || ""),
                              "_blank",
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open raw
                        </Button>
                      )}
                    </div>
                  )}

                  {/* plain */}
                  {resolvedView === "plain" && (
                    <div className="text-sm leading-7 text-foreground/90 whitespace-pre-wrap">
                      {selectedItem.details || (
                        <span className="text-muted-foreground italic">
                          (no plain text content)
                        </span>
                      )}
                    </div>
                  )}

                  {/* HTML — sandboxed iframe (Gmail approach) */}
                  {resolvedView === "html" && htmlConfirmed && selectedItem.html && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      {/* remote-images bar (exact Gmail UX) */}
                      {blockRemoteImages && (
                        <RemoteImagesBar
                          onAllow={() => setBlockRemoteImages(false)}
                          onAlwaysAllow={() => {
                            setBlockRemoteImages(false)
                            if (selectedItem.senderEmail) {
                              setAlwaysAllowImages((s) => {
                                const next = new Set(s)
                                next.add(selectedItem.senderEmail!)
                                return next
                              })
                            }
                          }}
                        />
                      )}
                      {/* the actual sandboxed frame */}
                      <SandboxedEmailFrame
                        html={selectedItem.html}
                        blockRemoteImages={blockRemoteImages}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* attachments */}
              {(selectedItem.attachments?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Attachments ({selectedItem.attachments!.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {selectedItem.attachments!.map((att) => (
                      <AttachmentCard key={att.url} attachment={att} />
                    ))}
                  </div>
                </div>
              )}

              {/* actions panel */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {selectedItem.type === "organisation" || selectedItem.type === "subuser"
                    ? "Respond to invite"
                    : t("details.actions")}
                </p>

                {selectedItem.type === "email" || selectedItem.type === "notification" ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={selectedItem.read ? "outline" : "default"}
                        className="gap-2 h-8 text-xs"
                        onClick={() => handleMarkRead(selectedItem)}
                        disabled={
                          actionLoading[
                            `item-mark-${selectedItem.type}-${selectedItem.inviteId}`
                          ]
                        }
                      >
                        {actionLoading[
                          `item-mark-${selectedItem.type}-${selectedItem.inviteId}`
                        ] ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {selectedItem.read ? t("actions.markUnread") : t("actions.markRead")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(selectedItem)}
                        disabled={
                          actionLoading[
                            `item-delete-${selectedItem.type}-${selectedItem.inviteId}`
                          ]
                        }
                      >
                        {actionLoading[
                          `item-delete-${selectedItem.type}-${selectedItem.inviteId}`
                        ] ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {t("actions.delete")}
                      </Button>
                    </div>

                    {selectedItem.type === "email" && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                          <Tag className="h-3 w-3" />
                          Category
                        </label>
                        <div className="flex gap-2">
                          <select
                            className={cn(
                              "flex-1 rounded-lg border border-border bg-background",
                              "px-3 py-1.5 text-sm text-foreground",
                              "focus:outline-none focus:ring-2 focus:ring-primary/30",
                            )}
                            value={currentMessageCategory ?? ""}
                            onChange={(e) => setCurrentMessageCategory(e.target.value || null)}
                          >
                            <option value="">{t("filters.uncategorized")}</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            className="h-9 text-xs px-3 flex-shrink-0"
                            onClick={() => handleAssignCategory(selectedItem)}
                            disabled={actionLoading[`email-category-${selectedItem.inviteId}`]}
                          >
                            {actionLoading[`email-category-${selectedItem.inviteId}`] ? (
                              <Spinner className="h-3.5 w-3.5" />
                            ) : (
                              t("actions.assignCategory")
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-2 h-8 text-xs"
                      onClick={() =>
                        handleInviteAction(
                          selectedItem.type as any,
                          selectedItem.inviteId,
                          "accept",
                        )
                      }
                      disabled={actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`]}
                    >
                      {actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`] ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t("actions.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 h-8 text-xs"
                      onClick={() =>
                        handleInviteAction(
                          selectedItem.type as any,
                          selectedItem.inviteId,
                          "reject",
                        )
                      }
                      disabled={actionLoading[`${selectedItem.type}-${selectedItem.inviteId}`]}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("actions.reject")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="rounded-full bg-muted p-6 ring-8 ring-muted/40">
            <Mail className="h-9 w-9 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t("details.selectItem")}</p>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs leading-relaxed">
              {t("details.selectItemDescription")}
            </p>
          </div>
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Layout
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PanelHeader title={t("title")} description={t("description")} />

      {(mailboxAddress || mailboxUUID) && (
        <div className="border-b border-border/60 bg-muted/30 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[220px] sm:max-w-sm">
                {mailboxUUID || mailboxAddress}
              </span>
            </div>
            {mailboxAliases.map((alias, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {alias.address}
                </span>
                {alias.canSendFrom && (
                  <Badge
                    variant="outline"
                    className="h-4 px-1.5 text-[10px] text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700"
                  >
                    Send
                  </Badge>
                )}
              </div>
            ))}
            {unreadCount > 0 && (
              <Badge className="ml-auto h-5 px-2 text-[11px] bg-primary text-primary-foreground">
                {unreadCount} unread
              </Badge>
            )}
          </div>
        </div>
      )}

      <div
        className="flex flex-1 overflow-hidden"
        style={{ height: "calc(100vh - 120px)" }}
      >
        {/* LIST */}
        <div
          className={cn(
            "flex-shrink-0 border-r border-border/60 bg-background",
            "w-full lg:w-[340px] xl:w-[380px]",
            mobileView === "detail"
              ? "hidden lg:flex lg:flex-col"
              : "flex flex-col",
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                {t("sections.inbox")}
              </h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0 text-[11px] font-semibold text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
          {ListPane}
        </div>

        {/* DETAIL */}
        <div
          className={cn(
            "flex-1 bg-background min-w-0",
            mobileView === "list"
              ? "hidden lg:flex lg:flex-col"
              : "flex flex-col",
          )}
        >
          {DetailPane}
        </div>
      </div>
    </div>
  )
}