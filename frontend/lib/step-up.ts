import { bufferToBase64url, base64urlToBuffer } from "../app/login/utils";
import { API_ENDPOINTS } from "./panel-config";
import { debugLog } from "./debug-console";

const TOKEN_KEY = "eclipanel-stepup-token";
const EXPIRY_KEY = "eclipanel-stepup-expiry";
const SUDO_TOKEN_KEY = "eclipanel-sudo-token";
const SUDO_EXPIRY_KEY = "eclipanel-sudo-expiry";

// ---- token storage ---------------------------------------------------------

export function getStepUpToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const expiry = Number(localStorage.getItem(EXPIRY_KEY));
    if (!Number.isFinite(expiry) || Date.now() >= expiry) {
      clearStepUpToken();
      return null;
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStepUpToken(token: string, expiresInSec: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInSec * 1000));
  } catch {}
}

export function clearStepUpToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch {}
}

export function getSudoToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const expiry = Number(localStorage.getItem(SUDO_EXPIRY_KEY));
    if (!Number.isFinite(expiry) || Date.now() >= expiry) {
      clearSudoToken();
      return null;
    }
    return localStorage.getItem(SUDO_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSudoToken(token: string, expiresInSec: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SUDO_TOKEN_KEY, token);
    localStorage.setItem(SUDO_EXPIRY_KEY, String(Date.now() + expiresInSec * 1000));
  } catch {}
}

export function clearSudoToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SUDO_TOKEN_KEY);
    localStorage.removeItem(SUDO_EXPIRY_KEY);
  } catch {}
}

// ---- raw fetch (same auth headers as apiFetch, no step-up retry loop) ------

async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (typeof window !== "undefined") {
    try {
      const token = localStorage.getItem("token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const method = String(options.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const csrf = localStorage.getItem("csrfToken");
        if (csrf) headers["x-csrf-token"] = csrf;
      }
    } catch {}
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(path, { ...options, headers, credentials: "include", signal: controller.signal });
    const text = await res.text().catch(() => "");
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- WebAuthn ceremonies ---------------------------------------------------

async function runAssertionCeremony(challengeOpts: any): Promise<any> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...challengeOpts,
    challenge: base64urlToBuffer(challengeOpts.challenge),
    allowCredentials: (challengeOpts.allowCredentials || []).map((c: any) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };
  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey assertion cancelled");

  const assertionResponse = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
      signature: bufferToBase64url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64url(assertionResponse.userHandle)
        : null,
    },
  };
}

export async function performStepUpAssertion(challengeOpts: any): Promise<string> {
  const authenticationResponse = await runAssertionCeremony(challengeOpts);
  const res = await fetchWithAuth(API_ENDPOINTS.passkeyStepupVerify, {
    method: "POST",
    body: JSON.stringify({ authenticationResponse }),
  });
  if (!res.ok || !res.data?.stepupToken) {
    throw new Error(res.data?.error || "Passkey verification failed");
  }
  setStepUpToken(res.data.stepupToken, Number(res.data.expiresIn) || 600);
  return res.data.stepupToken;
}

export async function performSudoAssertion(challengeOpts: any): Promise<string> {
  const authenticationResponse = await runAssertionCeremony(challengeOpts);
  const res = await fetchWithAuth(API_ENDPOINTS.passkeySudoVerify, {
    method: "POST",
    body: JSON.stringify({ authenticationResponse }),
  });
  if (!res.ok || !res.data?.sudoToken) {
    stepUpDebug("performSudoAssertion: verify failed — ok=" + res.ok + " error=" + (res.data?.error || "none"));
    throw new Error(res.data?.error || "Passkey verification failed");
  }
  stepUpDebug("performSudoAssertion: verified, storing sudo token");
  setSudoToken(res.data.sudoToken, Number(res.data.expiresIn) || 120);
  return res.data.sudoToken;
}

