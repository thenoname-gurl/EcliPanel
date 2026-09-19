"use client"

import { useRef } from "react"
import { Download, Upload, Sparkles, FileDown, FileCode2, FileText, FileType2, FileSpreadsheet, Presentation, Undo2, Redo2 } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { downloadText, exportAsPdf, exportPresentationPdf, markdownToDocxBlob, markdownToWordDocBlob, presentationToPptxBlob, safeFilename, sheetToXlsxBlob, type SheetSnapshot } from "@/lib/office/editorApi"
import type { OfficeApiRef, PptxSlideInput } from "@/lib/office/editorApi"
import type { OfficeDocType } from "@/lib/office/types"
import { cn } from "@/lib/utils"

interface Props {
  apiReady: boolean
  apiRef: OfficeApiRef
  docType: OfficeDocType
  canEdit: boolean
  docName: string
  onOpenAi: () => void
  className?: string
}

function downloadJson(filename: string, data: unknown, pretty = true): void {
  downloadText(filename, JSON.stringify(data, null, pretty ? 2 : undefined), "application/json")
}

function normalizeJsonBlocks(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json.length ? json : null
  if (json && typeof json === "object") {
    const c = json as Record<string, unknown>
    if (Array.isArray(c.blocks) && c.blocks.length) return c.blocks
    if (Array.isArray(c.content) && c.content.length) return c.content
  }
  return null
}

