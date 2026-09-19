"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sparkles, X, Loader2, Check, Copy, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { cn } from "@/lib/utils"
import type { OfficeApiRef } from "@/lib/office/editorApi"
import type { OfficeDocType } from "@/lib/office/types"

interface ProofreadResult {
  corrected?: string
  suggestions?: { before: string; after: string; reason?: string }[]
  raw?: string
}

interface Props {
  open: boolean
  onClose: () => void
  apiRef: OfficeApiRef
  docType: OfficeDocType
  canEdit: boolean
  docName: string
  autoCorrect: boolean
  onAutoCorrectChange: (v: boolean) => void
  /** Called with corrected markdown after auto-correct applies. */
  onAutoApplied?: (hash: string) => void
  onAutoCorrection?: (fixed: number) => void
}

const SYSTEM_PROMPT = `You are a professional proofreader. Fix spelling, grammar, punctuation, duplicate words and awkward phrasing in the user's document while strictly preserving the original meaning, tone, and any Markdown formatting (headings, lists, emphasis). Return ONLY a JSON object with no code fences, no commentary:
{"corrected":"<the full corrected document, preserving Markdown>","suggestions":[{"before":"<exact original fragment>","after":"<corrected fragment>","reason":"<short reason>"}]}
Include the 20 most useful suggestions. "before" must appear verbatim in the original text. If the text is already perfect, return {"corrected":"<unchanged text>","suggestions":[]}.`

function parseProofResult(raw: string): ProofreadResult {
  let text = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text)
  if (fence) text = fence[1].trim()
  try {
    const parsed = JSON.parse(text)
    return {
      corrected: typeof parsed.corrected === "string" ? parsed.corrected : undefined,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: any) => typeof s?.before === "string") : [],
      raw,
    }
  } catch {
    return { corrected: raw, suggestions: [], raw }
  }
}

