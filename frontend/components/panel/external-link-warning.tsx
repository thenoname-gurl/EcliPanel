"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExternalLinkIcon, ShieldAlert } from "lucide-react"

interface PendingLink {
  url: string
  resolve: (allowed: boolean) => void
}

export function useExternalLinkGuard() {
  const [link, setLink] = useState<PendingLink | null>(null)

  const guard = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setLink({ url, resolve })
    })
  }, [])

  const handleContinue = useCallback(() => {
    if (link) {
      link.resolve(true)
      setLink(null)
    }
  }, [link])

  const handleCancel = useCallback(() => {
    if (link) {
      link.resolve(false)
      setLink(null)
    }
  }, [link])

  const dialog = (
    <Dialog open={!!link} onOpenChange={(open) => { if (!open) handleCancel() }}>
      <DialogContent className="border-border/40 bg-card sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
          </div>
          <DialogTitle className="text-center">Leaving EcliPanel</DialogTitle>
          <DialogDescription className="text-center pt-1">
            You are about to visit an external website. Your IP address and other identifying information may be exposed to the owner of that site.
          </DialogDescription>
          {link?.url && (
            <div className="mt-3 rounded-md border border-border/50 bg-muted/30 p-3">
              <p className="text-xs font-mono text-muted-foreground break-all">{link.url}</p>
            </div>
          )}
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleContinue} className="gap-1.5">
            <ExternalLinkIcon className="h-4 w-4" />
            Continue Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { guard, dialog }
}