"use client"

import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react"
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
  MoreVertical, Check, Upload, ZoomIn, ZoomOut, Move,
  Home, File, RotateCcw, Eye, FileCode,
  FileJson, FileImage, Maximize2, Minimize2
} from "lucide-react"

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

const getFileName = (f: FileItem): string => f.name || f.attributes?.name || ""

const isDirectory = (f: FileItem): boolean =>
  f.directory === true || f.is_file === false || f.type === "folder" || f.type === "directory"

const getFileSize = (f: FileItem): number => f.size || f.attributes?.size || 0

const getModifiedDate = (f: FileItem): string | undefined =>
  f.modified || f.modified_at || f.attributes?.modified_at

const isImageFile = (filename: string): boolean =>
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$/i.test(filename)

const isTextFile = (filename: string): boolean =>
  /\.(txt|md|json|yaml|yml|xml|ini|conf|config|properties|toml|sh|bash|bat|cmd|js|mjs|cjs|ts|mts|cts|jsx|tsx|css|scss|sass|less|html|htm|py|pyw|rb|php|java|kt|kts|swift|go|rs|c|cpp|cc|cxx|h|hpp|cs|fs|vb|lua|sql|graphql|gql|vue|svelte|astro|mdx|env|gitignore|dockerignore|dockerfile|makefile|cmake|gradle|pom|lock|log)$/i.test(filename)

const isBinaryFile = (filename: string): boolean =>
  /\.(zip|jar|tar|gz|tgz|rar|7z|exe|dll|bin|iso|img|dmg|so|dylib|a|lib|o|class|pyc|pyo|wasm|pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|mp3|mp4|avi|mkv|mov|wmv|flv|wav|ogg|flac|aac|m4a|woff|woff2|ttf|otf|eot)$/i.test(filename)

const getFileIcon = (filename: string, isDir: boolean) => {
  if (isDir) return <Folder className="h-4 w-4 text-primary/70 flex-shrink-0" />
  if (isImageFile(filename)) return <FileImage className="h-4 w-4 text-pink-400 flex-shrink-0" />
  if (/\.(json)$/i.test(filename)) return <FileJson className="h-4 w-4 text-yellow-400 flex-shrink-0" />
  if (/\.(js|ts|jsx|tsx|py|rb|php|java|go|rs|c|cpp)$/i.test(filename)) return <FileCode className="h-4 w-4 text-blue-400 flex-shrink-0" />
  if (/\.(md|txt|log)$/i.test(filename)) return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  if (/\.(zip|tar|gz|rar|7z|jar)$/i.test(filename)) return <Archive className="h-4 w-4 text-orange-400 flex-shrink-0" />
  return <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
}

const formatDate = (date: string | undefined, t?: any): string => {
  if (!date) return "—"
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } else if (diffDays === 1) {
    return t ? t("labels.yesterday") : "Yesterday"
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

interface ImagePreviewProps {
  url: string
  filename: string
  onClose: () => void
  onDownload: () => void
  t: any
}

function ImagePreviewModal({ url, filename, onClose, onDownload, t }: ImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => Math.min(Math.max(0.1, s * delta), 10))
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const resetView = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "+" || e.key === "=") setScale(s => Math.min(s * 1.2, 10))
      if (e.key === "-") setScale(s => Math.max(s * 0.8, 0.1))
      if (e.key === "0") resetView()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-white font-medium truncate">{filename}</p>
            <p className="text-white/60 text-xs">{Math.round(scale * 100)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(s * 0.8, 0.1))}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={t("preview.zoomOut")}
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => setScale(s => Math.min(s * 1.2, 10))}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={t("preview.zoomIn")}
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={resetView}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={t("preview.resetView")}
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors hidden sm:block"
            title={t("preview.toggleFullscreen")}
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          <button
            onClick={onDownload}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={t("actions.download")}
          >
            <Download className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="transition-transform duration-100"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "center center"
          }}
        >
          <img
            src={url}
            alt={filename}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
            draggable={false}
          />
        </div>
      </div>

      <div className="sm:hidden absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 p-3 rounded-full bg-black/60 backdrop-blur">
        <button
          onClick={() => setScale(s => Math.max(s * 0.8, 0.1))}
          className="p-3 rounded-full bg-white/20 text-white active:bg-white/30"
        >
          <ZoomOut className="h-6 w-6" />
        </button>
        <span className="text-white font-mono text-sm min-w-[3ch] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(s * 1.2, 10))}
          className="p-3 rounded-full bg-white/20 text-white active:bg-white/30"
        >
          <ZoomIn className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}

