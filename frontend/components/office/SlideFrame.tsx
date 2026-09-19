"use client"

import { cn } from "@/lib/utils"
import { filterCss } from "@/lib/office/editorApi"

export const SLIDE_W = 960
export const SLIDE_H = 600

export interface SlideBlockData {
  id: string
  type?: "text" | "image" | "quote"
  text: string
  author?: string
  src?: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: "left" | "center" | "right"
  font?: string
  filter?: string
}

export interface SlideData {
  id: string
  bg: string
  blocks: SlideBlockData[]
}

const P_TITLE = "Click to add title"
const P_SUB = "Click to add subtitle"

export function isPlaceholderText(text: string): boolean {
  return text === P_TITLE || text === P_SUB
}

/**
 * Renders one slide the same way the presentation editor renders it (absolute
 * blocks positioned at % of the slide, text scaled proportionally to width via
 * container-query units — identical to the editor's `fontSize * (width / 960)`).
 * Used by the presenting view and the /dashboard/office list thumbnails so both
 * match the editor exactly.
 */
export function SlideFrame({ slide, className }: { slide: SlideData; className?: string }) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ background: slide.bg, containerType: "inline-size" }}
    >
      {slide.blocks.map((b) => {
        if (b.type === "image") {
          return (
            <div
              key={b.id}
              className="absolute"
              style={{
                left: `${(b.x / SLIDE_W) * 100}%`,
                top: `${(b.y / SLIDE_H) * 100}%`,
                width: `${(b.w / SLIDE_W) * 100}%`,
                height: `${(b.h / SLIDE_H) * 100}%`,
              }}
            >
              {b.src ? (
                <img
                  src={b.src}
                  className="h-full w-full select-none object-contain"
                  style={{ filter: filterCss(b.filter) }}
                  draggable={false}
                  alt=""
                />
              ) : null}
            </div>
          )
        }
        const isQuote = b.type === "quote"
        return (
          <div
            key={b.id}
            className="whitespace-pre-wrap break-words"
            style={{
              position: "absolute",
              left: `${(b.x / SLIDE_W) * 100}%`,
              top: `${(b.y / SLIDE_H) * 100}%`,
              width: `${(b.w / SLIDE_W) * 100}%`,
              height: `${(b.h / SLIDE_H) * 100}%`,
              fontSize: `calc(${b.fontSize / 9.6}cqw)`,
              color: b.color || (isQuote ? "#c4b5fd" : "#fff"),
              textAlign: b.align || "left",
              fontFamily: b.font || (isQuote ? "Georgia, 'Times New Roman', serif" : undefined),
              fontStyle: b.italic || isQuote ? "italic" : undefined,
              fontWeight: b.bold ? 700 : undefined,
              lineHeight: 1.25,
              overflow: "hidden",
            }}
          >
            {isPlaceholderText(b.text) ? "" : b.text}
            {isQuote && b.author ? (
              <div className="mt-1 text-right text-[0.7em] not-italic opacity-70">— {b.author}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}