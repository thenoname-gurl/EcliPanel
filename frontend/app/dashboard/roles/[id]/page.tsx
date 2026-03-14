"use client"

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RoleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [role, setRole] = useState<any>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [newPerm, setNewPerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(API_ENDPOINTS.roleDetail.replace(":id", id)),
      apiFetch(API_ENDPOINTS.rolePermissions.replace(":id", id)),
    ])
      .then(([r, p]) => {
        setRole(r);
        setPerms(p || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [id]);

  const addPermission = async () => {
    if (!newPerm.trim()) return;
    try {
      await apiFetch(API_ENDPOINTS.assignPermission.replace(":id", id), {
        method: "POST",
        body: JSON.stringify({ permission: newPerm }),
      });
      setPerms((prev) => [...prev, newPerm]);
      setNewPerm("");
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  if (!role) return <p className="p-6 text-sm text-destructive">Role not found.</p>;

  return (
    <>
      <PanelHeader title={role.name} description={role.description} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">Permissions</h2>
            <div className="flex flex-wrap gap-2">
              {perms.map((p) => (
                <Badge key={p}>{p}</Badge>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                value={newPerm}
                onChange={(e) => setNewPerm(e.target.value)}
                placeholder="new permission"
              />
              <Button onClick={addPermission}>Add</Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
