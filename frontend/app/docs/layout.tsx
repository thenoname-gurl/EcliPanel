import { Sidebar } from "./_components/sidebar";
import { TableOfContents } from "./_components/toc";
import { DocSearch } from "./_components/cmdk";
import "./docs.css";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <DocSearch />
      <Sidebar />
      <div className="overflow-y-auto flex-1">
        <div className="mx-auto px-8 py-6 bg-[#121212] pt-16">{children}</div>
      </div>
      <TableOfContents />
    </div>
  );
}
