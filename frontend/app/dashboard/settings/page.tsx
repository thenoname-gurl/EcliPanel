"use client"

import { PanelHeader } from "@/components/panel/header"
import { useEffect, useRef, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { PORTALS } from "@/lib/panel-config"
import { COUNTRIES } from "@/lib/countries"
import { resolveTaxRate, sanitizeCurrencyCode } from "@/lib/billing-display"
import { DEFAULT_EDITOR_SETTINGS, EditorSettings } from "@/lib/editor-settings"
import { cn } from "@/lib/utils"
import { getBadgeColorClass } from "@/lib/badge-colors"
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
  BookOpen,
  ChevronRight,
  Settings,
  Lock,
  CreditCard,
  MapPin,
  Phone,
  Building,
  Camera,
  Check,
  X,
  Sparkles,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Upload,
  ExternalLink,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
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
] as const

function FormInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon: Icon,
  className = "",
  error,
  hint,
  disabled,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  icon?: React.ElementType
  className?: string
  error?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative min-w-0">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border bg-secondary/30 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-0 disabled:opacity-50 disabled:cursor-not-allowed",
            Icon ? "pl-10" : "px-3",
            error ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"
          )}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SettingsCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4 md:p-6 min-w-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow", className)}>
      {children}
    </div>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  onClick,
}: {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  const Component = onClick ? "button" : "div"
  return (
    <Component
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 md:p-4 min-w-0 transition-all",
        onClick && "cursor-pointer hover:bg-secondary/40 active:scale-[0.98]",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onClick && !action && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </Component>
  )
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
  guideId,
  count,
}: {
  active: boolean
  icon: React.ElementType
  label: string
  onClick: () => void
  guideId?: string
  count?: number
}) {
  return (
    <button
      data-guide-id={guideId}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 rounded-lg px-3 md:px-4 py-2.5 text-xs font-medium transition-all whitespace-nowrap flex-shrink-0",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  )
}

function PasskeyManager() {
  const { user } = useAuth()
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [editingPasskeyId, setEditingPasskeyId] = useState<number | null>(null)
  const [editingPasskeyName, setEditingPasskeyName] = useState("")

  const load = () => {
    apiFetch(API_ENDPOINTS.passkeys)
      .then((data: any[]) => setPasskeys(Array.isArray(data) ? data : []))
      .catch(() => setPasskeys([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  const updatePasskeyName = async (id: number, name: string) => {
    try {
      await apiFetch(API_ENDPOINTS.passkeyUpdate.replace(":id", String(id)), {
        method: "PUT",
        body: JSON.stringify({ name: String(name).trim() }),
      })
      setEditingPasskeyId(null)
      setEditingPasskeyName("")
      load()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const addPasskey = async () => {
    if (!user) return
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.credentials) {
      alert("Passkey registration requires a secure connection (HTTPS).")
      return
    }
    const initialCount = passkeys.length
    setRegistering(true)
    try {
      const opts = await apiFetch(API_ENDPOINTS.passkeyRegisterChallenge, {
        method: "POST",
        body: JSON.stringify({}),
      })
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        ...opts,
        challenge: Uint8Array.from(
          atob(opts.challenge.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0)
        ),
        user: {
          ...opts.user,
          id: Uint8Array.from(
            atob(opts.user.id.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0)
          ),
        },
        excludeCredentials: (opts.excludeCredentials || []).map((c: any) => ({
          ...c,
          id: Uint8Array.from(
            atob(c.id.replace(/-/g, "+").replace(/_/g, "/")),
            (x) => x.charCodeAt(0)
          ),
        })),
      }
      const credential = (await navigator.credentials.create({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null
      if (!credential) throw new Error("Registration cancelled")
      const attestation = credential.response as AuthenticatorAttestationResponse
      const toB64url = (buf: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "")
      const attestationResponse = {
        id: credential.id,
        rawId: toB64url(credential.rawId),
        response: {
          clientDataJSON: toB64url(attestation.clientDataJSON),
          attestationObject: toB64url(attestation.attestationObject),
          transports: attestation.getTransports?.() || ["internal"],
        },
        type: credential.type,
      }
      await apiFetch(API_ENDPOINTS.passkeyRegister, {
        method: "POST",
        body: JSON.stringify({ attestationResponse }),
      })
      if (initialCount === 0) {
        window.location.reload()
        return
      }
      load()
    } catch (e: any) {
      alert("Failed to register passkey: " + (e.message || "Unknown error"))
    } finally {
      setRegistering(false)
    }
  }

  const removePasskey = async (id: number) => {
    if (!confirm("Remove this passkey?")) return
    try {
      await apiFetch(API_ENDPOINTS.passkeyDelete.replace(":id", String(id)), { method: "DELETE" })
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2.5 min-w-0">
      {typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials) && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 min-w-0">
          <Shield className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">HTTPS required</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Passkey registration requires a secure connection.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading passkeys...
        </div>
      ) : passkeys.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/10 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No passkeys registered</p>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Add a passkey to secure your account with biometric or hardware authentication.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 min-w-0">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 md:p-4 min-w-0 overflow-hidden hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {editingPasskeyId === pk.id ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        value={editingPasskeyName}
                        onChange={(e) => setEditingPasskeyName(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updatePasskeyName(pk.id, editingPasskeyName)
                          if (e.key === "Escape") { setEditingPasskeyId(null); setEditingPasskeyName("") }
                        }}
                      />
                      <button
                        className="shrink-0 rounded-lg p-2 text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => updatePasskeyName(pk.id, editingPasskeyName)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary transition-colors"
                        onClick={() => { setEditingPasskeyId(null); setEditingPasskeyName("") }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate">
                        {pk.name || `Passkey #${pk.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                        {pk.credentialID?.slice(0, 20)}…
                      </p>
                    </>
                  )}
                </div>
              </div>
              {editingPasskeyId !== pk.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingPasskeyId(pk.id); setEditingPasskeyName(pk.name || `Passkey #${pk.id}`) }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removePasskey(pk.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addPasskey}
        disabled={registering || (typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials))}
        className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/20 px-4 py-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {registering ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for device...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Register New Passkey
          </>
        )}
      </button>
    </div>
  )
}

function SshKeyManager() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingSshKeyId, setEditingSshKeyId] = useState<number | null>(null)
  const [editingSshKeyName, setEditingSshKeyName] = useState("")

  const loadKeys = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.sshKeys)
      setKeys(Array.isArray(data) ? data : [])
    } catch {
      setKeys([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKeys() }, [])

  const handleAdd = async () => {
    if (!name.trim() || !publicKey.trim()) return
    setAdding(true)
    setError(null)
    try {
      await apiFetch(API_ENDPOINTS.sshKeys, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), publicKey: publicKey.trim() }),
      })
      setName("")
      setPublicKey("")
      setShowForm(false)
      await loadKeys()
    } catch (e: any) {
      setError(e.message || "Failed to add key")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this SSH key from your account?")) return
    try {
      await apiFetch(API_ENDPOINTS.sshKeyDelete.replace(":id", String(id)), { method: "DELETE" })
      setKeys((k) => k.filter((x: any) => x.id !== id))
    } catch (e: any) {
      alert("Failed to remove key: " + e.message)
    }
  }

  const updateSshKeyName = async (id: number, newName: string) => {
    if (!newName.trim()) return
    try {
      await apiFetch(API_ENDPOINTS.sshKeyUpdate.replace(":id", String(id)), {
        method: "PUT",
        body: JSON.stringify({ name: newName.trim() }),
      })
      setEditingSshKeyId(null)
      setEditingSshKeyName("")
      loadKeys()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2.5 min-w-0">
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading keys...
        </div>
      ) : keys.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/10 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
            <Key className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No SSH keys</p>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Add SSH keys for passwordless SFTP access to your servers.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 min-w-0">
          {keys.map((k: any) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 md:p-4 min-w-0 overflow-hidden hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {editingSshKeyId === k.id ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        value={editingSshKeyName}
                        onChange={(e) => setEditingSshKeyName(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateSshKeyName(k.id, editingSshKeyName)
                          if (e.key === "Escape") { setEditingSshKeyId(null); setEditingSshKeyName("") }
                        }}
                      />
                      <button
                        className="shrink-0 rounded-lg p-2 text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => updateSshKeyName(k.id, editingSshKeyName)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary transition-colors"
                        onClick={() => { setEditingSshKeyId(null); setEditingSshKeyName("") }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate">{k.name}</p>
                      {k.fingerprint && (
                        <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">
                          {k.fingerprint}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              {editingSshKeyId !== k.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    onClick={() => { setEditingSshKeyId(k.id); setEditingSshKeyName(k.name || "") }}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(k.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-xl border border-border bg-secondary/10 p-4 flex flex-col gap-3 min-w-0 overflow-hidden animate-in slide-in-from-top-2">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive break-words">{error}</p>
            </div>
          )}
          <FormInput label="Label" value={name} onChange={setName} placeholder="e.g. MacBook Pro" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Public Key</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              rows={4}
              className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none min-w-0 w-full"
              placeholder="ssh-ed25519 AAAA... or ssh-rsa AAAA..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="flex-1 rounded-lg border border-border bg-secondary/50 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !name.trim() || !publicKey.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors active:scale-[0.98]"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Key
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/20 px-4 py-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add SSH Key
        </button>
      )}
    </div>
  )
}

function TwoFactorManager() {
  const { user, refreshUser } = useAuth()
  const [enabled, setEnabled] = useState<boolean>(!!user?.twoFactorEnabled)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauth, setOtpauth] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disableToken, setDisableToken] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => { setEnabled(!!user?.twoFactorEnabled) }, [user])

  const startSetup = async () => {
    setLoading(true)
    try {
      const res: any = await apiFetch(API_ENDPOINTS.twoFactorSetup, { method: "GET" })
      setSecret(res.secret)
      setOtpauth(res.otpauth_url)
      const d = await QRCode.toDataURL(res.otpauth_url || "")
      setQrDataUrl(d)
    } catch (e: any) {
      alert(e.message || "Failed to start setup")
    }
    setLoading(false)
  }

  const verifyAndEnable = async () => {
    if (!secret) return alert("Missing secret")
    setLoading(true)
    try {
      const res: any = await apiFetch(API_ENDPOINTS.twoFactorVerify, {
        method: "POST",
        body: JSON.stringify({ token, secret }),
      })
      setRecoveryCodes(res.recoveryCodes || null)
      await refreshUser()
      setEnabled(true)
      setSecret(null)
      setOtpauth(null)
      setQrDataUrl(null)
      alert("Two-factor enabled — save your recovery codes now.")
    } catch (e: any) {
      alert(e.message || "Failed to verify")
    }
    setLoading(false)
  }

  const disable2fa = async () => {
    if (!confirm("Disable two-factor authentication?")) return
    setLoading(true)
    try {
      await apiFetch(API_ENDPOINTS.twoFactorDisable, {
        method: "POST",
        body: JSON.stringify({ token: disableToken }),
      })
      await refreshUser()
      setEnabled(false)
      alert("Two-factor disabled")
    } catch (e: any) {
      alert(e.message || "Failed to disable")
    }
    setLoading(false)
  }

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4 min-w-0">
      {!enabled ? (
        <div className="rounded-xl border border-border bg-secondary/20 p-4 md:p-5 min-w-0 overflow-hidden">
          {!secret ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Two-factor is not enabled</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add an extra layer of security to your account.
                </p>
              </div>
              <button
                onClick={startSetup}
                disabled={loading}
                className="w-full sm:w-auto shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {loading ? "Loading..." : "Enable 2FA"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5 min-w-0 animate-in slide-in-from-top-3">
              <div className="flex flex-col items-center gap-4 min-w-0">
                {qrDataUrl && (
                  <div className="relative">
                    <img src={qrDataUrl} alt="TOTP QR" className="h-40 w-40 md:h-48 md:w-48 rounded-xl border-2 border-border shadow-lg" />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                  </div>
                )}
                <div className="text-center max-w-md">
                  <p className="text-sm font-medium text-foreground mb-1">Scan with your authenticator</p>
                  <p className="text-xs text-muted-foreground">
                    Use Google Authenticator, Authy, or any TOTP-compatible app
                  </p>
                </div>
                <div className="w-full min-w-0 overflow-hidden">
                  <p className="text-xs text-muted-foreground mb-2 text-center">Or enter this code manually:</p>
                  <div className="relative">
                    <code className="block font-mono text-xs md:text-sm p-3 md:p-4 rounded-lg border bg-secondary/30 break-all text-center select-all">
                      {secret}
                    </code>
                    <button
                      onClick={copySecret}
                      className="absolute top-2 right-2 p-2 rounded-lg bg-secondary/80 hover:bg-secondary transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <FormInput
                  label="Verification Code"
                  value={token}
                  onChange={setToken}
                  placeholder="Enter 6-digit code"
                  hint="Enter the code from your authenticator app"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSecret(null); setOtpauth(null); setQrDataUrl(null) }}
                    className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:bg-secondary active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={verifyAndEnable}
                    disabled={loading || !token || token.length !== 6}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
                  >
                    {loading ? "Verifying..." : "Verify & Enable"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-secondary/20 p-4 md:p-5 min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Two-factor is enabled</p>
              <p className="text-xs text-muted-foreground">Your account is secured with 2FA.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 min-w-0">
            <FormInput
              label="Enter code to disable"
              value={disableToken}
              onChange={setDisableToken}
              placeholder="6-digit code"
              hint="This will remove 2FA protection from your account"
            />
            <button
              onClick={disable2fa}
              disabled={loading || !disableToken || disableToken.length !== 6}
              className="rounded-lg bg-destructive py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading ? "Disabling..." : "Disable 2FA"}
            </button>
          </div>
        </div>
      )}

      {recoveryCodes && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 md:p-5 min-w-0 overflow-hidden animate-in slide-in-from-bottom-3">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h5 className="text-sm font-semibold text-foreground">Recovery Codes</h5>
              <p className="text-xs text-muted-foreground mt-1">
                Save these codes securely. Each can be used once if you lose access to your authenticator.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
            {recoveryCodes.map((c, i) => (
              <code
                key={i}
                className="font-mono text-xs md:text-sm rounded-lg border bg-secondary/30 p-3 text-center select-all truncate hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                {c}
              </code>
            ))}
          </div>
          <button
            onClick={() => {
              const text = recoveryCodes.join("\n")
              navigator.clipboard.writeText(text)
              alert("Recovery codes copied to clipboard")
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Copy className="h-4 w-4" />
            Copy All Codes
          </button>
        </div>
      )}
    </div>
  )
}

function SessionList() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      setLoading(true)
      apiFetch(API_ENDPOINTS.sessions.replace(":userId", user.id.toString()))
        .then((data) => setSessions(data.sessions || []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [user])

  const revoke = async (id: string) => {
    try {
      await apiFetch(API_ENDPOINTS.sessionLogout, {
        method: "POST",
        body: JSON.stringify({ sessionId: id, userId: user?.id }),
      })
      setSessions((prev) => prev.filter((s) => s !== id))
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading sessions...
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 min-w-0">
      {sessions.map((sessionId) => (
        <div
          key={sessionId}
          className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 md:p-4 min-w-0 overflow-hidden hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium text-foreground truncate min-w-0">
                  Session {sessionId.slice(0, 10)}...
                </p>
                {user?.sessionId === sessionId && (
                  <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-0 text-[10px] px-2 shrink-0">
                    Current
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {user?.sessionId !== sessionId && (
            <button
              onClick={() => revoke(sessionId)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors active:scale-[0.98]"
            >
              Revoke
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>(
    () => searchParams.get("tab") || "profile"
  )
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab) setActiveTab(tab)
  }, [searchParams])

  const [activeTheme, setActiveTheme] = useState("Eclipse Purple")
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS)
  const { user, refreshUser } = useAuth()

  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [apiLoading, setApiLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyType, setNewKeyType] = useState("client")
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>([])
  const [showApiForm, setShowApiForm] = useState(false)

  const isAdmin = user?.role === "admin" || user?.role === "rootAdmin" || user?.role === "*"

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

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
      if (!user?.id) throw new Error("User not loaded")
      const body: any = { name: newKeyName, type: newKeyType, userId: user.id }
      if (newKeyPerms.length > 0) body.permissions = newKeyPerms
      const res = await apiFetch(API_ENDPOINTS.apiKeys, {
        method: "POST",
        body: JSON.stringify(body),
      })
      alert("Key created: " + res.apiKey)
      setNewKeyName("")
      setNewKeyPerms([])
      setShowApiForm(false)
      loadApiKeys()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const revokeApiKey = async (id: number) => {
    if (!confirm("Revoke this API key?")) return
    try {
      await apiFetch(API_ENDPOINTS.apiKeyDetail.replace(":id", id.toString()), { method: "DELETE" })
      loadApiKeys()
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const updatePassword = async () => {
    if (!user?.id) return
    setPasswordError("")
    
    if (!currentPassword) {
      setPasswordError("Please enter your current password")
      return
    }
    if (!newPassword) {
      setPasswordError("Please enter a new password")
      return
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }

    setPasswordSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.userDetail.replace(":id", String(user.id)), {
        method: "PUT",
        body: JSON.stringify({ password: newPassword, currentPassword }),
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      await refreshUser()
      alert("Password updated successfully.")
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password")
    } finally {
      setPasswordSaving(false)
    }
  }

  const [activePlan, setActivePlan] = useState<{ plan: any; order: any } | null>(null)
  const [billingCurrency, setBillingCurrency] = useState("USD")
  const [billingTaxRules, setBillingTaxRules] = useState("")
  const [saving, setSaving] = useState(false)

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
  const displayCurrency = sanitizeCurrencyCode(billingCurrency)

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

  useEffect(() => {
    if (user)
      setForm({
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
      })
  }, [user])

  useEffect(() => {
    const saved = user?.settings?.theme?.name
    if (saved) {
      setActiveTheme(saved)
      const theme = THEMES.find((t) => t.name === saved)
      if (theme) applyTheme(theme)
    }
    if (user?.settings?.editor) {
      setEditorSettings({ ...DEFAULT_EDITOR_SETTINGS, ...user.settings.editor })
    }
  }, [user])

  const saveUserSettings = async (settings: Record<string, any>) => {
    if (!user?.id) return
    try {
      const merged = { ...(user.settings || {}), ...settings }
      await apiFetch(API_ENDPOINTS.userDetail.replace(":id", String(user.id)), {
        method: "PUT",
        body: JSON.stringify({ settings: merged }),
      })
      await refreshUser()
    } catch (err: any) {
      console.error("Failed to save settings", err)
      alert("Failed to save settings: " + (err?.message || "unknown"))
    }
  }

  const DEFAULT_NOTIFICATION_PREFS: Record<string, { label: string; desc: string; enabled: boolean }> = {
    serverAlerts: { label: "Server Alerts", desc: "Notifications when servers go offline", enabled: true },
    serverLifecycle: { label: "Server Events", desc: "Create, stop, start, delete events", enabled: true },
    serverErrors: { label: "Server Errors", desc: "Crashes and failures", enabled: true },
    serverActivity: { label: "Verbose Activity", desc: "Detailed lifecycle events", enabled: false },
    billing: { label: "Billing", desc: "Invoices and payments", enabled: true },
    security: { label: "Security", desc: "Login attempts and alerts", enabled: true },
    productUpdates: { label: "Product Updates", desc: "New features and announcements", enabled: false },
    tickets: { label: "Tickets", desc: "Support ticket replies", enabled: true },
    aiUsage: { label: "AI Usage", desc: "Weekly AI credit summary", enabled: false },
  }

  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(() => {
    try {
      const fromUser = user?.settings?.notifications || {}
      return Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce(
        (acc, k) => {
          acc[k] = typeof fromUser[k] === "boolean" ? fromUser[k] : DEFAULT_NOTIFICATION_PREFS[k].enabled
          return acc
        },
        {} as Record<string, boolean>
      )
    } catch {
      return Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce(
        (acc, k) => ({ ...acc, [k]: DEFAULT_NOTIFICATION_PREFS[k].enabled }),
        {} as Record<string, boolean>
      )
    }
  })

  useEffect(() => {
    if (user) {
      const fromUser = user?.settings?.notifications || {}
      setNotificationPrefs(
        Object.keys(DEFAULT_NOTIFICATION_PREFS).reduce(
          (acc, k) => {
            acc[k] = typeof fromUser[k] === "boolean" ? fromUser[k] : DEFAULT_NOTIFICATION_PREFS[k].enabled
            return acc
          },
          {} as Record<string, boolean>
        )
      )
    }
  }, [user?.settings])

  const updateTheme = async (themeName: string) => {
    if (themeName === activeTheme) return

    const newThemeObj = THEMES.find((t) => t.name === themeName)
    if (!newThemeObj) return

    setActiveTheme(themeName)
    await applyTheme(newThemeObj, { animate: true })

    await saveUserSettings({ theme: { name: themeName } })
  }

  const updateEditorSettings = async (partial: Partial<EditorSettings>) => {
    const merged = { ...DEFAULT_EDITOR_SETTINGS, ...(user?.settings?.editor || {}), ...partial }
    setEditorSettings(merged)
    await saveUserSettings({ editor: merged })
  }

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data: any) => {
        setBillingCurrency(data?.billingCurrency || "USD")
        setBillingTaxRules(data?.billingTaxRules || "")
      })
      .catch(() => {
        setBillingCurrency("USD")
        setBillingTaxRules("")
      })

    apiFetch(API_ENDPOINTS.orders)
      .then(async (data) => {
        const orderList = Array.isArray(data) ? data : []
        const planOrder = orderList.find((o: any) => o.status === "active" && o.planId)
        if (!planOrder) { setActivePlan(null); return }
        try {
          const plan = await apiFetch(API_ENDPOINTS.planDetail.replace(":id", String(planOrder.planId)))
          setActivePlan({ plan, order: planOrder })
        } catch { setActivePlan(null) }
      })
      .catch(() => setActivePlan(null))
  }, [])

  const selectedCountryTaxRate = resolveTaxRate(billingTaxRules, form.billingCountry)
  const userBadges = Array.isArray((user as any)?.settings?.badges)
    ? ((user as any).settings.badges as string[])
    : Array.isArray((user as any)?.settings?.gambling?.badges)
      ? ((user as any).settings.gambling.badges as string[])
    : []

  const showGuideAgain = async () => {
    if (!user?.id) return
    try {
      await apiFetch(API_ENDPOINTS.userGuide.replace(":id", String(user.id)), {
        method: "POST",
        body: JSON.stringify({ shown: false }),
      })
      const params = new URLSearchParams(window.location.search)
      params.set("guide", "true")
      window.history.replaceState({}, "", window.location.pathname + "?" + params.toString())
      window.location.reload()
    } catch (e: any) {
      alert("Failed: " + (e.message || e))
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await apiFetch(
        API_ENDPOINTS.userDetail.replace(":id", user?.id?.toString() ?? ""),
        {
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
        }
      )
      await refreshUser()
      alert("Profile updated successfully!")
    } catch (err: any) {
      alert("Failed to save: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { value: "profile", icon: User, label: "Profile", guideId: "settings-profile" },
    { value: "security", icon: Lock, label: "Security", guideId: "settings-security" },
    { value: "notifications", icon: Bell, label: "Alerts", guideId: "settings-notifications" },
    { value: "api", icon: Code, label: "API", count: apiKeys.length },
    { value: "appearance", icon: Palette, label: "Theme", guideId: "settings-appearance" },
    { value: "editor", icon: Settings, label: "Editor", guideId: "settings-editor" },
  ]

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-shrink-0">
        <PanelHeader title="Settings" description="Manage your account and preferences" />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto pb-8 w-full min-w-0">
          {/* Tab Navigation - Sticky on mobile */}
          <div
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card/80 p-1.5 overflow-x-auto scrollbar-none min-w-0 sticky top-0 z-20 backdrop-blur-xl shadow-sm"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {tabs.map((tab) => (
              <TabButton
                key={tab.value}
                active={activeTab === tab.value}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.value)}
                guideId={tab.guideId}
                count={tab.count}
              />
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              {/* Avatar & Info */}
              <SettingsCard>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start min-w-0">
                  <div className="w-full sm:w-auto shrink-0 flex flex-col items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border flex items-center justify-center overflow-hidden shadow-lg">
                        {user?.avatarUrl ? (
                          <img src={user.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl md:text-3xl font-bold text-muted-foreground">
                            {user?.firstName?.[0]?.toUpperCase() || "?"}
                          </span>
                        )}
                      </div>
                      <label className="absolute -bottom-1 -right-1 w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-all shadow-lg active:scale-95 ring-2 ring-background">
                        <Camera className="h-4 w-4 md:h-4.5 md:w-4.5" />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
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
                    </div>

                    {userBadges.length > 0 && (
                      <div className="w-full sm:w-80">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 text-center sm:text-left font-semibold">Badges</p>
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          {userBadges.map((badge) => (
                            <span
                              key={badge}
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                getBadgeColorClass(badge)
                              )}
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center sm:text-left flex-1 min-w-0 overflow-hidden">
                    <h3 className="text-lg md:text-xl font-bold text-foreground truncate">
                      {user?.displayName || user?.firstName || "User"}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{user?.email}</p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 flex-wrap">
                      <Badge className="bg-primary/20 text-primary border-0 text-xs font-semibold">
                        {getPortalMarker(activePlan?.plan?.type ?? activeTier)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">ID: {user?.id}</span>
                    </div>
                  </div>
                </div>
              </SettingsCard>

              {/* Basic Info */}
              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput 
                    label="Display Name" 
                    value={form.displayName} 
                    onChange={(v) => setForm({ ...form, displayName: v })} 
                    placeholder="How you appear" 
                    icon={User} 
                    hint="This is how other users will see you"
                  />
                  <FormInput 
                    label="Email Address" 
                    type="email" 
                    value={form.email} 
                    onChange={(v) => setForm({ ...form, email: v })} 
                    icon={Mail}
                    hint="Used for login and notifications"
                  />
                </div>
              </SettingsCard>

              {/* Legal Name */}
              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">Legal Name</h3>
                <p className="text-xs text-muted-foreground mb-4">Used for billing and verification purposes</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormInput label="First Name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
                  <FormInput label="Middle Name" value={form.middleName} onChange={(v) => setForm({ ...form, middleName: v })} placeholder="Optional" />
                  <FormInput label="Last Name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
                </div>
              </SettingsCard>

              {/* Billing */}
              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">Billing Information</h3>
                <p className="text-xs text-muted-foreground mb-4">For invoices and payment processing</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput label="Street Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} icon={MapPin} className="md:col-span-2" />
                  <FormInput label="Address Line 2" value={form.address2} onChange={(v) => setForm({ ...form, address2: v })} placeholder="Apt, Suite (optional)" className="md:col-span-2" />
                  <FormInput label="Company" value={form.billingCompany} onChange={(v) => setForm({ ...form, billingCompany: v })} placeholder="Optional" icon={Building} />
                  <FormInput label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+1 (555) 000-0000" icon={Phone} />
                  <FormInput label="City" value={form.billingCity} onChange={(v) => setForm({ ...form, billingCity: v })} />
                  <FormInput label="State / Province" value={form.billingState} onChange={(v) => setForm({ ...form, billingState: v })} />
                  <FormInput label="ZIP / Postal" value={form.billingZip} onChange={(v) => setForm({ ...form, billingZip: v })} />
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">Country</label>
                    <select
                      value={form.billingCountry}
                      onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}
                      className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-0"
                    >
                      <option value="">Select country</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.name}>{country.name}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Tax rate for {form.billingCountry || "selected country"}: <span className="text-foreground font-semibold">{selectedCountryTaxRate.toFixed(2)}%</span>
                      {` `}({displayCurrency})
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="w-full md:w-auto flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </SettingsCard>

              {/* Help */}
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <HelpCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Need help getting started?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Replay the setup guide to explore all features and capabilities.</p>
                  </div>
                </div>
                <button
                  onClick={showGuideAgain}
                  className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-background transition-all active:scale-[0.98]"
                >
                  <BookOpen className="h-4 w-4" />
                  Show Guide Again
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-4">Change Password</h3>
                {passwordError && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{passwordError}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4">
                  <div className="relative">
                    <FormInput 
                      label="Current Password" 
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword} 
                      onChange={setCurrentPassword} 
                      placeholder="Enter current password" 
                      icon={Lock}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <FormInput 
                        label="New Password" 
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword} 
                        onChange={setNewPassword} 
                        placeholder="New password"
                        hint="At least 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <FormInput 
                      label="Confirm Password" 
                      type={showNewPassword ? "text" : "password"}
                      value={confirmPassword} 
                      onChange={setConfirmPassword} 
                      placeholder="Confirm password" 
                    />
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={updatePassword}
                    disabled={passwordSaving}
                    className="w-full md:w-auto flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {passwordSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Update Password
                      </>
                    )}
                  </button>
                </div>
              </SettingsCard>

              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">Passkeys</h3>
                <p className="text-xs text-muted-foreground">Secure your account with biometric or hardware keys</p>
                <PasskeyManager />
              </SettingsCard>

              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">Two-Factor Authentication</h3>
                <p className="text-xs text-muted-foreground">Use an authenticator app for additional security</p>
                <TwoFactorManager />
              </SettingsCard>

              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">SSH Keys</h3>
                <p className="text-xs text-muted-foreground">Passwordless SFTP/SSH access to your servers</p>
                <SshKeyManager />
              </SettingsCard>

              <SettingsCard>
                <h3 className="text-sm font-semibold text-foreground mb-1">Active Sessions</h3>
                <p className="text-xs text-muted-foreground mb-2">Manage your logged-in devices and locations</p>
                <SessionList />
                <div className="mt-5 pt-5 border-t border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                  <button
                    onClick={async () => {
                      if (!confirm("This will log you out of all devices except this one. Continue?")) return
                      try {
                        await apiFetch(API_ENDPOINTS.sessionLogoutAll, {
                          method: "POST",
                          body: JSON.stringify({ userId: user?.id }),
                        })
                        alert("Logged out of all sessions successfully")
                      } catch (e: any) {
                        alert("Failed: " + e.message)
                      }
                    }}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50 transition-all active:scale-[0.98]"
                  >
                    Logout Everywhere Else
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("⚠️ Request account deletion? This action cannot be undone and all your data will be permanently removed.")) return
                      try {
                        await apiFetch(API_ENDPOINTS.deletionRequests, { method: "POST" })
                        alert("Deletion request submitted. Our team will process your request within 30 days.")
                      } catch (e: any) {
                        alert("Failed: " + e.message)
                      }
                    }}
                    className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-all active:scale-[0.98]"
                  >
                    Request Account Deletion
                  </button>
                </div>
              </SettingsCard>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <SettingsCard>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Notification Preferences</h3>
                  <p className="text-xs text-muted-foreground mt-1">Choose which notifications you want to receive</p>
                </div>
                <div className="flex flex-col gap-2.5 min-w-0">
                  {Object.keys(DEFAULT_NOTIFICATION_PREFS).map((key) => {
                    const info = DEFAULT_NOTIFICATION_PREFS[key]
                    const enabled = !!notificationPrefs[key]
                    return (
                      <SettingRow
                        key={key}
                        icon={Bell}
                        title={info.label}
                        description={info.desc}
                        action={
                          <Switch
                            checked={enabled}
                            onCheckedChange={async (v) => {
                              const newPrefs = { ...notificationPrefs, [key]: !!v }
                              setNotificationPrefs(newPrefs)
                              try {
                                await saveUserSettings({ notifications: newPrefs })
                              } catch (e: any) {
                                setNotificationPrefs(notificationPrefs)
                                alert("Failed to save: " + (e?.message || "unknown"))
                              }
                            }}
                          />
                        }
                      />
                    )
                  })}
                </div>
              </SettingsCard>
            </div>
          )}

          {/* API Tab */}
          {activeTab === "api" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <SettingsCard>
                <div className="flex items-center justify-between mb-4 gap-3 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">API Keys</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Manage programmatic access to your account</p>
                  </div>
                  {!showApiForm && (
                    <button
                      onClick={() => setShowApiForm(true)}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">New Key</span>
                      <span className="sm:hidden">New</span>
                    </button>
                  )}
                </div>

                {showApiForm && (
                  <div className="rounded-xl border border-border bg-secondary/10 p-4 mb-5 space-y-4 min-w-0 overflow-hidden animate-in slide-in-from-top-2">
                    <FormInput label="Key Name" value={newKeyName} onChange={setNewKeyName} placeholder="e.g. Production API" hint="Choose a descriptive name" />
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <label className="text-xs font-medium text-muted-foreground">Key Type</label>
                      <select
                        value={newKeyType}
                        onChange={(e) => setNewKeyType(e.target.value)}
                        className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-0 w-full"
                      >
                        <option value="client">Client</option>
                        {isAdmin && <option value="admin">Admin</option>}
                      </select>
                    </div>
                    {newKeyType === "client" && (
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-xs font-medium text-muted-foreground">Permissions</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/20 p-3 md:p-4 max-h-64 overflow-y-auto min-w-0">
                          {AVAILABLE_PERMISSIONS.map((perm) => (
                            <label key={perm} className="flex items-center gap-2.5 text-xs cursor-pointer py-1.5 min-w-0 hover:bg-secondary/30 rounded px-2 transition-colors">
                              <input
                                type="checkbox"
                                checked={newKeyPerms.includes(perm)}
                                onChange={(e) => {
                                  if (e.target.checked) setNewKeyPerms((p) => [...p, perm])
                                  else setNewKeyPerms((p) => p.filter((x) => x !== perm))
                                }}
                                className="accent-primary h-4 w-4 shrink-0 rounded"
                              />
                              <span className="text-muted-foreground truncate min-w-0">{perm}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowApiForm(false); setNewKeyName(""); setNewKeyPerms([]) }}
                        className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-all active:scale-[0.98]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createApiKey}
                        disabled={!newKeyName.trim()}
                        className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
                      >
                        Create Key
                      </button>
                    </div>
                  </div>
                )}

                {apiLoading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
                    <Loader2 className="h-5 w-5 animate-spin" /> Loading keys...
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/10 p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <Code className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">No API keys</p>
                      <p className="text-xs text-muted-foreground mt-1">Create a key to access the Eclipse API programmatically.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 min-w-0">
                    {apiKeys.map((k) => (
                      <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3 md:p-4 min-w-0 overflow-hidden hover:bg-secondary/30 transition-colors">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-foreground truncate">{k.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {k.type} • {k.permissions?.length || 0} permissions
                          </p>
                        </div>
                        <button
                          onClick={() => revokeApiKey(k.id)}
                          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98]"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SettingsCard>

              <SettingsCard>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">API Documentation</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Explore endpoints, schemas, and examples</p>
                  </div>
                  <button
                    onClick={() => window.open("https://backend.ecli.app/openapi", "_blank")}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-all active:scale-[0.98]"
                  >
                    <BookOpen className="h-4 w-4" />
                    View Docs
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </SettingsCard>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === "appearance" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <SettingsCard>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Theme</h3>
                  <p className="text-xs text-muted-foreground mt-1">Customize the look and feel of your dashboard</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 min-w-0">
                  {THEMES.map((theme) => {
                    const isActive = activeTheme === theme.name
                    const isGamblingTheme = theme.name === "Gambling Mode Dark" || theme.name === "Gambling Mode White"
                    return (
                      <button
                        key={theme.name}
                        onClick={() => updateTheme(theme.name)}
                        disabled={isActive}
                        className={cn(
                          "relative flex flex-col items-center gap-3 rounded-xl border p-4 transition-all active:scale-[0.97] min-w-0 disabled:pointer-events-none",
                          isActive
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-lg"
                            : "border-border bg-secondary/20 hover:border-primary/40 hover:bg-secondary/40 hover:shadow-md"
                        )}
                      >
                        <div className="flex gap-1.5">
                          <div
                            className="h-8 w-8 md:h-10 md:w-10 rounded-lg shadow-md transition-transform hover:scale-105"
                            style={{ backgroundColor: theme.bg, border: "1px solid var(--border)" }}
                          />
                          <div
                            className="h-8 w-8 md:h-10 md:w-10 rounded-lg shadow-md transition-transform hover:scale-105"
                            style={{ backgroundColor: theme.primary }}
                          />
                        </div>
                        <div className="w-full text-center">
                          <span className="text-xs font-semibold text-foreground leading-tight block truncate">
                            {theme.name}
                          </span>
                          {theme.description && (
                            <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">
                              {theme.description}
                            </p>
                          )}
                          {isGamblingTheme && (
                            <p className="text-[10px] text-destructive mt-1.5 font-medium">⚠ Luck mode active</p>
                          )}
                        </div>
                        {isActive && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </SettingsCard>
            </div>
          )}

          {/* Editor Tab */}
          {activeTab === "editor" && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <SettingsCard>
                <div className="flex items-center justify-between mb-4 gap-3 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">Editor Settings</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Configure code editor behavior and appearance</p>
                  </div>
                  <button
                    onClick={() => updateEditorSettings(DEFAULT_EDITOR_SETTINGS)}
                    className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>

                <div className="flex flex-col gap-2.5 min-w-0">
                  <SettingRow
                    icon={Sparkles}
                    title="AI Assistant"
                    description="Inline code completions and suggestions (beta)"
                    action={<Switch checked={!!editorSettings.aiAssistant} onCheckedChange={(v) => updateEditorSettings({ aiAssistant: v })} />}
                  />
                  <SettingRow
                    title="Auto Indent"
                    description="Automatically indent new lines"
                    action={<Switch checked={!!editorSettings.autoIndent} onCheckedChange={(v) => updateEditorSettings({ autoIndent: v })} />}
                  />
                  <SettingRow
                    title="Show Minimap"
                    description="Display code minimap for navigation"
                    action={<Switch checked={!!editorSettings.minimap} onCheckedChange={(v) => updateEditorSettings({ minimap: v })} />}
                  />
                  <SettingRow
                    title="Format on Paste"
                    description="Auto-format pasted code"
                    action={<Switch checked={!!editorSettings.formatOnPaste} onCheckedChange={(v) => updateEditorSettings({ formatOnPaste: v })} />}
                  />
                  <SettingRow
                    title="Format on Type"
                    description="Auto-format while typing"
                    action={<Switch checked={!!editorSettings.formatOnType} onCheckedChange={(v) => updateEditorSettings({ formatOnType: v })} />}
                  />
                  <SettingRow
                    title="Font Size"
                    description="Editor font size (pixels)"
                    action={
                      <input
                        type="number"
                        min={8}
                        max={24}
                        value={editorSettings.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize}
                        onChange={(e) => updateEditorSettings({ fontSize: Number(e.target.value) })}
                        className="w-16 md:w-20 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-center text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    }
                  />
                  <SettingRow
                    title="Tab Size"
                    description="Number of spaces per tab"
                    action={
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={editorSettings.tabSize ?? DEFAULT_EDITOR_SETTINGS.tabSize}
                        onChange={(e) => updateEditorSettings({ tabSize: Number(e.target.value) })}
                        className="w-16 md:w-20 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-center text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    }
                  />
                  <div className="flex flex-col gap-2 p-4 rounded-lg border border-border/50 bg-secondary/20 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">Font Family</span>
                    </div>
                    <select
                      value={editorSettings.fontFamily ?? DEFAULT_EDITOR_SETTINGS.fontFamily}
                      onChange={(e) => updateEditorSettings({ fontFamily: e.target.value })}
                      className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-0"
                    >
                      <option value='"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace'>
                        JetBrains Mono / Fira Code
                      </option>
                      <option value='"Source Code Pro", "Menlo", "Consolas", "Courier New", monospace'>
                        Source Code Pro
                      </option>
                      <option value='"Arial", "Helvetica", sans-serif'>Arial / Sans</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Choose a monospace font for better code readability</p>
                  </div>
                </div>
              </SettingsCard>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}