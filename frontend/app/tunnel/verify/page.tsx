"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { apiFetch } from "@/lib/api-client"

export default function TunnelVerifyPage() {
  const searchParams = useSearchParams()
  const userCode = searchParams?.get('user_code') || searchParams?.get('userCode')
  const { isLoggedIn } = useAuth()
  const [claimStatus, setClaimStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn) {
      setClaimStatus('idle')
      setClaimError(null)
    }
  }, [isLoggedIn])

  async function claimDevice() {
    if (!userCode) return

    setClaimStatus('pending')
    setClaimError(null)

    try {
      await apiFetch('/api/tunnel/device/approve', {
        method: 'POST',
        body: { user_code: userCode },
      })
      setClaimStatus('success')
    } catch (err: any) {
      setClaimStatus('error')
      setClaimError(err?.message || 'Failed to link this device')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-semibold text-foreground">Tunnel Device Verification</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          To complete tunnel device enrollment, open the admin dashboard and approve the pending device.
        </p>

        {userCode ? (
          <div className="mb-6 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
            <p className="font-medium text-foreground">Device code:</p>
            <p className="mt-2 break-words text-base font-semibold">{userCode}</p>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
            <p>No device code was provided in the URL.</p>
            <p className="mt-2 text-muted-foreground">
              Use the code shown by the tunnel agent to find and approve the pending device in the dashboard.
            </p>
          </div>
        )}

        {userCode ? (
          <div className="mb-6 rounded-xl border border-border bg-background p-4 text-sm text-foreground">
            <p className="font-medium text-foreground">Link this device to your account</p>
            <p className="mt-2 text-muted-foreground">
              If you are signed in, use the device code above to approve and link the pending tunnel device to your account.
            </p>

            {isLoggedIn ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={claimDevice}
                  disabled={claimStatus === 'pending'}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {claimStatus === 'pending' ? 'Linking...' : 'Link device'}
                </button>
                {claimStatus === 'success' && (
                  <span className="text-sm text-emerald-600">Device linked successfully. You can manage it in the dashboard.</span>
                )}
                {claimStatus === 'error' && claimError && (
                  <span className="text-sm text-destructive">{claimError}</span>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>Please sign in to link the device to your account.</p>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 mt-3"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-4 text-sm text-foreground">
          <p>
            1. Go to <Link href="/dashboard/tunnels" className="text-primary hover:underline">Dashboard &rarr; Tunnels</Link>.
          </p>
          <p>2. Find the pending tunnel device and approve it.</p>
          <p>3. Once approved, the tunnel agent can poll for the access token and connect.</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/tunnels"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open Tunnel Dashboard
          </Link>
          <Link
            href="/legal"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-border"
          >
            Read tunnel setup docs
          </Link>
        </div>
      </div>
    </div>
  )
}