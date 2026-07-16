"use client"

import { useState } from "react"
import { AlertTriangle, ArrowRight } from "lucide-react"

interface Props {
  flags: string[] | undefined | null
  type?: "banner" | "overlay" | "inline" | "modal"
  children?: React.ReactNode
  primaryColor?: string
  fgColor?: string
  title?: string
  excerpt?: string
}

const FLAG_LABELS: Record<string, string> = {
  mature: "Mature content (NSFW)",
  political: "Political opinion",
}

export function BlogContentWarning({ flags, type = "overlay", children, primaryColor = "#8b5cf6", fgColor = "#e8e4f0", title, excerpt }: Props) {
  const [revealed, setRevealed] = useState(false)

  if (!flags || flags.length === 0) return <>{children}</>

  if (revealed) return <>{children}</>

  if (type === "banner") {
    return (
      <>
        <div className="rounded-xl border p-4 mb-6 flex items-start gap-3" style={{ borderColor: primaryColor + "30", background: primaryColor + "08" }}>
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: primaryColor }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: fgColor }}>Content notice</p>
            <p className="text-xs mt-1" style={{ color: fgColor, opacity: 0.6 }}>
              This blog is marked as: {flags.map(f => FLAG_LABELS[f] || f).join(", ")}.
            </p>
          </div>
        </div>
        {children}
      </>
    )
  }

  if (type === "modal") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border" style={{ borderColor: primaryColor + "20", background: fgColor + "05" }}>
          <AlertTriangle className="h-10 w-10 mx-auto" style={{ color: primaryColor, opacity: 0.7 }} />
          <div>
            <p className="text-lg font-bold" style={{ color: fgColor }}>Content warning</p>
            <p className="text-sm mt-2" style={{ color: fgColor, opacity: 0.6 }}>
              This post is marked as: {flags.map(f => FLAG_LABELS[f] || f).join(", ")}.
            </p>
          </div>
          {title && (
            <div className="text-left rounded-xl border p-4" style={{ borderColor: primaryColor + "15", background: primaryColor + "05" }}>
              <p className="text-sm font-semibold" style={{ color: fgColor }}>{title}</p>
              {excerpt && <p className="text-xs mt-1" style={{ color: fgColor, opacity: 0.5 }}>{excerpt}</p>}
            </div>
          )}
          <p className="text-xs" style={{ color: fgColor, opacity: 0.4 }}>
            This content may not be suitable for all audiences. Are you sure you want to view it?
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => window.history.back()}
              className="px-4 py-2 rounded-lg text-xs font-semibold border transition-colors"
              style={{ borderColor: fgColor + "20", color: fgColor, opacity: 0.6 }}>
              Go back
            </button>
            <button onClick={() => setRevealed(true)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: primaryColor }}>
              Show content
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (type === "inline") {
    return (
      <>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
          style={{ background: primaryColor + "15", color: primaryColor }}>
          <AlertTriangle className="h-3 w-3" />
          {flags.map(f => FLAG_LABELS[f] || f).join(" · ")}
        </span>
        {children}
      </>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all" style={{ background: primaryColor + "08", border: `1px solid ${primaryColor}20` }}>
      <div className="h-1" style={{ background: primaryColor, opacity: 0.6 }} />
      <div className="p-5 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="h-6 w-6" style={{ color: primaryColor }} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: primaryColor, opacity: 0.7 }}>
            {flags.map(f => FLAG_LABELS[f] || f).join(" & ")}
          </p>
          {title && (
            <p className="text-sm font-semibold mt-2" style={{ color: fgColor }}>{title}</p>
          )}
          {excerpt && (
            <p className="text-xs mt-1 leading-relaxed max-w-xs mx-auto" style={{ color: fgColor, opacity: 0.55 }}>{excerpt}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealed(true) }}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: primaryColor }}>
            Show content
          </button>
          <span
            className="px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer hover:opacity-80"
            style={{ borderColor: primaryColor + "30", color: primaryColor }}>
            View post <ArrowRight className="h-3 w-3 inline" />
          </span>
        </div>
      </div>
    </div>
  )
}