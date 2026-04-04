"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";

export default function CreateOrganisationPage() {
  const t = useTranslations("organisationsCreatePage");
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
      setError(err.message || t("errors.failedCreate"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PanelHeader title={t("header.title")} description={t("header.description")} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("fields.namePlaceholder")}
                required
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              />
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t("fields.handlePlaceholder")}
                required
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              />
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none"
              >
                <option value="free">{t("tiers.free")}</option>
                <option value="paid">{t("tiers.paid")}</option>
                <option value="enterprise">{t("tiers.enterprise")}</option>
              </select>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? t("actions.creating") : t("actions.create")}
              </button>
            </form>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
