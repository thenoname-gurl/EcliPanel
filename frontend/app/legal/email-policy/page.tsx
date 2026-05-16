import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function EmailPolicyPage() {
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
              Email Policy
            </p>
            <p className="text-sm leading-7 text-white/70 sm:text-base">
              Effective Date: April 13, 2026. This Email Policy defines how
              EclipseSystems handles email communications, reporting, and
              email-related compliance.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-xl font-semibold text-foreground">1. Scope</h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            This policy applies to all email communications between
            EclipseSystems and our users, customers, partners, and third
            parties. It also covers email-related systems and support channels
            used for reporting abuse, billing, and legal requests.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            EclipseSystems may also offer hosted email services similar to
            consumer email providers, enabling customers to send, receive, and
            manage email from ecli.app domain through our platform.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-xl font-semibold text-foreground">
            2. Permitted Email Use
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>
              Email may be used for account notifications, billing notices,
              support updates, legal notices, and security alerts.
            </li>
            <li>
              You may contact EclipseSystems using our official addresses for
              support, abuse reports, billing inquiries, and compliance
              questions.
            </li>
            <li>
              We may use email to communicate important policy changes, service
              updates, and security advisories.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-xl font-semibold text-foreground">
            3. Prohibited Email Behavior
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>
              Do not send spam, unsolicited marketing, phishing, or fraudulent
              email to EclipseSystems or through our services.
            </li>
            <li>
              Do not use our email addresses to distribute malware or to
              coordinate abusive activity.
            </li>
            <li>
              Do not attempt to spoof or impersonate EclipseSystems or our
              employees.
            </li>
            <li>
              Do not harvest, scrape, share, or misuse email addresses without
              consent.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-xl font-semibold text-foreground">
            4. Email Security
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Do not send passwords, credit card numbers, or other sensitive data
            by email unless explicitly requested via a secure channel.
            EclipseSystems may retain email metadata and archives for support,
            fraud prevention, and legal compliance.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Official contact addresses include{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:support@ecli.app"
            >
              support@ecli.app
            </a>
            ,{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:abuse@ecli.app"
            >
              abuse@ecli.app
            </a>
            ,{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>
            , and{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:hi@ecli.app"
            >
              hi@ecli.app
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-xl font-semibold text-foreground">
            5. Retention and Disclosure
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Email records, including metadata and correspondence, may be
            retained to resolve disputes, investigate abuse, comply with legal
            obligations, and support our business operations.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We may disclose email records to law enforcement or other authorized
            parties when required by law or to protect the safety of our
            platform and users.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-7 text-white/70">
            For questions about email practices, contact{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
