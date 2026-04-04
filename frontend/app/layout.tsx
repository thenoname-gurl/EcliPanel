import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { API_ENDPOINTS } from '@/lib/panel-config'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('layout');

  return {
    title: t('title'),
    description: t('description'),
    icons: {
      icon: [
        {
          url: '/assets/icons/logo.png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/assets/icons/logo.png',
          media: '(prefers-color-scheme: dark)',
        },
      ],
      apple: '/assets/icons/logo.png',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0a0a12',
  userScalable: true,
}

import { AuthProvider } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import { RenderLogger } from "@/components/RenderLogger";
import { THEMES } from "@/lib/themes";
import GlobalQueryBanner from "@/components/GlobalQueryBanner";
import Guide from "@/components/Guide";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hdrs = await headers();
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieHeader = hdrs.get('cookie') || '';

  const themesMap = Object.fromEntries(
    THEMES.map((t) => [
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
        ...(t as any).foreground ? {"--foreground": (t as any).foreground} : {},
        ...(t as any).cardForeground ? {"--card-foreground": (t as any).cardForeground} : {},
      },
    ])
  );

  let themeName: string | null = null;
  try {
    const res = await fetch(API_ENDPOINTS.session, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      themeName = data?.user?.settings?.theme?.name || null;
    }
  } catch (e) {
    // skippy
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
    <html lang={locale}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </head>
      <body className="font-sans antialiased min-h-screen flex flex-col min-w-0">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <Suspense fallback={null}>
              <Guide />
            </Suspense>
            <Suspense fallback={null}>
              <GlobalQueryBanner />
            </Suspense>
            <RenderLogger />
            <div className="flex-1 flex flex-col min-w-0">{children}</div>
            <Footer hideOnDashboard />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}