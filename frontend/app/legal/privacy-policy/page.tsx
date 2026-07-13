import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </p>
            <p className="text-sm leading-7 text-white/70 sm:text-base">
              Last updated: July 13, 2026.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            1. Overview
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            This Privacy Policy explains how we collect, use, disclose, and
            protect your personal data when you use ecli.app and related
            services.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We do not knowingly collect personal information from children below
            the applicable minimum age.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Learn more about our age requirements on the{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="/legal/minimum-age"
            >
              Minimum Age Policy
            </a>{" "}
            page.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            2. Data We Collect
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>
              Account information: email, name, billing details, organization.
            </li>
            <li>
              Usage data: login times, actions, IP addresses, device/browser
              metadata.
            </li>
            <li>
              Telemetry data: anonymized interaction events (page views, button
              clicks, feature usage) collected through our first-party analytics
              system to understand how users navigate and use the service, so we
              can improve the user experience. No third-party analytics providers
              are used for this purpose.
            </li>
            <li>
              Cookies and tracking data for session management, security, and
              analytics.
            </li>
            <li>
              Support and communication records for contact through
              support@ecli.app, abuse@ecli.app, or legal@ecli.app.
            </li>
            <li>
              Email communication metadata and support correspondence, retained
              as needed for support, security, and compliance in accordance with
              our Email Policy.
            </li>
            <li>
              Identity verification data, when requested, for security, fraud
              prevention, or compliance.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            3. How We Use Data
          </h2>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <li>To provide, maintain, and improve the service.</li>
            <li>To authenticate and manage your account.</li>
            <li>
              To communicate about your account, updates, and support requests.
            </li>
            <li>
              To analyze usage patterns and interaction data (telemetry) in order
              to improve the user interface, fix usability issues, and guide
              product development.
            </li>
            <li>
              To detect, prevent, and respond to abuse or fraud, including using
              AI and automated systems to support security monitoring and abuse
              mitigation.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            4. Sharing Data
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We may share your data with service providers who help operate our
            service. We do not sell your personal data. Telemetry and analytics
            data is processed entirely within our own infrastructure and is not
            shared with third-party analytics vendors.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            5. Cookies
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We use cookies and similar technologies for session management,
            security, and analytics. See our{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="/legal/cookies-policy"
            >
              Cookies Policy
            </a>{" "}
            for details.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            6. Security
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We implement administrative, technical, and physical safeguards
            designed to protect your personal data.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            7. Retention
          </h2>
          <div className="mt-4 space-y-3 text-[16px] leading-7 text-white/70">
            <p>
              We retain personal data as long as needed to provide service,
              comply with legal obligations, resolve disputes, and enforce
              agreements.
            </p>
            <p>
              Account deletion requests are reviewed within approximately 14
              days. If approved, data removal from our systems and third-party
              processors may take up to 14 additional days.
            </p>
            <p>
              Some data is retained longer for legal, security, and operational
              reasons: up to 1 year for support, audit, and security logs, and
              up to 10 years for billing and financial records as required by
              law.
            </p>
            <p>
              We may decline deletion requests when the account owns active
              servers, if required legal profile information is missing, or if
              retention is necessary to comply with applicable law.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            8. Your Rights
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Depending on your jurisdiction, you may have rights to access,
            update, delete, or export your data. Contact{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>{" "}
            to exercise those rights.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            9. International Transfer
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Your data may be processed in jurisdictions outside your country. We
            take steps to protect your information in accordance with applicable
            law.
          </p>
        </section>
      </div>
    </main>
  );
}
