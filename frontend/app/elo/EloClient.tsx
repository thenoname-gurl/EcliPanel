"use client";

import { motion } from "framer-motion";
import GradualBlurMemo from "../landing/_components/_reacts-bits/GradualBlur";
import { Menu } from "../landing/_components/_custom/Menu";
import { EloHero } from "../landing/_components/_custom/EloHero";
import { EloFeatures } from "../landing/_components/_custom/EloFeatures";
import { EloProjects } from "../landing/_components/_custom/EloProjects";
import { Network } from "../landing/_components/_custom/Orbit";
import { End } from "../landing/_components/_custom/End";
import Link from "next/link";

export default function EloClient() {
  return (
    <div className="bg-[#0a0a0f] min-h-screen text-white **:font-flink">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
      <Menu
        customMenu={[
          { href: "/#features", label: "Features" },
          { href: "#projects", label: "Projects" },
          { href: "#network", label: "Network" },
        ]}
        customCTA={{
          label: "Start Free",
          href: "/register",
        }}
      />
      <EloHero />
      <EloFeatures />
      <EloProjects />

      <motion.div
        className="my-12 sm:my-20 mx-6 sm:mx-12 lg:mx-40 border border-white/20 p-6 sm:p-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="text-white text-xl font-semibold">
          Not interested in ELO?
        </p>
        <p className="text-white/60 text-sm mt-2 max-w-lg mx-auto">
          We offer standard paid plans with fixed resources, no voting required.
          Pick a plan that fits your needs.
        </p>
        <div className="flex items-center justify-center gap-3 mt-5">
          <Link href="/#pricing">
            <button className="bg-white text-black px-5 py-2 rounded-full text-sm font-flink hover:bg-white/65 transition-colors cursor-pointer">
              View Paid Plans
            </button>
          </Link>
        </div>
      </motion.div>

      <Network />
      <End />
    </div>
  );
}
