"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import { BookOpen, Edit, FileCode, Globe, Key, Lock, Package, Plus, RefreshCw, Shield, Trash2, XCircle, Zap } from "lucide-react"

export default function OauthTab({ ctx }: { ctx: any }) {
  const {
    setOauthCreateName,
    setOauthCreateDesc,
    setOauthCreateRedirects,
    setOauthCreateScopes,
    setOauthCreateGrants,
    setOauthCreateOpen,
    oauthApps,
    setOauthApps,
    openEditOAuthApp,
    setOauthRotateApp,
    confirmAsync,
    oauthCreateOpen,
    oauthCreateName,
    oauthCreateDesc,
    oauthCreateRedirects,
    oauthCreateScopes,
    oauthCreateGrants,
    oauthCreateLoading,
    submitCreateOAuthApp,
    oauthNewSecret,
    setOauthNewSecret,
    oauthEditApp,
    setOauthEditApp,
    oauthEditRedirects,
    setOauthEditRedirects,
    oauthEditScopes,
    setOauthEditScopes,
    oauthEditGrants,
    setOauthEditGrants,
    oauthEditLoading,
    submitEditOAuthApp,
    oauthRotateApp,
    oauthRotateLoading,
    confirmRotateOAuthSecret,
  } = ctx

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Globe, label: "Endpoints", value: "13" },
          { icon: Key, label: "Scopes", value: "7" },
          { icon: Zap, label: "Grant Types", value: "3" },
          { icon: Lock, label: "PKCE", value: "S256 / plain" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-sm font-semibold text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Globe className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">RFC 8414 Discovery</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">Services discover the server metadata automatically via this well-known URL:</p>
              <div className="relative">
                <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto">
                  {`GET /.well-known/oauth-authorization-server`}</pre>
                <button onClick={() => navigator.clipboard.writeText("GET /.well-known/oauth-authorization-server")} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Returns <code className="font-mono text-foreground">issuer</code>, <code className="font-mono text-foreground">authorization_endpoint</code>, <code className="font-mono text-foreground">token_endpoint</code>, supported scopes and grant types.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Endpoint Reference</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium w-20">Method</th>
                    <th className="px-4 py-2.5 text-left font-medium">Path</th>
                    <th className="px-4 py-2.5 text-left font-medium">Auth</th>
                    <th className="px-4 py-2.5 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { method: "GET", path: "/.well-known/oauth-authorization-server", auth: "—", desc: "RFC 8414 discovery metadata" },
                    { method: "POST", path: "/api/oauth/apps", auth: "Bearer JWT", desc: "Register a new OAuth application" },
                    { method: "GET", path: "/api/oauth/apps", auth: "Bearer JWT", desc: "List your registered apps" },
                    { method: "GET", path: "/api/oauth/apps/:clientId", auth: "—", desc: "Public app info (used by consent UI)" },
                    { method: "PUT", path: "/api/oauth/apps/:id", auth: "Bearer JWT", desc: "Update app settings" },
                    { method: "DELETE", path: "/api/oauth/apps/:id", auth: "Bearer JWT", desc: "Delete app + revoke all tokens" },
                    { method: "POST", path: "/api/oauth/apps/:id/rotate-secret", auth: "Bearer JWT", desc: "Rotate client secret, revoke all tokens" },
                    { method: "GET", path: "/api/oauth/authorize", auth: "—", desc: "Return consent page data (app info + scopes)" },
                    { method: "POST", path: "/api/oauth/authorize", auth: "Bearer JWT", desc: "User approves / denies → returns redirect URL" },
                    { method: "POST", path: "/api/oauth/token", auth: "client_secret", desc: "Exchange code / credentials for token" },
                    { method: "POST", path: "/api/oauth/token/revoke", auth: "client_secret", desc: "Revoke access or refresh token (RFC 7009)" },
                    { method: "POST", path: "/api/oauth/token/introspect", auth: "client_secret", desc: "Validate token + return metadata (RFC 7662)" },
                    { method: "GET", path: "/api/oauth/userinfo", auth: "Bearer OAuth", desc: "Scoped user profile (OpenID-style)" },
                  ].map((ep) => (
                    <tr key={ep.path + ep.method} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${ep.method === "GET" ? "bg-blue-500/15 text-blue-400" :
                          ep.method === "POST" ? "bg-green-500/15 text-green-400" :
                            ep.method === "PUT" ? "bg-yellow-500/15 text-yellow-400" :
                              "bg-red-500/15 text-red-400"
                          }`}>{ep.method}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{ep.path}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] text-muted-foreground">{ep.auth}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{ep.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Scope Reference</p>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {[
                { scope: "profile", desc: "firstName, lastName, displayName, avatarUrl, portalType, role" },
                { scope: "email", desc: "email + emailVerified flag" },
                { scope: "orgs:read", desc: "Organisation id, name, handle and the user's orgRole" },
                { scope: "billing:read", desc: "Billing address fields (company, city, state, zip, country)" },
                { scope: "servers:read", desc: "List user's servers across all nodes" },
                { scope: "servers:write", desc: "Manage / power user's servers" },
                { scope: "admin", desc: "Admin-level access — only grantable to admin users" },
              ].map((s) => (
                <div key={s.scope} className="flex items-start gap-3">
                  <code className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary whitespace-nowrap mt-0.5">{s.scope}</code>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Authorization Code Flow (+ PKCE)</p>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {[
                {
                  step: "1 — Redirect user to consent page",
                  code: `GET /api/oauth/authorize
  ?client_id=<clientId>
  &redirect_uri=https://yourapp.com/callback
  &scope=profile%20email
  &response_type=code
  &state=random_state
  &code_challenge=<sha256_of_verifier_base64url>
  &code_challenge_method=S256`,
                  note: "Returns JSON with app info and grantable scopes so your UI can render a consent page.",
                },
                {
                  step: "2 — User approves (POST from your frontend with the user's panel JWT)",
                  code: `POST /api/oauth/authorize
Authorization: Bearer <panel_jwt>
Content-Type: application/json

{
  "client_id": "<clientId>",
  "redirect_uri": "https://yourapp.com/callback",
  "scope": "profile email",
  "state": "random_state",
  "approved": true,
  "code_challenge": "<sha256_of_verifier_base64url>",
  "code_challenge_method": "S256"
}`,
                  note: `Response: { "redirect": "https://yourapp.com/callback?code=abc&state=xyz" }`,
                },
                {
                  step: "3 — Exchange code for tokens",
                  code: `POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<code_from_step_2>",
  "redirect_uri": "https://yourapp.com/callback",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>",
  "code_verifier": "<original_random_verifier>"
}`,
                  note: `Response: { "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "...", "scope": "profile email" }`,
                },
                {
                  step: "4 — Call EcliPanel APIs",
                  code: `GET /api/oauth/userinfo
Authorization: Bearer <access_token>`,
                  note: "Any EcliPanel endpoint protected by authenticate will accept this token. Responses are scope-gated.",
                },
              ].map((s, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-foreground">{s.step}</p>
                  <div className="relative">
                    <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{s.code}</pre>
                    <button onClick={() => navigator.clipboard.writeText(s.code)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
                  </div>
                  {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Key className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Client Credentials Flow (service-to-service)</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">No user involved — use when an Eclipse backend service authenticates directly as the app.</p>
              <div className="relative">
                <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{`POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>",
  "scope": "servers:read"
}`}</pre>
                <button onClick={() => navigator.clipboard.writeText(`POST /api/oauth/token\nContent-Type: application/json\n\n{\n  "grant_type": "client_credentials",\n  "client_id": "<clientId>",\n  "client_secret": "<clientSecret>",\n  "scope": "servers:read"\n}`)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
              </div>
              <p className="text-[11px] text-muted-foreground">The app must have <code className="font-mono text-foreground">client_credentials</code> in its <code className="font-mono text-foreground">grantTypes</code> when registered.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <FileCode className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Token Introspection (RFC 7662)</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">Resource servers can validate any access token without calling userinfo. Returns <code className="font-mono text-foreground">{`{ "active": false }`}</code> for invalid/expired tokens.</p>
              <div className="relative">
                <pre className="rounded-lg border border-border bg-black/40 px-4 py-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre leading-snug">{`POST /api/oauth/token/introspect
Content-Type: application/json

{
  "token": "<access_token>",
  "client_id": "<clientId>",
  "client_secret": "<clientSecret>"
}

// 200 response when active:
{
  "active": true,
  "scope": "profile email",
  "client_id": "<clientId>",
  "token_type": "Bearer",
  "exp": 1741222800,
  "iat": 1741219200,
  "sub": "42"
}`}</pre>
                <button onClick={() => navigator.clipboard.writeText(`POST /api/oauth/token/introspect`)} className="absolute top-2 right-2 rounded border border-border bg-secondary/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Registered Apps</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setOauthCreateName("")
                    setOauthCreateDesc("")
                    setOauthCreateRedirects([""])
                    setOauthCreateScopes(["profile", "email"])
                    setOauthCreateGrants(["authorization_code", "refresh_token"])
                    setOauthCreateOpen(true)
                  }}
                  className="bg-primary text-primary-foreground h-7 gap-1 px-2 text-xs"
                >
                  <Plus className="h-3 w-3" /> New App
                </Button>
                <button
                  onClick={async () => {
                    try {
                      const data = await apiFetch("/api/oauth/apps")
                      setOauthApps(Array.isArray(data) ? data : [])
                    } catch { }
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {oauthApps.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No OAuth apps registered yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {oauthApps.map((oa: any) => (
                  <div key={oa.id} className="p-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{oa.name}</p>
                      <button
                        onClick={async () => {
                          if (!(await confirmAsync(`Delete app "${oa.name}"? All tokens will be revoked.`))) return
                          try {
                            await apiFetch(`/api/oauth/apps/${oa.id}`, { method: "DELETE" })
                            setOauthApps((prev: any[]) => prev.filter((a: any) => a.id !== oa.id))
                          } catch { }
                        }}
                        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Delete app"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground break-all">{oa.clientId}</p>
                    {oa.description && <p className="text-xs text-muted-foreground">{oa.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(oa.allowedScopes || []).map((s: string) => (
                        <span key={s} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">{s}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(oa.grantTypes || []).map((g: string) => (
                        <span key={g} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{g}</span>
                      ))}
                    </div>
                    {(oa.redirectUris || []).length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {(oa.redirectUris as string[]).map((uri) => (
                          <p key={uri} className="text-[10px] font-mono text-muted-foreground truncate">{uri}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <button
                        onClick={() => openEditOAuthApp(oa)}
                        className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Edit className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => setOauthRotateApp(oa)}
                        className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" /> Rotate Secret
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Registered {oa.createdAt ? new Date(oa.createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Lock className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Token Lifetimes</p>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {[
                { label: "Authorization code", value: "10 minutes" },
                { label: "Access token", value: "1 hour" },
                { label: "Refresh token", value: "30 days" },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                  <span className="text-xs font-mono text-foreground">{t.value}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground mt-1">Refresh tokens rotate on use. Rotating the client secret immediately revokes all active tokens.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Client Auth Methods</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">client_secret_post</p>
                <p className="text-xs text-muted-foreground">Send <code className="font-mono text-foreground">client_id</code> and <code className="font-mono text-foreground">client_secret</code> in the JSON body.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">client_secret_basic</p>
                <p className="text-xs text-muted-foreground">Send <code className="font-mono text-foreground">Authorization: Basic base64(clientId:secret)</code> header.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">PKCE only (public clients)</p>
                <p className="text-xs text-muted-foreground">Omit <code className="font-mono text-foreground">client_secret</code> when <code className="font-mono text-foreground">code_verifier</code> is present. Forces S256 or plain challenge verification.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={oauthCreateOpen} onOpenChange={setOauthCreateOpen}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Register OAuth App</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">App Name *</label>
            <input
              value={oauthCreateName}
              onChange={(e) => setOauthCreateName(e.target.value)}
              placeholder="My Eclipse Service"
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Description</label>
            <input
              value={oauthCreateDesc}
              onChange={(e) => setOauthCreateDesc(e.target.value)}
              placeholder="Optional description"
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Redirect URIs</label>
            <div className="flex flex-col gap-2">
              {oauthCreateRedirects.map((uri: string, idx: number) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={uri}
                    onChange={(e) => {
                      const next = [...oauthCreateRedirects]
                      next[idx] = e.target.value
                      setOauthCreateRedirects(next)
                    }}
                    placeholder="https://yourapp.example.com/callback"
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                  {oauthCreateRedirects.length > 1 && (
                    <button onClick={() => setOauthCreateRedirects((p: string[]) => p.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setOauthCreateRedirects((p: string[]) => [...p, ""])}
                className="flex items-center gap-1 self-start rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                <Plus className="h-3 w-3" /> Add URI
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Allowed Scopes</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {["profile", "email", "orgs:read", "billing:read", "servers:read", "servers:write", "admin"].map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={oauthCreateScopes.includes(scope)}
                    onChange={(e) => setOauthCreateScopes((p: string[]) => e.target.checked ? [...p, scope] : p.filter((s) => s !== scope))}
                    className="accent-primary" />
                  <span className="text-xs font-mono text-foreground">{scope}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Grant Types</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {["authorization_code", "client_credentials", "refresh_token"].map((grant) => (
                <label key={grant} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={oauthCreateGrants.includes(grant)}
                    onChange={(e) => setOauthCreateGrants((p: string[]) => e.target.checked ? [...p, grant] : p.filter((g) => g !== grant))}
                    className="accent-primary" />
                  <span className="text-xs font-mono text-foreground">{grant}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOauthCreateOpen(false)} className="border-border">Cancel</Button>
          <Button onClick={submitCreateOAuthApp} disabled={oauthCreateLoading || !oauthCreateName.trim()} className="bg-primary text-primary-foreground">
            {oauthCreateLoading ? "Creating…" : "Create App"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!oauthNewSecret} onOpenChange={(open) => { if (!open) setOauthNewSecret(null) }}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">App Created — Save Your Secret</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-300">
            This is the <strong>only time</strong> the client secret is shown. Copy it now — it cannot be retrieved later.
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">App Name</p>
              <p className="text-sm font-medium text-foreground">{oauthNewSecret?.name}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Client ID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-black/40 px-3 py-2 text-xs font-mono text-foreground break-all">{oauthNewSecret?.clientId}</code>
                <button onClick={() => navigator.clipboard.writeText(oauthNewSecret?.clientId || "")}
                  className="shrink-0 rounded border border-border bg-secondary/80 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Copy</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Client Secret</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs font-mono text-yellow-200 break-all">{oauthNewSecret?.clientSecret}</code>
                <button onClick={() => navigator.clipboard.writeText(oauthNewSecret?.clientSecret || "")}
                  className="shrink-0 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/20 transition-colors">Copy</button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setOauthNewSecret(null)} className="bg-primary text-primary-foreground">I&apos;ve saved the secret</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!oauthEditApp} onOpenChange={(open) => { if (!open) setOauthEditApp(null) }}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit OAuth App — {oauthEditApp?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Redirect URIs</label>
            <div className="flex flex-col gap-2">
              {oauthEditRedirects.map((uri: string, idx: number) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={uri}
                    onChange={(e) => {
                      const next = [...oauthEditRedirects]
                      next[idx] = e.target.value
                      setOauthEditRedirects(next)
                    }}
                    placeholder="https://yourapp.example.com/callback"
                    className="flex-1 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                  {oauthEditRedirects.length > 1 && (
                    <button onClick={() => setOauthEditRedirects((p: string[]) => p.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setOauthEditRedirects((p: string[]) => [...p, ""])}
                className="flex items-center gap-1 self-start rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                <Plus className="h-3 w-3" /> Add URI
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Allowed Scopes</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {["profile", "email", "orgs:read", "billing:read", "servers:read", "servers:write", "admin"].map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={oauthEditScopes.includes(scope)}
                    onChange={(e) => setOauthEditScopes((p: string[]) => e.target.checked ? [...p, scope] : p.filter((s) => s !== scope))}
                    className="accent-primary" />
                  <span className="text-xs font-mono text-foreground">{scope}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Grant Types</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {["authorization_code", "client_credentials", "refresh_token"].map((grant) => (
                <label key={grant} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={oauthEditGrants.includes(grant)}
                    onChange={(e) => setOauthEditGrants((p: string[]) => e.target.checked ? [...p, grant] : p.filter((g) => g !== grant))}
                    className="accent-primary" />
                  <span className="text-xs font-mono text-foreground">{grant}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOauthEditApp(null)} className="border-border">Cancel</Button>
          <Button onClick={submitEditOAuthApp} disabled={oauthEditLoading} className="bg-primary text-primary-foreground">
            {oauthEditLoading ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!oauthRotateApp} onOpenChange={(open) => { if (!open) setOauthRotateApp(null) }}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rotate Client Secret?</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-muted-foreground">
            Rotating the secret for <strong className="text-foreground">{oauthRotateApp?.name}</strong> will
            immediately revoke all active tokens. Services using the current secret will stop working
            until updated with the new one.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOauthRotateApp(null)} className="border-border">Cancel</Button>
          <Button onClick={confirmRotateOAuthSecret} disabled={oauthRotateLoading} className="bg-destructive text-destructive-foreground">
            {oauthRotateLoading ? "Rotating…" : "Rotate Secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
