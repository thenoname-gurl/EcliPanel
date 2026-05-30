"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";

const OvhLogo = () => (
  <svg
    viewBox="0 0 307.6 47.2"
    className="h-8 sm:h-9 w-auto"
    fill="currentColor"
  >
    <path d="m73.1 2.7c7.9 14.2 6.4 31.8-3.7 44.5h-21.5l6.6-11.7h-8.7l10.3-18.1h8.8zm-42.3 44.5H8.9c-10.3-12.7-11.8-30.4-3.8-44.6l14.2 24.6 15.6-27.2h23l-27.1 47.2v0z" />
    <path d="m91.2 24.3c0-12.6 6.3-18.6 16.6-18.6 10.3 0 16.6 6.1 16.6 18.6 0 12.5-6.3 18.6-16.6 18.6-10.4 0-16.6-6.1-16.6-18.6zm3.7 0c0 10.4 4.7 15.3 12.8 15.3 8.1 0 12.8-4.9 12.8-15.3 0-10.4-4.7-15.3-12.8-15.3-8.1 0-12.8 4.9-12.8 15.3z" />
    <path d="m151.4 7.1c0.2-0.4 0.7-1.2 1.7-1.2 1 0 1.8 0.8 1.8 1.8 0 0.3-0.1 0.6-0.2 0.8l-12.4 32.8c-0.3 0.7-1 1.2-1.7 1.2-0.7 0-1.4-0.5-1.7-1.2l-12.4-32.8c-0.1-0.2-0.2-0.5-0.2-0.8 0-1 0.8-1.8 1.8-1.8 1 0 1.5 0.7 1.7 1.2l10.8 28.6z" />
    <path d="m162.4 25.5v15.3c0 1-0.8 1.8-1.8 1.8-1 0-1.8-0.8-1.8-1.8v-33c0-1 0.8-1.8 1.8-1.8 1 0 1.8 0.8 1.8 1.8v14.4h18.5V7.8c0-1 0.8-1.8 1.8-1.8 1 0 1.8 0.8 1.8 1.8v33c0 1-0.8 1.8-1.8 1.8-1 0-1.8-0.8-1.8-1.8V25.5Z" />
    <path d="m201.5 17.3c4.7 0 7.3 2.5 8.2 3.7 0.3 0.4 0.4 0.6 0.4 1 0 0.9-0.7 1.5-1.5 1.5-0.5 0-0.9-0.2-1.3-0.6-0.8-0.9-2.2-2.5-5.7-2.5-4.9 0-7.5 3.1-7.5 9.7 0 6.6 2.6 9.7 7.5 9.7 3.1 0 4.9-1.4 6.2-2.3 0.4-0.3 0.6-0.4 1-0.4 0.8 0 1.5 0.7 1.5 1.5 0 0.5-0.2 0.9-0.7 1.3-1.2 1-3.7 2.9-8 2.9-6.8 0-10.9-4.1-10.9-12.8 0-8.7 4-12.7 10.8-12.7z" />
    <path d="m218.5 6v30.3c0 2.1 0.7 3 2.1 3 0.8 0 1.6 0.7 1.6 1.6 0 0.9-0.7 1.6-1.6 1.6-3.6 0-5.5-2.1-5.5-6.2V6c0-0.9 0.8-1.7 1.7-1.7 0.9 0 1.7 0.8 1.7 1.7z" />
    <path d="m247.4 30c0 8.7-4.2 12.8-11.1 12.8-6.8 0-11.1-4.1-11.1-12.8 0-8.7 4.3-12.7 11.1-12.7 6.9 0 11.1 4 11.1 12.7zm-3.4 0c0-6.7-2.8-9.7-7.7-9.7-4.9 0-7.7 3-7.7 9.7 0 6.8 2.8 9.7 7.7 9.7 4.9 0 7.7-2.9 7.7-9.7z" />
    <path d="m255.6 19.3v13.9c0 3.5 1.1 6.4 6.5 6.4 5.4 0 6.5-3 6.5-6.4V19.3c0-1 0.8-1.7 1.8-1.7 0.9 0 1.6 0.7 1.6 1.7v13.9c0 5-1.6 9.7-9.9 9.7-8.2 0-9.9-4.6-9.9-9.7V19.3c0-1 0.7-1.7 1.7-1.7 0.9 0 1.7 0.7 1.7 1.7z" />
    <path d="M294.6 20.7V6c0-1 0.7-1.7 1.7-1.7 1 0 1.7 0.7 1.7 1.7v26.3c0 7-4.4 10.5-10.4 10.5-6.8 0-10.9-4.1-10.9-12.8 0-8.7 3.8-12.7 10.7-12.7 3.4 0 6 1.7 7.2 3.4zm0 4.3c0 0-2-4.7-7-4.7-4.8 0-7.5 3.1-7.5 9.7 0 6.6 2.6 9.7 7.5 9.7 4.1 0 7-2.3 7-7.4z" />
    <path d="m304.3 12.9c-0.4 0-0.9-0.1-1.3-0.3-0.4-0.2-0.7-0.4-1-0.7-0.3-0.3-0.5-0.7-0.7-1.1-0.2-0.4-0.3-0.9-0.3-1.4 0-0.5 0.1-1 0.3-1.4 0.2-0.4 0.4-0.8 0.7-1.1 0.3-0.3 0.6-0.5 1-0.7 0.4-0.2 0.8-0.3 1.3-0.3 0.4 0 0.9 0.1 1.3 0.3 0.4 0.2 0.7 0.4 1 0.7 0.3 0.3 0.5 0.7 0.7 1.1 0.2 0.4 0.3 0.9 0.3 1.4 0 0.5-0.1 1-0.3 1.4-0.2 0.4-0.4 0.8-0.7 1.1-0.3 0.3-0.6 0.5-1 0.7-0.5 0.2-0.9 0.3-1.3 0.3zm0-0.5c0.4 0 0.7-0.1 1.1-0.2 0.3-0.1 0.6-0.4 0.9-0.6 0.2-0.3 0.4-0.6 0.6-0.9 0.1-0.4 0.2-0.8 0.2-1.2 0-0.4-0.1-0.8-0.2-1.2-0.1-0.4-0.3-0.7-0.6-1-0.2-0.3-0.5-0.5-0.9-0.6-0.3-0.1-0.7-0.2-1.1-0.2-0.4 0-0.7 0.1-1.1 0.2-0.3 0.1-0.6 0.4-0.9 0.6-0.2 0.3-0.4 0.6-0.6 1-0.1 0.4-0.2 0.8-0.2 1.2 0 0.4 0.1 0.8 0.2 1.2 0.1 0.4 0.3 0.7 0.6 0.9 0.2 0.3 0.5 0.5 0.9 0.6 0.3 0.1 0.7 0.2 1.1 0.2zm-1.3-1.2V7.5h1.2c0.2 0 0.4 0 0.5 0.1 0.2 0 0.3 0.1 0.4 0.2 0.1 0.1 0.2 0.2 0.3 0.4 0.1 0.1 0.1 0.3 0.1 0.6 0 0.2-0.1 0.4-0.2 0.6-0.1 0.2-0.3 0.3-0.5 0.4l0.9 1.5h-0.7l-0.7-1.4h-0.8v1.4h-0.5zm0.6-1.8h0.5c0.3 0 0.5-0.1 0.7-0.2 0.2-0.1 0.3-0.3 0.3-0.5 0-0.2-0.1-0.4-0.2-0.5-0.1-0.1-0.4-0.2-0.7-0.2h-0.6z" />
  </svg>
);

export function DdosProtection() {
  const t = useTranslations("landing");

  return (
    <div
      id="ddos-protection"
      className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40"
    >
      <motion.h2
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center leading-tight"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {t("ddos.title")}
      </motion.h2>

      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-3 max-w-3xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        {t("ddos.subtitle")}
      </motion.p>

      <motion.div
        className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mt-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
      >
        <div className="flex items-center">
          <Image
            src="/assets/banners/pletx_dark_105_center.webp"
            alt="Pletx"
            width={105}
            height={40}
            className="h-8 sm:h-9 w-auto brightness-0 invert"
          />
        </div>

        <div className="flex items-center gap-2 text-white/80">
          <OvhLogo />
        </div>

        <div className="flex items-center text-white/80">
          <img
            src="/assets/banners/smartnet.svg"
            alt="SMARTNET"
            className="h-8 sm:h-9 w-auto brightness-0 invert"
          />
        </div>
      </motion.div>

      <motion.p
        className="text-center text-white/60 text-base sm:text-lg mt-10 max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
      >
        {t("ddos.description")}
      </motion.p>
    </div>
  );
}
