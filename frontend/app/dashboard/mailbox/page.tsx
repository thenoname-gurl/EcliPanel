"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Bell, Check, X, Loader2, Mail, Building2, Server,
  ChevronLeft, Trash2, Tag, Eye, EyeOff, RefreshCw,
  Search, Inbox, AlertCircle, ExternalLink, Paperclip,
  FileText, Image as ImageIcon, Download, Filter,
  AlertTriangle, ToggleLeft, ToggleRight, ChevronDown,
  ChevronRight, Shield, ShieldAlert, AtSign, Clock,
  Hash, Copy, Check as CheckIcon, Send,
  Star, StarOff, Bold, Italic, Strikethrough, List,
  ListOrdered, Link, Quote, Code, Heading1, Heading2,
  Minus, Keyboard,
} from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
    weekday: "short", month: "long", day: "numeric",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function formatDateRelative(value?: string | number) {
  const d = new Date(value || Date.now())
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(value)
}

function formatBytes(bytes?: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatHeaderSource(value: any): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parsePriorityHeader(headers: any): string | null {
  if (!headers) return null
  const raw = headers.priority || headers['x-priority'] || headers.importance
  if (!raw) return null
  const normalized = String(raw).trim().toLowerCase()
  if (/urgent/i.test(normalized)) return 'Urgent'
  if (/^1(?:\s*\(|\s*$)/.test(normalized) || /^2(?:\s*\(|\s*$)/.test(normalized) || /high|highest/i.test(normalized)) return 'High'
  if (/^3(?:\s*\(|\s*$)/.test(normalized) || /normal|medium/i.test(normalized)) return 'Normal'
  if (/^4(?:\s*\(|\s*$)/.test(normalized) || /^5(?:\s*\(|\s*$)/.test(normalized) || /low|lowest/i.test(normalized)) return 'Low'
  if (normalized.includes('high')) return 'High'
  if (normalized.includes('normal') || normalized.includes('medium')) return 'Normal'
  if (normalized.includes('low')) return 'Low'
  return String(raw).trim()
}

// Simple markdown → HTML (no external deps)
function markdownToHtml(md: string): string {
  if (!md.trim()) return ""
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const lines = escaped.split("\n")
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeList = () => {
    if (inUl) { out.push("</ul>"); inUl = false }
    if (inOl) { out.push("</ol>"); inOl = false }
  }

  const inlineFormat = (line: string) =>
    line
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<s>$1</s>")
      .replace(/`([^`]+)`/g, "<code style=\"background:hsl(var(--card));padding:1px 5px;border-radius:4px;font-size:0.875em\">$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(var(--primary))">$1</a>')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const raw = line.trimStart()

    if (/^#{3}\s/.test(raw)) {
      closeList()
      out.push(`<h3 style="font-size:1em;font-weight:700;margin:12px 0 4px">${inlineFormat(raw.slice(4))}</h3>`)
    } else if (/^#{2}\s/.test(raw)) {
      closeList()
      out.push(`<h2 style="font-size:1.15em;font-weight:700;margin:14px 0 4px">${inlineFormat(raw.slice(3))}</h2>`)
    } else if (/^#\s/.test(raw)) {
      closeList()
      out.push(`<h1 style="font-size:1.3em;font-weight:700;margin:16px 0 6px">${inlineFormat(raw.slice(2))}</h1>`)
    } else if (/^>\s/.test(raw)) {
      closeList()
      out.push(`<blockquote style="border-left:3px solid hsl(var(--border));margin:4px 0;padding:2px 12px;color:hsl(var(--foreground))">${inlineFormat(raw.slice(2))}</blockquote>`)
    } else if (/^---$/.test(raw)) {
      closeList()
      out.push(`<hr style="border:none;border-top:1px solid hsl(var(--border));margin:12px 0">`)
    } else if (/^[-*]\s/.test(raw)) {
      if (!inUl) { if (inOl) { out.push("</ol>"); inOl = false } out.push("<ul style=\"margin:4px 0;padding-left:1.5rem\">"); inUl = true }
      out.push(`<li>${inlineFormat(raw.slice(2))}</li>`)
    } else if (/^\d+\.\s/.test(raw)) {
      if (!inOl) { if (inUl) { out.push("</ul>"); inUl = false } out.push("<ol style=\"margin:4px 0;padding-left:1.5rem\">"); inOl = true }
      out.push(`<li>${inlineFormat(raw.replace(/^\d+\.\s/, ""))}</li>`)
    } else if (raw === "") {
      closeList()
      out.push("<br>")
    } else {
      closeList()
      out.push(`<p style="margin:4px 0">${inlineFormat(raw)}</p>`)
    }
  }
  closeList()
  return out.join("\n")
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
  isSpam?: boolean
  spamScore?: number | null
  isVirus?: boolean
  virusName?: string | null
  rawHeaders?: string | null
  headers?: Record<string, any> | null
  senderIp?: string | null
  senderRdns?: string | null
  spfResult?: string | null
  dkimResult?: string | null
  dmarcResult?: string | null
  priority?: string | null
  authResults?: string | null
  receivedChain?: Array<{ from?: string; by?: string; with?: string; id?: string; for?: string; ip?: string; raw?: string }>
  toAddress?: string
  messageId?: string | null
  encryptionType?: string | null
  read?: boolean
  favorite?: boolean
  status?: string | null
  sentAt?: string | null
  scheduledAt?: string | null
  isSent?: boolean
  badge: string
  date: string
  rawDate: string | number | undefined
  avatarLabel: string
}

type BodyView = "plain" | "html"
type EditorMode = "write" | "preview"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const TYPE_CONFIG: Record<ItemType, { pill: string; icon: React.ReactNode; label: string; color: string }> = {
  email: {
    pill: "bg-primary/10 text-primary",
    icon: <Mail className="h-3 w-3" />,
    label: "Email",
    color: "text-primary",
  },
  organisation: {
    pill: "bg-accent/30 text-accent-foreground",
    icon: <Building2 className="h-3 w-3" />,
    label: "Organisation",
    color: "text-accent-foreground",
  },
  subuser: {
    pill: "bg-secondary text-secondary-foreground",
    icon: <Server className="h-3 w-3" />,
    label: "Server",
    color: "text-secondary-foreground",
  },
  notification: {
    pill: "bg-muted text-muted-foreground",
    icon: <Bell className="h-3 w-3" />,
    label: "Notification",
    color: "text-muted-foreground",
  },
}

function avatarColorHex(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 58%, 45%)`
}

async function md5Hex(value: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32)
}

function getCssVar(name: string): string {
  if (typeof document === "undefined") return ""
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function createAvatarDataUrl(label: string, size = 96) {
  const initials = getInitials(label)
  const bg = avatarColorHex(label)
  const fs = Math.floor(size * 0.4)
  const fg = getCssVar("--foreground") ? `hsl(${getCssVar("--foreground")})` : "#e8e4f0"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" rx="${Math.floor(size * 0.3)}" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="${fg}">${initials}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// iframe srcdoc builder
// ─────────────────────────────────────────────────────────────────────────────

function buildIframeSrcdoc(html: string, blockRemoteImages: boolean): string {
  let sanitized = html
  if (blockRemoteImages) {
    sanitized = sanitized.replace(/(<[^>]+\s(?:src|background)=["'])https?:\/\/[^"']+/gi, "$1")
    sanitized = sanitized.replace(/(<[^>]+\s(?:srcset)=["'])[^"']*/gi, "$1")
    sanitized = sanitized.replace(/url\s*\(\s*["']?https?:\/\/[^)"']+["']?\s*\)/gi, "url()")
  }
  let previousSanitized: string
  do {
    previousSanitized = sanitized
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "")
  } while (sanitized !== previousSanitized)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
  sanitized = sanitized.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    blockRemoteImages ? "img-src data: cid:" : "img-src data: cid: https: http:",
    "font-src data:",
    "frame-src 'none'",
    "object-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
  ].join("; ")

  // Read CSS variables at build time so the iframe inherits theme colors
  const fgColor = getCssVar("--foreground") ? `hsl(${getCssVar("--foreground")})` : "#e8e4f0"
  const bgColor = getCssVar("--background") ? `hsl(${getCssVar("--background")})` : "#0a0a12"
  const primaryColor = getCssVar("--primary") ? `hsl(${getCssVar("--primary")})` : "#8b5cf6"
  const borderColor = getCssVar("--border") ? `hsl(${getCssVar("--border")})` : "#2a2545"

  const resizeScript = `<script>function resize(){var h=document.documentElement.scrollHeight;window.parent.postMessage({type:'iframe-height',height:h},'*')}document.addEventListener('DOMContentLoaded',resize);new MutationObserver(resize).observe(document.documentElement,{childList:true,subtree:true,attributes:true});window.addEventListener('load',resize);</script>`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:16px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.65;color:${fgColor};background:${bgColor};word-break:break-word;overflow-x:hidden}img{max-width:100%;height:auto}a{color:${primaryColor}}table{max-width:100%!important}*{max-width:100%!important}blockquote{border-left:3px solid ${borderColor};padding-left:12px;margin:8px 0}hr{border:none;border-top:1px solid ${borderColor}}</style>${resizeScript}</head><body>${sanitized}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// SandboxedEmailFrame
// ─────────────────────────────────────────────────────────────────────────────

function SandboxedEmailFrame({ html, blockRemoteImages }: { html: string; blockRemoteImages: boolean }) {
  const [height, setHeight] = useState(300)
  const srcdoc = useMemo(() => buildIframeSrcdoc(html, blockRemoteImages), [html, blockRemoteImages])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "iframe-height" && typeof e.data.height === "number") {
        setHeight(Math.min(Math.max(e.data.height + 32, 120), 8000))
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  useEffect(() => { setHeight(300) }, [srcdoc])

  return (
    <iframe
      srcDoc={srcdoc}
      title="Email content"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height }}
      className="w-full border-0 block"
      tabIndex={-1}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} />
}

// Simple address input supporting multiple recipients (chips)
function AddressInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addFromInput = (val?: string) => {
    const raw = (val ?? input).trim()
    if (!raw) return
    const parts = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    const next = Array.from(new Set([...values, ...parts]))
    onChange(next)
    setInput("")
  }

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div className="flex flex-wrap gap-1 flex-1">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-sm">
            <span className="truncate max-w-xs">{v}</span>
            <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))} className="p-0.5 rounded text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={el => inputRef.current = el}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput() }
            if (e.key === 'Backspace' && input === '' && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => addFromInput()}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: ItemType }) {
  const cfg = TYPE_CONFIG[type]
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border border-border/20",
      cfg.pill,
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <CheckIcon className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SenderAvatar
// ─────────────────────────────────────────────────────────────────────────────

function SenderAvatar({ item, size = "md" }: { item: MailboxItem; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 36 : size === "lg" ? 56 : 44
  const cls = size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm"
  const emailForHash = (item.senderEmail || "").trim().toLowerCase()
  const fallback = createAvatarDataUrl(item.senderEmail?.split("@")[0] || item.avatarLabel, dim * 2)
  const [src, setSrc] = useState(fallback)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setFailed(false)
    setSrc(fallback)
    if (!emailForHash) return
    md5Hex(emailForHash).then(hash => {
      if (active) setSrc(`https://www.gravatar.com/avatar/${hash}?d=404&s=${dim * 2}`)
    }).catch(() => { if (active) setSrc(fallback) })
    return () => { active = false }
  }, [emailForHash, fallback, dim])

  return (
    <div className={cn("rounded-full flex-shrink-0 overflow-hidden ring-2 ring-border/50", cls)}>
      <img
        src={failed ? fallback : src}
        alt={item.avatarLabel}
        className="w-full h-full object-cover"
        onError={() => { if (!failed) setFailed(true) }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentCard
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.contentType?.startsWith("image/")
  const isPdf = attachment.contentType === "application/pdf"
  const [preview, setPreview] = useState(false)

  return (
    <div className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all duration-150">
      {isImage && preview && (
        <div
          className="relative border-b border-border cursor-zoom-out overflow-hidden rounded-t-xl bg-muted/30"
          onClick={() => setPreview(false)}
        >
          <img src={attachment.url} alt={attachment.filename} className="w-full max-h-64 object-contain" />
        </div>
      )}
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div className={cn(
          "rounded-lg p-2 flex-shrink-0 transition-colors",
          isImage ? "bg-primary/10 text-primary" :
            isPdf ? "bg-destructive/10 text-destructive" :
              "bg-muted text-muted-foreground",
        )}>
          {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate leading-tight">{attachment.filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {formatBytes(attachment.size)}
            {attachment.contentType && (
              <>
                <span className="inline-block w-0.5 h-0.5 rounded-full bg-muted-foreground/40" />
                <span className="uppercase">{attachment.contentType.split("/")[1]}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isImage && (
            <button
              onClick={() => setPreview(s => !s)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            >
              {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <a href={attachment.url} download={attachment.filename} target="_blank" rel="noreferrer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MetadataRow
// ─────────────────────────────────────────────────────────────────────────────

function MetadataRow({ label, value, mono = false, copyable = false }: {
  label: string
  value: string | number | boolean | null | undefined
  mono?: boolean
  copyable?: boolean
}) {
  if (value === null || value === undefined || value === "") return null
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5 font-medium">{label}</span>
      <div className="flex items-start gap-1 flex-1 min-w-0">
        <span className={cn(
          "text-xs text-foreground/90 break-all leading-relaxed flex-1",
          mono && "font-mono bg-muted/40 px-1.5 py-0.5 rounded text-[11px]",
        )}>
          {display}
        </span>
        {copyable && <CopyButton value={display} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SecurityBadge
// ─────────────────────────────────────────────────────────────────────────────

function SecurityBadge({ item }: { item: MailboxItem }) {
  if (item.isVirus) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-destructive">Virus detected</p>
          {item.virusName && <p className="text-[11px] text-destructive/80 mt-0.5">{item.virusName}</p>}
        </div>
      </div>
    )
  }
  if (item.isSpam) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-accent/30 border border-accent/40 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-accent-foreground flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-accent-foreground">Likely spam</p>
          {item.spamScore != null && (
            <p className="text-[11px] text-accent-foreground/80 mt-0.5">Score: {item.spamScore}</p>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
      <Shield className="h-4 w-4 text-primary flex-shrink-0" />
      <p className="text-xs font-semibold text-primary">No threats detected</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoteImagesBar
// ─────────────────────────────────────────────────────────────────────────────

function RemoteImagesBar({ onAllow, onAlwaysAllow }: { onAllow: () => void; onAlwaysAllow: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 bg-accent/20 border-b border-accent/30">
      <div className="flex items-center gap-1.5 text-xs text-accent-foreground">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        Remote images are blocked for privacy
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <button onClick={onAllow} className="text-xs font-semibold text-accent-foreground hover:underline underline-offset-2">
          Show once
        </button>
        <button onClick={onAlwaysAllow} className="text-xs font-semibold text-accent-foreground hover:underline underline-offset-2">
          Always allow from sender
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Toolbar Action types
// ─────────────────────────────────────────────────────────────────────────────

type ToolbarAction = {
  icon: React.ReactNode
  label: string
  action: "wrap" | "line-prefix" | "insert" | "link"
  prefix?: string
  suffix?: string
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", action: "wrap", prefix: "**", suffix: "**" },
    { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", action: "wrap", prefix: "*", suffix: "*" },
    { icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strikethrough", action: "wrap", prefix: "~~", suffix: "~~" },
  ],
  [
    { icon: <Heading1 className="h-3.5 w-3.5" />, label: "Heading 1", action: "line-prefix", prefix: "# " },
    { icon: <Heading2 className="h-3.5 w-3.5" />, label: "Heading 2", action: "line-prefix", prefix: "## " },
    { icon: <Quote className="h-3.5 w-3.5" />, label: "Blockquote", action: "line-prefix", prefix: "> " },
  ],
  [
    { icon: <List className="h-3.5 w-3.5" />, label: "Bullet list", action: "line-prefix", prefix: "- " },
    { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered list", action: "line-prefix", prefix: "1. " },
  ],
  [
    { icon: <Code className="h-3.5 w-3.5" />, label: "Inline code", action: "wrap", prefix: "`", suffix: "`" },
    { icon: <Link className="h-3.5 w-3.5" />, label: "Link", action: "link" },
    { icon: <Minus className="h-3.5 w-3.5" />, label: "Divider", action: "insert", prefix: "\n---\n" },
  ],
]

function applyMarkdownAction(
  textarea: HTMLTextAreaElement,
  toolbarAction: ToolbarAction,
  setValue: (v: string) => void,
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.substring(start, end)
  let newValue = value
  let newStart = start
  let newEnd = end

  if (toolbarAction.action === "wrap" && toolbarAction.prefix && toolbarAction.suffix) {
    const pre = toolbarAction.prefix
    const suf = toolbarAction.suffix
    newValue = value.substring(0, start) + pre + selected + suf + value.substring(end)
    newStart = start + pre.length
    newEnd = end + pre.length
  } else if (toolbarAction.action === "line-prefix" && toolbarAction.prefix) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1
    const pre = toolbarAction.prefix
    const alreadyHas = value.substring(lineStart).startsWith(pre)
    if (alreadyHas) {
      newValue = value.substring(0, lineStart) + value.substring(lineStart + pre.length)
      newStart = Math.max(lineStart, start - pre.length)
      newEnd = Math.max(lineStart, end - pre.length)
    } else {
      newValue = value.substring(0, lineStart) + pre + value.substring(lineStart)
      newStart = start + pre.length
      newEnd = end + pre.length
    }
  } else if (toolbarAction.action === "insert" && toolbarAction.prefix) {
    newValue = value.substring(0, start) + toolbarAction.prefix + value.substring(end)
    newStart = newEnd = start + toolbarAction.prefix.length
  } else if (toolbarAction.action === "link") {
    const linkText = selected || "Link text"
    const insertion = `[${linkText}](url)`
    newValue = value.substring(0, start) + insertion + value.substring(end)
    newStart = start + linkText.length + 3
    newEnd = newStart + 3
  }

  setValue(newValue)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(newStart, newEnd)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// RichComposer
// ─────────────────────────────────────────────────────────────────────────────

function RichComposer({
  value,
  onChange,
  placeholder = "Write your message…",
  minRows = 12,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>("write")
  const wordCount = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = value.length
  const previewHtml = useMemo(() => markdownToHtml(value), [value])

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newValue = ta.value.substring(0, start) + "  " + ta.value.substring(end)
      onChange(newValue)
      requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2))
    }
  }

  const applyAction = (action: ToolbarAction) => {
    if (!textareaRef.current) return
    applyMarkdownAction(textareaRef.current, action, onChange)
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/10 flex-wrap">
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-3.5 bg-border/60 mx-1 flex-shrink-0" />}
            {group.map(action => (
              <button
                key={action.label}
                type="button"
                title={action.label}
                onClick={() => applyAction(action)}
                disabled={editorMode === "preview"}
                className={cn(
                  "p-1.5 rounded text-muted-foreground transition-colors",
                  editorMode === "preview"
                    ? "opacity-30 cursor-not-allowed"
                    : "hover:text-foreground hover:bg-muted/20",
                )}
              >
                {action.icon}
              </button>
            ))}
          </div>
        ))}

        <div className="flex-1" />

        <div className="flex items-center rounded-lg bg-muted/10 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setEditorMode("write")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              editorMode === "write"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Keyboard className="h-3 w-3" />
            Write
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              editorMode === "preview"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Editor area */}
      {editorMode === "write" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleTabKey}
          placeholder={placeholder}
          rows={minRows}
          spellCheck
          className="w-full px-3 py-2 text-sm text-foreground bg-transparent resize-none outline-none placeholder:text-muted-foreground leading-relaxed"
        />
      ) : (
        <div
          className="px-3 py-2 text-sm text-foreground leading-relaxed overflow-auto"
          style={{ minHeight: `${minRows * 1.625}rem` }}
        >
          {value.trim() ? (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 sm:prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-background/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-xs prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-muted-foreground" style={{ fontStyle: "italic" }}>Nothing to preview yet…</span>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/50 bg-muted/20">
        <span className="text-[11px] text-muted-foreground/60">
          Markdown supported ·{" "}
          <kbd className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded border border-border">Tab</kbd>
          {" "}to indent
        </span>
        <div className="flex-1" />
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          {wordCount}w · {charCount}c
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComposePane
// ─────────────────────────────────────────────────────────────────────────────

function ComposePane({
  onClose,
  onSent,
  mailboxAddress,
}: {
  onClose: () => void
  onSent: () => void
  mailboxAddress: string | null
}) {
  const [to, setTo] = useState<string[]>([])
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [sending, setSending] = useState(false)
  const { toast } = useToast()

  const canSend = to.length > 0 && body.trim().length > 0

  const queuedCount = sentMessages.filter(msg => msg.status === "queued").length
  const sentTodayCount = sentMessages.filter(msg => {
    const sentAt = msg.sentAt ? new Date(msg.sentAt) : null
    return msg.status === "sent" && sentAt?.toDateString() === new Date().toDateString()
  }).length

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const result = await apiFetch(API_ENDPOINTS.mailboxSend, {
        method: "POST",
        body: {
          to: to.join(", "),
          cc: cc.join(", ") || undefined,
          bcc: bcc.join(", ") || undefined,
          subject: subject.trim(),
          body: body.trim(),
          html: markdownToHtml(body),
        },
      })
      toast({
        title: result?.status === "sent" ? "Email sent" : "Email queued",
        description: result?.status === "sent"
          ? "Your message was sent successfully."
          : "Your message was queued and will be delivered shortly.",
      })
      onClose()
      onSent()
    } catch (err: any) {
      toast({
        title: "Failed to send",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col bg-background" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-card/60">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">New Message</h2>
          {mailboxAddress && (
            <p className="text-[11px] text-muted-foreground truncate">
              From: <span className="font-mono">{mailboxAddress}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] text-muted-foreground/60 font-mono">
            ⌘ Enter
          </span>
          <Button
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={handleSend}
            disabled={sending || !canSend}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-5">

          {/* Recipients block */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* To */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
              <span className="text-xs font-medium text-muted-foreground w-8 flex-shrink-0">To</span>
              <AddressInput values={to} onChange={setTo} placeholder="recipient@example.com" />
              <div className="flex items-center gap-1">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/20 transition-colors"
                  >
                    CC
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/20 transition-colors"
                  >
                    BCC
                  </button>
                )}
              </div>
            </div>

            {/* CC */}
            {showCc && (
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                <span className="text-xs font-medium text-muted-foreground w-8 flex-shrink-0">CC</span>
                <AddressInput values={cc} onChange={setCc} placeholder="cc@example.com" />
                <button
                  type="button"
                  onClick={() => { setShowCc(false); setCc([]) }}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* BCC */}
            {showBcc && (
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                <span className="text-xs font-medium text-muted-foreground w-8 flex-shrink-0">BCC</span>
                <AddressInput values={bcc} onChange={setBcc} placeholder="bcc@example.com" />
                <button
                  type="button"
                  onClick={() => { setShowBcc(false); setBcc([]) }}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground w-8 flex-shrink-0">Sub</span>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground font-medium"
              />
            </div>
          </div>

          {/* Rich markdown body */}
          <div className="rounded-xl border border-border bg-muted/10 px-4 py-3 text-[12px] text-muted-foreground space-y-1">
            <p>
              {queuedCount > 0
                ? `${queuedCount} message${queuedCount !== 1 ? "s" : ""} currently queued`
                : "No messages currently queued."}
            </p>
            <p>
              {sentTodayCount > 0
                ? `${sentTodayCount} sent today`
                : "No messages sent today yet."}
            </p>
          </div>

          <RichComposer
            value={body}
            onChange={setBody}
            placeholder="Write your message… Markdown is supported."
            minRows={16}
          />

          {/* Markdown cheat sheet */}
          <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Markdown reference
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
              {[
                ["**bold**", "Bold"],
                ["*italic*", "Italic"],
                ["~~strike~~", "Strikethrough"],
                ["# Heading", "Heading 1"],
                ["## Heading", "Heading 2"],
                ["> text", "Blockquote"],
                ["`code`", "Inline code"],
                ["[text](url)", "Link"],
                ["---", "Divider"],
                ["- item", "Bullet list"],
                ["1. item", "Ordered list"],
              ].map(([syntax, desc]) => (
                <div key={syntax} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-foreground/70 bg-muted/10 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0">
                    {syntax}
                  </span>
                  <span className="text-muted-foreground truncate">{desc}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MailboxPage() {
  const t = useTranslations("mailboxPage")

  // raw data
  const [orgInvites, setOrgInvites] = useState<any[]>([])
  const [subuserInvites, setSubuserInvites] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [mailboxAddress, setMailboxAddress] = useState<string | null>(null)
  const [mailboxUUID, setMailboxUUID] = useState<string | null>(null)
  const [mailboxAliases, setMailboxAliases] = useState<any[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [messageMeta, setMessageMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0 })
  const [showFilters, setShowFilters] = useState(false)

  // per-message state
  const [bodyView, setBodyView] = useState<BodyView | null>(null)
  const [htmlConfirmed, setHtmlConfirmed] = useState(false)
  const [blockRemoteImages, setBlockRemoteImages] = useState(true)
  const [alwaysAllowImages, setAlwaysAllowImages] = useState<Set<string>>(new Set())
  const [currentMessageCategory, setCurrentMessageCategory] = useState<string | null>(null)
  const [showMetadata, setShowMetadata] = useState(false)
  const [metadataSection, setMetadataSection] = useState<"headers" | "security" | "raw">("headers")

  const [activeSection, setActiveSection] = useState<"inbox" | "sent">("inbox")
  const [sentMessages, setSentMessages] = useState<any[]>([])
  const [sentLoading, setSentLoading] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)

  const { toast } = useToast()

  // ── data fetching ──────────────────────────────────────────────────────────

  const loadSentMessages = useCallback(async (isRefresh = false) => {
    if (isRefresh) setSentLoading(true)
    try {
      const query = new URLSearchParams()
      if (searchQuery.trim()) query.set("q", searchQuery.trim())
      if (favoriteOnly) query.set("favorite", "true")
      const result = await apiFetch(`${API_ENDPOINTS.mailboxSent}?${query.toString()}`)
      setSentMessages(Array.isArray(result?.messages) ? result.messages : [])
    } catch {
      setSentMessages([])
    } finally {
      setSentLoading(false)
    }
  }, [favoriteOnly, searchQuery])

  const handleRefresh = async () => {
    if (activeSection === "sent") { await loadSentMessages(true); return }
    await loadInbox(true)
  }

  const loadStaticData = useCallback(async () => {
    try {
      const [orgData, subData, notifData, mbData, catData] = await Promise.all([
        apiFetch(API_ENDPOINTS.organisationInvites),
        apiFetch(API_ENDPOINTS.serverSubuserInvites),
        apiFetch(API_ENDPOINTS.mailboxNotifications),
        apiFetch(API_ENDPOINTS.mailboxAddress),
        apiFetch(API_ENDPOINTS.mailboxMessageCategories).catch(() => []),
      ])
      setOrgInvites(Array.isArray(orgData) ? orgData : [])
      setSubuserInvites(Array.isArray(subData) ? subData : [])
      setNotifications(Array.isArray(notifData) ? notifData : [])
      setCategories(Array.isArray(catData) ? catData : [])
      setMailboxAddress(mbData?.address ?? null)
      setMailboxUUID(mbData?.uuid ?? null)
      setMailboxAliases(Array.isArray(mbData?.aliases) ? mbData.aliases : [])
    } catch {
      setOrgInvites([]); setSubuserInvites([]); setNotifications([])
      setCategories([]); setMailboxAddress(null); setMailboxUUID(null); setMailboxAliases([])
    }
  }, [])

  const loadMessages = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const query = new URLSearchParams()
      query.set("page", String(page))
      query.set("limit", String(PAGE_SIZE))
      if (searchQuery.trim()) query.set("q", searchQuery.trim())
      if (selectedCategory) query.set("category", selectedCategory)
      if (unreadOnly) query.set("unread", "true")
      if (favoriteOnly) query.set("favorite", "true")
      const result = await apiFetch(`${API_ENDPOINTS.mailboxMessages}?${query.toString()}`)
      setMessages(Array.isArray(result?.messages) ? result.messages : [])
      setMessageMeta({
        page: Number(result?.meta?.page || page),
        limit: Number(result?.meta?.limit || PAGE_SIZE),
        total: Number(result?.meta?.total || 0),
      })
    } catch {
      setMessages([]); setMessageMeta({ page, limit: PAGE_SIZE, total: 0 })
    } finally {
      setRefreshing(false)
    }
  }, [page, searchQuery, selectedCategory, unreadOnly, favoriteOnly])

  const loadInbox = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    await Promise.all([loadStaticData(), loadMessages(isRefresh)])
    setLoading(false)
  }, [loadStaticData, loadMessages])

  useEffect(() => { loadInbox() }, [])

  useEffect(() => {
    if (activeSection === "inbox" && !loading) loadMessages()
  }, [activeSection, page, searchQuery, selectedCategory, unreadOnly, favoriteOnly, loading, loadMessages])

  useEffect(() => {
    if (composeOpen) {
      loadSentMessages()
    }
  }, [composeOpen, loadSentMessages])

  useEffect(() => {
    if (activeSection === "sent") loadSentMessages()
  }, [activeSection, searchQuery, favoriteOnly, loadSentMessages])

  // ── derived data ───────────────────────────────────────────────────────────

  const inboxItems = useMemo<MailboxItem[]>(() => {
    const orgItems: MailboxItem[] = orgInvites.map(inv => ({
      id: `organisation-${inv.id}`, inviteId: inv.id, type: "organisation",
      title: inv.organisationName || t("sections.organisationInviteFallback"),
      description: t("sections.organisationsDescription"),
      details: t("detail.organisationBody", { organisation: inv.organisationName || t("unknownOrganisation"), email: inv.email }),
      sender: inv.organisationName || t("sections.organisations"),
      badge: t("sections.organisations"), date: formatDate(inv.createdAt),
      rawDate: inv.createdAt, avatarLabel: inv.organisationName || inv.email || "Org",
    }))

    const subItems: MailboxItem[] = subuserInvites.map(inv => ({
      id: `subuser-${inv.id}`, inviteId: inv.id, type: "subuser",
      title: inv.serverName || inv.serverUuid || t("sections.serverSubusers"),
      description: t("sections.serverSubusersDescription"),
      details: t("detail.subuserBody", { server: inv.serverName || inv.serverUuid || t("detail.unknownServer"), email: inv.email || inv.userEmail }),
      sender: inv.serverName || inv.serverUuid || t("sections.serverSubusers"),
      badge: t("sections.serverSubusers"), date: formatDate(inv.createdAt),
      rawDate: inv.createdAt, avatarLabel: inv.serverName || inv.serverUuid || "S",
    }))

    const notifItems: MailboxItem[] = notifications.map(n => ({
      id: `notification-${n.id}`, inviteId: n.id, type: "notification",
      title: n.title, description: t("sections.notificationsDescription"), details: n.body,
      sender: t("sections.notifications"), badge: t("sections.notifications"),
      date: formatDate(n.createdAt), rawDate: n.createdAt,
      avatarLabel: n.title || t("sections.notifications"), read: !!n.read,
    }))

    const emailItems: MailboxItem[] = messages.map(msg => {
      const parsed = parseSender(msg.fromAddress || "")
      let headersObj: any = null
      try {
        if (msg.headers) {
          headersObj = typeof msg.headers === 'string' ? JSON.parse(msg.headers) : msg.headers
        } else if (msg.rawHeaders) {
          headersObj = typeof msg.rawHeaders === 'string' && msg.rawHeaders.trim().startsWith('{')
            ? JSON.parse(msg.rawHeaders) : null
        }
      } catch { headersObj = null }

      const receivedRaw = headersObj?.received ?? headersObj?.['x-received'] ?? undefined
      const receivedList: string[] = Array.isArray(receivedRaw) ? receivedRaw : typeof receivedRaw === 'string' ? [receivedRaw] : []

      const extractIpFromText = (text?: string): string | null => {
        if (!text) return null
        const m4 = text.match(/\b([0-9]{1,3}(?:\.[0-9]{1,3}){3})\b/)
        if (m4 && m4[1]) return m4[1]
        const m6 = text.match(/\b([A-Fa-f0-9:]{3,}:[A-Fa-f0-9:]{1,})\b/)
        if (m6 && m6[1]) return m6[1]
        return null
      }
      const isPrivateIp = (ip?: string) => {
        if (!ip) return false
        return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(ip)
      }

      let senderIp = msg.senderIp || null
      if (!senderIp) {
        const ips: string[] = []
        for (const r of receivedList) { const ip = extractIpFromText(r); if (ip) ips.push(ip) }
        senderIp = ips.find(p => !isPrivateIp(p)) ?? ips[0] ?? null
      }

      const authVal = headersObj?.['authentication-results'] || headersObj?.['auth-results'] || headersObj?.['arc-authentication-results'] || null
      const authString = typeof authVal === 'string' ? authVal : Array.isArray(authVal) ? authVal.join('; ') : null
      const parseToken = (src?: string | null, re?: RegExp) => { if (!src || !re) return null; const m = String(src).match(re); return m?.[1] ?? null }

      const spfResult = msg.spfResult || parseToken(authString, /spf=(pass|fail|softfail|neutral|none|temperror|permerror)/i)
      const dkimResult = msg.dkimResult || parseToken(authString, /dkim=(pass|fail|neutral|none|policy|temperror|permerror)/i)
      const dmarcResult = msg.dmarcResult || parseToken(authString, /dmarc=(pass|fail|bestguess|none|policy|temperror|permerror)/i)

      const contentType = headersObj?.['content-type'] ?? headersObj?.['Content-Type']
      const contentValue = typeof contentType === 'object' ? (contentType.value || '').toLowerCase() : (String(contentType || '').toLowerCase())
      let encryptionType = msg.encryptionType || null
      if (!encryptionType && contentValue) {
        if (contentValue.includes('application/pgp-encrypted') || (contentValue.includes('multipart/encrypted') && contentValue.includes('pgp'))) encryptionType = 'PGP/MIME'
        else if (contentValue.includes('application/pkcs7-mime') || contentValue.includes('x-pkcs7-mime') || contentValue.includes('pkcs7')) encryptionType = 'S/MIME'
      }

      const toAddr = msg.toAddress || headersObj?.to?.text || undefined
      const priority = msg.priority || parsePriorityHeader(headersObj)

      return {
        id: `email-${msg.id}`, inviteId: msg.id, type: "email",
        title: msg.subject || t("detail.emailFallback"),
        description: t("sections.emailDescription"), details: msg.body || "",
        sender: parsed.name || msg.fromAddress, senderEmail: parsed.email || "",
        html: msg.html || null, category: msg.category || null,
        isSpam: !!msg.isSpam, spamScore: typeof msg.spamScore === "number" ? msg.spamScore : null,
        isVirus: !!msg.isVirus, favorite: !!msg.favorite, virusName: msg.virusName || null,
        attachments: msg.attachments || [], read: !!msg.read,
        badge: t("sections.email"), date: formatDate(msg.receivedAt),
        rawDate: msg.receivedAt, avatarLabel: parsed.name || parsed.email || t("detail.emailFallback"),
        rawHeaders: msg.rawHeaders || null, headers: headersObj || null,
        senderIp: senderIp || undefined, senderRdns: msg.senderRdns || undefined,
        priority: priority || undefined, spfResult: spfResult || undefined,
        dkimResult: dkimResult || undefined, dmarcResult: dmarcResult || undefined,
        authResults: authString || undefined, encryptionType: encryptionType || undefined,
        messageId: msg.messageId || headersObj?.['message-id'] || undefined,
        toAddress: toAddr || undefined,
      }
    })

    return [...emailItems, ...notifItems, ...orgItems, ...subItems].sort(
      (a, b) => new Date(b.rawDate || 0).getTime() - new Date(a.rawDate || 0).getTime(),
    )
  }, [orgInvites, subuserInvites, notifications, messages, t])

  const sentItems = useMemo<MailboxItem[]>(() => sentMessages.map(msg => ({
    id: `sent-${msg.id}`, inviteId: msg.id, type: "email",
    title: msg.subject || t("detail.emailFallback"),
    description: msg.status === "queued" ? "Queued outbound email" : "Sent outbound email",
    details: msg.body || "", sender: msg.fromAddress || mailboxAddress || "You",
    senderEmail: msg.fromAddress || undefined, html: msg.html || null,
    category: null, isSpam: false, spamScore: null, isVirus: false, virusName: null,
    attachments: [], read: true, favorite: !!msg.favorite,
    badge: msg.status === "sent" ? "Sent" : "Queued",
    status: msg.status || null, isSent: true,
    sentAt: msg.sentAt || null, scheduledAt: msg.scheduledAt || null,
    date: formatDate(msg.sentAt || msg.scheduledAt || undefined),
    rawDate: msg.sentAt || msg.scheduledAt || undefined,
    avatarLabel: msg.fromAddress || mailboxAddress || "You",
    toAddress: msg.toAddress, messageId: msg.messageId || undefined,
  })), [sentMessages, t, mailboxAddress])

  const unreadCount = useMemo(
    () => inboxItems.filter(i => (i.type === "email" || i.type === "notification") && i.read === false).length,
    [inboxItems],
  )

  const inboxFilteredItems = useMemo(() => inboxItems.filter(item => {
    if (unreadOnly && (item.type === "email" || item.type === "notification") && item.read) return false
    if (selectedCategory) {
      if (item.type !== "email") return false
      if (selectedCategory === "uncategorized") return !item.category
      return item.category === selectedCategory
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.sender.toLowerCase().includes(q) || item.details.toLowerCase().includes(q)
    }
    return true
  }), [inboxItems, selectedCategory, unreadOnly, searchQuery])

  const currentItems = useMemo(
    () => activeSection === "sent" ? sentItems : inboxFilteredItems,
    [activeSection, sentItems, inboxFilteredItems],
  )

  const selectedItem = useMemo(
    () => currentItems.find(i => i.id === selectedItemId) ?? null,
    [currentItems, selectedItemId],
  )

  useEffect(() => {
    if (!selectedItemId && currentItems.length > 0) setSelectedItemId(currentItems[0].id)
  }, [currentItems, selectedItemId])

  const listLoading = activeSection === "sent" ? sentLoading : loading

  useEffect(() => {
    setBodyView(null); setHtmlConfirmed(false)
    setCurrentMessageCategory(selectedItem?.type === "email" ? selectedItem.category ?? null : null)
    setShowMetadata(false); setMetadataSection("headers")
    if (selectedItem?.senderEmail && alwaysAllowImages.has(selectedItem.senderEmail)) {
      setBlockRemoteImages(false)
    } else {
      setBlockRemoteImages(true)
    }
  }, [selectedItem?.id])

  useEffect(() => {
    if (!selectedItem || selectedItem.type !== "email" || selectedItem.read) return
    const markRead = async () => {
      try {
        await apiFetch(API_ENDPOINTS.mailboxMessageMark.replace(":id", String(selectedItem.inviteId)), {
          method: "POST", body: { read: true },
        })
        setMessages(prev => prev.map(msg => msg.id === selectedItem.inviteId ? { ...msg, read: true } : msg))
      } catch { }
    }
    markRead()
  }, [selectedItem?.id])

  // ── actions ────────────────────────────────────────────────────────────────

  const setActionLoad = (key: string, val: boolean) =>
    setActionLoading(p => ({ ...p, [key]: val }))

  const handleInviteAction = async (type: "organisation" | "subuser", inviteId: number, action: "accept" | "reject") => {
    const key = `${type}-${inviteId}`
    setActionLoad(key, true)
    try {
      const ep = type === "organisation"
        ? action === "accept" ? API_ENDPOINTS.organisationInviteAccept : API_ENDPOINTS.organisationInviteReject
        : action === "accept" ? API_ENDPOINTS.serverSubuserInviteAccept : API_ENDPOINTS.serverSubuserInviteReject
      await apiFetch(ep.replace(":inviteId", String(inviteId)), { method: "POST" })
      await loadStaticData()
    } catch (e: any) { alert(e?.message || t("errors.failedAction")) }
    finally { setActionLoad(key, false) }
  }

  const handleMarkRead = async (item: MailboxItem) => {
    const key = `mark-${item.type}-${item.inviteId}`
    setActionLoad(key, true)
    try {
      const target = item.type === "notification"
        ? API_ENDPOINTS.mailboxNotificationMark.replace(":id", String(item.inviteId))
        : API_ENDPOINTS.mailboxMessageMark.replace(":id", String(item.inviteId))
      await apiFetch(target, { method: "POST", body: { read: !item.read } })
      if (item.type === "email") setMessages(prev => prev.map(msg => msg.id === item.inviteId ? { ...msg, read: !item.read } : msg))
      else await loadStaticData()
    } catch { alert(t("errors.failedAction")) }
    finally { setActionLoad(key, false) }
  }

  const handleDelete = async (item: MailboxItem) => {
    if (!confirm(t("confirm.deleteEmail"))) return
    const key = `delete-${item.type}-${item.inviteId}`
    setActionLoad(key, true)
    try {
      const target = item.type === "notification"
        ? API_ENDPOINTS.mailboxNotificationDelete.replace(":id", String(item.inviteId))
        : API_ENDPOINTS.mailboxMessageDelete.replace(":id", String(item.inviteId))
      await apiFetch(target, { method: "DELETE" })
      setSelectedItemId(null); setMobileView("list")
      if (item.type === "email") await loadMessages(true)
      else await loadStaticData()
    } catch { alert(t("errors.failedAction")) }
    finally { setActionLoad(key, false) }
  }

  const handleAssignCategory = async (item: MailboxItem) => {
    const key = `category-${item.inviteId}`
    setActionLoad(key, true)
    try {
      await apiFetch(API_ENDPOINTS.mailboxMessageCategory.replace(":id", String(item.inviteId)), {
        method: "POST", body: { category: currentMessageCategory || null },
      })
      await loadMessages(true)
    } catch { alert(t("errors.failedAction")) }
    finally { setActionLoad(key, false) }
  }

  const handleFavoriteToggle = async (item: MailboxItem, favorite: boolean) => {
    const key = `favorite-${item.id}`
    setActionLoad(key, true)
    try {
      const endpoint = item.isSent
        ? API_ENDPOINTS.mailboxSentFavorite.replace(":id", String(item.inviteId))
        : API_ENDPOINTS.mailboxMessageFavorite.replace(":id", String(item.inviteId))
      await apiFetch(endpoint, { method: "POST", body: { favorite } })
      if (item.isSent) setSentMessages(prev => prev.map(msg => msg.id === item.inviteId ? { ...msg, favorite } : msg))
      else setMessages(prev => prev.map(msg => msg.id === item.inviteId ? { ...msg, favorite } : msg))
    } catch { alert(t("errors.failedAction")) }
    finally { setActionLoad(key, false) }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST PANE
  // ─────────────────────────────────────────────────────────────────────────────

  const ListPane = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => { setActiveSection("inbox"); setComposeOpen(false); setSelectedItemId(null); setMobileView("list") }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeSection === "inbox"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
                )}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => { setActiveSection("sent"); setComposeOpen(false); setSelectedItemId(null); setMobileView("list") }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeSection === "sent"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
                )}
              >
                Sent
              </button>
            </div>
            {activeSection === "inbox" && unreadCount > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              className="h-9 px-3 text-xs"
              onClick={() => {
                setComposeOpen(true)
                setActiveSection("inbox")
                setSelectedItemId(null)
                setMobileView("detail")
              }}
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compose</span>
            </Button>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={cn(
                "p-1.5 rounded-lg transition-colors text-xs",
                showFilters || selectedCategory || unreadOnly || favoriteOnly
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing || sentLoading}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", (refreshing || sentLoading) && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            className="w-full rounded-lg border border-border bg-muted/10 hover:bg-muted/20 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:bg-card transition-all"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="space-y-2 pb-0.5">
            <button
              onClick={() => setFavoriteOnly(s => !s)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
                favoriteOnly ? "bg-primary/15 text-primary font-medium" : "bg-muted/10 text-foreground hover:bg-muted/20",
              )}
            >
              <span className="flex items-center gap-1.5">
                {favoriteOnly ? <Star className="h-3.5 w-3.5" /> : <StarOff className="h-3.5 w-3.5" />}
                Favorites only
              </span>
            </button>

            {activeSection === "inbox" && (
              <>
                <button
                  onClick={() => setUnreadOnly(s => !s)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
                    unreadOnly ? "bg-primary/15 text-primary font-medium" : "bg-muted/10 text-foreground hover:bg-muted/20",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {unreadOnly ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    Unread only
                  </span>
                  {unreadCount > 0 && <span className="text-[10px] text-muted-foreground">{unreadCount}</span>}
                </button>

                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[null, ...categories].map(cat => (
                      <button
                        key={cat ?? "all"}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                          selectedCategory === cat
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                        )}
                      >
                        {cat ?? "All"}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Filter status bar */}
      {(searchQuery || selectedCategory || unreadOnly || favoriteOnly) && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 border-b border-primary/10">
          <span className="text-[11px] text-primary/80 font-medium">
            {currentItems.length} result{currentItems.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => { setSearchQuery(""); setSelectedCategory(null); setUnreadOnly(false); setFavoriteOnly(false) }}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        {listLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading messages…</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
            <div className="rounded-full bg-muted p-4">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {activeSection === "sent" ? "No sent emails yet." : t("list.empty")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {activeSection === "sent"
                  ? "Compose a message to send your first email."
                  : t("list.emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {currentItems.map(item => {
              const isSelected = selectedItemId === item.id
              const isUnread = (item.type === "email" || item.type === "notification") && item.read === false
              const hasAttachments = (item.attachments?.length ?? 0) > 0

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSelectedItemId(item.id); setMobileView("detail") }}
                  className={cn(
                    "w-full text-left px-3 py-3 transition-colors relative border-b border-border/30",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/40",
                      isSelected
                        ? "bg-primary/8 border-l-2 border-l-primary"
                        : "hover:bg-muted/15 border-l-2 border-l-transparent",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-1.5 flex-shrink-0 w-1.5">
                      {isUnread && <span className="block h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>

                    <div className="flex-shrink-0">
                      <SenderAvatar item={item} size="sm" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-1.5 mb-0.5">
                        <span className={cn(
                          "truncate text-[13px]",
                          isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/75",
                        )}>
                          {item.sender}
                        </span>
                        <span className={cn(
                          "flex-shrink-0 text-[11px] tabular-nums leading-none",
                          isUnread ? "text-primary font-medium" : "text-muted-foreground",
                        )}>
                          {item.date}
                        </span>
                      </div>

                      <p className={cn(
                        "truncate text-xs mb-1.5",
                        isUnread ? "font-medium text-foreground/90" : "text-muted-foreground/80",
                      )}>
                        {item.title}
                      </p>

                      <div className="flex items-center justify-between gap-1.5">
                        <p className="truncate text-[11px] text-muted-foreground/60 flex-1 leading-tight">
                          {item.details.slice(0, 70)}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleFavoriteToggle(item, !item.favorite) }}
                            className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                          >
                            {item.favorite
                              ? <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                              : <StarOff className="h-3.5 w-3.5" />}
                          </button>

                          {item.isVirus && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-destructive">VIRUS</span>
                          )}
                          {!item.isVirus && item.isSpam && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-accent-foreground">SPAM</span>
                          )}
                          {item.priority && (
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                              item.priority === 'Urgent' ? 'bg-destructive/10 text-destructive' :
                                item.priority === 'High' ? 'bg-accent/30 text-accent-foreground' :
                                item.priority === 'Low' ? 'bg-primary/10 text-primary' :
                                'bg-muted text-muted-foreground',
                            )}>
                              {item.priority}
                            </span>
                          )}
                          {hasAttachments && <Paperclip className="h-2.5 w-2.5 text-muted-foreground/50" />}
                          <TypeBadge type={item.type} />
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

      {/* Pagination */}
      {activeSection === "inbox" && messageMeta.total > messageMeta.limit && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          <span className="text-[11px] text-muted-foreground">
            {messageMeta.page} / {Math.ceil(messageMeta.total / messageMeta.limit)}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
              disabled={messageMeta.page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
              disabled={messageMeta.page >= Math.ceil(messageMeta.total / messageMeta.limit)}
              onClick={() => setPage(prev => prev + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL PANE
  // ─────────────────────────────────────────────────────────────────────────────

  const hasHtml = Boolean(selectedItem?.html)
  const resolvedView: BodyView = bodyView ?? "plain"
  const isInvite = selectedItem?.type === "organisation" || selectedItem?.type === "subuser"
  const isInboxMessage = (selectedItem?.type === "email" && !selectedItem?.isSent) || selectedItem?.type === "notification"

  const markReadKey = `mark-${selectedItem?.type}-${selectedItem?.inviteId}`
  const deleteKey = `delete-${selectedItem?.type}-${selectedItem?.inviteId}`
  const inviteKey = `${selectedItem?.type}-${selectedItem?.inviteId}`
  const categoryKey = `category-${selectedItem?.inviteId}`

  const DetailPane = (
    <div className="flex h-full flex-col bg-background">
      {composeOpen ? (
        <ComposePane
          onClose={() => setComposeOpen(false)}
          onSent={() => loadSentMessages(true)}
          mailboxAddress={mailboxAddress}
        />
      ) : selectedItem ? (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-card/60">
            <button
              onClick={() => setMobileView("list")}
              className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <TypeBadge type={selectedItem.type} />
            {selectedItem.category && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Tag className="h-2.5 w-2.5" />
                {selectedItem.category}
              </span>
            )}

            <div className="flex-1" />

            <button
              onClick={() => handleFavoriteToggle(selectedItem, !selectedItem.favorite)}
              disabled={actionLoading[`favorite-${selectedItem.id}`]}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-50"
              title={selectedItem.favorite ? "Remove from favourites" : "Add to favourites"}
            >
              {selectedItem.favorite
                ? <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                : <StarOff className="h-3.5 w-3.5" />}
            </button>

            {isInboxMessage && (
              <>
                <button
                  onClick={() => handleMarkRead(selectedItem)}
                  disabled={actionLoading[markReadKey]}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-50"
                >
                  {actionLoading[markReadKey]
                    ? <Spinner className="h-3.5 w-3.5" />
                    : selectedItem.read ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline text-[11px]">
                    {selectedItem.read ? "Mark unread" : "Mark read"}
                  </span>
                </button>
                <button
                  onClick={() => handleDelete(selectedItem)}
                  disabled={actionLoading[deleteKey]}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {actionLoading[deleteKey] ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline text-[11px]">{t("actions.delete")}</span>
                </button>
              </>
            )}

            {isInvite && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleInviteAction(selectedItem.type as any, selectedItem.inviteId, "reject")}
                  disabled={actionLoading[inviteKey]}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-50"
                >
                  {actionLoading[inviteKey] ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {t("actions.reject")}
                </button>
                <button
                  onClick={() => handleInviteAction(selectedItem.type as any, selectedItem.inviteId, "accept")}
                  disabled={actionLoading[inviteKey]}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {actionLoading[inviteKey] ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {t("actions.accept")}
                </button>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-5">

              {/* Subject */}
              <div>
                <h1 className="text-xl font-bold text-foreground leading-snug tracking-tight">
                  {selectedItem.title}
                </h1>
              </div>

              {/* Sender card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <SenderAvatar item={selectedItem} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{selectedItem.sender}</p>
                        {selectedItem.senderEmail && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AtSign className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <p className="text-xs text-muted-foreground font-mono">{selectedItem.senderEmail}</p>
                            <CopyButton value={selectedItem.senderEmail} />
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                          <Clock className="h-3 w-3" />
                          <span>{formatDateRelative(selectedItem.rawDate)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {formatDateLong(selectedItem.rawDate)}
                        </p>
                      </div>
                    </div>

                    {(selectedItem.isVirus || selectedItem.isSpam || (selectedItem.attachments?.length ?? 0) > 0) && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                        <SecurityBadge item={selectedItem} />
                        {(selectedItem.attachments?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-2.5 py-1.5">
                            <Paperclip className="h-3 w-3" />
                            <span>{selectedItem.attachments!.length} attachment{selectedItem.attachments!.length !== 1 ? "s" : ""}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              {selectedItem.type === "email" && hasHtml && bodyView === null ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Choose view format</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setBodyView("plain")}
                      className="flex items-start gap-3 rounded-xl border-2 border-border bg-card px-4 py-4 text-left hover:border-primary/40 hover:bg-primary/5 transition-all group"
                    >
                      <div className="rounded-lg bg-muted p-2.5 flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                        <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Plain text</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Safe · No external content · Recommended</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setHtmlConfirmed(true); setBodyView("html") }}
                      className="flex items-start gap-3 rounded-xl border-2 border-border bg-card px-4 py-4 text-left hover:border-accent/50 hover:bg-accent/10 transition-all group"
                    >
                      <div className="rounded-lg bg-accent/20 p-2.5 flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">HTML view</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Rich layout · Images blocked by default</p>
                      </div>
                    </button>
                  </div>
                  {selectedItem.details && (
                    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">Preview</p>
                      <p className="text-sm leading-relaxed text-foreground/70 whitespace-pre-wrap line-clamp-4">
                        {selectedItem.details}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {hasHtml && bodyView !== null && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
                        <button
                          onClick={() => setBodyView("plain")}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            resolvedView === "plain" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <FileText className="h-3 w-3" />Plain
                        </button>
                        <button
                          onClick={() => { if (!htmlConfirmed) setHtmlConfirmed(true); setBodyView("html") }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            resolvedView === "html" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <AlertCircle className="h-3 w-3" />HTML
                        </button>
                      </div>
                      {resolvedView === "html" && (
                        <button
                          onClick={() => window.open("data:text/html," + encodeURIComponent(selectedItem.html || ""), "_blank")}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />Open raw
                        </button>
                      )}
                    </div>
                  )}

                  {resolvedView === "plain" && (
                    <div className="rounded-xl border border-border bg-card">
                      {selectedItem.details ? (
                        <div className="px-5 py-5">
                          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 sm:prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-background/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-xs prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedItem.details}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <div className="px-5 py-8 text-center">
                          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground italic">{t("detail.noPlainTextContent")}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {resolvedView === "html" && htmlConfirmed && selectedItem.html && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      {blockRemoteImages && (
                        <RemoteImagesBar
                          onAllow={() => setBlockRemoteImages(false)}
                          onAlwaysAllow={() => {
                            setBlockRemoteImages(false)
                            if (selectedItem.senderEmail)
                              setAlwaysAllowImages(s => { const n = new Set(s); n.add(selectedItem.senderEmail!); return n })
                          }}
                        />
                      )}
                      <div className="bg-card">
                        <SandboxedEmailFrame html={selectedItem.html} blockRemoteImages={blockRemoteImages} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              {(selectedItem.attachments?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Attachments · {selectedItem.attachments!.length}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedItem.attachments!.map((att, i) => (
                      <AttachmentCard key={`${att.url}-${i}`} attachment={att} />
                    ))}
                  </div>
                </div>
              )}

              {/* Category */}
              {selectedItem.type === "email" && categories.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                      value={currentMessageCategory ?? ""}
                      onChange={e => setCurrentMessageCategory(e.target.value || null)}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <Button size="sm" className="h-9 px-4 text-xs"
                      onClick={() => handleAssignCategory(selectedItem)} disabled={actionLoading[categoryKey]}>
                      {actionLoading[categoryKey] ? <Spinner className="h-3.5 w-3.5" /> : "Save"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Metadata accordion */}
              <div className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setShowMetadata(s => !s)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message details</span>
                  </div>
                  {showMetadata
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>

                {showMetadata && (
                  <div className="bg-card">
                    <div className="flex border-b border-border">
                      {(["headers", "security", "raw"] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setMetadataSection(tab)}
                          className={cn(
                            "px-4 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
                            metadataSection === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="px-4 py-1">
                      {metadataSection === "headers" && (
                        <div>
                          <MetadataRow label="From" value={selectedItem.sender} copyable />
                          <MetadataRow label="Email" value={selectedItem.senderEmail} mono copyable />
                          <MetadataRow label="To" value={selectedItem.toAddress || "Unknown"} mono copyable />
                          <MetadataRow label="Message ID" value={selectedItem.messageId || "Unknown"} mono copyable />
                          <MetadataRow label="Subject" value={selectedItem.title} />
                          <MetadataRow label="Date" value={formatDateLong(selectedItem.rawDate)} />
                          <MetadataRow label="Type" value={selectedItem.type} />
                          <MetadataRow label="Category" value={selectedItem.category ?? "Uncategorized"} />
                          {(selectedItem.attachments?.length ?? 0) > 0 && (
                            <MetadataRow label="Attachments" value={selectedItem.attachments!.length} />
                          )}
                        </div>
                      )}

                      {metadataSection === "security" && (
                        <div className="py-2 space-y-3">
                          <SecurityBadge item={selectedItem} />
                          <div>
                            <MetadataRow label="Spam" value={selectedItem.isSpam ?? false} />
                            <MetadataRow label="Spam score" value={selectedItem.spamScore} />
                            <MetadataRow label="Virus" value={selectedItem.isVirus ?? false} />
                            <MetadataRow label="Virus name" value={selectedItem.virusName} />
                            <MetadataRow label="Sender IP" value={selectedItem.senderIp || "Unknown"} mono copyable />
                            <MetadataRow label="Reverse DNS" value={selectedItem.senderRdns || "Unknown"} mono />
                            <MetadataRow label="SPF" value={selectedItem.spfResult || "Unknown"} />
                            <MetadataRow label="Priority" value={selectedItem.priority || "Unknown"} />
                            <MetadataRow label="DKIM" value={selectedItem.dkimResult || "Unknown"} />
                            <MetadataRow label="DMARC" value={selectedItem.dmarcResult || "Unknown"} />
                            <MetadataRow label="Encryption" value={selectedItem.encryptionType || "None"} />
                            {selectedItem.authResults && (
                              <MetadataRow label="Auth results" value={selectedItem.authResults} mono />
                            )}
                          </div>
                        </div>
                      )}

                      {metadataSection === "raw" && (
                        <div className="py-2">
                          <div className="rounded-lg bg-muted/50 border border-border overflow-auto max-h-80">
                            <pre className="p-3 text-[11px] leading-5 text-foreground/80 whitespace-pre font-mono">
                              {selectedItem.rawHeaders
                                ? formatHeaderSource(selectedItem.rawHeaders)
                                : selectedItem.headers
                                  ? formatHeaderSource(selectedItem.headers)
                                  : JSON.stringify({
                                    ...selectedItem,
                                    html: selectedItem.html ? `[HTML: ${selectedItem.html.length} chars]` : null,
                                    details: selectedItem.details ? `[${selectedItem.details.length} chars]` : null,
                                  }, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-4" />
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-muted p-5">
            <Mail className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">{t("details.selectItem")}</p>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-xs leading-relaxed">
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
        <div className="border-b border-border/50 bg-muted/20 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-w-7xl mx-auto">
            <div className="flex items-center gap-1.5 min-w-0">
              <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono text-muted-foreground truncate">
                {mailboxAddress || mailboxUUID}
              </span>
              <CopyButton value={mailboxAddress || mailboxUUID || ""} />
            </div>
            {mailboxAliases.map((alias, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs font-mono text-muted-foreground/70">{alias.address}</span>
                {alias.canSendFrom && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded px-1 py-0.5">
                    Send
                  </span>
                )}
              </div>
            ))}
            {unreadCount > 0 && (
              <span className="ml-auto text-xs font-semibold text-primary flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 120px)" }}>
        <div className={cn(
          "border-r border-border/60 flex-shrink-0 flex flex-col",
          "w-full lg:w-[300px] xl:w-[340px]",
          mobileView === "detail" ? "hidden lg:flex" : "flex",
        )}>
          {ListPane}
        </div>
        <div className={cn(
          "flex-1 min-w-0 flex flex-col",
          mobileView === "list" ? "hidden lg:flex" : "flex",
        )}>
          {DetailPane}
        </div>
      </div>
    </div>
  )
}