"use client"

import Link from "next/link"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { locales as supportedLocales } from "@/i18n/config"

interface InfraStatus {
  status: "online" | "degraded" | "offline" | string
  nodeCount: number
  online: number
  degraded: number
  offline: number
}

type Screen =
  | "boot"
  | "lang"
  | "menu"
  | "features"
  | "about"
  | "pricing"
  | "community"
  | "faq"
  | "deploy"
  | "legal"

const FETCH_INTERVAL_MS = 15_000
const API_URL = "https://backend.ecli.app/public/status"

const LOCALE_LABELS: Record<string, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  ru: { label: "Russian", native: "Русский" },
}

const SUPPORTED_LOCALES: { code: string; label: string; native: string }[] = supportedLocales.map((code) => ({
  code,
  label: LOCALE_LABELS[code]?.label ?? code,
  native: LOCALE_LABELS[code]?.native ?? code,
}))

function useInfraStatus() {
  const [infra, setInfra] = useState<InfraStatus | null>(null)
  useEffect(() => {
    let mounted = true
    const go = async () => {
      try {
        const r = await fetch(API_URL)
        if (!r.ok) return
        const d: InfraStatus = await r.json()
        if (mounted) setInfra(d)
      } catch { /* ghosts life here */ }
    }
    go()
    const iv = setInterval(go, FETCH_INTERVAL_MS)
    return () => { mounted = false; clearInterval(iv) }
  }, [])
  return infra
}

function useTypewriter(lines: string[], speed = 32, startDelay = 0) {
  const [output, setOutput]     = useState<string[]>([])
  const [done, setDone]         = useState(false)
  const [started, setStarted]   = useState(false)

  const key     = useMemo(() => lines.join("|||"), [lines])
  const prevKey = useRef<string>("")
  const linesRef = useRef<string[]>(lines)

  useEffect(() => { linesRef.current = lines }, [lines])

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), startDelay)
    return () => clearTimeout(t)
  }, [startDelay])

  useEffect(() => {
    if (!started) return
    if (prevKey.current === key && output.length > 0) return
    prevKey.current = key

    setOutput([])
    setDone(false)

    let li = 0, ci = 0, cancelled = false

    const tick = setInterval(() => {
      if (cancelled) return
      const cur = linesRef.current
      if (li >= cur.length) {
        if (!cancelled) { setDone(true); clearInterval(tick) }
        return
      }
      const line = cur[li]
      if (ci <= line.length) {
        const slice = line.slice(0, ci)
        setOutput(prev => { const n = [...prev]; n[li] = slice; return n })
        ci++
      } else { li++; ci = 0 }
    }, speed)

    return () => { cancelled = true; clearInterval(tick) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, key])

  return { output, done }
}

function useGlitch(minDelay = 4000, maxDelay = 9000) {
  const [glitching, setGlitching] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        setGlitching(true)
        setTimeout(() => { setGlitching(false); loop() }, 100 + Math.random() * 180)
      }, minDelay + Math.random() * (maxDelay - minDelay))
    }
    loop()
    return () => clearTimeout(t)
  }, [])
  return glitching
}

function statusColor(s: string | undefined) {
  if (s === "online")   return "text-green-400"
  if (s === "degraded") return "text-yellow-400"
  if (s === "offline")  return "text-red-400"
  return "text-purple-400/50"
}
function statusDotColor(s: string | undefined) {
  if (s === "online")   return "bg-green-400"
  if (s === "degraded") return "bg-yellow-400"
  if (s === "offline")  return "bg-red-400"
  return "bg-purple-400/30"
}

function Scanlines() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[200]"
      style={{
        background:
          "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)",
      }}
    />
  )
}

function CRTVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[199]"
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.88) 100%)",
      }}
    />
  )
}

function Cursor({ blink = true, color = "text-purple-400" }: { blink?: boolean; color?: string }) {
  return (
    <span
      className={`inline-block w-[0.55em] h-[1.1em] ${color} align-middle ml-0.5`}
      style={{ animation: blink ? "blink 1s step-end infinite" : "none", background: "currentColor" }}
    />
  )
}

function KbdHint({ keys, label }: { keys: string[]; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      {keys.map(k => (
        <kbd
          key={k}
          className="inline-flex items-center justify-center rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] text-purple-300/60 shadow-[0_1px_0_rgba(168,85,247,0.3)]"
        >
          {k}
        </kbd>
      ))}
      {label && <span className="text-[9px] text-purple-500/30 ml-0.5">{label}</span>}
    </span>
  )
}

