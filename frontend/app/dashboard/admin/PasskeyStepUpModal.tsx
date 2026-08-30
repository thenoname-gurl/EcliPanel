"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  fetchStepUpChallenge,
  fetchSudoChallenge,
  performStepUpAssertion,
  performSudoAssertion,
  registerPasskeyInline,
  type StepUpUiState,
} from "@/lib/step-up"

export type PasskeyStepUpModalProps = {
  open: boolean
  state: StepUpUiState | null
  onResolve: (token: string | null) => void
}

export default function PasskeyStepUpModal({ open, state, onResolve }: PasskeyStepUpModalProps) {
  const t = useTranslations("adminPage")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mode: "passkey" | "register" | "sudo" = state?.mode ?? "passkey"
  const isSudo = state?.kind === "sudo"

  const close = (token: string | null) => {
    setBusy(false)
    setError(null)
    onResolve(token)
  }

  const assertToken = async (challenge: any): Promise<string> =>
    isSudo ? performSudoAssertion(challenge) : performStepUpAssertion(challenge)

  const refetchChallenge = async (): Promise<StepUpUiState> =>
    isSudo ? fetchSudoChallenge() : fetchStepUpChallenge()

  const handleUsePasskey = async () => {
    if (!state?.challenge) return
    setBusy(true)
    setError(null)
    try {
      const token = await assertToken(state.challenge)
      close(token)
    } catch (e: any) {
      setBusy(false)
      setError(e?.message || t("stepUp.failed"))
    }
  }

  const handleRegister = async () => {
    setBusy(true)
    setError(null)
    try {
      await registerPasskeyInline()
      // Registration succeeded — fetch a fresh challenge and authorize immediately.
      const next = await refetchChallenge()
      if (!next.challenge) throw new Error(t("stepUp.failed"))
      const token = await assertToken(next.challenge)
      close(token)
    } catch (e: any) {
      setBusy(false)
      setError(e?.message || t("stepUp.failed"))
    }
  }

  const webauthnUnavailable =
    typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials)

  const title =
    mode === "register"
      ? t("stepUp.registerTitle")
      : mode === "sudo"
        ? t("stepUp.sudoTitle")
        : t("stepUp.title")

  const description =
    mode === "register"
      ? t("stepUp.registerDescription")
      : mode === "sudo"
        ? t("stepUp.sudoDescription")
        : t("stepUp.description")

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) close(null) }}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {webauthnUnavailable && (
          <p className="text-sm text-destructive">{t("stepUp.httpsRequired")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          {mode === "register" ? (
            <Button onClick={handleRegister} disabled={busy || webauthnUnavailable}>
              {busy ? t("actions.working") : t("stepUp.linkPasskey")}
            </Button>
          ) : (
            <Button onClick={handleUsePasskey} disabled={busy || webauthnUnavailable || !state?.challenge}>
              {busy ? t("actions.working") : t("stepUp.usePasskey")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
