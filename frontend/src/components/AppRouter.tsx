"use client";

import React, { Suspense } from "react";
import { usePathname } from "@/components/shims/navigation";
import { RouteSkeleton } from "@/components/ui/route-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

type Loader = () => Promise<{ default: React.ComponentType<any> }>;
type RouteMatch = { loader: Loader; params: Record<string, string> };

const staticRoutes: Record<string, Loader> = {
  // Auth
  "/login": () => import("@/app/login/page"),
  "/register": () => import("@/app/register/page"),
  "/forgot-password": () => import("@/app/forgot-password/page"),
  "/restore-email": () => import("@/app/restore-email/page"),
  "/verify-email": () => import("@/app/verify-email/page"),
  "/oauth/authorize": () => import("@/app/oauth/authorize/page"),
  "/license": () => import("@/app/license/page"),
  "/geoblock": () => import("@/app/geoblock/page"),
  "/security": () => import("@/app/security/page"),
  "/organisations/accept": () => import("@/app/organisations/accept/page"),

  // Public pages
  "/elo": () => import("@/app/elo/page"),
  "/changelogs": () => import("@/app/changelogs/page"),
  "/contributors": () => import("@/app/contributors/page"),
  "/docs": () => import("@/app/docs/page"),
  "/docs/getting-started": () => import("@/app/docs/getting-started/page"),
  "/docs/server-management": () => import("@/app/docs/server-management/page"),
  "/docs/kvm": () => import("@/app/docs/kvm/page"),
  "/docs/deploying-apps": () => import("@/app/docs/deploying-apps/page"),
  "/docs/sunset": () => import("@/app/docs/sunset/page"),
  "/docs/support": () => import("@/app/docs/support/page"),
  "/docs/eclihalo": () => import("@/app/docs/eclihalo/page"),
  "/docs/eclipanel": () => import("@/app/docs/eclipanel/page"),
  "/docs/elo": () => import("@/app/docs/elo/page"),
  "/docs/blog-handbook": () => import("@/app/docs/blog-handbook/page"),
  "/legal": () => import("@/app/legal/page"),
  "/legal/privacy-policy": () => import("@/app/legal/privacy-policy/page"),
  "/legal/terms-of-service": () => import("@/app/legal/terms-of-service/page"),
  "/legal/acceptable-use-policy": () => import("@/app/legal/acceptable-use-policy/page"),
  "/legal/ai-policy": () => import("@/app/legal/ai-policy/page"),
  "/legal/cookies-policy": () => import("@/app/legal/cookies-policy/page"),
  "/legal/dmca-copyright-policy": () => import("@/app/legal/dmca-copyright-policy/page"),
  "/legal/email-policy": () => import("@/app/legal/email-policy/page"),
  "/legal/imprint": () => import("@/app/legal/imprint/page"),
  "/legal/minimum-age": () => import("@/app/legal/minimum-age/page"),
  "/tunnel/verify": () => import("@/app/tunnel/verify/page"),

  // Dashboard
  "/dashboard": () => import("@/app/dashboard/page"),
  "/dashboard/activity": () => import("@/app/dashboard/activity/page"),
  "/dashboard/admin": () => import("@/app/dashboard/admin/page"),
  "/dashboard/ai-chat": () => import("@/app/dashboard/ai-chat/page"),
  "/dashboard/ai-studio": () => import("@/app/dashboard/ai-studio/page"),
  "/dashboard/applications": () => import("@/app/dashboard/applications/page"),
  "/dashboard/billing": () => import("@/app/dashboard/billing/page"),
  "/dashboard/blog": () => import("@/app/dashboard/blog/page"),
  "/dashboard/blog/analytics": () => import("@/app/dashboard/blog/analytics/page"),
  "/dashboard/blog/builder": () => import("@/app/dashboard/blog/builder/page"),
  "/dashboard/blog/members": () => import("@/app/dashboard/blog/members/page"),
  "/dashboard/blog/scripts": () => import("@/app/dashboard/blog/scripts/page"),
  "/dashboard/blog/settings": () => import("@/app/dashboard/blog/settings/page"),
  "/dashboard/calendar": () => import("@/app/dashboard/calendar/page"),
  "/dashboard/chat": () => import("@/app/dashboard/chat/page"),
  "/dashboard/elo": () => import("@/app/dashboard/elo/page"),
  "/dashboard/elo/leaderboard": () => import("@/app/dashboard/elo/leaderboard/page"),
  "/dashboard/elo/vote": () => import("@/app/dashboard/elo/vote/page"),
  "/dashboard/identity": () => import("@/app/dashboard/identity/page"),
  "/dashboard/luminos-club": () => import("@/app/dashboard/luminos-club/page"),
  "/dashboard/infrastructure/nodes": () => import("@/app/dashboard/infrastructure/nodes/page"),
  "/dashboard/infrastructure/visual-editor": () => import("@/app/dashboard/infrastructure/visual-editor/page"),
  "/dashboard/mailbox": () => import("@/app/dashboard/mailbox/page"),
  "/dashboard/nodes": () => import("@/app/dashboard/nodes/page"),
  "/dashboard/organisations": () => import("@/app/dashboard/organisations/page"),
  "/dashboard/organisations/create": () => import("@/app/dashboard/organisations/create/page"),
  "/dashboard/servers": () => import("@/app/dashboard/servers/page"),
  "/dashboard/settings": () => import("@/app/dashboard/settings/page"),
  "/dashboard/student-benefits": () => import("@/app/dashboard/student-benefits/page"),
  "/dashboard/subusers/invites": () => import("@/app/dashboard/subusers/invites/page"),
  "/dashboard/tickets": () => import("@/app/dashboard/tickets/page"),
  "/dashboard/tickets/new": () => import("@/app/dashboard/tickets/new/page"),
  "/dashboard/tunnels": () => import("@/app/dashboard/tunnels/page"),
};

