"use client"

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { OtpMethodSelector, OtpMethod } from "@/components/panel/OtpMethodSelector";

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default function LoginPage() {
  const { login, refreshUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [otpMethod, setOtpMethod] = useState<OtpMethod | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res: any = await login(email, password);
      if (res && res.twoFactorRequired) {
        setTempToken(res.tempToken);
        setError(null);
        return;
      }
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailCode = async () => {
    if (!tempToken) return;
    setSendingEmail(true);
    try {
      await apiFetch(API_ENDPOINTS.twoFactorSendEmail, { method: 'POST', body: JSON.stringify({ tempToken }) });
      alert('Email code sent');
    } catch (e: any) { alert(e.message || 'Failed to send email code'); }
    setSendingEmail(false);
  };

  const verify2fa = async () => {
    if (!tempToken) return setError('Missing temporary session');
    try {
      const body: any = { tempToken };
      if (otpMethod === "totp" && twoFactorCode) body.token = twoFactorCode;
      if (otpMethod === "backup" && backupCode) body.backupCode = backupCode;
      if (otpMethod === "email" && emailCode) body.emailCode = emailCode;
      if (!body.token && !body.backupCode && !body.emailCode) {
        setError('Please enter a code for the selected method.');
        return;
      }
      const data: any = await apiFetch(API_ENDPOINTS.twoFactorVerifyLogin, { method: 'POST', body: JSON.stringify(body) });
      if (data.token) {
        await refreshUser();
        router.replace('/dashboard');
      } else {
        setError('Invalid response from server');
      }
    } catch (e: any) {
      setError(e.message || 'Verification failed');
    }
  };

  const handlePasskey = async () => {
    if (!email) {
      setError("Enter your email address first, then click Sign in with Passkey.");
      return;
    }
    setError(null);
    setPasskeyLoading(true);
    try {
      const opts = await apiFetch(API_ENDPOINTS.passkeyAuthChallenge, {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      const publicKey: PublicKeyCredentialRequestOptions = {
        ...opts,
        challenge: base64urlToBuffer(opts.challenge),
        allowCredentials: (opts.allowCredentials || []).map((c: any) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      };

      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
      if (!credential) throw new Error("Passkey authentication cancelled.");

      const assertionResponse = credential.response as AuthenticatorAssertionResponse;

      const authenticationResponse = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
        },
      };

      const data = await apiFetch(API_ENDPOINTS.passkeyAuthenticate, {
        method: "POST",
        body: JSON.stringify({ email, authenticationResponse }),
      });

      if (data && data.token) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
      }

      await refreshUser();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Passkey authentication failed.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <h2 className="mb-6 text-center text-2xl font-semibold text-foreground">
          Sign in to Eclipse Panel
        </h2>

        {error && (
          <div className="mb-4 rounded bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading || passkeyLoading}
            className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {tempToken && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Two-factor authentication required</h4>
            <p className="text-xs text-muted-foreground mb-2">Select your preferred method and enter the code.</p>
            <OtpMethodSelector selected={otpMethod} onSelect={setOtpMethod} />
            {otpMethod === "totp" && (
              <input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="Authenticator code" className="w-full rounded border border-border px-3 py-2 text-sm mb-2" />
            )}
            {otpMethod === "backup" && (
              <input value={backupCode} onChange={(e) => setBackupCode(e.target.value)} placeholder="Backup code" className="w-full rounded border border-border px-3 py-2 text-sm mb-2" />
            )}
            {otpMethod === "email" && (
              <div className="flex gap-2 mb-2">
                <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Email code" className="flex-1 rounded border border-border px-3 py-2 text-sm" />
                <button onClick={sendEmailCode} className="rounded bg-secondary px-3 py-2 text-sm" disabled={sendingEmail}>{sendingEmail ? 'Sending…' : 'Send Email'}</button>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={verify2fa} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Verify</button>
              <button onClick={() => { setTempToken(null); setTwoFactorCode(''); setBackupCode(''); setEmailCode(''); setOtpMethod(null); }} className="rounded border px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Passkey button */}
        <button
          type="button"
          onClick={handlePasskey}
          disabled={loading || passkeyLoading}
          className="flex w-full items-center justify-center gap-2 rounded border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {/* Fingerprint icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
            <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
            <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
            <path d="M2 12a10 10 0 0 1 18-6" />
            <path d="M2 17a5 5 0 0 1 4.8-5" />
            <path d="M6 10.6A10 10 0 0 1 12 2" />
            <path d="M22 12a10 10 0 0 1-1.2 4.8" />
            <path d="M22 17h-1a4 4 0 0 0-4 4" />
          </svg>
          {passkeyLoading ? "Waiting for passkey..." : "Sign in with Passkey"}
        </button>

        {/* Terms of service notice */}
        <p className="mt-5 text-center text-xs text-muted-foreground">
          By signing in you agree to the{" "}
          <a
            href="https://eclipsesystems.org/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Terms of Service
          </a>
          .
        </p>

        {/* Create account link */}
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
