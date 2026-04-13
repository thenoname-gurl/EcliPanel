export default function CookiesPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Cookies Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Cookies Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Effective Date: April 13th, 2026.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Overview</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">EclipseSystems uses cookies and similar technologies to operate ecli.app, secure accounts, and improve service functionality.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Cookie Types</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li><strong>Essential cookies:</strong> Required for login, authentication, session management, and basic functionality.</li>
            <li><strong>Performance cookies:</strong> Used to understand how visitors use our service and improve site performance.</li>
            <li><strong>Functional cookies:</strong> Preserve preferences and support UI features.</li>
            <li><strong>Analytics cookies:</strong> Help us understand usage patterns and improve our products.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Managing Cookies</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">You may control cookies using your browser settings. Disabling cookies may limit or prevent access to some features. Some cookies are required for security and cannot be disabled without affecting functionality.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Third-Party Cookies</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We may permit third parties to set cookies for analytics, security, or performance. Those providers operate under their own policies.</p>
        </section>
      </div>
    </main>
  );
}
