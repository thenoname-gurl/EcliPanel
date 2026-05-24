"use client";

import { useState, useEffect } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Sparkles,
  Server,
  Cpu,
  Rocket,
  Clock,
  LifeBuoy,
} from "lucide-react";
import meta from "../meta.json";

const icons = { BookOpen, Sparkles, Server, Cpu, Rocket, Clock, LifeBuoy };

export function DocSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Command className="w-[480px] bg-[#0D0D0D] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          <Command.Input
            autoFocus
            placeholder="Search docs..."
            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none border-b border-white/10"
          />
          <Command.List className="p-2 max-h-80 overflow-y-auto">
            <Command.Empty className="py-6 text-center text-sm text-white/30">
              No results found.
            </Command.Empty>
            {meta.groups.map((group) => (
              <Command.Group
                key={group.name}
                heading={group.name}
                className="[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-white/30 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {group.pages.map((page) => {
                  const Icon = icons[page.icon as keyof typeof icons];
                  return (
                    <Command.Item
                      key={page.href}
                      value={page.name}
                      onSelect={() => {
                        router.push(page.href);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 px-2 py-2 text-sm text-white/60 rounded-lg cursor-pointer aria-selected:bg-white/10 aria-selected:text-white transition-colors"
                    >
                      <Icon className="h-4 w-4" />
                      {page.name}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
