import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function AcceptableUsePolicyPage() {
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
              Acceptable Use Policy
            </p>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              Effective Date: April 13th, 2026.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold text-foreground">Purpose</h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            This Acceptable Use Policy applies to all customers, users, and
            visitors of ecli.app and describes prohibited activities when using
            EclipseSystems.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            EclipseSystems may use AI, machine learning, and other automated
            systems to identify fraud, prevent abuse, and safeguard platform
            stability and security.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Prohibited Activities
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>
              Do not engage in illegal activity or violate applicable law.
            </li>
            <li>
              Do not distribute malware, ransomware, spyware, or other malicious
              software.
            </li>
            <li>
              Do not scan, probe, or attack networks or systems you do not own
              or control.
            </li>
            <li>
              Do not use the service for spam, phishing, fraud, unsolicited
              marketing, or abusive communications.
            </li>
            <li>
              Do not host, operate, or distribute VPN, proxy, anonymizing,
              obfuscation, or command-and-control services unless explicitly
              approved.
            </li>
            <li>
              Do not infringe intellectual property or privacy rights of third
              parties.
            </li>
            <li>
              Do not interfere with or disrupt EclipseSystems services,
              infrastructure, or other users.
            </li>
            <li>
              Do not bypass usage limits, security controls, or access
              restrictions.
            </li>
            <li>
              Do not use our systems for high-risk AI use cases that pose
              safety, legal, or regulatory risk without explicit approval.
            </li>
            <li>
              Do not misuse email or messaging channels for unsolicited,
              deceptive, or abusive communications.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Abuse Reporting
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Report suspected abuse to{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:abuse@ecli.app"
            >
              abuse@ecli.app
            </a>
            . You may also contact{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:hi@ecli.app"
            >
              hi@ecli.app
            </a>{" "}
            or{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:support@ecli.app"
            >
              support@ecli.app
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Enforcement
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Mistakes or violations may result in warnings, suspension,
            termination, or legal action. EclipseSystems may remove content,
            suspend accounts, and refuse service at its discretion.
          </p>
        </section>
      </div>
    </main>
  );
}
