import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function ImprintPage() {
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
              Imprint / Legal Notice
            </p>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              Last updated: April 13th, 2026, 10:30 PM CEST (Berlin Time).
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold text-foreground">Operator</h2>
          <p className="text-[16px] leading-7 text-white/70">
            EclipseSystems is a project under Misiu LLC, operated independently.
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            CEO & Founder: Maksym Huzun
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Email:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:noname@ecli.app"
            >
              noname@ecli.app
            </a>
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Phone: +1 (916) 739-9010
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">Websites</h2>
          <ul className="list-disc pl-5 text-[16px] leading-7 text-white/70">
            <li>
              https://eclipsesystems.top/ and all subdomains of
              eclipsesystems.top
            </li>
            <li>
              https://eclipsesystems.org/ and all subdomains of
              eclipsesystems.org
            </li>
            <li>
              https://summerhost.top/ and all subdomains of summerhost.top
            </li>
            <li>https://lumiweb.top/ and all subdomains of lumiweb.top</li>
            <li>https://ecli.app/ and all subdomains of ecli.app</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Operational contact
          </h2>
          <p className="text-[16px] leading-7 text-white/70">
            General support:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:support@ecli.app"
            >
              support@ecli.app
            </a>
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            General contact:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:contact@ecli.app"
            >
              contact@ecli.app
            </a>
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            WhatsApp:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="https://wa.me/19167399010"
            >
              https://wa.me/19167399010
            </a>
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Legal & privacy inquiries:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>{" "}
            (SLA applies)
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Abuse reporting:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:abuse@ecli.app"
            >
              abuse@ecli.app
            </a>{" "}
            (SLA applies)
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Data controller & payment processing
          </h2>
          <p className="text-[16px] leading-7 text-white/70">
            EclipseSystems is the primary data controller for personal
            information processed in connection with its services, platforms,
            and operations, except for payment-related data.
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Misiu LLC (Wyoming) acts as a fiscal sponsor/payment processor for
            payment transactions and processes payment-related data (payment
            tokens, transaction records, billing data) on behalf of
            EclipseSystems.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Fiscal sponsor / payment processor
          </h2>
          <p className="text-[16px] leading-7 text-white/70">Misiu LLC</p>
          <p className="text-[16px] leading-7 text-white/70">
            Principal office:
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            30 N Gould St Ste R
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Sheridan, WY 82801
          </p>
          <p className="text-[16px] leading-7 text-white/70">United States</p>
          <p className="text-[16px] leading-7 text-white/70">
            Representative (payment processing): Michal Pawski
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Tax ID (sponsor): 2025-001637147
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Jurisdiction & governing law
          </h2>
          <p className="text-[16px] leading-7 text-white/70">
            All operation of ecli.app are governed by applicable U.S. federal
            law and, to the extent applicable, the laws of the State of Wyoming.
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            For privacy and data processing details, see our Privacy Policy and
            Terms of Service.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-7 text-white/70">
            © 2025-2026 EclipseSystems, Part of Misiu LLC. All rights reserved.
          </p>
        </section>
      </div>
    </main>
  );
}