// Dynamic route patterns with param names
const dynamicRoutes: Array<{ re: RegExp; loader: Loader; keys: string[] }> = [
  { re: /^\/share\/([^/]+)$/, keys: ["token"], loader: () => import("@/app/share/[token]/page") },
  { re: /^\/blog\/([^/]+)$/, keys: ["slug"], loader: () => import("@/app/blog/[slug]/page") },
  { re: /^\/blog\/([^/]+)\/([^/]+)$/, keys: ["slug", "postSlug"], loader: () => import("@/app/blog/[slug]/[postSlug]/page") },
  { re: /^\/blog\/([^/]+)\/author\/([^/]+)$/, keys: ["slug", "userId"], loader: () => import("@/app/blog/[slug]/author/[userId]/page") },
  { re: /^\/contributors\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/contributors/[id]/page") },
  { re: /^\/calendar\/book\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/calendar/book/[id]/page") },
  { re: /^\/elo\/projects\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/elo/projects/[id]/page") },
  { re: /^\/elo\/users\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/elo/users/[id]/page") },
  { re: /^\/reset-password\/([^/]+)$/, keys: ["token"], loader: () => import("@/app/reset-password/[token]/page") },
  { re: /^\/forms\/([^/]+)$/, keys: ["slug"], loader: () => import("@/app/forms/[slug]/page") },
  { re: /^\/dashboard\/servers\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/dashboard/servers/[id]/page") },
  { re: /^\/dashboard\/organisations\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/dashboard/organisations/[id]/page") },
  { re: /^\/dashboard\/tickets\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/dashboard/tickets/[id]/page") },
  { re: /^\/dashboard\/billing\/checkout$/, keys: [], loader: () => import("@/app/dashboard/billing/checkout/page") },
  { re: /^\/dashboard\/blog\/posts\/new$/, keys: [], loader: () => import("@/app/dashboard/blog/posts/new/page") },
  { re: /^\/dashboard\/blog\/posts\/([^/]+)\/edit$/, keys: ["id"], loader: () => import("@/app/dashboard/blog/posts/[id]/edit/page") },
  { re: /^\/dashboard\/elo\/projects\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/dashboard/elo/projects/[id]/page") },
  { re: /^\/dashboard\/elo\/users\/([^/]+)$/, keys: ["id"], loader: () => import("@/app/dashboard/elo/users/[id]/page") },
  { re: /^\/dashboard\/organisations\/([^/]+)\/billing$/, keys: ["id"], loader: () => import("@/app/dashboard/organisations/[id]/billing/page") },
];

function matchRoute(pathname: string): RouteMatch | null {
  const exact = staticRoutes[pathname];
  if (exact) return { loader: exact, params: {} };

  for (const dr of dynamicRoutes) {
    const m = pathname.match(dr.re);
    if (m) {
      const params: Record<string, string> = {};
      dr.keys.forEach((key, i) => { params[key] = m[i + 1]; });
      return { loader: dr.loader, params };
    }
  }
  return null;
}

function Loading() {
  return <RouteSkeleton />;
}

// Neutral placeholder for public/auth pages (login, register, docs, etc.) so
// the dashboard's header+stat-card skeleton never flashes on non-dashboard routes.
function PublicLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function NotFound() {
  const LazyNotFound = React.lazy(() => import("@/app/not-found"));
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <LazyNotFound />
    </Suspense>
  );
}

export default function AppRouter({ serverPathname }: { serverPathname?: string }) {
  const rawPathname = usePathname();
  const pathname = rawPathname || serverPathname || "/";

  const match = React.useMemo(() => matchRoute(pathname), [pathname]);
  const isDashboard = pathname.startsWith("/dashboard");
  const isDocs = pathname.startsWith("/docs");

  function wrapLayout(children: React.ReactNode, notFound: boolean) {
    if (isDashboard) {
      const LazyLayout = React.lazy(() => import("@/app/dashboard/layout"));
      return <Suspense fallback={<Loading />}><LazyLayout>{children}</LazyLayout></Suspense>;
    }
    if (isDocs) {
      const LazyLayout = React.lazy(() => import("@/app/docs/layout"));
      return <Suspense fallback={<PublicLoading />}><LazyLayout>{children}</LazyLayout></Suspense>;
    }
    return <>{children}</>;
  }

  if (!match) {
    return wrapLayout(<NotFound />, true);
  }

  const Page = React.lazy(match.loader);
  const pageParams = match.params;
  const paramsProp = { params: Promise.resolve(pageParams) };
  return wrapLayout(
    <Suspense fallback={isDashboard ? <Loading /> : <PublicLoading />}><Page {...paramsProp} /></Suspense>,
    false
  );
}
