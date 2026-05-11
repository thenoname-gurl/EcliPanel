"use client";

import { motion } from "framer-motion";
import ShinyText from "../_reacts-bits/ShinyText";
import { useTranslations } from "next-intl";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
} as any;

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: "easeOut" },
  }),
} as any;

export function Footer() {
  const t = useTranslations("landing");

  const columns = [
    {
      title: t("footer.columns.product"),
      links: [
        { l: t("footer.links.features"), h: "#features" },
        { l: t("footer.links.pricing"), h: "#pricing" },
        { l: t("footer.links.network"), h: "#network" },
        { l: t("footer.links.status"), h: "/status" },
      ],
    },
    {
      title: t("footer.columns.developers"),
      links: [
        { l: t("footer.links.docs"), h: "/docs" },
        { l: t("footer.links.api"), h: "https://backend.ecli.app/openapi" },
        {
          l: t("footer.links.github"),
          h: "https://github.com/thenoname-gurl/EcliPanel",
        },
        { l: t("footer.links.changelog"), h: "/changelog" },
      ],
    },
    {
      title: t("footer.columns.legal"),
      links: [
        { l: t("footer.links.terms"), h: "/legal/terms-of-service" },
        { l: t("footer.links.privacy"), h: "/legal/privacy-policy" },
        { l: t("footer.links.cookies"), h: "/legal/cookies-policy" },
        { l: t("footer.links.acceptable"), h: "/legal/acceptable-use-policy" },
        { l: t("footer.links.imprint"), h: "/legal/imprint" },
      ],
    },
  ];

  return (
    <div className="flex flex-col mt-20 sm:mt-40 px-5 sm:px-8 lg:px-5 relative **:font-flink">
      <div className="flex flex-col sm:flex-row sm:justify-between gap-10 sm:gap-8 mb-16 sm:mb-32 lg:mb-55">
        <motion.div
          className="flex flex-col gap-3 max-w-xs"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={fadeUp}
          custom={0}
        >
          <div className="flex items-center gap-2">
            <img
              src="/assets/icons/logo.png"
              alt={t("brand")}
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <p className="text-white text-xl font-semibold">{t("brand")}</p>
          </div>
          <p className="text-white/60 text-sm leading-relaxed">
            {t("footer.tagline")}
          </p>
          <a
            href="mailto:contact@ecli.app"
            className="text-white/40 text-sm font-inter hover:text-white transition-colors duration-200 no-underline"
          >
            {t("footer.contact")}
          </a>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 lg:gap-20">
          {columns.map((col, colIdx) => (
            <motion.div
              key={col.title}
              className="flex flex-col min-w-0"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              custom={colIdx + 1}
            >
              <span className="h-px w-full bg-white/15 mb-5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-5">
                {col.title}
              </span>
              {col.links.map((item, itemIdx) => (
                <motion.a
                  key={item.l}
                  href={item.h}
                  className="flex items-center gap-2 text-white/60 text-[15px] sm:text-[16px] mb-2.5 hover:text-white transition-colors duration-200 no-underline"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  variants={fadeIn}
                  custom={colIdx * 0.3 + itemIdx + 2}
                  {...(item.h.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {item.l}
                </motion.a>
              ))}
            </motion.div>
          ))}
        </div>
      </div>

      <span className="text-[22vw] sm:text-[18vw] lg:text-[15vw] font-bold text-center absolute -bottom-7 z-2 right-[50%] translate-x-[50%] w-full overflow-hidden max-w-full">
        {/* <ShinyText
          text="EclipseSystems"
          speed={2}
          delay={0}
          color="transparent"
          shineColor="#2F2F2F"
          spread={120}
          direction="left"
          yoyo={false}
          pauseOnHover={false}
          disabled={false}
        /> */}
        <div className="absolute bottom-0 left-0 w-full h-50 bg-linear-to-b from-transparent to-[#0a0a0f] z-20" />
      </span>

      <motion.span
        className="h-px w-full bg-white/15 mt-4 relative z-100"
        initial={{ scaleX: 0, originX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />

      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 text-white/70 relative z-100 bg-[#0a0a0f] h-full py-8 sm:py-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex flex-col gap-1">
          <p className="text-xs sm:text-sm">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <p className="text-white/30 text-xs sm:text-sm">
            {t("footer.byline")}
          </p>
        </div>

        <ul className="flex gap-4 list-none flex-wrap">
          {[
            { l: t("footer.links.terms"), h: "/legal/terms-of-service" },
            { l: t("footer.links.privacy"), h: "/legal/privacy-policy" },
            { l: t("footer.links.cookies"), h: "/legal/cookies-policy" },
          ].map((item, i) => (
            <motion.li
              key={item.l}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35 + i * 0.07, duration: 0.35 }}
            >
              <a
                href={item.h}
                className="transition-all duration-200 hover:text-white text-base sm:text-[18px]"
              >
                {item.l}
              </a>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
