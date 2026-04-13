export default function DmcaCopyrightPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">DMCA Copyright Policy</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">DMCA Copyright Policy</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Effective Date: April 13th, 2026.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Overview</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">EclipseSystems under Misiu LLC. We respect copyright law and expect our users to do the same. This policy explains how to report claimed copyright infringement and how we respond.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Notice of Infringement</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">If you believe your copyrighted work has been used on EclipseSystems without permission, send a written notice to <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a> including:</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground pl-5 list-disc">
            <li>Your contact information.</li>
            <li>Identification of the copyrighted work.</li>
            <li>Location of the allegedly infringing material.</li>
            <li>A good-faith statement that use is unauthorized.</li>
            <li>A statement under penalty of perjury that the information is accurate.</li>
            <li>Your electronic or physical signature.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Counter-Notification</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">If you believe a notice was wrongfully submitted, send a counter-notification to <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a> including:</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground pl-5 list-disc">
            <li>Your contact information.</li>
            <li>Identification of the removed material and its location before removal.</li>
            <li>A statement under penalty of perjury that the material was removed by mistake.</li>
            <li>Consent to the jurisdiction of the appropriate court.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Response & Enforcement</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">We will review notices and may remove or disable access to material that appears to infringe. Repeat infringers may have accounts suspended or terminated.</p>
        </section>
      </div>
    </main>
  );
}
