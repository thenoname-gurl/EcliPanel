import type { MutableRefObject } from "react"
import { zipSync, strToU8 } from "fflate"
import type { OfficeDocType } from "@/lib/office/types"

export interface OfficeEditorApi {
  kind: OfficeDocType
  getText(): string
  getMarkdown(): string
  getJSON(): unknown
  getHTML?(): string
  getCSV?(): string
  loadMarkdown?(markdown: string): void | Promise<void>
  loadJSON?(json: unknown): void | Promise<void>
  loadHTML?(html: string): void | Promise<void>
  loadCSV?(csv: string): void | Promise<void>
  undo?(): void
  redo?(): void
  applySuggestions?(rows: { before: string; after: string }[]): number
  setSuggestions?(rows: { before: string; after: string; reason?: string }[]): void
}

export type OfficeApiRef = MutableRefObject<OfficeEditorApi | null>

export function downloadText(filename: string, content: string | Blob, mime = "text/plain"): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function safeFilename(name: string): string {
  return (name || "document")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
}

export interface FontOption {
  label: string
  value: string
}

export const FONT_FAMILIES: FontOption[] = [
  { label: "Default (System)", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { label: "Impact", value: "Impact, 'Arial Black', sans-serif" },
  { label: "Palatino", value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { label: "Garamond", value: "Garamond, Georgia, serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', 'Segoe UI', cursive, sans-serif" },
]

export function fontLabel(value: string | undefined): string {
  if (!value) return "Default"
  return FONT_FAMILIES.find((f) => f.value === value)?.label || value
}

export function fontForPptx(value: string | undefined, fallback = "Arial"): string {
  if (!value) return fallback
  const name = String(value)
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
  return name || fallback
}

export interface FilterPreset {
  value: string
  label: string
  css: string
}

export const IMAGE_FILTERS: FilterPreset[] = [
  { value: "none", label: "Original", css: "none" },
  { value: "grayscale", label: "Grayscale", css: "grayscale(1)" },
  { value: "sepia", label: "Sepia", css: "sepia(1)" },
  { value: "vivid", label: "Vivid", css: "saturate(1.8) contrast(1.05)" },
  { value: "bright", label: "Bright", css: "brightness(1.25)" },
  { value: "dim", label: "Dim", css: "brightness(0.75)" },
  { value: "contrast", label: "Contrast", css: "contrast(1.4)" },
  { value: "invert", label: "Invert", css: "invert(1)" },
  { value: "hue", label: "Invert hue", css: "hue-rotate(180deg)" },
  { value: "fade", label: "Soft fade", css: "opacity(0.72)" },
  { value: "blur", label: "Blur", css: "blur(3px)" },
]

export function filterCss(value: string | undefined): string {
  return IMAGE_FILTERS.find((f) => f.value === value)?.css ?? "none"
}

export interface PresTemplate {
  id: string
  name: string
  bg: string
  titleColor: string
  bodyColor: string
  quoteColor: string
  titleFont: string
  bodyFont: string
  quoteFont: string
}

export const PRES_TEMPLATES: PresTemplate[] = [
  {
    id: "midnight",
    name: "Midnight",
    bg: "#12111f",
    titleColor: "#ffffff",
    bodyColor: "#e6e6f0",
    quoteColor: "#c4b5fd",
    titleFont: "",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "paper",
    name: "Paper",
    bg: "#f6f5f2",
    titleColor: "#1c1917",
    bodyColor: "#57534e",
    quoteColor: "#7c3aed",
    titleFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "ocean",
    name: "Ocean",
    bg: "#0e3a5c",
    titleColor: "#ffffff",
    bodyColor: "#d7e9f7",
    quoteColor: "#7fd1ff",
    titleFont: "",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "forest",
    name: "Forest",
    bg: "#14331f",
    titleColor: "#f0fdf4",
    bodyColor: "#d1fae5",
    quoteColor: "#86efac",
    titleFont: "",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "#3b1f47",
    titleColor: "#fff7ed",
    bodyColor: "#ffedd5",
    quoteColor: "#fda4af",
    titleFont: "",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "crimson",
    name: "Crimson",
    bg: "#330a0e",
    titleColor: "#ffe4e6",
    bodyColor: "#fecdd3",
    quoteColor: "#fca5a5",
    titleFont: "",
    bodyFont: "",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "charcoal",
    name: "Charcoal",
    bg: "#16181d",
    titleColor: "#f4f4f5",
    bodyColor: "#d4d4d8",
    quoteColor: "#facc15",
    titleFont: "Impact, 'Arial Black', sans-serif",
    bodyFont: "",
    quoteFont: "Impact, 'Arial Black', sans-serif",
  },
]

export const TEMPLATE_STORAGE_KEY = "ecli.pres.templates"

const XML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ESCAPE[ch as keyof typeof XML_ESCAPE])
}

