"use client"

import { useEffect, useState, useCallback, lazy, Suspense } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Layout, Star, Grid3X3, List, Info, Search, Video, Code, Wrench } from "lucide-react"
import Link from "next/link"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

interface LayoutSection {
  id: string
  type: "header" | "hero" | "post-grid" | "post-list" | "about" | "search" | "video" | "custom-html" | "script"
  order: number
  config: Record<string, unknown>
}

interface SectionTemplate {
  type: LayoutSection["type"]
  label: string
  description: string
  icon: React.ReactNode
  defaultConfig: Record<string, unknown>
}

const SECTION_TEMPLATES: SectionTemplate[] = [
  { type: "header", label: "Header", description: "Blog name, description, and cover image", icon: <Layout className="h-4 w-4" />, defaultConfig: { showName: true, showRss: false } },
  { type: "hero", label: "Hero", description: "Large centered title with optional background cover", icon: <Star className="h-4 w-4" />, defaultConfig: { title: "", subtitle: "", showCover: true, showRss: false } },
  { type: "post-grid", label: "Post Grid", description: "Card grid of recent posts (3 columns)", icon: <Grid3X3 className="h-4 w-4" />, defaultConfig: { count: 6, showExcerpt: true, showCover: true } },
  { type: "post-list", label: "Post List", description: "Vertical list of posts with excerpts", icon: <List className="h-4 w-4" />, defaultConfig: { count: 10, showDate: true } },
  { type: "about", label: "About", description: "Rich text section for blog description/bio", icon: <Info className="h-4 w-4" />, defaultConfig: { content: "" } },
  { type: "search", label: "Search Bar", description: "Let visitors search your posts", icon: <Search className="h-4 w-4" />, defaultConfig: { placeholder: "Search posts...", showCount: true } },
  { type: "video", label: "Video", description: "Embed a YouTube or Vimeo video", icon: <Video className="h-4 w-4" />, defaultConfig: { url: "", title: "", autoplay: false } },
  { type: "custom-html", label: "Custom HTML", description: "Raw HTML block (scripts stripped)", icon: <Code className="h-4 w-4" />, defaultConfig: { html: "" } },
  { type: "script", label: "Script", description: "JavaScript using the Blog SDK (safe, no API access)", icon: <Wrench className="h-4 w-4" />, defaultConfig: { code: "// See /docs/blog-handbook for the SDK reference\n\nblog.dom.onReady(() => {\n  // Your code here\n})" } },
]

const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTION_TEMPLATES.map((s) => [s.type, s.label])
)

function newSection(type: LayoutSection["type"], order: number): LayoutSection {
  const tmpl = SECTION_TEMPLATES.find((t) => t.type === type)!
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    order,
    config: { ...tmpl.defaultConfig },
  }
}

