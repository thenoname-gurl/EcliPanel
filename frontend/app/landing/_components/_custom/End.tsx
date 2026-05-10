"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function End() {
  const t = useTranslations("landing");

  return (
    <div className="my-12 sm:my-20 mt-20 sm:mt-40 mx-4 sm:mx-8 lg:mx-0 flex flex-col gap-6 relative overflow-hidden py-14 sm:py-20 px-6 rounded-2xl">
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 140% 100% at 50% 100%, #B85A96 0%, transparent 100%)",
        }}
        initial={{ opacity: 0, y: "100%" }}
        whileInView={{ opacity: 1, y: "0%" }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      />

      <motion.h2
        className="text-white font-flink font-bold text-4xl sm:text-5xl lg:text-[5rem] text-center leading-tight sm:leading-snug lg:leading-23 relative z-20"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
      >
        {t("finalCta.titleLine1")}
        <br />
        {t("finalCta.titleLine2")}
      </motion.h2>

      <motion.p
        className="text-white/60 text-center text-base sm:text-lg relative z-20"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
      >
        {t("finalCta.subtitle")}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
        className="flex items-center gap-3 sm:gap-4 justify-center flex-wrap relative z-40"
      >
        <Link href="/register">
          <button className="bg-white text-black px-5 sm:px-4 py-2 sm:py-1.5 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200">
            {t("finalCta.cta")}
          </button>
        </Link>
        <Link href="#features">
          <button className="bg-white/40 px-5 sm:px-4 py-2 sm:py-1.5 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200 text-white">
            {t("nav.features")}
          </button>
        </Link>
      </motion.div>

      <motion.p
        className="text-white/30 text-xs text-center relative z-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.65 }}
      >
        {t("finalCta.note")}
      </motion.p>

      <div className="absolute bottom-0 left-0 w-full h-20 sm:h-32 bg-linear-to-b from-transparent to-[#0a0a0f] z-20" />
    </div>
  );
}
