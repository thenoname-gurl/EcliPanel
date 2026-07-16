import type { Metadata } from "next"
import { BlogPageClient } from "./BlogPageClient"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL || ""
    const res = await fetch(`${apiBase}/api/public/blog/${slug}`, { next: { revalidate: 60 } })
    if (!res.ok) return { title: "Blog not found" }
    const blog = await res.json()
    const strip = (t: string) => (t || "").replace(/~[^~]+~/g, (_: string, i: string) => { const c = i.indexOf(":"); return c > 0 ? i.slice(c + 1) : i }).replace(/::.+$/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/_(.+?)_/g, "$1").trim()
    return {
      title: strip(blog.name) + " - Blog",
      description: strip(blog.description) || `Read ${blog.name}'s blog`,
      openGraph: {
        title: strip(blog.name),
        description: strip(blog.description) || "",
        type: "website",
        ...(blog.coverImageUrl ? { images: [blog.coverImageUrl] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: strip(blog.name),
        description: strip(blog.description) || "",
        ...(blog.coverImageUrl ? { images: [blog.coverImageUrl] } : {}),
      },
    }
  } catch {
    return { title: "Blog" }
  }
}

export default function Page({ params }: Props) {
  return <BlogPageClient params={params} />
}