export default function BlogBuilderPage() {
  const t = useTranslations("blogPage")
  const [sections, setSections] = useState<LayoutSection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<LayoutSection | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({})
  const [slug, setSlug] = useState("")

  const load = useCallback(async () => {
    try {
      const blog = await apiFetch(API_ENDPOINTS.blogMine)
      setSlug(blog.slug || "")
      if (blog.layout?.sections) {
        setSections(blog.layout.sections)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = (type: LayoutSection["type"]) => {
    const maxOrder = sections.reduce((max, s) => Math.max(max, s.order), -1)
    setSections([...sections, newSection(type, maxOrder + 1)])
  }

  const handleRemove = (id: string) => {
    setSections(sections.filter((s) => s.id !== id))
  }

  const handleMove = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx === -1) return
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    const updated = [...sections]
    const tmp = updated[idx]!.order
    updated[idx] = { ...updated[idx]!, order: updated[target]!.order }
    updated[target] = { ...updated[target]!, order: tmp }
    updated.sort((a, b) => a.order - b.order)
    setSections(updated)
  }

  const openConfig = (section: LayoutSection) => {
    setEditingSection(section)
    setEditConfig({ ...section.config })
    setConfigOpen(true)
  }

  const saveConfig = () => {
    if (!editingSection) return
    setSections(sections.map((s) =>
      s.id === editingSection.id ? { ...s, config: editConfig } : s
    ))
    setConfigOpen(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.blogMineLayout, {
        method: "PUT",
        body: JSON.stringify({ sections }),
      })
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const renderConfigFields = () => {
    if (!editingSection) return null
    const cfg = editConfig
    const set = (k: string, v: unknown) => setEditConfig({ ...cfg, [k]: v })

    switch (editingSection.type) {
      case "header":
        return (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showName !== false} onChange={(e) => set("showName", e.target.checked)} />
              Show blog name
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showRss === true} onChange={(e) => set("showRss", e.target.checked)} />
              Show RSS icon
            </label>
          </div>
        )
      case "hero":
        return (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Title (leave empty for blog name)</label>
              <Input value={(cfg.title as string) || ""} onChange={(e) => set("title", e.target.value)} placeholder="Hero title" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Subtitle</label>
              <Input value={(cfg.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="Hero subtitle" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showCover !== false} onChange={(e) => set("showCover", e.target.checked)} />
              Show cover image
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showRss === true} onChange={(e) => set("showRss", e.target.checked)} />
              Show RSS icon
            </label>
          </div>
        )
      case "post-grid":
        return (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Posts per page (0 = all)</label>
              <Input type="number" value={String(cfg.count || 6)} onChange={(e) => set("count", Number(e.target.value))} min={0} max={24} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showExcerpt !== false} onChange={(e) => set("showExcerpt", e.target.checked)} />
              Show excerpts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showCover !== false} onChange={(e) => set("showCover", e.target.checked)} />
              Show cover images
            </label>
          </div>
        )
      case "post-list":
        return (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Posts per page (0 = all)</label>
              <Input type="number" value={String(cfg.count || 10)} onChange={(e) => set("count", Number(e.target.value))} min={0} max={50} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showDate !== false} onChange={(e) => set("showDate", e.target.checked)} />
              Show dates
            </label>
          </div>
        )
      case "about":
        return (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">Content (Markdown or plain text)</label>
            <Textarea
              value={(cfg.content as string) || ""}
              onChange={(e) => set("content", e.target.value)}
              rows={6}
              placeholder="Write about your blog..."
              className="font-mono text-sm"
            />
          </div>
        )
      case "search":
        return (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Placeholder text</label>
              <Input value={(cfg.placeholder as string) || ""} onChange={(e) => set("placeholder", e.target.value)} placeholder="Search posts..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.showCount !== false} onChange={(e) => set("showCount", e.target.checked)} />
              Show result count
            </label>
          </div>
        )
      case "video":
        return (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Video URL (YouTube or Vimeo)</label>
              <Input value={(cfg.url as string) || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://youtube.com/watch?v=..." />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Title (optional)</label>
              <Input value={(cfg.title as string) || ""} onChange={(e) => set("title", e.target.value)} placeholder="Video title" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.autoplay === true} onChange={(e) => set("autoplay", e.target.checked)} />
              Autoplay (muted)
            </label>
          </div>
        )
      case "custom-html":
        return (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">HTML (scripts automatically stripped)</label>
            <Textarea
              value={(cfg.html as string) || ""}
              onChange={(e) => set("html", e.target.value)}
              rows={8}
              placeholder="<div>Your custom HTML here</div>"
              className="font-mono text-sm"
            />
          </div>
        )
      case "script":
        return (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">
              JavaScript, uses the Blog SDK (<code>blog</code> object).{" "}
              <a href="/docs/blog-handbook" target="_blank" className="underline text-primary">View handbook</a>
            </label>
            <div className="border rounded-lg overflow-hidden bg-[#1e1e1e]" style={{ minHeight: "320px" }}>
              <Suspense fallback={<div className="h-[320px] flex items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}>
                <MonacoEditor
                  height="320px"
                  language="javascript"
                  theme="vs-dark"
                  value={(cfg.code as string) || ""}
                  onChange={(val) => set("code", val || "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 12 },
                  }}
                />
              </Suspense>
            </div>
          </div>
        )
      default:
        return <p className="text-sm text-muted-foreground">No configuration available.</p>
    }
  }

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("builder", { defaultValue: "Page Builder" })}
        description={t("builderDescription", { defaultValue: "Design your blog landing page layout" })}
      />
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-4 max-w-5xl">
          <div className="flex items-center justify-between">
            <Link href="/dashboard/blog">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("back", { defaultValue: "Back to blog" })}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              {slug && (
                <Link href={`/blog/${slug}`} target="_blank">
                  <Button variant="outline" size="sm">{t("preview", { defaultValue: "Preview" })}</Button>
                </Link>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                <Save className="h-3.5 w-3.5" />
                {saving ? t("saving", { defaultValue: "Saving..." }) : t("save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <Card className="lg:col-span-1 h-fit">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Sections</CardTitle>
                  <CardDescription className="text-xs">Click to add</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {SECTION_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.type}
                      onClick={() => handleAdd(tmpl.type)}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 hover:bg-secondary/40 hover:border-border transition-all text-left"
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary shrink-0">
                        {tmpl.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{tmpl.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{tmpl.description}</p>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                    </button>
                  ))}
                </CardContent>
              </Card>

              <div className="lg:col-span-3 space-y-3">
                {sections.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <GripVertical className="h-8 w-8 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {t("builderEmpty", { defaultValue: "No sections yet. Add sections from the palette to build your blog layout." })}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  sections.map((section, idx) => (
                    <Card key={section.id} className="relative group">
                      <CardContent className="flex items-center gap-3 py-3">
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                          <button onClick={() => handleMove(section.id, -1)} disabled={idx === 0}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                          <button onClick={() => handleMove(section.id, 1)} disabled={idx === sections.length - 1}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {SECTION_LABELS[section.type] || section.type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">Order: {section.order}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {section.type === "hero" && (section.config.title as string || "Default hero")}
                            {section.type === "post-grid" && `${section.config.count || 6} posts in grid`}
                            {section.type === "post-list" && `${section.config.count || 10} posts in list`}
                            {section.type === "about" && (section.config.content ? "Has content" : "Empty")}
                            {section.type === "video" && (section.config.url ? `Video: ${(section.config.url as string).substring(0, 40)}` : "No URL")}
                            {section.type === "custom-html" && (section.config.html ? "Has HTML" : "Empty")}
                            {section.type === "search" && "Search bar"}
                            {section.type === "script" && (section.config.code ? "Has script" : "Empty")}
                            {section.type === "header" && "Blog header"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openConfig(section)}>Configure</Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleRemove(section.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className={editingSection?.type === "script" ? "sm:max-w-2xl" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle className="text-base">
              Configure: {editingSection ? SECTION_LABELS[editingSection.type] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">{renderConfigFields()}</div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveConfig}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FeatureGuard>
  )
}