function ControlBar({ hints }: { hints: { keys: string[]; label: string }[] }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[190] border-t border-purple-500/10 bg-black/90 backdrop-blur-sm px-4 py-2">
      <div className="mx-auto max-w-4xl flex flex-wrap items-center gap-x-5 gap-y-1">
        {hints.map(h => (
          <span key={h.label} className="flex items-center gap-1.5">
            <KbdHint keys={h.keys} />
            <span className="font-mono text-[9px] text-purple-500/35 uppercase tracking-wider">
              {h.label}
            </span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] text-purple-500/20 hidden sm:block">
          tap / swipe on mobile
        </span>
      </div>
    </div>
  )
}

function GlitchText({ text, className = "" }: { text: string; className?: string }) {
  const glitching = useGlitch()
  return (
    <span className={`relative inline-block ${className}`}>
      <span style={{ color: "#c084fc", textShadow: "0 0 30px rgba(192,132,252,0.5)" }}>
        {text}
      </span>
      {glitching && (
        <>
          <span aria-hidden className="absolute inset-0"
            style={{ color: "#f0abfc", clipPath: "inset(20% 0 60% 0)", transform: "translateX(-3px)", opacity: 0.8 }}>
            {text}
          </span>
          <span aria-hidden className="absolute inset-0"
            style={{ color: "#818cf8", clipPath: "inset(55% 0 15% 0)", transform: "translateX(3px)", opacity: 0.8 }}>
            {text}
          </span>
        </>
      )}
    </span>
  )
}

function PixelBox({
  children,
  className = "",
  glow = false,
  active = false,
}: {
  children: React.ReactNode
  className?: string
  glow?: boolean
  active?: boolean
}) {
  return (
    <div className={`
      border font-mono bg-[#0a0014]
      ${active
        ? "border-purple-400/70 shadow-[0_0_20px_rgba(168,85,247,0.25),inset_0_0_20px_rgba(168,85,247,0.05)]"
        : "border-purple-500/20"
      }
      ${glow ? "shadow-[0_0_30px_rgba(168,85,247,0.12)]" : ""}
      ${className}
    `}>
      {children}
    </div>
  )
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-[10px] tracking-[0.3em] text-purple-500/40 uppercase mb-2">
        // {label}
      </p>
      <h2 className="font-mono text-2xl sm:text-3xl font-black text-purple-300"
        style={{ textShadow: "0 0 20px rgba(168,85,247,0.4)" }}>
        {title}
      </h2>
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  const t = useTranslations("landing")
  return (
    <button
      onClick={onBack}
      className="mb-8 flex items-center gap-3 font-mono text-xs text-purple-400/40 hover:text-purple-300 transition-colors group"
    >
      <span className="group-hover:-translate-x-1 transition-transform">◄</span>
      {t("controls.backToMenu")}
      <KbdHint keys={["ESC"]} />
    </button>
  )
}

function StatusPip({ infra }: { infra: InfraStatus | null }) {
  const t = useTranslations("landing")
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${statusColor(infra?.status)}`}>
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        {infra?.status === "online" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusDotColor(infra?.status)} opacity-50`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusDotColor(infra?.status)}`} />
      </span>
      {infra ? (infra.status || t("status.unknown")).toUpperCase() : t("status.connecting").toUpperCase()}
    </span>
  )
}

function TerminalWindowFrame({
  children,
  title = "terminal",
  className = "",
}: {
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <PixelBox className={`overflow-hidden p-0 ${className}`} glow>
      <div className="flex items-center gap-1.5 border-b border-purple-500/15 px-4 py-2 bg-purple-500/5">
        <div className="h-2 w-2 rounded-full bg-red-500/60" />
        <div className="h-2 w-2 rounded-full bg-yellow-500/60" />
        <div className="h-2 w-2 rounded-full bg-green-500/60" />
        <span className="ml-2 font-mono text-[10px] text-purple-400/30 tracking-wider">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </PixelBox>
  )
}

function BootScreen({ onDone }: { onDone: () => void }) {
  const t = useTranslations("landing")
  const bootLines = useMemo(() => [
    t("boot.line1"),
    t("boot.line2"),
    "",
    t("boot.line3"),
    t("boot.line4"),
    t("boot.line5"),
    t("boot.line6"),
    t("boot.line7"),
    t("boot.line8"),
    t("boot.line9"),
    "",
    t("boot.line10"),
    "",
    t("boot.line11"),
  ], [t])

  const { output, done } = useTypewriter(bootLines, 22)
  const [waitingKey, setWaitingKey] = useState(false)

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setWaitingKey(true), 300)
      return () => clearTimeout(t)
    }
  }, [done])

  useEffect(() => {
    if (!waitingKey) return
    const handler = () => onDone()
    window.addEventListener("keydown",    handler)
    window.addEventListener("click",      handler)
    window.addEventListener("touchstart", handler)
    return () => {
      window.removeEventListener("keydown",    handler)
      window.removeEventListener("click",      handler)
      window.removeEventListener("touchstart", handler)
    }
  }, [waitingKey, onDone])

  return (
    <div className="fixed inset-0 z-[300] bg-[#060010] flex flex-col items-start justify-center p-6 sm:p-12 overflow-auto">
      <Scanlines />
      <CRTVignette />
      <div className="w-full max-w-2xl">
        <div className="space-y-0.5 mb-6">
          {output.map((line, i) => (
            <div key={i} className={`font-mono text-xs sm:text-sm ${
              line === ""                   ? "h-3"                                       :
              i === 0                        ? "text-purple-300 font-bold text-base sm:text-lg" :
              i === 12                       ? "text-purple-200 font-bold"                :
              line === t("boot.line10")     ? "text-green-400"                           :
              line.startsWith("Copyright")  ? "text-purple-500/40"                       :
              line.includes("OK")           ? "text-purple-400/55"                       :
              "text-purple-500/30"
            }`}>
              {line === "" ? <>&nbsp;</> : line}
            </div>
          ))}
          {!done && <Cursor color="text-purple-400" />}
        </div>

        {waitingKey && (
          <div className="space-y-4">
            <div className="font-mono text-sm text-purple-300/70"
              style={{ animation: "blink 1s step-end infinite" }}>▌</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <KbdHint keys={["ANY KEY"]} />
                <span className="font-mono text-xs text-purple-500/40">{t("boot.waitPrompt")}</span>
              </div>
              <span className="font-mono text-[10px] text-purple-500/25">
                {t("boot.mobileHint")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LangSelectScreen({ onDone }: { onDone: (locale: string) => void }) {
  const t = useTranslations("landing")
  const currentLocale = useLocale()
  const router = useRouter()

  const defaultIdx = Math.max(0, SUPPORTED_LOCALES.findIndex(l => l.code === currentLocale))
  const [selected, setSelected] = useState(defaultIdx)
  const [confirmed, setConfirmed] = useState(false)

  const confirm = useCallback((idx: number) => {
    if (confirmed) return
    setConfirmed(true)
    const locale = SUPPORTED_LOCALES[idx].code
    document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
    setTimeout(() => onDone(locale), 300)
  }, [confirmed, router, onDone])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp")
        { e.preventDefault(); setSelected(s => (s - 1 + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length) }
      if (e.key === "ArrowDown")
        { e.preventDefault(); setSelected(s => (s + 1) % SUPPORTED_LOCALES.length) }
      if (e.key === "Enter")
        { e.preventDefault(); confirm(selected) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selected, confirm])

  const introLines = useMemo(() => [
    t("lang.line1"),
    t("lang.line2"),
    t("lang.line3"),
  ], [t])
  const { output, done: introDone } = useTypewriter(introLines, 24)

  return (
    <div className="fixed inset-0 z-[290] bg-[#060010] flex flex-col items-start justify-center p-6 sm:p-12 overflow-auto">
      <Scanlines />
      <CRTVignette />
      <div className="w-full max-w-xl">

        <div className="mb-8 space-y-0.5">
          {output.map((line, i) => (
            <div key={i} className={`font-mono text-xs sm:text-sm ${
              i === 0 ? "text-purple-300 font-bold" : "text-purple-400/50"
            }`}>
              {line}
              {i === output.length - 1 && !introDone && <Cursor color="text-purple-400" />}
            </div>
          ))}
        </div>

        {introDone && (
          <PixelBox className="p-0 overflow-hidden" glow>
            <div className="flex items-center justify-between border-b border-purple-500/15 px-4 py-2.5 bg-purple-500/[0.04]">
              <span className="font-mono text-[10px] text-purple-400/40 tracking-[0.2em] uppercase">
                {t("lang.title")}
              </span>
              <div className="hidden sm:flex items-center gap-3">
                <KbdHint keys={["↑", "↓"]} label={t("controls.navigate")} />
                <KbdHint keys={["ENTER"]}   label={t("controls.confirm")}  />
              </div>
            </div>

            <div className="p-1.5">
              {SUPPORTED_LOCALES.map((locale, i) => {
                const isSel = selected === i
                return (
                  <button
                    key={locale.code}
                    className={`
                      w-full text-left px-3 py-3 flex items-center gap-3
                      font-mono transition-all duration-100 border-l-2
                      ${isSel
                        ? "border-purple-400 bg-purple-500/15"
                        : "border-transparent hover:border-purple-500/30 hover:bg-purple-500/8"
                      }
                      ${confirmed && isSel ? "opacity-60" : ""}
                    `}
                    onClick={() => { setSelected(i); confirm(i) }}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="w-3 flex-shrink-0">
                      {isSel
                        ? <span className="text-purple-300 text-xs">►</span>
                        : <span className="text-purple-500/15 text-xs">·</span>
                      }
                    </span>

                    <kbd className={`
                      inline-flex items-center justify-center w-7 rounded border
                      font-mono text-[9px] flex-shrink-0 py-0.5 uppercase
                      ${isSel
                        ? "border-purple-400/50 bg-purple-500/20 text-purple-300"
                        : "border-purple-500/20 bg-purple-500/5 text-purple-500/30"
                      }
                    `}>
                      {locale.code}
                    </kbd>

                    <span className={`text-sm font-bold tracking-wide transition-colors ${
                      isSel ? "text-purple-200" : "text-purple-400/45"
                    }`}>
                      {locale.native}
                    </span>

                    <span className={`text-xs ml-auto transition-colors ${
                      isSel ? "text-purple-400/50" : "text-purple-500/20"
                    }`}>
                      {locale.label}
                    </span>

                    {locale.code === currentLocale && (
                      <span className="font-mono text-[9px] text-purple-500/40 border border-purple-500/20 px-1.5 py-0.5">
                        {t("lang.current")}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="border-t border-purple-500/10 px-4 py-2">
              <span className="font-mono text-[9px] text-purple-500/20">
                {t("lang.footer")}
              </span>
            </div>
          </PixelBox>
        )}

        {introDone && (
          <p className="mt-3 font-mono text-[10px] text-purple-500/20 sm:hidden">
            {t("lang.mobileHint")}
          </p>
        )}
      </div>

      <ControlBar hints={[
        { keys: ["↑", "↓"], label: t("controls.navigate") },
        { keys: ["ENTER"],  label: t("controls.confirm")  },
      ]} />
    </div>
  )
}

function LegalScreen({ onBack }: { onBack: () => void }) {
  const t = useTranslations("landing")
  const [selected, setSelected] = useState(0)

  const docs = useMemo(() => [
    { label: t("legal.docs.terms.label"),    href: "/legal/terms-of-service",     key: "1", desc: t("legal.docs.terms.desc")    },
    { label: t("legal.docs.privacy.label"),   href: "/legal/privacy-policy", key: "2", desc: t("legal.docs.privacy.desc")     },
    { label: t("legal.docs.cookies.label"),   href: "/legal/cookies-policy", key: "3", desc: t("legal.docs.cookies.desc")  },
    { label: t("legal.docs.acceptableUse.label"), href: "/legal/acceptable-use-policy", key: "4", desc: t("legal.docs.acceptableUse.desc")     },
    { label: t("legal.docs.ai.label"),         href: "/legal/ai-policy",     key: "5", desc: t("legal.docs.ai.desc") },
    { label: t("legal.docs.email.label"),      href: "/legal/email-policy",  key: "6", desc: t("legal.docs.email.desc") },
    { label: t("legal.docs.dmca.label"),       href: "/legal/dmca-copyright-policy", key: "7", desc: t("legal.docs.dmca.desc") },
    { label: t("legal.docs.imprint.label"),    href: "/legal/imprint",      key: "8", desc: t("legal.docs.imprint.desc") },
  ], [t])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { onBack(); return }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => (s - 1 + docs.length) % docs.length) }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => (s + 1) % docs.length) }
      if (e.key === "Enter")     { e.preventDefault(); window.open(docs[selected].href, "_blank") }
      docs.forEach((d, i) => {
        if (e.key === d.key) { setSelected(i); window.open(d.href, "_blank") }
      })
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [docs, selected, onBack])

  const introLines = useMemo(() => [
    t("legal.line1"),
    t("legal.line2"),
  ], [t])
  const { output, done: introDone } = useTypewriter(introLines, 28)

  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines />
      <CRTVignette />
      <div className="relative z-10 max-w-3xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.legal")} title="Legal" />

        <div className="mb-6 space-y-0.5">
          {output.map((line, i) => (
            <div key={i} className="font-mono text-xs text-purple-400/40">
              {line}
              {i === output.length - 1 && !introDone && <Cursor color="text-purple-400" />}
            </div>
          ))}
        </div>

        {introDone && (
          <PixelBox className="p-0 overflow-hidden" glow>
            <div className="flex items-center justify-between border-b border-purple-500/15 px-4 py-2.5 bg-purple-500/[0.04]">
              <span className="font-mono text-[10px] text-purple-400/40 tracking-[0.2em] uppercase">
                {t("legal.title")}
              </span>
              <div className="hidden sm:flex items-center gap-3">
                <KbdHint keys={["↑", "↓"]}  label={t("controls.navigate")} />
                <KbdHint keys={["ENTER"]}    label={t("controls.open")}     />
                <KbdHint keys={["1–6"]}     label={t("controls.quickOpen")}    />
              </div>
            </div>

            <div className="p-1.5">
              {docs.map((doc, i) => {
                const isSel = selected === i
                return (
                  <a
                    key={doc.href}
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`
                      flex items-center gap-3 px-3 py-3 font-mono
                      transition-all duration-100 border-l-2 group
                      ${isSel
                        ? "border-purple-400 bg-purple-500/15"
                        : "border-transparent hover:border-purple-500/30 hover:bg-purple-500/8"
                      }
                    `}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="w-3 flex-shrink-0">
                      {isSel
                        ? <span className="text-purple-300 text-xs">►</span>
                        : <span className="text-purple-500/15 text-xs">·</span>
                      }
                    </span>

                    <kbd className={`
                      inline-flex items-center justify-center w-5 h-5
                      rounded border font-mono text-[9px] flex-shrink-0
                      ${isSel
                        ? "border-purple-400/50 bg-purple-500/20 text-purple-300"
                        : "border-purple-500/20 bg-purple-500/5 text-purple-500/30"
                      }
                    `}>
                      {doc.key}
                    </kbd>

                    <span className={`text-sm font-semibold transition-colors ${
                      isSel ? "text-purple-200" : "text-purple-400/50"
                    }`}>
                      {doc.label}
                    </span>

                    <span className={`text-xs ml-auto hidden sm:block transition-colors ${
                      isSel ? "text-purple-400/45" : "text-purple-500/20"
                    }`}>
                      {doc.desc}
                    </span>

                    <span className={`font-mono text-[10px] transition-colors flex-shrink-0 ${
                      isSel ? "text-pink-400/60" : "text-purple-500/15"
                    }`}>
                      ↗
                    </span>
                  </a>
                )
              })}
            </div>

            <div className="border-t border-purple-500/10 px-4 py-2">
              <span className="font-mono text-[9px] text-purple-500/20">
                {t("legal.footer")}
              </span>
            </div>
          </PixelBox>
        )}
      </div>

      <ControlBar hints={[
        { keys: ["↑", "↓"], label: "navigate"      },
        { keys: ["ENTER"],  label: "open in tab"   },
        { keys: ["1–6"],     label: "quick open"    },
        { keys: ["ESC"],    label: "back"           },
      ]} />
    </div>
  )
}

const MENU_ITEMS: { id: Screen; labelKey: string; descKey: string; key: string; fKey: string }[] = [
  { id: "features",  labelKey: "menu.items.features.label",  descKey: "menu.items.features.desc",  key: "1", fKey: "F1" },
  { id: "about",     labelKey: "menu.items.about.label",     descKey: "menu.items.about.desc",     key: "2", fKey: "F2" },
  { id: "pricing",   labelKey: "menu.items.pricing.label",   descKey: "menu.items.pricing.desc",   key: "3", fKey: "F3" },
  { id: "community", labelKey: "menu.items.community.label", descKey: "menu.items.community.desc", key: "4", fKey: "F4" },
  { id: "faq",       labelKey: "menu.items.faq.label",       descKey: "menu.items.faq.desc",       key: "5", fKey: "F5" },
  { id: "deploy",    labelKey: "menu.items.deploy.label",    descKey: "menu.items.deploy.desc",    key: "6", fKey: "F6" },
  { id: "legal",     labelKey: "menu.items.legal.label",     descKey: "menu.items.legal.desc",     key: "7", fKey: "F7" },
]

function MainMenu({
  infra,
  onSelect,
  t,
}: {
  infra: InfraStatus | null
  onSelect: (s: Screen) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [selected, setSelected] = useState(0)
  const [pressed,  setPressed]  = useState<number | null>(null)

  const headerLines = useMemo(() => [
    t("menu.status.operator"),
    t("menu.status.session", { session: new Date().toISOString().slice(0, 19).replace("T", " ") }),
    t("menu.status.net", { status: infra?.status?.toUpperCase() ?? t("status.connecting").toUpperCase() }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [infra?.status ?? "pending", t])

  const { output: headerOut, done: headerDone } = useTypewriter(headerLines, 26)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => (s - 1 + MENU_ITEMS.length) % MENU_ITEMS.length) }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => (s + 1) % MENU_ITEMS.length) }
      if (e.key === "Enter")     { e.preventDefault(); onSelect(MENU_ITEMS[selected].id) }
      MENU_ITEMS.forEach((m, i) => {
        if (e.key === m.key || e.key === m.fKey) { e.preventDefault(); setSelected(i); onSelect(m.id) }
      })
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selected, onSelect])

  const handleItemClick = (i: number) => {
    setPressed(i); setSelected(i)
    setTimeout(() => { setPressed(null); onSelect(MENU_ITEMS[i].id) }, 120)
  }

  return (
    <div className="min-h-screen bg-[#060010] pb-14">
      <Scanlines />
      <CRTVignette />
      <div className="relative z-10 flex flex-col min-h-screen max-w-4xl mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">

        <div className="mb-8 sm:mb-10">
          <GlitchText
            text={t("brand").toUpperCase()}
            className="font-mono font-black text-4xl sm:text-6xl md:text-7xl tracking-tighter block mb-4"
          />
          <div className="space-y-0.5">
            {headerOut.map((line, i) => (
              <div key={i} className={`font-mono text-xs sm:text-sm ${
                i === 1 ? "text-purple-400/40" :
                i === 2 && infra?.status === "online" ? "text-green-400" :
                i === 2 && infra?.status === "degraded" ? "text-yellow-400" :
                i === 2 && infra?.status === "offline" ? "text-red-400" :
                "text-purple-400/40"
              }`}>
                {line}
                {i === headerOut.length - 1 && !headerDone && <Cursor color="text-purple-400" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-5">

          <div className="flex-1">
            <PixelBox className="p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-purple-500/15 px-4 py-2.5 bg-purple-500/[0.04]">
                <span className="font-mono text-[10px] text-purple-400/40 tracking-[0.2em] uppercase">
                  {t("menu.title")}
                </span>
                <div className="hidden sm:flex items-center gap-3">
                  <KbdHint keys={["↑", "↓"]} label={t("controls.navigate")} />
                  <KbdHint keys={["ENTER"]}   label={t("controls.select")}   />
                  <KbdHint keys={["1–7"]}     label={t("controls.quickJump")}    />
                </div>
              </div>

              <div className="p-1.5">
                {MENU_ITEMS.map((item, i) => {
                  const isSel = selected === i
                  const isPress = pressed === i
                  return (
                    <button
                      key={item.id}
                      className={`
                        w-full text-left px-3 py-3 sm:py-3.5 flex items-center gap-3
                        font-mono transition-all duration-100 border-l-2
                        ${isSel
                          ? "border-purple-400 bg-purple-500/15"
                          : "border-transparent hover:border-purple-500/30 hover:bg-purple-500/8"
                        }
                        ${isPress ? "opacity-60 scale-[0.99]" : ""}
                        ${item.id === "legal" ? "border-t border-purple-500/10 mt-1 pt-4" : ""}
                      `}
                      onClick={() => handleItemClick(i)}
                      onMouseEnter={() => setSelected(i)}
                    >
                      <kbd className={`
                        hidden sm:inline-flex items-center justify-center w-5 h-5
                        rounded border text-[9px] flex-shrink-0 font-mono transition-colors
                        ${isSel
                          ? "border-purple-400/60 bg-purple-500/20 text-purple-300"
                          : "border-purple-500/20 bg-purple-500/5 text-purple-500/30"
                        }
                      `}>
                        {item.key}
                      </kbd>

                      <span className="w-3 flex-shrink-0">
                        {isSel
                          ? <span className="text-purple-300 text-xs">►</span>
                          : <span className="text-purple-500/15 text-xs">·</span>
                        }
                      </span>

                      <span className={`text-sm font-bold tracking-wider transition-colors ${
                        isSel ? "text-purple-200" : "text-purple-400/45"
                      } ${item.id === "legal" ? "text-purple-400/30" : ""}`}>
                        {t(item.labelKey)}
                      </span>

                      <span className={`text-xs ml-auto hidden sm:block transition-colors ${
                        isSel ? "text-purple-400/55" : "text-purple-500/20"
                      }`}>
                        {t(item.descKey)}
                      </span>

                      <kbd className={`
                        hidden lg:inline-flex items-center justify-center
                        rounded border px-1.5 py-0.5 text-[9px] flex-shrink-0 transition-colors
                        ${isSel
                          ? "border-purple-400/40 bg-purple-500/15 text-purple-300/60"
                          : "border-purple-500/10 text-purple-500/20"
                        }
                      `}>
                        {item.fKey}
                      </kbd>
                    </button>
                  )
                })}
              </div>

              <div className="border-t border-purple-500/10 px-4 py-2 flex items-center justify-between">
                <StatusPip infra={infra} />
                <span className="font-mono text-[9px] text-purple-500/20">{t("menu.version")}</span>
              </div>
            </PixelBox>

            <div className="mt-3 sm:hidden">
              <PixelBox className="px-4 py-3">
                <p className="font-mono text-xs text-purple-400/40">
                  ► {t(MENU_ITEMS[selected].descKey)}
                </p>
              </PixelBox>
            </div>
          </div>

          <div className="hidden lg:flex flex-col gap-3 w-60">
            <PixelBox className="p-4 flex-1" glow>
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-purple-500/35 mb-4">
                {t("menu.systemInfo")}
              </p>
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[9px] text-purple-500/25 mb-1">{t("menu.statusLabel")}</p>
                  <StatusPip infra={infra} />
                </div>
                <div>
                  <p className="font-mono text-[9px] text-purple-500/25 mb-1">{t("menu.nodesLabel")}</p>
                  <p className="font-mono text-lg text-purple-300">
                    {infra ? new Intl.NumberFormat().format(infra.nodeCount) : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-purple-500/25 mb-2">{t("menu.networkLabel")}</p>
                  <div className="space-y-1">
                    <p className="font-mono text-xs"><span className="text-green-400">{infra?.online ?? "—"}</span><span className="text-purple-500/30 ml-2">{t("status.online")}</span></p>
                    <p className="font-mono text-xs"><span className="text-yellow-400">{infra?.degraded ?? "—"}</span><span className="text-purple-500/30 ml-2">{t("status.degraded")}</span></p>
                    <p className="font-mono text-xs"><span className="text-red-400">{infra?.offline ?? "—"}</span><span className="text-purple-500/30 ml-2">{t("status.offline")}</span></p>
                  </div>
                </div>
                <div className="border-t border-purple-500/10 pt-3 space-y-2">
                  <Link href="/register" className="block font-mono text-xs text-purple-400/50 hover:text-purple-300 transition-colors">
                    &gt; {t("hero.ctaStart")}
                  </Link>
                  <Link href="/login" className="block font-mono text-xs text-purple-400/50 hover:text-purple-300 transition-colors">
                    &gt; {t("hero.ctaSignIn")}
                  </Link>
                </div>
              </div>
            </PixelBox>

            <PixelBox className="p-3">
              <p className="font-mono text-[9px] text-purple-500/20 leading-relaxed">
                {t("hero.nextGen")} {t("hero.subtitle")}
              </p>
            </PixelBox>
          </div>
        </div>

        <div className="mt-4 flex gap-3 lg:hidden">
          <Link href="/register"
            className="flex-1 border border-purple-500/30 bg-purple-500/10 py-3 text-center font-mono text-xs text-purple-300 hover:bg-purple-500/20 transition-all active:opacity-60">
            &gt; {t("hero.ctaStart")}
          </Link>
          <Link href="/login"
            className="flex-1 border border-purple-500/15 py-3 text-center font-mono text-xs text-purple-400/50 hover:text-purple-300 hover:border-purple-500/30 transition-all active:opacity-60">
            {t("hero.ctaSignIn")}
          </Link>
        </div>
      </div>

      <ControlBar hints={[
        { keys: ["↑", "↓"],  label: t("controls.navigate")   },
        { keys: ["ENTER"],   label: t("controls.select")      },
        { keys: ["1–7"],     label: t("controls.quickJump")  },
        { keys: ["F1–F7"],   label: t("controls.altJump")    },
      ]} />
    </div>
  )
}

function FeaturesScreen({ onBack, t }: { onBack: () => void; t: ReturnType<typeof useTranslations> }) {
  const features = useMemo(() => [
    { title: t("features.item1Title"), text: t("features.item1Text") },
    { title: t("features.item2Title"), text: t("features.item2Text") },
    { title: t("features.item3Title"), text: t("features.item3Text") },
    { title: t("features.item4Title"), text: t("features.item4Text") },
    { title: t("features.item5Title"), text: t("features.item5Text") },
    { title: t("features.item6Title"), text: t("features.item6Text") },
  ], [t])
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onBack(); return }
      if (e.key === "ArrowRight") setActive(v => v === null ? 0 : (v + 1) % features.length)
      if (e.key === "ArrowLeft")  setActive(v => v === null ? 0 : (v - 1 + features.length) % features.length)
      const n = parseInt(e.key)
      if (n >= 1 && n <= features.length) setActive(v => v === n - 1 ? null : n - 1)
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [features.length, onBack])
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-4xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.modules")} title={t("features.title").replace("# ", "")} />
        <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, idx) => (
            <button key={f.title}
              className={`text-left border p-4 sm:p-5 transition-all duration-200 font-mono ${
                active === idx
                  ? "border-purple-400/60 bg-purple-500/15 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                  : "border-purple-500/15 bg-[#0a0014] hover:border-purple-500/35 hover:bg-purple-500/5 active:opacity-60"
              }`}
              onClick={() => setActive(active === idx ? null : idx)}>
              <div className="flex items-start gap-3 mb-3">
                <kbd className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[9px] flex-shrink-0 ${
                  active === idx ? "border-purple-400/50 bg-purple-500/20 text-purple-300" : "border-purple-500/20 bg-purple-500/5 text-purple-500/30"
                }`}>{idx + 1}</kbd>
                <span className={`text-xs font-bold ${active === idx ? "text-pink-300" : "text-pink-400/55"}`}>{f.title}</span>
              </div>
              <p className={`text-xs leading-relaxed pl-8 ${active === idx ? "text-purple-200/70" : "text-purple-400/35"}`}>{f.text}</p>
              {active === idx && (
                <div className="mt-3 pl-8 border-t border-purple-500/20 pt-3">
                  <span className="text-[10px] text-purple-400/40">{t("features.activeTag")}</span><Cursor color="text-purple-400" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <ControlBar hints={[
        { keys: ["1–6"],    label: t("controls.toggle")      },
        { keys: ["←", "→"], label: t("controls.cycle")       },
        { keys: ["ESC"],    label: t("controls.back")        },
      ]} />
    </div>
  )
}

function AboutScreen({ onBack, t }: { onBack: () => void; t: ReturnType<typeof useTranslations> }) {
  const lines = useMemo(() => [`> ${t("about.line1")}`, `> ${t("about.line2")}`], [t])
  const { output, done } = useTypewriter(lines, 16)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onBack])
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-3xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.about")} title={t("about.title").replace("# ", "")} />
        <PixelBox className="p-5 sm:p-7 mb-5" glow>
          <div className="mb-5 border-b border-purple-500/15 pb-5">
            <span className="font-mono text-lg font-bold text-purple-300">{t("about.subtitlePrefix")}</span>{" "}
            <span className="font-mono text-lg font-bold text-pink-400" style={{ textShadow: "0 0 15px rgba(244,114,182,0.4)" }}>{t("about.subtitleHighlight")}</span>
          </div>
          <div className="space-y-4">
            {output.map((line, i) => (
              <p key={i} className="font-mono text-xs sm:text-sm leading-[1.9] text-purple-300/50">
                <span className="text-purple-500/40">&gt; </span>{line.replace("> ", "")}
                {i === output.length - 1 && !done && <Cursor color="text-purple-400" />}
              </p>
            ))}
          </div>
        </PixelBox>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[t("community.group1"), t("community.group2"), t("community.group3"), t("community.group4")].map(g => (
            <PixelBox key={g} className="p-3 text-center"><p className="font-mono text-[10px] text-purple-400/35">{g}</p></PixelBox>
          ))}
        </div>
      </div>
      <ControlBar hints={[{ keys: ["ESC"], label: t("controls.backToMenu") }]} />
    </div>
  )
}

