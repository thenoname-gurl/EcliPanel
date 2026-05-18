import Link from "next/link"
import { BookOpen, Sparkles, Server, LifeBuoy, Cpu, Rocket, Clock } from "lucide-react"
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur"
import { Menu } from "@/app/landing/_components/_custom/Menu"

const TOPICS = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Create an account, verify your email, secure it with 2FA, and deploy your first server in under 10 minutes.",
    href: "/docs/getting-started",
    Icon: Sparkles,
  },
  {
    id: "server-management",
    title: "Server management",
    description: "Console access, file management, databases, port forwarding, power controls, and troubleshooting guides.",
    href: "/docs/server-management",
    Icon: Server,
  },
  {
    id: "kvm",
    title: "KVM & Linux beginner guide",
    description: "Deploy the Debian 13 VM, set up SSH, harden security, configure the firewall, and learn essential Linux commands.",
    href: "/docs/kvm",
    Icon: Cpu,
  },
  {
    id: "deploying-apps",
    title: "Deploying apps & games",
    description: "Every available template explained, how to choose the right one, and step-by-step deployment workflows.",
    href: "/docs/deploying-apps",
    Icon: Rocket,
  },
  {
    id: "sunset",
    title: "Sunset policy",
    description: "How inactivity notices work, grace periods, what happens to idle accounts and servers, and how to stay active.",
    href: "/docs/sunset",
    Icon: Clock,
  },
  {
    id: "support",
    title: "Support & policies",
    description: "Open tickets, track responses, and access the full legal center for terms, privacy, and acceptable use.",
    href: "/docs/support",
    Icon: LifeBuoy,
  },
]

export default function DocsPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
      <Menu
        customMenu={[
          { label: "Getting Started", href: "/docs/getting-started" },
          { label: "Server Management", href: "/docs/server-management" },
          { label: "KVM Guide", href: "/docs/kvm" },
          { label: "Deploying Apps", href: "/docs/deploying-apps" },
          { label: "Sunset Policy", href: "/docs/sunset" },
          { label: "Support", href: "/docs/support" },
        ]}
        customCTA={{ label: "Home", href: "/" }}
      />
      <div className="space-y-8 max-w-6xl mt-20">
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              EcliPanel documentation
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              Learn how to set up your account, deploy servers, manage resources, and get help. Each guide walks you through the exact screens and features in the panel — from your first login to running production workloads.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {TOPICS.map((topic) => {
            const Icon = topic.Icon
            return (
              <Link
                key={topic.id}
                href={topic.href}
                className="group bg-white/10 hover:bg-white/15 p-6 transition hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-foreground">
                      {topic.title}
                    </p>
                    <p className="text-[16px] leading-7 text-white/70">
                      {topic.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            What this docs center contains
          </h2>
          <p className="mt-3 text-[16px] leading-7 text-white/70">
            Use these pages to learn how the panel works, what each page does, and what you can do without logging in.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Account & security</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Register, sign in, verify email, enable 2FA or passkeys, configure notifications, and customize your theme and appearance.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Servers & templates</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Create servers, choose templates, use the console, manage files, configure startup commands, set up databases, and monitor resource usage.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Linux & KVM</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Deploy the Debian 13 VM, set up SSH key authentication, harden your server with UFW, manage services with systemd, and learn essential Linux commands.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Sunset policy</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">How inactivity notices work for accounts and servers, grace periods, what triggers sunset actions, and how to keep your services active.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Support & policies</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Open support tickets, track conversations, and access the legal center for terms of service, privacy policy, acceptable use, and more.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            How to use this guide
          </h2>
          <p className="mt-3 text-[16px] leading-7 text-white/70">
            Start with the page that matches your goal. If you are new to the panel, begin with Getting Started. If you already have a server running, jump to Server Management or the KVM Guide. Each page explains the exact panel screens and features you will use.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Legal documents
          </h2>
          <p className="mt-3 text-[16px] leading-7 text-white/70">
            For the full terms of service, privacy policy, acceptable use policy, and other legal documents, visit the <Link href="/legal" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Legal Center</Link>. These documents define your rights and responsibilities as a user of EcliPanel.
          </p>
        </section>
      </div>
    </main>
  )
}
