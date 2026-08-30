"use client";
// This thingy replaces next/dynamic w react lazy + suspense
// Usage is as following const Comp = dynamic(() => import('./Comp'), { ssr: false, loading: () => <Skeleton /> })

import React, { Suspense } from "react";
import type { ComponentType } from "react";
import { RouteSkeleton } from "@/components/ui/route-skeleton";

type DynamicOptions = {
  ssr?: boolean;
  loading?: () => React.ReactNode;
};

export default function dynamic<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  options?: DynamicOptions,
): React.ComponentType<any> {
  const Lazy = React.lazy(loader);
  // Default the lazy boundary to the skeleton-cards look so every dynamic()
  // without an explicit custom loading shows a consistent skeleton instead of
  // a blank flash or a plain "Loading..." text div.
  // Only fall back to the skeleton when no `loading` is provided. A `loading`
  // that returns null (the landing/auth pattern for deferred effects) must stay
  // null — `null ?? <RouteSkeleton/>` would wrongly render the dashboard skeleton.
  const fallback = options?.loading ? options.loading() : <RouteSkeleton />;

  function DynamicComponent(props: any) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }

  return DynamicComponent;
}