function PricingScreen({ onBack, t }: { onBack: () => void; t: ReturnType<typeof useTranslations> }) {
  const [selected, setSelected] = useState(0)
  const plans = useMemo(() => [
    { id: "free", tier: t("plans.free.name"), price: t("plans.free.price"), period: t("plans.free.period"), tagline: t("plans.free.tagline"),
      items: (["item1","item2","item3","item4","item5","item6","item7"] as const).map(k => t(`plans.free.${k}`).replace("→ ", "")),
      color: "text-purple-400", border: "border-purple-500/30", glow: "shadow-[0_0_20px_rgba(168,85,247,0.15)]" },
    { id: "edu", tier: t("plans.edu.name"), price: t("plans.edu.price"), period: t("plans.edu.period"), tagline: t("plans.edu.tagline"),
      items: (["item1","item2","item3","item4","item5","item6","item7","item8"] as const).map(k => t(`plans.edu.${k}`).replace("→ ", "")),
      color: "text-blue-400", border: "border-blue-500/30", glow: "shadow-[0_0_20px_rgba(96,165,250,0.15)]" },
    { id: "paid", tier: t("plans.paid.name"), price: t("plans.paid.price"), period: t("plans.paid.period"), tagline: t("plans.paid.tagline"),
      items: (["item1","item2","item3","item4","item5","item6","item7","item8","item9"] as const).map(k => t(`plans.paid.${k}`).replace("→ ", "")),
      color: "text-pink-400", border: "border-pink-500/30", glow: "shadow-[0_0_20px_rgba(244,114,182,0.15)]", badge: "POPULAR" },
    { id: "enterprise", tier: t("plans.enterprise.name"), price: t("plans.enterprise.price"), period: undefined, tagline: t("plans.enterprise.tagline"),
      items: (["item1","item2","item3","item4","item5","item6","item7","item8","item9"] as const).map(k => t(`plans.enterprise.${k}`).replace("→ ", "")),
      color: "text-yellow-400", border: "border-yellow-500/30", glow: "shadow-[0_0_20px_rgba(250,204,21,0.15)]" },
  ], [t])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")     { onBack(); return }
      if (e.key === "ArrowLeft")  setSelected(s => (s - 1 + plans.length) % plans.length)
      if (e.key === "ArrowRight") setSelected(s => (s + 1) % plans.length)
      const n = parseInt(e.key)
      if (n >= 1 && n <= plans.length) setSelected(n - 1)
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [plans.length, onBack])
  const plan = plans[selected]
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-4xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.plans")} title={t("plans.title").replace("# ", "")} />
        <p className="font-mono text-xs text-purple-400/30 mb-8">{t("plans.subtitle")}</p>
        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {plans.map((p, i) => (
            <button key={p.id} onClick={() => setSelected(i)}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 font-mono text-xs border transition-all ${
                selected === i ? `${p.border} bg-[#0a0014] ${p.color} ${p.glow}` : "border-purple-500/10 text-purple-500/30 hover:border-purple-500/20 hover:text-purple-400/50 active:opacity-60"
              }`}>
              <kbd className="hidden sm:inline-flex items-center justify-center w-4 h-4 rounded border border-current opacity-40 text-[9px] mr-1.5">{i+1}</kbd>
              {p.tier}{"badge" in p && p.badge && <span className="ml-1.5 text-[9px] text-pink-400/60">[{p.badge}]</span>}
            </button>
          ))}
        </div>
        <div className={`border ${plan.border} bg-[#0a0014] ${plan.glow} transition-all`}>
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6 border-b border-purple-500/10 pb-6">
              <div>
                <p className={`font-mono text-[10px] tracking-[0.2em] uppercase ${plan.color} opacity-55 mb-2`}>{plan.tier}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`font-mono text-4xl font-black ${plan.color}`} style={{ textShadow: "0 0 16px currentColor" }}>{plan.price}</span>
                  {plan.period && <span className={`font-mono text-sm ${plan.color} opacity-40`}>{plan.period}</span>}
                </div>
                <p className="font-mono text-xs text-purple-400/35 mt-2">{plan.tagline}</p>
              </div>
              {"badge" in plan && plan.badge && (
                <span className={`font-mono text-[10px] border ${plan.border} px-3 py-1 ${plan.color} tracking-widest`}>{plan.badge}</span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mb-6">
              {plan.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 font-mono text-xs text-purple-300/45">
                  <span className={`${plan.color} opacity-40 flex-shrink-0`}>+</span>{item}
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-purple-500/10 flex flex-wrap gap-3">
              <Link href="/register" className={`border ${plan.border} bg-transparent px-5 py-2.5 font-mono text-sm ${plan.color} hover:bg-purple-500/10 transition-all active:opacity-60`}>
                &gt; {t("plans.ctaStart")}
              </Link>
              {plan.id === "enterprise" && (
                <a href="mailto:contact@ecli.app" className="border border-purple-500/15 px-5 py-2.5 font-mono text-sm text-purple-400/45 hover:border-purple-500/30 hover:text-purple-300 transition-all">
                  {t("plans.contactUs")}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      <ControlBar hints={[
        { keys: ["←", "→"], label: t("controls.switchPlan")  },
        { keys: ["1–4"],     label: t("controls.quickSwitch") },
        { keys: ["ESC"],     label: t("controls.back")         },
      ]} />
    </div>
  )
}

function CommunityScreen({ onBack, infra, t }: { onBack: () => void; infra: InfraStatus | null; t: ReturnType<typeof useTranslations> }) {
  const termLines = useMemo(() => [
    "$ ./connect --community",
    `INIT ${t("community.handshake")}`,
    `${t("community.resolving")} ecli.app`,
    t("community.statusLine", { status: infra ? (infra.status || t("status.unknown")).toUpperCase() : t("community.connecting") }),
    t("community.nodesLine", { nodes: infra ? new Intl.NumberFormat().format(infra.nodeCount) : "..." }),
    t("community.nodeBreakdown", {
      online: infra?.online ?? "...",
      degraded: infra?.degraded ?? "...",
      offline: infra?.offline ?? "...",
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [infra?.status ?? "pending", infra?.online, infra?.degraded, infra?.offline, t])
  const { output, done } = useTypewriter(termLines, 22)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onBack])
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-4xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.network")} title={t("community.title").replace("# ", "")} />
        <div className="grid gap-5 lg:grid-cols-2">
          <TerminalWindowFrame title={t("community.consoleTitle")}>
            <div className="space-y-1.5">
              {output.map((line, i) => (
                <div key={i} className={`font-mono text-xs sm:text-sm ${
                  i === 0 ? "text-purple-500/35" :
                  i === 1 ? "text-pink-400/70" :
                  i === 2 ? "text-purple-300/70" :
                  i === 3 && infra?.status === "online" ? "text-green-400" :
                  i === 3 && infra?.status === "degraded" ? "text-yellow-400" :
                  i === 3 && infra?.status === "offline" ? "text-red-400" :
                  i === 3 ? "text-purple-400/55" :
                  i === 4 ? "text-purple-300/70" :
                  "text-purple-400/55"
                }`}>
                  {line}{i === output.length - 1 && !done && <Cursor color="text-purple-400" />}
                </div>
              ))}
            </div>
          </TerminalWindowFrame>
          <div className="space-y-3">
            <p className="font-mono text-xs text-purple-400/35 leading-relaxed">{t("community.description")}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t("status.online"),   val: infra?.online,   color: "text-green-400",  border: "border-green-500/20"  },
                { label: t("status.degraded"), val: infra?.degraded, color: "text-yellow-400", border: "border-yellow-500/20" },
                { label: t("status.offline"),  val: infra?.offline,  color: "text-red-400",    border: "border-red-500/20"    },
              ].map(s => (
                <PixelBox key={s.label} className={`p-3 text-center border ${s.border}`}>
                  <p className={`font-mono text-xl font-black ${s.color}`}>{s.val ?? "—"}</p>
                  <p className="font-mono text-[9px] text-purple-500/30 mt-1">{s.label}</p>
                </PixelBox>
              ))}
            </div>
            <PixelBox className="p-4">
              <p className="font-mono text-[9px] text-purple-500/25 mb-1">{t("community.totalNodes")}</p>
              <p className="font-mono text-3xl font-black text-purple-300" style={{ textShadow: "0 0 14px rgba(168,85,247,0.5)" }}>
                {infra ? new Intl.NumberFormat().format(infra.nodeCount) : "—"}
              </p>
            </PixelBox>
            <div className="grid grid-cols-2 gap-2">
              {[t("community.group1"), t("community.group2"), t("community.group3"), t("community.group4")].map(g => (
                <PixelBox key={g} className="p-2.5 text-center"><p className="font-mono text-[10px] text-purple-400/35">{g}</p></PixelBox>
              ))}
            </div>
            <Link href="/dashboard" className="block w-full border border-purple-500/30 bg-purple-500/10 py-3 text-center font-mono text-sm text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all active:opacity-60">
              &gt; {t("community.cta")}
            </Link>
          </div>
        </div>
      </div>
      <ControlBar hints={[{ keys: ["ESC"], label: t("controls.backToMenu") }]} />
    </div>
  )
}

function FaqScreen({ onBack, t }: { onBack: () => void; t: ReturnType<typeof useTranslations> }) {
  const [open, setOpen] = useState<number | null>(null)
  const faqs = useMemo(() => [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: (
      <span>{t("faq.a4Prefix")}{" "}
        <a href="https://github.com/thenoname-gurl/EcliPanel" className="text-pink-400 hover:underline" target="_blank" rel="noopener noreferrer">{t("faq.github")}</a>
        {" "}{t("faq.a4Suffix")}
      </span>
    )},
  ], [t])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onBack(); return }
      if (e.key === "ArrowDown") setOpen(o => o === null ? 0 : Math.min(o + 1, faqs.length - 1))
      if (e.key === "ArrowUp")   setOpen(o => o === null ? 0 : Math.max(o - 1, 0))
      if (e.key === "Enter" && open !== null) setOpen(null)
      const n = parseInt(e.key)
      if (n >= 1 && n <= faqs.length) setOpen(o => o === n - 1 ? null : n - 1)
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [faqs.length, open, onBack])
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-3xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.help")} title={t("faq.title").replace("# ", "")} />
        <div className="space-y-1.5">
          {faqs.map((faq, i) => (
            <div key={i} className={`border transition-all duration-200 ${open === i ? "border-purple-400/40 bg-purple-500/10" : "border-purple-500/10 bg-[#0a0014] hover:border-purple-500/25"}`}>
              <button className="w-full flex items-center gap-3 p-4 text-left group" onClick={() => setOpen(open === i ? null : i)}>
                <kbd className={`inline-flex items-center justify-center w-5 h-5 rounded border font-mono text-[9px] flex-shrink-0 ${
                  open === i ? "border-purple-400/50 bg-purple-500/20 text-purple-300" : "border-purple-500/15 bg-purple-500/5 text-purple-500/25"
                }`}>{i+1}</kbd>
                <span className={`flex-1 font-mono text-xs sm:text-sm font-semibold transition-colors ${open === i ? "text-purple-200" : "text-purple-400/55 group-hover:text-purple-300/70"}`}>{faq.q}</span>
                <span className="font-mono text-xs text-purple-500/30 flex-shrink-0 transition-transform duration-200" style={{ transform: open === i ? "rotate(90deg)" : "none" }}>►</span>
              </button>
              <div style={{ maxHeight: open === i ? "300px" : 0, overflow: "hidden", transition: "max-height 0.3s ease" }}>
                <p className="font-mono text-xs text-purple-400/40 leading-relaxed px-4 pb-4 pl-[52px] border-t border-purple-500/10 pt-3">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ControlBar hints={[
        { keys: ["↑", "↓"], label: t("controls.navigate")   },
        { keys: ["ENTER"],  label: t("controls.toggle")     },
        { keys: ["1–4"],     label: t("controls.quickOpen")  },
        { keys: ["ESC"],    label: t("controls.back")        },
      ]} />
    </div>
  )
}

function DeployScreen({ onBack, t }: { onBack: () => void; t: ReturnType<typeof useTranslations> }) {
  const deployLines = useMemo(() => [
    "$ eclipse deploy --init",
    t("deploy.allocating"),
    t("deploy.configuring"),
    t("deploy.settingUp"),
    t("deploy.applying"),
    t("deploy.starting"),
    "",
    t("deploy.ready"),
    t("deploy.access"),
  ], [t])
  const { output, done } = useTypewriter(deployLines, 28, 200)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onBack])
  return (
    <div className="min-h-screen bg-[#060010] px-4 sm:px-8 py-8 sm:py-12 pb-20">
      <Scanlines /><CRTVignette />
      <div className="relative z-10 max-w-3xl mx-auto">
        <BackButton onBack={onBack} />
        <SectionHeader label={t("sections.deploy")} title={t("cta.title").replace("# ", "")} />
        <p className="font-mono text-xs text-purple-400/30 mb-8 max-w-md">{t("cta.subtitle")}</p>
        <TerminalWindowFrame title={t("deploy.consoleTitle")} className="mb-6">
          <div className="space-y-1.5">
            {output.map((line, i) => (
              <div key={i} className={`font-mono text-xs sm:text-sm ${
                line === "" ? "h-3" :
                i === 0 ? "text-purple-500/35" :
                i >= 1 && i <= 5 ? "text-purple-400/55" :
                i === 7 ? "text-green-400 font-bold" :
                i === 8 ? "text-purple-300/60" :
                "text-purple-500/30"
              }`}>
                {line === "" ? <>&nbsp;</> : line}
                {i === output.length - 1 && !done && <Cursor color="text-purple-400" />}
              </div>
            ))}
          </div>
        </TerminalWindowFrame>
        {done && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/register"
              className="flex-1 border border-purple-500/50 bg-purple-500/15 py-3 sm:py-4 text-center font-mono text-sm font-bold text-purple-200 hover:bg-purple-500/25 hover:border-purple-400/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)] transition-all active:opacity-60"
              style={{ textShadow: "0 0 10px rgba(168,85,247,0.5)" }}>
              &gt; {t("cta.register")}
            </Link>
            <Link href="/dashboard"
              className="flex-1 border border-purple-500/15 py-3 sm:py-4 text-center font-mono text-sm text-purple-400/45 hover:border-purple-500/30 hover:text-purple-300 transition-all active:opacity-60">
              {t("cta.dashboard")}
            </Link>
          </div>
        )}
        <div className="mt-8 border-t border-purple-500/10 pt-6" id="contact">
          <p className="font-mono text-[11px] text-purple-500/25">
            {t("footer.customSetup")}{" "}
            <a href="mailto:contact@ecli.app" className="text-purple-400/55 hover:text-purple-300 transition-colors">contact@ecli.app</a>
            {" · "}
            {t("footer.orGoTo")}{" "}
            <Link href="/dashboard" className="text-purple-400/55 hover:text-purple-300 transition-colors">{t("footer.dashboard")}</Link>
          </p>
        </div>
      </div>
      <ControlBar hints={[
        { keys: ["ENTER"], label: t("controls.confirm") },
        { keys: ["ESC"],   label: t("controls.back")    },
      ]} />
    </div>
  )
}

