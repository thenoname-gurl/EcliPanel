import Link from "next/link"
import { BookOpen, Sparkles, Server, LifeBuoy, Cpu, Rocket } from "lucide-react"

const TOPICS = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Create an account, log in, and use the panel step by step.",
    href: "/docs/getting-started",
    Icon: Sparkles,
  },
  {
    id: "server-management",
    title: "Server management",
    description: "Learn how to run servers, use the console, and manage files.",
    href: "/docs/server-management",
    Icon: Server,
  },
  {
    id: "support",
    title: "Support & policies",
    description: "Open tickets, find help, and read the legal resources.",
    href: "/docs/support",
    Icon: LifeBuoy,
  },
  {
    id: "kvm",
    title: "KVM & Linux beginner guide",
    description: "Use Debian 13 VMs in the panel and learn Linux basics.",
    href: "/docs/kvm",
    Icon: Cpu,
  },
  {
    id: "deploying-apps",
    title: "Deploying apps & games",
    description: "Available templates and the right workflow for your app.",
    href: "/docs/deploying-apps",
    Icon: Rocket,
  },
]

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              <BookOpen className="h-4 w-4" /> Documentation
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">EcliPanel public guide</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This document set explains the EcliPanel dashboard experience, including account setup, server creation, KVM hosting, app deployment, and support.
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
                className="group rounded-3xl border border-border bg-card p-6 transition hover:border-primary/40 hover:bg-secondary/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{topic.title}</p>
                    <p className="text-sm text-muted-foreground">{topic.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">What this docs center contains</h2>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              Use these pages to learn how the panel works, what each page does, and what you can do without logging in.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Account & security</p>
              <p className="mt-2 text-sm text-muted-foreground">Register, sign in, verify email, configure security, and manage notifications and appearance.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Servers & templates</p>
              <p className="mt-2 text-sm text-muted-foreground">Create servers, choose templates, use the console, manage files, configure startup commands, and monitor usage.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Linux & KVM</p>
              <p className="mt-2 text-sm text-muted-foreground">Run the Debian 13 VM, understand the KVM workflow, and learn basic Linux commands for your VM.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Support & policies</p>
              <p className="mt-2 text-sm text-muted-foreground">Open tickets, track responses, and read the legal center for terms, privacy, and acceptable use.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <h2 className="text-lg font-semibold text-foreground">How to use this guide</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Start with the page that matches your goal: onboarding, server control, deploying apps, or using the Debian 13 VM. Each page explains the exact panel screens and features to use.
          </p>
        </section>
      </div>
    </main>
  )
}
