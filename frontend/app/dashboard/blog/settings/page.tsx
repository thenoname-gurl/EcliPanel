"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft, Save, Palette, Layout, Upload,
} from "lucide-react"
import Link from "next/link"

const FONT_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "mono" },
]

const THEME_PRESETS = [
  { name: "Eclipse Purple", primary: "#8b5cf6", bg: "#0a0a12", fg: "#e8e4f0", card: "#12111f" },
  { name: "Cyber Blue", primary: "#06b6d4", bg: "#0a0f14", fg: "#e8e4f0", card: "#0f1820" },
  { name: "Neon Green", primary: "#10b981", bg: "#0a120e", fg: "#e8e4f0", card: "#0f1f17" },
  { name: "Solar Orange", primary: "#f59e0b", bg: "#12100a", fg: "#e8e4f0", card: "#1f1c0f" },
  { name: "Ruby Red", primary: "#ef4444", bg: "#120a0a", fg: "#e8e4f0", card: "#1f0f0f" },
  { name: "Voters 7 Mystery", primary: "#9CA3AF", bg: "#050507", fg: "#e6e7e9", card: "#0b0b0d" },
  { name: "Gambling Dark", primary: "#facc15", bg: "#0b0a07", fg: "#f8f5e6", card: "#14110a" },
  { name: "Arctic White", primary: "#8b5cf6", bg: "#f4f3f9", fg: "#1f2937", card: "#ffffff" },
  { name: "Arctic Snow", primary: "#0ea5e9", bg: "#fbfbff", fg: "#1e293b", card: "#ffffff" },
  { name: "Frost Beam", primary: "#22d3ee", bg: "#fdfdff", fg: "#1f2937", card: "#ffffff" },
  { name: "Nordic Light", primary: "#818cf8", bg: "#fafbff", fg: "#111827", card: "#ffffff" },
  { name: "Bubblegum Pink", primary: "#e594c7", bg: "#f4f8ff", fg: "#0f172a", card: "#ffffff" },
  { name: "Gambling White", primary: "#b45309", bg: "#fffdf7", fg: "#3f2a09", card: "#ffffff" },
]

