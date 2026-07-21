"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft, Eye, Save, Upload, Bold, Italic, Heading, LinkIcon, Image, Code, Quote,
  List, ListOrdered, Video,
} from "lucide-react"
import { renderTitleHtml } from "@/components/blog/blog-format"
import Link from "next/link"

function renderMarkdown(md: string): React.ReactNode {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-6 mb-2">{line.slice(3)}</h2>
    if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4 mb-1.5">{line.slice(4)}</h3>
    if (line.startsWith("![")) {
      const m = line.match(/!\[(.*)\]\((.*)\)/)
      if (m) return <img key={i} src={m[2]} alt={m[1]} className="rounded-lg my-3 max-w-full max-h-64 object-cover" />
    }
    if (line.startsWith("> ")) return <blockquote key={i} className="border-l-4 border-primary/30 pl-3 my-2 italic text-muted-foreground">{line.slice(2)}</blockquote>
    if (line.startsWith("```")) return <pre key={i} className="rounded-lg p-3 my-2 overflow-x-auto text-xs bg-muted/50 font-mono">{line.slice(3, -3)}</pre>
    if (line.startsWith("- ")) return <li key={i} className="ml-4 my-0.5 text-sm">{line.slice(2)}</li>
    if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 my-0.5 text-sm">{line.replace(/^\d+\. /, "")}</li>
    if (line.match(/^(.+)\n?$/)) {
      let html: React.ReactNode = line
      const boldRegex = /\*\*(.+?)\*\*/g
      const italicRegex = /_(.+?)_/g
      const parts: React.ReactNode[] = []
      let last = 0
      let match: RegExpExecArray | null
      const combined = new RegExp('(\\*\\*.+?\\*\\*|_.+?_)', 'g')
      while ((match = combined.exec(line)) !== null) {
        if (match.index > last) parts.push(line.slice(last, match.index))
        const m = match[0]
        if (m.startsWith("**") && m.endsWith("**")) parts.push(<strong key={match.index}>{m.slice(2, -2)}</strong>)
        else if (m.startsWith("_") && m.endsWith("_")) parts.push(<em key={match.index}>{m.slice(1, -1)}</em>)
        else parts.push(m)
        last = match.index + m.length
      }
      if (last < line.length) parts.push(line.slice(last))
      return <p key={i} className="my-1.5 leading-relaxed text-sm">{parts.length > 0 ? parts : line}</p>
    }
    if (line === "") return <br key={i} />
    return <p key={i} className="my-1.5 text-sm">{line}</p>
  })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100)
}

