import { Menu } from "@/app/landing/_components/_custom/Menu";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";

export default function DmcaCopyrightPolicyPage() {
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
              DMCA Copyright Policy
            </p>
            <p className="text-[16px] leading-7 text-white/70 sm:text-base">
              Effective Date: April 13th, 2026.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold text-foreground">Overview</h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            EclipseSystems under Misiu LLC. We respect copyright law and expect
            our users to do the same. This policy explains how to report claimed
            copyright infringement and how we respond.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Notice of Infringement
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            If you believe your copyrighted work has been used on EclipseSystems
            without permission, send a written notice to{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>{" "}
            including:
          </p>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70 pl-5 list-disc">
            <li>Your contact information.</li>
            <li>Identification of the copyrighted work.</li>
            <li>Location of the allegedly infringing material.</li>
            <li>A good-faith statement that use is unauthorized.</li>
            <li>
              A statement under penalty of perjury that the information is
              accurate.
            </li>
            <li>Your electronic or physical signature.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Counter-Notification
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            If you believe a notice was wrongfully submitted, send a
            counter-notification to{" "}
            <a
              className="font-medium text-indigo-400 hover:text-primary/80"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>{" "}
            including:
          </p>
          <ul className="mt-4 space-y-3 text-[16px] leading-7 text-white/70 pl-5 list-disc">
            <li>Your contact information.</li>
            <li>
              Identification of the removed material and its location before
              removal.
            </li>
            <li>
              A statement under penalty of perjury that the material was removed
              by mistake.
            </li>
            <li>Consent to the jurisdiction of the appropriate court.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Response & Enforcement
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We will review notices and may remove or disable access to material
            that appears to infringe. Repeat infringers may have accounts
            suspended or terminated.
          </p>
        </section>
      </div>
    </main>
  );
}
