"use client"

import { useEffect } from "react"
import { useExternalLinkGuard } from "@/components/panel/external-link-warning"
import { isExternalUrlSync, preloadTrustedDomains } from "@/lib/internal-domains"

export function GlobalLinkGuard() {
  const { guard, dialog } = useExternalLinkGuard()

  useEffect(() => { preloadTrustedDomains() }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (!isExternalUrlSync(href)) return

      e.preventDefault()
      e.stopPropagation()

      const target = anchor.getAttribute("target") || ""
      guard(href).then((allowed) => {
        if (!allowed) return
        if (target === "_blank") {
          window.open(href, "_blank", "noopener,noreferrer")
        } else {
          window.location.href = href
        }
      })
    }

    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [guard])

  return dialog
}