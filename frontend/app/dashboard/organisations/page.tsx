"use client"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { useAuth } from "@/hooks/useAuth";

export default function OrganisationsPage() {
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
      <PanelHeader title="Organisations" description="Manage your organisations" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex justify-end">
            {(user?.role === 'admin' || user?.role === 'rootAdmin' || user?.tier === 'enterprise') && (
              <button
                onClick={() => router.push('/dashboard/organisations/create')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                New Organisation
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">Loading...</p>
          ) : orgs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              You are not a member of any organisations.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {orgs.map((org) => (
                <Link
                  href={`/dashboard/organisations/${org.id}`}
                  key={org.id}
                  className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
                >
                  <h3 className="font-medium text-foreground">{org.name}</h3>
                  <p className="text-xs text-muted-foreground">{org.handle}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Tier: {org.portalTier || 'free'}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
