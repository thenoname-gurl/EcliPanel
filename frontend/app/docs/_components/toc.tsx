"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>("");
  const pathname = usePathname();

  useEffect(() => {
    setHeadings([]);
    setActive("");

    const init = () => {
      const els = Array.from(document.querySelectorAll("h2, h3"));
      setHeadings(
        els.map((el) => ({
          id: el.id,
          text: el.textContent || "",
          level: Number(el.tagName[1]),
        })),
      );

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) setActive(e.target.id);
          });
        },
        { rootMargin: "0px 0px -80% 0px" },
      );

      els.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    };

    const timer = setTimeout(init, 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!headings.length) return null;

  return (
    <div className="hidden lg:flex h-screen w-48 flex-col py-10 px-6 border-l border-white/5 bg-[#0D0D0D]">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-1">
        {headings.map((h) => (
          <li
            key={h.id}
            style={{ paddingLeft: h.level === 3 ? "0.75rem" : "0" }}
          >
            <a
              href={`#${encodeURIComponent(h.id)}`}
              className={`text-sm block py-0.5 transition-colors ${
                active === h.id
                  ? "text-white"
                  : "text-white/50 hover:text-white/80"
              } ${active === h.id && h.level === 3 ? "border-l border-white/40 pl-2" : ""}`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
