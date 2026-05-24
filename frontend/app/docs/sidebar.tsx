"use client";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const items = [
  { name: "Get Started", href: "/getting-started" },
  { name: "Deploying Apps", href: "/deploying-apps" },
  { name: "KVM", href: "/kvm" },
  { name: "Server Management", href: "/server-management" },
  { name: "Sunset", href: "/sunset" },
  { name: "Support", href: "/support" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavItems = ({ onClick }: { onClick?: () => void }) =>
    items.map((item, index) => {
      const fullPath = `/docs${item.href}`;
      const active = pathname === fullPath;
      return (
        <a
          key={index}
          href={fullPath}
          onClick={onClick}
          className={cn(
            "text-[18px] flex px-4 py-1.5 rounded-full transition-colors",
            active ? "bg-white text-black" : "text-white hover:bg-white/10",
          )}
        >
          {item.name}
        </a>
      );
    });

  return (
    <>
      <div className="hidden md:flex bg-black w-[20vw] border-r border-white/20 flex-col p-10 gap-2">
        <NavItems />
      </div>

      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed bottom-6 left-6 z-1100 bg-white text-black rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
        aria-label="Open navigation"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-1100 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed top-0 left-0 z-1101 h-full w-72 bg-neutral-950 border-r border-white/10 flex flex-col p-8 gap-2 md:hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="text-white/50 text-sm uppercase tracking-widest">
                  Docs
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-white/40 hover:text-white transition-colors"
                  aria-label="Close navigation"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <NavItems onClick={() => setDrawerOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
