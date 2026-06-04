"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRollout } from "@/hooks/use-rollout"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Star, MessageSquare } from "lucide-react"

const WORD_LIMIT = 250

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function FeedbackSettingsCard() {
  const { user } = useAuth()
  const { inRollout } = useRollout("feedback_prompt")
  const [loading, setLoading] = useState(true)
  const [hasExisting, setHasExisting] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user || !inRollout) return

    apiFetch("/api/feedback")
      .then((data) => {
        if (data?.rating) {
          setRating(data.rating)
          setMessage(data.message || "")
          setHasExisting(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, inRollout])

  if (!user || !inRollout) return null
  if (loading) return null

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a rating"); return }
    setSubmitting(true)
    setError("")
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ rating, message: message.trim() }),
      })
      setHasExisting(true)
      setSaved(true)
    } catch (e: any) {
      setError(e?.message || "Failed to save feedback")
    } finally {
      setSubmitting(false)
    }
  }

  const wordCount = message ? countWords(message) : 0
  const starLabels = ["", "Very Poor", "Poor", "Okay", "Good", "Excellent"]

  return (
    <div className="border border-border bg-card/50 backdrop-blur-sm p-4 md:p-6 min-w-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          {saved ? (
            <>
              <p className="text-sm font-semibold text-foreground">Feedback saved!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Thank you — your input helps us make EcliPanel better.
              </p>
              <div className="mt-3 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => setSaved(false)}
              >
                Update my feedback
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                {hasExisting ? "Your feedback" : "Are you enjoying EcliPanel?"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasExisting
                  ? "Update your rating and thoughts below."
                  : "We&apos;d love to hear your thoughts. Rate your experience below."}
              </p>

              <div className="flex items-center gap-1.5 mt-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-all duration-150 hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 ${
                        star <= (hovered || rating)
                          ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.3)]"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-xs font-medium text-foreground mt-1.5">{starLabels[rating]}</p>
              )}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us more (optional, up to 250 words)..."
                rows={3}
                className="mt-3 w-full resize-none border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center justify-between mt-2">
                {error ? (
                  <p className="text-xs text-destructive">{error}</p>
                ) : (
                  <span />
                )}
                <span className={`text-xs ${wordCount > WORD_LIMIT ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {wordCount}/{WORD_LIMIT}
                </span>
              </div>

              <Button
                className="mt-3"
                size="sm"
                onClick={handleSubmit}
                disabled={rating === 0 || submitting || wordCount > WORD_LIMIT}
              >
                {submitting ? "Saving..." : hasExisting ? "Update feedback" : "Submit feedback"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
