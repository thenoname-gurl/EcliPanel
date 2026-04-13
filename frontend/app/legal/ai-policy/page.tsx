export default function AiPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">AI Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">AI Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Effective Date: April 13, 2026. This policy governs the acceptable use of artificial intelligence, machine learning, and automation functionality provided through EclipseSystems.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">1. Scope</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            This policy applies to all AI-related services, tools, and workloads hosted, managed, or facilitated by EclipseSystems. It also applies to AI-generated content and AI-driven automation used through our platform.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">2. Our AI Use</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            EclipseSystems may use AI internally to support fraud detection, abuse prevention, security monitoring, and operational risk management. This includes automated analysis of behavior, account activity, and service usage to identify threats, prevent abuse, and improve platform safety.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            We also use AI to support customer service, incident response, and platform reliability, subject to applicable privacy and compliance requirements.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            AI-assisted support responses may be inaccurate or incomplete. For any financial, legal, or high-risk matter, users should treat AI guidance as preliminary and seek human review. Type <span className="font-semibold">ESCALATE</span> in a support ticket to request human handling of your issue.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">3. High-Risk AI Usage</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            High-risk AI use cases that may result in serious safety, legal, privacy, or regulatory harm are strictly controlled. Examples include automated decision-making for healthcare, finance, legal outcomes, biometric identification, remote surveillance, autonomous weapons, malware creation, and deception or impersonation systems.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Customers must obtain explicit written approval from EclipseSystems before using AI in high-risk or sensitive contexts.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">3. Permitted AI Use</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>AI use is permitted for development, experimentation, data analysis, and non-sensitive automation when conducted responsibly.</li>
            <li>Use of AI tools is permitted when it does not violate applicable law, intellectual property rights, privacy rights, or other platform policies.</li>
            <li>AI-generated content must be labeled and governed by our Acceptable Use Policy when it is redistributed or published.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">4. Prohibited AI Activities</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Do not use AI to create, distribute, or manage malware, ransomware, spyware, phishing, or other malicious content.</li>
            <li>Do not use AI for unauthorized surveillance, biometric profiling, or harvesting sensitive personal data without consent.</li>
            <li>Do not use AI to impersonate individuals, create deepfakes, or generate deceptive content intended to mislead or defraud.</li>
            <li>Do not use AI to make safety-critical or legally binding decisions without explicit approval.</li>
            <li>Do not use AI to violate export controls, sanctions, or other applicable restrictions on regulated technologies.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">5. Data and Privacy</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            AI workloads may process personal data, and such processing must comply with our Privacy Policy and all applicable data protection laws. Sensitive or regulated data should not be used in AI workloads without explicit authorization.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">6. Enforcement</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Violations of this AI Policy may result in suspension, termination, or legal action. EclipseSystems may disable AI workloads, revoke access, and remove AI-generated content if it violates this policy.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            Questions about AI usage or approval for high-risk AI projects should be sent to <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
