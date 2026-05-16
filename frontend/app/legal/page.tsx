import type { ElementType } from "react";
import Link from "next/link";
import {
  FileText,
  Shield,
  Lock,
  Globe2,
  BookOpen,
  Cpu,
  Mail,
} from "lucide-react";
import { LEGAL_DOCUMENTS } from "@/lib/legal-docs";
import GradualBlurMemo from "../landing/_components/_reacts-bits/GradualBlur";
import { Menu } from "../landing/_components/_custom/Menu";

const ICONS: Record<string, ElementType> = {
  "terms-of-service": FileText,
  "privacy-policy": Shield,
  "acceptable-use-policy": Lock,
  "ai-policy": Cpu,
  "email-policy": Mail,
  "minimum-age": Globe2,
  "cookies-policy": Globe2,
  "dmca-copyright-policy": BookOpen,
  imprint: FileText,
};

export default function LegalIndexPage() {
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
            label: "Minimum Age",
            href: "/legal/minimum-age",
          },
        ]}
        customCTA={{ label: "Home", href: "/" }}
      />
      <div className="space-y-8 max-w-6xl mt-20">
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              EclipseSystems legal center
            </p>
            <p className="max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
              Access our current terms, policies, and compliance notices. These
              documents explain how we collect data, protect your privacy,
              enforce acceptable use, and handle restricted jurisdictions.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {LEGAL_DOCUMENTS.map((doc) => {
            const Icon = ICONS[doc.id] || FileText;
            return (
              <Link
                key={doc.href}
                href={doc.href}
                className="group bg-white/10 hover:bg-white/15 p-6 transition hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  {/* <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <Icon className="h-5 w-5" />
                  </span> */}
                  <div>
                    <p className="text-2xl font-semibold text-foreground">
                      {doc.title}
                    </p>
                    <p className="text-[16px] leading-7 text-white/70">
                      View the full document and compliance details.
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold text-foreground">
            Need more detail?
          </h2>
          <p className="mt-3 text-[16px] leading-7 text-white/70">
            If you have questions about these policies or need specific
            compliance information, contact us at{" "}
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
