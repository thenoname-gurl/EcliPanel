"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PORTALS, API_ENDPOINTS } from "@/lib/panel-config"
import { COUNTRIES } from "@/lib/countries"
import { useAuth } from "@/hooks/useAuth"
import { DEFAULT_EDITOR_SETTINGS, EditorSettings } from "@/lib/editor-settings"
import {
  User,
  Mail,
  Key,
  Shield,
  Bell,
  Globe,
  Palette,
  Code,
  Copy,
  Eye,
  EyeOff,
  Save,
  KeyRound,
  Plus,
  Edit,
  Trash2,
  Loader2,
  BookOpen
} from "lucide-react"
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import QRCode from "qrcode"
import { THEMES, applyTheme } from "@/lib/themes"

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

// THEMES and applyTheme are provided from /lib/themes

// Passkey manager component
function PasskeyManager() {
  const { user } = useAuth();
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [editingPasskeyId, setEditingPasskeyId] = useState<number | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState("");

  const load = () => {
    apiFetch(API_ENDPOINTS.passkeys)
      .then((data: any[]) => setPasskeys(Array.isArray(data) ? data : []))
      .catch(() => setPasskeys([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (user) load(); }, [user]);

  const updatePasskeyName = async (id: number, name: string) => {
    try {
      await apiFetch(API_ENDPOINTS.passkeyUpdate.replace(':id', String(id)), {
        method: 'PUT',
        body: JSON.stringify({ name: String(name).trim() }),
      });
      setEditingPasskeyId(null);
      setEditingPasskeyName('');
      load();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  };

  const addPasskey = async () => {
    if (!user) return;
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.credentials) {
      alert("Passkey registration requires a secure connection (HTTPS).\n\nAccess the panel via https:// or configure a TLS certificate.");
      return;
    }
    const initialCount = passkeys.length;
    setRegistering(true);
    try {
      const opts = await apiFetch(API_ENDPOINTS.passkeyRegisterChallenge, { method: "POST", body: JSON.stringify({}) });
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        ...opts,
        challenge: Uint8Array.from(atob(opts.challenge.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
        user: { ...opts.user, id: Uint8Array.from(atob(opts.user.id.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)) },
        excludeCredentials: (opts.excludeCredentials || []).map((c: any) => ({
          ...c,
          id: Uint8Array.from(atob(c.id.replace(/-/g, "+").replace(/_/g, "/")), (x) => x.charCodeAt(0)),
        })),
      };
      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential | null;
      if (!credential) throw new Error("Registration cancelled");
      const attestation = credential.response as AuthenticatorAttestationResponse;
      // helper: encode ArrayBuffer to base64url (same as login page)
      const toB64url = (buf: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      const attestationResponse = {
        id: credential.id,
        rawId: toB64url(credential.rawId),
        response: {
          clientDataJSON: toB64url(attestation.clientDataJSON),
          attestationObject: toB64url(attestation.attestationObject),
          transports: attestation.getTransports?.() || ['internal'],
        },
        type: credential.type,
      };
      await apiFetch(API_ENDPOINTS.passkeyRegister, { method: "POST", body: JSON.stringify({ attestationResponse }) });
      if (initialCount === 0) {
        window.location.reload();
        return;
      }
      load();
    } catch (e: any) {
      alert("Failed to register passkey: " + (e.message || "Unknown error"));
    } finally {
      setRegistering(false);
    }
  };

  const removePasskey = async (id: number) => {
    if (!confirm("Remove this passkey?")) return;
    try {
      await apiFetch(API_ENDPOINTS.passkeyDelete.replace(":id", String(id)), { method: "DELETE" });
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert("Failed: " + e.message);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials) && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <Shield className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">HTTPS required</p>
            <p className="text-xs text-muted-foreground">
              Passkey registration requires a secure connection. Access the panel via <span className="font-mono">https://</span> or set up a TLS certificate.
            </p>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading passkeys...
        </div>
      ) : passkeys.length === 0 ? (
        <div className="flex items-center gap-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <Shield className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">No passkeys registered</p>
            <p className="text-xs text-muted-foreground">Your account has no additional authentication factors. Register a passkey to protect your account.</p>
          </div>
        </div>
      ) : (
        passkeys.map((pk) => (
          <div key={pk.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-primary" />
              <div>
                {editingPasskeyId === pk.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editingPasskeyName}
                      onChange={(e) => setEditingPasskeyName(e.target.value)}
                      className="rounded border border-border bg-input px-2 py-1 text-sm"
                    />
                    <button
                      className="rounded border border-primary px-2 py-1 text-xs text-primary"
                      onClick={() => updatePasskeyName(pk.id, editingPasskeyName)}
                    >Save</button>
                    <button
                      className="rounded border border-border px-2 py-1 text-xs"
                      onClick={() => { setEditingPasskeyId(null); setEditingPasskeyName(''); }}
                    >Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">{pk.name || `Passkey #${pk.id}`}</p>
                    <p className="text-xs text-muted-foreground font-mono">{pk.credentialID?.slice(0, 20)}…</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {editingPasskeyId !== pk.id && (
                <button
                  onClick={() => { setEditingPasskeyId(pk.id); setEditingPasskeyName(pk.name || `Passkey #${pk.id}`); }}
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-foreground transition-colors"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => removePasskey(pk.id)}
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))
      )}
      <button
        onClick={addPasskey}
        disabled={registering || (typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials))}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {registering ? "Waiting for device..." : "Register New Passkey"}
      </button>
    </div>
  );
}

function SshKeyManager() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSshKeyId, setEditingSshKeyId] = useState<number | null>(null);
  const [editingSshKeyName, setEditingSshKeyName] = useState("");

  const loadKeys = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(API_ENDPOINTS.sshKeys);
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const handleAdd = async () => {
    if (!name.trim() || !publicKey.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await apiFetch(API_ENDPOINTS.sshKeys, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), publicKey: publicKey.trim() }),
      });
      setName("");
      setPublicKey("");
      setShowForm(false);
      await loadKeys();
    } catch (e: any) {
      setError(e.message || "Failed to add key");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this SSH key from your account?")) return;
    try {
      await apiFetch(API_ENDPOINTS.sshKeyDelete.replace(":id", String(id)), { method: "DELETE" });
      setKeys(k => k.filter((x: any) => x.id !== id));
    } catch (e: any) {
      alert("Failed to remove key: " + e.message);
    }
  };

  const updateSshKeyName = async (id: number, newName: string) => {
    if (!newName.trim()) return;
    try {
      await apiFetch(API_ENDPOINTS.sshKeyUpdate.replace(":id", String(id)), { method: "PUT", body: JSON.stringify({ name: newName.trim() }) });
      setEditingSshKeyId(null);
      setEditingSshKeyName("");
      loadKeys();
    } catch (e: any) {
      alert("Failed: " + e.message);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-4 text-center">
          <Key className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No SSH keys registered</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Add a key to enable passwordless SFTP login on all your servers.</p>
        </div>
      ) : (
        keys.map((k: any) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <KeyRound className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                {editingSshKeyId === k.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editingSshKeyName}
                      onChange={(e) => setEditingSshKeyName(e.target.value)}
                      className="rounded border border-border bg-input px-2 py-1 text-sm"
                    />
                    <button className="rounded border border-primary px-2 py-1 text-xs text-primary" onClick={() => updateSshKeyName(k.id, editingSshKeyName)}>Save</button>
                    <button className="rounded border border-border px-2 py-1 text-xs" onClick={() => { setEditingSshKeyId(null); setEditingSshKeyName(''); }}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">{k.name}</p>
                    {k.fingerprint && (
                      <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{k.fingerprint}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60">Added {new Date(k.createdAt).toLocaleDateString()}</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingSshKeyId !== k.id && (
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/10 transition-colors"
                  onClick={() => { setEditingSshKeyId(k.id); setEditingSshKeyName(k.name || ''); }}
                >
                  <Edit className="h-4 w-4" />
                </button>
              )}
              <button
              onClick={() => handleDelete(k.id)}
              className="ml-4 shrink-0 rounded-lg border border-destructive/30 bg-transparent px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        ))
      )}

      {showForm ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-4 flex flex-col gap-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Label</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-all"
                placeholder="e.g. MacBook Pro, Work Laptop"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Public Key</label>
            <textarea
              value={publicKey}
              onChange={e => setPublicKey(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-input px-4 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-all resize-none"
              placeholder="ssh-ed25519 AAAA... or ssh-rsa AAAA..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-lg border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !name.trim() || !publicKey.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Key
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          Add SSH Key
        </button>
      )}
    </div>
  );
}

