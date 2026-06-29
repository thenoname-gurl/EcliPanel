import { Loader2 } from "lucide-react"

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#8b5cf6]" />
        <p className="text-sm text-white/50">Loading...</p>
      </div>
    </div>
  )
}