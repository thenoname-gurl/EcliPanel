"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  File, FileText, FileImage, FileVideo, FileCode, FileJson,
  Download, Loader2, AlertCircle, Clock,
  ZoomIn, ZoomOut, RotateCcw, Play, Pause, Eye,
  HardDrive
} from "lucide-react"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => ({ default: m.default })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 rounded-full animate-spin text-white/40" />
      </div>
    ),
    ssr: false,
  }
)

const LANG_MAP: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
  kt: "kotlin", kts: "kotlin", swift: "swift",
  c: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", h: "c", hpp: "cpp",
  cs: "csharp", fs: "fsharp",
  php: "php", lua: "lua", sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", graphql: "graphql", gql: "graphql",
  html: "html", htm: "html", css: "css", scss: "scss", sass: "scss", less: "less",
  json: "json", yaml: "yaml", yml: "yaml", xml: "xml", md: "markdown",
  vue: "html", svelte: "html", astro: "html", mdx: "markdown",
  dockerfile: "dockerfile", makefile: "makefile", cmake: "cmake",
}

function getMonacoLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  return LANG_MAP[ext] || "plaintext"
}

export interface ShareInfo {
  id: string
  fileName: string
  filePath: string
  isPreviewableCode: boolean
  isImage: boolean
  isVideo: boolean
  expiresAt: string | null
  downloads: number
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name))
    return <FileImage className="h-8 w-8 text-[#e594c7]" />
  if (/\.(mp4|avi|mkv|mov|webm)$/i.test(name))
    return <FileVideo className="h-8 w-8 text-[#B85A96]" />
  if (/\.(json)$/i.test(name))
    return <FileJson className="h-8 w-8 text-yellow-400" />
  if (/\.(js|ts|jsx|tsx|py|rb|php|java|go|rs|c|cpp|md|txt)$/i.test(name))
    return <FileCode className="h-8 w-8 text-[#e594c7]" />
  if (/\.(md|txt|log)$/i.test(name))
    return <FileText className="h-8 w-8 text-white/40" />
  return <File className="h-8 w-8 text-white/40" />
}

function ImagePreview({ src, fileName }: { src: string; fileName: string }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState({ x: 0, y: 0 })

  return (
    <div
      className="flex-1 flex items-center justify-center overflow-hidden bg-black/40 relative"
      style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
      onWheel={(e) => { e.preventDefault(); setScale(s => Math.min(Math.max(0.1, s * (e.deltaY > 0 ? 0.9 : 1.1)), 10)) }}
      onMouseDown={(e) => { if (scale > 1) { setDragging(true); setStart({ x: e.clientX - pos.x, y: e.clientY - pos.y }) } }}
      onMouseMove={(e) => { if (dragging) setPos({ x: e.clientX - start.x, y: e.clientY - start.y }) }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      <div className="flex items-center gap-2 absolute top-2 right-2 z-10">
        <button onClick={() => setScale(s => Math.max(s * 0.8, 0.1))} className="p-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"><ZoomOut className="h-3.5 w-3.5" /></button>
        <button onClick={() => setScale(s => Math.min(s * 1.2, 10))} className="p-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"><ZoomIn className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setScale(1); setPos({ x: 0, y: 0 }) }} className="p-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
      <img
        src={src} alt={fileName}
        className="max-w-[90%] max-h-[85%] object-contain select-none"
        style={{ transform: `translate(${pos.x}px,${pos.y}px) scale(${scale})`, transition: dragging ? "none" : "transform 0.1s" }}
        draggable={false}
      />
    </div>
  )
}

function VideoPreview({ src, fileName }: { src: string; fileName: string }) {
  const [playing, setPlaying] = useState(false)

  const togglePlay = () => {
    const v = document.querySelector("video")
    if (v) { if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) } }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-black/40 relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button onClick={togglePlay} className="p-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>
      <video
        src={src}
        controls
        className="max-w-full max-h-[85%]"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  )
}

