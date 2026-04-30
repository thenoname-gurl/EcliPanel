import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              Terms of Service
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Terms of Service</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              Effective Date: April 13th, 2026. These Terms govern your use of EclipseSystems, under Misiu LLC.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">1. General</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>EclipseSystems under Misiu LLC. Misiu LLC acts as a payment processor/fiscal sponsor; EclipseSystems is the primary operator and controller for customer data and service delivery.</li>
            <li>Our services include server hosting, web hosting, voice server hosting, reselling, and related technical and support services.</li>
            <li>These Terms apply to your use of ecli.app, related systems, and all products or services provided by EclipseSystems.</li>
            <li>We may use AI and automated systems to detect fraud, prevent abuse, and protect platform security.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">2. Service Level Agreement (SLA)</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <p>Some paid plans include SLA protections. For eligible paid services, EclipseSystems guarantees a minimum monthly uptime of 95%.</p>
            <p>Uptime is measured as: (total calendar month minutes minus verified unplanned downtime minutes) ÷ total calendar month minutes.</p>
            <p>Exclusions include scheduled maintenance, force majeure, customer actions, abuse mitigation, third-party outages, and network interruptions outside our control.</p>
            <p>Service credits are the exclusive remedy for SLA-eligible downtime except as required by law.</p>
            <p>Free products and free plans are excluded from the SLA.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">3. Registration & Eligibility</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Registration is required for certain services, and you must provide accurate information.</li>
            <li>Minimum age: 13 years, or 14 years in the European Union and United Kingdom. Country-specific age requirements may be higher.</li>
            <li>Children may register with a valid parent-issued registration invite. Parental consent, verification, and account linkage are required.</li>
            <li>We may request identity verification for security, fraud prevention, or compliance.</li>
            <li>We do not provide services to users in restricted jurisdictions. See <Link className="font-medium text-primary hover:text-primary/80" href="/geoblock">geoblocked countries and restrictions</Link> for details.</li>
            <li>For a full list of country-by-country minimum age requirements, see our <Link className="font-medium text-primary hover:text-primary/80" href="/legal/minimum-age">Minimum Age Policy</Link>.</li>
            <li>We may suspend or terminate accounts for suspected abuse, fraud, or legal non-compliance.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">4. Orders, Pricing & Payments</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>Fees are listed on our site or in your order and may change with notice where required by law.</li>
            <li>We use third-party payment processors, including Misiu LLC when acting as fiscal sponsor.</li>
            <li>Unauthorized chargebacks may result in fees, suspension, or legal action.</li>
            <li>Non-payment may result in service suspension or termination.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">5. Account Deletion Requests</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <p>We may refuse an account deletion request if your account currently owns active servers, if your profile is missing required legal information, or if deletion would prevent us from complying with applicable law.</p>
            <p>After you submit a deletion request, we will review and approve or reject it within approximately 14 days.</p>
            <p>If approved, we will complete deletion of your account and data from our systems and third-party processors within approximately 14 additional days.</p>
            <p>Certain records may remain longer where required by law or for legitimate business purposes, including audit, security, and tax requirements.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">6. Acceptable Use</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            You must not use EclipseSystems for illegal content, infringement, spam, DDoS attacks, prohibited mining, proxy or anonymizing services, or any activity that violates our Acceptable Use Policy. High-risk AI use and email communications are also subject to our separate AI Policy and Email Policy.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">7. Customer Content & Backups</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <li>You are responsible for all content uploaded to our services.</li>
            <li>We may access or process content as needed to provide, secure, troubleshoot, or back up services.</li>
            <li>Data retention is subject to our retention policy and legal obligations.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">8. Domains</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            We act as an intermediary for domain registrations and do not guarantee availability or freedom from third-party claims.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">9. Changes</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            We may update these Terms. Continued use after changes indicates acceptance.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            If you have questions, contact <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
