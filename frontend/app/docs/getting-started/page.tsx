import Link from "next/link"
import { Sparkles, ArrowLeft, Info, Shield, User, Palette, BadgeCheck, Activity, ClipboardList, Server, Rocket, CreditCard, LifeBuoy } from "lucide-react"

export default function GettingStartedPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> Getting started
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Your first steps with EcliPanel</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This guide walks you through onboarding, explains the key dashboard pages, and helps you deploy and manage your first server in EcliPanel.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> What is the dashboard?</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The dashboard is your central control panel. It contains your servers, support tickets, account settings, billing, activity history, and any workspace or portal tools available to you.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Servers</p>
              <p className="mt-2 text-sm text-muted-foreground">Create, manage, and monitor virtual servers. Use server cards to see status, resource usage, and quick actions.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Tickets</p>
              <p className="mt-2 text-sm text-muted-foreground">Open support tickets, track replies, and communicate with support from inside the panel.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Settings</p>
              <p className="mt-2 text-sm text-muted-foreground">Update your profile, security settings, notification preferences, and appearance options.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Billing & account</p>
              <p className="mt-2 text-sm text-muted-foreground">View invoices, manage payment methods, and review your plan limits if billing is enabled.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Step 1: Register or log in</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Visit the public <Link href="/register" className="font-medium text-primary hover:text-primary/80">register page</Link> to create an account. If you already have one, use <Link href="/login" className="font-medium text-primary hover:text-primary/80">login</Link>.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Step 2: Verify and secure your account</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-primary mt-1" /> <span><b>Verify your email:</b> Confirm your account by clicking the verification link sent to your email.</span></li>
              <li className="flex items-start gap-2"><BadgeCheck className="h-4 w-4 text-primary mt-1" /> <span><b>Enable passkeys or 2FA:</b> Use the security settings to add stronger access control whenever available.</span></li>
              <li className="flex items-start gap-2"><User className="h-4 w-4 text-primary mt-1" /> <span><b>Complete your profile:</b> Set your name, email, and other account details in <b>Settings → Profile</b>.</span></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Step 3: Explore the main dashboard pages</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li className="flex items-start gap-2"><Activity className="h-4 w-4 text-primary mt-1" /> <span><b>Servers:</b> The main server list shows all your active and stopped servers, usage rings, and quick action buttons.</span></li>
              <li className="flex items-start gap-2"><LifeBuoy className="h-4 w-4 text-primary mt-1" /> <span><b>Tickets:</b> Open support tickets, view replies, and check status from the Tickets page.</span></li>
              <li className="flex items-start gap-2"><Palette className="h-4 w-4 text-primary mt-1" /> <span><b>Settings:</b> Customize your theme, editor, notification preferences, locale, and security options.</span></li>
              <li className="flex items-start gap-2"><CreditCard className="h-4 w-4 text-primary mt-1" /> <span><b>Billing:</b> If available, manage subscriptions, payment methods, and invoices from the billing section.</span></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Step 4: Deploy your first server</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li className="flex items-start gap-2"><Server className="h-4 w-4 text-primary mt-1" /> <span><b>Create a server:</b> Go to <b>Servers</b>, click <b>New Server</b>, select a template, choose a node, and name your server.</span></li>
              <li className="flex items-start gap-2"><Activity className="h-4 w-4 text-primary mt-1" /> <span><b>Choose resources:</b> Assign CPU, RAM, disk, and any available allocations based on your plan.</span></li>
              <li className="flex items-start gap-2"><Rocket className="h-4 w-4 text-primary mt-1" /> <span><b>Deploy:</b> Click the deploy button to provision your server and wait for it to become ready.</span></li>
              <li className="flex items-start gap-2"><ClipboardList className="h-4 w-4 text-primary mt-1" /> <span><b>Manage:</b> Open the server card to use the console, files, startup settings, and more.</span></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Step 5: Use the in-app guide</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              If the guided tour is available, it will highlight key parts of the panel. You can restart it from <b>Settings → Guide</b> if you need a refresher.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <h2 className="text-lg font-semibold text-foreground">Next steps</h2>
          <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
            <li><b>Review server controls:</b> After deployment, learn power actions, startup settings, and file management in Server management.</li>
            <li><b>Learn template choices:</b> Use Deploying apps for the available visible templates and when to use the Debian 13 VM.</li>
            <li><b>Ask for help:</b> Visit Support & policies if you need ticket or legal guidance.</li>
          </ul>
        </section>

        <div className="flex justify-start">
          <Link href="/docs" className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary/60">
            <ArrowLeft className="h-4 w-4" /> Back to docs
          </Link>
        </div>
      </div>
    </main>
  )
}
