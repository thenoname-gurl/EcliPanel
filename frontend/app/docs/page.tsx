import fs from "fs"
import path from "path"
import Link from "next/link"
import escapeHtml from "escape-html"

export default function DocsPage() {
  const docsDir = path.join(process.cwd(), "public", "documents")
  const docs = fs.existsSync(docsDir)
    ? fs
        .readdirSync(docsDir)
        .filter((f) => {
          if (f.startsWith('.') || f.endsWith('.md')) return false;
          if (f.includes('..') || f.includes('/') || f.includes('\\')) return false;
          return /^[A-Za-z0-9._ \-]+$/.test(f);
        })
        .map((name) => ({ name, safeName: name.replace(/[^A-Za-z0-9._ \-]/g, '_') }))
    : []

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-10 shadow-lg backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold">Legal documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Things that lawyers love.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid gap-3">
            {docs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No documents found</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add files into <code className="rounded bg-muted px-2 py-0.5">frontend/public/documents</code> and refresh this page.
                </p>
              </div>
            ) : (
              docs.map((doc) => (
                <Link
                  key={doc.name}
                  href={`/documents/${encodeURIComponent(doc.name)}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-6 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div>
                    <p className="font-medium text-foreground">{doc.safeName}</p>
                    <p className="text-xs text-muted-foreground">Open in a new tab</p>
                  </div>
                  <span className="text-xs text-primary">View</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
