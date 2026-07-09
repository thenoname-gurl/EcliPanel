"use client"

import { useEffect } from "react"
import { isExternalUrlSync } from "@/lib/internal-domains"

function proxyImageUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

export function GlobalImageProxy() {
  useEffect(() => {
    function processImg(img: HTMLImageElement) {
      if (img.hasAttribute("data-proxied")) return
      const src = img.getAttribute("src")
      if (!src || !isExternalUrlSync(src)) return

      img.setAttribute("data-original-src", src)
      img.setAttribute("src", proxyImageUrl(src))
      img.setAttribute("data-proxied", "true")

      const srcset = img.getAttribute("srcset")
      if (srcset) {
        img.setAttribute("data-original-srcset", srcset)
        img.removeAttribute("srcset")
      }
    }

    function collectImgs(root: ParentNode) {
      root.querySelectorAll("img").forEach(processImg)
    }

    collectImgs(document)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLImageElement) {
              processImg(node)
            } else if (node instanceof HTMLElement) {
              collectImgs(node)
            }
          }
        }
        if (mutation.type === "attributes" && mutation.attributeName === "src") {
          const img = mutation.target as HTMLImageElement
          const currentSrc = img.getAttribute("src")
          if (!currentSrc || currentSrc.startsWith("/api/proxy/")) return
          if (!isExternalUrlSync(currentSrc)) return
          img.setAttribute("data-original-src", currentSrc)
          img.setAttribute("src", proxyImageUrl(currentSrc))
          img.setAttribute("data-proxied", "true")
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    })

    return () => observer.disconnect()
  }, [])

  return null
}