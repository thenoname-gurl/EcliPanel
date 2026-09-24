"use client"
import type { Metadata } from "next"
import { AuthorPageClient } from "./AuthorPageClient"
import { safeUrl } from "@/lib/url-utils"

type Props = { params: Promise<{ slug: string; userId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, userId } = await params
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL || ""
    const safeSlug = encodeURIComponent(slug);
    const safeUserId = encodeURIComponent(userId);
    const res = await fetch(safeUrl(apiBase, "/api/public/blog/", safeSlug, "/author/", safeUserId), { next: { revalidate: 60 } })
    if (!res.ok) return { title: "Author not found" }
    const data = await res.json()
    const strip = (t: string) => (t || "").replace(/~[^~]+~/g, (_: string, i: string) => { const c = i.indexOf(":"); return c > 0 ? i.slice(c + 1) : i }).replace(/::.+$/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/_(.+?)_/g, "$1").replace(/!\[.*\]\(.*\)/g, "").trim()
    return {
      title: strip(data.author?.name || "Author") + " - Blog",
      description: strip(data.author?.bio || `Posts by ${data.author?.name}`),
    }
  } catch {
    return { title: "Author" }
  }
}

export default function Page({ params }: Props) {
  return <AuthorPageClient params={params} />
}