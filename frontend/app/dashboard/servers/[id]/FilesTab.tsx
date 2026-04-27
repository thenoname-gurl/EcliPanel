"use client"

import {
  useState, useRef, useEffect, useCallback, useMemo, Fragment
} from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { MonacoFileEditor } from "./MonacoFileEditor"
import { formatBytes, displayPath, MONACO_LANGUAGE_MAP } from "./serverTabHelpers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Folder, FileText, ChevronRight, FolderPlus, FilePlus,
  Trash2, Pencil, Copy, Download, X, Save, RefreshCw,
  Loader2, Shield, Archive, ArrowLeft, Image as ImageIcon,
  Check, Upload, ZoomIn, ZoomOut, Move,
  File, RotateCcw, Eye, FileCode,
  FileJson, FileImage, Maximize2, Minimize2,
  Terminal, Wifi, WifiOff, Lock, Unlock,
  CheckCircle2, AlertCircle, Info, ChevronDown,
  Server, HardDrive, Globe
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileItem {
  name?: string
  attributes?: { name?: string; size?: number; modified_at?: string }
  directory?: boolean
  is_file?: boolean
  type?: string
  size?: number
  modified?: string
  modified_at?: string
}

interface SftpInfo {
  host: string
  port: number
  username?: string
  proxied?: boolean
}

interface FilesTabProps {
  serverId: string
  sftpInfo?: SftpInfo | null
  editorSettings?: any
  isKvm?: boolean
}

interface ToastItem {
  id: string
  type: "success" | "error" | "info" | "warning"
  message: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getFileName = (f: FileItem): string => f.name || f.attributes?.name || ""
const isDirectory = (f: FileItem): boolean =>
  f.directory === true || f.is_file === false ||
  f.type === "folder" || f.type === "directory"
const getFileSize = (f: FileItem): number => f.size || f.attributes?.size || 0
const getModifiedDate = (f: FileItem): string | undefined =>
  f.modified || f.modified_at || f.attributes?.modified_at

const isImageFile = (n: string) =>
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$/i.test(n)
const isTextFile = (n: string) =>
  /\.(txt|md|json|yaml|yml|xml|ini|conf|config|properties|toml|sh|bash|bat|cmd|js|mjs|cjs|ts|mts|cts|jsx|tsx|css|scss|sass|less|html|htm|py|pyw|rb|php|java|kt|kts|swift|go|rs|c|cpp|cc|cxx|h|hpp|cs|fs|vb|lua|sql|graphql|gql|vue|svelte|astro|mdx|env|gitignore|dockerignore|dockerfile|makefile|cmake|gradle|pom|lock|log)$/i.test(n)
const isBinaryFile = (n: string) =>
  /\.(zip|jar|tar|gz|tgz|rar|7z|exe|dll|bin|iso|img|dmg|so|dylib|a|lib|o|class|pyc|pyo|wasm|pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|mp3|mp4|avi|mkv|mov|wmv|flv|wav|ogg|flac|aac|m4a|woff|woff2|ttf|otf|eot)$/i.test(n)

const getFileIcon = (filename: string, isDir: boolean) => {
  if (isDir) return <Folder className="h-4 w-4 text-amber-400/80 flex-shrink-0" />
  if (isImageFile(filename)) return <FileImage className="h-4 w-4 text-pink-400 flex-shrink-0" />
  if (/\.(json)$/i.test(filename)) return <FileJson className="h-4 w-4 text-yellow-400 flex-shrink-0" />
  if (/\.(js|ts|jsx|tsx|py|rb|php|java|go|rs|c|cpp)$/i.test(filename))
    return <FileCode className="h-4 w-4 text-blue-400 flex-shrink-0" />
  if (/\.(md|txt|log)$/i.test(filename))
    return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  if (/\.(zip|tar|gz|rar|7z|jar)$/i.test(filename))
    return <Archive className="h-4 w-4 text-orange-400 flex-shrink-0" />
  return <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
}

const formatDate = (date: string | undefined, t?: any): string => {
  if (!date) return "—"
  const d = new Date(date)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return t?.("labels.yesterday") ?? "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

// ─── Toast System ─────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />,
    error: <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />,
    info: <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />,
  }

