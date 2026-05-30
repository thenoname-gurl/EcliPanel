"use client";

import GradualBlurMemo from "./landing/_components/_reacts-bits/GradualBlur";
import { Hero } from "./landing/_components/_custom/Hero";
import { Menu } from "./landing/_components/_custom/Menu";
import { Stats } from "./landing/_components/_custom/Stats";
import { Features } from "./landing/_components/_custom/Features";
import { Pricing } from "./landing/_components/_custom/Pricing";
import { FAQ } from "./landing/_components/_custom/FAQ";
import { End } from "./landing/_components/_custom/End";
import { Footer } from "./landing/_components/_custom/Footer";
import { Network } from "./landing/_components/_custom/Orbit";
import { DdosProtection } from "./landing/_components/_custom/DdosProtection";

export default function LandingPage() {
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
      <Menu />
      <Hero />
      <Stats />
      <Features />
      <DdosProtection />
      <Pricing />
      <Network />
      <DdosProtection />
      <FAQ />
      <End />
      <Footer />
    </div>
  );
}