export default function NewBlogPostPage() {
  const t = useTranslations("blogPage")
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [content, setContent] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [status, setStatus] = useState<"draft" | "published">("draft")
  const [tags, setTags] = useState("")
  const [contentFlags, setContentFlags] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState("write")
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const insertFormat = (before: string, after: string = "", placeholder: string = "") => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.substring(start, end)
    const text = selected || placeholder
    const newContent = content.substring(0, start) + before + text + after + content.substring(end)
    setContent(newContent)
    setTimeout(() => {
      el.focus()
      const cursor = start + before.length + text.length + after.length
      el.setSelectionRange(selected ? start + before.length : start + before.length, selected ? cursor : cursor)
    }, 0)
  }

  const formatToolbar = (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/20 rounded-t-lg overflow-x-auto">
      {[
        { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", before: "**", after: "**", placeholder: "bold text" },
        { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", before: "_", after: "_", placeholder: "italic text" },
        { icon: <Heading className="h-3.5 w-3.5" />, label: "Heading", before: "\n## ", placeholder: "Heading" },
        { icon: <Quote className="h-3.5 w-3.5" />, label: "Quote", before: "\n> ", placeholder: "quote" },
        { icon: <Code className="h-3.5 w-3.5" />, label: "Code", before: "\n```\n", after: "\n```\n", placeholder: "code" },
        { icon: <LinkIcon className="h-3.5 w-3.5" />, label: "Link", before: "[", after: "](url)", placeholder: "link text" },
        { icon: <Image className="h-3.5 w-3.5" />, label: "Image", before: "![", after: "](url)", placeholder: "alt text" },
        { icon: <Video className="h-3.5 w-3.5" />, label: "Video", before: "\n:::video ", after: "\n", placeholder: "https://youtube.com/watch?v=..." },
        { icon: <List className="h-3.5 w-3.5" />, label: "Bullet list", before: "\n- ", placeholder: "item" },
        { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered list", before: "\n1. ", placeholder: "item" },
      ].map((btn) => (
        <button
          key={btn.label}
          type="button"
          title={btn.label}
          onClick={() => insertFormat(btn.before, btn.after, btn.placeholder)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
        >
          {btn.icon}
        </button>
      ))}
    </div>
  )

  const autoSlug = useCallback(() => {
    if (!slug) setSlug(slugify(title))
  }, [title, slug])

  useEffect(() => {
    if (title && !slug) setSlug(slugify(title))
  }, [title])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await apiFetch(API_ENDPOINTS.blogMineUpload, {
        method: "POST",
        body: form,
      })
      if (res?.url) {
        setCoverImageUrl(res.url)
      }
    } catch {
      // ignore
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async (publishStatus?: "draft" | "published") => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const body: any = {
        title: title.trim(),
        slug: slug || slugify(title),
        content,
        excerpt,
        coverImageUrl: coverImageUrl || undefined,
        status: publishStatus || status,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        contentFlags,
        scheduledAt: scheduledAt || undefined,
      }
      const res = await apiFetch(API_ENDPOINTS.blogMinePosts, {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (res?.id) {
        router.push("/dashboard/blog")
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("newPost")}
        description={t("newPostDescription")}
      />
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full overflow-hidden">
          <Link href="/dashboard/blog">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back")}
            </Button>
          </Link>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{t("postTitle")}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("postTitlePlaceholder")}
                className="text-lg font-medium"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">{t("slug")}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder={t("slugPlaceholder")}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="excerpt">{t("excerpt")}</Label>
              <Input
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder={t("excerptPlaceholder")}
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="write">{t("write")}</TabsTrigger>
                <TabsTrigger value="preview">{t("preview")}</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="mt-2">
                <div className="rounded-lg border overflow-hidden">
                  {formatToolbar}
                  <Textarea
                    ref={contentRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t("contentPlaceholder")}
                    className="min-h-[350px] font-mono text-sm border-0 rounded-none focus-visible:ring-0"
                    onPaste={async (e) => {
                      const items = e.clipboardData?.items
                      if (!items) return
                      for (const item of Array.from(items)) {
                        if (item.type.startsWith("image/")) {
                          e.preventDefault()
                          const file = item.getAsFile()
                          if (!file) continue
                          setUploading(true)
                          try {
                            const form = new FormData()
                            form.append("file", file)
                            const res = await apiFetch(API_ENDPOINTS.blogMineUpload, { method: "POST", body: form })
                            if (res?.url) {
                              const el = contentRef.current
                              if (!el) return
                              const start = el.selectionStart
                              const text = `\n![](${res.url})\n`
                              setContent(content.substring(0, start) + text + content.substring(el.selectionEnd))
                            }
                          } catch { /* */ }
                          finally { setUploading(false) }
                          return
                        }
                      }
                    }}
                  />
                </div>
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <Card>
                  <CardContent className="py-6 min-h-[350px]">
                    {content ? (
                      <div className="max-w-none text-sm leading-relaxed space-y-1.5">
                        {content.substring(0, 5000).split("\n").map((line, i) => {
                          if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-4 mb-1" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(3)) }} />
                          if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-3 mb-1" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(4)) }} />
                          if (line.startsWith("> ")) return <blockquote key={i} className="border-l-[3px] pl-3 my-1.5 italic opacity-70" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(2)) }} />
                          if (line.startsWith("- ")) return <li key={i} className="ml-4 my-0.5" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.slice(2)) }} />
                          if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 my-0.5" dangerouslySetInnerHTML={{ __html: renderTitleHtml(line.replace(/^\d+\. /, "")) }} />
                          if (line === "") return <br key={i} />
                          return <p key={i} dangerouslySetInnerHTML={{ __html: renderTitleHtml(line) }} />
                        })}
                        {content.length > 5000 && (
                          <p className="text-xs text-muted-foreground mt-4 italic border-t pt-3">
                            {t("previewTruncated")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-sm">
                        {t("previewEmpty")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="grid gap-2">
              <Label>{t("coverImage")}</Label>
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="outline" size="sm" className="gap-1 shrink-0" type="button" disabled={uploading}
                  onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? t("uploading") : t("upload")}
                </Button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleUpload} />
                {coverImageUrl && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px] min-w-0">
                    {coverImageUrl.split("/").pop()}
                  </span>
                )}
              </div>
              {coverImageUrl && (
                <img
                  src={coverImageUrl}
                  alt={t("coverImageAlt")}
                  className="mt-2 rounded-lg max-h-40 object-cover"
                />
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">{t("tags")}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t("tagsPlaceholder")}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">{t("schedulePost")}</Label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full max-w-[240px] border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg"
              />
              {scheduledAt && (
                <p className="text-[10px] text-muted-foreground">
                  {t("scheduleAutoPublish", { date: new Date(scheduledAt).toLocaleString() })}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
              <Label className="text-xs text-muted-foreground shrink-0">{t("contentFlags")}</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={contentFlags.includes("mature")}
                    onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "mature"] : contentFlags.filter(f => f !== "mature"))} />
                  {t("mature")}
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={contentFlags.includes("political")}
                    onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "political"] : contentFlags.filter(f => f !== "political"))} />
                  {t("political")}
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={saving || !title.trim()}
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("saveDraft")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave("published")}
                  disabled={saving || !title.trim()}
                  className="gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t("publish")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}
