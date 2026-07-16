"use client"
// Why even am I doing this..
// I swear why can't I just abandon ecli,
// What is holding me here, huh?
// I don't get this like seriously... god just why.
import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft, Eye, Save, Upload, Trash2, Bold, Italic, Heading, LinkIcon, Image, Code, Quote,
  List, ListOrdered, Video,
} from "lucide-react"
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
    if (line === "") return <br key={i} />
    const parts: React.ReactNode[] = []
    let last = 0
    const combined = /(\*\*.+?\*\*|_.+?_)/g
    let match: RegExpExecArray | null
    while ((match = combined.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index))
      const m = match[0]
      if (m.startsWith("**")) parts.push(<strong key={match.index}>{m.slice(2, -2)}</strong>)
      else parts.push(<em key={match.index}>{m.slice(1, -1)}</em>)
      last = match.index + m.length
    }
    if (last < line.length) parts.push(line.slice(last))
    return <p key={i} className="my-1.5 leading-relaxed text-sm">{parts.length > 0 ? parts : line}</p>
  })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100)
}

export default function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const t = useTranslations("blogPage")
  const router = useRouter()
  const { id } = use(params)

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [content, setContent] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [status, setStatus] = useState<"draft" | "published">("draft")
  const [tags, setTags] = useState("")
  const [contentFlags, setContentFlags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
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
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/20 rounded-t-lg">
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
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          {btn.icon}
        </button>
      ))}
    </div>
  )

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_ENDPOINTS.blogMinePostDetail.replace(":id", id))
      setTitle(data.title || "")
      setSlug(data.slug || "")
      setContent(data.content || "")
      setExcerpt(data.excerpt || "")
      setCoverImageUrl(data.coverImageUrl || "")
      setStatus(data.status || "draft")
      setTags((data.tags || []).join(", "))
      setContentFlags(data.contentFlags || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

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
      if (res?.url) setCoverImageUrl(res.url)
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
      }
      await apiFetch(API_ENDPOINTS.blogMinePostDetail.replace(":id", id), {
        method: "PUT",
        body: JSON.stringify(body),
      })
      router.push("/dashboard/blog")
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t("confirmDelete", { defaultValue: "Delete this post?" }))) return
    try {
      await apiFetch(API_ENDPOINTS.blogMinePostDetail.replace(":id", id), {
        method: "DELETE",
      })
      router.push("/dashboard/blog")
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <FeatureGuard feature="blog">
        <div className="p-4 md:p-6 space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </FeatureGuard>
    )
  }

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("editPost", { defaultValue: "Edit Post" })}
        description={title.replace(/~[^~]+~/g, '').replace(/\*\*/g, '').replace(/__/g, '').replace(/_/g, '').replace(/::.+/, '').trim() || t("editPostDescription", { defaultValue: "Edit your blog post" })}
      />
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <Link href="/dashboard/blog">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("back", { defaultValue: "Back to blog" })}
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1 text-red-600" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              {t("delete", { defaultValue: "Delete" })}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{t("postTitle", { defaultValue: "Title" })}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-medium"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">{t("slug", { defaultValue: "Slug" })}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="excerpt">{t("excerpt", { defaultValue: "Excerpt (optional)" })}</Label>
              <Input
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="write">{t("write", { defaultValue: "Write" })}</TabsTrigger>
                <TabsTrigger value="preview">{t("preview", { defaultValue: "Preview" })}</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="mt-2">
                <div className="rounded-lg border overflow-hidden">
                  {formatToolbar}
                  <Textarea
                    ref={contentRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
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
                      <div className="max-w-none">
                        {renderMarkdown(content.substring(0, 5000))}
                        {content.length > 5000 && (
                          <p className="text-xs text-muted-foreground mt-4 italic border-t pt-3">
                            Preview truncated at 5000 characters
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-sm">
                        {t("previewEmpty", { defaultValue: "Nothing to preview yet..." })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="grid gap-2">
              <Label>{t("coverImage", { defaultValue: "Cover image (optional)" })}</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-1" type="button" disabled={uploading}
                  onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {uploading
                    ? t("uploading", { defaultValue: "Uploading..." })
                    : t("upload", { defaultValue: "Upload" })}
                </Button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleUpload} />
              </div>
              {coverImageUrl && (
                <img src={coverImageUrl} alt="Cover" className="mt-2 rounded-lg max-h-40 object-cover" />
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">{t("tags", { defaultValue: "Tags (comma-separated)" })}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Label className="text-xs text-muted-foreground">{t("contentFlags", { defaultValue: "Content Flags" })}</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={contentFlags.includes("mature")}
                    onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "mature"] : contentFlags.filter(f => f !== "mature"))} />
                  Mature (NSFW)
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={contentFlags.includes("political")}
                    onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "political"] : contentFlags.filter(f => f !== "political"))} />
                  Political
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={saving || !title.trim()}
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("saveDraft", { defaultValue: "Save Draft" })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave("published")}
                  disabled={saving || !title.trim()}
                  className="gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t("publish", { defaultValue: "Publish" })}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}
