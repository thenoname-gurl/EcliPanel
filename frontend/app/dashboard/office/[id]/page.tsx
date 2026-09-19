"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { useOfficeProvider } from "@/lib/office/useOfficeProvider"
import dynamic from "@/components/shims/dynamic"
import type { OfficeEditorApi } from "@/lib/office/editorApi"
import type { OfficeDocType } from "@/lib/office/types"
import OfficeToolbar from "@/components/office/OfficeToolbar"
import ProofreadPanel from "@/components/office/ProofreadPanel"
import {
  ArrowLeft,
  Eye,
  FileText,
  Table2,
  Presentation,
  NotebookTabs,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { OfficeDocumentDTO } from "@/lib/office/types"

const DocumentEditor = dynamic(() => import("@/components/office/DocumentEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading editor…</div>
  ),
})

const SpreadsheetEditor = dynamic(() => import("@/components/office/SpreadsheetEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading spreadsheet…</div>
  ),
})

const PresentationEditor = dynamic(() => import("@/components/office/PresentationEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading presentation…</div>
  ),
})

const NotebookEditor = dynamic(() => import("@/components/office/NotebookEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading notebook…</div>
  ),
})

const TYPE_ICON = {
  document: FileText,
  spreadsheet: Table2,
  presentation: Presentation,
  notebook: NotebookTabs,
} as const

