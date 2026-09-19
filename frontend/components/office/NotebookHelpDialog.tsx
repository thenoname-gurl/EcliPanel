"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { BookOpen } from "lucide-react"

interface SnippetSection {
  key: string
  title: string
  note: string
  code: string
}

const SNIPPETS: SnippetSection[] = [
  {
    key: "vars",
    title: "help.varsTitle",
    note: "help.varsNote",
    code: `-- variables persist across ALL cells (until restart)
a = 2
b = 3
print("a + b =", a + b)`,
  },
  {
    key: "graph",
    title: "help.graphTitle",
    note: "help.graphNote",
    code: `graph.fn("x^2")                    -- line plot
graph.fn("f(x) = x^2")             -- saves f as a function
graph.fn("f(x)")                   -- reuse it in another cell
graph.fn("2*x + a")                -- notebook globals work too
graph.integral("f", 0, 2)          -- shaded area + its ∫ value
graph.fn("sin(x)", { area = { a = 0, b = 3.14159 } })
graph.fn("x^2", { area = true })   -- fill the whole domain`,
  },
  {
    key: "chart",
    title: "help.chartTitle",
    note: "help.chartNote",
    code: `chart.line({1, 2, 4, 8})
chart.fn("x^2", { xmin = -10, xmax = 10 })
chart.bar({"A", "B", "C"}, {3, 5, 2})
chart.pie({3, 5, 2}, {"one", "two", "three"})`,
  },
  {
    key: "canvas",
    title: "help.canvasTitle",
    note: "help.canvasNote",
    code: `canvas.new(420, 260)
canvas.fill("#0f0f23")
canvas.fillRect(30, 30, 120, 80, { fill = "#6366f1" })
canvas.fillCircle(260, 80, 40, { fill = "#f97316" })
canvas.text("hello", 180, 180, { size = 24, fill = "white" })`,
  },
]

export default function NotebookHelpDialog() {
  const t = useTranslations("notebookPage")
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title={t("help.open")}>
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{t("help.open")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("help.title")}</DialogTitle>
          <DialogDescription>{t("help.intro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {SNIPPETS.map((s) => (
            <section key={s.key} className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-baseline justify-between gap-2 border-b border-border bg-secondary/30 px-3 py-1.5">
                <h3 className="text-xs font-semibold text-foreground">{t(s.title as any)}</h3>
                <span className="text-[10px] text-muted-foreground">{t(s.note as any)}</span>
              </div>
              <pre className="overflow-x-auto bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                {s.code}
              </pre>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}