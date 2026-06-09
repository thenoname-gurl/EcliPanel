import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";
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
    const res = await fetch("/public/minimum-age", { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function MinimumAgePage() {
  const data = await getAgePolicy();

  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
      <Menu
        customMenu={[
          { label: "AI Policy", href: "/legal/ai-policy" },
          { label: "Privacy Policy", href: "/legal/privacy-policy" },
          { label: "Cookies Policy", href: "/legal/cookies-policy" },
          {
            label: "Email Policy",
            href: "/legal/email-policy",
          },
          {
            label: "Terms Of Service",
            href: "/legal/terms-of-service",
          },
        ]}
        customCTA={{ label: "Back", href: "/legal" }}
      />
      <div className="space-y-8 max-w-6xl mt-20">
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-none font-semibold tracking-tight text-foreground">
              Country Minimum Age Requirements
            </p>
            <p className="text-sm leading-7 text-white/70 sm:text-base">
              Our registration age policy depends on your country. Below are the
              default rules and any configured country overrides.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white/10 p-5">
              <p className="text-2xl font-semibold text-white/70">
                Default minimum age
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">13 years</p>
            </div>
            <div className="bg-white/10 p-5">
              <p className="text-2xl font-semibold text-white/70">
                EU / UK minimum age
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">14 years</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            How this works
          </h2>
          <div className="mt-1 text-[16px] leading-10 text-white/70">
            <p>
              We apply a base registration age of 13 years. A higher minimum of
              14 years applies to the European Union and United Kingdom.
            </p>
            <p>
              Some countries may have higher custom minimums that override the
              base policy. These overrides are listed below when configured.
            </p>
            <p>
              If your country is not listed below, the default age rule applies.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Country-specific overrides
          </h2>
          <div className="mt-1 text-[16px] leading-10 text-white/70">
            {data?.rules && data.rules.length > 0 ? (
              <table className="min-w-full divide-y divide-border text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Country
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Minimum age
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rules.map((rule) => (
                    <tr key={rule.country}>
                      <td className="px-4 py-3 text-foreground capitalize">
                        {rule.country}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {rule.minimumAge} years
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1 text-[16px] leading-10 text-white/70">
                No custom country-specific minimum ages have been configured.
                The default age rule applies unless another jurisdiction
                requires a higher age.
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-7 text-white/70">
            For the most current legal guidance, please review our{" "}
            <Link
              className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              href="/legal/terms-of-service"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              href="/legal/privacy-policy"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
