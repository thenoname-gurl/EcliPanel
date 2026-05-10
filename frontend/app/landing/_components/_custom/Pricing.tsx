"use client";

import {
  LucideIcon,
  Server,
  Router,
  Computer,
  HardDrive,
  Send,
  Mail,
  Cpu,
  Monitor,
  ShieldCheck,
  Sparkles,
  Globe,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

type FeatureIconKind =
  | "servers"
  | "ports"
  | "cpu"
  | "ram"
  | "storage"
  | "os"
  | "support"
  | "ai"
  | "emailsPerDay"
  | "emailQueue"
  | "sla"
  | "db"
  | "backup"
  | "ip";

const ICON_BY_KIND: Record<FeatureIconKind, LucideIcon> = {
  servers: Server,
  ports: Router,
  cpu: Cpu,
  ram: Computer,
  storage: HardDrive,
  os: Monitor,
  support: ShieldCheck,
  ai: Sparkles,
  emailsPerDay: Send,
  emailQueue: Mail,
  sla: ShieldCheck,
  db: Monitor,
  backup: Monitor,
  ip: Globe,
};

const planFeatureIconKinds: Record<string, FeatureIconKind[]> = {
  free: [
    "servers",
    "ports",
    "cpu",
    "ram",
    "storage",
    "emailsPerDay",
    "emailQueue",
    "sla",
  ],
  educational: [
    "servers",
    "ports",
    "cpu",
    "ram",
    "storage",
    "os",
    "emailsPerDay",
    "emailQueue",
    "sla",
  ],
  paid: [
    "servers",
    "ports",
    "cpu",
    "ram",
    "storage",
    "support",
    "ai",
    "emailsPerDay",
    "emailQueue",
    "sla",
  ],
  enterprise: [
    "servers",
    "cpu",
    "ram",
    "storage",
    "db",
    "backup",
    "ip",
    "ip",
    "support",
    "ai",
    "emailsPerDay",
    "emailQueue",
    "sla",
  ],
};

interface PlanCardProps {
  index: number;
  name: string;
  priceLabel: string;
  perMonthLabel: string;
  desc: string;
  features: string[];
  featureIconKinds: FeatureIconKind[];
  cta: string;
  highlight: boolean;
  iconKey: string;
}

function PlanCard({
  index,
  name,
  priceLabel,
  perMonthLabel,
  desc,
  features,
  featureIconKinds,
  cta,
  highlight,
}: PlanCardProps) {
  const icons = featureIconKinds.map((kind) => ICON_BY_KIND[kind]);

  return (
    <motion.div
      className="flex flex-col gap-4 border p-6 border-white/20 w-full relative overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.15 }}
    >
      {highlight && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 150% 160% at bottom, #B85A96 10%, transparent 65%)",
          }}
          initial={{ y: "100%" }}
          whileInView={{ y: "0%" }}
          viewport={{ once: true }}
          transition={{
            duration: 1,
            ease: "easeOut",
            delay: index * 0.15 + 0.2,
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        <p className="text-white font-flink text-2xl sm:text-3xl">{name}</p>
        <p className="text-white/70 font-flink text-base sm:text-[18px]">
          {desc}
        </p>
        <span className="h-px w-full bg-white/20 mt-2" />
      </div>

      <span className="flex items-center">
        <p className="text-white font-inter text-[18px]">{priceLabel}</p>
        <p className="text-white/70 text-[15px] ml-1.5">{perMonthLabel}</p>
      </span>

      <span className="h-px w-full bg-white/20" />

      <div className="flex flex-col gap-3">
        {features.map((f, i) => {
          const Icon = icons[i];
          return (
            <motion.span
              className="flex items-center gap-2"
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.4,
                ease: "easeOut",
                delay: index * 0.15 + i * 0.05,
              }}
            >
              {Icon && <Icon className="text-white shrink-0" size={18} />}
              <p className="text-white/70 font-inter text-sm sm:text-base z-100">
                {f}
              </p>
            </motion.span>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 mt-auto pt-6 sm:pt-10">
        <button
          className={`${highlight ? "bg-[#B85A96]" : "bg-[#202123]"} px-4 py-2 rounded-full text-[18px] transition-colors ${highlight ? "hover:bg-[#a34f86]" : "hover:bg-[#1f1f21]"} cursor-pointer duration-200 text-white z-100`}
        >
          {cta}
        </button>
      </div>
    </motion.div>
  );
}

function EnterpriseCard({
  index,
  name,
  priceLabel,
  perMonthLabel,
  desc,
  features,
  featureIconKinds,
  cta,
}: PlanCardProps) {
  const icons = featureIconKinds.map((kind) => ICON_BY_KIND[kind]);

  return (
    <motion.div
      className="w-full border border-white/20 p-6 relative overflow-hidden flex flex-col lg:flex-row gap-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.15 }}
    >
      <div className="flex flex-col gap-4 lg:w-[280px] shrink-0">
        <div className="flex flex-col gap-3">
          <p className="text-white font-flink text-2xl sm:text-3xl">{name}</p>
          <p className="text-white/70 font-flink text-base sm:text-[18px]">
            {desc}
          </p>
          <span className="h-px w-full bg-white/20 mt-2" />
        </div>
        <span className="flex items-center">
          <p className="text-white font-inter text-[18px]">{priceLabel}</p>
          <p className="text-white/70 text-[15px] ml-1.5">{perMonthLabel}</p>
        </span>
        <div className="mt-auto pt-4">
          <a href="mailto:contact@ecli.app">
            <button className="w-full bg-[#202123] px-4 py-2 rounded-full text-[18px] transition-colors hover:bg-[#1f1f21] cursor-pointer duration-200 text-white">
              {cta}
            </button>
          </a>
        </div>
      </div>

      <span className="hidden lg:block w-px bg-white/20 self-stretch shrink-0" />
      <span className="lg:hidden h-px w-full bg-white/20" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-3 flex-1">
        {features.map((f, i) => {
          const Icon = icons[i];
          return (
            <motion.span
              className="flex items-center gap-2"
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.4,
                ease: "easeOut",
                delay: index * 0.15 + i * 0.04,
              }}
            >
              {Icon && <Icon className="text-white shrink-0" size={18} />}
              <p className="text-white/70 font-inter text-sm sm:text-base">
                {f}
              </p>
            </motion.span>
          );
        })}
      </div>
    </motion.div>
  );
}

export function Pricing() {
  const t = useTranslations("landing");

  const plans = useMemo(
    () => [
      {
        iconKey: "free",
        name: t("pricing.plans.free.name"),
        priceLabel: t("pricing.plans.free.price"),
        perMonthLabel: t("pricing.perMonth"),
        desc: t("pricing.plans.free.desc"),
        features: [
          t("pricing.plans.free.features.0"),
          t("pricing.plans.free.features.1"),
          t("pricing.plans.free.features.2"),
          t("pricing.plans.free.features.3"),
          t("pricing.plans.free.features.4"),
          t("pricing.plans.free.features.5"),
          t("pricing.plans.free.features.6"),
          t("pricing.plans.free.features.7"),
        ],
        featureIconKinds: planFeatureIconKinds.free,
        cta: t("pricing.plans.free.cta"),
        highlight: false,
      },
      {
        iconKey: "paid",
        name: t("pricing.plans.paid.name"),
        priceLabel: t("pricing.plans.paid.price"),
        perMonthLabel: t("pricing.perMonth"),
        desc: t("pricing.plans.paid.desc"),
        features: [
          t("pricing.plans.paid.features.0"),
          t("pricing.plans.paid.features.1"),
          t("pricing.plans.paid.features.2"),
          t("pricing.plans.paid.features.3"),
          t("pricing.plans.paid.features.4"),
          t("pricing.plans.paid.features.5"),
          t("pricing.plans.paid.features.6"),
          t("pricing.plans.paid.features.7"),
          t("pricing.plans.paid.features.8"),
          t("pricing.plans.paid.features.9"),
        ],
        featureIconKinds: planFeatureIconKinds.paid,
        cta: t("pricing.plans.paid.cta"),
        highlight: true,
      },
      {
        iconKey: "educational",
        name: t("pricing.plans.educational.name"),
        priceLabel: t("pricing.plans.educational.price"),
        perMonthLabel: t("pricing.perMonth"),
        desc: t("pricing.plans.educational.desc"),
        features: [
          t("pricing.plans.educational.features.0"),
          t("pricing.plans.educational.features.1"),
          t("pricing.plans.educational.features.2"),
          t("pricing.plans.educational.features.3"),
          t("pricing.plans.educational.features.4"),
          t("pricing.plans.educational.features.5"),
          t("pricing.plans.educational.features.6"),
          t("pricing.plans.educational.features.7"),
          t("pricing.plans.educational.features.8"),
        ],
        featureIconKinds: planFeatureIconKinds.educational,
        cta: t("pricing.plans.educational.cta"),
        highlight: false,
      },
      {
        iconKey: "enterprise",
        name: t("pricing.plans.enterprise.name"),
        priceLabel: t("pricing.plans.enterprise.price"),
        perMonthLabel: t("pricing.perMonth"),
        desc: t("pricing.plans.enterprise.desc"),
        features: [
          t("pricing.plans.enterprise.features.0"),
          t("pricing.plans.enterprise.features.1"),
          t("pricing.plans.enterprise.features.2"),
          t("pricing.plans.enterprise.features.3"),
          t("pricing.plans.enterprise.features.4"),
          t("pricing.plans.enterprise.features.5"),
          t("pricing.plans.enterprise.features.6"),
          t("pricing.plans.enterprise.features.7"),
          t("pricing.plans.enterprise.features.8"),
          t("pricing.plans.enterprise.features.9"),
          t("pricing.plans.enterprise.features.10"),
          t("pricing.plans.enterprise.features.11"),
          t("pricing.plans.enterprise.features.12"),
        ],
        featureIconKinds: planFeatureIconKinds.enterprise,
        cta: t("pricing.plans.enterprise.cta"),
        highlight: false,
      },
    ],
    [t],
  );

  return (
    <div id="pricing" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {t("pricing.eyebrow")}
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        {t("pricing.title")} {" "}
        <span className="hidden sm:inline">
          <br />
        </span>
        {t("pricing.subtitle")}
      </motion.p>

      <div className="flex flex-col gap-4 mb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 sm:mt-10">
          {plans.slice(0, 3).map((plan, i) => (
            <PlanCard {...plan} index={i} key={i} />
          ))}
        </div>

        <EnterpriseCard {...plans[3]} index={3} />
      </div>
    </div>
  );
}
