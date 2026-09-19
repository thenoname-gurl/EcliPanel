"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import {
  HardDrive,
  Folder,
  File,
  Upload,
  Download,
  Loader2,
  Image,
  FileText,
  Film,
  Music,
  Archive,
  Link2,
  X,
  Copy,
  Check,
  Eye,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  FolderPlus,
  Trash2,
  Pencil,
  Lock,
  ExternalLink,
  Calendar,
  RefreshCw,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DriveEntry {
  name: string
  size: number
  directory: boolean
  modified: string | null
}

interface DriveState {
  quotaBytes: number
  usedBytes: number
  quotaGB: number
  usedGB: number
  usagePercent: number
  directory: string
  serverUuid: string
  entries: DriveEntry[]
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function fileIcon(entry: DriveEntry) {
  if (entry.directory) return Folder
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return Image
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return Film
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) return Music
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return Archive
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return FileText
  return File
}

function isImageEntry(entry: DriveEntry): boolean {
  if (entry.directory) return false
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)
}

function isVideoEntry(entry: DriveEntry): boolean {
  if (entry.directory) return false
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  return ["mp4", "webm", "mov", "avi", "mkv", "mpg", "mpeg"].includes(ext)
}

// ─── Share File Link Modal ─────────────────────────────────────────────────────

