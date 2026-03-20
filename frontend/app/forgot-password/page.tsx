"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!email) {
      setError("Please enter your email address")
      return
    }
    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.passwordResetRequest, {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setMessage("If that email exists, you will receive password reset instructions shortly.")
      setEmail("")
    } catch (err: any) {
      setError(err.message || "Failed to request password reset")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <h2 className="mb-4 text-center text-2xl font-semibold text-foreground">Reset password</h2>
        <p className="mb-4 text-sm text-muted-foreground">Enter your email and we’ll send a reset link.</p>

        {message && <div className="mb-4 rounded bg-success/10 px-4 py-2 text-success">{message}</div>}
        {error && <div className="mb-4 rounded bg-destructive/10 px-4 py-2 text-destructive">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" 
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset email"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
