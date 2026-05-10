"use client";

import PixelBlast from "../_reacts-bits/PixelBlast";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function Hero() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen w-full relative bg-[#e594c7]">
      <div className="absolute inset-0 h-full z-0">
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#B85A96"
          patternScale={1.9}
          patternDensity={1.3}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={0.95}
          edgeFade={0.25}
          transparent
        />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center flex-col gap-4 px-6 py-20 text-center">
        <motion.h1
          className="text-white font-heading font-bold text-5xl sm:text-6xl md:text-7xl lg:text-[6.4rem] leading-tight lg:leading-none relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {t("hero.titleLine1")}
          <br />
          {t("hero.titleLine2")}
        </motion.h1>

        <motion.p
          className="text-white/70 font-inter font-medium text-base sm:text-lg md:text-xl lg:text-[22px] max-w-xs sm:max-w-md md:max-w-lg lg:max-w-148 leading-relaxed text-center relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.25 }}
          className="flex items-center gap-3 sm:gap-4 relative flex-wrap justify-center"
        >
          <Link href="/register">
            <button className="bg-white text-black px-5 sm:px-6 py-2 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200">
              {t("hero.cta")}
            </button>
          </Link>
          <Link href="#features">
            <button className="bg-white/40 px-5 sm:px-6 py-2 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200 text-white">
              {t("nav.features")}
            </button>
          </Link>
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-16 sm:h-20 lg:h-23 bg-gradient-to-b from-transparent to-[#0a0a0f] z-20" />
    </div>
  );
}