function CodePreview({ fileName, language, content }: { fileName: string; language: string; content: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [editorHeight, setEditorHeight] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const measure = () => {
      if (containerRef.current) {
        setEditorHeight(containerRef.current.getBoundingClientRect().height)
      }
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex-1 min-h-0 border border-white/[0.06] overflow-hidden flex flex-col bg-[#0b0b0f]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.02] shrink-0">
        <Eye className="h-3.5 w-3.5 text-white/40" />
        <span className="text-xs font-medium text-white/40">Preview · {language}</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0">
        {editorHeight > 0 && (
          <MonacoEditor
            height={editorHeight}
            width="100%"
            defaultLanguage={language}
            value={content}
            theme="hc-black"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              glyphMargin: false,
              folding: true,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3,
              scrollbar: { vertical: "auto", horizontal: "auto" },
              wordWrap: "on",
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  )
}

const FETCH_TIMEOUT = 15000

async function fetchWithTimeout(path: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    return await fetch(path, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

type ShareErrorType = "not_found" | "not_valid" | "timeout" | "load_error"

export default function ShareFileClient({ token }: { token: string }) {
  const t = useTranslations("shareFileClient")
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorType, setErrorType] = useState<ShareErrorType | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)

  const shareUrl = API_ENDPOINTS.publicShare.replace(":token", token)
  const shareContentUrl = API_ENDPOINTS.publicShareContent.replace(":token", token)
  const shareMediaUrl = API_ENDPOINTS.publicShareMedia.replace(":token", token)
  const shareDownloadUrl = API_ENDPOINTS.publicShareDownload.replace(":token", token)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetchWithTimeout(shareUrl)
        if (cancelled) return
        if (res.status === 404) { setErrorType("not_found"); setErrorMessage(t("errorNotFound")); setLoading(false); return }
        if (res.status === 410) { setErrorType("not_valid"); setErrorMessage(t("errorNotValid")); setLoading(false); return }
        if (!res.ok) { setErrorType("load_error"); setErrorMessage(t("errorLoadInfo")); setLoading(false); return }
        const data = await res.json()
        if (cancelled) return
        setInfo(data)
        setLoading(false)

        if (data.isPreviewableCode) {
          setContentLoading(true)
          try {
            const contentRes = await fetchWithTimeout(shareContentUrl)
            if (contentRes.ok) {
              const text = await contentRes.text()
              if (!cancelled) setContent(text)
            }
          } catch {} finally {
            if (!cancelled) setContentLoading(false)
          }
        }
      } catch (err: any) {
        if (cancelled) return
        if (err?.name === "AbortError") {
          setErrorType("timeout"); setErrorMessage(t("errorTimeout"))
        } else {
          setErrorType("load_error"); setErrorMessage(t("errorLoadLink"))
        }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token, shareUrl, shareContentUrl, t])

  const handleDownload = useCallback(() => {
    if (info) triggerDownload(shareDownloadUrl, info.fileName)
  }, [shareDownloadUrl, info])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black **:font-flink">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 rounded-full animate-spin text-[#e594c7]" />
          <p className="text-sm text-white/50">{t("loading")}</p>
        </div>
      </div>
    )
  }

  if (errorType) {
    const isTerminal = errorType === "not_valid" || errorType === "not_found"
    return (
      <div className="flex items-center justify-center min-h-screen bg-black **:font-flink">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 max-w-md text-center px-4"
        >
          <div className="p-4 bg-[#e594c7]/10">
            {isTerminal ? (
              <Clock className="h-10 w-10 text-[#e594c7]" />
            ) : (
              <AlertCircle className="h-10 w-10 text-[#e594c7]" />
            )}
          </div>
          <h1 className="text-lg font-semibold text-white">
            {errorType === "not_valid" ? t("linkExpiredTitle") : errorType === "not_found" ? t("fileDeletedTitle") : t("notFoundTitle")}
          </h1>
          <p className="text-sm text-white/50">{errorMessage}</p>
        </motion.div>
      </div>
    )
  }

  if (!info) return null

  const isExpired = info.expiresAt ? new Date(info.expiresAt) < new Date() : false

  return (
    <div className="min-h-screen bg-black **:font-flink flex flex-col">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full flex justify-between items-center px-6 sm:px-12 lg:px-40 py-5"
      >
        <a href="/" className="flex items-center gap-3">
          <img src="/assets/icons/logo.png" alt="EclipseSystems" className="w-12 sm:w-15 h-auto" />
          <span className="text-[10px] uppercase tracking-wider text-white/30 bg-white/5 px-1.5 py-0.5">{t("sharedFile")}</span>
        </a>
        {info.expiresAt && (
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Clock className="h-3 w-3" />
            {isExpired ? t("expired") : t("expires", { date: new Date(info.expiresAt).toLocaleDateString() })}
          </div>
        )}
      </motion.header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 sm:px-12 lg:px-40 py-6 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="bg-[#0D0D0D] border border-white/[0.06] p-5 mb-4"
        >
          <div className="flex items-start gap-4">
            {getFileIcon(info.fileName)}
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-white truncate">{info.fileName}</h1>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
                <span>{info.filePath}</span>
                {info.downloads > 0 && (
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {t("downloads", { count: info.downloads })}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all bg-[#e594c7] text-[#0a0a0f] hover:bg-[#d484b6]"
            >
              <Download className="h-4 w-4" />
              {t("download")}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="flex-1 flex flex-col"
        >
          {isExpired ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/30">
                <Clock className="h-12 w-12 opacity-30" />
                <p className="text-sm">{t("linkExpired")}</p>
              </div>
            </div>
          ) : info.isImage ? (
            <ImagePreview src={shareMediaUrl} fileName={info.fileName} />
          ) : info.isVideo ? (
            <VideoPreview src={shareMediaUrl} fileName={info.fileName} />
          ) : info.isPreviewableCode && content !== null ? (
            <CodePreview fileName={info.fileName} language={getMonacoLang(info.fileName)} content={content} />
          ) : info.isPreviewableCode && contentLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 rounded-full animate-spin text-white/40" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/30">
                <HardDrive className="h-12 w-12 opacity-30" />
                <p className="text-sm">{t("noPreview")}</p>
                <p className="text-xs text-white/20">{t("clickDownload")}</p>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}