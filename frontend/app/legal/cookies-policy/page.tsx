import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function CookiesPolicyPage() {
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
          { label: "Terms of Service", href: "/legal/terms-of-service" },
          { label: "Cookies Policy", href: "/legal/cookies-policy" },
          {
            label: "Email Policy",
            href: "/legal/email-policy",
          },
          {
            label: "Minimum Age",
            href: "/legal/minimum-age",
          },
        ]}
        customCTA={{ label: "Back", href: "/legal" }}
      />
      <div className="space-y-8 max-w-6xl mt-15">
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[6.5rem] leading-30 font-semibold tracking-tight text-foreground">
              Cookies Policy
            </p>
            <p className="text-sm leading-7 text-white/70 sm:text-base">
              Effective Date: April 13th, 2026.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Overview
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            EclipseSystems uses cookies and similar technologies to operate
            ecli.app, secure accounts, and improve service functionality.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Cookie Types
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>
              <strong>Essential cookies:</strong> Required for login,
              authentication, session management, and basic functionality.
            </li>
            <li>
              <strong>Performance cookies:</strong> Used to understand how
              visitors use our service and improve site performance.
            </li>
            <li>
              <strong>Functional cookies:</strong> Preserve preferences and
              support UI features.
            </li>
            <li>
              <strong>Analytics cookies:</strong> Help us understand usage
              patterns and improve our products.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Managing Cookies
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            You may control cookies using your browser settings. Disabling
            cookies may limit or prevent access to some features. Some cookies
            are required for security and cannot be disabled without affecting
            functionality.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Third-Party Cookies
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We may permit third parties to set cookies for analytics, security,
            or performance. Those providers operate under their own policies.
          </p>
        </section>
      </div>
    </main>
  );
}
