"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  Fingerprint,
  KeyRound,
  Smartphone,
  MailCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { cn } from "@/lib/utils";
import { base64urlToBuffer, bufferToBase64url } from "./utils";
import { TwoFactorMethodButton } from "./_components/TwoFactorMethodButton";
import { InputField } from "./_components/InputField";
import { AlertBanner } from "./_components/AlertBanner";
import { SectionDivider } from "./_components/SectionDivider";
import PixelBlast from "../landing/_components/_reacts-bits/PixelBlast";

type OtpMethod = "totp" | "email" | "backup";

export default function LoginPage() {
  const { login, refreshUser } = useAuth();

  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("login");

  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [otpMethod, setOtpMethod] = useState<OtpMethod | null>(null);
  const [domainOk, setDomainOk] = useState<boolean | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [dismissedDomainWarning, setDismissedDomainWarning] = useState<boolean>(
    () => {
      try {
        return (
          typeof window !== "undefined" &&
          localStorage.getItem("domainWarningDismissed") === "1"
        );
      } catch {
        return false;
      }
    },
  );
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [backendStatusMessage, setBackendStatusMessage] = useState<
    string | null
  >(null);
  const [backendChecking, setBackendChecking] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const host = window.location.hostname || "";
      setDomainOk(host.endsWith("ecli.app"));
    } catch {
      setDomainOk(null);
    }
  }, []);

  const checkBackend = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") return;
    setBackendChecking(true);
    const controller = new AbortController();
    let timeoutId: number | null = null;
    try {
      timeoutId = window.setTimeout(() => controller.abort(), 3000);
      const res = await fetch(API_ENDPOINTS.health, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        setBackendReady(false);
        setBackendStatusMessage(t("backendUnavailableMessage"));
        return;
      }
      const data = await res.json();
      if (data?.status !== "ok") {
        setBackendReady(false);
        setBackendStatusMessage(t("backendUnavailableMessage"));
        return;
      }
      setBackendReady(true);
      setBackendStatusMessage(null);
    } catch {
      setBackendReady(false);
      setBackendStatusMessage(t("backendUnavailableMessage"));
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      setBackendChecking(false);
    }
  }, [t]);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res: any = await login(email, password);
      if (res?.twoFactorRequired) {
        setTempToken(res.tempToken);
        return;
      }
      router.replace(redirectTo);
    } catch (err: any) {
      setError(err.message || t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const sendEmailCode = async () => {
    if (!tempToken) return;
    setSendingEmail(true);
    try {
      await apiFetch(API_ENDPOINTS.twoFactorSendEmail, {
        method: "POST",
        body: JSON.stringify({ tempToken }),
      });
      setError(null);
      setEmailSent(true);
    } catch (e: any) {
      setError(e.message || t("failedToSendEmailCode"));
    }
    setSendingEmail(false);
  };

  const verify2fa = async () => {
    if (!tempToken) {
      setError(t("missingTemporarySession"));
      return;
    }
    setLoading(true);
    try {
      const body: any = { tempToken };
      if (otpMethod === "totp" && twoFactorCode) body.token = twoFactorCode;
      if (otpMethod === "backup" && backupCode) body.backupCode = backupCode;
      if (otpMethod === "email" && emailCode) body.emailCode = emailCode;

      const data: any = await apiFetch(API_ENDPOINTS.twoFactorVerifyLogin, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.token) {
        await refreshUser();
        router.replace(redirectTo);
      } else {
        setError(t("invalidServerResponse"));
      }
    } catch (e: any) {
      setError(e.message || t("verificationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskey = async () => {
    if (!email) {
      setError(t("enterEmailBeforePasskey"));
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
      const credential = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error(t("passkeyCancelled"));

      const assertionResponse =
        credential.response as AuthenticatorAssertionResponse;
      const authenticationResponse = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(
            assertionResponse.authenticatorData,
          ),
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle
            ? bufferToBase64url(assertionResponse.userHandle)
            : null,
        },
      };
      const data = await apiFetch(API_ENDPOINTS.passkeyAuthenticate, {
        method: "POST",
        body: JSON.stringify({ email, authenticationResponse }),
      });
      if (data?.token && typeof window !== "undefined") {
        localStorage.setItem("token", data.token);
      }
      await refreshUser();
      router.push(redirectTo);
    } catch (err: any) {
      setError(err.message || t("passkeyFailed"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const cancelTwoFactor = () => {
    setTempToken(null);
    setTwoFactorCode("");
    setBackupCode("");
    setEmailCode("");
    setOtpMethod(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="hidden md:block md:flex-1 items-center justify-center overflow-hidden">
          <PixelBlast
            variant="square"
            color="#B85A96"
            patternScale={1.9}
            patternDensity={1.3}
            pixelSizeJitter={0}
            enableRipples
            rippleSpeed={0.4}
            rippleThickness={0.12}
            rippleIntensityScale={1.5}
            liquid={false}
            liquidStrength={0.12}
            liquidRadius={1.2}
            liquidWobbleSpeed={5}
            speed={0.95}
            edgeFade={0.15}
            transparent
            pixelSize={4}
          />
        </div>

        <div className="flex flex-1 relative z-100 items-center justify-center px-4 py-10 sm:px-8 md:px-10 lg:px-16">
          <div className="w-full max-w-sm sm:max-w-md space-y-5">
            <div className="space-y-3">
              {domainOk === false && !dismissedDomainWarning && (
                <AlertBanner
                  variant="warning"
                  title={t("verifyDomain")}
                  onDismiss={() => {
                    try {
                      localStorage.setItem("domainWarningDismissed", "1");
                    } catch {}
                    setDismissedDomainWarning(true);
                  }}
                >
                  <p>
                    {t.rich("domainWarning", {
                      domain: (chunks: ReactNode) => (
                        <span className="font-medium">{chunks}</span>
                      ),
                      link: (chunks: ReactNode) => (
                        <a
                          href="https://ecli.app"
                          className="underline font-medium"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                </AlertBanner>
              )}

              {backendReady === false && (
                <AlertBanner
                  variant="error"
                  title={t("backendUnavailableTitle")}
                >
                  <div className="space-y-3">
                    <p>{t("backendUnavailableMessage")}</p>
                    {backendStatusMessage && (
                      <p className="text-xs text-muted-foreground">
                        {backendStatusMessage}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={checkBackend}
                      disabled={backendChecking}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-medium transition-all",
                        "hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {backendChecking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("retry")
                      )}
                    </button>
                  </div>
                </AlertBanner>
              )}

              {error && (
                <AlertBanner variant="error" title={t("somethingWentWrong")}>
                  {error}
                </AlertBanner>
              )}
            </div>

            {tempToken ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("twoFactorTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("twoFactorSubtitle")}
                  </p>
                </div>

                <div className="space-y-2">
                  <TwoFactorMethodButton
                    icon={Smartphone}
                    label={t("methodAuthenticator")}
                    description={t("methodAuthenticatorDesc")}
                    selected={otpMethod === "totp"}
                    onClick={() => {
                      setOtpMethod("totp");
                      setEmailSent(false);
                    }}
                  />
                  <TwoFactorMethodButton
                    icon={MailCheck}
                    label={t("methodEmail")}
                    description={t("methodEmailDesc")}
                    selected={otpMethod === "email"}
                    onClick={() => {
                      setOtpMethod("email");
                      setEmailSent(false);
                    }}
                  />
                  <TwoFactorMethodButton
                    icon={KeyRound}
                    label={t("methodBackup")}
                    description={t("methodBackupDesc")}
                    selected={otpMethod === "backup"}
                    onClick={() => {
                      setOtpMethod("backup");
                      setEmailSent(false);
                    }}
                  />
                </div>

                {otpMethod && (
                  <div className="pt-2 space-y-3">
                    {otpMethod === "totp" && (
                      <InputField
                        icon={Smartphone}
                        name="totp"
                        placeholder={t("authenticatorCodePlaceholder")}
                        label={t("authenticatorCode")}
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                      />
                    )}
                    {otpMethod === "backup" && (
                      <InputField
                        icon={KeyRound}
                        name="backup"
                        placeholder={t("backupCodePlaceholder")}
                        label={t("backupCode")}
                        value={backupCode}
                        onChange={(e) => setBackupCode(e.target.value)}
                      />
                    )}
                    {otpMethod === "email" && (
                      <div className="space-y-2">
                        <InputField
                          icon={MailCheck}
                          name="emailCode"
                          placeholder={t("emailCodePlaceholder")}
                          label={t("emailCode")}
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={sendEmailCode}
                          disabled={sendingEmail}
                          className="w-full min-h-[44px] rounded-xl border border-border/60 bg-secondary/30 py-3 text-sm font-medium transition-all hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingEmail ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : emailSent ? (
                            t("resend")
                          ) : (
                            t("send")
                          )}
                        </button>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={verify2fa}
                        disabled={loading}
                        className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        ) : (
                          t("verify")
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelTwoFactor}
                        className="min-h-[44px] rounded-xl border border-border/60 bg-secondary/30 px-5 py-3 text-sm font-medium hover:bg-secondary/60"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Login form ── */
              <form onSubmit={handleSubmit} className="space-y-5">
                <InputField
                  name="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  label={t("emailAddress")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />

                <InputField
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  label={t("password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      /* 44 px touch target */
                      className="flex items-center justify-center w-8 h-8 -mr-1 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />

                <div className="flex items-center justify-between text-sm">
                  <Link
                    href="/forgot-password"
                    className="text-base sm:text-lg text-white/70 hover:text-white transition-colors hover:underline"
                  >
                    {t("forgotPassword")}
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading || backendReady === false}
                  className={cn(
                    "w-full min-h-[44px] py-3 flex items-center justify-center gap-2 rounded-md font-mono text-base sm:text-lg border border-white/40 transition-colors duration-200 cursor-pointer",
                    "text-black bg-white",
                    "hover:bg-white/70 active:scale-[0.98]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("signingIn")}
                    </>
                  ) : (
                    <>
                      {t("signIn")}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <SectionDivider label={t("orContinueWith")} icon={Shield} />

                <button
                  type="button"
                  onClick={handlePasskey}
                  disabled={passkeyLoading || backendReady === false}
                  className={cn(
                    "w-full min-h-[44px] py-3 flex gap-2 items-center justify-center rounded-md font-mono text-base sm:text-lg border border-white/40 transition-colors duration-200 cursor-pointer",
                    "text-white",
                    "hover:bg-white/70 hover:text-black active:scale-[0.98]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {passkeyLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("waitingPasskey")}
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      {t("signInWithPasskey")}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-16 sm:h-20 lg:h-23 bg-linear-to-b from-transparent to-[#0a0a0f] z-20" />
    </div>
  );
}
