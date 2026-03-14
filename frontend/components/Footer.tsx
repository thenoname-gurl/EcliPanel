"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type FooterProps = {
  dashboard?: boolean
  hideOnDashboard?: boolean
  hideOnPathname?: boolean
}

export function Footer({ dashboard, hideOnDashboard, hideOnPathname }: FooterProps) {
  const pathname = usePathname() || ""
  const isDashboard = dashboard ?? pathname.startsWith("/dashboard")

  if (hideOnDashboard && isDashboard) {
    return null
  }

  if (hideOnPathname) {
    return null
  }

  const commonLinks = (
    <div className="flex flex-wrap justify-center gap-3">
      <Link href="/docs" className="hover:text-foreground">
        Legal Documents
      </Link>
      <span className="hidden sm:inline">·</span>
      <Link href="/documents/Impressum.pdf" className="hover:text-foreground">
        Imprint
      </Link>
    </div>
  )

  if (isDashboard) {
    return (
      <footer className="fixed bottom-4 right-4 z-30 w-auto rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span>© {new Date().getFullYear()} EclipseSystems</span>
          <span className="hidden sm:inline">·</span>
          {commonLinks}
        </div>
      </footer>
    )
  }

  return (
    <footer className="w-full text-muted-foreground text-[11px] bg-background/60 px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between">
        <div>
          <span>© {new Date().getFullYear()} EclipseSystems under Misiu LLC</span>
        </div>
        {commonLinks}
      </div>
    </footer>
  )
}
