export default function ImprintPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Imprint / Legal Notice</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Imprint / Legal Notice</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">Last updated: March 14th, 2026, 6:00 PM CET (Berlin Time).</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Operator</h2>
          <p className="text-sm leading-7 text-muted-foreground">EclipseSystems is a project under Misiu LLC, operated independently.</p>
          <p className="text-sm leading-7 text-muted-foreground">CEO & Founder: Maksym Huzun</p>
          <p className="text-sm leading-7 text-muted-foreground">Email: <a className="font-medium text-primary hover:text-primary/80" href="mailto:noname@eclipsesystems.org">noname@eclipsesystems.org</a></p>
          <p className="text-sm leading-7 text-muted-foreground">Phone: +1 (916) 739-9010</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Websites</h2>
          <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
            <li>https://eclipsesystems.top/ and all subdomains of eclipsesystems.top</li>
            <li>https://eclipsesystems.org/ and all subdomains of eclipsesystems.org</li>
            <li>https://summerhost.top/ and all subdomains of summerhost.top</li>
            <li>https://lumiweb.top/ and all subdomains of lumiweb.top</li>
            <li>https://ecli.app/ and all subdomains of ecli.app</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Operational contact</h2>
          <p className="text-sm leading-7 text-muted-foreground">General support: <a className="font-medium text-primary hover:text-primary/80" href="mailto:support@eclipsesystems.org">support@eclipsesystems.org</a></p>
          <p className="text-sm leading-7 text-muted-foreground">General contact: <a className="font-medium text-primary hover:text-primary/80" href="mailto:contact@eclipsesystems.org">contact@eclipsesystems.org</a></p>
          <p className="text-sm leading-7 text-muted-foreground">WhatsApp: <a className="font-medium text-primary hover:text-primary/80" href="https://wa.me/19167399010">https://wa.me/19167399010</a></p>
          <p className="text-sm leading-7 text-muted-foreground">Legal & privacy inquiries: <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@eclipsesystems.org">legal@eclipsesystems.org</a> (SLA applies)</p>
          <p className="text-sm leading-7 text-muted-foreground">Abuse reporting: <a className="font-medium text-primary hover:text-primary/80" href="mailto:abuse@eclipsesystems.org">abuse@eclipsesystems.org</a> (SLA applies)</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Data controller & payment processing</h2>
          <p className="text-sm leading-7 text-muted-foreground">EclipseSystems is the primary data controller for personal information processed in connection with its services, platforms, and operations, except for payment-related data.</p>
          <p className="text-sm leading-7 text-muted-foreground">Misiu LLC (Wyoming) acts as a fiscal sponsor/payment processor for payment transactions and processes payment-related data (payment tokens, transaction records, billing data) on behalf of EclipseSystems.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Fiscal sponsor / payment processor</h2>
          <p className="text-sm leading-7 text-muted-foreground">Misiu LLC</p>
          <p className="text-sm leading-7 text-muted-foreground">Principal office:</p>
          <p className="text-sm leading-7 text-muted-foreground">30 N Gould St Ste R</p>
          <p className="text-sm leading-7 text-muted-foreground">Sheridan, WY 82801</p>
          <p className="text-sm leading-7 text-muted-foreground">United States</p>
          <p className="text-sm leading-7 text-muted-foreground">Representative (payment processing): Michal Pawski</p>
          <p className="text-sm leading-7 text-muted-foreground">Tax ID (sponsor): 2025-001637147</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Jurisdiction & governing law</h2>
          <p className="text-sm leading-7 text-muted-foreground">All operation of ecli.app are governed by applicable U.S. federal law and, to the extent applicable, the laws of the State of Wyoming.</p>
          <p className="text-sm leading-7 text-muted-foreground">For privacy and data processing details, see our Privacy Policy and Terms of Service.</p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm leading-7 text-muted-foreground">© 2025-2026 EclipseSystems, Part of Misiu LLC. All rights reserved.</p>
        </section>
      </div>
    </main>
  );
}
