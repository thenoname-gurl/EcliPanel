"use client"

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";

interface User {
  id: number;
  email: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  displayName?: string;
  address?: string;
  address2?: string;
  phone?: string;
  billingCompany?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountry?: string;
  tier?: string;
  role?: string;
  sessionId?: string;
  org?: { id: number; name: string; handle: string } | null;
  orgRole?: string;
  emailVerified?: boolean;
  studentVerified?: boolean;
  passkeyCount?: number;
  avatarUrl?: string;
  euIdVerificationDisabled?: boolean;
  settings?: Record<string, any>;
}

interface AuthContextType {
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    apiFetch(API_ENDPOINTS.session, { method: "GET" })
      .then((data) => {
        setUser(data.user);
        try {
          if (typeof window !== 'undefined' && data?.user?.settings?.theme?.name) {
            document.cookie = `eclipseTheme=${encodeURIComponent(data.user.settings.theme.name)}; path=/`;
          }
        } catch (e) {}
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const sv = params.get('studentVerified');
          if (sv !== null) {
            if (sv === '1') {
              alert('Student status verified! Educational limits applied.');
            } else {
              alert('GitHub did not return student status.');
            }
            params.delete('studentVerified');
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState({}, '', newUrl);
            apiFetch(API_ENDPOINTS.session, { method: 'GET' }).then((d) => setUser(d.user)).catch(() => {});
          }
        }
      })
      .catch(() => {
        setUser(null);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch(API_ENDPOINTS.login, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    console.debug('[useAuth] login response', data);
    if (data.twoFactorRequired) return data;
    if (data.token) {
      if (typeof window !== 'undefined') {
        console.debug('[useAuth] storing token to localStorage', data.token.slice(0,8) + '...');
        localStorage.setItem('token', data.token);
        console.debug('[useAuth] localStorage.token now', localStorage.getItem('token')?.slice(0,8) + '...');
      }
    } else {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
    }
    if (data.user) {
      setUser(data.user);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      await refreshUser(data.token);
      return { ok: true };
    } catch (e) {
      console.debug('[useAuth] failed to fetch session after login', e);
      return data;
    }
  };

  const logout = async () => {
    try {
      await apiFetch(API_ENDPOINTS.logout, { method: "POST" });
    } catch {
      // skip
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    setUser(null);
    router.push("/login");
  };

  const refreshUser = async (token?: string) => {
    try {
      const opts: any = { method: 'GET' };
      if (token) {
        opts.headers = { Authorization: `Bearer ${token}` };
      }
      const session = await apiFetch(API_ENDPOINTS.session, opts);
      setUser(session.user);
    } catch {
      // skip
    }
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    refreshUser,
    isLoggedIn: !!user,
  };

  useEffect(() => {
    if (user && typeof window !== 'undefined' && pathname) {
      if (
        pathname === '/' ||
        pathname === '/register' ||
        pathname.startsWith('/login')
      ) {
        router.replace('/dashboard');
      }
    }
  }, [user, pathname, router]);

  return (
    <AuthContext.Provider value={value}>
      <div className="min-h-screen">
        {user === undefined && (
          <div className="w-full p-2 text-center text-sm text-muted-foreground bg-secondary/10">Fetching session data from server...</div>
        )}
        {children}
      </div>
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
