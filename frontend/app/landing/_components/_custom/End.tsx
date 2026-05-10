"use client";

import { motion } from "framer-motion";

export function End() {
  return (
    <div className="my-12 sm:my-20 mt-20 sm:mt-40 mx-4 sm:mx-8 lg:mx-0 flex flex-col gap-6 relative overflow-hidden py-14 sm:py-20 px-6 rounded-2xl">
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 140% 100% at 50% 100%, #7e87ff33 0%, transparent 100%)",
        }}
        initial={{ opacity: 0, y: "100%" }}
        whileInView={{ opacity: 1, y: "0%" }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      />

      <motion.p
        className="text-white font-flink font-bold text-4xl sm:text-5xl lg:text-[5rem] text-center leading-tight sm:leading-snug lg:leading-23 relative z-20"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
      >
        Deploy bold. <br />
        Launch fast.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
        className="flex items-center gap-3 sm:gap-4 justify-center flex-wrap relative z-40"
      >
        <button className="bg-white px-5 sm:px-4 py-2 sm:py-1.5 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200">
          Start for free
        </button>
        <button className="bg-white/40 px-5 sm:px-4 py-2 sm:py-1.5 rounded-full text-base sm:text-[18px] font-flink transition-colors hover:bg-white/65 cursor-pointer duration-200 text-white">
          Explore
        </button>
      </motion.div>

      <div className="absolute bottom-0 left-0 w-full h-20 sm:h-32 bg-linear-to-b from-transparent to-[#0a0a0f] z-20" />
    </div>
  );
}
