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
    <div className="rounded-lg border border-purple-500/20 bg-black/60 p-4 font-mono text-sm backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <div className="h-3 w-3 rounded-full bg-yellow-500" />
        <div className="h-3 w-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-purple-400/60">Terminal</span>
      </div>
      {children}
    </div>
  )
}

function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("")
  const [showCursor, setShowCursor] = useState(true)
  
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [text])
  
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    return () => clearInterval(cursorInterval)
  }, [])
  
  return (
    <span>
      {displayed}
      <span className={showCursor ? "opacity-100" : "opacity-0"}>_</span>
    </span>
  )
}

export default function Home() {
  const [infra, setInfra] = useState<any | null>(null);

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
        <header className="mb-8 flex items-center justify-between border-b border-purple-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-8 w-8 object-contain" />
            </div>
            <span className="font-mono text-xl font-bold tracking-tight text-purple-400">
              Eclipse Systems
            </span>
          </div>
          <nav className="flex gap-6 font-mono text-sm text-purple-400/70">
            <Link href="#features" className="transition-colors hover:text-purple-300">[features]</Link>
            <Link href="#about" className="transition-colors hover:text-purple-300">[about]</Link>
            <Link href="#pricing" className="transition-colors hover:text-purple-300">[pricing]</Link>
            <Link href="#contact" className="transition-colors hover:text-purple-300">[contact]</Link>
          </nav>
        </header>

        <section className="mb-8 text-center">
          <h1 className="mb-4 font-mono text-6xl font-black tracking-tighter md:text-7xl">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              Eclipse Systems
            </span>
          </h1>
          <p className="mx-auto mb-6 max-w-xl font-mono text-lg text-purple-400/80">
            Deploy servers. Harden with bounties. <span className="text-pink-400">Own the edge.</span>
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/register" 
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              ./start --journey
            </Link>
            <Link 
              href="/login" 
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              sign_in()
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./start --journey</p>
              <p className="mt-2">
                <span className="text-pink-400">OBJECTIVE:</span> <TypingText text="CREATE. BUILD. DEPLOY." />
              </p>
              <p><span className="text-pink-400">DIFFICULTY:</span> EASY</p>
              <p>
                <span className="text-pink-400">STATUS:</span>{' '}
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
          <h2 className="mb-6 font-mono text-3xl font-bold text-purple-400"># What is this?</h2>
          <p className="mb-6 font-mono text-purple-400/60">
            If you are still confused about <span className="text-pink-400">ECLIPSE SYSTEMS</span> and what this is about:
          </p>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
              <h3 className="mb-4 font-mono text-xl font-bold text-purple-400"># Hosting Dream</h3>
              <p className="mb-4 font-mono text-sm text-purple-400/60">
                Spin up containers, game servers, web apps. Configure DNS, 2FA, scoped API keys.
                <br></br>
                Just in few clicks.
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">AIO Servers</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">Game Servers</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">Security Audits</li>
                <li className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2">Dynamic DNS Management</li>
              </ul>
            </div>
            
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
              <h3 className="mb-4 font-mono text-xl font-bold text-purple-400"># That Knows You</h3>
              <p className="mb-4 font-mono text-sm text-purple-400/60">
                We know what our costumers want and we provide that.
                <br></br>
                At one place, with ease.
              </p>
              <ul className="space-y-2 font-mono text-sm text-pink-400">
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">Scoped API Keys</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">Audit Logs & Metrics</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">Team Permissions</li>
                <li className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2">Easy Deployments</li>
              </ul>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section id="features" className="mb-8">
          <h2 className="mb-6 font-mono text-3xl font-bold text-purple-400"># Features</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "simple_panel()", text: "A minimal, fast panel built for smooth workflows and instant actions." },
              { title: "scoped_access()", text: "Roles, permissions, teams, and scoped API keys that work out of the box." },
              { title: "dynamic_dns()", text: "Integrated DNS management with direct UI controls and automation." },
              { title: "security_first()", text: "Threat detection and full audit history in one place." },
              { title: "own_nodes()", text: "Connect your own nodes or manage dedicated ones through a central API." },
              { title: "open_source()", text: "Open-source core for maximum transparency." },
            ].map((feature) => (
              <article
                key={feature.title}
                className="group rounded-lg border border-purple-500/20 bg-black/40 p-5 backdrop-blur-sm transition-all hover:border-purple-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              >
                <h4 className="mb-2 font-mono text-sm font-bold text-pink-400">{feature.title}</h4>
                <p className="font-mono text-xs text-purple-400/60">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section id="trusted" className="mb-8">
          <h2 className="mb-2 font-mono text-3xl font-bold text-purple-400"># Community</h2>
          <h3 className="mb-6 font-mono text-xl text-purple-400/80">Join the network</h3>
          
          <div className="mb-6 rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
            <p className="mb-4 font-mono text-purple-400/60">
              From indie studios to enterprise infrastructure - EclipseSystems powers production workloads everywhere.
            </p>
            <Link 
              href="/dashboard" 
              className="inline-block rounded border border-purple-500 bg-purple-500/10 px-4 py-2 font-mono text-sm text-purple-400 transition-all hover:bg-purple-500/20"
            >
              ./connect --dashboard
            </Link>
          </div>

          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./connect --community</p>
              <p className="mt-2"><span className="text-pink-400">INIT</span> handshake...</p>
              <p><span className="text-pink-400">RESOLVING:</span> eclipsesystems.org</p>
              <p>
                <span className="text-pink-400">STATUS:</span>{' '}
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
                <span className="text-pink-400">NODES:</span>{' '}
                <span className="text-purple-400">{infra ? new Intl.NumberFormat().format(infra.nodeCount) : '...'}</span>
              </p>
              <p className="mt-1 text-xs text-purple-400/60">
                <span className="text-emerald-400">{infra ? infra.online : '...'}</span> ONLINE • <span className="text-yellow-400">{infra ? infra.degraded : '...'}</span> DEGRADED • <span className="text-red-400">{infra ? infra.offline : '...'}</span> OFFLINE
              </p>
            </div>
          </TerminalBlock>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "DevOps Teams",
              "Startups",
              "Enterprise",
              "Gaming Communities",
            ].map((org) => (
              <div
                key={org}
                className="rounded border border-purple-500/20 bg-black/40 p-3 text-center font-mono text-sm text-purple-400/80 backdrop-blur-sm transition-all hover:border-purple-500/40"
              >
                {org}
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section id="about" className="mb-8">
          <h2 className="mb-2 font-mono text-3xl font-bold text-purple-400"># About</h2>
          <h3 className="mb-4 font-mono text-xl">
            Built by hosters, <span className="text-pink-400">for hosters.</span>
          </h3>
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
            <p className="font-mono text-sm leading-relaxed text-purple-400/60">
              EclipseSystems was created with a simple belief: hosting should feel effortless.
              <br></br>
              Our platform merges orchestration, security, and team operations into a single,
              elegant control plane. From game servers to enterprise workloads, Eclipse gives
              you the power to deploy, scale, and secure — without friction.
            </p>
          </div>
        </section>

        <BinaryStrip />

        <section id="pricing" className="mb-8">
          <h2 className="mb-2 font-mono text-3xl font-bold text-purple-400"># Portal Plans</h2>
          <p className="mb-6 font-mono text-purple-400/60">
            Choose the portal that fits your workflow. All portals include access to the dashboard.
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-5 backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-purple-400">free_portal</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">Perfect for newbies!</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">Free<span className="text-sm text-purple-400/50">/forever</span></p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>→ 1 Server</li>
                <li>→ 1 Port per server</li>
                <li>→ 1 vCore</li>
                <li>→ 1028 MB RAM</li>
                <li>→ 10240 MB Storage</li>
              </ul>
            </div>

            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-5 backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-purple-400">edu_portal</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">For students & small projects!</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">Free<span className="text-sm text-purple-400/50">/while student</span></p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>→ 3 Servers</li>
                <li>→ 3 Ports per server</li>
                <li>→ 2 vCores</li>
                <li>→ 2028 MB RAM</li>
                <li>→ 20240 MB Storage</li>
              </ul>
            </div>

            <div className="rounded-lg border border-pink-500/40 bg-pink-500/5 p-5 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-pink-400">paid_portal</h3>
              <p className="mt-1 font-mono text-xs text-pink-400/50">Small to medium projects!</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">$12<span className="text-sm text-pink-400/50">/mo</span></p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-pink-400/60">
                <li>→ 10 Servers</li>
                <li>→ 3 Ports per server</li>
                <li>→ 6 vCores</li>
                <li>→ 16028 MB RAM</li>
                <li>→ 50240 MB Storage</li>
                <li>→ Basic Support</li>
                <li>→ AI Access</li>
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-400/40 bg-purple-500/5 p-5 shadow-[0_0_30px_rgba(168,85,247,0.15)] backdrop-blur-sm">
              <h3 className="font-mono text-lg font-bold text-purple-300">enterprise</h3>
              <p className="mt-1 font-mono text-xs text-purple-400/50">Medium to large projects!</p>
              <p className="mt-3 font-mono text-2xl font-black text-white">Varies</p>
              <ul className="mt-4 space-y-1 font-mono text-xs text-purple-400/60">
                <li>→ Unmetered Servers</li>
                <li>→ Entire Node CPU</li>
                <li>→ Entire Node RAM</li>
                <li>→ Entire Node Storage</li>
                <li>→ IPv4 + IPv6</li>
                <li>→ Premium Support</li>
                <li>→ AI Access</li>
              </ul>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section className="mb-8">
          <h2 className="mb-6 font-mono text-3xl font-bold text-purple-400"># FAQs</h2>
          <div className="space-y-4">
            {[
              { q: "How do I get started?", a: "Sign up for a free portal account and deploy your first server in minutes. Our panel guides you through every step." },
              { q: "Can I connect my own nodes?", a: "YES! Eclipse supports connecting your own infrastructure. Enterprise plans include full node management." },
              { q: "What is included in support?", a: "Basic support includes email & community. Premium support includes priority response, dedicated channels, and direct engineering access." },
              { q: "Is Eclipse open source?", a: (
                <span>
                  The core panel is open-source for non-commercial purposes. Check our{' '}
                  <a href="https://github.com/thenoname-gurl/EcliPanel" className="text-pink-400 hover:underline">GitHub</a>{' '}
                  for more details!
                </span>
              ) },
            ].map((faq, i) => (
              <div key={i} className="rounded-lg border border-purple-500/20 bg-black/40 p-4 backdrop-blur-sm">
                <p className="font-mono text-sm font-bold text-pink-400">Q. {faq.q}</p>
                <p className="mt-2 font-mono text-xs text-purple-400/60">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        {/* CTA */}
        <section className="mb-8 text-center">
          <h2 className="mb-4 font-mono text-2xl font-bold text-purple-400"># Ready to deploy?</h2>
          <p className="mb-6 font-mono text-purple-400/60">
            Join thousands of teams using EclipseSystems to power their infrastructure.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/register" 
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              ./register --now
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
        <footer id="contact" className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-purple-400/50">
            Want a custom setup? Email{" "}
            <a href="mailto:contact@eclipsesystems.org" className="text-pink-400 hover:underline">
              contact@eclipsesystems.org
            </a>{" "}
            or go to{" "}
            <Link href="/dashboard" className="text-pink-400 hover:underline">
              Dashboard
            </Link>.
          </p>
        </footer>
      </div>
    </main>
  )
}
