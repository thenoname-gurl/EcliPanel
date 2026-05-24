"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Command } from "cmdk";
import {
  ComputerIcon,
  MessageCircleIcon,
  Package2Icon,
  RocketIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";

const links = [
  { href: "/docs/getting-started", label: "Get Started", icon: RocketIcon },
  { href: "/docs/deploying-apps", label: "Deploying Apps", icon: Package2Icon },
  { href: "/docs/kvm", label: "KVM", icon: ComputerIcon },
  {
    href: "/docs/server-management",
    label: "Server Management",
    icon: SettingsIcon,
  },
  { href: "/docs/sunset", label: "Sunset", icon: SunIcon },
  { href: "/docs/support", label: "Support", icon: MessageCircleIcon },
];

function SearchPalette({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-1200 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <motion.div
            key="palette"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-1201 w-full max-w-lg"
          >
            <Command
              className="rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl overflow-hidden"
              shouldFilter={false}
            >
              <div className="flex items-center gap-3 px-4 border-b border-white/10">
                <svg
                  className="w-4 h-4 text-white/40 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  />
                </svg>
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search documentation..."
                  className="w-full bg-transparent py-4 text-sm text-white placeholder:text-white/30 outline-none"
                  autoFocus
                />
                <kbd
                  onClick={() => setOpen(false)}
                  className="shrink-0 text-[11px] text-white/30 border border-white/10 rounded px-1.5 py-0.5 cursor-pointer hover:text-white/60 transition-colors"
                >
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-72 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-white/30">
                  No results for &ldquo;{query}&rdquo;
                </Command.Empty>

                <Command.Group
                  heading={
                    <span className="text-[11px] text-white/30 uppercase tracking-wider px-2 py-1.5 block">
                      Pages
                    </span>
                  }
                >
                  {links
                    .filter((l) =>
                      l.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((link) => (
                      <Command.Item
                        key={link.href}
                        value={link.label}
                        onSelect={() => {
                          setOpen(false);
                          window.location.href = link.href;
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 cursor-pointer hover:bg-white/5 hover:text-white transition-colors data-[selected=true]:bg-white/8 data-[selected=true]:text-white aria-selected:bg-white/8 aria-selected:text-white"
                      >
                        <span className="text-base">
                          <link.icon />
                        </span>
                        <span>{link.label}</span>
                        <svg
                          className="ml-auto w-3.5 h-3.5 text-white/20"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Command.Item>
                    ))}
                </Command.Group>
              </Command.List>

              <div className="border-t border-white/5 px-4 py-2.5 flex items-center gap-4 text-[11px] text-white/25">
                <span className="flex items-center gap-1">
                  <kbd className="border border-white/10 rounded px-1 py-0.5">
                    ↑
                  </kbd>
                  <kbd className="border border-white/10 rounded px-1 py-0.5">
                    ↓
                  </kbd>{" "}
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="border border-white/10 rounded px-1 py-0.5">
                    ↵
                  </kbd>{" "}
                  open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="border border-white/10 rounded px-1 py-0.5">
                    esc
                  </kbd>{" "}
                  close
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Menu() {
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const t = useTranslations("landing");

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <SearchPalette open={paletteOpen} setOpen={setPaletteOpen} />

      <div className="w-full bg-neutral-950 border-b border-white/10 flex justify-between items-center px-6 sm:px-12 lg:px-40 py-2">
        <a href="/">
          <img
            src="/assets/icons/logo.png"
            alt={t("brand")}
            className="w-12 sm:w-15 h-auto"
          />
        </a>

        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden md:flex items-center gap-3 bg-white/5 border border-white/20 px-4 py-1.5 text-sm text-white/40 hover:bg-white/8 hover:border-white/15 hover:text-white/60 transition-all duration-200 w-150 cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <span className="flex-1 text-left">Search docs...</span>
          <kbd className="text-[11px] border border-white/10 rounded px-1.5 py-0.5 font-mono">
            ⌘K
          </kbd>
        </button>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/register">
            <button className="px-4 py-1.5 rounded-full text-[18px] font-flink transition-colors hover:bg-white/65 text-white hover:text-black cursor-pointer duration-200">
              {t("nav.getStarted")}
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
            <button
              onClick={() => {
                setOpen(false);
                setPaletteOpen(true);
              }}
              className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-full px-4 py-2.5 text-sm text-white/70 w-full cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>
              Search docs...
            </button>

            <ul className="flex flex-col gap-5 list-none text-white/90 **:font-flink">
              {links.map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.2 }}
                  className="text-[22px] hover:text-white transition-colors duration-200"
                  onClick={() => setOpen(false)}
                >
                  <a href={item.href} className="flex items-center gap-2">
                    <item.icon /> {item.label}
                  </a>
                </motion.li>
              ))}
            </ul>

            <Link
              href="/register"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.2 }}
                className="w-full py-2.5 rounded-full text-[18px] font-flink border border-white/40 text-white hover:bg-white/20 transition-colors duration-200 cursor-pointer"
              >
                {t("nav.getStarted")}
              </motion.button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
