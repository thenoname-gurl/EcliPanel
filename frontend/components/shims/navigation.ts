"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeToUrlChanges(callback: () => void): () => void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    callback();
  };
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    callback();
  };

  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
  };
}

function getLocation(): { pathname: string; search: string; hash: string } {
  if (typeof window === "undefined") {
    return { pathname: "/", search: "", hash: "" };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

const locationSnapshot = { current: getLocation() };
let listeners: (() => void)[] = [];

function notifyListeners() {
  locationSnapshot.current = getLocation();
  listeners.forEach((fn) => fn());
}

// Seed the store with the pathname the server actually rendered. Called once on
// the client during SSR hydrate (AppRouter), and ignored otherwise. Without it,
// usePathname() returns "/" during SSR, so the AppRouter SSR's the 404 component
// for every route and then flashes to the real page on hydration.
export function seedLocation(pathname: string) {
  if (typeof window !== "undefined") return; // client nav always wins after hydrate
  locationSnapshot.current = { pathname, search: "", hash: "" };
}

let subscribed = false;
function ensureSubscribed() {
  if (typeof window === "undefined") return;
  if (!subscribed) {
    subscribed = true;
    subscribeToUrlChanges(notifyListeners);
  }
}

function useLocationStore() {
  return useSyncExternalStore(
    (cb) => {
      ensureSubscribed();
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => locationSnapshot.current,
    () => locationSnapshot.current,
  );
}

export function useRouter() {
  return {
    push(url: string) {
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", url);
        notifyListeners();
      }
    },
    replace(url: string) {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", url);
        notifyListeners();
      }
    },
    back() {
      if (typeof window !== "undefined") {
        window.history.back();
      }
    },
  };
}

export function usePathname(): string {
  const loc = useLocationStore();
  return loc.pathname;
}

export function useSearchParams(): URLSearchParams {
  const loc = useLocationStore();
  return new URLSearchParams(loc.search);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const [params, setParams] = useState<T>(() => {
    if (typeof document !== "undefined") {
      const el = document.getElementById("__astro_params");
      if (el?.textContent) {
        try { return JSON.parse(el.textContent) as T; } catch {}
      }
    }
    return {} as T;
  });

  useEffect(() => {
    if (Object.keys(params).length > 0) return;
    let attempts = 0;
    const tryRead = () => {
      if (typeof document === "undefined") return;
      const el = document.getElementById("__astro_params");
      if (el?.textContent) {
        try { setParams(JSON.parse(el.textContent)); } catch {}
        return;
      }
      if (++attempts < 5) setTimeout(tryRead, 50 * attempts);
    };
    tryRead();
  }, [params]);

  return params;
}

export function redirect(url: string): never {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `REDIRECT;${url};303` });
}

export function permanentRedirect(url: string): never {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `REDIRECT;${url};308` });
}

export { useLocationStore as unstable_useLocation };