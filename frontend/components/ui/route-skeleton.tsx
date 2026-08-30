"use client"

import { Skeleton } from "@/components/ui/skeleton"

// Skeleton for the dashboard app shell while a route chunk loads or SSR'd
// content hydrates. Mirrors the content shape (header + stat grid + cards) so a
// page navigation shows a stable skeleton instead of a blank flash.
export function RouteSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-3 sm:p-5 md:p-6 w-full">
      {/* page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* content */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-4 h-3 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
