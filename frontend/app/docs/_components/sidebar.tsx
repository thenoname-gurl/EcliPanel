"use client";

import {
  BookOpen,
  Sparkles,
  Server,
  Cpu,
  Rocket,
  Clock,
  LifeBuoy,
  SearchIcon,
  MenuIcon,
  XIcon,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import meta from "../meta.json";

const icons = { BookOpen, Sparkles, Server, Cpu, Rocket, Clock, LifeBuoy };

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const content = (
    <div className="p-2 w-70 bg-[#0D0D0D] pl-10 pr-5 h-full overflow-y-auto">
      <div className="flex flex-col gap-2">
        <span className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1">
            <img src="/assets/icons/logo.png" alt="logo" className="w-10" />
            <p>{meta.title}</p>
          </span>
          <button
            className="lg:hidden p-1 text-white/50 hover:text-white"
            onClick={() => setOpen(false)}
          >
            <XIcon size={18} />
          </button>
        </span>
        <div
          className="flex items-center justify-between **:text-[14px] text-white/70 bg-white/5 px-3 py-1.5 hover:bg-white/10 transition-colors cursor-pointer mb-4"
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            )
          }
        >
          <span className="flex items-center gap-1">
            <SearchIcon size={18} />
            <p>Search</p>
          </span>
          <span className="ms-auto inline-flex gap-0.5">
            <kbd className="border border-white/20 bg-black px-1.5">⌘</kbd>
            <kbd className="border border-white/20 bg-black px-1.5">K</kbd>
          </span>
        </div>
      </div>
      <ul className="flex flex-col">
        {meta.groups.map((group, gi) => (
          <li key={gi} className="mb-4">
            <p className="text-[11px] uppercase tracking-wider text-white/70 px-1 mb-1">
              {group.name}
            </p>
            <ul className="flex flex-col">
              {group.pages.map((v, i) => {
                const Icon = icons[v.icon as keyof typeof icons];
                const active = pathname === v.href;
                return (
                  <span
                    key={i}
                    onClick={() => {
                      router.push(v.href);
                      setOpen(false);
                    }}
                    className={`text-[14px] py-1.5 transition-colors duration-100 px-1 cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? "text-white bg-white/10"
                        : "text-white/50 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {v.name}
                  </span>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white/70 hover:text-white"
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={18} />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50">{content}</div>
        </div>
      )}

      <div className="hidden lg:block shrink-0">{content}</div>
    </>
  );
}