  const styles = {
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    error: "border-red-500/20 bg-red-500/10 text-red-200",
    info: "border-blue-500/20 bg-blue-500/10 text-blue-200",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm pointer-events-auto",
            "animate-in slide-in-from-bottom-2 fade-in-0 duration-200",
            styles[toast.type]
          )}
        >
          {icons[toast.type]}
          <p className="flex-1 text-sm leading-snug">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((type: ToastItem["type"], message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  open, title, description, confirmLabel = "Confirm",
  destructive, onConfirm, onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{description}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            size="sm"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Image Preview ────────────────────────────────────────────────────────────

function ImagePreviewModal({ url, filename, onClose, onDownload, t }: {
  url: string; filename: string
  onClose: () => void; onDownload: () => void; t: any
}) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => Math.min(Math.max(0.1, s * (e.deltaY > 0 ? 0.9 : 1.1)), 10))
  }, [])

  const resetView = () => { setScale(1); setPosition({ x: 0, y: 0 }) }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "+" || e.key === "=") setScale(s => Math.min(s * 1.2, 10))
      if (e.key === "-") setScale(s => Math.max(s * 0.8, 0.1))
      if (e.key === "0") resetView()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-medium truncate text-sm">{filename}</p>
            <p className="text-white/50 text-xs">{Math.round(scale * 100)}% · scroll to zoom · drag to pan</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { icon: ZoomOut, action: () => setScale(s => Math.max(s * 0.8, 0.1)) },
            { icon: ZoomIn, action: () => setScale(s => Math.min(s * 1.2, 10)) },
            { icon: RotateCcw, action: resetView },
          ].map(({ icon: Icon, action }, i) => (
            <button key={i} onClick={action}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors hidden sm:flex">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onDownload}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (scale > 1) { setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }) }
        }}
        onMouseMove={(e) => { if (isDragging) setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }) }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      >
        <div style={{ transform: `translate(${position.x}px,${position.y}px) scale(${scale})`, transformOrigin: "center", transition: isDragging ? "none" : "transform 0.1s" }}>
          <img
            src={url} alt={filename} draggable={false}
            className="max-w-[95vw] max-h-[88vh] object-contain rounded-lg shadow-2xl select-none"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick, disabled, loading, icon: Icon, label, variant = "default"
}: {
  onClick: () => void; disabled?: boolean; loading?: boolean
  icon: any; label?: string; variant?: "default" | "destructive"
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "destructive"
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-border/50"
      )}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Icon className="h-3.5 w-3.5" />}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}

// ─── Bulk Actions Bar ─────────────────────────────────────────────────────────

