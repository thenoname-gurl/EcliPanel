"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/dist/client/link";

const PixelSnow = dynamic(() => import("./_react-bits/PixelSnow"), {
  ssr: false,
  loading: () => null,
});

export function Hero() {
  const t = useTranslations("contributorsPage");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const schedule = typeof requestIdleCallback !== "undefined"
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 3000 })
      : (cb: () => void) => setTimeout(cb, 2000);
    const id = schedule(() => setShow(true));
    return () => {
      if (typeof requestIdleCallback !== "undefined") cancelIdleCallback(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, []);

  return (
    <div className="relative">
      <div className="absolute inset-0 h-full z-0">
        {show && (
          <PixelSnow
            color="#e594c7"
            flakeSize={0.01}
            minFlakeSize={1.25}
            pixelResolution={200}
            speed={1.25}
            density={0.3}
            direction={125}
            brightness={1}
            depthFade={8}
            farPlane={20}
            gamma={0.4545}
            variant="snowflake"
          />
        )}
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.25 }}
          className="flex items-center gap-3 sm:gap-4 relative flex-wrap justify-center"
        >
          <Link
            href={"https://github.com/thenoname-gurl/EcliPanel/pulls"}
            target="_blank"
          >
            <button className="bg-white text-black px-5 sm:px-6 py-2 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200">
              {t("hero.joinCta")}
            </button>
          </Link>
          <Link href="https://github.com/thenoname-gurl/EcliPanel">
            <button className="bg-white/40 px-5 sm:px-6 py-2 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200 text-white">
              {t("hero.repoCta")}
            </button>
          </Link>
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-16 sm:h-20 lg:h-23 bg-linear-to-b from-transparent to-[#0a0a0f] z-20" />
    </div>
  );
}