export default function ProofreadPanel({
  open,
  onClose,
  apiRef,
  docType,
  canEdit,
  docName,
  autoCorrect,
  onAutoCorrectChange,
  onAutoApplied,
}: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ProofreadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [fixedCount, setFixedCount] = useState(0)
  const [mode, setMode] = useState<"suggest" | "apply">("suggest")

  const run = useCallback(
    async (silent = false): Promise<ProofreadResult | null> => {
      const api = apiRef.current
      if (!api || api.getMarkdown().trim() === "") return null
      setRunning(true)
      setError(null)
      if (!silent) {
        setResult(null)
        setApplied(false)
      }
      try {
        const res = await apiFetch(API_ENDPOINTS.aiChat, {
          method: "POST",
          body: { message: api.getMarkdown(), systemPrompt: SYSTEM_PROMPT, history: [] },
        })
        const reply = (res as any)?.reply
        if (!reply) {
          const msg = (res as any)?.error || "No reply from AI."
          if (!silent) setError(msg)
          return null
        }
        const parsed = parseProofResult(String(reply))
        if (!silent) {
          setResult(parsed)
          setFixedCount(parsed.suggestions?.length || 0)
        }
        return parsed
      } catch (e: any) {
        const msg = e?.message === "Forbidden" ? "AI features are disabled for this account." : "AI service temporarily unavailable."
        if (!silent) setError(msg)
        return null
      } finally {
        setRunning(false)
      }
    },
    [apiRef]
  )

  const applyAll = useCallback(
    (target?: ProofreadResult) => {
      const api = apiRef.current
      if (!api) return
      const combo = target || result
      if (!combo?.corrected) return
      if (docType !== "document" && docType !== "presentation") {
        navigator.clipboard?.writeText(combo.corrected).catch(() => {})
        toast.success("Corrected text copied to clipboard")
        setApplied(true)
        return
      }
      const n = api.applySuggestions?.(combo.suggestions || []) || 0
      setApplied(true)
      if (n > 0) {
        toast.success(`Applied ${n} correction(s)`)
      } else {
        toast.info("Nothing to apply — text already matches")
      }
      if (api.setSuggestions) api.setSuggestions([])
      if (docType === "presentation") onAutoApplied?.(combo.corrected)
    },
    [apiRef, result, docType, onAutoApplied]
  )

  // Auto-correct: re-run only when content actually changed since last pass.
  useEffect(() => {
    if (!open || !autoCorrect || (docType !== "document" && docType !== "presentation") || !canEdit) return
    let lastHash = ""
    const busy = { current: false }
    const timer = setInterval(() => {
      if (busy.current) return
      const api = apiRef.current
      if (!api) return
      const md = api.getMarkdown()
      if (md.trim() === "") return
      let h = 0
      for (let i = 0; i < md.length; i++) h = (h * 31 + md.charCodeAt(i)) >>> 0
      const hash = String(h)
      if (hash === lastHash) return
      busy.current = true
      void (async () => {
        try {
          const parsed = await run(true)
          if (parsed?.corrected) {
            lastHash = String(portableHash(parsed.corrected))
            if (mode === "suggest") {
              api.setSuggestions?.(parsed.suggestions || [])
            } else if (parsed.suggestions && parsed.suggestions.length > 0) {
              applyAll(parsed)
            }
          }
        } finally {
          busy.current = false
        }
      })()
    }, 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoCorrect, docType, canEdit, apiRef, mode, applyAll])

  function portableHash(text: string): number {
    let h = 0
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
    return h
  }

  if (!open) return null

  return (
    <div className="absolute right-2 top-12 z-40 flex max-h-[calc(100%-5rem)] w-[min(20rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-card shadow-2xl sm:right-3 sm:w-80">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">AI Proof-read</span>
        <button onClick={onClose} className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Close proof-read panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Auto-correct toggle */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
              Auto-correct
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {docType === "document" || docType === "presentation"
                ? "Run AI fixes while editing. Choose how they're applied."
                : "Available for documents and presentations."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoCorrect}
            disabled={docType !== "document" && docType !== "presentation"}
            onClick={() => onAutoCorrectChange(!autoCorrect)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40",
              autoCorrect ? "bg-emerald-500" : "bg-secondary"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                autoCorrect ? "left-[18px]" : "left-0.5"
              )}
            />
          </button>
        </div>
        {autoCorrect && (docType === "document" || docType === "presentation") && (
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              onClick={() => setMode("suggest")}
              className={cn("flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition", mode === "suggest" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              Suggest
            </button>
            <button
              onClick={() => setMode("apply")}
              className={cn("flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition", mode === "apply" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              Auto apply
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {!running && !result && !error && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sparkles className="h-6 w-6 text-primary/60" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Proof-reads “{docName}” for typos, grammar and style issues using AI.
            </p>
            <button
              onClick={() => run(false)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Proof-read now
            </button>
          </div>
        )}

        {running && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analyzing document…</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        {result && !error && (
          <div className="space-y-2.5">
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", fixedCount > 0 ? "text-amber-300" : "text-emerald-400")}>
              {fixedCount > 0 ? <Check className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {fixedCount > 0 ? `${fixedCount} suggestion(s) found` : "No issues found — text looks clean"}
            </div>

            {fixedCount > 0 ? (
              <>
                {result.suggestions?.slice(0, 20).map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-secondary/40 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] leading-snug text-red-300/90 line-through">{s.before}</p>
                        <p className="text-[11px] leading-snug text-emerald-400">{s.after}</p>
                        {s.reason && <p className="mt-1 text-[10px] text-muted-foreground">{s.reason}</p>}
                      </div>
                      {(docType === "document" || docType === "presentation") && (
                        <button
                          onClick={() => {
                            const n = apiRef.current?.applySuggestions?.([{ before: s.before, after: s.after }]) || 0
                            if (n > 0) toast.success("Applied")
                            else toast.info("No longer matches")
                          }}
                          disabled={!canEdit}
                          className="flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-40"
                        >
                          <Check className="h-2.5 w-2.5" /> Apply
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => applyAll()}
                  disabled={!canEdit || !result?.corrected}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-40"
                aria-pressed={applied}
                  aria-label="Apply all corrections"
                  title={docType === "document" || docType === "presentation" ? "Applies fixes in-place, keeping formatting intact" : undefined}
                >
                  {docType === "document" || docType === "presentation" ? (
                    <>
                      <Wand2 className="h-3.5 w-3.5" />
                      {applied ? "Applied" : "Apply all corrections"}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy corrected text
                    </>
                  )}
                </button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">You can close this panel.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}