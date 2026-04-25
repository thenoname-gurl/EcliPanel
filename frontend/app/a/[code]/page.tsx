import { notFound, redirect } from "next/navigation"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || ''

async function resolveShortUrl(code: string) {
  const base = String(API_BASE || '').replace(/\/$/, '')
  const url = `${base}/public/shorturls/a/${encodeURIComponent(code)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return typeof data?.target === 'string' ? data.target : null
}

export default async function ShortUrlRedirectPage({ params }: { params: { code: string } }) {
  const target = await resolveShortUrl(params.code)
  if (!target) return notFound()
  redirect(target)
}