function BulkActionsBar({
  selectedCount, onArchive, onMove, onChmod, onDelete,
  onClear, busy, recursive, onRecursiveChange, t, isSftpMode
}: {
  selectedCount: number; onArchive: () => void; onMove: () => void
  onChmod: () => void; onDelete: () => void; onClear: () => void
  busy: boolean; recursive: boolean; onRecursiveChange: (v: boolean) => void
  t: any; isSftpMode?: boolean
}) {
  if (selectedCount === 0) return null

  return (
    <div className={cn(
      "border-t border-primary/20 bg-primary/5 px-4 py-2.5",
      "animate-in slide-in-from-bottom-1 duration-150"
    )}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <button onClick={onClear} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold text-foreground">
            {selectedCount} selected
          </span>
          <label className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox" checked={recursive}
              onChange={e => onRecursiveChange(e.target.checked)}
              className="h-3 w-3 rounded"
            />
            Recursive
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSftpMode && (
            <ToolbarBtn onClick={onArchive} disabled={busy} icon={Archive} label={t("actions.archive")} />
          )}
          <ToolbarBtn onClick={onMove} disabled={busy} icon={Move} label={t("actions.move")} />
          <ToolbarBtn onClick={onChmod} disabled={busy} icon={Shield} label="Chmod" />
          <ToolbarBtn onClick={onDelete} disabled={busy} icon={Trash2} label={t("actions.delete")} variant="destructive" />
        </div>
      </div>
    </div>
  )
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateItemForm({ type, value, onChange, onSubmit, onCancel, t }: {
  type: "file" | "folder"; value: string; onChange: (v: string) => void
  onSubmit: () => void; onCancel: () => void; t: any
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2.5 animate-in slide-in-from-top-1 duration-150">
      {type === "folder"
        ? <FolderPlus className="h-4 w-4 text-amber-400 flex-shrink-0" />
        : <FilePlus className="h-4 w-4 text-primary flex-shrink-0" />}
      <input
        ref={ref} type="text" value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={type === "file" ? t("inputs.fileNamePlaceholder") : t("inputs.folderNamePlaceholder")}
        className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        onKeyDown={e => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel() }}
      />
      <Button size="sm" onClick={onSubmit} className="gap-1 h-7 text-xs">
        <Check className="h-3 w-3" /> Create
      </Button>
      <button onClick={onCancel} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Drop Overlay ─────────────────────────────────────────────────────────────

function DropZoneOverlay({ active, t }: { active: boolean; t: any }) {
  if (!active) return null
  return (
    <div className="absolute inset-0 z-30 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-3 text-primary">
        <div className="p-4 rounded-full bg-primary/15">
          <Upload className="h-8 w-8" />
        </div>
        <p className="font-semibold">{t("states.dropToUpload")}</p>
      </div>
    </div>
  )
}

// ─── SFTP Connection Panel ────────────────────────────────────────────────────

function SftpConnectionPanel({
  sftpInfo, sftpPassword, setSftpPassword, sftpAuthorized,
  sftpChecking, sftpError, onConnect, canUseSftp,
  sftpCommand, onCopyCommand, t
}: {
  sftpInfo?: SftpInfo | null
  sftpPassword: string; setSftpPassword: (v: string) => void
  sftpAuthorized: boolean; sftpChecking: boolean; sftpError: string | null
  onConnect: () => void; canUseSftp: boolean
  sftpCommand: string; onCopyCommand: () => void; t: any
}) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="border-b border-border bg-gradient-to-b from-secondary/20 to-transparent">
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 text-sm font-medium",
            sftpAuthorized ? "text-emerald-400" : "text-muted-foreground"
          )}>
            <div className={cn(
              "h-2 w-2 rounded-full",
              sftpAuthorized ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-muted-foreground/40"
            )} />
            {sftpAuthorized ? t("states.sftpConnected") : t("states.sftpNotConnected")}
          </div>

          {canUseSftp && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{sftpInfo?.username ?? "—"}@{sftpInfo?.host}:{sftpInfo?.port}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? t("actions.hide") : t("actions.details")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
        </button>
      </div>

      {/* Expandable Details */}
      {showDetails && (
        <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-1 duration-150">
          {/* Info Cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t("labels.host"), value: sftpInfo?.host || "—", icon: Globe },
              { label: t("labels.port"), value: sftpInfo?.port?.toString() || "—", icon: Server },
              { label: t("labels.username"), value: sftpInfo?.username ?? "—", icon: Terminal },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                </div>
                <p className="text-sm font-mono text-foreground truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Command */}
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">{t("labels.sftpCommand")}</p>
              <button
                onClick={onCopyCommand}
                disabled={!canUseSftp}
                className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
              >
                {t("actions.copy")}
              </button>
            </div>
            <code className="block text-xs font-mono text-foreground/80 overflow-x-auto whitespace-nowrap">
              {sftpCommand || "—"}
            </code>
          </div>

          {/* KVM Notes */}
          <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-3 text-xs text-indigo-300/80 space-y-1.5">
            <p className="font-semibold text-indigo-200">{t("kvmNotes.title")}</p>
            <ul className="list-disc pl-4 space-y-1 leading-relaxed">
              <li>{t("kvmNotes.usePrimary")}</li>
              <li>
                {t("kvmNotes.defaultCredentials")} {" "}
                <code className="bg-indigo-500/10 px-1 rounded">root</code>{" / "}
                <code className="bg-indigo-500/10 px-1 rounded">changeme</code>
              </li>
              <li>{t("kvmNotes.filesystemManaged")}</li>
            </ul>
          </div>
        </div>
      )}

      {/* Auth Row (always visible when not authorized) */}
      {!sftpAuthorized && (
        <div className="px-4 pb-3 flex items-start gap-2">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="password"
                value={sftpPassword}
                onChange={e => setSftpPassword(e.target.value)}
                placeholder={t("inputs.sftpPassword")}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                onKeyDown={e => e.key === "Enter" && onConnect()}
              />
              <button
                onClick={onConnect}
                disabled={sftpChecking || !sftpPassword}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {sftpChecking
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Unlock className="h-3.5 w-3.5" />}
                {t("actions.connect")}
              </button>
            </div>
            {sftpError && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 pl-5">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                {sftpError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── File Row ─────────────────────────────────────────────────────────────────

function FileRow({
  file, path, isSelected, onToggle, onOpen, onEdit, onRename,
  onDownload, onChmod, onDelete, t
}: {
  file: FileItem; path: string; isSelected: boolean
  onToggle: () => void; onOpen: () => void; onEdit: () => void
  onRename: () => void; onDownload: () => void
  onChmod: () => void; onDelete: () => void; t: any
}) {
  const fname = getFileName(file)
  const isDir = isDirectory(file)
  const fsize = getFileSize(file)
  const fmod = getModifiedDate(file)
  const isImage = isImageFile(fname)
  const isText = isTextFile(fname)

  return (
    <div className={cn(
      "group grid grid-cols-[28px_1fr_auto] sm:grid-cols-[28px_1fr_90px_140px_120px] items-center gap-2 px-4 py-2",
      "border-t border-border/50 text-sm transition-colors",
      "hover:bg-secondary/30",
      isSelected && "bg-primary/5 hover:bg-primary/8"
    )}>
      {/* Checkbox */}
      <input
        type="checkbox" checked={isSelected} onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-border accent-primary"
      />

      {/* Name */}
      <button
        onClick={onOpen}
        className="flex items-center gap-2 text-left min-w-0 group/name"
      >
        {getFileIcon(fname, isDir)}
        <span className={cn(
          "truncate transition-colors",
          isDir
            ? "text-foreground group-hover/name:text-amber-300"
            : "text-foreground/90 group-hover/name:text-primary"
        )}>
          {fname}
        </span>
        {isDir && (
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Mobile: size */}
      <span className="sm:hidden text-xs text-muted-foreground flex-shrink-0">
        {!isDir ? formatBytes(fsize) : ""}
      </span>

      {/* Size */}
      <span className="hidden sm:block text-xs text-muted-foreground tabular-nums">
        {!isDir ? formatBytes(fsize) : <span className="text-muted-foreground/30">—</span>}
      </span>

      {/* Modified */}
      <span className="hidden sm:block text-xs text-muted-foreground">
        {formatDate(fmod, t)}
      </span>

      {/* Actions */}
      <div className={cn(
        "hidden sm:flex items-center justify-end gap-0.5",
        "opacity-0 group-hover:opacity-100 transition-opacity"
      )}>
        {(isImage || isText) && !isDir && (
          <ActionBtn
            onClick={onEdit}
            icon={isImage ? Eye : Pencil}
            label={isImage ? "Preview" : "Edit"}
            className="hover:text-primary hover:bg-primary/10"
          />
        )}
        {!isDir && (
          <ActionBtn onClick={onRename} icon={Pencil} label="Rename"
            className="hover:text-foreground hover:bg-secondary/60" />
        )}
        {!isDir && (
          <ActionBtn onClick={onDownload} icon={Download} label="Download"
            className="hover:text-foreground hover:bg-secondary/60" />
        )}
        <ActionBtn onClick={onChmod} icon={Shield} label="Chmod"
          className="hover:text-foreground hover:bg-secondary/60" />
        <ActionBtn onClick={onDelete} icon={Trash2} label="Delete"
          className="hover:text-red-400 hover:bg-red-500/10" />
      </div>
    </div>
  )
}

function ActionBtn({ onClick, icon: Icon, label, className }: {
  onClick: () => void; icon: any; label: string; className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-1.5 rounded text-muted-foreground transition-colors",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FilesTab({ serverId, sftpInfo, editorSettings, isKvm }: FilesTabProps) {
  const t = useTranslations("serverFilesTab")
  const { toasts, toast, dismiss } = useToast()

  const [path, setPath] = useState("/")
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [createMode, setCreateMode] = useState<"file" | "folder" | null>(null)
  const [newName, setNewName] = useState("")
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imagePreviewName, setImagePreviewName] = useState("")
  const [chmodRecursive, setChmodRecursive] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [viewMode, setViewMode] = useState<"qemu" | "sftp">("qemu")
  const [sftpPassword, setSftpPassword] = useState("")
  const [sftpAuthorized, setSftpAuthorized] = useState(false)
  const [sftpChecking, setSftpChecking] = useState(false)
  const [sftpError, setSftpError] = useState<string | null>(null)
  const [sftpAutoTried, setSftpAutoTried] = useState(false)

  // Track whether the password was set programmatically (auto-connect)
  // to avoid the password-change effect from resetting authorization
  const autoConnectingRef = useRef(false)

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; description: string
    confirmLabel?: string; destructive?: boolean; onConfirm: () => void
  }>({ open: false, title: "", description: "", onConfirm: () => {} })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const breadcrumbs = useMemo(() => path.split("/").filter(Boolean), [path])
  const isSftpMode = isKvm && viewMode === "sftp"
  const canUseSftp = Boolean(isKvm && sftpInfo?.host && sftpInfo?.port && sftpInfo?.username)
  const sftpHeaders = useMemo<Record<string, string> | undefined>(
    () => sftpPassword ? { "x-sftp-password": sftpPassword } : undefined,
    [sftpPassword]
  )

  const sftpCommand = sftpInfo && sftpInfo.host && sftpInfo.port
    ? `sftp ${sftpInfo.username || "root"}@${sftpInfo.host} -P ${sftpInfo.port}`
    : ""

  const selectableFiles = useMemo(() => files.map(getFileName).filter(Boolean), [files])
  const allSelected = useMemo(
    () => selectableFiles.length > 0 && selectableFiles.every(n => selectedNames.includes(n)),
    [selectableFiles, selectedNames]
  )
  const sortedFiles = useMemo(() => [...files].sort((a, b) => {
    const aDir = isDirectory(a), bDir = isDirectory(b)
    if (aDir && !bDir) return -1
    if (!aDir && bDir) return 1
    return getFileName(a).localeCompare(getFileName(b))
  }), [files])

  // ── Confirm helper ──────────────────────────────────────────────────────────
  const showConfirm = useCallback((
    title: string, description: string,
    onConfirm: () => void,
    opts?: { confirmLabel?: string; destructive?: boolean }
  ) => {
    setConfirm({ open: true, title, description, onConfirm, ...opts })
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirm(prev => ({ ...prev, open: false }))
  }, [])

  // ── Load files ──────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async (p: string) => {
    setLoading(true)
    try {
      if (isSftpMode && !sftpAuthorized) { setFiles([]); return }
      const base = isSftpMode
        ? API_ENDPOINTS.serverSftpFiles.replace(":id", serverId)
        : API_ENDPOINTS.serverFiles.replace(":id", serverId)
      const data = await apiFetch(`${base}?path=${encodeURIComponent(p)}`, {
        headers: isSftpMode ? sftpHeaders : undefined,
      })
      setFiles(Array.isArray(data) ? data : [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [serverId, isSftpMode, sftpAuthorized, sftpHeaders])

  // ── Auto SFTP auth ──────────────────────────────────────────────────────────
  const tryAutoSftpPassword = useCallback(async () => {
    if (!isSftpMode || sftpAuthorized || sftpAutoTried || !serverId) return
    setSftpChecking(true)
    setSftpAutoTried(true)
    try {
      const startup = await apiFetch(API_ENDPOINTS.serverStartup.replace(":id", serverId))
      const candidate =
        startup?.environment?.ROOT_PASSWORD ||
        startup?.environment?.root_password ||
        startup?.environment?.rootPassword
      if (!candidate) return
      const headers = { "x-sftp-password": String(candidate) }
      await apiFetch(
        API_ENDPOINTS.serverSftpValidate.replace(":id", serverId) + `?path=${encodeURIComponent(path)}`,
        { method: "POST", headers }
      )
      // Set both atomically — mark that we're auto-connecting so the
      // password-change effect doesn't reset sftpAuthorized
      autoConnectingRef.current = true
      setSftpPassword(String(candidate))
      setSftpAuthorized(true)
      toast("success", t("states.sftpAutoConnected"))
    } catch {
      setSftpPassword("")
      setSftpAuthorized(false)
    } finally {
      setSftpChecking(false)
    }
  }, [isSftpMode, sftpAuthorized, sftpAutoTried, serverId, path, toast])

  useEffect(() => { loadFiles(path) }, [path, loadFiles])
  useEffect(() => { setSelectedNames([]) }, [path])

  // Only reset sftpAuthorized on manual password changes, not auto-connect
  useEffect(() => {
    if (autoConnectingRef.current) {
      autoConnectingRef.current = false
      return
    }
    if (sftpAuthorized) setSftpAuthorized(false)
  }, [sftpPassword]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!isSftpMode && sftpAutoTried) setSftpAutoTried(false) }, [isSftpMode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { tryAutoSftpPassword() }, [tryAutoSftpPassword])
  useEffect(() => () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl) }, [imagePreviewUrl])

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (fileList: FileList) => {
    if (!fileList.length) return
    if (isSftpMode && !sftpAuthorized) { toast("error", t("errors.sftpAuthRequired")); return }
    setUploading(true)
    try {
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]
        const buf = await f.arrayBuffer()
        const filePath = path.endsWith("/") ? `${path}${f.name}` : `${path}/${f.name}`
        const url = (isSftpMode
          ? API_ENDPOINTS.serverSftpFileUpload.replace(":id", serverId)
          : API_ENDPOINTS.serverFileUpload.replace(":id", serverId)) +
          `?path=${encodeURIComponent(filePath)}`
        const res = await fetch(url, {
          method: "POST", credentials: "include",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            "Content-Type": "application/octet-stream",
            ...(isSftpMode ? sftpHeaders : {}),
          },
          body: new Uint8Array(buf),
        })
        if (!res.ok) throw new Error(await res.text() || `Upload failed: ${res.status}`)
      }
      toast("success", `Uploaded ${fileList.length} file${fileList.length > 1 ? "s" : ""}`)
      await loadFiles(path)
    } catch (err: any) {
      toast("error", t("errors.uploadFailed", { reason: err?.message || err }))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [isSftpMode, sftpAuthorized, sftpHeaders, path, serverId, toast, t, loadFiles])

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const onEnter = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes("Files")) setIsDragActive(true)
    }
    const onLeave = (e: DragEvent) => {
      e.preventDefault()
      const related = e.relatedTarget as Node | null
      if (!related || !el.contains(related)) {
        setIsDragActive(false)
      }
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragActive(false)
      if (e.dataTransfer?.files) handleFileUpload(e.dataTransfer.files)
    }
    el.addEventListener("dragenter", onEnter)
    el.addEventListener("dragleave", onLeave)
    el.addEventListener("dragover", onOver)
    el.addEventListener("drop", onDrop)
    return () => {
      el.removeEventListener("dragenter", onEnter)
      el.removeEventListener("dragleave", onLeave)
      el.removeEventListener("dragover", onOver)
      el.removeEventListener("drop", onDrop)
    }
  }, [path, handleFileUpload])

  // ── Connect SFTP ────────────────────────────────────────────────────────────
  const connectSftp = async () => {
    if (!sftpPassword) { setSftpError(t("errors.sftpAuthRequired")); return }
    setSftpChecking(true); setSftpError(null)
    try {
      await apiFetch(
        API_ENDPOINTS.serverSftpValidate.replace(":id", serverId) + `?path=${encodeURIComponent(path)}`,
        { method: "POST", headers: sftpHeaders }
      )
      setSftpAuthorized(true)
      toast("success", t("states.sftpConnected"))
    } catch (err: any) {
      setSftpAuthorized(false)
      setSftpError(err?.message || t("errors.sftpAuthFailed"))
    } finally {
      setSftpChecking(false)
    }
  }

  // ── Open file ───────────────────────────────────────────────────────────────
  const openFile = async (filePath: string) => {
    const name = filePath.split("/").pop() || filePath

    if (isImageFile(name)) {
      try {
        const res = await fetch(
          API_ENDPOINTS.serverFileDownload.replace(":id", serverId) + `?path=${encodeURIComponent(filePath)}`,
          { credentials: "include", headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
        setImagePreviewUrl(URL.createObjectURL(blob))
        setImagePreviewName(name)
      } catch (e: any) {
        toast("error", t("errors.imagePreviewFailed", { reason: e?.message }))
      }
      return
    }

    if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(null) }

    if (isBinaryFile(name)) { toast("warning", t("errors.binaryNotEditable")); return }

    if (!isTextFile(name)) {
      showConfirm(
        t("confirm.openUnknownFileTitle"),
        t("confirm.openUnknownFileDescription", { name }),
        async () => {
          closeConfirm()
          await doOpenFile(filePath)
        },
        { confirmLabel: t("confirm.openAnyway") }
      )
      return
    }

    await doOpenFile(filePath)
  }

  const doOpenFile = async (filePath: string) => {
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileContents.replace(":id", serverId)
        : API_ENDPOINTS.serverFileContents.replace(":id", serverId)
      const data = await apiFetch(`${ep}?path=${encodeURIComponent(filePath)}`, {
        headers: isSftpMode ? sftpHeaders : undefined,
      })
      setFileContent(typeof data === "string" ? data : JSON.stringify(data, null, 2))
      setEditingFile(filePath)
    } catch (e: any) {
      toast("error", t("errors.openFailed", { reason: e.message }))
    }
  }

  // ── Save file ───────────────────────────────────────────────────────────────
  const saveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileWrite.replace(":id", serverId)
        : API_ENDPOINTS.serverFileWrite.replace(":id", serverId)
      await apiFetch(ep, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ path: editingFile, content: fileContent }),
      })
      toast("success", t("states.fileSaved"))
      setEditingFile(null)
    } catch (e: any) {
      toast("error", t("errors.saveFailed", { reason: e.message }))
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteFile = (filePath: string) => {
    const name = filePath.split("/").pop() || filePath
    showConfirm(
      "Delete file",
      `Delete "${name}"? This cannot be undone.`,
      async () => {
        closeConfirm()
        try {
          const ep = isSftpMode
            ? API_ENDPOINTS.serverSftpFileDelete.replace(":id", serverId)
            : API_ENDPOINTS.serverFileDelete.replace(":id", serverId)
          await apiFetch(ep, {
            method: "POST",
            headers: isSftpMode ? sftpHeaders : undefined,
            body: JSON.stringify({ path: filePath }),
          })
          toast("success", `Deleted "${name}"`)
          loadFiles(path)
        } catch (e: any) {
          toast("error", t("errors.deleteFailed", { reason: e.message }))
        }
      },
      { confirmLabel: "Delete", destructive: true }
    )
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  const createItem = async () => {
    if (!newName.trim() || !createMode) return
    const trimmed = newName.trim()
    const existing = files.find(f => getFileName(f) === trimmed)
    if (existing) {
      const isDir = isDirectory(existing)
      if (createMode === "file" && !isDir) {
        showConfirm("File exists", `"${trimmed}" already exists. Open it?`, () => {
          closeConfirm(); openFile(path + trimmed)
          setCreateMode(null); setNewName("")
        }, { confirmLabel: "Open" })
        return
      }
      toast("warning", t("errors.itemExists", { name: trimmed }))
      return
    }
    try {
      if (createMode === "folder") {
        await apiFetch(
          (isSftpMode
            ? API_ENDPOINTS.serverSftpFileCreateDir
            : API_ENDPOINTS.serverFileCreateDir).replace(":id", serverId),
          { method: "POST", headers: isSftpMode ? sftpHeaders : undefined, body: JSON.stringify({ path: path + trimmed }) }
        )
      } else {
        await apiFetch(
          (isSftpMode
            ? API_ENDPOINTS.serverSftpFileWrite
            : API_ENDPOINTS.serverFileWrite).replace(":id", serverId),
          { method: "POST", headers: isSftpMode ? sftpHeaders : undefined, body: JSON.stringify({ path: path + trimmed, content: "" }) }
        )
      }
      toast("success", `Created "${trimmed}"`)
      setNewName(""); setCreateMode(null); loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.actionFailed", { reason: e.message }))
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  const renameFile = async (oldName: string) => {
    const newFileName = window.prompt(t("prompts.renameTo"), oldName)
    if (!newFileName || newFileName === oldName) return
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileRename.replace(":id", serverId)
        : API_ENDPOINTS.serverFileRename.replace(":id", serverId)
      await apiFetch(ep, {
        method: "PUT",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ root: path, files: [{ from: oldName, to: newFileName }] }),
      })
      toast("success", `Renamed to "${newFileName}"`)
      await loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.renameFailed", { reason: e?.message }))
    }
  }

  // ── Download ─────────────────────────────────────────────────────────────────
  const downloadFile = async (fileName: string) => {
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileDownload.replace(":id", serverId)
        : API_ENDPOINTS.serverFileDownload.replace(":id", serverId)
      const res = await fetch(
        ep + `?path=${encodeURIComponent(path + fileName)}`,
        {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            ...(isSftpMode ? sftpHeaders : {}),
          },
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast("error", t("errors.downloadFailed", { reason: e?.message }))
    }
  }

  // ── Chmod ────────────────────────────────────────────────────────────────────
  const chmodFile = async (filePath: string) => {
    const mode = window.prompt(t("prompts.chmodSingle"), "0644")
    if (!mode) return
    if (!/^[0-7]{3,4}$/.test(mode)) { toast("error", t("errors.invalidMode")); return }
    const recursive = window.confirm(t("confirm.applyRecursive"))
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileChmod.replace(":id", serverId)
        : API_ENDPOINTS.serverFileChmod.replace(":id", serverId)
      await apiFetch(ep, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ root: path, files: [{ file: filePath, mode, recursive }] }),
      })
      toast("success", "Permissions updated")
      await loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.permissionUpdateFailed", { reason: e?.message }))
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  const archiveSelected = async () => {
    if (!selectedNames.length) return
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileArchive.replace(":id", serverId), {
        method: "POST", body: JSON.stringify({ root: path, files: selectedNames }),
      })
      toast("success", t("states.archiveCreated"))
      setSelectedNames([]); await loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.archiveFailed", { reason: e.message }))
    } finally { setBulkBusy(false) }
  }

  const moveSelected = async () => {
    if (!selectedNames.length) return
    const dest = window.prompt(t("prompts.moveToFolder"), "")
    if (dest === null) return
    setBulkBusy(true)
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileMove.replace(":id", serverId)
        : API_ENDPOINTS.serverFileMove.replace(":id", serverId)
      await apiFetch(ep, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ root: path, files: selectedNames, destination: dest.trim().replace(/^\/+|\/+$/g, "") }),
      })
      toast("success", `Moved ${selectedNames.length} item${selectedNames.length > 1 ? "s" : ""}`)
      setSelectedNames([]); await loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.moveFailed", { reason: e.message }))
    } finally { setBulkBusy(false) }
  }

  const chmodSelected = async () => {
    if (!selectedNames.length) return
    const mode = window.prompt(t("prompts.chmodBulk"), "0644")
    if (!mode || !/^[0-7]{3,4}$/.test(mode)) { if (mode) toast("error", t("errors.invalidModeShort")); return }
    setBulkBusy(true)
    try {
      const ep = isSftpMode
        ? API_ENDPOINTS.serverSftpFileChmod.replace(":id", serverId)
        : API_ENDPOINTS.serverFileChmod.replace(":id", serverId)
      await apiFetch(ep, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ root: path, files: selectedNames.map(n => ({ file: n, mode, recursive: chmodRecursive })) }),
      })
      toast("success", "Permissions updated")
      setSelectedNames([]); await loadFiles(path)
    } catch (e: any) {
      toast("error", t("errors.bulkChmodFailed", { reason: e?.message }))
    } finally { setBulkBusy(false) }
  }

  const deleteSelected = () => {
    if (!selectedNames.length) return
    showConfirm(
      "Delete selected",
      `Delete ${selectedNames.length} item${selectedNames.length > 1 ? "s" : ""}? This cannot be undone.`,
      async () => {
        closeConfirm(); setBulkBusy(true)
        try {
          const ep = isSftpMode
            ? API_ENDPOINTS.serverSftpFileDelete.replace(":id", serverId)
            : API_ENDPOINTS.serverFileDelete.replace(":id", serverId)
          await apiFetch(ep, {
            method: "POST",
            headers: isSftpMode ? sftpHeaders : undefined,
            body: JSON.stringify({ path, files: selectedNames, bulk: true }),
          })
          toast("success", `Deleted ${selectedNames.length} item${selectedNames.length > 1 ? "s" : ""}`)
          setSelectedNames([]); await loadFiles(path)
        } catch (e: any) {
          toast("error", t("errors.bulkDeleteFailed", { reason: e.message }))
        } finally { setBulkBusy(false) }
      },
      { confirmLabel: "Delete all", destructive: true }
    )
  }

  // ── Navigate ──────────────────────────────────────────────────────────────────
  const navigateUp = () => {
    const parts = path.split("/").filter(Boolean)
    parts.pop()
    setPath(parts.length ? "/" + parts.join("/") + "/" : "/")
  }

  // ── Editor view ───────────────────────────────────────────────────────────────
  if (editingFile) {
    const ext = editingFile.split(".").pop()?.toLowerCase() || ""

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-secondary/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setEditingFile(null)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-border" />
            {getFileIcon(editingFile.split("/").pop() || "", false)}
            <span className="font-mono text-sm text-foreground/90 truncate">
              {displayPath(editingFile)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEditingFile(null)} className="h-7 text-xs">
              {t("actions.cancel")}
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving} className="h-7 text-xs gap-1.5">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t("actions.save")}
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoFileEditor
            value={fileContent}
            onChange={v => setFileContent(v ?? "")}
            language={MONACO_LANGUAGE_MAP[ext] || "plaintext"}
            editorSettings={editorSettings}
          />
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div ref={dropRef} className="flex flex-col relative min-h-[400px] h-full">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        onConfirm={confirm.onConfirm}
        onCancel={closeConfirm}
      />

      {imagePreviewUrl && (
        <ImagePreviewModal
          url={imagePreviewUrl} filename={imagePreviewName} t={t}
          onClose={() => { URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(null); setImagePreviewName("") }}
          onDownload={() => downloadFile(imagePreviewName)}
        />
      )}

      <DropZoneOverlay active={isDragActive} t={t} />

      {/* ── Mode Tabs (KVM only) ─────────────────────────────────────────── */}
      {isKvm && (
        <div className="flex items-center gap-1 border-b border-border px-4 pt-3 pb-0 bg-secondary/5">
          {[
            { key: "qemu", label: t("labels.qemuHostFolder"), icon: HardDrive },
            { key: "sftp", label: t("labels.vmFilesystemViaSftp"), icon: Wifi },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setPath("/")
                setViewMode(key as "qemu" | "sftp")
                if (key !== viewMode) { setSftpAuthorized(false); setSftpError(null); setSftpAutoTried(false) }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md border border-b-0 transition-colors -mb-px",
                viewMode === key
                  ? "border-border bg-background text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key === "sftp" && sftpAuthorized && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ml-0.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── SFTP Connection Panel ────────────────────────────────────────── */}
      {isSftpMode && (
        <SftpConnectionPanel
          sftpInfo={sftpInfo}
          sftpPassword={sftpPassword}
          setSftpPassword={setSftpPassword}
          sftpAuthorized={sftpAuthorized}
          sftpChecking={sftpChecking}
          sftpError={sftpError}
          onConnect={connectSftp}
          canUseSftp={canUseSftp}
          sftpCommand={sftpCommand}
          onCopyCommand={() => {
            navigator.clipboard.writeText(sftpCommand)
            toast("info", t("states.commandCopied"))
          }}
          t={t}
        />
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 bg-secondary/5">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto min-w-0 flex-1 scrollbar-none">
          <button
            onClick={() => setPath("/")}
            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-colors flex-shrink-0"
          >
            <HardDrive className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setPath("/")}
            className={cn(
              "font-mono text-xs hover:text-primary transition-colors flex-shrink-0",
              breadcrumbs.length === 0 ? "text-foreground font-semibold" : "text-muted-foreground hover:underline"
            )}
          >
            {isKvm ? "/" : "/home/container"}
          </button>
          {breadcrumbs.map((crumb, i) => (
            <Fragment key={i}>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
              <button
                onClick={() => setPath("/" + breadcrumbs.slice(0, i + 1).join("/") + "/")}
                className={cn(
                  "font-mono text-xs transition-colors flex-shrink-0",
                  i === breadcrumbs.length - 1
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-primary hover:underline"
                )}
              >
                {crumb}
              </button>
            </Fragment>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => e.target.files && handleFileUpload(e.target.files)}
          />

          <ToolbarBtn
            onClick={() => fileInputRef.current?.click()}
            disabled={isSftpMode && !sftpAuthorized}
            loading={uploading}
            icon={Upload}
            label={t("actions.upload")}
          />
          <ToolbarBtn
            onClick={() => { setCreateMode("file"); setNewName("") }}
            disabled={isSftpMode && !sftpAuthorized}
            icon={FilePlus}
            label={t("actions.newFile")}
          />
          <ToolbarBtn
            onClick={() => { setCreateMode("folder"); setNewName("") }}
            disabled={isSftpMode && !sftpAuthorized}
            icon={FolderPlus}
            label={t("actions.newFolder")}
          />
          <div className="h-4 w-px bg-border/60 mx-0.5" />
          <ToolbarBtn
            onClick={() => loadFiles(path)}
            icon={RefreshCw}
            loading={loading}
          />
        </div>
      </div>

      {/* ── Create form ──────────────────────────────────────────────────── */}
      {createMode && (
        <CreateItemForm
          type={createMode} value={newName}
          onChange={setNewName} onSubmit={createItem}
          onCancel={() => setCreateMode(null)} t={t}
        />
      )}

      {/* ── Table Header ─────────────────────────────────────────────────── */}
      <div className="hidden sm:grid grid-cols-[28px_1fr_90px_140px_120px] gap-2 px-4 py-2 bg-secondary/30 border-b border-border/50">
        <input
          type="checkbox" checked={allSelected} onChange={() => setSelectedNames(allSelected ? [] : selectableFiles)}
          className="h-3.5 w-3.5 accent-primary"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("table.name")}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("table.size")}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("table.modified")}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">{t("table.actions")}</span>
      </div>

      {/* ── Parent dir navigation ─────────────────────────────────────────── */}
      {path !== "/" && (
        <button
          onClick={navigateUp}
          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/30 border-b border-border/50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono">..</span>
        </button>
      )}

      {/* ── File List ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin opacity-50" />
            <p className="text-sm">{t("states.loadingFiles")}</p>
          </div>
        ) : isSftpMode && !sftpAuthorized ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
            <div className="p-4 rounded-full bg-secondary/50">
              <Lock className="h-8 w-8 opacity-40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/70">Authentication required</p>
              <p className="text-xs mt-1">Enter your SFTP password above to browse files</p>
            </div>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <div className="p-4 rounded-full bg-secondary/30">
              <Folder className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-sm">{t("states.emptyDirectory")}</p>
            <p className="text-xs">Drop files here to upload, or create a new file</p>
          </div>
        ) : (
          sortedFiles.map((file, i) => (
            <FileRow
              key={i} file={file} path={path}
              isSelected={selectedNames.includes(getFileName(file))}
              onToggle={() => {
                const name = getFileName(file)
                setSelectedNames(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
              }}
              onOpen={() => isDirectory(file)
                ? setPath(path + getFileName(file) + "/")
                : openFile(path + getFileName(file))
              }
              onEdit={() => openFile(path + getFileName(file))}
              onRename={() => renameFile(getFileName(file))}
              onDownload={() => downloadFile(getFileName(file))}
              onChmod={() => chmodFile(path + getFileName(file))}
              onDelete={() => deleteFile(path + getFileName(file))}
              t={t}
            />
          ))
        )}
      </div>

      {/* ── Bulk Actions ─────────────────────────────────────────────────── */}
      <BulkActionsBar
        selectedCount={selectedNames.length}
        onArchive={archiveSelected}
        onMove={moveSelected}
        onChmod={chmodSelected}
        onDelete={deleteSelected}
        onClear={() => setSelectedNames([])}
        busy={bulkBusy}
        recursive={chmodRecursive}
        onRecursiveChange={setChmodRecursive}
        t={t}
        isSftpMode={isSftpMode}
      />
    </div>
  )
}