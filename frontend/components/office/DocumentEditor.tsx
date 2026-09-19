"use client"

import { useEffect } from "react"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import { withCollaboration } from "@blocknote/core/yjs"
import "@blocknote/mantine/style.css"

import type { OfficeProvider } from "@/lib/office/collab"
import type { OfficeApiRef } from "@/lib/office/editorApi"

interface Props {
  provider: OfficeProvider
  readOnly?: boolean
  userName?: string
  userColor?: string
  apiRef?: OfficeApiRef
  onEditorReady?: () => void
}

function ConnectedDocumentEditor({ provider, readOnly, userName, userColor, apiRef, onEditorReady }: Props) {
  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        provider: { awareness: provider.awareness },
        fragment: provider.doc.getXmlFragment("blocknote"),
        user: {
          name: userName || "Guest",
          color: userColor || "#8b5cf6",
        },
        showCursorLabels: "activity",
      },
    }),
    [provider]
  )

  useEffect(() => {
    if (!editor) return
    if (apiRef) {
      apiRef.current = {
        kind: "document",
        getText: () => editor.blocksToMarkdownLossy(),
        getMarkdown: () => editor.blocksToMarkdownLossy(),
        getJSON: () => editor.document,
        getHTML: () => editor.blocksToFullHTML(),
        loadMarkdown: (md) => {
          const blocks = editor.tryParseMarkdownToBlocks(md)
          editor.replaceBlocks(editor.document, blocks)
        },
        loadJSON: (json) => {
          editor.replaceBlocks(editor.document, json as any[])
        },
        loadHTML: (html) => {
          const blocks = editor.tryParseHTMLToBlocks(html)
          if (blocks.length) editor.replaceBlocks(editor.document, blocks)
        },
        setSuggestions: () => {
          /* suggestions are listed in the proof-read panel */
        },
        applySuggestions: (rows) => {
          let count = 0
          for (const block of editor.document) {
            if (block.type === "image" || !Array.isArray(block.content)) continue
            const content = (block.content as any[]).map((c) => {
              if (c?.type !== "text" || typeof c.text !== "string") return c
              let t = c.text
              for (const r of rows) {
                if (!r.before || !t.includes(r.before)) continue
                t = t.split(r.before).join(r.after)
              }
              if (t !== c.text) count++
              return t !== c.text ? { ...c, text: t } : c
            })
            const changed = content.some((c, i) => c !== (block.content as any[])[i])
            if (changed) editor.updateBlock(block, { content })
          }
          return count
        },
      }
    }
    onEditorReady?.()
    return () => {
      if (apiRef?.current?.kind === "document") apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <div className="office-editor h-full">
      <style>{`
        .office-editor .bn-container {
          background: transparent;
        }
        .office-editor .bn-editor {
          background: transparent;
          font-size: 1rem;
          line-height: 1.6;
          padding: 1rem;
        }
        @media (min-width: 640px) {
          .office-editor .bn-editor {
            padding: 1.5rem;
          }
        }
      `}</style>
      <BlockNoteView editor={editor} theme="dark" editable={!readOnly} />
    </div>
  )
}

export default function DocumentEditor(props: Props) {
  const { provider, apiRef, onEditorReady } = props
  useEffect(() => {
    return () => {
      if (apiRef) apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!provider) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Initializing collaboration…
      </div>
    )
  }
  return <ConnectedDocumentEditor {...props} />
}