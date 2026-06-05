"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAuth } from "@/hooks/useAuth"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldAlert, ArrowRight, RefreshCw, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

const ALLOWED_PATHS = ["/dashboard/identity", "/dashboard/settings"]

export function KycBanner() {
  const t = useTranslations("kycBanner")
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [kycNeeded, setKycNeeded] = useState(false)
  const [kycVerified, setKycVerified] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [forceShow, setForceShow] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const remountKey = useRef(0)

  useEffect(() => {
    if (!user) { setChecking(false); return }
    const k = (user as any).kycRequired
    const v = (user as any).kycVerified
    if (k && !v) {
      setKycNeeded(true)
      setKycVerified(false)
    }
    setChecking(false)
  }, [user])

  useEffect(() => {
    if (!kycNeeded || kycVerified) return
    if (pathname && ALLOWED_PATHS.some(p => pathname.startsWith(p))) {
      setForceShow(false)
      return
    }
    setForceShow(true)
  }, [kycNeeded, kycVerified, pathname])

  useEffect(() => {
    if (!forceShow) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [forceShow])

  const reattachOverlay = useCallback(() => {
    remountKey.current++
    setForceShow(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (kycNeeded && !kycVerified) {
          setForceShow(true)
        }
      })
    })
  }, [kycNeeded, kycVerified])

  useEffect(() => {
    if (!forceShow) return
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.removedNodes) {
          if (node instanceof HTMLElement) {
            if (node.contains(overlayRef.current) || node === overlayRef.current) {
              reattachOverlay()
              return
            }
          }
        }
        if (m.type === "childList" && m.target === document.body) {
          for (const node of m.removedNodes) {
            if (node instanceof HTMLElement && node.querySelector('[data-kyc-overlay]')) {
              reattachOverlay()
              return
            }
          }
        }
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    observerRef.current = obs
    return () => { obs.disconnect() }
  }, [forceShow, reattachOverlay])

  useEffect(() => {
    if (!forceShow) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [forceShow])

  useEffect(() => {
    if (!kycNeeded || kycVerified) return
    const interval = setInterval(() => {
      if ((user as any)?.kycVerified) {
        setKycVerified(true)
        setKycNeeded(false)
        setForceShow(false)
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [kycNeeded, kycVerified, user])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const session = await apiFetch(API_ENDPOINTS.session)
      if ((session as any)?.user?.kycVerified) {
        setKycVerified(true)
        setKycNeeded(false)
        setForceShow(false)
      }
    } catch {} finally {
      setRefreshing(false)
    }
  }

  if (checking || !kycNeeded || kycVerified) return null
  if (!forceShow) return null

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        key={remountKey.current}
        data-kyc-overlay
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-background/95 backdrop-blur-md"
        style={{ pointerEvents: "auto" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="mx-4 w-full max-w-md border border-border bg-card overflow-hidden"
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        >
          <div className="p-8 flex flex-col items-center text-center">
            <motion.div
              className="h-16 w-16 flex items-center justify-center bg-amber-500/10 mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
            >
              <ShieldAlert className="h-8 w-8 text-amber-500" />
            </motion.div>

            <h1 className="text-xl font-bold text-foreground mb-2">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              {t("description") || "To comply with regional regulations, you must verify your identity before accessing the panel. This is a one-time process — upload your ID document and a selfie to get verified."}
            </p>

            <div className="w-full space-y-3">
              <motion.button
                onClick={() => router.push("/dashboard/identity")}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium py-3 px-6 transition-colors text-sm"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {t("verify") || "Verify Identity"}
                <ArrowRight className="h-4 w-4" />
              </motion.button>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground py-2 transition-colors disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("checkStatus") || "I already verified elsewhere — check status"}
              </button>
            </div>
          </div>

          <div className="border-t border-border px-8 py-4 bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              {t("adminContact") || "If you believe this is a mistake, contact our support at hi@ecli.app."}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
