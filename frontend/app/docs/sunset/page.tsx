import Link from "next/link"
import { ArrowLeft, Clock, Server, ShieldCheck } from "lucide-react"

export default function SunsetPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Clock className="h-4 w-4" /> Account & server sunset policy
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">How sunset policy works</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Sunset policies keep inactive accounts secure and prevent unused servers from running indefinitely. This page explains the
              account sunset flow and the server sunset flow, including the timelines and how to keep your services active.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Account sunset policy
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Account sunset policy applies to inactive accounts. If you do not log in for a long period, we send an inactivity notice
              and give you time to return before any account deletion happens.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Inactivity threshold</p>
              <p className="mt-2 text-sm text-muted-foreground">If you have not logged in for about 1 year, your account becomes eligible for an inactivity notice.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Grace period</p>
              <p className="mt-2 text-sm text-muted-foreground">After the notice, you have 90 days to log in before deletion is scheduled.</p>
            </div>
          </div>

          <div className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p><b>What keeps an account active?</b> Logging in to the dashboard clears the inactivity notice.</p>
            <p><b>What if you return later?</b> Logging in cancels the pending deletion request and restores the account state.</p>
            <p><b>Where is the confirmation link?</b> The email links directly to the login screen so you can sign in quickly.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" /> Server sunset policy (free & educational)
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Server sunset policy applies only to free and educational accounts with online servers. If a server stays online without
              recent account activity, we ask you to confirm usage.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">New accounts</p>
              <p className="mt-2 text-sm text-muted-foreground">If there is no activity yet, we send the first confirmation notice after about 24 hours of online time.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Ongoing activity</p>
              <p className="mt-2 text-sm text-muted-foreground">After you have used the panel, notices repeat about every 7 days if the servers stay online.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Grace window</p>
              <p className="mt-2 text-sm text-muted-foreground">Once a notice is sent, you have 24 hours to confirm before online servers are powered off.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">What counts as confirmation?</p>
              <p className="mt-2 text-sm text-muted-foreground">Any dashboard activity (not API keys) resets the timer and clears the notice.</p>
            </div>
          </div>

          <div className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p><b>Only online servers are affected.</b> Offline or hibernated servers are not targeted by sunset notices.</p>
            <p><b>Free and educational only.</b> Paid and enterprise accounts are excluded from server sunset policy.</p>
            <p><b>What happens after the grace window?</b> Online servers are powered off (kill action) until you log in again.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Admin-requested confirmation</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Administrators can trigger a manual confirmation request. This sends an email immediately and gives you a 48 hour grace
              period to confirm usage.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-background/80 p-6">
            <p className="text-sm font-semibold text-foreground">What should you do?</p>
            <p className="mt-2 text-sm text-muted-foreground">Log in to the dashboard within 48 hours to keep your server online.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            If you believe you received a sunset email in error, contact support from the dashboard or visit
            <Link href="/docs/support" className="font-medium text-primary hover:text-primary/80"> Support & policies</Link>.
          </p>
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