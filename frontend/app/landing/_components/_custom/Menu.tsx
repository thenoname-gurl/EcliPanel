"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface MenuProps {
  customCTA?: {
    label: string;
    href: string;
    newPage?: boolean;
  };
  customMenu?: {
    label: string;
    href: string;
  }[];
  sticky?: boolean;
}

export function Menu({ customCTA, customMenu, sticky = true }: MenuProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("landing");
  const { isLoggedIn } = useAuth();

  const links = customMenu || [
    { href: "#features", label: t("nav.features") },
    { href: "#pricing", label: t("nav.pricing") },
    { href: "#network", label: t("nav.network") },
    { href: "#faq", label: t("nav.faq") },
  ];

  return (
    <>
      <div
        className={`w-full ${sticky ? "fixed" : "relative"} top-5 z-1101 flex justify-between items-center px-6 sm:px-12 lg:px-40`}
      >
        <a href="/">
          <img
            src="/assets/icons/logo.png"
            alt={t("brand")}
            width={60}
            height={60}
            className="w-12 sm:w-15 h-auto"
          />
        </a>

        <ul className="hidden md:flex items-center gap-8 list-none text-white/80 **:font-flink">
          {links.map(({ href, label }) => (
            <li
              key={href}
              className="transition-all duration-200 hover:text-white cursor-pointer text-[18px]"
            >
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-8">
          <Link
            href={
              customCTA
                ? customCTA.href
                : isLoggedIn
                  ? "/dashboard"
                  : "/register"
            }
            {...(customCTA?.newPage && {
              target: "_blank",
              rel: "noreferrer noopener",
            })}
          >
            <button className="px-4 py-1.5 rounded-full text-[18px] font-flink transition-colors hover:bg-white/65 text-white hover:text-black cursor-pointer duration-200">
              {customCTA
                ? customCTA.label
                : isLoggedIn
                  ? t("nav.openDashboard")
                  : t("nav.getStarted")}
            </button>
          </Link>
        </div>

        <button
          className="md:hidden flex flex-col justify-center items-center gap-1.5 w-8 h-8 cursor-pointer"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <motion.span
            className="block w-6 h-0.5 bg-white rounded-full origin-center"
            animate={open ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.span
            className="block w-6 h-0.5 bg-white rounded-full"
            animate={
              open ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }
            }
            transition={{ duration: 0.2 }}
          />
          <motion.span
            className="block w-6 h-0.5 bg-white rounded-full origin-center"
            animate={open ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.25 }}
          />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed top-0 left-0 w-full z-1100 bg-[#e594c7]/90 backdrop-blur-md pt-24 pb-8 px-8 flex flex-col gap-6 md:hidden"
          >
            <ul className="flex flex-col gap-5 list-none text-white/90 **:font-flink">
              {links.map(({ href, label }, i) => (
                <motion.li
                  key={href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.2 }}
                  className="text-[22px] hover:text-white transition-colors duration-200"
                  onClick={() => setOpen(false)}
                >
                  <a href={href}>{label}</a>
                </motion.li>
              ))}
            </ul>

            <Link
              href={
                customCTA
                  ? customCTA.href
                  : isLoggedIn
                    ? "/dashboard"
                    : "/register"
              }
              className="w-full"
              onClick={() => setOpen(false)}
            >
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.2 }}
                {...(customCTA?.newPage && {
                  target: "_blank",
                  rel: "noreferrer noopener",
                })}
                className="w-full py-2.5 rounded-full text-[18px] font-flink border border-white/40 text-white hover:bg-white/20 transition-colors duration-200 cursor-pointer"
              >
                {customCTA
                  ? customCTA.label
                  : isLoggedIn
                    ? t("nav.openDashboard")
                    : t("nav.getStarted")}
              </motion.button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
