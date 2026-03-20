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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased min-h-screen flex flex-col min-w-0">
        <AuthProvider>
          <RenderLogger />
          <div className="flex-1 flex flex-col min-w-0">
            {children}
          </div>
          <Footer hideOnDashboard />
        </AuthProvider>
      </body>
    </html>
  )
}