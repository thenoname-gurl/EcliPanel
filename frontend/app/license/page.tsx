"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FileText, Scale, ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

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

export default function LicensePage() {
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
              Eclipse Systems
            </span>
          </div>
          <nav className="flex gap-4 sm:gap-6 font-mono text-xs sm:text-sm text-purple-400/70">
            <Link href="/" className="transition-colors hover:text-purple-300">[home]</Link>
            <Link href="/dashboard" className="transition-colors hover:text-purple-300">[dashboard]</Link>
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
              Community License
            </span>
          </h1>
          <p className="mx-auto mb-6 max-w-2xl font-mono text-sm sm:text-base text-purple-400/80 px-4">
            Open-source for <span className="text-pink-400">non-commercial</span> use.
            <br className="hidden sm:block" />
            Commercial rights reserved to <span className="text-purple-300">EclipseSystems</span>.
          </p>
        </section>

        {/* Terminal Summary */}
        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % cat LICENSE.md</p>
              <p className="mt-2">
                <span className="text-pink-400">LICENSE:</span> EclipseSystems Community License v1.1
              </p>
              <p><span className="text-pink-400">COPYRIGHT:</span> © 2026 EclipseSystems (Misiu LLC)</p>
              <p><span className="text-pink-400">STEWARD:</span> Maksym Huzun (noname@ecli.app)</p>
              <p className="mt-2">
                <span className="text-emerald-400">✓</span> Non-commercial use permitted
              </p>
              <p>
                <span className="text-red-400">✗</span> Commercial use reserved
              </p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* Quick Reference */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400"># Quick Reference</h2>
          
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {/* Permitted Uses */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                <h3 className="font-mono text-xl font-bold text-emerald-400">Permitted</h3>
              </div>
              <ul className="space-y-3 font-mono text-sm text-emerald-400/80">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>View, read & inspect source code</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>Use for personal/educational projects</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>Modify for non-commercial purposes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>Research & academic use</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>Create non-commercial derivative works</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">→</span>
                  <span>Share unmodified copies (non-commercial)</span>
                </li>
              </ul>
            </div>

            {/* Prohibited Uses */}
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <XCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                <h3 className="font-mono text-xl font-bold text-red-400">Prohibited</h3>
              </div>
              <ul className="space-y-3 font-mono text-sm text-red-400/80">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Commercial hosting or SaaS deployment</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Revenue-generating services</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Production business deployment</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Paid consulting with the software</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Redistribution for commercial purposes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-1">→</span>
                  <span>Removing attribution or license notices</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 sm:p-6 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-mono text-sm font-bold text-yellow-400 mb-2">Attribution Required</h4>
                <p className="font-mono text-xs text-yellow-400/70 leading-relaxed">
                  Any deployment must include visible attribution to <span className="text-yellow-300">EclipseSystems</span> and 
                  <span className="text-yellow-300"> Maksym Huzun</span>, with a link to the official repository. 
                  This applies to both frontend and backend interfaces.
                </p>
              </div>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* Full License Text */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400"># Full License Text</h2>
          
          <div className="rounded-lg border border-purple-500/20 bg-black/60 p-6 sm:p-8 backdrop-blur-sm font-mono text-xs sm:text-sm leading-relaxed text-purple-400/80 space-y-6 overflow-x-auto">
            <div>
              <h3 className="text-pink-400 font-bold text-base mb-3">EclipseSystems Community License v1.1</h3>
              <p className="text-purple-400/60">Copyright (c) 2026 EclipseSystems</p>
              <p className="text-purple-400/60">A project of Misiu LLC</p>
              <p className="text-purple-400/60">Authorized steward: Maksym Huzun (noname@ecli.app)</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">1. Definitions</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`"Software" means the source code, documentation, and other materials
provided in this repository.

"User" means any individual or organization accessing the Software.

"Non-Commercial Purpose" means any use that is not intended for or
directed toward commercial advantage, monetary compensation, or
revenue-generating activity.

"Commercial Purpose" means any use of the Software in a manner that
generates revenue, provides paid services, is used in a business
context, or is deployed in production environments.

"Authorized Stewards" means EclipseSystems under Misiu LLC and
individuals explicitly designated by Maksym Huzun.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">2. Grant of Rights</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Subject to the terms of this license, Users are granted a worldwide,
non-exclusive, royalty-free license to:

  (a) view, read, and inspect the Software;
  (b) use the Software for any Non-Commercial Purpose;
  (c) modify the Software for Non-Commercial Purposes; and
  (d) create and share Non-Commercial Derivative Works.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">3. Non-Commercial Use</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Non-profit organizations, educational institutions, researchers, and
individuals may use, modify, and run the Software for Non-Commercial
Purposes without restriction.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">4. Commercial Use Reserved</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`All rights to use, modify, host, deploy, sublicense, integrate, or
distribute the Software for Commercial Purposes are exclusively
reserved to:

  - EclipseSystems (a project under Misiu LLC), and
  - Maksym Huzun (noname@ecli.app)

No other User is granted any commercial rights under any circumstances.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">5. Redistribution</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Users may redistribute unmodified copies of the Software for
Non-Commercial Purposes only, provided that:

  (a) this license is included in full, and
  (b) no fee is charged beyond reasonable distribution costs.

Redistribution for Commercial Purposes is prohibited.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">6. Derivative Works</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Users may create, modify, and share Derivative Works for
Non-Commercial Purposes only. Any Derivative Work must:

  (a) include this license in full,
  (b) clearly state that it is a derivative of the original Software,
  (c) preserve all attribution notices required by Section 9.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">7. Hosting and Deployment Restrictions</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Users may not deploy, host, or make the Software (or any Derivative
Work) publicly accessible as a service, cloud offering, or production
system, except for Non-Commercial educational, research, or testing
demonstrations.

All commercial hosting and SaaS rights are exclusively reserved to
EclipseSystems and Maksym Huzun.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">8. License Preservation</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`This license and all copyright notices must be preserved in all copies,
forks, or Derivative Works, except where explicitly exempted for
Authorized Stewards.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">9. Attribution Requirement</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Any User deploying, running, or distributing the Software or any
Non-Commercial Derivative Work must preserve and display a visible
copyright and license notice that:

  (a) identifies EclipseSystems and/or Maksym Huzun as the copyright
      holders,
  (b) includes a reference or hyperlink directing back to the official
      EclipseSystems project repository, and
  (c) is reasonably accessible to end users in either the frontend
      user interface, backend administrative interface, or both.

This attribution requirement does not apply to EclipseSystems under
Misiu LLC or to Authorized Stewards designated by Maksym Huzun.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">10. Termination</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`Any violation of this license immediately and permanently terminates
all rights granted herein. Upon termination, the User must cease all
use and destroy all copies of the Software.`}</p>
            </div>

            <div>
              <h4 className="text-purple-300 font-bold mb-2">11. No Warranty</h4>
              <p className="text-purple-400/70 whitespace-pre-wrap">{`The Software is provided "as is," without warranty of any kind,
express or implied. In no event shall the copyright holders or
Authorized Stewards be liable for any claim, damages, or other
liability arising from the use of the Software.`}</p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* FAQ Section */}
        <section className="mb-8">
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400"># License FAQ</h2>
          <div className="space-y-4">
            {[
              {
                q: "Can I use this for my school project?",
                a: "Yes! Educational and academic use is fully permitted under this license."
              },
              {
                q: "Can I modify the code for personal learning?",
                a: "Absolutely. You can view, modify, and experiment with the code for non-commercial purposes."
              },
              {
                q: "Can I host this as a paid service?",
                a: "No. Commercial hosting, SaaS deployment, and revenue-generating services are reserved exclusively to EclipseSystems and Maksym Huzun."
              },
              {
                q: "What about open-source contributions?",
                a: "We welcome contributions! Please check our contributing guidelines on GitHub for details on how to contribute."
              },
              {
                q: "Can I use this for my startup/business?",
                a: "Not without explicit permission. All commercial use rights are reserved. Contact noname@ecli.app for commercial licensing inquiries."
              },
              {
                q: "What if I violate the license?",
                a: "Any violation immediately terminates your license. You must cease all use and destroy all copies of the software."
              },
            ].map((faq, i) => (
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
          <h2 className="mb-6 font-mono text-2xl sm:text-3xl font-bold text-purple-400"># Questions?</h2>
          
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 sm:p-8 backdrop-blur-sm text-center">
            <ShieldCheck className="h-12 w-12 sm:h-16 sm:w-16 text-purple-400 mx-auto mb-4" />
            <h3 className="font-mono text-lg sm:text-xl font-bold text-purple-400 mb-3">
              Need Commercial Access?
            </h3>
            <p className="font-mono text-sm text-purple-400/70 mb-6 max-w-2xl mx-auto">
              Interested in using EcliPanel or its assets for your business? We offer commercial licensing
              and enterprise support. Get in touch to discuss your needs and how we can help you leverage EcliPanel for your commercial projects.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="mailto:noname@ecli.app"
                className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono text-sm font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              >
                contact_commercial()
              </a>
              <a
                href="https://github.com/thenoname-gurl/EcliPanel"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-purple-500/30 px-6 py-2.5 font-mono text-sm font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
              >
                view_source()
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