"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

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
  return (
    <div className="rounded-lg border border-red-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <span className="ml-2 text-xs text-red-400/60 whitespace-nowrap">Terminal — Error</span>
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
  const [timestamp] = useState(() => new Date().toISOString())
  const [pid] = useState(() => Math.floor(Math.random() * 65535))
  const [memAddr] = useState(() => "0x" + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, "0").toUpperCase())

  return (
    <div className="space-y-1 text-xs">
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400">CRASH REPORT</span> <span className="text-red-400/50">— Eclipse Systems Runtime</span></p>
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400/60">Timestamp:</span> <span className="text-red-400/40">{timestamp}</span></p>
      <p><span className="text-red-400/60">PID:</span> <span className="text-red-400/40">{pid}</span></p>
      <p><span className="text-red-400/60">Memory:</span> <span className="text-red-400/40">{memAddr}</span></p>
      {error.digest && (
        <p><span className="text-red-400/60">Digest:</span> <span className="text-red-400/40">{error.digest}</span></p>
      )}
      <p><span className="text-red-400/60">Signal:</span> <span className="text-red-400/40">SIGSEGV (Segmentation fault)</span></p>
      <p className="text-red-400/40">──────────────────────────────────────────────</p>
      <p><span className="text-red-400/60">Exception:</span> <span className="text-red-300">{error.name || "Error"}</span></p>
      <p><span className="text-red-400/60">Message:</span> <span className="text-red-300/80">{error.message || "An unexpected error occurred"}</span></p>
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
              Eclipse Systems
            </span>
            <span className="ml-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-400 animate-pulse">
              FAULT
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-red-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-red-300">[home]</Link>
            <Link href="/dashboard" className="transition-colors hover:text-red-300">[dashboard]</Link>
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
            <span className="text-red-400">FATAL:</span> Something went wrong
          </p>
          <p className="mx-auto mb-2 max-w-md font-mono text-xs sm:text-sm text-red-400/50 px-4">
            An unhandled exception has crashed this process.
          </p>
          {retryCount > 0 && (
            <p className="font-mono text-xs text-yellow-400/60">
              Retry attempts: {retryCount}
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
                <span className="text-red-500">PANIC:</span>{" "}
                <TypingText text="Unrecoverable runtime exception detected." />
              </p>
              <p className="mt-1">
                <span className="text-red-400/60">ERROR:</span>{" "}
                <span className="text-red-300/80">{error.message || "An unexpected error occurred"}</span>
              </p>
              {error.digest && (
                <p>
                  <span className="text-red-400/60">DIGEST:</span>{" "}
                  <span className="text-red-300/60">{error.digest}</span>
                </p>
              )}
              <p><span className="text-red-400/60">EXIT CODE:</span> <span className="text-red-300">1</span></p>
              <p className="mt-1 text-red-400/40">Process terminated.</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* CRASH REPORT */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400"># Crash Report</h2>
          <div className="rounded-lg border border-red-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <CrashLog error={error} />
          </div>
        </section>

        <BinaryStrip />

        {/* DIAGNOSTICS & RECOVERY */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400"># Diagnostics</h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-red-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-red-400"># Possible Causes</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                Blåhaj ate pixelcat, or maybe:
              </p>
              <ul className="space-y-2 font-mono text-sm text-red-400/80">
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ Server-side rendering failure</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ Unhandled promise rejection</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ Invalid state mutation</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ A cat chewed through the cables</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400"># Recovery Options</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                Try one of these recovery procedures:
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
                      Retrying...
                    </span>
                  ) : (
                    "→ Retry this page"
                  )}
                </button>
                <Link
                  href="/"
                  className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  → Return to Home
                </Link>
                <Link
                  href="/dashboard"
                  className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  → Go to Dashboard
                </Link>
                <button
                  onClick={() => window.location.reload()}
                  className="block w-full rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-left font-mono text-sm text-purple-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  → Hard reload page
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
              <p className="mt-2"><span className="text-yellow-400">WARN:</span> Automatic recovery unavailable.</p>
              <p><span className="text-red-400/60">SCANNING:</span> process state... <span className="text-red-400">CORRUPTED</span></p>
              <p><span className="text-red-400/60">HEAP:</span> <span className="text-red-400/50">Snapshot unavailable</span></p>
              <p><span className="text-red-400/60">STACK:</span> <span className="text-red-400/50">Frames lost</span></p>
              <p className="mt-2"><span className="text-purple-400">SUGGESTION:</span> <span className="text-purple-400/60">Manual intervention required.</span></p>
              <p className="text-gray-500 mt-1"># Try: reset() or navigate to a known route.</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* STATUS BLOCKS */}
        <section className="mb-8">
          <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Runtime", status: "FAULT", color: "text-red-400 border-red-500/20" },
              {
                label: "Memory",
                status: memoryPercent !== null ? `${memoryStatus} (${memoryPercent.toFixed(1)}%)` : "UNKNOWN",
                color: memoryPercent !== null && memoryStatus === "OK" ? "text-emerald-400 border-emerald-500/20" : "text-red-400 border-red-500/20",
              },
              { label: "Network", status: "OK", color: "text-emerald-400 border-emerald-500/20" },
              { label: "Recovery", status: "PENDING", color: "text-yellow-400 border-yellow-500/20" },
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
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-red-400"># Need help?</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-red-400/50 px-2">
            If this error persists, contact our support team. We&apos;ll help you debug.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded border border-red-500 bg-red-500/10 px-6 py-2.5 font-mono font-semibold text-red-400 transition-all hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? "./retrying..." : "./retry --force"}
            </button>
            <Link
              href="/"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              escape_to_home()
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="rounded-lg border border-red-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-red-400/50">
            Persistent errors? Email{" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            or return to{" "}
            <Link href="/" className="text-pink-400 hover:underline">
              Home
            </Link>.
            {error.digest && (
              <span className="ml-2 text-red-400/30">Reference: {error.digest}</span>
            )}
          </p>
        </footer>
      </div>
    </main>
  )
}