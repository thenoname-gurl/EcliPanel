"use client"

import { useEffect, useState } from "react";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const AVAILABLE_PERMISSIONS = [
  "servers:read",
  "servers:write",
  "servers:delete",
  "nodes:read",
  "nodes:create",
  "billing:read",
  "billing:write",
  "apikeys:read",
  "apikeys:create",
  "apikeys:delete",
  "org:read",
  "org:create",
  "roles:read",
  "roles:create",
  "permissions:assign",
  "users:read",
  "users:write",
] as const;

export default function ApiKeysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'rootAdmin' || user?.role === '*';
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("client");
  const [newPerms, setNewPerms] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    apiFetch(API_ENDPOINTS.apiKeysMy)
      .then((data) => setKeys(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createKey = async () => {
    try {
      const body: any = { name: newName, type: newType };
      if (newPerms.length > 0) body.permissions = newPerms;
      const res = await apiFetch(API_ENDPOINTS.apiKeys, { method: 'POST', body: JSON.stringify(body) });
      alert('Key: ' + res.apiKey);
      setNewName(''); setNewPerms([]);
      load();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm('Revoke key?')) return;
    await apiFetch(API_ENDPOINTS.apiKeyDetail.replace(':id', id.toString()), { method: 'DELETE' });
    load();
  };

  return (
    <>
      <PanelHeader title="API Keys" description="Manage your API credentials" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-medium mb-2">Create New Key</h3>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e)=>setNewName(e.target.value)}
                className="rounded border border-border px-3 py-2"
              />
              <select value={newType} onChange={(e)=>setNewType(e.target.value)} className="rounded border border-border bg-input px-3 py-2 text-sm text-foreground outline-none">
                <option value="client">Client</option>
                {isAdmin && <option value="admin">Admin</option>}
              </select>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground mb-1">
                  Permissions {newType === 'admin' ? <span className="text-xs text-primary">(Admin keys have all permissions)</span> : null}
                </p>
                {newType === 'client' && (
                  <div className="grid grid-cols-2 gap-1 rounded border border-border bg-secondary/20 p-3">
                    {AVAILABLE_PERMISSIONS.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPerms.includes(perm)}
                          onChange={(e) => {
                            if (e.target.checked) setNewPerms((p) => [...p, perm]);
                            else setNewPerms((p) => p.filter((x) => x !== perm));
                          }}
                          className="accent-primary"
                        />
                        <span className="text-muted-foreground hover:text-foreground transition-colors">{perm}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={createKey}>Create</Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-medium mb-2">Your Keys</h3>
            {loading ? (
              <p>Loading...</p>
            ) : keys.length === 0 ? (
              <p>No keys</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {keys.map((k) => (
                  <li key={k.id} className="flex justify-between items-center">
                    <span>{k.name} ({k.type})</span>
                    <button onClick={()=>revoke(k.id)} className="text-destructive text-xs">Revoke</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
