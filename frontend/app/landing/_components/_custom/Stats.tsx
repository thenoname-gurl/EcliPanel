"use client";

import CountUp from "../_reacts-bits/CountUp";
import { motion } from "framer-motion";

interface Stat {
  name: string;
  value: number;
  valueType?: string;
  colorKey: number;
}

const stats: Stat[] = [
  { name: "Monthly traffic", value: 261, valueType: "GB", colorKey: 0 },
  { name: "API Calls", value: 26427, colorKey: 1 },
  { name: "Total users", value: 196, colorKey: 2 },
];

const colorMap: Record<number, string> = {
  0: "#c7e8d4",
  1: "#dcd0f5",
  2: "#ffd4b8",
};

const HOVER_BONUS = 80;
const BASE_HEIGHT = 400;

function Stat({
  name,
  value,
  valueType,
  colorKey,
  index,
}: Stat & { index: number }) {
  return (
    <motion.div
      className="flex flex-col gap-3 border border-white/20 p-6 sm:p-8 justify-center w-full overflow-hidden cursor-pointer"
      id="stats"
      style={{ background: colorMap[colorKey] }}
      initial={{ height: 0, opacity: 0, y: 40 }}
      whileInView={{ height: BASE_HEIGHT, opacity: 1, y: 0 }}
      whileHover={{ height: BASE_HEIGHT + HOVER_BONUS }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        height: {
          duration: 0.7,
          ease: [0.34, 1.56, 0.64, 1],
          delay: index * 0.15,
        },
        opacity: { duration: 0.4, delay: index * 0.15 },
        y: { duration: 0.5, ease: "easeOut", delay: index * 0.15 },
      }}
    >
      <p className="text-[#171717] text-xl sm:text-2xl lg:text-3xl mb-auto">
        {name}
      </p>
      <p className="text-[#171717] text-xl sm:text-2xl lg:text-3xl font-inter font-medium">
        Total
      </p>
      <span className="flex gap-1 items-baseline flex-wrap">
        <CountUp
          from={0}
          to={value}
          separator=","
          direction="up"
          duration={1}
          className="count-up-text text-[#171717] text-xl sm:text-2xl lg:text-3xl font-inter font-medium"
          delay={index * 0.15}
        />
        <p className="text-[#171717] font-medium font-inter text-xl sm:text-2xl lg:text-3xl">
          {valueType}
        </p>
      </span>
    </motion.div>
  );
}

export function Stats() {
  return (
    <div className="my-12 sm:my-20 mb-20 sm:mb-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center mb-8 sm:mb-0"
        initial={{ opacity: 0, y: -24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        Real Users
      </motion.p>

      <div className="hidden sm:flex gap-4 lg:gap-6 items-end justify-center px-8 md:px-20 lg:px-40 h-[55vh] lg:h-[60vh]">
        {stats.map((s, i) => (
          <Stat {...s} index={i} key={i} />
        ))}
      </div>

      <div className="flex sm:hidden flex-col gap-4 px-6 mt-4">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            className="flex flex-col gap-2 border border-white/20 p-6 cursor-pointer"
            style={{ background: colorMap[s.colorKey] }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.12 }}
          >
            <p className="text-[#171717] text-lg">{s.name}</p>
            <p className="text-sm font-inter text-[#171717]/60">Total</p>
            <span className="flex gap-1 items-baseline">
              <CountUp
                from={0}
                to={s.value}
                separator=","
                direction="up"
                duration={1}
                className="count-up-text text-[#171717] text-3xl font-inter font-bold"
                delay={i * 0.12}
              />
              {s.valueType && (
                <p className="text-[#171717] font-bold font-inter text-3xl">
                  {s.valueType}
                </p>
              )}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
