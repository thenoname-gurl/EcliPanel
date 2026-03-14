"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(API_ENDPOINTS.roles)
      .then((data) => setRoles(data))
      .catch((err) => console.error("failed to load roles", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PanelHeader title="Roles" description="Manage user roles and permissions" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">Loading...</p>
          ) : roles.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No roles found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {roles.map((role) => (
                <Link
                  href={`/dashboard/roles/${role.id}`}
                  key={role.id}
                  className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
                >
                  <h3 className="font-medium text-foreground">{role.name}</h3>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
