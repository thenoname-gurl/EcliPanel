import Link from "next/link";
import { FileText, Shield, Lock, Globe2, BookOpen, Cpu, Mail } from "lucide-react";

const documents = [
  { title: "Terms of Service", href: "/legal/terms-of-service", icon: FileText },
  { title: "Privacy Policy", href: "/legal/privacy-policy", icon: Shield },
  { title: "Acceptable Use Policy", href: "/legal/acceptable-use-policy", icon: Lock },
  { title: "AI Policy", href: "/legal/ai-policy", icon: Cpu },
  { title: "Email Policy", href: "/legal/email-policy", icon: Mail },
  { title: "Cookies Policy", href: "/legal/cookies-policy", icon: Globe2 },
  { title: "DMCA Copyright Policy", href: "/legal/dmca-copyright-policy", icon: BookOpen },
  { title: "Imprint / Legal Notice", href: "/legal/imprint", icon: FileText },
];

export default function LegalIndexPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              <FileText className="h-4 w-4" /> Legal documents
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">EclipseSystems legal center</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Access our current terms, policies, and compliance notices. These documents explain how we collect data, protect your privacy, enforce acceptable use, and handle restricted jurisdictions.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {documents.map((doc) => {
            const Icon = doc.icon;
            return (
              <Link key={doc.href} href={doc.href} className="group rounded-3xl border border-border bg-card p-6 transition hover:border-primary/40 hover:bg-secondary/60">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/5 text-primary transition group-hover:bg-primary/10">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">View the full document and compliance details.</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Need more detail?</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            If you have questions about these policies or need specific compliance information, contact us at <a className="font-medium text-primary hover:text-primary/80" href="mailto:legal@ecli.app">legal@ecli.app</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
