"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"

const SWATCHES = [
  "#000000","#1a1a2e","#16213e","#0f3460",
  "#533483","#e94560","#ff6b6b","#ff8e53",
  "#ffd93d","#6bcb77","#4d96ff","#845ec2",
  "#ffffff","#d4d4d4","#a3a3a3","#737373",
  "#525252","#404040","#262626","#171717",
  "#7c3aed","#2563eb","#0891b2","#059669",
  "#65a30d","#ca8a04","#ea580c","#dc2626",
  "#db2777","#9333ea","#4f46e5","#0284c7",
]

interface Props {
  color: string
  onChange: (color: string) => void
}

export function EcliPaintColorPanel({ color, onChange }: Props) {
  const [mode, setMode] = useState<"wheel" | "swatches" | "hex">("wheel")
  const wheelRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (mode !== "wheel") return
    const canvas = wheelRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const size = canvas.width
    const cx = size / 2, cy = size / 2, r = size / 2 - 2

    ctx.clearRect(0, 0, size, size)

    for (let angle = 0; angle < 360; angle++) {
      const start = (angle - 1) * Math.PI / 180
      const end = (angle + 1) * Math.PI / 180
      const grad = ctx.createLinearGradient(
        cx + Math.cos(start) * r, cy + Math.sin(start) * r,
        cx + Math.cos(end) * r, cy + Math.sin(end) * r,
      )
      grad.addColorStop(0, `hsl(${angle},100%,50%)`)
      grad.addColorStop(1, `hsl(${angle + 1},100%,50%)`)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }

    const satGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.72)
    satGrad.addColorStop(0, "rgba(255,255,255,1)")
    satGrad.addColorStop(1, "rgba(255,255,255,0)")
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
    ctx.fillStyle = satGrad
    ctx.fill()

    const briGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.72)
    briGrad.addColorStop(0, "rgba(0,0,0,0)")
    briGrad.addColorStop(1, "rgba(0,0,0,0.6)")
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
    ctx.fillStyle = briGrad
    ctx.fill()
  }, [mode])

  const pickFromWheel = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = wheelRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
    if (pixel[3] === 0) return
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('')
    onChange(hex)
  }, [onChange])

  return (
    <div className="flex flex-col h-full text-white">
      <div className="px-4 py-3 border-b border-white/8">
        <span className="text-sm font-semibold text-white/80">Colors</span>
        <div className="flex mt-2 gap-1">
          {(["wheel", "swatches", "hex"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
              style={{
                background: mode === m ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)",
                color: mode === m ? "#93c5fd" : "rgba(255,255,255,0.4)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-4 mt-4 h-10 rounded-xl border border-white/10" style={{ background: color }} />

        {mode === "wheel" && (
          <div className="flex items-center justify-center p-4">
            <canvas
              ref={wheelRef}
              width={220} height={220}
              className="rounded-full cursor-crosshair"
              onMouseDown={e => { setIsDragging(true); pickFromWheel(e) }}
              onMouseMove={e => { if (isDragging) pickFromWheel(e) }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            />
          </div>
        )}

        {mode === "swatches" && (
          <div className="p-4 grid grid-cols-8 gap-1.5">
            {SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => onChange(c)}
                className="aspect-square rounded-lg border-2 transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderColor: color === c ? "white" : "transparent",
                  boxShadow: color === c ? "0 0 0 1px rgba(255,255,255,0.5)" : "none",
                }}
                title={c}
              />
            ))}
          </div>
        )}

        {mode === "hex" && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Hex Code</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border border-white/10 shrink-0" style={{ background: color }} />
                <Input
                  value={color}
                  onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v) }}
                  className="bg-white/5 border-white/10 text-white font-mono text-sm h-9"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wider">Quick Picks</p>
              <div className="grid grid-cols-8 gap-1">
                {SWATCHES.slice(0, 16).map(c => (
                  <button key={c} onClick={() => onChange(c)}
                    className="aspect-square rounded border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
