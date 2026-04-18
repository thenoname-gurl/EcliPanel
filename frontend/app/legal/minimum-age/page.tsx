import Link from "next/link";

type AgeRule = {
  country: string;
  minimumAge: number;
};

type AgePolicyResponse = {
  source: string;
  generatedAt: string;
  defaultMinimumAge: number;
  euUkMinimumAge: number;
  rules: AgeRule[];
};

async function getAgePolicy(): Promise<AgePolicyResponse | null> {
  try {
    const res = await fetch('/public/minimum-age', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function MinimumAgePage() {
  const data = await getAgePolicy();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              Minimum Age Policy
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Country Minimum Age Requirements</h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              Our registration age policy depends on your country. Below are the default rules and any configured country overrides.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border bg-background p-5">
              <p className="text-sm font-semibold text-foreground">Default minimum age</p>
              <p className="mt-2 text-3xl font-semibold text-primary">13 years</p>
            </div>
            <div className="rounded-3xl border border-border bg-background p-5">
              <p className="text-sm font-semibold text-foreground">EU / UK minimum age</p>
              <p className="mt-2 text-3xl font-semibold text-primary">14 years</p>
            </div>
            <div className="rounded-3xl border border-border bg-background p-5">
              <p className="text-sm font-semibold text-foreground">Parent registration invite</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Parents may invite children below the standard minimum age to register and link accounts with parental consent.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">How this works</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
            <p>We apply a base registration age of 13 years. A higher minimum of 14 years applies to the European Union and United Kingdom.</p>
            <p>Some countries may have higher custom minimums that override the base policy. These overrides are listed below when configured.</p>
            <p>If your country is not listed below, the default age rule applies.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold text-foreground">Country-specific overrides</h2>
          <div className="mt-4 overflow-x-auto">
            {data?.rules && data.rules.length > 0 ? (
              <table className="min-w-full divide-y divide-border text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Country</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Minimum age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rules.map((rule) => (
                    <tr key={rule.country}>
                      <td className="px-4 py-3 text-foreground capitalize">{rule.country}</td>
                      <td className="px-4 py-3 text-foreground">{rule.minimumAge} years</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm leading-7 text-muted-foreground">No custom country-specific minimum ages have been configured. The default age rule applies unless another jurisdiction requires a higher age.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            For the most current legal guidance, please review our <Link className="font-medium text-primary hover:text-primary/80" href="/legal/terms-of-service">Terms of Service</Link> and <Link className="font-medium text-primary hover:text-primary/80" href="/legal/privacy-policy">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}