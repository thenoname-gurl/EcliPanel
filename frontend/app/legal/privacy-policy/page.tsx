export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Privacy Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Privacy Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Last updated: April 13, 2026.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">1. Overview</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">This Privacy Policy explains how we collect, use, disclose, and protect your personal data when you use ecli.app and related services.</p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We do not knowingly collect personal information from children below the applicable minimum age unless a valid parental registration invite is provided. If you are a parent or guardian registering a child, you may be asked to confirm parental consent.</p>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Learn more about our age requirements on the <a className="font-medium text-primary hover:text-primary/80" href="/legal/minimum-age">Minimum Age Policy</a> page.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">2. Data We Collect</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Account information: email, name, billing details, organization.</li>
            <li>Usage data: login times, actions, IP addresses, device/browser metadata.</li>
            <li>Cookies and tracking data for session management, security, and analytics.</li>
            <li>Support and communication records for contact through support@ecli.app, abuse@ecli.app, or legal@ecli.app.</li>
            <li>Email communication metadata and support correspondence, retained as needed for support, security, and compliance in accordance with our Email Policy.</li>
            <li>Identity verification data, when requested, for security, fraud prevention, or compliance.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">3. How We Use Data</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>To provide, maintain, and improve the service.</li>
            <li>To authenticate and manage your account.</li>
            <li>To communicate about your account, updates, and support requests.</li>
            <li>To detect, prevent, and respond to abuse or fraud, including using AI and automated systems to support security monitoring and abuse mitigation.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">4. Sharing Data</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We may share your data with service providers who help operate our service. We do not sell your personal data.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">5. Cookies</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We use cookies and similar technologies for session management, security, and analytics. See our <a className="font-medium text-primary hover:text-primary/80" href="/legal/cookies-policy">Cookies Policy</a> for details.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">6. Security</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We implement administrative, technical, and physical safeguards designed to protect your personal data.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">7. Retention</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <p>We retain personal data as long as needed to provide service, comply with legal obligations, resolve disputes, and enforce agreements.</p>
            <p>Account deletion requests are reviewed within approximately 14 days. If approved, data removal from our systems and third-party processors may take up to 14 additional days.</p>
            <p>Some data is retained longer for legal, security, and operational reasons: up to 1 year for support, audit, and security logs, and up to 10 years for billing and financial records as required by law.</p>
            <p>We may decline deletion requests when the account owns active servers, if required legal profile information is missing, or if retention is necessary to comply with applicable law.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">8. Your Rights</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Depending on your jurisdiction, you may have rights to access, update, delete, or export your data. Contact <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a> to exercise those rights.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">9. International Transfer</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Your data may be processed in jurisdictions outside your country. We take steps to protect your information in accordance with applicable law.</p>
        </section>
      </div>
    </main>
  );
}