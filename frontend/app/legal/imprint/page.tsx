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
              Last updated: June 25th, 2026, 10:10 PM CEST (Berlin Time).
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold text-foreground">Operator</h2>
          <p className="text-[16px] leading-7 text-white/70">
            EclipseSystems, operated under Misiu LLC
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Email:{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:legal@ecli.app"
            >
              legal@ecli.app
            </a>
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Registered Agent Address:
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            30 N Gould St Ste R
          </p>
          <p className="text-[16px] leading-7 text-white/70">
            Sheridan, WY 82801
          </p>
          <p className="text-[16px] leading-7 text-white/70">United States</p>
          <p className="text-[16px] leading-7 text-white/70">
            Tax ID: 2025-001637147
          </p>
        </section>
      </div>
    </main>
  );
}