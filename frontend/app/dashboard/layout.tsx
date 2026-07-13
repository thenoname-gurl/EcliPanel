"use client"

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PanelSidebar } from "@/components/panel/sidebar";
import { EnforcementBanner } from "@/components/panel/enforcement-banner";
import { PasswordUpgradeBanner } from "@/components/panel/password-upgrade-banner";
import { SunsetNoticeBanner } from "@/components/panel/sunset-notice-banner";
import { KycBanner } from "@/components/panel/kyc-banner";
import { TermsUpdateBanner } from "@/components/panel/terms-update-banner";
import { FeedbackDialog } from "@/components/panel/feedback-dialog";
import { Footer } from "@/components/Footer";
import { createContext, useContext } from "react";

export const SidebarContext = createContext<{ show: boolean; toggle: () => void }>({ show: true, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAnonChat = pathname?.startsWith("/dashboard/chat") && user === null;

  useEffect(() => {
    if (user === null && !isAnonChat) {
      router.replace("/login");
    }
  }, [user, router, isAnonChat]);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  if (user === undefined) {
    return null;
  }

  const hideFooter = pathname?.startsWith("/dashboard/ai-chat") || pathname?.startsWith("/dashboard/tickets/")

  return (
    <div className="flex h-screen overflow-hidden bg-background min-w-0">
      {!isAnonChat && (
        <PanelSidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      )}
      <main className="relative flex flex-1 flex-col overflow-y-auto min-w-0">
        {/* Mobile hamburger */}
        {!isAnonChat && !mobileSidebarOpen && (
          <div className="absolute left-3 top-3 z-50 md:hidden">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Open navigation"
             data-telemetry="dashboard:open-mobile-sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
            </svg>
            </button>
          </div>
        )}

        <EnforcementBanner />
        <PasswordUpgradeBanner />
        <SunsetNoticeBanner />
        <KycBanner />
        <TermsUpdateBanner />
        <FeedbackDialog />
        <div className={"flex-1 min-h-0"}>
          <SidebarContext.Provider value={{ show: showSidebar, toggle: () => setShowSidebar(s => !s) }}>
            {children}
          </SidebarContext.Provider>
        </div>
        <Footer dashboard hideOnPathname={hideFooter} />
      </main>
    </div>
  );
}