export default function BlogSettingsPage() {
  const t = useTranslations("blogPage")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [visibility, setVisibility] = useState<"public" | "members" | "unlisted">("public")

  const [preset, setPreset] = useState("Eclipse Purple")
  const [primary, setPrimary] = useState("#8b5cf6")
  const [bg, setBg] = useState("#0a0a12")
  const [fg, setFg] = useState("#e8e4f0")
  const [cardColor, setCardColor] = useState("#12111f")
  const [fontHeading, setFontHeading] = useState("system")
  const [fontBody, setFontBody] = useState("system")
  const [customCss, setCustomCss] = useState("")
  const [contentFlags, setContentFlags] = useState<string[]>([])
  const [isMature, setIsMature] = useState(false)

  const load = useCallback(async () => {
    try {
      const blog = await apiFetch(API_ENDPOINTS.blogMine)
      setName(blog.name || "")
      setDescription(blog.description || "")
      setCoverImageUrl(blog.coverImageUrl || "")
      setVisibility(blog.visibility || "public")
      if (blog.theme) {
        setPreset(blog.theme.preset || "Eclipse Purple")
        setPrimary(blog.theme.primary || "#8b5cf6")
        setBg(blog.theme.bg || "#0a0a12")
        setFg(blog.theme.foreground || "#e8e4f0")
        setCardColor(blog.theme.card || "#12111f")
        setFontHeading(blog.theme.fontHeading || "system")
        setFontBody(blog.theme.fontBody || "system")
        setCustomCss(blog.theme.customCss || "")
        setContentFlags(blog.contentFlags || [])
        setIsMature(blog.isMature || false)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const applyPreset = (p: (typeof THEME_PRESETS)[0]) => {
    setPreset(p.name)
    setPrimary(p.primary)
    setBg(p.bg)
    setFg(p.fg)
    setCardColor(p.card)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.blogMine, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          description,
          coverImageUrl,
          visibility,
          contentFlags,
          isMature,
        }),
      })
      await apiFetch(API_ENDPOINTS.blogMineTheme, {
        method: "PUT",
        body: JSON.stringify({
          preset,
          primary,
          bg,
          foreground: fg,
          card: cardColor,
          fontHeading,
          fontBody,
          customCss,
        }),
      })
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

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

  if (loading) {
    return (
      <FeatureGuard feature="blog">
        <div className="p-4 md:p-6 space-y-4 max-w-3xl">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-64 w-full" />
        </div>
      </FeatureGuard>
    )
  }

  return (
    <FeatureGuard feature="blog">
      <PanelHeader
        title={t("settings", { defaultValue: "Blog Settings" })}
        description={t("settingsDescription", { defaultValue: "Customize your blog appearance and settings" })}
      />
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-6 max-w-3xl">
          <Link href="/dashboard/blog">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back", { defaultValue: "Back to blog" })}
            </Button>
          </Link>

          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">{t("general", { defaultValue: "General" })}</TabsTrigger>
              <TabsTrigger value="theme" className="gap-1">
                <Palette className="h-3.5 w-3.5" />
                {t("theme", { defaultValue: "Theme" })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("blogInfo", { defaultValue: "Blog Info" })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("blogName", { defaultValue: "Blog Name" })}</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="desc">{t("description", { defaultValue: "Description" })}</Label>
                    <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("coverImage", { defaultValue: "Cover Image" })}</Label>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" className="gap-1" type="button" disabled={uploading}
                        onClick={() => fileRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5" />
                        {uploading ? t("uploading", { defaultValue: "Uploading..." }) : t("upload", { defaultValue: "Upload" })}
                      </Button>
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleUpload} />
                    </div>
                    {coverImageUrl && (
                      <img src={coverImageUrl} alt="Cover" className="rounded-lg max-h-32 object-cover" />
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="visibility">{t("visibility", { defaultValue: "Visibility" })}</Label>
                    <select
                      id="visibility"
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as any)}
                      className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-sm rounded-lg"
                    >
                      <option value="public">{t("public", { defaultValue: "Public" })}</option>
                      <option value="members">{t("members", { defaultValue: "Members only" })}</option>
                      <option value="unlisted">{t("unlisted", { defaultValue: "Unlisted" })}</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("contentFlags", { defaultValue: "Content Flags" })}</Label>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={contentFlags.includes("mature")}
                          onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "mature"] : contentFlags.filter(f => f !== "mature"))} />
                        Mature (NSFW)
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={contentFlags.includes("political")}
                          onChange={(e) => setContentFlags(e.target.checked ? [...contentFlags, "political"] : contentFlags.filter(f => f !== "political"))} />
                        Political
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="theme" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("themePresets", { defaultValue: "Theme Presets" })}</CardTitle>
                  <CardDescription>
                    {t("themePresetsDescription", { defaultValue: "Pick a preset and tweak it" })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {THEME_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${preset === p.name ? "border-primary ring-1 ring-primary/20" : "border-border/50 hover:border-border"}`}
                      >
                        <div
                          className="w-full h-10 rounded border"
                          style={{ background: p.bg }}
                        >
                          <div className="h-1.5 rounded-t" style={{ background: p.primary }} />
                        </div>
                        <span className="text-[10px] font-medium">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("colors", { defaultValue: "Colors" })}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("primaryColor", { defaultValue: "Primary" })}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primary.startsWith("#") ? primary : "#1e3a5f"}
                        onChange={(e) => setPrimary(e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="font-mono text-xs" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("bgColor", { defaultValue: "Background" })}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bg.startsWith("#") ? bg : "#ffffff"}
                        onChange={(e) => setBg(e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input value={bg} onChange={(e) => setBg(e.target.value)} className="font-mono text-xs" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("fgColor", { defaultValue: "Text" })}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={fg.startsWith("#") ? fg : "#0f172a"}
                        onChange={(e) => setFg(e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input value={fg} onChange={(e) => setFg(e.target.value)} className="font-mono text-xs" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("cardColor", { defaultValue: "Card" })}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={cardColor.startsWith("#") ? cardColor : "#f8f9fa"}
                        onChange={(e) => setCardColor(e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input value={cardColor} onChange={(e) => setCardColor(e.target.value)} className="font-mono text-xs" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("typography", { defaultValue: "Typography" })}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("headingFont", { defaultValue: "Heading font" })}</Label>
                    <select
                      value={fontHeading}
                      onChange={(e) => setFontHeading(e.target.value)}
                      className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-sm rounded-lg"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("bodyFont", { defaultValue: "Body font" })}</Label>
                    <select
                      value={fontBody}
                      onChange={(e) => setFontBody(e.target.value)}
                      className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-sm rounded-lg"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Custom CSS */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("customCss", { defaultValue: "Custom CSS" })}</CardTitle>
                  <CardDescription>
                    {t("customCssDescription", { defaultValue: "Add your own CSS. Injected on your public blog pages." })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={customCss}
                    onChange={(e) => setCustomCss(e.target.value)}
                    placeholder="/* Your custom CSS */\n.blog-header { ... }"
                    className="w-full min-h-[120px] font-mono text-xs border border-border/60 bg-background px-3 py-2 rounded-lg resize-y"
                    spellCheck={false}
                  />
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("preview", { defaultValue: "Preview" })}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="rounded-lg border p-4 space-y-3"
                    style={{
                      background: bg.startsWith("#") ? bg : "#ffffff",
                      color: fg.startsWith("#") ? fg : "#0f172a",
                      fontFamily: fontBody === "mono" ? "monospace" : fontBody === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
                    }}
                  >
                    <div
                      className="h-2 w-20 rounded"
                      style={{ background: primary.startsWith("#") ? primary : "#1e3a5f" }}
                    />
                    <p style={{
                      fontFamily: fontHeading === "mono" ? "monospace" : fontHeading === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                    }}>
                      {name || t("sampleTitle", { defaultValue: "Sample Blog Title" })}
                    </p>
                    <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>
                      {description || t("sampleDescription", { defaultValue: "This is how your blog description will look." })}
                    </p>
                    <div
                      className="rounded p-3 text-sm"
                      style={{ background: cardColor.startsWith("#") ? cardColor : "#f8f9fa" }}
                    >
                      <p style={{ fontWeight: 600 }}>{t("samplePost", { defaultValue: "Sample post title" })}</p>
                      <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>{t("samplePostDate", { defaultValue: "Posted just now" })}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-2 border-t">
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              <Save className="h-3.5 w-3.5" />
              {saving ? t("saving", { defaultValue: "Saving..." }) : t("save", { defaultValue: "Save" })}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </FeatureGuard>
  )
}