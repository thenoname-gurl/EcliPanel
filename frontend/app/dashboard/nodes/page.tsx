"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function NodesRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/infrastructure/nodes")
  }, [router])
  return null
}

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch(API_ENDPOINTS.nodes)
      .then((data) => setNodes(Array.isArray(data) ? data : []))
      .catch((e) => { console.error(e); setNodes([]); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name || !url || !token) { setError("Name, URL and token are required."); return; }
    setError(null);
    setCreating(true);
    try {
      await apiFetch(API_ENDPOINTS.nodes, {
        method: "POST",
        body: JSON.stringify({ name, url, token }),
      });
      setName(""); setUrl(""); setToken("");
      load();
    } catch (e: any) {
      setError(e.message || "Failed to create node.");
    } finally {
      setCreating(false);
    }
  };

  const genToken = async () => {
    try {
      const r = await apiFetch(API_ENDPOINTS.nodeGenerateToken);
      setToken(r.token);
    } catch (e: any) {
      setError(e.message || "Failed to generate token.");
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <PanelHeader title="Nodes" description="Manage infrastructure nodes" />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {!isAdmin && (
            <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5">
              <Shield className="h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium text-foreground">Administrator access required</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Node registration is restricted to system administrators. You can view nodes assigned to your account below.
                </p>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Register New Node</h3>
              </div>
              {error && (
                <p className="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              <div className="flex flex-col gap-3">
                <Input placeholder="Node name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Node URL (e.g. https://node1.example.com)" value={url} onChange={(e) => setUrl(e.target.value)} />
                <div className="flex gap-2">
                  <Input
                    placeholder="Authentication token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" onClick={genToken} type="button">Generate</Button>
                  {token && (
                    <Button variant="outline" size="icon" onClick={copyToken} type="button">
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                <Button onClick={create} disabled={creating}>
                  {creating ? "Registering…" : "Register Node"}
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground mb-4">
              {isAdmin ? "All Nodes" : "Your Nodes"}
            </h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading nodes…</p>
            ) : nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No nodes found.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {nodes.map((n) => (
                  <li key={n.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{n.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{n.url}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${n.status === "online" ? "bg-success" : "bg-destructive"}`} />
                      <span className="text-xs text-muted-foreground capitalize">{n.status ?? "unknown"}</span>
                    </div>
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
