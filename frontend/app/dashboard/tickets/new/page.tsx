"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Send } from "lucide-react"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

export default function NewTicketPage() {
  const router = useRouter()
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [priority, setPriority] = useState("medium")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      setError("Subject and message are required.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch(API_ENDPOINTS.tickets, {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), priority }),
      })
      router.push("/dashboard/tickets")
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit ticket. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <PanelHeader title="New Ticket" description="Submit a support request" />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-6 space-y-6">
          {/* Back */}
          <button
            onClick={() => router.push("/dashboard/tickets")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tickets
          </button>

          {/* Card */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Open a Support Ticket</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Describe your issue in detail and our team will respond as soon as possible.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="subject">
                  Subject <span className="text-destructive">*</span>
                </label>
                <input
                  id="subject"
                  type="text"
                  placeholder="Brief summary of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="priority">
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                >
                  <option value="low">Low — general question / non-urgent</option>
                  <option value="medium">Medium — something is not working as expected</option>
                  <option value="high">High — service significantly impacted</option>
                  <option value="urgent">Urgent — complete outage / critical issue</option>
                </select>
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="message">
                  Message <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="message"
                  placeholder="Describe your issue in as much detail as possible. Include any error messages, steps to reproduce, and what you expected to happen."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{message.length} characters</p>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/tickets")}
                  className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Submit Ticket
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
