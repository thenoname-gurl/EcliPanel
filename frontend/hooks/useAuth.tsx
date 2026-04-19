"use client"

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { THEMES, applyTheme } from "@/lib/themes"
import { Loader2 } from "lucide-react"
import { locales, type AppLocale } from "@/i18n/config"

export interface User {
  id: number
  email: string
  firstName?: string
  middleName?: string
  lastName?: string
  displayName?: string
  address?: string
  address2?: string
  phone?: string
  billingCompany?: string
  billingCity?: string
  billingState?: string
  billingZip?: string
  billingCountry?: string
  tier?: string
  role?: string
  permissions?: string[]
  sessionId?: string
  org?: { id: number; name: string; handle: string } | null
  orgs?: Array<{ id: number; name: string; handle: string; portalTier?: string; avatarUrl?: string | null; orgRole?: string }>
  orgRole?: string
  emailVerified?: boolean
  studentVerified?: boolean
  passkeyCount?: number
  twoFactorEnabled?: boolean
  avatarUrl?: string
  supportBanned?: boolean
  supportBanReason?: string | null
  suspended?: boolean
  idVerified?: boolean
  euIdVerificationDisabled?: boolean
  settings?: Record<string, any>
  guideShown?: boolean
  dateOfBirth?: string
  age?: number
  parentId?: number | null
  isChildAccount?: boolean
  ageVerificationRequired?: boolean
  limits?: Record<string, number> | null
}

interface AuthContextType {
  user: User | null | undefined
  login: (email: string, password: string) => Promise<any>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  selectOrganisation: (orgId: number | string) => Promise<void>
  isLoggedIn: boolean
  isLoading: boolean
}

type AuthState = "initializing" | "authenticated" | "unauthenticated" | "logging-in" | "logging-out"

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function hasCompletedGuide(user: User | null | undefined): boolean {
  if (!user) return true
  return user.guideShown === true || user.settings?.guideShown === true
}

function permissionMatches(granted: string, required: string) {
  if (!granted || !required) return false
  if (granted === '*') return true
  if (granted === required) return true
  const parts = String(granted).split(':')
  const reqParts = String(required).split(':')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '*') return true
    if (reqParts[i] !== parts[i]) return false
  }
  return true
}

export function hasPermission(user: User | null | undefined, required: string): boolean {
  if (!user) return false
  if (user.role === '*' || user.role === 'rootAdmin' || user.role === 'admin') return true
  const perms = Array.isArray(user.permissions) ? user.permissions : []
  if (perms.includes('*')) return true
  return perms.some((p) => permissionMatches(p, required))
}

function needsAgeVerification(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*') return false
  if (user.dateOfBirth) return false
  return user.ageVerificationRequired === true || user.age == null
}

function applyUserTheme(user: User | null | undefined): void {
  if (!user?.settings?.theme?.name) return
  const theme = THEMES.find((t) => t.name === user.settings!.theme.name)
  if (theme) {
    applyTheme(theme)
  }
}

