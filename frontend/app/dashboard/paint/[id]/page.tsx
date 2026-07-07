"use client"

import { FeatureGuard } from "@/components/panel/feature-guard"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { PaintCanvas } from "@/components/paint/PaintCanvas"
import { Paintbrush } from "lucide-react"

export default function PaintEditorPage({ params }: { params: { id: string } }) {
  return (
    <FeatureGuard feature="paint">
      <RolloutGuard rolloutKey="paint" fallback={
        <div className="flex flex-col items-center justify-center py-24 px-6 gap-4 max-w-md mx-auto text-center">
          <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center rounded-xl">
            <Paintbrush className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Ecli Paint is being rolled out</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">This feature is being gradually released. It should be available to you soon.</p>
          </div>
        </div>
      }>
        <PaintCanvas paintingId={params.id} />
      </RolloutGuard>
    </FeatureGuard>
  )
}
