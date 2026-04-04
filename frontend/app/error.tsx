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
    <div className="overflow-hidden py-4 text-[10px] font-mono text-red-500/30 select-none">
      {binary}
    </div>
  )
}

function TerminalBlock({ children }: { children: React.ReactNode }) {
  const t = useTranslations("errorPage")

  return (
    <div className="rounded-lg border border-red-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <span className="ml-2 text-xs text-red-400/60 whitespace-nowrap">{t("terminal.title")}</span>
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
    const glitchChars = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`█▓▒░"
    const interval = setInterval(() => {
      const arr = text.split("")
      const numGlitches = Math.floor(Math.random() * 5) + 2
      for (let i = 0; i < numGlitches; i++) {
        const idx = Math.floor(Math.random() * arr.length)
        if (arr[idx] !== " ") {
          arr[idx] = glitchChars[Math.floor(Math.random() * glitchChars.length)]
        }
      }
      setGlitched(arr.join(""))
      setTimeout(() => setGlitched(text), 150)
    }, 1500)
    return () => clearInterval(interval)
  }, [text])

  return <span>{glitched}</span>
}

function CorruptedLine() {
  const [line, setLine] = useState("")

  useEffect(() => {
    const chars = "█▓▒░!@#$%^&*ABCDEF0123456789abcdef"
    const generate = () => {
      let str = ""
      const len = Math.floor(Math.random() * 40) + 20
      for (let i = 0; i < len; i++) {
        str += chars[Math.floor(Math.random() * chars.length)]
      }
      setLine(str)
    }
    generate()
    const interval = setInterval(generate, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="overflow-hidden font-mono text-[10px] text-red-500/20 select-none">
      {line}
    </div>
  )
}

function CrashLog({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("errorPage")
  const [timestamp] = useState(() => new Date().toISOString())
  const [pid] = useState(() => Math.floor(Math.random() * 65535))
  const [memAddr] = useState(() => "0x" + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, "0").toUpperCase())

  return (
    <div className="space-y-1 text-xs">
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400">{t("crash.report")}</span> <span className="text-red-400/50">— {t("crash.runtime")}</span></p>
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400/60">{t("crash.timestamp")}</span> <span className="text-red-400/40">{timestamp}</span></p>
      <p><span className="text-red-400/60">{t("crash.pid")}</span> <span className="text-red-400/40">{pid}</span></p>
      <p><span className="text-red-400/60">{t("crash.memory")}</span> <span className="text-red-400/40">{memAddr}</span></p>
      {error.digest && (
        <p><span className="text-red-400/60">{t("crash.digest")}</span> <span className="text-red-400/40">{error.digest}</span></p>
      )}
      <p><span className="text-red-400/60">{t("crash.signal")}</span> <span className="text-red-400/40">{t("crash.signalValue")}</span></p>
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400/60">{t("crash.exception")}</span> <span className="text-red-300">{error.name || t("crash.defaultErrorName")}</span></p>
      <p><span className="text-red-400/60">{t("crash.message")}</span> <span className="text-red-300/80">{error.message || t("crash.defaultErrorMessage")}</span></p>
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
    </div>
  )
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("errorPage")
  const [retryCount, setRetryCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [memoryInfo, setMemoryInfo] = useState<{ used: number | null; total: number | null }>({ used: null, total: null })

  useEffect(() => {
    if (typeof window !== "undefined" && (performance as any).memory) {
      const mem = (performance as any).memory
      setMemoryInfo({ used: mem.usedJSHeapSize, total: mem.jsHeapSizeLimit })
    } else if (typeof navigator !== "undefined" && (navigator as any).deviceMemory) {
      const deviceMemory = (navigator as any).deviceMemory
      setMemoryInfo({ used: null, total: Number(deviceMemory) * 1024 * 1024 * 1024 })
    }
  }, [])

  const memoryPercent = memoryInfo.used && memoryInfo.total ? (memoryInfo.used / memoryInfo.total) * 100 : null
  const memoryStatus = memoryPercent === null
    ? "UNKNOWN"
    : memoryPercent > 90
      ? "OVERFLOW"
      : memoryPercent > 75
        ? "WARN"
        : "OK"

  const handleRetry = () => {
    setRetryCount((c) => c + 1)
    setRetrying(true)
    setTimeout(() => {
      setRetrying(false)
      reset()
    }, 1500)
  }

  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      {/* Overlays — red-shifted for error state */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(239,68,68,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.15),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        {/* HEADER */}
        <header className="mb-8 flex items-center justify-between border-b border-red-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain opacity-60" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-red-400">
              {t("brand")}
            </span>
            <span className="ml-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-400 animate-pulse">
              {t("header.fault")}
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-red-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-red-300">{t("header.home")}</Link>
            <Link href="/dashboard" className="transition-colors hover:text-red-300">{t("header.dashboard")}</Link>
          </nav>
        </header>

        {/* ERROR CODE */}
        <section className="mb-8 text-center">
          <div className="mb-2">
            <CorruptedLine />
          </div>
          <h1 className="mb-4 font-mono text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-red-500 via-red-400 to-purple-400 bg-clip-text text-transparent">
              <GlitchText text="ERROR" />
            </span>
          </h1>
          <p className="mx-auto mb-2 max-w-xl font-mono text-lg sm:text-xl md:text-2xl text-red-400/80 px-4">
            <span className="text-red-400">{t("hero.fatal")}</span> {t("hero.title")}
          </p>
          <p className="mx-auto mb-2 max-w-md font-mono text-xs sm:text-sm text-red-400/50 px-4">
            {t("hero.subtitle")}
          </p>
          {retryCount > 0 && (
            <p className="font-mono text-xs text-yellow-400/60">
              {t("hero.retryAttempts", { count: retryCount })}
            </p>
          )}
          <div className="mt-2">
            <CorruptedLine />
          </div>
        </section>

        {/* CRASH TERMINAL */}
        <section className="mb-8">
          <TerminalBlock>
            <div className="text-red-400">
              <p className="text-gray-500">eclipse@systems ~ % ./runtime --exec</p>
              <p className="mt-2">
                <span className="text-red-500">{t("terminal.panic")}</span>{" "}
                <TypingText text={t("terminal.unrecoverable")} />
              </p>
              <p className="mt-1">
                <span className="text-red-400/60">{t("terminal.error")}</span>{" "}
                <span className="text-red-300/80">{error.message || t("crash.defaultErrorMessage")}</span>
              </p>
              {error.digest && (
                <p>
                  <span className="text-red-400/60">{t("terminal.digest")}</span>{" "}
                  <span className="text-red-300/60">{error.digest}</span>
                </p>
              )}
              <p><span className="text-red-400/60">{t("terminal.exitCode")}</span> <span className="text-red-300">1</span></p>
              <p className="mt-1 text-red-400/40">{t("terminal.terminated")}</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* CRASH REPORT */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400">{t("sections.crashReport")}</h2>
          <div className="rounded-lg border border-red-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <CrashLog error={error} />
          </div>
        </section>

        <BinaryStrip />

        {/* DIAGNOSTICS & RECOVERY */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400">{t("sections.diagnostics")}</h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-red-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-red-400">{t("sections.possibleCauses")}</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                {t("sections.causesSubtitle")}
              </p>
              <ul className="space-y-2 font-mono text-sm text-red-400/80">
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("sections.cause1")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("sections.cause2")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("sections.cause3")}</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">{t("sections.cause4")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400">{t("sections.recoveryOptions")}</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                {t("sections.recoverySubtitle")}
              </p>
              <div className="space-y-2">
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="block w-full rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-left font-mono text-sm text-red-400 transition-all hover:border-red-500/50 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retrying ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                      {t("actions.retrying")}
                    </span>
                  ) : (
                    t("actions.retryThisPage")
                  )}
                </button>
                <Link
                  href="/"
                  className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  {t("actions.returnHome")}
                </Link>
                <Link
                  href="/dashboard"
                  className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  {t("actions.goDashboard")}
                </Link>
                <button
                  onClick={() => window.location.reload()}
                  className="block w-full rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-left font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  {t("actions.hardReload")}
                </button>
              </div>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* RECOVERY TERMINAL */}
        <section className="mb-8">
          <TerminalBlock>
            <div className="text-red-400">
              <p className="text-gray-500">eclipse@systems ~ % ./recover --auto</p>
              <p className="mt-2"><span className="text-yellow-400">{t("recovery.warn")}</span> {t("recovery.autoUnavailable")}</p>
              <p><span className="text-red-400/60">{t("recovery.scanning")}</span> <span className="text-red-400">{t("recovery.corrupted")}</span></p>
              <p><span className="text-red-400/60">{t("recovery.heap")}</span> <span className="text-red-400/50">{t("recovery.heapUnavailable")}</span></p>
              <p><span className="text-red-400/60">{t("recovery.stack")}</span> <span className="text-red-400/50">{t("recovery.stackLost")}</span></p>
              <p className="mt-2"><span className="text-purple-400">{t("recovery.suggestion")}</span> <span className="text-purple-400/60">{t("recovery.manualRequired")}</span></p>
              <p className="text-gray-500 mt-1">{t("recovery.tryReset")}</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* STATUS BLOCKS */}
        <section className="mb-8">
          <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t("status.runtime"), status: t("status.fault"), color: "text-red-400 border-red-500/20" },
              {
                label: t("status.memory"),
                status: memoryPercent !== null ? `${memoryStatus} (${memoryPercent.toFixed(1)}%)` : t("status.unknown"),
                color: memoryPercent !== null && memoryStatus === "OK" ? "text-emerald-400 border-emerald-500/20" : "text-red-400 border-red-500/20",
              },
              { label: t("status.network"), status: t("status.ok"), color: "text-emerald-400 border-emerald-500/20" },
              { label: t("status.recovery"), status: t("status.pending"), color: "text-yellow-400 border-yellow-500/20" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded border bg-black/40 p-2 sm:p-3 text-center font-mono text-xs sm:text-sm backdrop-blur-sm ${item.color}`}
              >
                <p className="text-purple-400/50 text-[10px] mb-1">{item.label}</p>
                <p className="font-bold">{item.status}</p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        {/* CTA */}
        <section className="mb-8 text-center">
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-red-400">{t("cta.title")}</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-red-400/50 px-2">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded border border-red-500 bg-red-500/10 px-6 py-2.5 font-mono font-semibold text-red-400 transition-all hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? t("cta.retrying") : t("cta.retryForce")}
            </button>
            <Link
              href="/"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              {t("cta.escapeHome")}
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="rounded-lg border border-red-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-red-400/50">
            {t("footer.persistentErrors")} {" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            {t("footer.orReturn")} {" "}
            <Link href="/" className="text-pink-400 hover:underline">
              {t("footer.home")}
            </Link>.
            {error.digest && (
              <span className="ml-2 text-red-400/30">{t("footer.reference")} {error.digest}</span>
            )}
          </p>
        </footer>
      </div>
    </main>
  )
}