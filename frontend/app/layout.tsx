import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Eclipse Systems - Next-Gen Hosting Provider',
  description: 'Simple and oddly statisfying feeling.',
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
}

export const viewport: Viewport = {
  themeColor: '#0a0a12',
  userScalable: true,
}

import { AuthProvider } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import { RenderLogger } from "@/components/RenderLogger";
import { THEMES } from "@/lib/themes";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
      },
    ])
  );

  const inlineScript = `(() => {
    try {
      const m = document.cookie.match(/(?:^|; )eclipseTheme=([^;]+)/);
      const name = m && decodeURIComponent(m[1]);
      if (!name) return;
      const themes = ${JSON.stringify(themesMap)};
      const vars = themes[name];
      if (!vars) return;
      const r = document.documentElement;
      for (const k in vars) {
        r.style.setProperty(k, vars[k]);
      }
      r.setAttribute('data-eclipse-theme', name);
    } catch (e) { /* ignore */ }
  })();`;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </head>
      <body className="font-sans antialiased min-h-screen flex flex-col min-w-0">
        <AuthProvider>
          <RenderLogger />
          <div className="flex-1 flex flex-col min-w-0">{children}</div>
          <Footer hideOnDashboard />
        </AuthProvider>
      </body>
    </html>
  );
}