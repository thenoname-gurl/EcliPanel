import Link from "next/link"
import { LifeBuoy, ArrowLeft, Info } from "lucide-react"

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <LifeBuoy className="h-4 w-4" /> Support & policies
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Help, support, and policy resources</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This page explains how support works in the panel, how to open tickets, and where to find legal and policy documents.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> Support channels</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>In-app tickets:</b> Open and manage support tickets from the dashboard. This is the primary channel for technical, billing, and account help.</li>
              <li><b>Email:</b> Use <a href="mailto:legal@ecli.app" className="font-medium text-primary hover:text-primary/80">legal@ecli.app</a> for legal or compliance questions if public contact is listed.</li>
              <li><b>Documentation:</b> Use the public <Link href="/docs" className="font-medium text-primary hover:text-primary/80">docs</Link> and <Link href="/legal" className="font-medium text-primary hover:text-primary/80">legal center</Link> for self-serve support.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">How to open a support ticket</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm leading-7 text-muted-foreground">
              <li>Log in to the dashboard.</li>
              <li>Go to the <b>Tickets</b> section.</li>
              <li>Click <b>New Ticket</b> and choose the category that matches your issue.</li>
              <li>Describe the problem clearly and include server IDs, error messages, and steps to reproduce it.</li>
              <li>Submit the ticket and check back for replies. You can continue the conversation inside the panel.</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">Tip: Attach screenshots or logs when possible to help support resolve the issue faster.</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Ticket lifecycle</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>Open:</b> Your issue is received and waiting for a response.</li>
              <li><b>Pending:</b> Support has replied and may be waiting on more info from you.</li>
              <li><b>Resolved/Closed:</b> The issue is completed. If the problem continues, reopen or create a new ticket.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Legal and policy references</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>Terms of Service:</b> Rules for use and responsibilities. See the legal center for the full terms.</li>
              <li><b>Privacy policy:</b> How your personal information is used and protected.</li>
              <li><b>Cookies policy:</b> Information about cookies and tracking.</li>
              <li><b>Acceptable use:</b> Rules for permitted and prohibited behavior on the platform.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Troubleshooting workflow</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>Read the docs:</b> Check the public documentation for the feature you are using.</li>
              <li><b>Search logs:</b> Use server console and log output to identify errors.</li>
              <li><b>Open a ticket:</b> If you cannot solve the issue, submit a ticket with details and include any file names or server IDs.</li>
              <li><b>Reply quickly:</b> Prompt replies help support resolve issues faster.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            For onboarding, see <Link href="/docs/getting-started" className="font-medium text-primary hover:text-primary/80">Getting started</Link>. For server control, visit <Link href="/docs/server-management" className="font-medium text-primary hover:text-primary/80">Server management</Link>.
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
