export default function EmailPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Email Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Email Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Effective Date: April 13, 2026. This Email Policy defines how EclipseSystems handles email communications, reporting, and email-related compliance.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">1. Scope</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            This policy applies to all email communications between EclipseSystems and our users, customers, partners, and third parties. It also covers email-related systems and support channels used for reporting abuse, billing, and legal requests.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            EclipseSystems may also offer hosted email services similar to consumer email providers, enabling customers to send, receive, and manage email from ecli.app domain through our platform.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">2. Permitted Email Use</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Email may be used for account notifications, billing notices, support updates, legal notices, and security alerts.</li>
            <li>You may contact EclipseSystems using our official addresses for support, abuse reports, billing inquiries, and compliance questions.</li>
            <li>We may use email to communicate important policy changes, service updates, and security advisories.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">3. Prohibited Email Behavior</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Do not send spam, unsolicited marketing, phishing, or fraudulent email to EclipseSystems or through our services.</li>
            <li>Do not use our email addresses to distribute malware or to coordinate abusive activity.</li>
            <li>Do not attempt to spoof or impersonate EclipseSystems or our employees.</li>
            <li>Do not harvest, scrape, share, or misuse email addresses without consent.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">4. Email Security</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Do not send passwords, credit card numbers, or other sensitive data by email unless explicitly requested via a secure channel. EclipseSystems may retain email metadata and archives for support, fraud prevention, and legal compliance.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Official contact addresses include <a className="font-medium text-primary hover:text-primary/80" href="mailto:support@ecli.app">support@ecli.app</a>, <a className="font-medium text-primary hover:text-primary/80" href="mailto:abuse@ecli.app">abuse@ecli.app</a>, <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a>, and <a className="font-medium text-primary hover:text-primary/80" href="mailto:hi@ecli.app">hi@ecli.app</a>.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">5. Retention and Disclosure</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Email records, including metadata and correspondence, may be retained to resolve disputes, investigate abuse, comply with legal obligations, and support our business operations.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            We may disclose email records to law enforcement or other authorized parties when required by law or to protect the safety of our platform and users.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            For questions about email practices, contact <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}