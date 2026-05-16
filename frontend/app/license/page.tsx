"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Menu } from "../landing/_components/_custom/Menu";
import GradualBlurMemo from "../landing/_components/_reacts-bits/GradualBlur";

function BinaryStrip() {
  const [binary, setBinary] = useState("");

  useEffect(() => {
    const chars = "01";
    let str = "";

    for (let i = 0; i < 200; i++) {
      str += chars[Math.floor(Math.random() * chars.length)];
    }

    setBinary(str);
  }, []);

  return (
    <div className="overflow-hidden py-3 sm:py-4 text-[8px] sm:text-[10px] font-mono text-white/20 select-none break-all leading-relaxed">
      {binary}
    </div>
  );
}

export default function LicensePage() {
  const t = useTranslations("license");

  const fullLicenseSections = [
    {
      title: t("full.sections.definitions.title"),
      body: t("full.sections.definitions.body"),
    },
    {
      title: t("full.sections.grant.title"),
      body: t("full.sections.grant.body"),
    },
    {
      title: t("full.sections.nonCommercial.title"),
      body: t("full.sections.nonCommercial.body"),
    },
    {
      title: t("full.sections.commercialReserved.title"),
      body: t("full.sections.commercialReserved.body"),
    },
    {
      title: t("full.sections.redistribution.title"),
      body: t("full.sections.redistribution.body"),
    },
    {
      title: t("full.sections.derivative.title"),
      body: t("full.sections.derivative.body"),
    },
    {
      title: t("full.sections.hosting.title"),
      body: t("full.sections.hosting.body"),
    },
    {
      title: t("full.sections.preservation.title"),
      body: t("full.sections.preservation.body"),
    },
    {
      title: t("full.sections.attribution.title"),
      body: t("full.sections.attribution.body"),
    },
    {
      title: t("full.sections.termination.title"),
      body: t("full.sections.termination.body"),
    },
    {
      title: t("full.sections.noWarranty.title"),
      body: t("full.sections.noWarranty.body"),
    },
  ];

  const faqEntries = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
  ];

  return (
    <main className="relative flex w-full justify-center overflow-hidden bg-black px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
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

      <Menu customCTA={{ label: "Home", href: "/" }} />

      <div className="relative z-10 mt-35 sm:mt-25 w-full max-w-6xl space-y-8 sm:space-y-10">
        <section className="text-center">
          <div>
            <p className="text-[2.8rem] leading-none font-semibold tracking-tight text-white sm:text-[4.5rem] md:text-[5.5rem] lg:text-[6.5rem]">
              {t("hero.title")}
            </p>

            <p className="mt-4 text-xs text-white/60 sm:text-sm md:text-base">
              Last updated: April 13, 2026.
            </p>
          </div>

          <p className="mx-auto mt-6 max-w-3xl px-2 font-mono text-sm leading-relaxed text-white/70 sm:text-base">
            {t("hero.line1Prefix")}{" "}
            <span className="text-indigo-400">{t("hero.line1Highlight")}</span>{" "}
            {t("hero.line1Suffix")}
            <br className="hidden md:block" />
            {t("hero.line2Prefix")}{" "}
            <span className="text-[#B85A96]">{t("hero.line2Highlight")}</span>.
          </p>

          <p className="mx-auto mt-6 max-w-3xl bg-white/10 px-4 py-3 font-mono text-sm leading-relaxed text-white sm:text-base">
            {t("translationNote")}
          </p>
        </section>

        <section className="font-mono">
          <div className="overflow-x-auto bg-white/10 p-4 sm:p-6">
            <p className="text-xs text-gray-500 sm:text-sm">
              eclipse@systems ~ % cat LICENSE.md
            </p>

            <div className="mt-3 space-y-1 text-sm sm:text-base">
              <p className="text-white/70">
                <span className="text-white">{t("terminal.licenseLabel")}</span>{" "}
                {t("terminal.licenseValue")}
              </p>

              <p className="text-white/70">
                <span className="text-white">
                  {t("terminal.copyrightLabel")}
                </span>{" "}
                {t("terminal.copyrightValue")}
              </p>

              <p className="text-white/70">
                <span className="text-white">{t("terminal.stewardLabel")}</span>{" "}
                {t("terminal.stewardValue")}
              </p>

              <p className="pt-2 text-emerald-400">✓ {t("terminal.allowed")}</p>

              <p className="text-white/70">✗ {t("terminal.forbidden")}</p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section>
          <h2 className="mb-6 text-2xl font-bold sm:text-3xl">
            {t("quick.title")}
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="bg-white/5 p-5 sm:p-6">
              <h3 className="mb-4 text-xl font-bold">
                {t("quick.permittedTitle")}
              </h3>

              <ul className="space-y-3 font-mono text-sm leading-relaxed text-white/70 sm:text-base">
                {[
                  t("quick.permitted1"),
                  t("quick.permitted2"),
                  t("quick.permitted3"),
                  t("quick.permitted4"),
                  t("quick.permitted5"),
                  t("quick.permitted6"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 shrink-0">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white/5 p-5 sm:p-6">
              <h3 className="mb-4 text-xl font-bold">
                {t("quick.prohibitedTitle")}
              </h3>

              <ul className="space-y-3 font-mono text-sm leading-relaxed text-white/70 sm:text-base">
                {[
                  t("quick.prohibited1"),
                  t("quick.prohibited2"),
                  t("quick.prohibited3"),
                  t("quick.prohibited4"),
                  t("quick.prohibited5"),
                  t("quick.prohibited6"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 shrink-0">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-white/5 p-5 sm:p-6">
            <h4 className="text-lg font-bold sm:text-xl">
              {t("quick.attributionTitle")}
            </h4>

            <p className="mt-4 font-mono text-sm leading-relaxed text-white/70 sm:text-base">
              {t("quick.attributionPrefix")}{" "}
              <span className="text-indigo-400">
                {t("quick.attributionName1")}
              </span>{" "}
              {t("quick.attributionAnd")}
              <span className="text-indigo-400">
                {" "}
                {t("quick.attributionName2")}
              </span>
              , {t("quick.attributionSuffix")}
            </p>
          </div>
        </section>

        <BinaryStrip />

        <section>
          <h2 className="mb-6 text-2xl font-bold sm:text-3xl">
            {t("full.title")}
          </h2>

          <div className="space-y-8 overflow-x-auto bg-white/5 p-5 font-mono text-sm leading-relaxed sm:p-8 sm:text-base">
            <div>
              <h3 className="mb-3 text-lg font-bold sm:text-xl">
                {t("full.docTitle")}
              </h3>

              <div className="space-y-2 text-white/70">
                <p>{t("full.docLine1")}</p>
                <p>{t("full.docLine2")}</p>
                <p>{t("full.docLine3")}</p>
              </div>
            </div>

            {fullLicenseSections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-3 text-lg font-bold text-white sm:text-xl">
                  {section.title}
                </h4>

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/70 sm:text-base">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section>
          <h2 className="mb-6 text-2xl font-bold sm:text-3xl">
            {t("faq.title")}
          </h2>

          <div className="space-y-4">
            {faqEntries.map((faq, i) => (
              <div key={i} className="bg-white/5 p-4 sm:p-5">
                <p className="mb-3 font-mono text-lg font-bold text-white sm:text-xl">
                  Q. {faq.q}
                </p>

                <p className="font-mono text-sm leading-relaxed text-white/70 sm:text-base">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section>
          <h2 className="mb-6 font-mono text-2xl font-bold sm:text-3xl">
            {t("contact.title")}
          </h2>

          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-5 text-center backdrop-blur-sm sm:p-8">
            <h3 className="mb-3 font-mono text-xl font-bold sm:text-2xl">
              {t("contact.heading")}
            </h3>

            <p className="mx-auto mb-6 max-w-2xl font-mono text-sm leading-relaxed text-white/70 sm:text-base">
              {t("contact.body")}
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="mailto:noname@ecli.app"
                className="w-full rounded bg-white px-6 py-3 text-center font-mono text-sm font-semibold text-black transition-all hover:bg-white/70 sm:w-auto"
              >
                {t("contact.contactCommercial")}
              </a>

              <a
                href="https://github.com/thenoname-gurl/EcliPanel"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded border border-white/20 px-6 py-3 text-center font-mono text-sm font-semibold text-white transition-all hover:bg-white/70 hover:text-black sm:w-auto"
              >
                {t("contact.viewSource")}
              </a>
            </div>
          </div>
        </section>

        <BinaryStrip />
      </div>
    </main>
  );
}
