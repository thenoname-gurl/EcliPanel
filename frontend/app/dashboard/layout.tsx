"use client"

import { PanelSidebar } from "@/components/panel/sidebar"
import { EnforcementBanner } from "@/components/panel/enforcement-banner"
import { Footer } from "@/components/Footer"

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    }
  }, [user, router]);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    }
  }, [user, router]);

  if (user === undefined) {
    return null;
  }

  const hideFooter = pathname?.startsWith("/dashboard/ai-chat") || pathname?.startsWith("/dashboard/tickets/")

  return (
    <div className="flex h-screen overflow-hidden bg-background min-w-0">
      <PanelSidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <main className="relative flex flex-1 flex-col overflow-y-auto min-w-0">
        {/* Mobile hamburger */}
        {!mobileSidebarOpen && (
          <div className="absolute left-3 top-3 z-50 md:hidden">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Open navigation"
            >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
            </svg>
            </button>
          </div>
        )}

        <EnforcementBanner />
        <div className={"flex-1 min-h-0 " + (hideFooter ? "" : "pb-20") }>
          {children}
        </div>
        <Footer dashboard hideOnPathname={hideFooter} />
      </main>
    </div>
  );
}
