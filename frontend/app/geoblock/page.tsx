"use client"

import { useEffect, useState } from "react";
import { Globe2, AlertTriangle, MapPin, Database } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { apiFetch } from "@/lib/api-client";

type GeoRule = {
  country: string;
  level: number;
  services: string[];
  explanation: string;
};

const levelLabels: Record<number, string> = {
  1: "Identity verification unavailable",
  2: "Free services unavailable",
  3: "Educational services unavailable",
  4: "Paid services unavailable",
  5: "Registration blocked",
};

const blockedServicesByLevel = (level: number): string[] => {
  const services = [];
  if (level >= 1) services.push("Identity verification");
  if (level >= 2) services.push("Free plans and free products");
  if (level >= 3) services.push("Educational or student services");
  if (level >= 4) services.push("Paid subscriptions, premium plans, and paid upgrades");
  if (level >= 5) services.push("New account registration and new onboarding");
  return services;
};

export default function GeoblockPage() {
  const [rules, setRules] = useState<GeoRule[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    async function loadRules() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch(API_ENDPOINTS.geoblockPublic, { retries: 1 });
        const items = Array.isArray(data?.rules)
          ? data.rules.map((item: any) => ({
              country: String(item.country),
              level: Number(item.level),
              services: Array.isArray(item.services) ? item.services.map(String) : blockedServicesByLevel(Number(item.level)),
              explanation: String(item.explanation || levelLabels[item.level] || "Geoblock restriction."),
            }))
          : [];
        setRules(items);
        setNotes(Array.isArray(data?.notes) ? data.notes.map(String) : []);
        setUpdatedAt(data?.generatedAt ? String(data.generatedAt) : null);
      } catch (err: any) {
        setError(err?.message || "Unable to load geoblock data.");
      } finally {
        setLoading(false);
      }
    }

    loadRules();
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-4 max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
                <Globe2 className="h-4 w-4" /> Geoblocked countries
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Geoblock policy and restricted jurisdictions
              </h1>
              <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                This page shows the current public restriction list and explains which services are blocked for each country. The data is sourced directly from our backend configuration and updated dynamically.
              </p>
            </div>
            <div className="hidden sm:flex items-center justify-center rounded-3xl border border-border bg-secondary/50 p-6 text-muted-foreground">
              <Database className="h-8 w-8" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="text-sm font-semibold text-foreground">How this is sourced</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              The list is populated from the panel setting key <span className="font-medium">geoBlockCountries</span> in the backend database.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="text-sm font-semibold text-foreground">What each level means</p>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
              <li><span className="font-medium">Level 1:</span> Identity verification unavailable.</li>
              <li><span className="font-medium">Level 2:</span> Free services are blocked.</li>
              <li><span className="font-medium">Level 3:</span> Educational services are blocked.</li>
              <li><span className="font-medium">Level 4:</span> Paid services are blocked; access may be limited to subusers only.</li>
              <li><span className="font-medium">Level 5:</span> Registration is blocked completely.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <p className="text-sm font-semibold text-foreground">Why this exists</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Geoblocking protects the platform against regulatory, compliance, or provider restrictions. It also gives clear transparency for customers in restricted jurisdictions.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Current geoblocked countries</p>
              <p className="text-sm text-muted-foreground">Updated at {updatedAt ?? "—"}</p>
            </div>
            <div className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              {loading ? "Loading…" : `${rules.length} blocked location${rules.length === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-secondary/30">
            {notes.length > 0 && (
              <div className="border-b border-border/70 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-semibold text-foreground">Important note</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            {error ? (
              <div className="p-6 text-sm text-destructive">
                <AlertTriangle className="inline-block h-4 w-4 mr-2 align-text-bottom" /> {error}
              </div>
            ) : loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading geoblock data from the backend…</div>
            ) : rules.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No currently configured geoblocked countries.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4">Country</th>
                      <th className="px-5 py-4">Restriction level</th>
                      <th className="px-5 py-4">Blocked services</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={`${rule.country}-${rule.level}`} className="border-t border-border/70">
                        <td className="px-5 py-4 font-semibold text-foreground">{rule.country.toUpperCase()}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{levelLabels[rule.level] || `Level ${rule.level}`}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          <ul className="space-y-1">
                            {rule.services.map((service) => (
                              <li key={service} className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> {service}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4" />
            What is blocked for a country?
          </div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              The current list is built from our internal geoblock settings. Each country can be set to a level between 1 and 5. A higher level means broader restrictions.
            </p>
            <p>
              Countries on this list may still have some account access, but certain features are limited or unavailable. If a country is set to Level 5, new registrations are blocked.
            </p>
            <p>
              This page is intended to provide transparency to users and customers. If your country is blocked and you believe this is incorrect, contact <a className="font-medium text-primary hover:text-primary/90" href="mailto:legal@ecli.app">legal@ecli.app</a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}