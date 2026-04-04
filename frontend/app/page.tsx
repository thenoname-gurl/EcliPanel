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

export default function Home() {
  const [infra, setInfra] = useState<any | null>(null);
  const t = useTranslations("landing")

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('https://backend.ecli.app/public/status');
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setInfra(data);
      } catch (e) {
        // skip
      }
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 15_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

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
            <Link href="#features" className="transition-colors hover:text-purple-300">{t("nav.features")}</Link>
            <Link href="#about" className="transition-colors hover:text-purple-300">{t("nav.about")}</Link>
            <Link href="#pricing" className="transition-colors hover:text-purple-300">{t("nav.pricing")}</Link>
            <Link href="#contact" className="transition-colors hover:text-purple-300">{t("nav.contact")}</Link>
          </nav>
        </header>

        <section className="mb-8 text-center">
          <h1 className="mb-4 font-mono text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              {t("brand")}
            </span>
          </h1>
          <p className="mx-auto mb-6 max-w-xl font-mono text-sm sm:text-base md:text-lg text-purple-400/80 px-4">
            <span className="text-pink-400">{t("hero.nextGen")}</span>{" "}{t("hero.subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
            <Link
              href="/register"
              className="rounded border border-purple-500 bg-purple-500/10 px-4 py-2 sm:px-6 sm:py-2.5 font-mono text-xs sm:text-sm font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              {t("hero.ctaStart")}
            </Link>
            <Link
              href="/login"
              className="rounded border border-purple-500/30 px-4 py-2 sm:px-6 sm:py-2.5 font-mono text-xs sm:text-sm font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              {t("hero.ctaSignIn")}
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./start --journey</p>
              <p className="mt-2">
                <span className="text-pink-400">{t("terminal.objective")}</span> <TypingText text={t("terminal.objectiveValue")} />
              </p>
              <p><span className="text-pink-400">{t("terminal.difficulty")}</span> {t("terminal.difficultyValue")}</p>
              <p>
                <span className="text-pink-400">{t("terminal.status")}</span>{' '}
                <span className={
                  infra?.status === 'online'
                    ? 'text-emerald-400'
                    : infra?.status === 'degraded'
                      ? 'text-yellow-400'
                      : infra?.status === 'offline'
                        ? 'text-red-400'
                        : 'text-purple-400'
                }>
                  {infra ? (infra.status || 'UNKNOWN').toString().toUpperCase() : 'LOADING'}
                </span>
              </p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("whatIs.title")}</h2>
          <p className="mb-6 font-mono text-purple-400/60">
            {t("whatIs.subtitlePrefix")} <span className="text-pink-400">{t("whatIs.brandUpper")}</span> {t("whatIs.subtitleSuffix")}
          </p>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
              <h3 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl font-bold text-purple-400">{t("whatIs.card1.title")}</h3>
              <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
                {t("whatIs.card1.line1")}
                <br></br>
                {t("whatIs.card1.line2")}
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">{t("whatIs.card1.item1")}</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">{t("whatIs.card1.item2")}</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">{t("whatIs.card1.item3")}</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">{t("whatIs.card1.item4")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
              <h3 className="mb-4 font-mono text-xl font-bold text-purple-400">{t("whatIs.card2.title")}</h3>
              <p className="mb-4 font-mono text-sm text-purple-400/60">
                {t("whatIs.card2.line1")}
                <br></br>
                {t("whatIs.card2.line2")}
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">{t("whatIs.card2.item1")}</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">{t("whatIs.card2.item2")}</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">{t("whatIs.card2.item3")}</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">{t("whatIs.card2.item4")}</li>
              </ul>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section id="features" className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("features.title")}</h2>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: t("features.item1Title"), text: t("features.item1Text") },
              { title: t("features.item2Title"), text: t("features.item2Text") },
              { title: t("features.item3Title"), text: t("features.item3Text") },
              { title: t("features.item4Title"), text: t("features.item4Text") },
              { title: t("features.item5Title"), text: t("features.item5Text") },
              { title: t("features.item6Title"), text: t("features.item6Text") },
            ].map((feature) => (
              <article
                key={feature.title}
                className="group rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-5 backdrop-blur-sm transition-all hover:border-purple-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              >
                <h4 className="mb-2 font-mono text-xs sm:text-sm font-bold text-pink-400">{feature.title}</h4>
                <p className="font-mono text-xs text-purple-400/60 leading-relaxed">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section id="trusted" className="mb-8">
          <h2 className="mb-1 sm:mb-2 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("community.title")}</h2>
          <h3 className="mb-4 sm:mb-6 font-mono text-lg sm:text-xl text-purple-400/80">{t("community.subtitle")}</h3>

          <div className="mb-6 rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <p className="mb-4 font-mono text-xs sm:text-sm text-purple-400/60">
              {t("community.description")}
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded border border-purple-500 bg-purple-500/10 px-4 py-2 font-mono text-sm text-purple-400 transition-all hover:bg-purple-500/20"
            >
              {t("community.cta")}
            </Link>
          </div>

          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./connect --community</p>
              <p className="mt-2"><span className="text-pink-400">{t("community.init")}</span> {t("community.handshake")}</p>
              <p><span className="text-pink-400">{t("community.resolving")}</span> ecli.app</p>
              <p>
                <span className="text-pink-400">{t("terminal.status")}</span>{' '}
                <span className={
                  infra?.status === 'online'
                    ? 'text-emerald-400'
                    : infra?.status === 'degraded'
                      ? 'text-yellow-400'
                      : infra?.status === 'offline'
                        ? 'text-red-400'
                        : 'text-purple-400'
                }>
                  {infra ? (infra.status || 'UNKNOWN').toString().toUpperCase() : 'LOADING'}
                </span>
              </p>
              <p>
                <span className="text-pink-400">{t("community.nodes")}</span>{' '}
                <span className="text-purple-400">{infra ? new Intl.NumberFormat().format(infra.nodeCount) : '...'}</span>
              </p>
              <p className="mt-1 text-xs text-purple-400/60">
                <span className="text-emerald-400">{infra ? infra.online : '...'}</span> {t("community.online")} • <span className="text-yellow-400">{infra ? infra.degraded : '...'}</span> {t("community.degraded")} • <span className="text-red-400">{infra ? infra.offline : '...'}</span> {t("community.offline")}
              </p>
            </div>
          </TerminalBlock>

          <div className="mt-4 sm:mt-6 grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              t("community.group1"),
              t("community.group2"),
              t("community.group3"),
              t("community.group4"),
            ].map((org) => (
              <div
                key={org}
                className="rounded border border-purple-500/20 bg-black/40 p-2 sm:p-3 text-center font-mono text-xs sm:text-sm text-purple-400/80 backdrop-blur-sm transition-all hover:border-purple-500/40"
              >
                {org}
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section id="about" className="mb-8">
          <h2 className="mb-1 sm:mb-2 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("about.title")}</h2>
          <h3 className="mb-3 sm:mb-4 font-mono text-base sm:text-lg md:text-xl">
            {t("about.subtitlePrefix")} <span className="text-pink-400">{t("about.subtitleHighlight")}</span>
          </h3>
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <p className="font-mono text-xs sm:text-sm leading-relaxed text-purple-400/60">
              {t("about.line1")}
              <br></br>
              {t("about.line2")}
            </p>
          </div>
        </section>

        <BinaryStrip />

        <section id="pricing" className="mb-8">
          <h2 className="mb-1 sm:mb-2 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("plans.title")}</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-purple-400/60">
            {t("plans.subtitle")}
          </p>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-5 backdrop-blur-sm">
              <h3 className="font-mono text-base sm:text-lg font-bold text-purple-400">{t("plans.free.name")}</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">{t("plans.free.tagline")}</p>
              <p className="mt-3 font-mono text-xl sm:text-2xl font-black text-white">{t("plans.free.price")}<span className="text-xs sm:text-sm text-purple-400/50">{t("plans.free.period")}</span></p>
              <ul className="mt-3 sm:mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>{t("plans.free.item1")}</li>
                <li>{t("plans.free.item2")}</li>
                <li>{t("plans.free.item3")}</li>
                <li>{t("plans.free.item4")}</li>
                <li>{t("plans.free.item5")}</li>
                <li>{t("plans.free.item6")}</li>
                <li>{t("plans.free.item7")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-5 backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-purple-400">{t("plans.edu.name")}</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">{t("plans.edu.tagline")}</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">{t("plans.edu.price")}<span className="text-sm text-purple-400/50">{t("plans.edu.period")}</span></p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>{t("plans.edu.item1")}</li>
                <li>{t("plans.edu.item2")}</li>
                <li>{t("plans.edu.item3")}</li>
                <li>{t("plans.edu.item4")}</li>
                <li>{t("plans.edu.item5")}</li>
                <li>{t("plans.edu.item6")}</li>
                <li>{t("plans.edu.item7")}</li>
                <li>{t("plans.edu.item8")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-pink-500/40 bg-pink-500/5 p-5 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-pink-400">{t("plans.paid.name")}</h3>
              <p className="mt-1 font-mono text-xs text-pink-400/50">{t("plans.paid.tagline")}</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">{t("plans.paid.price")}<span className="text-sm text-pink-400/50">{t("plans.paid.period")}</span></p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-pink-400/60">
                <li>{t("plans.paid.item1")}</li>
                <li>{t("plans.paid.item2")}</li>
                <li>{t("plans.paid.item3")}</li>
                <li>{t("plans.paid.item4")}</li>
                <li>{t("plans.paid.item5")}</li>
                <li>{t("plans.paid.item6")}</li>
                <li>{t("plans.paid.item7")}</li>
                <li>{t("plans.paid.item8")}</li>
                <li>{t("plans.paid.item9")}</li>
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-400/40 bg-purple-500/5 p-5 shadow-[0_0_30px_rgba(168,85,247,0.15)] backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-purple-300">{t("plans.enterprise.name")}</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">{t("plans.enterprise.tagline")}</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">{t("plans.enterprise.price")}</p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>{t("plans.enterprise.item1")}</li>
                <li>{t("plans.enterprise.item2")}</li>
                <li>{t("plans.enterprise.item3")}</li>
                <li>{t("plans.enterprise.item4")}</li>
                <li>{t("plans.enterprise.item5")}</li>
                <li>{t("plans.enterprise.item6")}</li>
                <li>{t("plans.enterprise.item7")}</li>
                <li>{t("plans.enterprise.item8")}</li>
                <li>{t("plans.enterprise.item9")}</li>
              </ul>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("faq.title")}</h2>
          <div className="space-y-3 sm:space-y-4">
            {[
              { q: t("faq.q1"), a: t("faq.a1") },
              { q: t("faq.q2"), a: t("faq.a2") },
              { q: t("faq.q3"), a: t("faq.a3") },
              {
                q: t("faq.q4"), a: (
                  <span>
                    {t("faq.a4Prefix")}{' '}
                    <a href="https://github.com/thenoname-gurl/EcliPanel" className="text-pink-400 hover:underline">GitHub</a>{' '}
                    {t("faq.a4Suffix")}
                  </span>
                )
              },
            ].map((faq, i) => (
              <div key={i} className="rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-4 backdrop-blur-sm">
                <p className="font-mono text-xs sm:text-sm font-bold text-pink-400">Q. {faq.q}</p>
                <p className="mt-2 font-mono text-xs text-purple-400/60">{faq.a}</p>
              </div>
            ))}
          </div>
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
              href="/register"
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              {t("cta.register")}
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
        <footer id="contact" className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-purple-400/50">
            {t("footer.customSetup")} {" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            {t("footer.orGoTo")} {" "}
            <Link href="/dashboard" className="text-pink-400 hover:underline">
              {t("footer.dashboard")}
            </Link>.
          </p>
        </footer>
      </div>
    </main>
  )
}