import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Didact_Gothic } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { createMetadata } from "@/lib/metadata";

function getBackendBaseUrl(): string {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    ""
  ).replace(/\/+$/, "");
}

const _geist = Geist({ subsets: ["latin"], display: "swap" });
const _geistMono = Geist_Mono({ subsets: ["latin"], display: "swap" });
const _didactGothic = Didact_Gothic({
  variable: "--font-didact-gothic",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("layout");
  const meta = createMetadata({
    title: t("title"),
    description: t("description"),
  });

  return {
    ...meta,
    icons: {
      icon: [
        {
          url: "/assets/icons/logo.png",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/assets/icons/logo.png",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      apple: "/assets/icons/logo.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0a12",
  userScalable: true,
};

import { AuthProvider, type User } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import { RenderLogger } from "@/components/RenderLogger";
import { THEMES } from "@/lib/themes";
import GlobalQueryBanner from "@/components/GlobalQueryBanner";
import Guide from "@/components/Guide";
import { GlobalLinkGuard } from "@/components/panel/global-link-guard";
import { GlobalImageProxy } from "@/components/panel/global-image-proxy";
import TelemetryProvider from "@/components/TelemetryProvider";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [hdrs, locale, messages] = await Promise.all([
    headers(),
    getLocale(),
    getMessages(),
  ]);
  const cookieHeader = hdrs.get("cookie") || "";

  const themesMap = Object.fromEntries(
    (THEMES || []).map((t) => [
      t.name,
      {
        "--primary": t.primary,
        "--background": t.bg,
        "--card": t.card,
        "--secondary": t.secondary,
        "--sidebar": t.sidebar,
        "--accent": t.accent,
        "--accent-foreground": t.accentFg,
        "--glow": t.glow,
        "--glow-strong": t.primary,
        "--ring": t.primary,
        "--sidebar-primary": t.primary,
        "--border": t.border,
        "--chart-1": t.primary,
        ...((t as any).foreground
          ? { "--foreground": (t as any).foreground }
          : {}),
        ...((t as any).cardForeground
          ? { "--card-foreground": (t as any).cardForeground }
          : {}),
      },
    ]),
  );

  let themeName: string | null = null;
  let initialUser: User | null = null;

  if (cookieHeader) {
    const backendBase = getBackendBaseUrl();
    await Promise.race([
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
          const res = await fetch(`${backendBase}${API_ENDPOINTS.session}`, {
            headers: { cookie: cookieHeader },
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            themeName = data?.user?.settings?.theme?.name || null;
            initialUser = data?.user || null;
          }
        } catch {
          clearTimeout(timeout);
        }
      })(),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  }

  const inlineScript = `(() => {
    try {
      const themes = ${JSON.stringify(themesMap)};
      const finalName = ${JSON.stringify(themeName)};
      if (!finalName) return;
      const vars = themes[finalName];
      if (!vars) return;
      const r = document.documentElement;
      for (const k in vars) {
        r.style.setProperty(k, vars[k]);
      }
      r.setAttribute('data-eclipse-theme', finalName);
    } catch (e) { /* ignore */ }
  })();`;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={getBackendBaseUrl()} />
        <link rel="preconnect" href={getBackendBaseUrl()} />
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </head>
      <body
        className={`font-sans antialiased min-h-screen flex flex-col min-w-0 ${_didactGothic.variable}`}
      >
        <NextIntlClientProvider messages={messages}>
          <AuthProvider initialUser={initialUser}>
            <Suspense fallback={null}>
              <Guide />
            </Suspense>
            <Suspense fallback={null}>
              <GlobalQueryBanner />
            </Suspense>
            <RenderLogger />
            <Suspense fallback={null}>
              <GlobalLinkGuard />
            </Suspense>
            <Suspense fallback={null}>
              <GlobalImageProxy />
            </Suspense>
            <Suspense fallback={null}>
              <TelemetryProvider />
            </Suspense>
            <div className="flex-1 flex flex-col min-w-0">{children}</div>
            <Footer hideOnDashboard />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
