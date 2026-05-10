"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

const FEATURES = [
  {
    key: "deploy",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 9l3-3 3 3 3-3 3 3 3-3" />
        <path d="M1.5 14l3-3 3 3 3-3 3 3 3-3" opacity=".4" />
      </svg>
    ),
  },
  {
    key: "edge",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M9 2C9 2 12 5.5 12 9s-3 7-3 7" />
        <path d="M9 2C9 2 6 5.5 6 9s3 7 3 7" />
        <path d="M2 9h14" />
      </svg>
    ),
  },
  {
    key: "uptime",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="14" height="14" rx="3" />
        <path d="M6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "isolation",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 13V7l6-4 6 4v6l-6 4-6-4z" />
        <path d="M9 3v10M3 7l6 4 6-4" opacity=".4" />
      </svg>
    ),
  },
  {
    key: "metrics",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12l4-4 3 3 4-5 3 3" />
        <rect x="2" y="2" width="14" height="14" rx="2" />
      </svg>
    ),
  },
  {
    key: "coldStarts",
    icon: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="2.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
];

interface CardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  index: number;
}

function Card({ icon, title, body, index }: CardProps) {
  return (
    <motion.div
      className="flex flex-col gap-5 border p-6 border-white/20 w-full relative overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.1 }}
    >
      <div className="text-white/70">{icon}</div>
      <p className="text-white text-2xl sm:text-3xl">{title}</p>
      <p className="text-white/70 text-base sm:text-[18px]">{body}</p>
    </motion.div>
  );
}

export function Features() {
  const t = useTranslations("landing");

  const features = useMemo(
    () =>
      FEATURES.map(({ key, icon }) => ({
        icon,
        title: t(`features.items.${key}.title`),
        body: t(`features.items.${key}.body`),
      })),
    [t],
  );

  return (
    <div id="features" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        Features
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        Everything included.
        <span className="hidden sm:inline">
          <br />
        </span>
        Nothing to configure.
      </motion.p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 sm:mt-10">
        {features.map((f, i) => (
          <Card {...f} index={i} key={i} />
        ))}
      </div>
    </div>
  );
}
