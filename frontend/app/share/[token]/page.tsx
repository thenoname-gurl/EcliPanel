import type { Metadata } from "next"
import ShareFileClient from "./ShareFileClient"

interface ShareInfo {
  id: string
  fileName: string
  filePath: string
  isPreviewableCode: boolean
  isImage: boolean
  isVideo: boolean
  expiresAt: string | null
  downloads: number
}

const FALLBACK_TITLE = "Shared File - EclipseSystems"
const FALLBACK_DESC = "A file shared via EcliPanel"

function getBackendUrl(): string {
  return (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001").replace(/\/+$/, "")
}

async function fetchShareInfo(token: string): Promise<ShareInfo | null> {
  try {
    const res = await fetch(`${getBackendUrl()}/public/share/${token}`, {
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const info = await fetchShareInfo(token)
  const base = getBackendUrl()

  if (!info) {
    return {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESC,
      openGraph: { title: FALLBACK_TITLE, description: FALLBACK_DESC },
      twitter: { card: "summary", title: FALLBACK_TITLE, description: FALLBACK_DESC },
    }
  }

  const ogTitle = info.fileName
  const ogDesc = `Shared file via EcliPanel — ${info.filePath}`
  const mediaUrl = `${base}/public/share/${token}/media`

  const isVideo = info.isVideo
  const isImage = info.isImage

  const og: Record<string, unknown> = {
    title: ogTitle,
    description: ogDesc,
    type: isVideo ? "video.other" : isImage ? "article" : "website",
    images: [{ url: mediaUrl, alt: info.fileName, width: 1200, height: 630 }],
  }

  const twitter: Record<string, unknown> = {
    card: isImage || isVideo ? "summary_large_image" : "summary",
    title: ogTitle,
    description: ogDesc,
    images: [mediaUrl],
  }

  if (isVideo) {
    og.videos = [{ url: mediaUrl }]
  }

  return {
    title: ogTitle,
    description: ogDesc,
    openGraph: og,
    twitter,
  }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ShareFileClient token={token} />
}