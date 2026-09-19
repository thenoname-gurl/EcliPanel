"use client"

import { MonitorUp, Link2, Smartphone, Eye, Play } from "lucide-react"
import ScreenShareButton from "@/components/office/ScreenShareButton"
import { PanelHeader } from "@/components/panel/header"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { useAuth } from "@/hooks/useAuth"

const STEPS = [
  {
    icon: MonitorUp,
    title: "Start sharing",
    text: "Pick what you want to show — a whole screen or a single window. Your browser asks for permission first.",
  },
  {
    icon: Link2,
    title: "Copy the link",
    text: "A unique public link is created the moment you go live. Share it in chat, email, Slack, or anywhere.",
  },
  {
    icon: Eye,
    title: "Anyone can watch",
    text: "Viewers open the link in any browser — no account, app, or install needed. They join your session instantly.",
  },
]

const FEATURES = [
  { icon: Play, title: "Real-time", text: "WebRTC peer-to-peer video with sub-second latency, relayed reliably through our signaling server." },
  { icon: Smartphone, title: "Watching works everywhere", text: "Viewers join from any device — iPhone, iPad, Android, Mac and Windows — in Chrome, Firefox, Edge or Safari, with no app or account." },
  { icon: MonitorUp, title: "Desktop to broadcast", text: "Sharing the screen requires a desktop browser (Chrome, Edge, Firefox, Safari). On iPhone and iPad, Apple restricts screen capture to native apps." },
]

function ScreenSharePage() {
  const { user } = useAuth()
  const userName = user?.displayName || user?.email?.split("@")[0] || "Host"

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader title="Screen share" description="Go live with a public link" />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {/* Hero / CTA */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-10">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(600px circle at 20% -10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 60%), radial-gradient(500px circle at 95% 110%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 55%)",
            }}
          />
          <div className="relative flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <MonitorUp className="h-8 w-8" />
            </div>
            <div className="max-w-xl space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Share your screen in one click
              </h1>
              <p className="text-sm text-muted-foreground md:text-base">
                Start sharing anything on your device and hand out a public link. Viewers don&apos;t need an account —
                they just open the link and watch live.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ScreenShareButton docId={0} docName="Screen share" docType="screen" userName={userName} />
              <p className="max-w-md text-xs text-muted-foreground">
                Screen sharing works in desktop browsers — Chrome, Edge, Firefox and Safari on Windows, macOS or Linux.
                On iPhone and iPad, Apple limits screen capture to native apps, so watching works but broadcasting doesn&apos;t.
              </p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            )
          })}
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="flex gap-3 rounded-xl border border-dashed border-border p-5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium text-foreground">{f.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ScreenSharePageEntry() {
  return (
    <FeatureGuard feature="office">
      <ScreenSharePage />
    </FeatureGuard>
  )
}