"use client"
import ScreenViewer from "@/components/office/ScreenViewer"

export default async function ScreenSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ScreenViewer token={token} />
}