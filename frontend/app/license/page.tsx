"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FileText, Scale, ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
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
  const t = useTranslations("license")

  return (
    <div className="rounded-lg border border-purple-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-yellow-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-green-500 flex-shrink-0" />
        <span className="ml-2 text-xs text-purple-400/60 whitespace-nowrap">{t("terminal.windowTitle")}</span>
      </div>
      {children}
    </div>
  )
}

export default function LicensePage() {
  const t = useTranslations("license")

  const fullLicenseSections = [
    { title: t("full.sections.definitions.title"), body: t("full.sections.definitions.body") },
    { title: t("full.sections.grant.title"), body: t("full.sections.grant.body") },
    { title: t("full.sections.nonCommercial.title"), body: t("full.sections.nonCommercial.body") },
    { title: t("full.sections.commercialReserved.title"), body: t("full.sections.commercialReserved.body") },
    { title: t("full.sections.redistribution.title"), body: t("full.sections.redistribution.body") },
    { title: t("full.sections.derivative.title"), body: t("full.sections.derivative.body") },
    { title: t("full.sections.hosting.title"), body: t("full.sections.hosting.body") },
    { title: t("full.sections.preservation.title"), body: t("full.sections.preservation.body") },
    { title: t("full.sections.attribution.title"), body: t("full.sections.attribution.body") },
    { title: t("full.sections.termination.title"), body: t("full.sections.termination.body") },
    { title: t("full.sections.noWarranty.title"), body: t("full.sections.noWarranty.body") },
  ]

  const faqEntries = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
  ]

  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      {/* Background Effects */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(168,85,247,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.15),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(147,51,234,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between border-b border-purple-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-purple-400">
              {t("brand")}
            </span>
          </div>
          <nav className="flex gap-4 sm:gap-6 font-mono text-xs sm:text-sm text-purple-400/70">
            <Link href="/" className="transition-colors hover:text-purple-300">{t("nav.home")}</Link>
            <Link href="/dashboard" className="transition-colors hover:text-purple-300">{t("nav.dashboard")}</Link>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-purple-500/10 p-4 sm:p-6 border border-purple-500/20">
              <Scale className="h-8 w-8 sm:h-12 sm:w-12 text-purple-400" />
            </div>
          </div>
          <h1 className="mb-4 font-mono text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              {t("hero.title")}
            </span>
          </h1>
          <p className="mx-auto mb-6 max-w-2xl font-mono text-sm sm:text-base text-purple-400/80 px-4">
            {t("hero.line1Prefix")} <span className="text-pink-400">{t("hero.line1Highlight")}</span> {t("hero.line1Suffix")}
            <br className="hidden sm:block" />
            {t("hero.line2Prefix")} <span className="text-purple-300">{t("hero.line2Highlight")}</span>.
          </p>
          <p className="mx-auto max-w-3xl rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-xs sm:text-sm text-amber-300/90">
            {t("translationNote")}
          </p>
        </section>

        {/* Terminal Summary */}
        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % cat LICENSE.md</p>
              <p className="mt-2">
                <span className="text-pink-400">{t("terminal.licenseLabel")}</span> {t("terminal.licenseValue")}
              </p>
              <p><span className="text-pink-400">{t("terminal.copyrightLabel")}</span> {t("terminal.copyrightValue")}</p>
              <p><span className="text-pink-400">{t("terminal.stewardLabel")}</span> {t("terminal.stewardValue")}</p>
              <p className="mt-2">
                <span className="text-emerald-400">✓</span> {t("terminal.allowed")}
              </p>
              <p>
                <span className="text-red-400">✗</span> {t("terminal.forbidden")}
              </p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* Quick Reference */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400">{t("quick.title")}</h2>
          
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {/* Permitted Uses */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                <h3 className="font-mono text-xl font-bold text-emerald-400">{t("quick.permittedTitle")}</h3>
              </div>
              <ul className="space-y-3 font-mono text-sm text-emerald-400/80">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted3")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted4")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted5")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>{t("quick.permitted6")}</span>
                </li>
              </ul>
            </div>

            {/* Prohibited Uses */}
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <XCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                <h3 className="font-mono text-xl font-bold text-red-400">{t("quick.prohibitedTitle")}</h3>
              </div>
              <ul className="space-y-3 font-mono text-sm text-red-400/80">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited3")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited4")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited5")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>{t("quick.prohibited6")}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 sm:p-6 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-mono text-sm font-bold text-yellow-400 mb-2">{t("quick.attributionTitle")}</h4>
                <p className="font-mono text-xs text-yellow-400/70 leading-relaxed">
                  {t("quick.attributionPrefix")} <span className="text-yellow-300">{t("quick.attributionName1")}</span> {t("quick.attributionAnd")} 
                  <span className="text-yellow-300"> {t("quick.attributionName2")}</span>, {t("quick.attributionSuffix")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* Full License Text */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400">{t("full.title")}</h2>
          
          <div className="rounded-lg border border-purple-500/20 bg-black/60 p-6 sm:p-8 backdrop-blur-sm font-mono text-xs sm:text-sm leading-relaxed text-purple-400/80 space-y-6 overflow-x-auto">
            <div>
              <h3 className="text-pink-400 font-bold text-base mb-3">{t("full.docTitle")}</h3>
              <p className="text-purple-400/60">{t("full.docLine1")}</p>
              <p className="text-purple-400/60">{t("full.docLine2")}</p>
              <p className="text-purple-400/60">{t("full.docLine3")}</p>
            </div>

            {fullLicenseSections.map((section) => (
              <div key={section.title}>
                <h4 className="text-purple-300 font-bold mb-2">{section.title}</h4>
                <p className="text-purple-400/70 whitespace-pre-wrap">{section.body}</p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        {/* FAQ Section */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400">{t("faq.title")}</h2>
          <div className="space-y-4">
            {faqEntries.map((faq, i) => (
              <div key={i} className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-5 backdrop-blur-sm">
                <p className="font-mono text-sm font-bold text-pink-400 mb-2">Q. {faq.q}</p>
                <p className="font-mono text-xs sm:text-sm text-purple-400/70">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        {/* Contact Section */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400">{t("contact.title")}</h2>
          
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 sm:p-8 backdrop-blur-sm text-center">
            <ShieldCheck className="h-12 w-12 sm:h-16 sm:w-16 text-purple-400 mx-auto mb-4" />
            <h3 className="font-mono text-lg sm:text-xl font-bold text-purple-400 mb-3">
              {t("contact.heading")}
            </h3>
            <p className="font-mono text-sm text-purple-400/70 mb-6 max-w-2xl mx-auto">
              {t("contact.body")}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="mailto:noname@ecli.app"
                className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono text-sm font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              >
                {t("contact.contactCommercial")}
              </a>
              <a
                href="https://github.com/thenoname-gurl/EcliPanel"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-purple-500/30 px-6 py-2.5 font-mono text-sm font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
              >
                {t("contact.viewSource")}
              </a>
            </div>
          </div>
        </section>

        <BinaryStrip />
      </div>

      <style jsx global>{`
        @keyframes blink {
          from, to { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </main>
  )
}