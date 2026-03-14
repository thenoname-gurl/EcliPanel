"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";

export default function CreateOrganisationPage() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [tier, setTier] = useState<string>("free");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(API_ENDPOINTS.organisations, {
        method: "POST",
        body: JSON.stringify({ name, handle, tier }),
      });
      router.push("/dashboard/organisations");
    } catch (err: any) {
      setError(err.message || "Failed to create organisation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PanelHeader title="New Organisation" description="Create a new organisation" />
      <ScrollArea className="flex-1">
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organisation Name"
                required
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              />
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="Handle (e.g. acme.ecli.app)"
                required
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              />
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