interface FileActionsProps {
  file: FileItem
  path: string
  serverId: string
  onEdit: () => void
  onDelete: () => void
  onChmod: () => void
  onRename: () => void
  onDownload: () => void
  isImage: boolean
  isText: boolean
}

function FileActionsMenu({
  file, path, serverId, onEdit, onDelete, onChmod, onRename, onDownload, isImage, isText
}: FileActionsProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isDir = isDirectory(file)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95">
          {(isImage || isText) && !isDir && (
            <button
              onClick={() => { onEdit(); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary transition-colors"
            >
              {isImage ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {isImage ? "Preview" : "Edit"}
            </button>
          )}
          {!isDir && (
            <button
              onClick={() => { onRename(); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Rename
            </button>
          )}
          {!isDir && (
            <button
              onClick={() => { onDownload(); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          )}
          <button
            onClick={() => { onChmod(); setOpen(false) }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            Permissions
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => { onDelete(); setOpen(false) }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

interface BulkActionsBarProps {
  selectedCount: number
  onArchive: () => void
  onMove: () => void
  onChmod: () => void
  onDelete: () => void
  onClear: () => void
  busy: boolean
  recursive: boolean
  onRecursiveChange: (v: boolean) => void
  t: any
}

function BulkActionsBar({
  selectedCount, onArchive, onMove, onChmod, onDelete, onClear, busy, recursive, onRecursiveChange, t
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 sm:relative sm:border-t-0 sm:border-b sm:py-2.5">
      <div className="flex items-center justify-between gap-3 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={onClear}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground">
            {t("bulk.selected", { count: selectedCount })}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <label className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => onRecursiveChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            {t("bulk.recursive")}
          </label>

          <button
            onClick={onArchive}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            <Archive className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.archive")}</span>
          </button>
          <button
            onClick={onMove}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            <Move className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.move")}</span>
          </button>
          <button
            onClick={onChmod}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.chmod")}</span>
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-destructive/20 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/30 disabled:opacity-60 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.delete")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface CreateFormProps {
  type: "file" | "folder"
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  t: any
}

function CreateItemForm({ type, value, onChange, onSubmit, onCancel, t }: CreateFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-secondary/20">
      <div className="flex items-center gap-2 flex-1">
        {type === "folder" ? (
          <FolderPlus className="h-4 w-4 text-primary/70 flex-shrink-0" />
        ) : (
          <FilePlus className="h-4 w-4 text-primary/70 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={type === "file" ? t("inputs.fileNamePlaceholder") : t("inputs.folderNamePlaceholder")}
          className="flex-1 min-w-0 rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit()
            if (e.key === "Escape") onCancel()
          }}
        />
      </div>
      <Button size="sm" onClick={onSubmit} className="gap-1.5">
        <Check className="h-3.5 w-3.5" />
        {t("actions.create")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function DropZoneOverlay({ isDragActive, t }: { isDragActive: boolean; t: any }) {
  if (!isDragActive) return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg m-4 pointer-events-none">
      <div className="flex flex-col items-center gap-3 text-primary">
        <Upload className="h-12 w-12" />
        <p className="font-medium text-lg">{t("states.dropToUpload")}</p>
      </div>
    </div>
  )
}

export function FilesTab({ serverId, sftpInfo, editorSettings, isKvm }: FilesTabProps) {
  const t = useTranslations("serverFilesTab")
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
  const [launchNotice, setLaunchNotice] = useState<string | null>(null)
  const [sftpPassword, setSftpPassword] = useState("")
  const [sftpAuthorized, setSftpAuthorized] = useState(false)
  const [sftpChecking, setSftpChecking] = useState(false)
  const [sftpError, setSftpError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const breadcrumbs = useMemo(() => path.split("/").filter(Boolean), [path])

  const selectableFiles = useMemo(
    () => files.map(getFileName).filter(Boolean),
    [files]
  )

  const allSelected = useMemo(
    () => selectableFiles.length > 0 && selectableFiles.every((n) => selectedNames.includes(n)),
    [selectableFiles, selectedNames]
  )

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aDir = isDirectory(a)
      const bDir = isDirectory(b)
      if (aDir && !bDir) return -1
      if (!aDir && bDir) return 1
      return getFileName(a).localeCompare(getFileName(b))
    })
  }, [files])

  const isSftpMode = isKvm && viewMode === 'sftp'
  const sftpHeaders = useMemo<Record<string, string> | undefined>(
    () => (sftpPassword ? { 'x-sftp-password': sftpPassword } : undefined),
    [sftpPassword]
  )

  const loadFiles = useCallback(async (p: string) => {
    setLoading(true)
    try {
      if (isSftpMode && !sftpAuthorized) {
        setFiles([])
        return
      }

      const baseUrl = isSftpMode
        ? API_ENDPOINTS.serverSftpFiles.replace(":id", serverId)
        : API_ENDPOINTS.serverFiles.replace(":id", serverId)
      const data = await apiFetch(`${baseUrl}?path=${encodeURIComponent(p)}`, {
        headers: isSftpMode ? sftpHeaders : undefined,
      })
      setFiles(Array.isArray(data) ? data : [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [serverId, isSftpMode, sftpAuthorized, sftpHeaders])

  useEffect(() => {
    loadFiles(path)
  }, [path, loadFiles])

  useEffect(() => {
    setSelectedNames([])
  }, [path])

  useEffect(() => {
    if (sftpAuthorized) {
      setSftpAuthorized(false)
    }
  }, [sftpPassword])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  const sftpCommand = sftpInfo && sftpInfo.username
    ? `sftp ${sftpInfo.username}@${sftpInfo.host} -P ${sftpInfo.port}`
    : ""

  const openSftp = () => {
    if (
      !sftpInfo?.host ||
      sftpInfo.host === "—" ||
      !sftpInfo?.port ||
      !sftpInfo?.username
    ) {
      setLaunchNotice(t("errors.sftpDetailsUnavailable"))
      window.setTimeout(() => setLaunchNotice(null), 4000)
      return
    }

    const sftpUri = `sftp://${encodeURIComponent(sftpInfo.username)}@${sftpInfo.host}:${sftpInfo.port}`
    window.open(sftpUri, "_blank")
    setLaunchNotice(t("states.openingSftp"))
    window.setTimeout(() => setLaunchNotice(null), 5000)
  }

  const openQemuFolder = () => {
    setPath("/")
    setViewMode("qemu")
  }

  const connectSftp = async () => {
    if (!sftpPassword) {
      setSftpError(t("errors.sftpAuthRequired"))
      return
    }
    setSftpChecking(true)
    setSftpError(null)
    try {
      await apiFetch(
        API_ENDPOINTS.serverSftpFiles.replace(":id", serverId) + `?path=${encodeURIComponent(path)}`,
        { headers: sftpHeaders }
      )
      setSftpAuthorized(true)
    } catch (err: any) {
      setSftpAuthorized(false)
      setSftpError(err?.message || t("errors.sftpAuthFailed"))
    } finally {
      setSftpChecking(false)
    }
  }

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragActive(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.target === dropRef.current) {
        setIsDragActive(false)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)
      if (e.dataTransfer?.files) {
        handleFileUpload(e.dataTransfer.files)
      }
    }

    const el = dropRef.current
    if (el) {
      el.addEventListener("dragenter", handleDragEnter)
      el.addEventListener("dragleave", handleDragLeave)
      el.addEventListener("dragover", handleDragOver)
      el.addEventListener("drop", handleDrop)

      return () => {
        el.removeEventListener("dragenter", handleDragEnter)
        el.removeEventListener("dragleave", handleDragLeave)
        el.removeEventListener("dragover", handleDragOver)
        el.removeEventListener("drop", handleDrop)
      }
    }
  }, [path])

  const toggleOne = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    )
  }

  const toggleAll = () => {
    setSelectedNames((prev) => (allSelected ? [] : selectableFiles))
  }

  const handleFileUpload = async (fileList: FileList) => {
    if (fileList.length === 0) return
    setUploading(true)
    try {
      if (isSftpMode && !sftpAuthorized) {
        setSftpError(t("errors.sftpAuthRequired"))
        return
      }

      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]
        const arrayBuffer = await f.arrayBuffer()
        const filePath = path.endsWith("/") ? `${path}${f.name}` : `${path}/${f.name}`
        const uploadUrl = (isSftpMode
          ? API_ENDPOINTS.serverSftpFileUpload.replace(":id", serverId)
          : API_ENDPOINTS.serverFileUpload.replace(":id", serverId)) +
          `?path=${encodeURIComponent(filePath)}`

        const response = await fetch(uploadUrl, {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            "Content-Type": "application/octet-stream",
            ...(isSftpMode ? sftpHeaders : {}),
          },
          body: new Uint8Array(arrayBuffer),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Upload failed: ${response.status}`)
        }
      }
      await loadFiles(path)
    } catch (err: any) {
      alert(t("errors.uploadFailed", { reason: err?.message || err }))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const openFile = async (filePath: string) => {
    const name = filePath.split("/").pop() || filePath

    if (isImageFile(name)) {
      setEditingFile(null)
      setFileContent("")
      try {
        const res = await fetch(
          API_ENDPOINTS.serverFileDownload.replace(":id", serverId) +
            `?path=${encodeURIComponent(filePath)}`,
          {
            credentials: "include",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            },
          }
        )
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
        setImagePreviewUrl(url)
        setImagePreviewName(name)
      } catch (e: any) {
        alert(t("errors.imagePreviewFailed", { reason: e?.message || e }))
      }
      return
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
      setImagePreviewUrl(null)
    }

    if (isBinaryFile(name)) {
      return alert(t("errors.binaryNotEditable"))
    }

    if (!isTextFile(name)) {
      const proceed = confirm(t("confirm.openUnknownType"))
      if (!proceed) return
    }

    try {
      const contentsEndpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileContents.replace(":id", serverId)
        : API_ENDPOINTS.serverFileContents.replace(":id", serverId)
      const data = await apiFetch(
        contentsEndpoint + `?path=${encodeURIComponent(filePath)}`,
        { headers: isSftpMode ? sftpHeaders : undefined }
      )
      setFileContent(typeof data === "string" ? data : JSON.stringify(data, null, 2))
      setEditingFile(filePath)
    } catch (e: any) {
      alert(t("errors.openFailed", { reason: e.message }))
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileWrite.replace(":id", serverId)
        : API_ENDPOINTS.serverFileWrite.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ path: editingFile, content: fileContent }),
      })
      setEditingFile(null)
    } catch (e: any) {
      alert(t("errors.saveFailed", { reason: e.message }))
    } finally {
      setSaving(false)
    }
  }

  const deleteFile = async (filePath: string) => {
    const name = filePath.split("/").pop() || filePath
    if (!confirm(t("confirm.deleteFile", { name }))) return
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileDelete.replace(":id", serverId)
        : API_ENDPOINTS.serverFileDelete.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ path: filePath }),
      })
      loadFiles(path)
    } catch (e: any) {
      alert(t("errors.deleteFailed", { reason: e.message }))
    }
  }

  const createItem = async () => {
    if (!newName.trim() || !createMode) return
    const trimmed = newName.trim()
    const existing = files.find((f) => getFileName(f) === trimmed)

    if (existing) {
      const isDir = isDirectory(existing)
      if (createMode === "folder" && isDir) {
        alert(t("errors.folderExists", { name: trimmed }))
        return
      }
      if (createMode === "file" && !isDir) {
        if (confirm(t("confirm.fileExistsOpen", { name: trimmed }))) {
          openFile(path + trimmed)
          setCreateMode(null)
          setNewName("")
        }
        return
      }
      alert(t("errors.itemExists", { name: trimmed }))
      return
    }

    try {
      if (createMode === "folder") {
        await apiFetch(
          (isSftpMode ? API_ENDPOINTS.serverSftpFileCreateDir : API_ENDPOINTS.serverFileCreateDir).replace(":id", serverId),
          {
            method: "POST",
            headers: isSftpMode ? sftpHeaders : undefined,
            body: JSON.stringify({ path: path + trimmed }),
          }
        )
      } else {
        await apiFetch(
          (isSftpMode ? API_ENDPOINTS.serverSftpFileWrite : API_ENDPOINTS.serverFileWrite).replace(":id", serverId),
          {
            method: "POST",
            headers: isSftpMode ? sftpHeaders : undefined,
            body: JSON.stringify({ path: path + trimmed, content: "" }),
          }
        )
      }
      setNewName("")
      setCreateMode(null)
      loadFiles(path)
    } catch (e: any) {
      alert(t("errors.actionFailed", { reason: e.message }))
    }
  }

  const renameFile = async (oldName: string) => {
    const newFileName = prompt(t("prompts.renameTo"), oldName)
    if (!newFileName || newFileName === oldName) return
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileRename.replace(":id", serverId)
        : API_ENDPOINTS.serverFileRename.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "PUT",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({
          root: path,
          files: [{ from: oldName, to: newFileName }],
        }),
      })
      await loadFiles(path)
    } catch (e: any) {
      alert(t("errors.renameFailed", { reason: e?.message || e }))
    }
  }

  const downloadFile = async (fileName: string) => {
    try {
      const downloadEndpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileDownload.replace(":id", serverId)
        : API_ENDPOINTS.serverFileDownload.replace(":id", serverId)
      const res = await fetch(
        downloadEndpoint + `?path=${encodeURIComponent(path + fileName)}`,
        {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            ...(isSftpMode ? sftpHeaders : {}),
          },
        }
      )
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(t("errors.downloadFailed", { reason: e?.message || e }))
    }
  }

  const chmodFile = async (filePath: string) => {
    const mode = prompt(t("prompts.chmodSingle"), "0644")
    if (!mode) return
    if (!/^[0-7]{3,4}$/.test(mode)) {
      alert(t("errors.invalidMode"))
      return
    }
    const recursive = confirm(t("confirm.applyRecursive"))

    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileChmod.replace(":id", serverId)
        : API_ENDPOINTS.serverFileChmod.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({
          root: path,
          files: [{ file: filePath, mode, recursive }],
        }),
      })
      await loadFiles(path)
    } catch (e: any) {
      alert(t("errors.permissionUpdateFailed", { reason: e?.message || e }))
    }
  }

  const archiveSelected = async () => {
    if (selectedNames.length === 0) return
    setBulkBusy(true)
    try {
      if (isSftpMode) {
        alert("Archive is not supported in SFTP mode")
      } else {
        await apiFetch(API_ENDPOINTS.serverFileArchive.replace(":id", serverId), {
          method: "POST",
          body: JSON.stringify({ root: path, files: selectedNames }),
        })
        setSelectedNames([])
        await loadFiles(path)
      }
    } catch (e: any) {
      alert(t("errors.archiveFailed", { reason: e.message }))
    } finally {
      setBulkBusy(false)
    }
  }

  const moveSelected = async () => {
    if (selectedNames.length === 0) return
    const destination = prompt(t("prompts.moveToFolder"), "")
    if (destination === null) return
    const cleanDest = destination.trim().replace(/^\/+|\/+$/g, "")
    setBulkBusy(true)
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileMove.replace(":id", serverId)
        : API_ENDPOINTS.serverFileMove.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ root: path, files: selectedNames, destination: cleanDest }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert(t("errors.moveFailed", { reason: e.message }))
    } finally {
      setBulkBusy(false)
    }
  }

  const chmodSelected = async () => {
    if (selectedNames.length === 0) return
    const mode = prompt(t("prompts.chmodBulk"), "0644")
    if (!mode || !/^[0-7]{3,4}$/.test(mode)) {
      if (mode) alert(t("errors.invalidModeShort"))
      return
    }
    setBulkBusy(true)
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileChmod.replace(":id", serverId)
        : API_ENDPOINTS.serverFileChmod.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({
          root: path,
          files: selectedNames.map((fileName) => ({
            file: fileName,
            mode,
            recursive: chmodRecursive,
          })),
        }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert(t("errors.bulkChmodFailed", { reason: e?.message || e }))
    } finally {
      setBulkBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (selectedNames.length === 0) return
    if (!confirm(t("confirm.deleteSelected", { count: selectedNames.length }))) return
    setBulkBusy(true)
    try {
      const endpoint = isSftpMode
        ? API_ENDPOINTS.serverSftpFileDelete.replace(":id", serverId)
        : API_ENDPOINTS.serverFileDelete.replace(":id", serverId)
      await apiFetch(endpoint, {
        method: "POST",
        headers: isSftpMode ? sftpHeaders : undefined,
        body: JSON.stringify({ path, files: selectedNames, bulk: true }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert(t("errors.bulkDeleteFailed", { reason: e.message }))
    } finally {
      setBulkBusy(false)
    }
  }

  if (editingFile) {
    const ext = editingFile.split(".").pop()?.toLowerCase() || ""
    const monacoLang = MONACO_LANGUAGE_MAP[ext] || "plaintext"

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              onClick={() => setEditingFile(null)}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-foreground truncate">{displayPath(editingFile)}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEditingFile(null)}>
              {t("actions.cancel")}
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {t("actions.save")}
            </Button>
          </div>
        </div>
        <MonacoFileEditor
          value={fileContent}
          onChange={(v) => setFileContent(v ?? "")}
          language={monacoLang}
          editorSettings={editorSettings}
        />
      </div>
    )
  }

  return (
    <div ref={dropRef} className="flex flex-col relative min-h-[400px]">
      {imagePreviewUrl && (
        <ImagePreviewModal
          url={imagePreviewUrl}
          filename={imagePreviewName}
          t={t}
          onClose={() => {
            URL.revokeObjectURL(imagePreviewUrl)
            setImagePreviewUrl(null)
            setImagePreviewName("")
          }}
          onDownload={() => downloadFile(imagePreviewName)}
        />
      )}

      <DropZoneOverlay isDragActive={isDragActive} t={t} />

      {isKvm && sftpInfo?.username && (
        <div className="flex flex-col sm:flex-row gap-2 border-b border-border bg-secondary/10 px-4 py-3">
          <button
            onClick={openQemuFolder}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "qemu"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            )}
          >
            {t("actions.openQemuFolder")}
          </button>
          <button
            onClick={() => setViewMode("sftp")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "sftp"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            )}
          >
            {t("actions.openSftp")}
          </button>
        </div>
      )}

      {isKvm && viewMode === "sftp" ? (
        <div className="space-y-4 border-b border-border bg-secondary/10 px-4 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Folder className="h-4 w-4 text-primary" />
              <span>{t("labels.sftpModeDescription")}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("labels.host")}</p>
                <p className="text-sm font-mono text-foreground break-all">{sftpInfo?.host || "—"}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("labels.port")}</p>
                <p className="text-sm font-mono text-foreground">{sftpInfo?.port || "—"}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("labels.username")}</p>
                <p className="text-sm font-mono text-foreground">{sftpInfo?.username || "—"}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={openSftp}
              className="flex-1 rounded-md bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
            >
              {t("actions.openSftp")}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(sftpCommand)}
              className="flex-1 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
            >
              {t("actions.copy")}
            </button>
          </div>

          <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-2">{t("labels.sftpCommand")}</p>
            <code className="block overflow-x-auto whitespace-nowrap font-mono">{sftpCommand}</code>
          </div>

          {sftpAuthorized ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-600">
              {t("states.sftpConnected")}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("labels.sftpPassword")}
                  </label>
                  <input
                    type="password"
                    value={sftpPassword}
                    onChange={(e) => setSftpPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary"
                    placeholder={t("placeholders.sftpPassword")}
                  />
                </div>
                {sftpError && (
                  <p className="text-xs text-destructive">{sftpError}</p>
                )}
              </div>
              <button
                onClick={connectSftp}
                disabled={sftpChecking || !sftpPassword}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50 transition-colors"
              >
                {sftpChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : t("actions.connect")}
              </button>
            </div>
          )}

          {launchNotice && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
              {launchNotice}
            </div>
          )}
        </div>
      ) : null}

      <>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm overflow-x-auto min-w-0">
          <button
            onClick={() => setPath("/")}
            className="text-primary hover:underline font-mono flex-shrink-0"
          >
            /home/container
          </button>
          {breadcrumbs.map((crumb, i) => (
            <Fragment key={i}>
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <button
                onClick={() => setPath("/" + breadcrumbs.slice(0, i + 1).join("/") + "/")}
                className="text-primary hover:underline font-mono flex-shrink-0"
              >
                {crumb}
              </button>
            </Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || (isSftpMode && !sftpAuthorized)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            <span className="hidden sm:inline">{t("actions.upload")}</span>
          </button>

          <button
            onClick={() => {
              setCreateMode("file")
              setNewName("")
            }}
            disabled={isSftpMode && !sftpAuthorized}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            <FilePlus className="h-3 w-3" />
            <span className="hidden sm:inline">{t("actions.newFile")}</span>
          </button>

          <button
            onClick={() => {
              setCreateMode("folder")
              setNewName("")
            }}
            disabled={isSftpMode && !sftpAuthorized}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            <FolderPlus className="h-3 w-3" />
            <span className="hidden sm:inline">{t("actions.newFolder")}</span>
          </button>

          <button
            onClick={() => loadFiles(path)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {createMode && (
        <CreateItemForm
          type={createMode}
          value={newName}
          onChange={setNewName}
          onSubmit={createItem}
          onCancel={() => setCreateMode(null)}
          t={t}
        />
      )}

      <div className="hidden sm:grid grid-cols-[28px_1fr_100px_160px_100px] gap-2 bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-3.5 w-3.5"
          />
        </span>
        <span>{t("table.name")}</span>
        <span>{t("table.size")}</span>
        <span>{t("table.modified")}</span>
        <span className="text-right">{t("table.actions")}</span>
      </div>

      {path !== "/" && (
        <button
          onClick={() => {
            const parts = path.split("/").filter(Boolean)
            parts.pop()
            setPath(parts.length ? "/" + parts.join("/") + "/" : "/")
          }}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/20 border-t border-border transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ..
        </button>
      )}

      <div className={cn("flex-1", selectedNames.length > 0 && "pb-20 sm:pb-0")}>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> {t("states.loadingFiles")}
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("states.emptyDirectory")}
          </div>
        ) : (
          sortedFiles.map((file, i) => {
            const fname = getFileName(file)
            const isDir = isDirectory(file)
            const fsize = getFileSize(file)
            const fmod = getModifiedDate(file)
            const isSelected = selectedNames.includes(fname)
            const isImage = isImageFile(fname)
            const isText = isTextFile(fname)

            return (
              <div
                key={i}
                className={cn(
                  "group flex items-center justify-between sm:grid sm:grid-cols-[28px_1fr_100px_160px_100px] gap-2 px-4 py-2.5 text-sm border-t border-border hover:bg-secondary/20 transition-colors",
                  isSelected && "bg-primary/5"
                )}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(fname)}
                    className="h-3.5 w-3.5"
                  />
                </span>

                <button
                  onClick={() =>
                    isDir ? setPath(path + fname + "/") : openFile(path + fname)
                  }
                  className="flex items-center gap-2 text-foreground text-left hover:text-primary transition-colors truncate min-w-0"
                >
                  {getFileIcon(fname, isDir)}
                  <span className="truncate">{fname}</span>
                  {!isDir && (
                    <span className="text-xs text-muted-foreground sm:hidden flex-shrink-0">
                      {formatBytes(fsize)}
                    </span>
                  )}
                </button>

                <span className="hidden sm:block text-xs text-muted-foreground">
                  {!isDir ? formatBytes(fsize) : t("labels.na")}
                </span>

                <span className="hidden sm:block text-xs text-muted-foreground">
                  {formatDate(fmod, t)}
                </span>

                <div className="flex items-center justify-end gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {(isImage || isText) && !isDir && (
                    <button
                      onClick={() => openFile(path + fname)}
                      className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title={isImage ? t("actions.viewImage") : t("actions.edit")}
                    >
                      {isImage ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={() => renameFile(fname)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10 transition-colors"
                      title={t("actions.rename")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={() => downloadFile(fname)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10 transition-colors"
                      title={t("actions.download")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => chmodFile(path + fname)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10 transition-colors"
                    title={t("actions.changePermissions")}
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFile(path + fname)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={t("actions.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
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
      />
      </>
    </div>
  )
}