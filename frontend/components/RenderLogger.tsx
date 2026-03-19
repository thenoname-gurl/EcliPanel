'use client'

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'

export function RenderLogger() {
  const pathname = usePathname()

  const renderStart = useMemo(() => {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now())
  }, [pathname])

  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - renderStart
    console.log(`[render] rendered in ${elapsed.toFixed(2)}ms (${pathname})`)
  }, [pathname, renderStart])

  return null
}