function TwoFactorManager() {
  const { user, refreshUser } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(!!user?.twoFactorEnabled);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableToken, setDisableToken] = useState("");

  useEffect(() => { setEnabled(!!user?.twoFactorEnabled); }, [user]);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res: any = await apiFetch(API_ENDPOINTS.twoFactorSetup, { method: 'GET' });
      setSecret(res.secret);
      setOtpauth(res.otpauth_url);
      const d = await QRCode.toDataURL(res.otpauth_url || '');
      setQrDataUrl(d);
    } catch (e: any) { alert(e.message || 'Failed to start setup'); }
    setLoading(false);
  };

  const verifyAndEnable = async () => {
    if (!secret) return alert('Missing secret');
    setLoading(true);
    try {
      const res: any = await apiFetch(API_ENDPOINTS.twoFactorVerify, { method: 'POST', body: JSON.stringify({ token, secret }) });
      setRecoveryCodes(res.recoveryCodes || null);
      await refreshUser();
      setEnabled(true);
      setSecret(null);
      setOtpauth(null);
      setQrDataUrl(null);
      alert('Two-factor enabled — save your recovery codes now.');
    } catch (e: any) { alert(e.message || 'Failed to verify'); }
    setLoading(false);
  };

  const disable2fa = async () => {
    if (!confirm('Disable two-factor authentication?')) return;
    setLoading(true);
    try {
      await apiFetch(API_ENDPOINTS.twoFactorDisable, { method: 'POST', body: JSON.stringify({ token: disableToken }) });
      await refreshUser();
      setEnabled(false);
      alert('Two-factor disabled');
    } catch (e: any) { alert(e.message || 'Failed to disable'); }
    setLoading(false);
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-3">
      {!enabled ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-foreground">Two-factor is not enabled for your account.</p>
          {!secret ? (
            <div className="mt-3">
              <button onClick={startSetup} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">Enable Two-Factor</button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                {qrDataUrl && <img src={qrDataUrl} alt="TOTP QR" className="h-40 w-40" />}
                <p className="text-xs text-muted-foreground mt-2">Scan the QR with your authenticator app or enter this secret manually:</p>
                <code className="block font-mono text-xs p-2 mt-1 rounded border bg-secondary/20">{secret}</code>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Enter code from app</label>
                <input value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded border border-border px-3 py-2 mt-2" />
                <div className="mt-3 flex gap-2">
                  <button onClick={verifyAndEnable} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Verify & Enable</button>
                  <button onClick={() => { setSecret(null); setOtpauth(null); setQrDataUrl(null); }} className="rounded border px-4 py-2 text-sm">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-foreground">Two-factor is enabled for your account.</p>
          <div className="mt-3">
            <label className="text-sm font-medium text-foreground">Use an authenticator app or passkey to sign in. To disable, enter a current authenticator code.</label>
            <input value={disableToken} onChange={(e) => setDisableToken(e.target.value)} className="w-full rounded border border-border px-3 py-2 mt-2" placeholder="Current authenticator code" />
            <div className="mt-3 flex gap-2">
              <button onClick={disable2fa} className="rounded bg-destructive px-4 py-2 text-sm text-destructive-foreground">Disable 2FA</button>
              <button onClick={async () => { alert('If you lost recovery codes, re-enable 2FA to generate new ones.'); }} className="rounded border px-4 py-2 text-sm">Recovery Codes</button>
            </div>
          </div>
        </div>
      )}

      {recoveryCodes && (
        <div className="rounded-lg border border-border p-4">
          <h5 className="text-sm font-medium text-foreground">Recovery Codes</h5>
          <p className="text-xs text-muted-foreground mt-1">Save these one-time use recovery codes in a safe place. Each can be used once to sign in.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {recoveryCodes.map((c, i) => (
              <code key={i} className="font-mono text-xs rounded border p-2">{c}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// helper component for displaying sessions
function SessionList() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      apiFetch(API_ENDPOINTS.sessions.replace(':userId', user.id.toString()))
        .then((data) => setSessions(data.sessions || []))
        .catch(() => {});
    }
  }, [user]);

  const revoke = async (id: string) => {
    try {
      await apiFetch(API_ENDPOINTS.sessionLogout, { method: 'POST', body: JSON.stringify({ sessionId: id, userId: user?.id }) });
      setSessions((prev) => prev.filter((s) => s !== id));
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {sessions.map((sessionId) => (
        <div key={sessionId} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Session {sessionId.slice(0, 8)}...</p>
                {user?.sessionId === sessionId && (
                  <Badge className="bg-success/20 text-success border-0 text-[10px]">Current</Badge>
                )}
              </div>
            </div>
          </div>
          {user?.sessionId !== sessionId && (
            <button onClick={() => revoke(sessionId)} className="text-xs text-destructive hover:underline">
              Revoke
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>(() => searchParams.get('tab') || 'profile')
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActiveTab(tab)
  }, [searchParams])

  const [showApiKey, setShowApiKey] = useState(false)
  const [activeTheme, setActiveTheme] = useState("Eclipse Purple")
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS)
  const { user, refreshUser } = useAuth()

  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyType, setNewKeyType] = useState("client")
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>([])

  const isAdmin = user?.role === 'admin' || user?.role === 'rootAdmin' || user?.role === '*'

  const loadApiKeys = async () => {
    setApiLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.apiKeysMy)
      setApiKeys(Array.isArray(data) ? data : [])
    } catch {
      setApiKeys([])
    } finally {
      setApiLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadApiKeys()
  }, [user])

  const createApiKey = async () => {
    try {
      if (!user?.id) throw new Error('User not loaded');
      const body: any = { name: newKeyName, type: newKeyType, userId: user.id };
      if (newKeyPerms.length > 0) body.permissions = newKeyPerms;
      const res = await apiFetch(API_ENDPOINTS.apiKeys, { method: 'POST', body: JSON.stringify(body) });
      alert('Key: ' + res.apiKey);
      setNewKeyName('');
      setNewKeyPerms([]);
      loadApiKeys();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  }

  const revokeApiKey = async (id: number) => {
    if (!confirm('Revoke key?')) return
    try {
      await apiFetch(API_ENDPOINTS.apiKeyDetail.replace(':id', id.toString()), { method: 'DELETE' })
      loadApiKeys()
    } catch (e: any) {
      alert('Failed: ' + e.message)
    }
  }

  const [activePlan, setActivePlan] = useState<{ plan: any; order: any } | null>(null)
  const portalMarkerByTier: Record<string, string> = {
    free: "Free Portal",
    paid: "Paid Portal",
    enterprise: "Enterprise Portal",
  }
  const getPortalMarker = (tier?: string) => {
    if (!tier) return "Free Portal"
    return portalMarkerByTier[String(tier).toLowerCase()] ?? "Free Portal"
  }
  const activeTier = String(activePlan?.plan?.type ?? user?.tier ?? "free").toLowerCase()
  const portal = PORTALS[activeTier as keyof typeof PORTALS] ?? PORTALS.free
  const [form, setForm] = useState({
    displayName: user?.displayName || "",
    firstName: user?.firstName || "",
    middleName: user?.middleName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    address: user?.address || "",
    address2: user?.address2 || "",
    phone: user?.phone || "",
    billingCompany: user?.billingCompany || "",
    billingCity: user?.billingCity || "",
    billingState: user?.billingState || "",
    billingZip: user?.billingZip || "",
    billingCountry: user?.billingCountry || "",
  })

  // sync form when user loads
  useEffect(() => {
    if (user) setForm({
      displayName: user.displayName || "",
      firstName: user.firstName || "",
      middleName: user.middleName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      address: user.address || "",
      address2: user.address2 || "",
      phone: user.phone || "",
      billingCompany: user.billingCompany || "",
      billingCity: user.billingCity || "",
      billingState: user.billingState || "",
      billingZip: user.billingZip || "",
      billingCountry: user.billingCountry || "",
    });
  }, [user]);

  // restore saved theme + editor settings from backend
  useEffect(() => {
    const saved = user?.settings?.theme?.name || localStorage.getItem('eclipseTheme');
    if (saved) {
      setActiveTheme(saved);
      const theme = THEMES.find(t => t.name === saved);
      if (theme) applyTheme(theme);
    }

    if (user?.settings?.editor) {
      setEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, ...user.settings.editor });
    }
  }, [user]);

  const saveUserSettings = async (settings: Record<string, any>) => {
    if (!user?.id) return;
    try {
      const merged = { ...(user.settings || {}), ...settings };
      await apiFetch(API_ENDPOINTS.userDetail.replace(":id", String(user.id)), {
        method: "PUT",
        body: JSON.stringify({ settings: merged }),
      });
      await refreshUser();
    } catch (err: any) {
      console.error('Failed to save settings', err);
      alert('Failed to save settings: ' + (err?.message || 'unknown'));
    }
  };

  const DEFAULT_NOTIFICATION_PREFS: Record<string, { label: string; desc: string; enabled: boolean }> = {
    serverAlerts: { label: 'Server Alerts', desc: 'Get notified when servers go offline or have issues', enabled: true },
    billing: { label: 'Billing Notifications', desc: 'Receive invoices and payment reminders', enabled: true },
    security: { label: 'Security Alerts', desc: 'Login attempts and security-related events', enabled: true },
    productUpdates: { label: 'Product Updates', desc: 'New features and platform announcements', enabled: false },
    tickets: { label: 'Ticket Responses', desc: 'Notify when support tickets get a reply', enabled: true },
    aiUsage: { label: 'AI Usage Reports', desc: 'Weekly summary of your AI credit usage', enabled: false },
  };

  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(() => {
    try {
      const fromUser = user?.settings?.notifications || {};
      return Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce((acc, k) => {
        acc[k] = typeof fromUser[k] === 'boolean' ? fromUser[k] : DEFAULT_NOTIFICATION_PREFS[k].enabled;
        return acc;
      }, {} as Record<string, boolean>);
    } catch {
      return Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce((acc, k) => ({ ...acc, [k]: DEFAULT_NOTIFICATION_PREFS[k].enabled }), {} as Record<string, boolean>);
    }
  });

  useEffect(() => {
    // re-sync when user loads/changes
    if (user) {
      const fromUser = user?.settings?.notifications || {};
      setNotificationPrefs(Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce((acc, k) => {
        acc[k] = typeof fromUser[k] === 'boolean' ? fromUser[k] : DEFAULT_NOTIFICATION_PREFS[k].enabled;
        return acc;
      }, {} as Record<string, boolean>));
    }
  }, [user?.settings]);

  const updateTheme = async (themeName: string) => {
    setActiveTheme(themeName);
    const theme = THEMES.find((t) => t.name === themeName);
    if (theme) applyTheme(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('eclipseTheme', themeName);
      try { document.cookie = `eclipseTheme=${encodeURIComponent(themeName)}; path=/`; } catch (e) {}
    }
    await saveUserSettings({ theme: { name: themeName } });
  };

  const updateEditorSettings = async (partial: Partial<EditorSettings>) => {
    const merged = { ...DEFAULT_EDITOR_SETTINGS, ...(user?.settings?.editor || {}), ...partial };
    setEditorSettings(merged);
    await saveUserSettings({ editor: merged });
  };

  useEffect(() => {
    apiFetch(API_ENDPOINTS.orders)
      .then(async (data) => {
        const orderList = Array.isArray(data) ? data : []
        const planOrder = orderList.find((o: any) => o.status === "active" && o.planId)
        if (!planOrder) {
          setActivePlan(null)
          return
        }
        try {
          const plan = await apiFetch(API_ENDPOINTS.planDetail.replace(":id", String(planOrder.planId)))
          setActivePlan({ plan, order: planOrder })
        } catch {
          setActivePlan(null)
        }
      })
      .catch(() => setActivePlan(null))
  }, [])

  return (
    <>
      <PanelHeader title="Account Settings" description="Manage your account preferences and security" />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="flex flex-col gap-6 p-6 max-w-[100vw] w-full min-w-0 box-border">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex gap-2 overflow-x-auto scrollbar-none px-2 border border-border bg-secondary/50">
              <TabsTrigger value="profile" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                Security
              </TabsTrigger>
              <TabsTrigger value="notifications" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                Notifications
              </TabsTrigger>
              <TabsTrigger value="api" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                API
              </TabsTrigger>
              <TabsTrigger value="appearance" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                Appearance
              </TabsTrigger>
              <TabsTrigger value="editor" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                Editor
              </TabsTrigger>
            </TabsList>

            {/* Profile */}
            <TabsContent value="profile" className="mt-4">
              <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                <SectionHeader title="Profile Information" description="Update your personal details" />

                {/* Avatar upload */}
                <div className="mt-4 mb-6 flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-secondary/50 border border-border flex items-center justify-center overflow-hidden">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">{user?.firstName?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Profile Picture</p>
                    <label className="cursor-pointer">
                      <span className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80 transition-colors">
                        Upload Photo
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file || !user?.id) return
                          try {
                            const fd = new FormData()
                            fd.append("file", file)
                            await apiFetch(API_ENDPOINTS.userAvatar.replace(":id", String(user.id)), { method: "POST", body: fd })
                            await refreshUser()
                          } catch (err: any) {
                            alert("Upload failed: " + err.message)
                          }
                        }}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG or WebP. 256×256.</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Display Name</label>
                    <input
                      type="text"
                      placeholder="How you appear in the panel"
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Email Address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                </div>

                {/* Legal Name Section */}
                <div className="mt-8 mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Legal Name</h3>
                  <p className="text-xs text-muted-foreground">Used for billing and ID verification. Must match your government ID.</p>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Middle Name</label>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={form.middleName}
                      onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                </div>

                {/* Billing Information Section */}
                <div className="mt-8 mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Billing Information</h3>
                  <p className="text-xs text-muted-foreground">Used for invoices and payment processing.</p>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Street Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Address Line 2</label>
                    <input
                      type="text"
                      placeholder="Apt, Suite, Unit (optional)"
                      value={form.address2}
                      onChange={(e) => setForm({ ...form, address2: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Company</label>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={form.billingCompany}
                      onChange={(e) => setForm({ ...form, billingCompany: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">City</label>
                    <input
                      type="text"
                      value={form.billingCity}
                      onChange={(e) => setForm({ ...form, billingCity: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">State / Province</label>
                    <input
                      type="text"
                      value={form.billingState}
                      onChange={(e) => setForm({ ...form, billingState: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">ZIP / Postal Code</label>
                    <input
                      type="text"
                      value={form.billingZip}
                      onChange={(e) => setForm({ ...form, billingZip: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Country</label>
                    <select
                      value={form.billingCountry}
                      onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    >
                      <option value="">Select country</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.name}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Account ID</label>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-4 py-2.5">
                      <span className="font-mono text-sm text-muted-foreground">{user?.id}</span>
                      <button className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-foreground">Current Plan</label>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-4 py-2.5">
                      <portal.icon className="h-4 w-4" style={{ color: portal.color }} />
                      <span className="text-sm text-foreground">{getPortalMarker(activePlan?.plan?.type ?? activeTier)}</span>
                      <Badge className="ml-auto bg-primary/20 text-primary border-0 text-[10px]">Active</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(API_ENDPOINTS.userDetail.replace(":id", user?.id?.toString() ?? ''), {
                          method: "PUT",
                          body: JSON.stringify({
                            displayName: form.displayName || undefined,
                            firstName: form.firstName,
                            middleName: form.middleName || undefined,
                            lastName: form.lastName,
                            email: form.email,
                            address: form.address,
                            address2: form.address2 || undefined,
                            phone: form.phone || undefined,
                            billingCompany: form.billingCompany || undefined,
                            billingCity: form.billingCity || undefined,
                            billingState: form.billingState || undefined,
                            billingZip: form.billingZip || undefined,
                            billingCountry: form.billingCountry || undefined,
                          }),
                        });
                        await refreshUser();
                        alert("Profile updated");
                      } catch (err: any) {
                        alert("Failed to save: " + err.message);
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Save className="h-4 w-4" />
                    Save Changes
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security" className="mt-4">
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                  <SectionHeader title="Password" description="Change your account password" />
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">Current Password</label>
                      <input
                        type="password"
                        placeholder="Enter current password"
                        className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                      />
                    </div>
                    <div />
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">New Password</label>
                      <input
                        type="password"
                        placeholder="Enter new password"
                        className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">Confirm Password</label>
                      <input
                        type="password"
                        placeholder="Confirm new password"
                        className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                      Update Password
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                  <SectionHeader title="Passkeys &amp; Two-Factor Security" description="Use a passkey as your second factor or primary login method" />
                  <PasskeyManager />

                  {/* Two-Factor (TOTP) management */}
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-foreground">Two-Factor Authentication (TOTP)</h4>
                    <p className="text-xs text-muted-foreground mt-1">Protect your account with an authenticator app (Google Authenticator, Authy, etc.). You can also use passkeys or recovery codes.</p>
                    <div className="mt-4">
                      <TwoFactorManager />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                  <SectionHeader title="SSH Public Keys" description="Keys used for passwordless SFTP / SSH authentication on your servers" />
                  <SshKeyManager />
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                  <SectionHeader title="Active Sessions" description="Manage your logged in devices" />
                  <SessionList />
                </div>
                <div className="mt-4 flex justify-end gap-4">
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(API_ENDPOINTS.sessionLogoutAll, { method: 'POST', body: JSON.stringify({ userId: user?.id }) });
                        alert('Logged out of all sessions');
                      } catch (e: any) {
                        alert('Failed: ' + e.message);
                      }
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Logout everywhere
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(API_ENDPOINTS.deletionRequests, { method: 'POST' });
                        alert('Deletion request sent');
                      } catch (e: any) {
                        alert('Failed: ' + e.message);
                      }
                    }}
                    className="rounded-lg bg-destructive px-6 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    Request Account Deletion
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Notifications */}
            <TabsContent value="notifications" className="mt-4">
              <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                <SectionHeader title="Notification Preferences" description="Choose what you want to be notified about" />
                <div className="mt-6 flex flex-col gap-4">
                  {Object.keys(DEFAULT_NOTIFICATION_PREFS).map((key) => {
                    const info = DEFAULT_NOTIFICATION_PREFS[key];
                    const enabled = !!notificationPrefs[key];
                    return (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                        <div className="flex items-center gap-3">
                          <Bell className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.desc}</p>
                          </div>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={async (v) => {
                            const newPrefs = { ...notificationPrefs, [key]: !!v };
                            setNotificationPrefs(newPrefs);
                            try {
                              await saveUserSettings({ notifications: newPrefs });
                            } catch (e: any) {
                              // revert on failure
                              setNotificationPrefs(notificationPrefs);
                              alert('Failed to save notification preferences: ' + (e?.message || 'unknown'));
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* API */}
            <TabsContent value="api" className="mt-4">
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border bg-card p-6">
                  <SectionHeader title="API Keys" description="Manage your API access keys" />
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="Key name"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        className="rounded border border-border px-3 py-2"
                      />
                      <select
                        value={newKeyType}
                        onChange={(e) => setNewKeyType(e.target.value)}
                        className="rounded border border-border bg-input px-3 py-2 text-sm text-foreground outline-none"
                      >
                        <option value="client">Client</option>
                        {isAdmin && <option value="admin">Admin</option>}
                      </select>
                      {newKeyType === 'client' && (
                        <div className="grid grid-cols-2 gap-1 rounded border border-border bg-secondary/20 p-3">
                          {AVAILABLE_PERMISSIONS.map((perm) => (
                            <label key={perm} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newKeyPerms.includes(perm)}
                                onChange={(e) => {
                                  if (e.target.checked) setNewKeyPerms((p) => [...p, perm])
                                  else setNewKeyPerms((p) => p.filter((x) => x !== perm))
                                }}
                                className="accent-primary"
                              />
                              <span className="text-muted-foreground hover:text-foreground transition-colors">{perm}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={createApiKey}
                        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        <Code className="h-4 w-4" /> Generate New Key
                      </button>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                      {apiLoading ? (
                        <p>Loading keys...</p>
                      ) : apiKeys.length === 0 ? (
                        <p>No API keys found</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {apiKeys.map((k) => (
                            <li key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{k.name}</p>
                                <p className="text-xs text-muted-foreground">{k.type} &bull; {k.permissions?.join(', ')}</p>
                              </div>
                              <button
                                onClick={() => revokeApiKey(k.id)}
                                className="text-destructive text-xs"
                              >
                                Revoke
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                  <SectionHeader title="API Documentation" description="Quick reference for the Eclipse API" />
                  <button
                    onClick={() => window.open('https://backend.ecli.app/openapi', '_blank')}
                    className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <BookOpen className="h-4 w-4" /> View API Docs
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Appearance */}
            <TabsContent value="appearance" className="mt-4">
              <div className="rounded-xl border border-border bg-card p-6 min-w-0 box-border overflow-hidden">
                <SectionHeader title="Theme Settings" description="Customize the panel appearance" />
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {THEMES.map((theme) => {
                    const isActive = activeTheme === theme.name;
                    return (
                    <button
                      key={theme.name}
                      onClick={() => updateTheme(theme.name)}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                        isActive
                          ? "border-primary/50 bg-primary/5 shadow-[0_0_15px_var(--glow)]"
                          : "border-border bg-secondary/30 hover:border-primary/20"
                      }`}
                    >
                      <div className="flex gap-1.5">
                        <div className="h-8 w-8 rounded-md" style={{ backgroundColor: theme.bg, border: "1px solid var(--border)" }} />
                        <div className="h-8 w-8 rounded-md" style={{ backgroundColor: theme.primary }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{theme.name}</p>
                        {isActive && <p className="text-[10px] text-primary">Active</p>}
                      </div>
                    </button>
                    );
                  })}
                </div>

              </div>
            </TabsContent>

            {/* Editor */}
            <TabsContent value="editor" className="mt-4">
              <div className="rounded-xl border border-border bg-card p-6">
                <SectionHeader
                  title="Code Editor"
                  description="Configure editor behavior and AI-assisted suggestions"
                  action={
                    <button
                      onClick={() => updateEditorSettings(DEFAULT_EDITOR_SETTINGS)}
                      className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80"
                    >
                      Reset to defaults
                    </button>
                  }
                />
                <div className="mt-6 grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">AI assistant (inline suggestions)</p>
                      <p className="text-xs text-muted-foreground">Show inline code completions generated by AI.</p>
                      <p className="text-xs text-muted-foreground">Note: This is a beta feature and may not work in all scenarios.</p>
                    </div>
                    <Switch checked={!!editorSettings.aiAssistant} onCheckedChange={(v) => updateEditorSettings({ aiAssistant: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Auto indent</p>
                      <p className="text-xs text-muted-foreground">Automatically indent new lines.</p>
                    </div>
                    <Switch checked={!!editorSettings.autoIndent} onCheckedChange={(v) => updateEditorSettings({ autoIndent: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Font size</p>
                      <p className="text-xs text-muted-foreground">Controls editor font size (in px).</p>
                    </div>
                    <input
                      type="number"
                      min={8}
                      max={24}
                      value={editorSettings.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize}
                      onChange={(e) => updateEditorSettings({ fontSize: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Font family</p>
                      <p className="text-xs text-muted-foreground">Choose the editor font.</p>
                    </div>
                    <select
                      value={editorSettings.fontFamily ?? DEFAULT_EDITOR_SETTINGS.fontFamily}
                      onChange={(e) => updateEditorSettings({ fontFamily: e.target.value })}
                      className="w-56 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    >
                      <option value='"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace'>JetBrains Mono / Fira Code</option>
                      <option value='"Source Code Pro", "Menlo", "Consolas", "Courier New", monospace'>Source Code Pro</option>
                      <option value='"Arial", "Helvetica", sans-serif'>Arial / Sans</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Show minimap</p>
                      <p className="text-xs text-muted-foreground">Toggle the editor minimap panel.</p>
                    </div>
                    <Switch checked={!!editorSettings.minimap} onCheckedChange={(v) => updateEditorSettings({ minimap: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Tab size</p>
                      <p className="text-xs text-muted-foreground">Number of spaces inserted when pressing Tab.</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={editorSettings.tabSize ?? DEFAULT_EDITOR_SETTINGS.tabSize}
                      onChange={(e) => updateEditorSettings({ tabSize: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:shadow-[0_0_10px_var(--glow)] transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Format on paste</p>
                      <p className="text-xs text-muted-foreground">Automatically format code when pasting.</p>
                    </div>
                    <Switch checked={!!editorSettings.formatOnPaste} onCheckedChange={(v) => updateEditorSettings({ formatOnPaste: v })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Format on type</p>
                      <p className="text-xs text-muted-foreground">Automatically format as you type.</p>
                    </div>
                    <Switch checked={!!editorSettings.formatOnType} onCheckedChange={(v) => updateEditorSettings({ formatOnType: v })} />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </>
  )
}
