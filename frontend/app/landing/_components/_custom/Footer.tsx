"use client";

import { motion } from "framer-motion";
import ShinyText from "../_reacts-bits/ShinyText";

interface FooterItem {
  title: string;
  link?: string;
  badge?: string;
  items: FooterItem[];
}

const footerColumns: FooterItem[] = [
  {
    title: "Product",
    items: [
      { title: "Features", link: "#", items: [] },
      { title: "Pricing", link: "#", items: [] },
      { title: "Network", link: "#", items: [] },
      { title: "Status", link: "#", items: [] },
    ],
  },
  {
    title: "Developers",
    items: [
      { title: "Docs", link: "#", items: [] },
      { title: "API", link: "#", items: [] },
      { title: "GitHub", link: "#", items: [] },
      { title: "Changelog", link: "#", items: [] },
    ],
  },
  {
    title: "Legal",
    items: [
      { title: "Terms", link: "#", items: [] },
      { title: "Privacy", link: "#", items: [] },
      { title: "Cookies", link: "#", items: [] },
      { title: "Acceptable use", link: "#", items: [] },
      { title: "Imprint", link: "#", items: [] },
    ],
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
} as any;

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: "easeOut" },
  }),
} as any;

export function Footer() {
  return (
    <div className="flex flex-col mt-20 sm:mt-40 px-5 sm:px-8 lg:px-5 relative">
      <div className="flex flex-col sm:flex-row sm:justify-between gap-10 sm:gap-8 mb-16 sm:mb-32 lg:mb-55">
        <motion.div
          className="flex flex-col gap-3 max-w-xs"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={fadeUp}
          custom={0}
        >
          <p className="text-white text-xl font-semibold">Eclipse Systems</p>
          <p className="text-white/60 text-sm leading-relaxed">
            Distributed hosting built for developers who care about reliability.
          </p>
          <a
            href="mailto:contact@ecli.app"
            className="text-white/40 text-sm hover:text-white transition-colors duration-200 no-underline"
          >
            contact@ecli.app
          </a>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 lg:gap-20">
          {footerColumns.map((col, colIdx) => (
            <motion.div
              key={col.title}
              className="flex flex-col min-w-0"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              custom={colIdx + 1}
            >
              <span className="h-px w-full bg-white/15 mb-5" />
              <span className="text-white font-bold text-lg sm:text-xl mb-5">
                {col.title}
              </span>
              {col.items.map((item, itemIdx) => (
                <motion.a
                  key={item.title}
                  href={item.link ?? "#"}
                  className="flex items-center gap-2 text-white/60 text-[15px] sm:text-[16px] mb-2.5 hover:text-white transition-colors duration-200 no-underline"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  variants={fadeIn}
                  custom={colIdx * 0.3 + itemIdx + 2}
                >
                  {item.title}
                  {item.badge && (
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-white/70 bg-white/10 border border-white/20 px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </motion.a>
              ))}
            </motion.div>
          ))}
        </div>
      </div>

      <span className="text-[22vw] sm:text-[18vw] lg:text-[15rem] font-bold text-center absolute -bottom-7 z-2 right-[50%] translate-x-[50%] w-full overflow-hidden">
        <ShinyText
          text="EclipseSystems"
          speed={2}
          delay={0}
          color="transparent"
          shineColor="#2F2F2F"
          spread={120}
          direction="left"
          yoyo={false}
          pauseOnHover={false}
          disabled={false}
        />
        <div className="absolute bottom-0 left-0 w-full h-50 bg-linear-to-b from-transparent to-black z-20" />
      </span>

      <motion.span
        className="h-px w-full bg-white/15 mt-4 relative z-100"
        initial={{ scaleX: 0, originX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />

      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 text-white/70 relative z-100 bg-[#0a0a0f] h-full py-8 sm:py-10"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm sm:text-base">
            © {new Date().getFullYear()} EclipseSystems. All rights reserved.
          </p>
          <p className="text-white/30 text-sm">
            Built for developers, by developers.
          </p>
        </div>

        <ul className="flex gap-4 list-none flex-wrap">
          {["Terms", "Privacy", "Cookies"].map((label, i) => (
            <motion.li
              key={label}
              className="transition-all duration-200 hover:text-white cursor-pointer text-base sm:text-[18px]"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35 + i * 0.07, duration: 0.35 }}
            >
              {label}
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
