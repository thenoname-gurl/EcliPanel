export default function AcceptableUsePolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Acceptable Use Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Acceptable Use Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Effective Date: April 13th, 2026.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Purpose</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">This Acceptable Use Policy applies to all customers, users, and visitors of ecli.app and describes prohibited activities when using EclipseSystems.</p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">EclipseSystems may use AI, machine learning, and other automated systems to identify fraud, prevent abuse, and safeguard platform stability and security.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Prohibited Activities</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Do not engage in illegal activity or violate applicable law.</li>
            <li>Do not distribute malware, ransomware, spyware, or other malicious software.</li>
            <li>Do not scan, probe, or attack networks or systems you do not own or control.</li>
            <li>Do not use the service for spam, phishing, fraud, unsolicited marketing, or abusive communications.</li>
            <li>Do not host, operate, or distribute VPN, proxy, anonymizing, obfuscation, or command-and-control services unless explicitly approved.</li>
            <li>Do not infringe intellectual property or privacy rights of third parties.</li>
            <li>Do not interfere with or disrupt EclipseSystems services, infrastructure, or other users.</li>
            <li>Do not bypass usage limits, security controls, or access restrictions.</li>
            <li>Do not use our systems for high-risk AI use cases that pose safety, legal, or regulatory risk without explicit approval.</li>
            <li>Do not misuse email or messaging channels for unsolicited, deceptive, or abusive communications.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Abuse Reporting</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Report suspected abuse to <a className="font-medium text-primary hover:text-primary/80" href="mailto:abuse@ecli.app">abuse@ecli.app</a>. You may also contact <a className="font-medium text-primary hover:text-primary/80" href="mailto:hi@ecli.app">hi@ecli.app</a> or <a className="font-medium text-primary hover:text-primary/80" href="mailto:support@ecli.app">support@ecli.app</a>.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Enforcement</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Mistakes or violations may result in warnings, suspension, termination, or legal action. EclipseSystems may remove content, suspend accounts, and refuse service at its discretion.</p>
        </section>
      </div>
    </main>
  );
}