"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import Link from "next/link"

export default function ResetPasswordPage() {
  const { token } = useParams() as { token: string }
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!password || !confirm) {
      setError("Please fill both password fields")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.passwordResetConfirm, {
        method: "POST",
        body: JSON.stringify({ token, password }),
      })
      setMessage("Password updated successfully. Redirecting to login...")
      setTimeout(() => router.push("/login"), 1500)
    } catch (err: any) {
      setError(err.message || "Failed to reset password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <h2 className="mb-4 text-center text-2xl font-semibold text-foreground">Set your new password</h2>

        {message && <div className="mb-4 rounded bg-success/10 px-4 py-2 text-success">{message}</div>}
        {error && <div className="mb-4 rounded bg-destructive/10 px-4 py-2 text-destructive">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" 
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" 
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
