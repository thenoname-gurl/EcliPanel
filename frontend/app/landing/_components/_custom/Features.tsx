"use client";

import {
  Zap,
  Globe,
  ShieldCheck,
  Lock,
  BarChart2,
  Thermometer,
  LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Zap,
    title: "Deploy in seconds",
    description: "Select template, upload code, and configure your app.",
  },
  {
    icon: Globe,
    title: "Multi location deployments",
    description:
      "Run across independent locations and serve traffic from the closest available node.",
  },
  {
    icon: ShieldCheck,
    title: "95 percent uptime SLA",
    description: "Redundant nodes across multiple regions.",
  },
  {
    icon: Lock,
    title: "Isolated environments",
    description:
      "Every workload runs namespaced and isolated. Resource limits you control.",
  },
  {
    icon: BarChart2,
    title: "Real time metrics",
    description: "CPU, memory, bandwidth, and traces — live in your dashboard.",
  },
  {
    icon: Thermometer,
    title: "Zero cold starts",
    description:
      "Keep alive infrastructure ensures your app is ready before the first byte arrives.",
  },
];

interface CardProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

function Card({ index, ...props }: CardProps & { index: number }) {
  return (
    <motion.div
      className="flex flex-col gap-4 border p-6 border-white/20 w-full relative overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      id="pricing"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.15 }}
    >
      <div className="flex flex-col gap-5">
        <props.icon className="text-white/70" size={30} />
        <p className="text-white font-flink text-2xl sm:text-3xl">
          {props.title}
        </p>
        <p className="text-white/70 font-flink text-base sm:text-[18px]">
          {props.description}
        </p>
        {/* <span className="h-px w-full bg-white/20 mt-2" /> */}
      </div>
    </motion.div>
  );
}

export function Features() {
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
        Nothing to configure
      </motion.p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 sm:mt-10">
        {features.map((f, i) => (
          <Card {...f} index={i} key={i} />
        ))}
      </div>
    </div>
  );
}
