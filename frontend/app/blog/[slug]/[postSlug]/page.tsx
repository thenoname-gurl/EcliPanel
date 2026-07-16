import type { Metadata } from "next"
import { PostPageClient } from "./PostPageClient"

type Props = { params: Promise<{ slug: string; postSlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL || ""
    const res = await fetch(`${apiBase}/api/public/blog/${slug}/posts/${postSlug}`, { next: { revalidate: 60 } })
    if (!res.ok) return { title: "Post not found" }
    const post = await res.json()
    const strip = (t: string) => (t || "").replace(/~[^~]+~/g, (_: string, i: string) => { const c = i.indexOf(":"); return c > 0 ? i.slice(c + 1) : i }).replace(/::.+$/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/_(.+?)_/g, "$1").trim()
    return {
      title: strip(post.title) + " - " + (post.blog?.name || "Blog"),
      description: strip(post.excerpt || post.title),
      openGraph: {
        title: strip(post.title),
        description: strip(post.excerpt || ""),
        type: "article",
        ...(post.coverImageUrl ? { images: [post.coverImageUrl] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: strip(post.title),
        description: strip(post.excerpt || ""),
        ...(post.coverImageUrl ? { images: [post.coverImageUrl] } : {}),
      },
    }
  } catch {
    return { title: "Blog Post" }
  }
}

export default function Page({ params }: Props) {
  return <PostPageClient params={params} />
}