export default function LandingPage() {
  const t = useTranslations("landing")
  const infra = useInfraStatus()
  const [screen, setScreen] = useState<Screen>("boot")

  useEffect(() => {
    const booted = sessionStorage.getItem("ec_booted")
    const langPicked = sessionStorage.getItem("ec_lang_picked")
    if (booted && langPicked) {
      setScreen("menu")
    } else if (booted && !langPicked) {
      setScreen("lang")
    }
  }, [])

  const handleBootDone = useCallback(() => {
    sessionStorage.setItem("ec_booted", "1")
    setScreen("lang")
  }, [])

  const handleLangDone = useCallback((_locale: string) => {
    sessionStorage.setItem("ec_lang_picked", "1")
    setScreen("menu")
  }, [])

  const goBack   = useCallback(() => setScreen("menu"), [])
  const handleSelect = useCallback((s: Screen) => setScreen(s), [])

  if (screen === "boot") return <BootScreen onDone={handleBootDone} />
  if (screen === "lang") return <LangSelectScreen onDone={handleLangDone} />
  if (screen === "menu") return <MainMenu infra={infra} onSelect={handleSelect} t={t} />

  const shared = { onBack: goBack, t }

  return (
    <>
      {screen === "features"  && <FeaturesScreen  {...shared} />}
      {screen === "about"     && <AboutScreen      {...shared} />}
      {screen === "pricing"   && <PricingScreen    {...shared} />}
      {screen === "community" && <CommunityScreen  {...shared} infra={infra} />}
      {screen === "faq"       && <FaqScreen        {...shared} />}
      {screen === "deploy"    && <DeployScreen     {...shared} />}
      {screen === "legal"     && <LegalScreen      onBack={goBack} />}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </>
  )
}