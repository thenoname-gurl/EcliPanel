"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRollout } from "@/hooks/use-rollout"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const SUBMITTED_KEY = "feedback_submitted"
const DISMISSED_KEY = "feedback_dismissed"
const DISMISS_COOLDOWN = 30 * 60 * 1000
const ROLLOUT_KEY = "feedback_prompt"
const WORD_LIMIT = 250

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function FeedbackDialog() {
  const { user } = useAuth()
  const { inRollout } = useRollout(ROLLOUT_KEY)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const hasChecked = useRef(false)

  const checkPrompt = useCallback(async () => {
    if (!user || !inRollout || hasChecked.current) return
    hasChecked.current = true

    if (sessionStorage.getItem(SUBMITTED_KEY)) return

    const dismissedAt = sessionStorage.getItem(DISMISSED_KEY)
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_COOLDOWN) return

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guide') === 'true') return

    try {
      const data = await apiFetch("/api/feedback/check")
      if (data?.shouldPrompt) {
        setOpen(true)
      }
    } catch {
      // silently fail
    }
  }, [user, inRollout])

  useEffect(() => {
    checkPrompt()
  }, [checkPrompt])

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setOpen(false)
  }

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a rating"); return }

    setSubmitting(true)
    setError("")

    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ rating, message: message.trim() }),
      })
      sessionStorage.setItem(SUBMITTED_KEY, "1")
      setSubmitted(true)
    } catch (e: any) {
      if (e?.status === 409) {
        sessionStorage.setItem(SUBMITTED_KEY, "1")
        setSubmitted(true)
      } else {
        setError(e?.message || "Failed to submit feedback")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const starLabels = ["", "Very Poor", "Poor", "Okay", "Good", "Excellent"]
  const wordCount = message ? countWords(message) : 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitted) handleDismiss() }}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">Thank You!</DialogTitle>
              <DialogDescription className="text-center">
                Your feedback helps us improve the panel.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <div className="rounded-full bg-primary/10 p-4">
                <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
              Close
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>How are we doing?</DialogTitle>
              <DialogDescription>
                Your honest feedback helps us make the panel better for everyone.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-6 py-4">
              {/* Stars */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-all duration-150 hover:scale-110"
                    title={starLabels[star]}
                  >
                    <svg
                      className={`h-9 w-9 ${
                        star <= (hovered || rating)
                          ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.4)]"
                          : "text-muted-foreground/30"
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm font-medium text-foreground">{starLabels[rating]}</p>
              )}

              {/* Message */}
              <div className="w-full space-y-1.5">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more (optional, up to 250 words)..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                />
                <div className="flex justify-between items-center">
                  {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                  ) : (
                    <span />
                  )}
                  <span className={`text-xs ${wordCount > WORD_LIMIT ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {wordCount}/{WORD_LIMIT}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDismiss}>
                Not now
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={rating === 0 || submitting || wordCount > WORD_LIMIT}
              >
                {submitting ? "Submitting..." : "Submit feedback"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}