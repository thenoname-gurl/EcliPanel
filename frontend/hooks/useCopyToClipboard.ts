"use client"

import { useState, useCallback } from "react"

export function useCopyToClipboard(resetMs: number = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
    } catch {
      // Clipboard not available
    }
  }, [resetMs])

  return { copied, copy }
}