function OfficeEditorShell({ doc, provider, userName, userColor, preview }: any) {
  const t = useTranslations("officePage")
  const { status, participants, permission, error } = provider
  const [name, setName] = useState(doc.name)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevName = useRef(doc.name)
  const apiRef = useRef<OfficeEditorApi | null>(null)
  const [apiReady, setApiReady] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [autoCorrect, setAutoCorrect] = useState(false)

  const canEdit = !preview && permission !== "view" && doc.role !== "view"

  const readOnly = !canEdit
  const Icon = TYPE_ICON[doc.type as keyof typeof TYPE_ICON]

  // Server-side content snapshot: saved immediately on first ready (so freshly
  // opened docs always have REST content to hydrate from), then every 5s on
  // change, then again on unmount. Ensures /dashboard/office thumbnails and
  // previews reflect the latest state even if the editor closes quickly.
  useEffect(() => {
    if (!apiReady) return
    let lastSnap = ""
    const putSnap = () => {
      const api = apiRef.current
      if (!api) return
      const snap = JSON.stringify(api.getJSON() ?? null)
      if (snap === lastSnap) return
      lastSnap = snap
      void apiFetch(API_ENDPOINTS.officeContent.replace(":id", String(doc.id)), {
        method: "PUT",
        body: { content: snap },
      }).catch(() => {
        /* transient network error — will retry on next tick */
      })
    }
    putSnap()
    const timer = setInterval(putSnap, 5000)
    return () => {
      clearInterval(timer)
      putSnap()
    }
  }, [apiReady, doc.id])

  const handleRename = useCallback(() => {
    const trimmed = name.trim()
    if (trimmed === prevName.current) return
    if (!trimmed || doc.role !== "owner") {
      setName(prevName.current)
      return
    }
    void apiFetch(API_ENDPOINTS.officeUpdate.replace(":id", String(doc.id)), {
      method: "PATCH",
      body: { name: trimmed },
    }).catch(() => setName(prevName.current))
    prevName.current = trimmed
  }, [name, doc.id, doc.role])

  const typeLabel =
    doc.type === "document"
      ? t("editor.document")
      : doc.type === "spreadsheet"
        ? t("editor.spreadsheet")
        : doc.type === "presentation"
          ? t("editor.presentation")
          : t("editor.notebook")

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-3 py-2 sm:gap-x-3 sm:px-4 sm:py-2.5">
        <Link
          href="/dashboard/office"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Icon className="h-4 w-4 text-primary" />
        {preview ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{name}</span>
        ) : (
          <input
            className={cn(
              "min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none",
              doc.role !== "owner" && "cursor-default"
            )}
            value={name}
            readOnly={doc.role !== "owner"}
            onChange={(e) => {
              setName(e.target.value)
              if (saveTimer.current) clearTimeout(saveTimer.current)
              saveTimer.current = setTimeout(() => {
                void apiFetch(API_ENDPOINTS.officeUpdate.replace(":id", String(doc.id)), {
                  method: "PATCH",
                  body: { name: e.target.value },
                }).catch(() => setName(prevName.current))
                prevName.current = e.target.value
              }, 800)
            }}
            onBlur={handleRename}
          />
        )}
        <span className="text-xs text-muted-foreground">{typeLabel}</span>

        {doc.type !== "notebook" && (
          <OfficeToolbar
            apiReady={apiReady}
            apiRef={apiRef}
            docType={doc.type as OfficeDocType}
            canEdit={canEdit}
            docName={name}
            onOpenAi={() => setAiOpen((v) => !v)}
            className="ml-auto"
          />
        )}

        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {status === "synced" ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span>{t("editor.saved")}</span>
            </>
          ) : status === "connecting" ? (
            <span>{t("editor.saving")}</span>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              <span>{t("editor.connectError")}</span>
            </>
          )}
        </span>

        <span className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("editor.participants", { count: participants })}
        </span>

        {readOnly && (
          <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("editor.readOnly")}
          </span>
        )}
        {preview && (
          <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <Eye className="h-3.5 w-3.5" />
            {t("editor.preview")}
          </span>
        )}
      </div>

      {error && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-300">
          {error.message}
        </div>
      )}

      {/* Editor body */}
      <div className="min-h-0 flex-1 px-2 py-2 sm:px-4 sm:py-4">
        {doc.type === "document" && (
          <DocumentEditor
            provider={provider.provider}
            readOnly={readOnly}
            userName={userName}
            userColor={userColor}
            apiRef={apiRef}
            onEditorReady={() => setApiReady(true)}
          />
        )}
        {doc.type === "spreadsheet" && (
          <SpreadsheetEditor
            provider={provider.provider}
            readOnly={readOnly}
            initialContent={doc.content}
            apiRef={apiRef}
            onEditorReady={() => setApiReady(true)}
          />
        )}
        {doc.type === "presentation" && (
          <PresentationEditor
            provider={provider.provider}
            readOnly={readOnly}
            initialContent={doc.content}
            apiRef={apiRef}
            onEditorReady={() => setApiReady(true)}
          />
        )}
        {doc.type === "notebook" && (
          <NotebookEditor
            provider={provider.provider}
            readOnly={readOnly}
            initialContent={doc.content}
            apiRef={apiRef}
            onEditorReady={() => setApiReady(true)}
          />
        )}
      </div>

      {doc.type !== "notebook" && (
        <ProofreadPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          apiRef={apiRef}
          docType={doc.type as OfficeDocType}
          canEdit={canEdit}
          docName={name}
          autoCorrect={autoCorrect}
          onAutoCorrectChange={setAutoCorrect}
        />
      )}
    </div>
  )
}

export default function OfficeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("officePage")
  const { id } = use(params)
  const searchParams = useSearchParams()
  const preview = searchParams.get("preview") === "1"
  const { user } = useAuth()
  const [doc, setDoc] = useState<OfficeDocumentDTO | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const docId = useMemo(() => (doc && !Number.isNaN(Number(id)) ? Number(id) : null), [doc, id])
  const providerHook = useOfficeProvider(docId)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    apiFetch(API_ENDPOINTS.officeDetail.replace(":id", String(id)))
      .then((data) => {
        if (cancelled) return
        if (!data?.id) setNotFound(true)
        else setDoc(data)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading && !doc) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading…</div>
    )
  }

  if (notFound || !doc) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="font-medium text-foreground">{t("editor.notFound")}</p>
        <Link href="/dashboard/office" className="text-sm text-primary hover:underline">
          {t("editor.back")}
        </Link>
      </div>
    )
  }

  return (
    <OfficeEditorShell
      doc={doc}
      provider={providerHook}
      userName={providerHook.userName}
      userColor={providerHook.userColor}
      preview={preview}
    />
  )
}