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
              Eclipse Systems
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-purple-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-purple-300">[home]</Link>
            <Link href="/#features" className="transition-colors hover:text-purple-300">[features]</Link>
            <Link href="/#pricing" className="transition-colors hover:text-purple-300">[pricing]</Link>
            <Link href="/#contact" className="transition-colors hover:text-purple-300">[contact]</Link>
          </nav>
        </header>

        <section className="mb-8 text-center">
          <h1 className="mb-4 font-mono text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-red-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              <GlitchText text="404" />
            </span>
          </h1>
          <p className="mx-auto mb-2 max-w-xl font-mono text-lg sm:text-xl md:text-2xl text-purple-400/80 px-4">
            <span className="text-pink-400">ERROR:</span> Page not found
          </p>
          <p className="mx-auto mb-6 max-w-md font-mono text-xs sm:text-sm text-purple-400/50 px-4">
            The requested resource has been lost in the void.
          </p>
        </section>

        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % curl {path || "/unknown"}</p>
              <p className="mt-2">
                <span className="text-red-400">ERROR 404:</span> <TypingText text="Resource not found in any known dimension." />
              </p>
              <p className="mt-1"><span className="text-pink-400">PATH:</span> <span className="text-red-400/80">{path || "/unknown"}</span></p>
              <p><span className="text-pink-400">LOOKUP:</span> <span className="text-yellow-400">FAILED</span></p>
              <p><span className="text-pink-400">SUGGESTION:</span> Return to known coordinates</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400"># What happened?</h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400"># Possible Causes</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                Blåhaj ate page, or maybe:
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ The page was moved or deleted</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ The URL was mistyped</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ The link you followed is outdated</li>
                <li className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">→ A cat walked across the keyboard</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400"># Quick Navigation</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                Here are some places you might want to go:
              </p>
              <ul className="space-y-2 font-mono text-sm">
                <li>
                  <Link href="/" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    → Home Page
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    → Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    → Login
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="block rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-pink-400 transition-all hover:border-purple-500/40 hover:bg-purple-500/10">
                    → Register
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
              <p className="mt-2"><span className="text-yellow-400">WARN:</span> No recovery route found.</p>
              <p><span className="text-pink-400">SCANNING:</span> sitemap... <span className="text-red-400">0 matches</span></p>
              <p><span className="text-pink-400">FALLBACK:</span> <span className="text-emerald-400">redirect → /</span></p>
              <p className="mt-2 text-gray-500"># Recommendation: go home, deploy something cool instead.</p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* CTA */}
        <section className="mb-8 text-center">
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-purple-400"># Let&apos;s get you back on track</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-purple-400/60 px-2">
            This page doesn&apos;t exist, but your next deployment could.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/"
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              ./navigate --home
            </Link>
            <Link
              href="/dashboard"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              go_to_dashboard()
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-purple-400/50">
            Lost? Email{" "}
            <a href="mailto:contact@eclipsesystems.org" className="text-pink-400 hover:underline">
              contact@eclipsesystems.org
            </a>{" "}
            or return to{" "}
            <Link href="/" className="text-pink-400 hover:underline">
              Home
            </Link>.
          </p>
        </footer>
      </div>
    </main>
  )
}