"use client"

import { PanelSidebar } from "@/components/panel/sidebar"
import { EnforcementBanner } from "@/components/panel/enforcement-banner"
import { Footer } from "@/components/Footer"

import { useEffect } from "react";
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

  if (user === undefined) {
    return null;
  }

  const hideFooter = pathname?.startsWith("/dashboard/ai-chat")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <PanelSidebar />
      <main className="relative flex flex-1 flex-col overflow-y-auto">
        <EnforcementBanner />
        <div className={"flex-1 min-h-0 " + (hideFooter ? "" : "pb-20") }>
          {children}
        </div>
        <Footer dashboard hideOnPathname={hideFooter} />
      </main>
    </div>
  );
}
