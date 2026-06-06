"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, ArrowRight, Shield, Link2 } from "lucide-react"

export default function TunnelVerifyPage() {
  const searchParams = useSearchParams()
  const userCode = searchParams?.get("user_code") || searchParams?.get("userCode")
  const { isLoggedIn } = useAuth()
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle")
  const [claimError, setClaimError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn) {
      setClaimStatus("idle")
      setClaimError(null)
    }
  }, [isLoggedIn])

  async function claimDevice() {
    if (!userCode) return

    setClaimStatus("pending")
    setClaimError(null)

    try {
      await apiFetch("/api/tunnel/device/approve", {
        method: "POST",
        body: { user_code: userCode },
      })
      setClaimStatus("success")
    } catch (err: any) {
      setClaimStatus("error")
      setClaimError(err?.message || "Failed to link this device")
    }
  }

  return (
    <div className="bg-[#0a0a0f] min-h-screen text-white flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-6 sm:px-12 lg:px-40 py-5">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="h-9 w-9 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-[#8b5cf6]" />
          </div>
          <h1 className="text-lg font-flink font-semibold text-white">
            Tunnel Device Verification
          </h1>
        </motion.div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12 lg:px-40 py-12">
        <motion.div
          className="w-full max-w-lg border border-white/20 p-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        >
          {/* ── Device Code or Missing ──────────────────────────────── */}
          {userCode ? (
            <motion.div
              className="mb-8 border border-white/10 bg-white/[0.02] px-4 py-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-white/50 text-xs font-inter tracking-widest uppercase mb-3">
                Device Code
              </p>
              <p className="font-mono text-lg sm:text-xl font-semibold text-white break-all">
                {userCode}
              </p>
            </motion.div>
          ) : (
            <motion.div
              className="mb-8 border border-white/10 bg-white/[0.02] px-4 py-5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-white/70 text-sm font-inter">
                No device code was provided in the URL.
              </p>
              <p className="text-white/50 text-sm font-inter mt-2">
                Use the code shown by your tunnel agent to find and approve the
                pending device in the dashboard.
              </p>
            </motion.div>
          )}

          {/* ── Claim Device ────────────────────────────────────────── */}
          {userCode ? (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <p className="text-white font-flink text-base mb-1">
                Link this device to your account
              </p>
              <p className="text-white/60 text-sm font-inter mb-5">
                Approve and link the pending tunnel device to your account
                using the code above.
              </p>

              {isLoggedIn ? (
                <div className="space-y-4">
                  <motion.button
                    type="button"
                    onClick={claimDevice}
                    disabled={claimStatus === "pending" || claimStatus === "success"}
                    className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 font-inter text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
                    whileTap={{ scale: 0.97 }}
                  >
                    {claimStatus === "pending" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin rounded-full" />
                        Linking...
                      </>
                    ) : claimStatus === "success" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />
                        Linked
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        Link device
                      </>
                    )}
                  </motion.button>

                  <AnimatePresence>
                    {claimStatus === "success" && (
                      <motion.div
                        className="flex items-center gap-2 text-sm font-inter border border-[#4ade80]/20 bg-[#4ade80]/5 px-4 py-2"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-[#4ade80] shrink-0" />
                        <span className="text-white/80">
                          Device linked successfully. You can manage it in the
                          dashboard.
                        </span>
                      </motion.div>
                    )}
                    {claimStatus === "error" && claimError && (
                      <motion.div
                        className="flex items-center gap-2 text-sm font-inter border border-red-400/20 bg-red-400/5 px-4 py-2"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="text-red-400">{claimError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div
                  className="border border-white/10 bg-white/[0.02] p-5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                >
                  <p className="text-white/60 text-sm font-inter mb-4">
                    Please sign in to link the device to your account.
                  </p>
                  <Link
                    href={`/login?redirect=/tunnel/verify?user_code=${encodeURIComponent(userCode)}`}
                    className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 font-inter text-sm text-white hover:bg-white/5 transition-colors"
                  >
                    Sign in
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </motion.div>
              )}
            </motion.div>
          ) : null}

          {/* ── Steps (always visible) ───────────────────────────────── */}
          <motion.div
            className="border-t border-white/10 pt-6 space-y-3"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <p className="text-white/50 text-xs font-inter tracking-widest uppercase mb-3">
              How it works
            </p>
            {[
              {
                step: "1",
                label: "Open",
                target: "Dashboard → Tunnels",
                href: "/dashboard/tunnels",
              },
              {
                step: "2",
                label: "Find the pending tunnel device and approve it",
              },
              {
                step: "3",
                label: "Once approved, the tunnel agent can poll for the access token and connect",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
              >
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center text-[11px] font-flink text-[#8b5cf6] mt-0.5">
                  {item.step}
                </span>
                <span className="text-white/70 text-sm font-inter">
                  {item.label}
                  {item.href && (
                    <>
                      {" "}
                      <Link
                        href={item.href}
                        className="text-[#8b5cf6] hover:underline"
                      >
                        {item.target}
                      </Link>
                    </>
                  )}
                </span>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Actions ──────────────────────────────────────────────── */}
          <motion.div
            className="border-t border-white/10 mt-6 pt-6 flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Link
              href="/dashboard/tunnels"
              className="inline-flex items-center justify-center gap-2 border border-white/20 px-5 py-2.5 font-inter text-sm text-white hover:bg-white/5 transition-colors"
            >
              Open Tunnel Dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center gap-2 border border-white/20 px-5 py-2.5 font-inter text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Read tunnel docs
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
