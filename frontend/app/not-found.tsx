"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

function BinaryStrip() {
  const [binary, setBinary] = useState("")

  useEffect(() => {
    const chars = "01"
    let str = ""
    for (let i = 0; i < 200; i++) {
      str += chars[Math.floor(Math.random() * chars.length)]
    }
    setBinary(str)
  }, [])

  return (
    <div className="overflow-hidden py-4 text-[10px] font-mono text-purple-500/30 select-none">
      {binary}
    </div>
  )
}

function TerminalBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-purple-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-yellow-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-green-500 flex-shrink-0" />
        <span className="ml-2 text-xs text-purple-400/60 whitespace-nowrap">Terminal</span>
      </div>
      {children}
    </div>
  )
}

function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    setDisplayed("")
    setDone(false)
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(interval)
        setDone(true)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [text])

  return (
    <span>
      {displayed}
      <span
        style={{ animation: "blink 1s step-end infinite" }}
        className={done ? "inline" : "hidden"}
      >_</span>
    </span>
  )
}

function GlitchText({ text }: { text: string }) {
  const [glitched, setGlitched] = useState(text)

  useEffect(() => {
    const glitchChars = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`"
    const interval = setInterval(() => {
      const arr = text.split("")
      const numGlitches = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < numGlitches; i++) {
        const idx = Math.floor(Math.random() * arr.length)
        if (arr[idx] !== " ") {
          arr[idx] = glitchChars[Math.floor(Math.random() * glitchChars.length)]
        }
      }
      setGlitched(arr.join(""))
      setTimeout(() => setGlitched(text), 100)
    }, 2000)
    return () => clearInterval(interval)
  }, [text])

  return <span>{glitched}</span>
}

export default function NotFound() {
  const [path, setPath] = useState("")
  const t = useTranslations("notFound")

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(168,85,247,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.15),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(147,51,234,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between border-b border-purple-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-purple-400">
              {t("brand")}
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-purple-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-purple-300">{t("nav.home")}</Link>
            <Link href="/#features" className="transition-colors hover:text-purple-300">{t("nav.features")}</Link>
            <Link href="/#pricing" className="transition-colors hover:text-purple-300">{t("nav.pricing")}</Link>
            <Link href="/#contact" className="transition-colors hover:text-purple-300">{t("nav.contact")}</Link>
          </nav>
        </header>

        <section className="mb-8 text-center">
          <h1 className="mb-4 font-mono text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-red-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              <GlitchText text="404" />
            </span>
          </h1>
          <p className="mx-auto mb-2 max-w-xl font-mono text-lg sm:text-xl md:text-2xl text-purple-400/80 px-4">
            <span className="text-pink-400">{t("hero.errorLabel")}</span> {t("hero.title")}
          </p>
          <p className="mx-auto mb-6 max-w-md font-mono text-xs sm:text-sm text-purple-400/50 px-4">
            {t("hero.subtitle")}
          </p>
        </section>

        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % curl {path || "/unknown"}</p>
              <p className="mt-2">
                <span className="text-red-400">{t("terminal.error404")}</span> <TypingText text={t("terminal.notFoundDimension")} />
              </p>
              <p className="mt-1"><span className="text-pink-400">{t("terminal.path")}</span> <span className="text-red-400/80">{path || "/unknown"}</span></p>
              <p><span className="text-pink-400">{t("terminal.lookup")}</span> <span className="text-yellow-400">{t("terminal.failed")}</span></p>
              <p><span className="text-pink-400">{t("terminal.suggestion")}</span> {t("terminal.returnCoordinates")}</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("details.title")}</h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400">{t("details.causesTitle")}</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                {t("details.causesSubtitle")}
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("details.cause1")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("details.cause2")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("details.cause3")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("details.cause4")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400">{t("details.quickNavTitle")}</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                {t("details.quickNavSubtitle")}
              </p>
              <ul className="space-y-2 font-mono text-sm">
                <li>
                  <Link href="/" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("details.homePage")}
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("details.dashboard")}
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("details.login")}
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    {t("details.register")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./recover --path {path || "/unknown"}</p>
              <p className="mt-2"><span className="text-yellow-400">{t("recovery.warn")}</span> {t("recovery.noRoute")}</p>
              <p><span className="text-pink-400">{t("recovery.scanning")}</span> {t("recovery.sitemap")}</p>
              <p><span className="text-pink-400">{t("recovery.fallback")}</span> <span className="text-emerald-400">{t("recovery.redirect")}</span></p>
              <p className="mt-2 text-gray-500">{t("recovery.recommendation")}</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* CTA */}
        <section className="mb-8 text-center">
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-purple-400">{t("cta.title")}</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-purple-400/60 px-2">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              {t("cta.home")}
            </Link>
            <Link
              href="/dashboard"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              {t("cta.dashboard")}
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-purple-400/50">
            {t("footer.lost")} {" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            {t("footer.orReturn")} {" "}
            <Link href="/" className="text-pink-400 hover:underline">
              {t("footer.home")}
            </Link>.
          </p>
        </footer>
      </div>
    </main>
  )
}