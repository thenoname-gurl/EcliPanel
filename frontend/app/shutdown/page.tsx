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

function TerminalBlock({ children, title = "Terminal" }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500/50 flex-shrink-0" />
        <span className="ml-2 text-xs text-red-400/60 whitespace-nowrap">{title}</span>
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

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const targetDate = new Date("2025-04-30T23:59:59")
    
    const calculateTime = () => {
      const now = new Date()
      const diff = targetDate.getTime() - now.getTime()
      
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      })
    }
    
    calculateTime()
    const interval = setInterval(calculateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4">
      {[
        { value: timeLeft.days, label: "DAYS" },
        { value: timeLeft.hours, label: "HOURS" },
        { value: timeLeft.minutes, label: "MINS" },
        { value: timeLeft.seconds, label: "SECS" },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded border border-red-500/30 bg-black/60 p-2 sm:p-4 text-center backdrop-blur-sm"
        >
          <p className="font-mono text-2xl sm:text-4xl md:text-5xl font-bold text-red-400">
            {String(item.value).padStart(2, "0")}
          </p>
          <p className="font-mono text-[10px] sm:text-xs text-red-400/50 mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

function StaticNoise() {
  const [noise, setNoise] = useState<string[]>([])

  useEffect(() => {
    const chars = "░▒▓█"
    const generate = () => {
      const lines: string[] = []
      for (let j = 0; j < 3; j++) {
        let line = ""
        for (let i = 0; i < 60; i++) {
          line += chars[Math.floor(Math.random() * chars.length)]
        }
        lines.push(line)
      }
      setNoise(lines)
    }
    generate()
    const interval = setInterval(generate, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="overflow-hidden font-mono text-[8px] text-red-500/10 select-none leading-none">
      {noise.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  )
}

export default function ShutdownNotice() {
  const [showReveal, setShowReveal] = useState(false)

  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      {/* Overlays */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(239,68,68,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.15),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        {/* HEADER */}
        <header className="mb-8 flex items-center justify-between border-b border-red-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain opacity-60 grayscale" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-red-400">
              Eclipse Systems
            </span>
            <span className="ml-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-400 animate-pulse">
              SHUTDOWN
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-red-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-red-300">[home]</Link>
            <Link href="/dashboard" className="transition-colors hover:text-red-300">[dashboard]</Link>
          </nav>
        </header>

        {/* SHUTDOWN HEADER */}
        <section className="mb-8 text-center">
          <div className="mb-2">
            <CorruptedLine />
          </div>
          <h1 className="mb-4 font-mono text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-red-500 via-red-400 to-purple-400 bg-clip-text text-transparent">
              <GlitchText text="SHUTDOWN" />
            </span>
          </h1>
          <p className="mx-auto mb-2 max-w-xl font-mono text-lg sm:text-xl md:text-2xl text-red-400/80 px-4">
            <span className="text-red-400">NOTICE:</span> Service Termination
          </p>
          <p className="mx-auto mb-4 max-w-md font-mono text-xs sm:text-sm text-red-400/50 px-4">
            Effective April 30, 2025 at 23:59 UTC
          </p>
          <div className="mt-2">
            <CorruptedLine />
          </div>
        </section>

        {/* COUNTDOWN */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-lg sm:text-xl font-bold text-red-400 text-center"># Time Remaining</h2>
          <CountdownTimer />
        </section>

        <BinaryStrip />

        {/* ANNOUNCEMENT TERMINAL */}
        <section className="mb-8">
          <TerminalBlock title="Terminal — Announcement">
            <div className="text-red-400">
              <p className="text-gray-500">eclipse@systems ~ % cat /var/log/announcement.txt</p>
              <p className="mt-3">
                <span className="text-yellow-400">IMPORTANT:</span>{" "}
                <TypingText text="Service shutdown announcement initialized." />
              </p>
              <p className="mt-2 text-red-400/80">
                <span className="text-purple-400">DATE:</span> April 1, 2025
              </p>
              <p className="text-red-400/80">
                <span className="text-purple-400">FROM:</span> Maksym H. (Founder)
              </p>
              <p className="text-red-400/80">
                <span className="text-purple-400">RE:</span> Eclipse Systems Hosting Shutdown
              </p>
              <p className="mt-3 text-red-400/60">─────────────────────────────────────────</p>
            </div>
          </TerminalBlock>
        </section>

        {/* LETTER */}
        <section className="mb-8">
          <div className="rounded-lg border border-red-500/20 bg-black/40 p-6 sm:p-8 backdrop-blur-sm">
            <h2 className="mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400"># A Message from the Founder</h2>
            
            <div className="space-y-4 font-mono text-sm sm:text-base text-red-400/80 leading-relaxed">
              <p>Dear Eclipse Systems Community,</p>
              
              <p>
                It is with a heavy heart that I, <span className="text-purple-400">Maksym H.</span>, must announce the 
                shutdown of Eclipse Systems hosting services.
              </p>
              
              <p>
                Building Eclipse Systems has been an <span className="text-purple-400">incredible journey</span>. 
                What started as a passion project grew into something I never imagined — a hosting platform 
                that served developers and creators who trusted us with their projects.
              </p>
              
              <p>
                Unfortunately, the current economic climate has made it impossible to continue operations. 
                <span className="text-red-400"> RAM prices have increased by 173% compared to early 2025</span>, 
                making our infrastructure costs unsustainable. We&apos;ve explored every option — cost cutting, 
                alternative suppliers, even reaching out to investors — but the numbers simply don&apos;t work anymore.
              </p>

              <div className="my-6 rounded border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-red-400 font-bold mb-2">⚠ Infrastructure Cost Analysis</p>
                <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div>
                    <p className="text-red-400/50">RAM Cost (Jan 2025):</p>
                    <p className="text-red-400">$3.50/GB</p>
                  </div>
                  <div>
                    <p className="text-red-400/50">RAM Cost (Current):</p>
                    <p className="text-red-400">$9.55/GB (+173%)</p>
                  </div>
                  <div>
                    <p className="text-red-400/50">Monthly Overhead:</p>
                    <p className="text-red-400">$12,400 → $33,812</p>
                  </div>
                  <div>
                    <p className="text-red-400/50">Runway Remaining:</p>
                    <p className="text-red-400 animate-pulse">29 days</p>
                  </div>
                </div>
              </div>
              
              <p>
                I want to personally thank every single user who believed in this project. 
                You made every late night, every bug fix, and every server migration worth it.
              </p>
              
              <p className="text-purple-400">
                — Maksym H.
              </p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* TIMELINE */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400"># Shutdown Timeline</h2>
          <div className="space-y-4">
            {[
              { date: "April 1, 2025", event: "Shutdown announcement", status: "COMPLETE", color: "border-red-500/30 bg-red-500/10" },
              { date: "April 7, 2025", event: "New signups disabled", status: "PENDING", color: "border-yellow-500/30 bg-yellow-500/10" },
              { date: "April 15, 2025", event: "Billing suspended — no new charges", status: "SCHEDULED", color: "border-yellow-500/30 bg-yellow-500/10" },
              { date: "April 20, 2025", event: "Data export deadline", status: "SCHEDULED", color: "border-yellow-500/30 bg-yellow-500/10" },
              { date: "April 30, 2025", event: "All servers terminated", status: "FINAL", color: "border-red-500/30 bg-red-500/10" },
            ].map((item, i) => (
              <div key={i} className={`rounded border ${item.color} p-4 font-mono`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-red-400 font-bold">{item.date}</p>
                    <p className="text-red-400/70 text-sm">{item.event}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    item.status === "COMPLETE" ? "bg-red-500/20 text-red-400" :
                    item.status === "FINAL" ? "bg-red-500/30 text-red-300 animate-pulse" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <StaticNoise />
        <BinaryStrip />

        {/* DATA EXPORT */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400"># Export Your Data</h2>
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <p className="mb-4 font-mono text-sm text-purple-400/70">
              Please ensure you backup all your data before the shutdown date.
            </p>
            <TerminalBlock title="Terminal — Export">
              <div className="text-purple-400">
                <p className="text-gray-500">eclipse@systems ~ % ./export --help</p>
                <p className="mt-2"><span className="text-purple-400/60">USAGE:</span> eclipse export [OPTIONS]</p>
                <p className="mt-1"><span className="text-purple-400/60">--all</span>        Export all data</p>
                <p><span className="text-purple-400/60">--files</span>      Export files only</p>
                <p><span className="text-purple-400/60">--database</span>   Export databases</p>
                <p><span className="text-purple-400/60">--config</span>     Export configurations</p>
                <p className="mt-2 text-yellow-400">⚠ Deadline: April 20, 2025</p>
              </div>
            </TerminalBlock>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded border border-purple-500/30 bg-purple-500/10 px-4 py-2 font-mono text-sm text-purple-400 transition-all hover:bg-purple-500/20">
                → Export All Data
              </button>
              <button className="rounded border border-purple-500/30 bg-purple-500/10 px-4 py-2 font-mono text-sm text-purple-400 transition-all hover:bg-purple-500/20">
                → Download Backups
              </button>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* REFUNDS */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-red-400"># Refund Policy</h2>
          <div className="rounded-lg border border-red-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <div className="space-y-3 font-mono text-sm text-red-400/80">
              <p>→ All active subscriptions will receive a <span className="text-purple-400">prorated refund</span></p>
              <p>→ Refunds will be processed by <span className="text-purple-400">April 15, 2025</span></p>
              <p>→ Credits will be returned to original payment method</p>
              <p>→ Questions? Email <a href="mailto:billing@ecli.app" className="text-pink-400 hover:underline">billing@ecli.app</a></p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* STATUS */}
        <section className="mb-8">
          <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Services", status: "ACTIVE", color: "text-yellow-400 border-yellow-500/20" },
              { label: "New Signups", status: "DISABLED", color: "text-red-400 border-red-500/20" },
              { label: "Data Export", status: "AVAILABLE", color: "text-emerald-400 border-emerald-500/20" },
              { label: "Shutdown", status: "29 DAYS", color: "text-red-400 border-red-500/20 animate-pulse" },
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

        {/* FAREWELL */}
        <section className="mb-8 text-center">
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 sm:p-8 backdrop-blur-sm">
            <h2 className="mb-4 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400"># Thank You</h2>
            <p className="mb-4 font-mono text-sm text-purple-400/70 max-w-xl mx-auto">
              To everyone who was part of this journey — the late-night debugging sessions, 
              the feature requests, the support tickets, and the kind words. You made Eclipse Systems special.
            </p>
            <p className="font-mono text-lg text-red-400">
              Until we meet again in another terminal.
            </p>
            <p className="font-mono text-sm text-purple-400/50 mt-2">
              — The Eclipse Systems Team
            </p>
          </div>
        </section>

        <StaticNoise />

        {/* CONTACT */}
        <section className="mb-8 text-center">
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-red-400"># Questions?</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-red-400/50 px-2">
            Our support team will remain available until shutdown to assist with data migration.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="mailto:support@ecli.app"
              className="rounded border border-red-500 bg-red-500/10 px-6 py-2.5 font-mono font-semibold text-red-400 transition-all hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            >
              ./contact_support
            </a>
            <Link
              href="/dashboard"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              export_my_data()
            </Link>
          </div>
        </section>

        <BinaryStrip />

        {/* APRIL FOOLS REVEAL */}
        <section className="mb-8">
          <div 
            className="rounded-lg border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 p-6 sm:p-8 backdrop-blur-sm cursor-pointer transition-all hover:bg-emerald-500/10"
            onClick={() => setShowReveal(true)}
          >
            <div className="text-center">
              {!showReveal ? (
                <>
                  <p className="font-mono text-xs text-emerald-400/50 mb-2">[ click to reveal ]</p>
                  <p className="font-mono text-lg sm:text-xl text-emerald-400/70">
                    Wait... what day is it?
                  </p>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="font-mono text-4xl sm:text-5xl md:text-6xl font-black text-emerald-400">
                    🎉 APRIL FOOLS!
                  </p>
                  <p className="font-mono text-lg sm:text-xl text-emerald-400/80">
                    Eclipse Systems isn&apos;t going anywhere!
                  </p>
                  <p className="font-mono text-sm text-emerald-400/60 max-w-lg mx-auto">
                    RAM prices are fine (they aren't), and we&apos;re still here building cool stuff. 
                    Thanks for being part of our community — you almost had a heart attack, didn&apos;t you?
                  </p>
                  <p className="font-mono text-xs text-emerald-400/40 mt-4">
                    — Maksym H. (Luna aka who enjoys trolling just a little too much)
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/"
                      className="inline-block rounded border border-emerald-500 bg-emerald-500/10 px-6 py-2.5 font-mono font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    >
                      ./back_to_reality
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="rounded-lg border border-red-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-red-400/50 text-center">
            <span className="text-emerald-400/50">Happy April Fools&apos; Day!</span>
          </p>
        </footer>
      </div>
    </main>
  )
}