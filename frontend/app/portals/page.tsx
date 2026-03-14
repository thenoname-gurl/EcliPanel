"use client"

import Link from "next/link"
import { PORTALS, BRAND, type PortalTier } from "@/lib/panel-config"
import { Check, ArrowRight, Crown } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function PortalsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-semibold text-foreground">{BRAND.name}</span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Go to Dashboard
        </Link>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-3xl font-bold text-foreground text-balance sm:text-4xl">
            Choose Your Portal
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Select the tier that best fits your needs. Upgrade or downgrade at any time.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="mt-12 grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {(Object.values(PORTALS) as typeof PORTALS[PortalTier][]).map((portal) => {
            const Icon = portal.icon
            const isPaid = portal.id === "paid" || portal.id === "educational"

            return (
              <div
                key={portal.id}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-300 ${
                  isPaid
                    ? "border-primary/50 bg-card shadow-[0_0_30px_var(--glow)] scale-[1.02]"
                    : "border-border bg-card hover:border-primary/20"
                }`}
              >
                {isPaid && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground border-0 px-3">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Portal Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${portal.color}20` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: portal.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {portal.name}
                    </h3>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  {portal.description}
                </p>

                {/* Price */}
                <div className="mt-6">
                  <span className="text-3xl font-bold text-foreground">
                    {portal.id === "free" || portal.id === "educational" ? "$???" : portal.id === "paid" ? "$???" : "Custom"}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>

                {/* Limits */}
                <div className="mt-2 text-xs text-muted-foreground">
                  {portal.maxServers === -1
                    ? "Unlimited servers"
                    : `Up to ${portal.maxServers} servers`}
                </div>

                {/* Features */}
                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {portal.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 shrink-0 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Enterprise Handles */}
                {portal.handles && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {portal.handles.map((handle) => (
                      <Badge
                        key={handle}
                        variant="outline"
                        className="border-warning/30 bg-warning/10 text-warning text-[10px]"
                      >
                        {handle}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <Link
                  href="/dashboard"
                  className={`mt-6 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all ${
                    isPaid
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_var(--glow)]"
                      : portal.id === "enterprise"
                        ? "border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                        : "border border-border bg-secondary text-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  {portal.id === "enterprise" ? "Contact Sales" : portal.id === "free" ? "Get Started" : "Subscribe"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )
          })}
        </div>

        {/* FAQ / Enterprise Note */}
        <div className="mt-16 max-w-2xl text-center">
          <p className="text-sm text-muted-foreground">
            Enterprise plans include custom handles ({PORTALS.enterprise.handles?.join(", ")}), dedicated infrastructure, and SLA guarantees.
            Contact our sales team for a custom quote.
          </p>
        </div>
      </main>
    </div>
  )
}
