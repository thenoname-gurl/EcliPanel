"use client"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { useAuth } from "@/hooks/useAuth";

export default function OrganisationsPage() {
  const t = useTranslations("organisationsPage");
  const router = useRouter();
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(API_ENDPOINTS.organisations)
      .then((data) => setOrgs(data))
      .catch((err) => console.error("failed to load organisations", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PanelHeader title={t("header.title")} description={t("header.description")} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex justify-end">
            {(user?.role === 'admin' || user?.role === 'rootAdmin' || user?.tier === 'enterprise') && (
              <button
                onClick={() => router.push('/dashboard/organisations/create')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("actions.newOrganisation")}
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">{t("states.loading")}</p>
          ) : orgs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("states.none")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {orgs.map((org) => {
                const currentRole = org.orgRole || (org.ownerId === user?.id ? 'owner' : 'member');

                return (
                  <div
                    key={org.id}
                    className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
                  >
                    <Link href={`/dashboard/organisations/${org.id}`}>
                    <div className="mb-3 flex items-center gap-3">
                      {org.avatarUrl ? (
                        <img
                          src={org.avatarUrl}
                          alt={`${org.name} logo`}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                          {org.name?.slice(0, 2).toUpperCase() || 'O'}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-medium text-foreground leading-none">{org.name}</h3>
                        <p className="text-[10px] text-muted-foreground">{t("labels.role", { value: currentRole })}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{org.handle}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{t("labels.tier", { value: org.portalTier || 'free' })}</p>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
