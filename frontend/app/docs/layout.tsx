import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Sidebar } from "./sidebar";
import { Menu } from "./_components/Menu";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head></head>
      <body
        className={`font-sans antialiased min-h-screen flex flex-col min-w-0 bg-black`}
      >
        <NextIntlClientProvider messages={messages}>
          <style>{`footer { display: none !important; }`}</style>
          <Menu />
          <div className="flex h-219 overflow-hidden bg-black border-t border-white/20">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
              {children}
            </div>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