function inlineRuns(text: string): string {
  const runs: string[] = []
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) runs.push(`<w:r><w:t xml:space="preserve">${esc(text.slice(last, m.index))}</w:t></w:r>`)
    const token = m[0]
    if (token.startsWith("**")) {
      runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(token.slice(2, -2))}</w:t></w:r>`)
    } else if (token.startsWith("_")) {
      runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${esc(token.slice(1, -1))}</w:t></w:r>`)
    } else {
      runs.push(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${esc(token.slice(1, -1))}</w:t></w:r>`)
    }
    last = m.index + token.length
  }
  if (last < text.length) runs.push(`<w:r><w:t xml:space="preserve">${esc(text.slice(last))}</w:t></w:r>`)
  return runs.join("")
}

function mdParagraph(line: string): string {
  const h = /^(#{1,6})\s+(.*)$/.exec(line.trim())
  if (h) {
    const level = h[1].length
    return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>${inlineRuns(h[2])}</w:p>`
  }
  if (/^[-*+]\s+/.test(line.trim())) {
    const content = line.trim().replace(/^[-*+]\s+/, "")
    return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${inlineRuns(content)}</w:p>`
  }
  if (/^\d+[.)]\s+/.test(line.trim())) {
    const content = line.trim().replace(/^\d+[.)]\s+/, "")
    return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${inlineRuns(content)}</w:p>`
  }
  return `<w:p>${inlineRuns(line)}</w:p>`
}

export function markdownToDocxBlob(title: string, markdown: string): Blob {
  const paraXml = markdown
    .split(/\r?\n/)
    .map((raw) => raw.trimEnd())
    .reduce<string[]>((acc, line) => {
      if (line.trim() === "") {
        if (acc.length && acc[acc.length - 1] !== "") acc.push("")
        return acc
      }
      acc.push(line)
      return acc
    }, [])
    .filter((line, i, arr) => !(line === "" && (i === 0 || i === arr.length - 1)))
    .map((line) => (line === "" ? `<w:p/>` : mdParagraph(line)))
    .join("")

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${inlineRuns(title)}</w:p>
${paraXml}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="1">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="22"/></w:rPr></w:style>
</w:styles>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

  const zip = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(styles),
    "word/numbering.xml": strToU8(numbering),
    "word/_rels/document.xml.rels": strToU8(docRels),
  })

  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
}