function applyUserLocale(user: User | null | undefined): void {
  if (typeof document === "undefined") return
  const locale = user?.settings?.locale
  if (!locale || !locales.includes(locale as AppLocale)) return
  document.cookie = `locale=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

function getUrlParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function updateUrlParams(params: URLSearchParams): void {
  if (typeof window === "undefined") return
  const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "")
  window.history.replaceState({}, "", newUrl)
}

function AuthLoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
          <Loader2 className="absolute inset-0 h-12 w-12 animate-spin text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="text-xs text-muted-foreground mt-1">Please wait...</p>
        </div>
      </div>
    </div>
  )
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [authState, setAuthState] = useState<AuthState>("initializing")
  const router = useRouter()
  const pathname = usePathname()
  
  const guideCheckPerformed = useRef(false)
  const ageVerificationPrompted = useRef(false)
  const isCheckingGuide = useRef(false)

  const checkAndPromptGuide = useCallback(async (currentUser: User): Promise<void> => {
    if (isCheckingGuide.current) return
    
    if (hasCompletedGuide(currentUser)) {
      guideCheckPerformed.current = true
      return
    }

    const params = getUrlParams()
    if (params.get("guide") === "true") {
      guideCheckPerformed.current = true
      return
    }

    isCheckingGuide.current = true

    try {
      await apiFetch(
        API_ENDPOINTS.userGuide.replace(":id", String(currentUser.id)),
        {
          method: "POST",
          body: JSON.stringify({ shown: true }),
        }
      )

      params.set("guide", "true")
      updateUrlParams(params)

      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new PopStateEvent("popstate"))
        } catch {
          try {
            window.dispatchEvent(new Event("popstate"))
          } catch {}
        }
      }

      guideCheckPerformed.current = true
    } catch (error) {
      console.error("[useAuth] Failed to mark guide as shown:", error)
    } finally {
      isCheckingGuide.current = false
    }
  }, [])

  const handleStudentVerificationCallback = useCallback((): void => {
    if (typeof window === "undefined") return

    const params = getUrlParams()
    const sv = params.get("studentVerified")

    if (sv === null) return

    if (sv === "1") {
      setTimeout(() => {
        alert("Student status verified! Educational limits have been applied to your account.")
      }, 100)
    } else {
      setTimeout(() => {
        alert("OAuth did not return student status. Please try again or contact support.")
      }, 100)
    }

    params.delete("studentVerified")
    updateUrlParams(params)
  }, [])

  const refreshUser = useCallback(async (token?: string): Promise<void> => {
    try {
      const opts: RequestInit & { headers?: Record<string, string> } = { method: "GET" }
      if (token) {
        opts.headers = { Authorization: `Bearer ${token}` }
      }

      const session = await apiFetch(API_ENDPOINTS.session, opts)
      
      if (session?.user) {
        setUser(session.user)
        applyUserTheme(session.user)
        applyUserLocale(session.user)
        setAuthState("authenticated")
      } else {
        setUser(null)
        setAuthState("unauthenticated")
      }
    } catch (error) {
      console.error("[useAuth] Failed to refresh user:", error)
    }
  }, [])


  const login = useCallback(async (email: string, password: string): Promise<any> => {
    setAuthState("logging-in")

    try {
      const data = await apiFetch(API_ENDPOINTS.login, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })

      if (data.twoFactorRequired) {
        setAuthState("unauthenticated")
        return data
      }

      if (typeof window !== "undefined") {
        if (data.token) {
          localStorage.setItem("token", data.token)
        } else {
          localStorage.removeItem("token")
        }
      }

      if (data.user) {
        setUser(data.user)
        applyUserTheme(data.user)
        applyUserLocale(data.user)
        setAuthState("authenticated")

        guideCheckPerformed.current = false

        await checkAndPromptGuide(data.user)

        return { ok: true, user: data.user }
      }

      await refreshUser(data.token)

      const session = await apiFetch(API_ENDPOINTS.session, { method: "GET" })
      if (session?.user) {
        guideCheckPerformed.current = false
        await checkAndPromptGuide(session.user)
      }

      return { ok: true }
    } catch (error: any) {
      setAuthState("unauthenticated")
      throw error
    }
  }, [refreshUser, checkAndPromptGuide])

  const logout = useCallback(async (): Promise<void> => {
    setAuthState("logging-out")

    try {
      await apiFetch(API_ENDPOINTS.logout, { method: "POST" })
    } catch {
      // skip
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("token")
    }

    setUser(null)
    guideCheckPerformed.current = false
    setAuthState("unauthenticated")

    if (typeof window !== "undefined") {
      window.location.assign("/login")
    } else {
      router.push("/login")
    }
  }, [router])

  const selectOrganisation = useCallback(async (orgId: number | string): Promise<void> => {
    await apiFetch(API_ENDPOINTS.organisationSelect.replace(":id", String(orgId)), { method: "POST" })
    await refreshUser()
  }, [refreshUser])

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const data = await apiFetch(API_ENDPOINTS.session, { method: "GET" })

        if (!mounted) return

        if (data?.user) {
          setUser(data.user)
          applyUserTheme(data.user)
          applyUserLocale(data.user)
          setAuthState("authenticated")

          handleStudentVerificationCallback()

          if (!guideCheckPerformed.current) {
            await checkAndPromptGuide(data.user)
          }
        } else {
          setUser(null)
          setAuthState("unauthenticated")
        }
      } catch (error) {
        if (!mounted) return
        console.error("[useAuth] Initial session fetch failed:", error)
        setUser(null)
        setAuthState("unauthenticated")
      }
    }

    initializeAuth()

    return () => {
      mounted = false
    }
  }, [checkAndPromptGuide, handleStudentVerificationCallback])

  useEffect(() => {
    if (authState !== "authenticated" || !user || !pathname) return

    const authPages = ["/", "/register", "/login"]
    const isAuthPage = authPages.some(
      (page) => pathname === page || pathname.startsWith("/login")
    )

    if (isAuthPage) {
      router.replace("/dashboard")
    }
  }, [authState, user, pathname, router])

  useEffect(() => {
    if (authState !== "authenticated" || !user || !pathname) return
    const ageRequired = needsAgeVerification(user)
    const onSettingsPage = pathname.startsWith("/dashboard/settings")

    if (ageRequired && !onSettingsPage && !ageVerificationPrompted.current) {
      ageVerificationPrompted.current = true

      if (typeof window !== "undefined") {
        const shouldGoToSettings = window.confirm(
          "Your account needs a date of birth for age verification. Go to Settings now to update it?"
        )

        if (shouldGoToSettings) {
          router.push("/dashboard/settings?tab=profile&ageVerification=1")
        }
      }
    }
  }, [authState, user, pathname, router])

  useEffect(() => {
    if (!user || authState !== "authenticated") return
    if (guideCheckPerformed.current) return

    checkAndPromptGuide(user)
  }, [user, authState, checkAndPromptGuide])

  const value: AuthContextType = {
    user,
    login,
    logout,
    refreshUser,
    selectOrganisation,
    isLoggedIn: authState === "authenticated" && !!user,
    isLoading: authState === "initializing" || authState === "logging-in" || authState === "logging-out",
  }

  const renderLoadingState = () => {
    switch (authState) {
      case "initializing":
        return <AuthLoadingScreen message="Checking session..." />
      case "logging-in":
        return <AuthLoadingScreen message="Signing in..." />
      case "logging-out":
        return <AuthLoadingScreen message="Signing out..." />
      default:
        return null
    }
  }

  return (
    <AuthContext.Provider value={value}>
      <div className="min-h-screen">
        {renderLoadingState()}
        <div className={authState === "initializing" ? "opacity-0" : "opacity-100 transition-opacity duration-200"}>
          {children}
        </div>
      </div>
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}