export default function OfficeToolbar({ apiReady, apiRef, docType, canEdit, docName, onOpenAi, className }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const base = safeFilename(docName)

  const handleExport = async (format: string) => {
    const api = apiRef.current
    if (!api) return
    switch (format) {
      case "markdown":
        downloadText(`${base}.md`, api.getMarkdown(), "text/markdown")
        toast.success("Exported Markdown")
        break
      case "docx":
        downloadText(`${base}.docx`, markdownToDocxBlob(docName, api.getMarkdown()), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        toast.success("Exported Word document")
        break
      case "doc":
        downloadText(`${base}.doc`, markdownToWordDocBlob(docName, api.getMarkdown()), "application/msword")
        toast.success("Exported Word 97-2003 document")
        break
      case "pptx": {
        const json = api.getJSON() as { slides?: unknown[] } | null
        const slides = (Array.isArray(json?.slides) ? json.slides : []) as PptxSlideInput[]
        const blob = await presentationToPptxBlob(docName, slides)
        if (!blob) {
          toast.error("No slides to export")
          break
        }
        downloadText(`${base}.pptx`, blob, "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        toast.success("Exported PowerPoint presentation")
        break
      }
      case "pdf":
        if (docType === "presentation") {
          const json = api.getJSON() as { slides?: unknown[] } | null
          exportPresentationPdf(docName, (Array.isArray(json?.slides) ? json.slides : []) as PptxSlideInput[])
        } else {
          exportAsPdf(docName, api.getHTML?.() ?? api.getText().replace(/\n/g, "<br/>"))
        }
        toast.success("Opened print view — Save as PDF")
        break
      case "html":
        downloadText(`${base}.html`, api.getHTML?.() ?? "", "text/html")
        toast.success("Exported HTML")
        break
      case "json":
        downloadJson(`${base}.json`, api.getJSON())
        toast.success("Exported JSON")
        break
      case "csv":
        downloadText(`${base}.csv`, api.getCSV?.() ?? "", "text/csv")
        toast.success("Exported CSV")
        break
      case "xlsx": {
        const blob = await sheetToXlsxBlob(docName, api.getJSON() as SheetSnapshot | null)
        if (!blob) {
          toast.error("Could not export Excel workbook")
          break
        }
        downloadText(`${base}.xlsx`, blob, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        toast.success("Exported Excel workbook")
        break
      }
    }
  }

  const handleImportFile = async (file: File) => {
    const api = apiRef.current
    if (!api) return
    const ext = (file.name.split(".").pop() || "").toLowerCase()
    if (ext === "docx") {
      toast.error("DOCX import is not supported yet — export as Markdown (markdown file) and re-import instead.")
      return
    }
    const text = await file.text()
    try {
      if (ext === "html" || ext === "htm") {
        if (!api.loadHTML) throw new Error("HTML import is not available for this file type")
        api.loadHTML(text)
      } else if (ext === "json") {
        const json = JSON.parse(text) as unknown
        const blocks = normalizeJsonBlocks(json)
        api.loadJSON?.(blocks ?? json)
      } else if (ext === "csv") {
        if (!api.loadCSV) throw new Error("CSV import is only available for spreadsheets")
        api.loadCSV(text)
      } else {
        // md / txt
        if (api.loadMarkdown) api.loadMarkdown(text)
        else if (api.loadCSV) api.loadCSV(text)
        else throw new Error("This file type can't be imported here")
      }
      toast.success(`Imported ${file.name}`)
    } catch (e: any) {
      toast.error(e?.message || "Could not import file")
    } finally {
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const importItems = docType === "spreadsheet"
    ? [
        { ext: "CSV (.csv)", hint: "Import cell data", accept: ".csv,.txt" },
        { ext: "JSON (.json)", hint: "Import grid snapshot", accept: ".json" },
      ]
    : docType === "presentation"
      ? [
          { ext: "JSON (.json)", hint: "Import slides", accept: ".json" },
          { ext: "Markdown (.md)", hint: "Import slides from headings", accept: ".md,.txt" },
        ]
      : [
          { ext: "Markdown (.md)", hint: "Import formatted text", accept: ".md,.txt" },
          { ext: "HTML (.html)", hint: "Import from web page", accept: ".html,.htm" },
          { ext: "JSON (.json)", hint: "Import saved blocks", accept: ".json" },
        ]

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Undo / Redo */}
      {canEdit && (
        <>
          <button
            onClick={() => apiRef.current?.undo?.()}
            disabled={!apiReady}
            className="flex items-center rounded-md border border-border px-2 py-1.5 text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => apiRef.current?.redo?.()}
            disabled={!apiReady}
            className="mr-1 flex items-center rounded-md border border-border px-2 py-1.5 text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {/* Import */}
      {canEdit && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept={importItems.map((i) => i.accept).join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!apiReady}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              title="Import"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Import</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Import from file</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {importItems.map((item) => (
                <DropdownMenuItem key={item.ext} onSelect={() => fileInput.current?.click()} disabled={!apiReady}>
                  <FileDown className="h-4 w-4" />
                  <span>
                    {item.ext}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{item.hint}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* AI Proof-read */}
      <button
        onClick={onOpenAi}
        disabled={!apiReady}
        className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
        title="AI Proof-read"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Proof-read</span>
      </button>

      {/* Export */}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!apiReady}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          title="Export"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Export</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Export {docName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {docType === "document" && (
            <>
              <DropdownMenuItem onSelect={() => handleExport("docx")} disabled={!apiReady}>
                <FileText className="h-4 w-4" />
                Word document (.docx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("doc")} disabled={!apiReady}>
                <FileText className="h-4 w-4" />
                Word 97-2003 (.doc)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("pdf")} disabled={!apiReady}>
                <FileType2 className="h-4 w-4" />
                PDF (Save as PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("markdown")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("html")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                HTML (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("json")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                JSON (.json)
              </DropdownMenuItem>
            </>
          )}
          {docType === "spreadsheet" && (
            <>
              <DropdownMenuItem onSelect={() => handleExport("xlsx")} disabled={!apiReady}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("csv")} disabled={!apiReady}>
                <FileSpreadsheet className="h-4 w-4" />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("json")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                JSON (.json)
              </DropdownMenuItem>
            </>
          )}
          {docType === "presentation" && (
            <>
              <DropdownMenuItem onSelect={() => handleExport("pptx")} disabled={!apiReady}>
                <Presentation className="h-4 w-4" />
                PowerPoint (.pptx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("pdf")} disabled={!apiReady}>
                <FileType2 className="h-4 w-4" />
                PDF (Save as PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("markdown")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("json")} disabled={!apiReady}>
                <FileCode2 className="h-4 w-4" />
                JSON (.json)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}