export function exportAsPdf(title: string, bodyHtml: string): void {
  const win = window.open("", "_blank", "width=900,height=700")
  if (!win) return
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; max-width: 44rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.55; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  h1{font-size:1.9rem;margin:1.2rem 0 .4rem} h2{font-size:1.4rem;margin:1.1rem 0 .35rem} h3{font-size:1.15rem}
  pre{background:#f5f5f5;padding:.75rem;border-radius:6px;overflow-x:auto;font-size:.85rem}
  code{background:#f5f5f5;padding:.1em .3em;border-radius:4px;font-size:.88em}
  blockquote{border-left:3px solid #bbb;margin:0;padding-left:1rem;color:#444}
  table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:.35rem .6rem;font-size:.9rem}
  img{max-width:100%} a{color:#1a4fd0;word-break:break-all}
</style></head><body>${bodyHtml}</body></html>`)
  win.document.close()
  win.onload = () => {
    setTimeout(() => win.print(), 250)
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (ch !== "\r") {
      cell += ch
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "")
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(",")
    )
    .filter((line) => line.length > 0)
    .join("\n")
}

export interface PptxBlock {
  type?: "text" | "image" | "quote"
  text?: string
  author?: string
  src?: string
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: "left" | "center" | "right"
  font?: string
  filter?: string
}

export interface PptxSlideInput {
  title?: string
  subtitle?: string
  body?: string
  bg?: string
  id?: string
  blocks?: PptxBlock[]
}

const EMU_PER_UNIT = 12700 
const PPTX_CX = 12192000
const PPTX_CY = 7620000

function hexColor(v: string | undefined, fallback: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((v ?? "").trim())
  return m ? m[1] : fallback
}

function emu(v: number): number {
  return Math.max(0, Math.round((Number(v) || 0) * EMU_PER_UNIT))
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function toAlign(v: string | undefined): "l" | "ctr" | "r" {
  return v === "center" ? "ctr" : v === "right" ? "r" : "l"
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m === "image/jpeg") return "jpg"
  if (m === "image/webp") return "webp"
  if (m === "image/gif") return "gif"
  if (m === "image/svg+xml") return "svg"
  return "png"
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

function imageNatural(src: string): Promise<{ iw: number; ih: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ iw: img.naturalWidth, ih: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function containBox(bw: number, bh: number, iw: number, ih: number) {
  const s = Math.min(bw / Math.max(1, iw), bh / Math.max(1, ih))
  const w = Math.max(1, iw * s)
  const h = Math.max(1, ih * s)
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h }
}

async function resolveImage(src: string, filter?: string): Promise<{ raw: string; iw: number; ih: number; mime: string; ext: string } | null> {
  if (!src) return null
  let dataUrl = src
  if (/^https?:\/\//i.test(src)) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(src, { mode: "cors", signal: ctrl.signal })
      clearTimeout(to)
      if (!res.ok) return null
      dataUrl = await blobToDataUrl(await res.blob())
    } catch {
      return null
    }
  }
  if (!dataUrl.startsWith("data:")) return null
  const cssFilter = filterCss(filter)
  if (cssFilter !== "none") {
    const filtered = await applyFilterToDataUrl(dataUrl, cssFilter)
    if (filtered) dataUrl = filtered
  }
  const prefix = dataUrl.slice(0, dataUrl.indexOf(","))
  const mime = /^data:([^;,]+)/i.exec(prefix)?.[1] || "image/png"
  const dims = await imageNatural(dataUrl)
  return {
    raw: dataUrl.slice(dataUrl.indexOf(",") + 1),
    iw: dims?.iw || 1,
    ih: dims?.ih || 1,
    mime,
    ext: extForMime(mime),
  }
}

function applyFilterToDataUrl(dataUrl: string, cssFilter: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth || 1
      canvas.height = img.naturalHeight || 1
      const ctx = canvas.getContext("2d")
      if (!ctx) return resolve(dataUrl)
      ctx.filter = cssFilter
      try {
        ctx.drawImage(img, 0, 0)
      } catch {
        ctx.filter = "none"
        try {
          ctx.drawImage(img, 0, 0)
        } catch {
          return resolve(dataUrl)
        }
      }
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export interface NormalizedPptxShape {
  kind: "text" | "image" | "quote"
  text: string
  author: string
  src: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  bold: boolean
  italic: boolean
  color: string
  align: "l" | "ctr" | "r"
  font: string
  filter: string
}

function legacyShapes(s: any): PptxBlock[] {
  const blocks: PptxBlock[] = []
  const title = String(s?.title || "")
  const subtitle = String(s?.subtitle || "")
  const body = String(s?.body || "")
  if (title) blocks.push({ type: "text", text: title, x: 60, y: 56, w: 840, h: 100, fontSize: 40, bold: true, color: "FFFFFF", align: "center" })
  if (subtitle) blocks.push({ type: "text", text: subtitle, x: 80, y: 164, w: 800, h: 60, fontSize: 24, color: "E8E8F5", align: "center" })
  if (body) blocks.push({ type: "text", text: body, x: 160, y: 256, w: 640, h: 270, fontSize: 18, color: "F0F0F5", align: "left" })
  return blocks
}

export function normalizePptxShapes(s: any): NormalizedPptxShape[] {
  const raw = Array.isArray(s?.blocks) && s.blocks.length ? s.blocks : legacyShapes(s)
  return raw.map((b: any) => {
    const type = b?.type === "image" ? "image" : b?.type === "quote" ? "quote" : "text"
    const x = Number(b?.x) || 0
    const y = Number(b?.y) || 0
    const w = Math.max(1, Number(b?.w) || 1)
    const h = Math.max(1, Number(b?.h) || 1)
    const fontSize = clamp(Math.round((Number(b?.fontSize) || 20) * 100), 400, 6000)
    return {
      kind: type,
      text: String(b?.text || ""),
      author: String(b?.author || ""),
      src: String(b?.src || ""),
      x,
      y,
      w,
      h,
      fontSize,
      bold: !!b?.bold,
      italic: !!b?.italic,
      color: hexColor(b?.color, type === "quote" ? "C4B5FD" : "FFFFFF"),
      align: toAlign(b?.align),
      font: b?.font ? String(b.font) : type === "quote" ? "Georgia, 'Times New Roman', serif" : "",
      filter: b?.filter ? String(b.filter) : "none",
    }
  })
}

function pptParas(text: string, sh: NormalizedPptxShape): string {
  const lines = String(text ?? "").split(/\r?\n/)
  const typeface = sh.font ? `<a:latin typeface="${esc(fontForPptx(sh.font))}"/>` : ""
  return lines
    .map(
      (line, i) =>
        `<a:p><a:pPr algn="${sh.align}"/><a:r><a:rPr lang="en-US" dirty="0" sz="${sh.fontSize}"${sh.bold ? ' b="1"' : ""}${sh.italic ? ' i="1"' : ""}>${typeface}<a:solidFill><a:srgbClr val="${sh.color}"/></a:solidFill></a:rPr><a:t>${esc(line)}</a:t></a:r>${
          i < lines.length - 1 ? '<a:endParaRPr lang="en-US" dirty="0"/>' : ""
        }</a:p>`
    )
    .join("")
}

function pptTextShape(id: number, sh: NormalizedPptxShape): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr><a:spAutoFit/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm rot="0"><a:off x="${emu(sh.x)}" y="${emu(sh.y)}"/><a:ext cx="${emu(sh.w)}" cy="${emu(sh.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${pptParas(sh.text, sh)}</p:txBody>
</p:sp>`
}

function pptQuoteShape(id: number, sh: NormalizedPptxShape): string {
  const bar = `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="QuoteBar ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm rot="0"><a:off x="${emu(sh.x)}" y="${emu(sh.y + 6)}"/><a:ext cx="${emu(14)}" cy="${emu(sh.h - 12)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${sh.color}"/></a:solidFill></p:spPr>
</p:sp>`
  const text = `<p:sp>
<p:nvSpPr><p:cNvPr id="${id + 1}" name="Quote ${id}"/><p:cNvSpPr><a:spAutoFit/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm rot="0"><a:off x="${emu(sh.x + 30)}" y="${emu(sh.y)}"/><a:ext cx="${emu(Math.max(1, sh.w - 34))}" cy="${emu(sh.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${pptParas(sh.text, sh)}${sh.author ? pptParas(`\u2014 ${sh.author}`, { ...sh, italic: false, color: "B8B8C5", align: "r" }) : ""}</p:txBody>
</p:sp>`
  return bar + "\n" + text
}

function pptImageShape(id: number, name: string, x: number, y: number, w: number, h: number, rid: string): string {
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm rot="0"><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
</p:pic>`
}

function pptSlideXml(slideNumber: number, bg: string, parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${parts.join("\n")}
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`
}

function pptSlideRels(imageRels: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
${imageRels.join("\n")}
</Relationships>`
}

export async function presentationToPptxBlob(title: string, slides: PptxSlideInput[]): Promise<Blob | null> {
  const clean = (Array.isArray(slides) ? slides : []).filter(Boolean)
  if (!clean.length) return null

  const slideFiles: Record<string, Uint8Array> = {}
  const mediaFiles: Record<string, Uint8Array> = {}
  const contentDefaults: Record<string, string> = {}
  let seq = 0

  for (let si = 0; si < clean.length; si++) {
    const bg = hexColor(clean[si].bg, "12111F")
    const shapes = normalizePptxShapes(clean[si])
    const parts: string[] = []
    const imageRels: string[] = []
    let idc = 10

    for (const sh of shapes) {
      if (sh.kind === "image") {
        const resolved = await resolveImage(sh.src, sh.filter)
        if (!resolved) continue
        const file = `image${++seq}.${resolved.ext}`
        mediaFiles[`ppt/media/${file}`] = strToU8(resolved.raw, true)
        contentDefaults[resolved.ext] =
          resolved.mime === "image/svg+xml"
            ? "image/svg+xml"
            : resolved.mime === "image/webp"
              ? "image/webp"
              : resolved.mime === "image/gif"
                ? "image/gif"
                : resolved.mime === "image/jpeg"
                  ? "image/jpeg"
                  : "image/png"
        const rid = `rImg${seq}`
        imageRels.push(
          `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`
        )
        const box = containBox(sh.w, sh.h, resolved.iw, resolved.ih)
        parts.push(pptImageShape(idc++, `Image ${seq}`, sh.x + box.x, sh.y + box.y, box.w, box.h, rid))
      } else if (sh.kind === "quote") {
        parts.push(pptQuoteShape(idc++, sh))
      } else {
        parts.push(pptTextShape(idc++, sh))
      }
    }

    slideFiles[`ppt/slides/slide${si + 1}.xml`] = strToU8(pptSlideXml(si + 1, bg, parts))
    slideFiles[`ppt/slides/_rels/slide${si + 1}.xml.rels`] = strToU8(pptSlideRels(imageRels))
  }

  const sldIdLst = clean.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")
  const slideRels = clean
    .map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`)
    .join("")
  const overrideRels = clean
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("")
  const imageDefaults = Object.entries(contentDefaults)
    .map(([ext, ctype]) => `<Default Extension="${ext}" ContentType="${ctype}"/>`)
    .join("")

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${imageDefaults}
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${overrideRels}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${sldIdLst}</p:sldIdLst>
<p:sldSz cx="${PPTX_CX}" cy="${PPTX_CY}" type="screen16x10"/>
<p:notesSz cx="14287500" cy="9525000"/>
</p:presentation>`

  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
</Relationships>`

  const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="12111F"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree>
</p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`

  const masterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

  const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank">
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`

  const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F497D"/></a:dk2>
<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
<a:accent2><a:srgbClr val="C0504D"/></a:accent2>
<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
<a:accent4><a:srgbClr val="8064A2"/></a:accent4>
<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
<a:accent6><a:srgbClr val="F79646"/></a:accent6>
<a:hlink><a:srgbClr val="0000FF"/></a:hlink>
<a:folHlink><a:srgbClr val="800080"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`

  const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:creator>EcliOffice</dc:creator>
<cp:lastModifiedBy>EcliOffice</cp:lastModifiedBy>
</cp:coreProperties>`

  const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>EcliOffice</Application>
<Slides>${clean.length}</Slides>
</Properties>`

  const zip = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "docProps/core.xml": strToU8(coreProps),
    "docProps/app.xml": strToU8(appProps),
    "ppt/presentation.xml": strToU8(presentationXml),
    "ppt/_rels/presentation.xml.rels": strToU8(presentationRels),
    "ppt/slideMasters/slideMaster1.xml": strToU8(slideMaster),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": strToU8(masterRels),
    "ppt/slideLayouts/slideLayout1.xml": strToU8(slideLayout),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": strToU8(layoutRels),
    "ppt/theme/theme1.xml": strToU8(theme),
    ...mediaFiles,
    ...slideFiles,
  })

  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })
}

const PDF_VW = 1280
const PDF_VH = 800
const PDF_SCALE = PDF_VW / 960

function pdfBlockHtml(b: any): string {
  const style = `left:${((b?.x || 0) * PDF_SCALE).toFixed(2)}px;top:${((b?.y || 0) * PDF_SCALE).toFixed(2)}px;width:${((b?.w || 1) * PDF_SCALE).toFixed(2)}px;height:${((b?.h || 1) * PDF_SCALE).toFixed(2)}px;font-size:${(((b?.fontSize || 20) * PDF_SCALE) || 20).toFixed(1)}px;color:${b?.color || "#ffffff"};font-weight:${b?.bold ? 700 : 400};font-style:${b?.italic ? "italic" : "normal"};text-align:${b?.align || "left"};font-family:${b?.font ? `"${esc(String(b.font))}"` : "sans-serif"}`
  if (b?.type === "image") {
    return `<div class="blk" style="${style}"><div class="imgct"><img src="${esc(b.src || "")}" class="img"${b?.filter ? ` style="filter:${esc(filterCss(b.filter))}"` : ""}/></div></div>`
  }
  if (b?.type === "quote") {
    return `<div class="blk" style="${style}"><div class="qbar" style="background:${esc(b.color || "#c4b5fd")}"></div><div class="qwrap"><div class="qtext">${esc(b.text || "")}</div>${b.author ? `<div class="qauth">&mdash; ${esc(b.author)}</div>` : ""}</div></div>`
  }
  return `<div class="blk" style="${style}">${esc(String(b?.text || ""))}</div>`
}

export function presentationToPdfPrintHtml(title: string, slides: PptxSlideInput[]): string {
  const clean = (Array.isArray(slides) ? slides : []).filter(Boolean)
  const slidesHtml = clean
    .map((s) => {
      const bg = hexColor(s.bg, "12111F")
      const blocks = (Array.isArray(s.blocks) && s.blocks.length ? s.blocks : legacyShapes(s))
        .map(pdfBlockHtml)
        .join("")
      return `<div class="slide" style="background-color:#${bg}">${blocks}</div>`
    })
    .join("")
  const css = `
@page { size: ${PDF_VW}px ${PDF_VH}px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.slide { position: relative; width: ${PDF_VW}px; height: ${PDF_VH}px; overflow: hidden; page-break-after: always; page-break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.blk { position: absolute; white-space: pre-wrap; overflow: hidden; line-height: 1.25; }
.imgct { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.img { max-width: 100%; max-height: 100%; object-fit: contain; }
.qbar { position: absolute; left: 0; top: 6px; bottom: 6px; width: 14px; }
.qwrap { position: absolute; left: 24px; right: 0; top: 0; bottom: 0; }
.qtext { font-family: Georgia, "Times New Roman", serif; font-style: italic; }
.qauth { margin-top: 8px; font-family: inherit; font-style: normal; text-align: right; color: #b8b8c5; }
`
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${css}</style></head><body>${slidesHtml}</body></html>`
}

function whenImagesLoaded(win: Window, cb: () => void, timeoutMs = 1200): void {
  const imgs = Array.from(win.document.images)
  if (!imgs.length) { cb(); return }
  let left = imgs.length
  const done = () => { if (--left <= 0) cb() }
  imgs.forEach((img) => {
    if (img.complete) done()
    else { img.onload = done; img.onerror = done }
  })
  setTimeout(cb, timeoutMs)
}

export function exportPresentationPdf(title: string, slides: PptxSlideInput[]): void {
  const win = window.open("", "_blank", "width=1280,height=820")
  if (!win) return
  win.document.write(presentationToPdfPrintHtml(title, slides))
  win.document.close()
  whenImagesLoaded(win, () => {
    win.print()
  })
}

export function markdownToWordDocBlob(title: string, markdown: string): Blob {
  const html = markdown
    .split(/\r?\n/)
    .reduce<string[]>((acc, raw) => {
      const line = raw.trimEnd()
      if (line.trim() === "") {
        if (acc.length && acc[acc.length - 1] !== "") acc.push("")
      } else {
        acc.push(line)
      }
      return acc
    }, [])
    .filter((line, i, arr) => !(line === "" && (i === 0 || i === arr.length - 1)))
    .map((line) => {
      const h = /^(#{1,6})\s+(.*)$/.exec(line)
      if (h) return `<h${h[1].length}>${inlineHtml(h[2])}</h${h[1].length}>`
      if (/^[-*+]\s+/.test(line)) {
        const content = line.replace(/^[-*+]\s+/, "")
        return `<p>&nbsp;&nbsp;&bull; ${inlineHtml(content)}</p>`
      }
      if (/^\d+[.)]\s+/.test(line)) {
        const content = line.replace(/^\d+[.)]\s+/, "")
        return `<p>&nbsp;&nbsp; ${inlineHtml(content)}</p>`
      }
      if (line.trim() === "---" || line.trim() === "***") return `<hr/>`
      return `<p>${inlineHtml(line)}</p>`
    })
    .join("")

  const doc = `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
p { margin: 0 0 0.6rem 0; line-height: 1.5; font-family: Aptos, "Segoe UI", Arial, sans-serif; font-size: 11pt; }
h1 { font-size: 18pt; margin: 1rem 0 0.5rem; } h2 { font-size: 15pt; margin: 1rem 0 0.4rem; }
h3 { font-size: 13pt; margin: 0.8rem 0 0.3rem; } h4, h5, h6 { font-size: 11pt; margin: 0.7rem 0 0.2rem; }
code, pre { font-family: Consolas, monospace; font-size: 10pt; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${html}
</body>
</html>`

  return new Blob([doc], { type: "application/msword" })
}

function inlineHtml(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])_([^_]+)_/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>")
}

export interface SheetCellStyle {
  b?: 1
  i?: 1
  u?: 1
  s?: number
  a?: "l" | "c" | "r"
  c?: string
  bg?: string
}

export interface SheetImage {
  id?: string
  col: number
  row: number
  src: string
  w: number
  h: number
}

export interface SheetSnapshot {
  cols: number
  rows: number
  cells: Record<string, string>
  styles?: Record<string, SheetCellStyle>
  images?: SheetImage[]
}

const XL_PX_TO_EMU = 9525
const XL_CELL_W = 64
const XL_CELL_H = 28

function xlColName(n: number): string {
  let s = ""
  let i = n
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s
    i = Math.floor(i / 26) - 1
  }
  return s
}

function sheetCell(cells: Record<string, string>, col: number, row: number): string {
  const v = cells[`cell:${col}:${row}`]
  if (v !== undefined) return String(v)
  const a1 = `${xlColName(col)}${row + 1}`
  const mapped = cells[a1]
  return mapped === undefined ? "" : String(mapped)
}

function xlNum(value: string): boolean {
  const v = value.trim()
  if (!v || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v)) return false
  return Number.isFinite(Number(v)) && v.length <= 24
}

export async function sheetToXlsxBlob(title: string, snap: SheetSnapshot | null | undefined): Promise<Blob | null> {
  const cols = Math.max(1, Math.min(52, Number(snap?.cols) || 1))
  const rows = Math.max(1, Math.min(4000, Number(snap?.rows) || 1))
  const cells = (snap?.cells || {}) as Record<string, string>
  const rawStyles = (snap?.styles || {}) as Record<string, SheetCellStyle>
  const rawImages = (Array.isArray(snap?.images) ? snap.images : []).filter(
    (i: SheetImage) => !!i?.src && typeof i.col === "number"
  ) as SheetImage[]

  const fontIds = new Map<string, number>()
  const fontsXml: string[] = []
  const fontOf = (st: SheetCellStyle): number => {
    const cHex = st.c ? hexColor(st.c, "") : ""
    const key = JSON.stringify([st.b ? 1 : 0, st.i ? 1 : 0, st.u ? 1 : 0, st.s || 0, cHex])
    let id = fontIds.get(key)
    if (id === undefined) {
      id = fontsXml.length
      fontIds.set(key, id)
      const attrs = [st.b ? ' b="1"' : "", st.i ? ' i="1"' : "", st.u ? ' u="single"' : ""].join("")
      fontsXml.push(
        `<font${attrs}><sz val="${st.s || 11}"/><name val="Calibri"/>${cHex ? `<color rgb="FF${cHex.toUpperCase()}"/>` : ""}</font>`
      )
    }
    return id
  }
  fontOf({})
  const fillIds = new Map<string, number>()
  const fillsXml: string[] = []
  const fillOf = (st: SheetCellStyle): number => {
    const bgHex = st.bg ? hexColor(st.bg, "") : ""
    let id = fillIds.get(bgHex)
    if (id === undefined) {
      id = fillsXml.length
      fillIds.set(bgHex, id)
      fillsXml.push(
        bgHex
          ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${bgHex.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`
          : '<fill><patternFill patternType="none"/></fill>'
      )
    }
    return id
  }
  fillOf({})

  const xfsXml: string[] = []
  const xfIds = new Map<string, number>()
  const sxByCell: Record<string, number> = {}
  const styleKey = (st: SheetCellStyle): string =>
    [
      st.b ? 1 : 0,
      st.i ? 1 : 0,
      st.u ? 1 : 0,
      st.s || 0,
      st.a || "",
      st.c ? hexColor(st.c, "") : "",
      st.bg ? hexColor(st.bg, "") : "",
    ].join("|")

  for (const [key, st] of Object.entries(rawStyles)) {
    if (!st) continue
    const sk = styleKey(st)
    if (xfIds.has(sk)) continue
    const fid = fontOf(st)
    const fild = fillOf(st)
    const align = st.a === "l" ? "left" : st.a === "c" ? "center" : st.a === "r" ? "right" : ""
    const attrs = [`numFmtId="0"`, `fontId="${fid}"`, `fillId="${fild}"`, `borderId="0"`, `xfId="0"`]
    if (fid > 0) attrs.push('applyFont="1"')
    if (fild > 0) attrs.push('applyFill="1"')
    if (align) attrs.push('applyAlignment="1"')
    const id = xfsXml.length + 1
    xfIds.set(sk, id)
    sxByCell[key] = id
    xfsXml.push(`<xf ${attrs.join(" ")}>${align ? `<alignment horizontal="${align}" vertical="bottom"/>` : '<alignment vertical="bottom"/>'}</xf>`)
  }

  const defaultXf = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="bottom"/></xf>'
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${fontsXml.length}">${fontsXml.join("")}</fonts>
<fills count="${fillsXml.length}">${fillsXml.join("")}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfsXml.length + 1}">${defaultXf}${xfsXml.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

  const shared: string[] = []
  const sstIdx = new Map<string, number>()
  const sharedOf = (v: string): number => {
    let id = sstIdx.get(v)
    if (id === undefined) {
      id = shared.length
      sstIdx.set(v, id)
      shared.push(v)
    }
    return id
  }

  const rowParts: string[] = []
  let cellCount = 0
  for (let r = 0; r < rows; r++) {
    let cellsXml = ""
    for (let c = 0; c < cols; c++) {
      const v = sheetCell(cells, c, r)
      if (v === "") continue
      const ref = `${xlColName(c)}${r + 1}`
      const key = `cell:${c}:${r}`
      const sx = sxByCell[key] === undefined ? "" : ` s="${sxByCell[key]}"`
      if (v.startsWith("=")) {
        cellsXml += `<c r="${ref}"${sx}><f>${esc(v.slice(1))}</f></c>`
      } else if (xlNum(v)) {
        cellsXml += `<c r="${ref}"${sx}><v>${v.trim()}</v></c>`
      } else {
        cellsXml += `<c r="${ref}"${sx} t="s"><v>${sharedOf(v)}</v></c>`
      }
      cellCount++
    }
    if (cellsXml) rowParts.push(`<row r="${r + 1}">${cellsXml}</row>`)
  }

  const mediaFiles: Record<string, Uint8Array> = {}
  const contentImgDefaults: Record<string, string> = {}
  const drawingAnchors: string[] = []
  const drawingRels: string[] = []
  let seq = 0
  for (const img of rawImages) {
    const resolved = await resolveImage(img.src)
    if (!resolved) continue
    const file = `image${++seq}.${resolved.ext}`
    mediaFiles[`xl/media/${file}`] = strToU8(resolved.raw, true)
    const mime =
      resolved.mime === "image/svg+xml"
        ? "image/svg+xml"
        : resolved.mime === "image/webp"
          ? "image/webp"
          : resolved.mime === "image/gif"
            ? "image/gif"
            : resolved.mime === "image/jpeg"
              ? "image/jpeg"
              : "image/png"
    contentImgDefaults[resolved.ext] = mime
    const rid = `rId${seq}`
    drawingRels.push(
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`
    )
    const fromCol = clamp(Math.round(Number(img.col) || 0), 0, cols - 1)
    const fromRow = clamp(Math.round(Number(img.row) || 0), 0, rows - 1)
    const w = clamp(Math.round(Number(img.w) || 200), 16, 4096)
    const h = clamp(Math.round(Number(img.h) || 120), 16, 4096)
    const toCol = Math.min(cols - 1, fromCol + Math.max(1, Math.ceil(w / XL_CELL_W)))
    const toRow = Math.min(rows - 1, fromRow + Math.max(1, Math.ceil(h / XL_CELL_H)))
    drawingAnchors.push(`<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>${Math.round(w * 4762)}</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>${Math.round(h * 9525)}</xdr:rowOff></xdr:to>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="${seq + 2}" name="Image ${seq}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * XL_PX_TO_EMU}" cy="${h * XL_PX_TO_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:twoCellAnchor>`)
  }
  const hasDrawing = drawingAnchors.length > 0

  const sheetDataXml = rowParts.length ? rowParts.join("") : `<row r="1"><c r="A1" t="s"><v>${sharedOf("")}</v></c></row>`
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols><col min="1" max="${cols}" width="9.2" customWidth="1"/></cols>
<sheetData>${sheetDataXml}</sheetData>
${hasDrawing ? `<drawing r:id="rId1"/>` : ""}
</worksheet>`

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${cellCount}" uniqueCount="${shared.length}">${shared
    .map((v) => `<si><t xml:space="preserve">${esc(v)}</t></si>`)
    .join("")}</sst>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
${hasDrawing ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="drawings/drawing1.xml"/>' : ""}
</Relationships>`

  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hasDrawing ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' : ""}
</Relationships>`

  const drawingXml = hasDrawing
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${drawingAnchors.join("\n")}
</xdr:wsDr>`
    : ""

  const drawingRelsXml = hasDrawing
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${drawingRels.join("\n")}
</Relationships>`
    : ""

  const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:creator>EcliOffice</dc:creator>
<cp:lastModifiedBy>EcliOffice</cp:lastModifiedBy>
</cp:coreProperties>`

  const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>EcliOffice</Application>
<Sheets>1</Sheets>
</Properties>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${Object.entries(contentImgDefaults)
    .map(([ext, mt]) => `<Default Extension="${ext}" ContentType="${mt}"/>`)
    .join("")}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${hasDrawing ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

  const zip = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "docProps/core.xml": strToU8(coreProps),
    "docProps/app.xml": strToU8(appProps),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(stylesXml),
    "xl/sharedStrings.xml": strToU8(sharedStringsXml),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
    "xl/worksheets/_rels/sheet1.xml.rels": strToU8(sheetRels),
    ...(hasDrawing
      ? {
          "xl/drawings/drawing1.xml": strToU8(drawingXml),
          "xl/drawings/_rels/drawing1.xml.rels": strToU8(drawingRelsXml),
        }
      : {}),
    ...mediaFiles,
  } as Record<string, Uint8Array>)

  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}