function ShareFileModal({
  serverUuid, filePath, fileName, onClose, toast,
}: {
  serverUuid: string; filePath: string; fileName: string
  onClose: () => void; toast: (type: "success" | "error" | "info" | "warning", msg: string) => void
}) {
  const t = useTranslations("serverFilesTab.shareModal")
  const [expiresIn, setExpiresIn] = useState("1d")
  const [creating, setCreating] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const DURATIONS = [
    { value: "1h", label: t("duration1h") },
    { value: "1d", label: t("duration1d") },
    { value: "1w", label: t("duration1w") },
    { value: "1m", label: t("duration1m") },
    { value: "1y", label: t("duration1y") },
    { value: "permanent", label: t("durationPermanent") },
  ]

  const createShareLink = async () => {
    setCreating(true)
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFileShares.replace(":id", serverUuid),
        { method: "POST", body: JSON.stringify({ filePath, expiresIn }) }
      )
      if (data?.url) {
        setShareUrl(data.url)
        toast("success", t("toastCreated"))
      } else {
        toast("error", t("toastFailed"))
      }
    } catch (err: any) {
      toast("error", err?.message || t("toastFailed"))
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        toast("error", t("toastCopyFailed"))
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md border border-border bg-popover p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Link2 className="h-4 w-4 text-violet-400" />
            <h3 className="font-semibold text-foreground">{t("title")}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" data-telemetry="drive:close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-secondary/20 border border-border/60 px-3.5 py-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">{t("file")}</p>
            <p className="text-sm font-mono text-foreground truncate">{fileName}</p>
          </div>

          {!shareUrl ? (
            <>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                  <Clock className="h-3 w-3" />
                  {t("linkExpiration")}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DURATIONS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setExpiresIn(d.value)}
                      className={cn(
                        "border px-2.5 py-1.5 text-xs font-medium transition-all",
                        expiresIn === d.value
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs" data-telemetry="drive:close">
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={createShareLink}
                  disabled={creating}
                  className="h-8 text-xs gap-1.5"
                  data-telemetry="drive:createsharelink"
                >
                  {creating ? <Loader2 className="h-3 w-3 rounded-full animate-spin" /> : <Link2 className="h-3 w-3" />}
                  {t("createShareLink")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {t("shareLinkDescription")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button size="sm" onClick={copyLink} className="h-8 text-xs gap-1 flex-shrink-0" data-telemetry="drive:copylink">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs" data-telemetry="drive:close">
                  {t("close")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShareUrl(null); setCopied(false) }}
                  className="h-8 text-xs gap-1"
                >
                  <Link2 className="h-3 w-3" />
                  {t("shareAnother")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared Links Manager Modal ──────────────────────────────────────────────

interface ShareEntry {
  id: string
  token: string
  filePath: string
  expiresIn: string
  expiresAt: string | null
  downloads: number
  active: boolean
  createdAt: string
  url: string
}

function ShareLinksModal({ serverUuid, onClose, toast }: {
  serverUuid: string
  onClose: () => void
  toast: (type: "success" | "error" | "info" | "warning", msg: string) => void
}) {
  const [shares, setShares] = useState<ShareEntry[] | null>(null)
  const [sError, setSError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ShareEntry | null>(null)

  const load = useCallback(async () => {
    setSError("")
    try {
      const data = await apiFetch(API_ENDPOINTS.serverFileShares.replace(":id", serverUuid))
      setShares(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setSError(err?.message || "Failed to load shared links")
    }
  }, [serverUuid])

  useEffect(() => { void load() }, [load])

  const copyLink = async (share: ShareEntry) => {
    try {
      await navigator.clipboard.writeText(share.url)
      setCopiedId(share.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast("success", "Link copied to clipboard")
    } catch {
      toast("error", "Could not copy link")
    }
  }

  const revoke = async (share: ShareEntry) => {
    setDeleting(share.id)
    try {
      await apiFetch(
        API_ENDPOINTS.serverFileShareDelete.replace(":id", serverUuid).replace(":shareId", share.id),
        { method: "DELETE" }
      )
      setShares(prev => (prev ?? []).filter(s => s.id !== share.id))
      setRevokeTarget(null)
      toast("success", "Shared link revoked")
    } catch (err: any) {
      toast("error", err?.message || "Failed to revoke link")
    } finally {
      setDeleting(null)
    }
  }

  const isExpired = (s: ShareEntry) => s.expiresAt ? new Date(s.expiresAt) < new Date() : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-xl flex-col border border-border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Link2 className="h-4 w-4 text-violet-400" />
            <h3 className="font-semibold text-foreground">Shared links</h3>
            {shares && shares.length > 0 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{shares.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void load()} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Refresh" data-telemetry="drive:shares:refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Close" data-telemetry="drive:shares:close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {sError && <p className="mb-3 text-sm text-destructive">{sError}</p>}
          {!shares ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
              <Link2 className="h-9 w-9 opacity-30" />
              <p className="text-sm">No shared links yet</p>
              <p className="text-xs">Share a file from the Drive list, then manage it here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shares.map(share => {
                const expired = isExpired(share)
                return (
                  <div key={share.id} className={cn("border border-border bg-secondary/20 p-3", (!share.active || expired) && "opacity-50")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-mono text-foreground" title={share.filePath}>
                          {share.filePath.replace(/^drive\//, "")}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(share.createdAt).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {share.expiresIn === "permanent" ? "Never" : share.expiresIn}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {share.downloads}×
                          </span>
                          <span className={cn("flex items-center gap-1", (!share.active || expired) ? "text-destructive" : "text-emerald-400")}>
                            {!share.active ? "Disabled" : expired ? "Expired" : "Active"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => copyLink(share)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          title="Copy link"
                          data-telemetry="drive:shares:copy"
                        >
                          {copiedId === share.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <a
                          href={share.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          title="Open"
                          data-telemetry="drive:shares:open"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => setRevokeTarget(share)}
                          disabled={deleting === share.id}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                          title="Revoke"
                          data-telemetry="drive:shares:revoke"
                        >
                          {deleting === share.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke shared link?</AlertDialogTitle>
            <AlertDialogDescription>
              This link will stop working immediately. The file itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeTarget && (
            <div className="bg-secondary/20 border border-border/60 px-3.5 py-2.5 text-sm font-mono text-foreground truncate">
              {revokeTarget.filePath}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting === revokeTarget?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting === revokeTarget?.id} onClick={() => revokeTarget && revoke(revokeTarget)}>
              {deleting === revokeTarget?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Image Preview ────────────────────────────────────────────────────────────

function ImagePreviewModal({ url, filename, onClose, onDownload }: {
  url: string; filename: string; onClose: () => void; onDownload: () => void
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
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" data-telemetry="drive:close">
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
            <button key={i} onClick={action} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" data-telemetry="drive:action">
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button onClick={toggleFullscreen} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors hidden sm:flex" data-telemetry="drive:togglefullscreen">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onDownload} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" data-telemetry="drive:download">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

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
            className="max-w-[95vw] max-h-[88vh] object-contain shadow-2xl select-none"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DrivePage() {
  const t = useTranslations("drivePage")
  const { user } = useAuth()
  const [state, setState] = useState<DriveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [currentDir, setCurrentDir] = useState("/")
  const [uploading, setUploading] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])
  const [share, setShare] = useState<DriveEntry | null>(null)
  const [toasts, setToasts] = useState<{ id: number; type: "success" | "error" | "info" | "warning"; msg: string }[]>([])
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [mkdirBusy, setMkdirBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DriveEntry | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [renameTarget, setRenameTarget] = useState<DriveEntry | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)
  const [showShares, setShowShares] = useState(false)

  const toast = useCallback((type: "success" | "error" | "info" | "warning", msg: string) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, msg }])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4000)
  }, [])

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview.url) }, [imagePreview])

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true)
    setError("")
    try {
      const params = dir !== "/" ? `?path=${encodeURIComponent(dir)}` : ""
      const data = await apiFetch(`${API_ENDPOINTS.userDrive}${params}`)
      setState(data)
      setBreadcrumbs(dir === "/" ? [] : dir.split("/").filter(Boolean))
    } catch (err: any) {
      setError(err.message || t("loadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadDir(currentDir)
  }, [currentDir, loadDir])

  const navigateTo = (dir: string) => setCurrentDir(dir)

  const navigateBreadcrumbs = (index: number) => {
    if (index < 0) {
      setCurrentDir("/")
    } else {
      const parts = breadcrumbs.slice(0, index + 1)
      setCurrentDir("/" + parts.join("/"))
    }
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("name", file.name)
        const timeout = Math.min(600000, Math.max(120000, Math.ceil(file.size / (1024 * 1024)) * 30000))
        await apiFetch(`${API_ENDPOINTS.userDriveUpload}?path=${encodeURIComponent(currentDir === "/" ? "" : currentDir)}`, {
          method: "PUT",
          body: fd,
          timeout,
        })
      }
      await loadDir(currentDir)
    } catch (err: any) {
      setError(err.message || t("uploadError"))
    } finally {
      setUploading(false)
    }
  }

  const fullPathFor = (entry: DriveEntry) =>
    currentDir === "/" ? entry.name : `${currentDir.replace(/^\/+|\/+$/g, "")}/${entry.name}`

  const isReadOnlyDir = !currentDir.startsWith("/drive")
  const isDeletable = (entry: DriveEntry) => fullPathFor(entry).startsWith("drive/")

  const handleMkdir = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setMkdirBusy(true)
    try {
      const base = currentDir === "/" ? "drive" : currentDir.replace(/^\/+|\/+$/g, "")
      await apiFetch(API_ENDPOINTS.userDriveMkdir, {
        method: "POST",
        body: { path: `${base}/${name}` },
      })
      setMkdirOpen(false)
      setNewFolderName("")
      toast("success", t("create"))
      await loadDir(currentDir)
    } catch (err: any) {
      toast("error", err.message || t("mkdirError"))
    } finally {
      setMkdirBusy(false)
    }
  }

  const handleDelete = async (entry: DriveEntry) => {
    setDeleteBusy(true)
    try {
      await apiFetch(`${API_ENDPOINTS.userDrive}?path=${encodeURIComponent(fullPathFor(entry))}`, {
        method: "DELETE",
      })
      setDeleteTarget(null)
      toast("success", t("delete"))
      await loadDir(currentDir)
    } catch (err: any) {
      toast("error", err.message || t("deleteError"))
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    setRenameBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.userDriveRename, {
        method: "POST",
        body: { path: fullPathFor(renameTarget), newName: name },
      })
      setRenameTarget(null)
      toast("success", t("rename"))
      await loadDir(currentDir)
    } catch (err: any) {
      toast("error", err.message || t("renameError"))
    } finally {
      setRenameBusy(false)
    }
  }

  const fetchDriveBlob = async (filePath: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(
      `${API_ENDPOINTS.userDriveDownload}?path=${encodeURIComponent(filePath)}`,
      { credentials: "include", headers }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }

  const handleOpenEntry = async (entry: DriveEntry) => {
    if (entry.directory) {
      navigateTo(currentDir === "/" ? `/${entry.name}` : `${currentDir}/${entry.name}`)
      return
    }
    const filePath = fullPathFor(entry)
    if (isImageEntry(entry)) {
      try {
        const blob = await fetchDriveBlob(filePath)
        if (imagePreview) URL.revokeObjectURL(imagePreview.url)
        setImagePreview({ url: URL.createObjectURL(blob), name: entry.name })
      } catch {}
      return
    }
    try {
      const blob = await fetchDriveBlob(filePath)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = entry.name
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleUpload(e.dataTransfer.files)
  }

  return (
    <FeatureGuard feature="drive">
      <PanelHeader
        title={t("title")}
        description={t("subtitle")}
      />
      <div className="p-4 md:p-6 space-y-4">
        {/* Toasts */}
        {toasts.length > 0 && (
          <div className="fixed top-4 right-4 z-[60] space-y-2">
            {toasts.map(ti => (
              <div key={ti.id} className={cn(
                "px-4 py-2.5 text-sm shadow-lg border text-foreground",
                ti.type === "success" && "border-emerald-500/40 bg-emerald-500/10",
                ti.type === "error" && "border-destructive/50 bg-destructive/10"
              )}>
                {ti.msg}
              </div>
            ))}
          </div>
        )}

        {/* Quota bar */}
        {state && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatSize(state.usedBytes)} / {formatSize(state.quotaBytes)}</span>
              <span>{state.usagePercent.toFixed(1)}%</span>
            </div>
            <Progress value={state.usagePercent} className="h-2" />
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => navigateBreadcrumbs(-1)}
          >
            <HardDrive className="h-3.5 w-3.5 mr-1" />
            Drive
          </Button>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => navigateBreadcrumbs(i)}
              >
                {crumb}
              </Button>
            </span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {isReadOnlyDir ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-500">
              <Lock className="h-3.5 w-3.5" />
              {t("readOnly")}
            </span>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("drive-upload-input")?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                {t("upload")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMkdirOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1.5" />
                {t("newFolder")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowShares(true)}>
                <Link2 className="h-4 w-4 mr-1.5" />
                {t("sharedLinks")}
              </Button>
            </>
          )}
          <input
            id="drive-upload-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* File list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : state?.entries.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={isReadOnlyDir ? undefined : handleDrop}
          >
            <HardDrive className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div
            className="border rounded-lg divide-y"
            onDragOver={(e) => e.preventDefault()}
            onDrop={isReadOnlyDir ? undefined : handleDrop}
          >
            {state?.entries.map((entry) => {
              const Icon = fileIcon(entry)
              return (
                <div
                  key={entry.name}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group"
                  )}
                  onClick={() => handleOpenEntry(entry)}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", entry.directory ? "text-blue-500" : "text-muted-foreground")} />
                  <span className="flex-1 text-sm truncate">{entry.name}</span>
                  {!entry.directory && isImageEntry(entry) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenEntry(entry) }}
                      title="Preview"
                      className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-secondary transition-all shrink-0"
                      data-telemetry="drive:preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!entry.directory && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShare(entry) }}
                      title="Share"
                      className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-violet-300 hover:bg-secondary transition-all shrink-0"
                      data-telemetry="drive:share"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isDeletable(entry) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenameTarget(entry); setRenameValue(entry.name) }}
                      title={t("rename")}
                      className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-secondary transition-all shrink-0"
                      data-telemetry="drive:rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isDeletable(entry) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry) }}
                      title={t("delete")}
                      className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-secondary transition-all shrink-0"
                      data-telemetry="drive:delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!entry.directory && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatSize(entry.size)}
                    </span>
                  )}
                  {entry.modified && (
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {new Date(entry.modified).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {share && state?.serverUuid && (
        <ShareFileModal
          serverUuid={state.serverUuid}
          filePath={fullPathFor(share)}
          fileName={share.name}
          onClose={() => setShare(null)}
          toast={toast}
        />
      )}

      {showShares && state?.serverUuid && (
        <ShareLinksModal serverUuid={state.serverUuid} onClose={() => setShowShares(false)} toast={toast} />
      )}

      {imagePreview && (
        <ImagePreviewModal
          url={imagePreview.url}
          filename={imagePreview.name}
          onClose={() => { setImagePreview(null) }}
          onDownload={() => {
            const a = document.createElement("a")
            a.href = imagePreview.url
            a.download = imagePreview.name
            a.click()
          }}
        />
      )}

      {/* New Folder Dialog */}
      <Dialog open={mkdirOpen} onOpenChange={(open) => { if (!open) { setMkdirOpen(false); setNewFolderName("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t("folderName")}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleMkdir() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMkdirOpen(false); setNewFolderName("") }}>
              Cancel
            </Button>
            <Button disabled={!newFolderName.trim() || mkdirBusy} onClick={handleMkdir}>
              {mkdirBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameValue("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
            <DialogDescription>
              {t("renameHint", { name: renameTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t("folderName")}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameTarget(null); setRenameValue("") }}>
              Cancel
            </Button>
            <Button disabled={!renameValue.trim() || renameBusy} onClick={handleRename}>
              {renameBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteBusy} onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {deleteBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeatureGuard>
  )
}