export async function registerPasskeyInline(): Promise<void> {
  try {
    if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.credentials)) {
      throw new Error("WebAuthn unavailable (insecure context or no credentials API)");
    }
  } catch (e: any) {
    stepUpDebug("registerPasskeyInline: " + (e?.message || e));
    throw e;
  }
  const res = await fetchWithAuth(API_ENDPOINTS.passkeyRegisterChallenge, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok || !res.data?.challenge) {
    stepUpDebug("registerPasskeyInline: challenge failed — " + (res.data?.error || res.status));
    throw new Error(res.data?.error || "Could not start passkey registration");
  }
  const opts = res.data;
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge),
    user: {
      ...opts.user,
      id: base64urlToBuffer(opts.user.id),
    },
    excludeCredentials: (opts.excludeCredentials || []).map((c: any) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };
  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration cancelled");
  stepUpDebug("registerPasskeyInline: credential created");
  const attestation = credential.response as AuthenticatorAttestationResponse;
  const attestationResponse = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
      attestationObject: bufferToBase64url(attestation.attestationObject),
      transports: attestation.getTransports?.() || ["internal"],
    },
    type: credential.type,
  };
  const regRes = await fetchWithAuth(API_ENDPOINTS.passkeyRegister, {
    method: "POST",
    body: JSON.stringify({ attestationResponse }),
  });
  if (!regRes.ok) {
    stepUpDebug("registerPasskeyInline: register failed — " + (regRes.data?.error || regRes.status));
    throw new Error(regRes.data?.error || "Passkey registration failed");
  }
  stepUpDebug("registerPasskeyInline: registered");
}

// ---- orchestration (single-flight, UI-driven) ------------------------------

export type StepUpUiState = {
  mode: "passkey" | "register" | "sudo";
  kind: "stepup" | "sudo";
  challenge: any | null;
};

export type StepUpUiHandler = (state: StepUpUiState) => Promise<string | null>;

let stepUpUi: StepUpUiHandler | null = null;
let inflight: Promise<string | null> | null = null;
let sudoInflight: Promise<string | null> | null = null;

// ---- diagnostics routed to the global debug console ------------------------
export function stepUpDebug(msg: string): void {
  debugLog("log", "[stepUp] " + msg);
}

export function registerStepUpUi(fn: StepUpUiHandler | null): void {
  stepUpUi = fn;
}

export function hasStepUpUi(): boolean {
  return stepUpUi !== null;
}

export async function fetchStepUpChallenge(): Promise<StepUpUiState> {
  const res = await fetchWithAuth(API_ENDPOINTS.passkeyStepupChallenge, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (res.ok) return { mode: "passkey", kind: "stepup", challenge: res.data };
  if ((res.data?.code ?? res.headers?.get?.("x-stepup-code")) === "PASSKEY_REQUIRED") {
    return { mode: "register", kind: "stepup", challenge: null };
  }
  throw new Error(res.data?.error || "Could not start passkey step-up");
}

export async function fetchSudoChallenge(): Promise<StepUpUiState> {
  const res = await fetchWithAuth(API_ENDPOINTS.passkeySudoChallenge, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (res.ok) return { mode: "sudo", kind: "sudo", challenge: res.data };
  if ((res.data?.code ?? res.headers?.get?.("x-stepup-code")) === "PASSKEY_REQUIRED") {
    return { mode: "register", kind: "sudo", challenge: null };
  }
  throw new Error(res.data?.error || "Could not start passkey sudo verification");
}

export async function triggerStepUp(): Promise<string | null> {
  if (!stepUpUi) {
    stepUpDebug("triggerStepUp: no UI registered");
    return null;
  }
  if (inflight) {
    stepUpDebug("triggerStepUp: joined existing inflight");
    return inflight;
  }
  inflight = (async () => {
    // Pre-fetch the challenge before showing the modal so the button click can
    // run navigator.credentials.get immediately (Chrome transient activation).
    stepUpDebug("triggerStepUp: fetching challenge");
    const state = await fetchStepUpChallenge();
    stepUpDebug("triggerStepUp: challenge ok, opening modal");
    const ui = stepUpUi;
    if (!ui) return null;
    const token = await ui(state);
    stepUpDebug("triggerStepUp: UI resolved " + (token ? "with token" : "null"));
    return token;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function triggerSudo(): Promise<string | null> {
  if (!stepUpUi) {
    stepUpDebug("triggerSudo: no UI registered");
    return null;
  }
  if (sudoInflight) {
    stepUpDebug("triggerSudo: joined existing inflight");
    return sudoInflight;
  }
  sudoInflight = (async () => {
    // Sensitive action: always fetch a fresh challenge (no grace-window skip).
    stepUpDebug("triggerSudo: fetching challenge");
    const state = await fetchSudoChallenge();
    stepUpDebug("triggerSudo: challenge ok, opening modal");
    const ui = stepUpUi;
    if (!ui) return null;
    const token = await ui(state);
    stepUpDebug("triggerSudo: UI resolved " + (token ? "with token" : "null"));
    return token;
  })().finally(() => {
    sudoInflight = null;
  });
  return sudoInflight;
}
