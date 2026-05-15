"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { COUNTRIES } from "@/lib/countries";
import { apiFetch } from "@/lib/api-client";
import { FIELD_MAX_LENGTHS } from "@/lib/password-validation";
import {
  AlertTriangle,
  User,
  Mail,
  Lock,
  MapPin,
  Building2,
  Phone,
  Globe,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  CheckCircle2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionDivider } from "../login/_components/SectionDivider";
import { InputField } from "./_components/InputField";
import { AlertBanner } from "./_components/AlertBanner";
import { SelectField } from "./_components/SelectField";
import { StepIndicator } from "./_components/StepIndicator";
import {
  getPasswordChecks,
  getPasswordStrength,
  getPasswordStrengthLabel,
} from "./utils";
import PixelBlast from "../landing/_components/_reacts-bits/PixelBlast";

interface BehaviorMetrics {
  mouseMoves: number;
  mouseClicks: number;
  keyboardEvents: number;
  firstInteraction?: number;
  lastInteraction?: number;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  address: string;
  address2: string;
  billingCompany: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  middleName: string;
  phone: string;
  dateOfBirth: string;
  parentRegistrationToken?: string;
  captchaAnswer: string;
  captchaToken: string;
  invisibleCaptchaToken?: string;
  invisibleCaptchaDelayMs?: number;
  invisibleCaptchaDelay?: number;
  behaviorData?: BehaviorMetrics;
}
/* ─── Main Component ─── */
export default function RegisterPage() {
  const t = useTranslations("register");
  const [step, setStep] = useState(0);
  const steps = [t("steps.account"), t("steps.address"), t("steps.verify")];
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "";
  const loginHref = redirectTo
    ? `/login?redirect=${encodeURIComponent(redirectTo)}`
    : "/login";

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    address: "",
    address2: "",
    billingCompany: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "",
    middleName: "",
    phone: "",
    dateOfBirth: "",
    parentRegistrationToken: "",
    captchaAnswer: "",
    captchaToken: "",
    invisibleCaptchaToken: "",
    invisibleCaptchaDelayMs: 0,
  });

  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaAudio, setCaptchaAudio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [panelSettings, setPanelSettings] = useState<{
    registrationEnabled: boolean;
    registrationNotice: string;
    featureToggles?: Record<string, boolean>;
  } | null>(null);
  const router = useRouter();

  const [domainOk, setDomainOk] = useState<boolean | null>(null);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [backendStatusMessage, setBackendStatusMessage] = useState<
    string | null
  >(null);
  const [backendChecking, setBackendChecking] = useState(false);
  const [invisibleTokenRequestedAt, setInvisibleTokenRequestedAt] = useState<
    number | null
  >(null);
  const [behaviorData, setBehaviorData] = useState<BehaviorMetrics>({
    mouseMoves: 0,
    mouseClicks: 0,
    keyboardEvents: 0,
  });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordFocused, setPasswordFocused] = useState(false);
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

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => {
        setPanelSettings(data);
        if (data?.featureToggles?.captchaInvisible) {
          loadInvisibleCaptcha();
        }
      })
      .catch(() =>
        setPanelSettings({ registrationEnabled: true, registrationNotice: "" }),
      );
    loadCaptcha();
  }, []);

  useEffect(() => {
    const token = searchParams.get("parentRegistrationToken");
    if (token) {
      setForm((prev) => ({ ...prev, parentRegistrationToken: token }));
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      setDomainOk(window.location.hostname.endsWith("ecli.app"));
    } catch {
      setDomainOk(null);
    }
  }, []);

  const checkBackend: () => Promise<void> = useCallback(async () => {
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
        let message = t("backendUnavailableMessage");
        try {
          const json = await res.json();
          if (json?.status) {
            message = `${message} (${json.status})`;
          }
        } catch {}
        setBackendReady(false);
        setBackendStatusMessage(message);
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
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      setBackendChecking(false);
    }
  }, [t]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nonPiiFields = new Set([
      "billingCompany",
      "billingCity",
      "billingState",
      "billingZip",
      "billingCountry",
      "address2",
    ]);

    const onMouseMove = () => {
      setBehaviorData((prev) => {
        const now = Date.now();
        return {
          ...prev,
          mouseMoves: prev.mouseMoves + 1,
          firstInteraction: prev.firstInteraction || now,
          lastInteraction: now,
        };
      });
    };
    const onMouseClick = () => {
      const now = Date.now();
      setBehaviorData((prev) => ({
        ...prev,
        mouseClicks: prev.mouseClicks + 1,
        firstInteraction: prev.firstInteraction || now,
        lastInteraction: now,
      }));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const name = (e.target as HTMLInputElement)?.name || "";
      if (!name || !nonPiiFields.has(name)) return;
      const now = Date.now();
      setBehaviorData((prev) => ({
        ...prev,
        keyboardEvents: prev.keyboardEvents + 1,
        firstInteraction: prev.firstInteraction || now,
        lastInteraction: now,
      }));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    setAudioError(false);
    try {
      const data = await apiFetch("/api/auth/captcha");
      if (data?.token) {
        setForm((prev) => ({
          ...prev,
          captchaToken: String(data.token),
          captchaAnswer: "",
        }));
        setCaptchaImage(data.image || "");
        setCaptchaAudio(data.audio || "");
      } else {
        setForm((prev) => ({ ...prev, captchaToken: "", captchaAnswer: "" }));
        setCaptchaImage("");
        setCaptchaAudio("");
      }
    } catch {
      setForm((prev) => ({ ...prev, captchaToken: "", captchaAnswer: "" }));
      setCaptchaImage("");
    } finally {
      setCaptchaLoading(false);
    }
  };

  const loadInvisibleCaptcha = async () => {
    try {
      const data = await apiFetch("/api/auth/captcha/invisible");
      if (data?.token) {
        setForm((prev) => ({
          ...prev,
          invisibleCaptchaToken: String(data.token),
        }));
        setInvisibleTokenRequestedAt(Date.now());
      } else {
        setForm((prev) => ({ ...prev, invisibleCaptchaToken: "" }));
        setInvisibleTokenRequestedAt(null);
      }
    } catch {
      setForm((prev) => ({ ...prev, invisibleCaptchaToken: "" }));
      setInvisibleTokenRequestedAt(null);
    }
  };

  const playAudio = () => {
    if (!captchaAudio) {
      setAudioError(true);
      return;
    }
    setAudioError(false);
    setAudioPlaying(true);
    const audio = new Audio(captchaAudio);
    audio.addEventListener("ended", () => setAudioPlaying(false));
    audio.addEventListener("error", () => {
      setAudioPlaying(false);
      setAudioError(true);
    });
    audio.play().catch(() => {
      setAudioPlaying(false);
      setAudioError(true);
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "password") setPasswordStrength(getPasswordStrength(value));
  };

  const isParentInvite = Boolean(form.parentRegistrationToken);

  /* ─── Step validation ─── */
  const canProceedStep0 = Boolean(
    form.firstName &&
    form.lastName &&
    form.email &&
    form.password &&
    form.dateOfBirth &&
    passwordStrength >= 0.55 &&
    (isParentInvite || form.phone),
  );
  const canProceedStep1 = Boolean(
    isParentInvite ||
    (form.address &&
      form.billingCity &&
      form.billingState &&
      form.billingZip &&
      form.billingCountry),
  );

  const nextStep = () => {
    if (step === 0 && !canProceedStep0) {
      setError(t("requiredFieldsStep0"));
      return;
    }
    if (step === 1 && !canProceedStep1) {
      setError(t("requiredFieldsStep1"));
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const prevStep = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleStepClick = (i: number) => {
    if (i < step) {
      setError(null);
      setStep(i);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const usingCustomCaptcha = !!panelSettings?.featureToggles?.captcha;
    const usingInvisibleCaptcha =
      !!panelSettings?.featureToggles?.captchaInvisible;
    const hasCustomCaptcha = !!form.captchaToken && !!form.captchaAnswer;
    const hasInvisibleCaptcha = !!form.invisibleCaptchaToken;

    if (usingCustomCaptcha && usingInvisibleCaptcha) {
      if (!hasCustomCaptcha && !hasInvisibleCaptcha) {
        setError(t("captchaChallengeOrWait"));
        return;
      }
    } else if (usingCustomCaptcha && !hasCustomCaptcha) {
      setError(t("captchaExpired"));
      return;
    } else if (usingInvisibleCaptcha && !hasInvisibleCaptcha) {
      setError(t("invisibleCaptchaMissing"));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await apiFetch(API_ENDPOINTS.userRegister, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          behaviorData,
          invisibleCaptchaDelay: invisibleTokenRequestedAt
            ? Date.now() - invisibleTokenRequestedAt
            : undefined,
        }),
      });
      router.push(loginHref);
    } catch (err: any) {
      setError(err.message || t("registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const registrationDisabled =
    panelSettings !== null && !panelSettings.registrationEnabled;
  const notice = panelSettings?.registrationNotice || "";
  const passwordChecks = getPasswordChecks(form.password);
  const strengthInfo = getPasswordStrengthLabel(passwordStrength);
  const hasCaptcha = !!panelSettings?.featureToggles?.captcha;

  return (
    <div className="min-h-screen w-full bg-black">
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
          <div className="w-full">
            <div className="mb-8 text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                {t("title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                {t("subtitle")}
              </p>
            </div>

            <div className="rounded-2xl sm:rounded-3xl">
              {!registrationDisabled && (
                <div className="px-4 sm:px-8 pt-6 pb-2">
                  <StepIndicator
                    steps={steps}
                    current={step}
                    onStepClick={handleStepClick}
                  />
                </div>
              )}

              <div className="p-4 sm:p-8 space-y-5">
                <div className="space-y-3">
                  {notice && !registrationDisabled && (
                    <AlertBanner variant="info">{notice}</AlertBanner>
                  )}
                  {form.parentRegistrationToken && (
                    <AlertBanner variant="info">
                      {t("parentInviteBanner")}
                    </AlertBanner>
                  )}
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
                            "focus:outline-none focus:ring-2 focus:ring-primary/20",
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
                  {registrationDisabled && (
                    <AlertBanner
                      variant="warning"
                      title={t("registrationUnavailable")}
                    >
                      {notice && <p>{notice}</p>}
                    </AlertBanner>
                  )}
                  {error && (
                    <AlertBanner
                      variant="error"
                      title={t("somethingWentWrong")}
                    >
                      {error}
                    </AlertBanner>
                  )}
                </div>

                {registrationDisabled ? (
                  <div className="text-center py-10">
                    <p className="text-muted-foreground mb-5">
                      {t("registrationNotAvailable")}
                    </p>
                    <a
                      href={loginHref}
                      className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      {t("signInInstead")} <ChevronRight className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div
                      className={cn(
                        "space-y-4 transition-all duration-300",
                        step !== 0 && "hidden",
                      )}
                    >
                      <SectionDivider label={t("personalInfo")} icon={User} />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <InputField
                          icon={User}
                          name="firstName"
                          placeholder={t("firstNamePlaceholder")}
                          label={t("firstName")}
                          value={form.firstName}
                          onChange={handleChange}
                          required
                          maxLength={FIELD_MAX_LENGTHS.firstName}
                          autoComplete="given-name"
                        />
                        <InputField
                          icon={User}
                          name="lastName"
                          placeholder={t("lastNamePlaceholder")}
                          label={t("lastName")}
                          value={form.lastName}
                          onChange={handleChange}
                          required
                          maxLength={FIELD_MAX_LENGTHS.lastName}
                          autoComplete="family-name"
                        />
                      </div>

                      <InputField
                        icon={Mail}
                        name="email"
                        type="email"
                        placeholder={t("emailPlaceholder")}
                        label={t("emailAddress")}
                        value={form.email}
                        onChange={handleChange}
                        required
                        maxLength={FIELD_MAX_LENGTHS.email}
                        autoComplete="email"
                      />

                      <div className="space-y-2">
                        <InputField
                          icon={Lock}
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t("passwordPlaceholder")}
                          label={t("password")}
                          value={form.password}
                          onChange={(e) => {
                            handleChange(e);
                            setPasswordFocused(true);
                          }}
                          required
                          maxLength={128}
                          autoComplete="new-password"
                          rightElement={
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                              aria-label={
                                showPassword
                                  ? t("hidePassword")
                                  : t("showPassword")
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

                        <div className="space-y-2">
                          <div className="flex gap-1">
                            {[0, 1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className={cn(
                                  "h-1.5 flex-1 rounded-full transition-all duration-300",
                                  passwordStrength > i * 0.25 && form.password
                                    ? strengthInfo.color
                                    : "bg-border/40",
                                )}
                              />
                            ))}
                          </div>

                          {(passwordFocused || form.password) && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                              {passwordChecks.map((check) => (
                                <div
                                  key={check.label}
                                  className={cn(
                                    "flex items-center gap-1.5 text-[11px] transition-colors duration-200",
                                    check.met
                                      ? "text-emerald-500"
                                      : "text-muted-foreground/60",
                                  )}
                                >
                                  {check.met ? (
                                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <div className="h-3 w-3 rounded-full border border-current shrink-0" />
                                  )}
                                  {check.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <InputField
                        icon={Phone}
                        name="phone"
                        type="tel"
                        placeholder={t("phonePlaceholder")}
                        label={t("phoneNumber")}
                        value={form.phone}
                        onChange={handleChange}
                        required={!isParentInvite}
                        maxLength={FIELD_MAX_LENGTHS.phone}
                        autoComplete="tel"
                      />

                      <InputField
                        icon={User}
                        name="dateOfBirth"
                        type="date"
                        placeholder={t("dateOfBirthPlaceholder")}
                        label={t("dateOfBirth")}
                        value={form.dateOfBirth}
                        onChange={handleChange}
                        required
                        autoComplete="bday"
                      />
                    </div>

                    <div
                      className={cn(
                        "space-y-4 transition-all duration-300",
                        step !== 1 && "hidden",
                      )}
                    >
                      <SectionDivider
                        label={t("billingAddress")}
                        icon={MapPin}
                      />

                      <InputField
                        icon={Building2}
                        name="billingCompany"
                        placeholder={t("companyPlaceholder")}
                        label={t("companyOptional")}
                        value={form.billingCompany}
                        onChange={handleChange}
                        maxLength={FIELD_MAX_LENGTHS.billingCompany}
                        autoComplete="organization"
                      />

                      <InputField
                        icon={MapPin}
                        name="address"
                        placeholder={t("streetAddressPlaceholder")}
                        label={t("streetAddress")}
                        value={form.address}
                        onChange={handleChange}
                        required={!isParentInvite}
                        maxLength={FIELD_MAX_LENGTHS.address}
                        autoComplete="address-line1"
                      />

                      <InputField
                        name="address2"
                        placeholder={t("addressLine2Placeholder")}
                        label={t("addressLine2Optional")}
                        value={form.address2}
                        onChange={handleChange}
                        maxLength={FIELD_MAX_LENGTHS.address2}
                        autoComplete="address-line2"
                      />

                      {isParentInvite && (
                        <p className="text-sm text-muted-foreground">
                          {t("parentInviteHint")}
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <InputField
                          name="billingCity"
                          placeholder={t("cityPlaceholder")}
                          label={t("city")}
                          value={form.billingCity}
                          onChange={handleChange}
                          required={!isParentInvite}
                          maxLength={FIELD_MAX_LENGTHS.billingCity}
                          autoComplete="address-level2"
                        />
                        <InputField
                          name="billingState"
                          placeholder={t("stateProvincePlaceholder")}
                          label={t("stateProvince")}
                          value={form.billingState}
                          onChange={handleChange}
                          required={!isParentInvite}
                          maxLength={FIELD_MAX_LENGTHS.billingState}
                          autoComplete="address-level1"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <InputField
                          name="billingZip"
                          placeholder={t("zipPostalPlaceholder")}
                          label={t("zipPostal")}
                          value={form.billingZip}
                          onChange={handleChange}
                          required={!isParentInvite}
                          maxLength={FIELD_MAX_LENGTHS.billingZip}
                          autoComplete="postal-code"
                        />
                        <SelectField
                          icon={Globe}
                          name="billingCountry"
                          label={t("country")}
                          value={form.billingCountry}
                          onChange={handleChange}
                          required={!isParentInvite}
                        >
                          <option
                            value=""
                            className="bg-background text-muted-foreground"
                          >
                            {t("selectCountry")}
                          </option>
                          {COUNTRIES.map((c) => (
                            <option
                              key={c.code}
                              value={c.name}
                              className="bg-background text-foreground"
                            >
                              {c.name}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "space-y-5 transition-all duration-300",
                        step !== 2 && "hidden",
                      )}
                    >
                      <div className="rounded-md border border-white/20 p-4 space-y-3">
                        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                          {/* <CheckCircle2 className="h-4 w-4 text-primary" /> */}
                          {t("reviewTitle")}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 font-mono gap-x-4 gap-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground text-[16px]">
                              {t("name")}
                            </span>
                            <p className="text-foreground">
                              {form.firstName} {form.lastName}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[16px]">
                              {t("email")}
                            </span>
                            <p className="text-foreground truncate">
                              {form.email}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[16px]">
                              {t("phone")}
                            </span>
                            <p className="text-foreground">{form.phone}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[16px]">
                              {t("location")}
                            </span>
                            <p className="text-foreground">
                              {form.billingCity}, {form.billingCountry}
                            </p>
                          </div>
                        </div>
                      </div>

                      {hasCaptcha && (
                        <>
                          <SectionDivider
                            label={t("securityCheck")}
                            icon={Shield}
                          />
                          <div className="rounded-md border border-white/20 bg-secondary/10 p-4 space-y-4">
                            <div className="relative rounded-lg overflow-hidden bg-background border border-white/20">
                              {captchaLoading ? (
                                <div className="flex items-center justify-center h-24">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              ) : captchaImage ? (
                                <img
                                  src={captchaImage}
                                  alt="Captcha"
                                  className="mx-auto h-24 w-full object-contain p-2"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-24">
                                  <p className="text-xs text-muted-foreground">
                                    {t("captchaLoadFailed")}
                                  </p>
                                </div>
                              )}
                            </div>

                            {captchaAudio && (
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={playAudio}
                                  disabled={audioPlaying || captchaLoading}
                                  className={cn(
                                    "w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                                    "bg-secondary/30 border-border/50 text-foreground",
                                    "hover:bg-secondary/60 hover:border-muted-foreground/40",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/20",
                                    audioPlaying &&
                                      "bg-primary/10 border-primary/30",
                                  )}
                                >
                                  {audioPlaying ? (
                                    <>
                                      <VolumeX className="h-4 w-4 animate-pulse" />
                                      <span>{t("playing")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="h-4 w-4" />
                                      <span>{t("listenAudioCaptcha")}</span>
                                    </>
                                  )}
                                </button>
                                {audioError && (
                                  <p className="text-xs text-destructive flex items-center gap-1.5">
                                    <AlertTriangle className="h-3 w-3" />
                                    {t("audioPlayFailed")}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <InputField
                                name="captchaAnswer"
                                placeholder={t("yourAnswerPlaceholder")}
                                label={t("yourAnswer")}
                                value={form.captchaAnswer}
                                onChange={handleChange}
                                required
                                className="flex-1"
                              />
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={loadCaptcha}
                                  disabled={captchaLoading}
                                  className={cn(
                                    "h-[46px] w-[46px] flex items-center justify-center rounded-xl border border-border/50 transition-all",
                                    "bg-secondary/30 text-muted-foreground",
                                    "hover:bg-secondary/60 hover:text-foreground",
                                    "disabled:opacity-50 disabled:cursor-not-allowed",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/20",
                                  )}
                                  aria-label={t("refreshCaptchaAria")}
                                  title={t("newCaptchaTitle")}
                                >
                                  <RefreshCw
                                    className={cn(
                                      "h-4 w-4",
                                      captchaLoading && "animate-spin",
                                    )}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="rounded-xl bg-secondary/10 border border-border/40 p-4">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t.rich("termsNotice", {
                            legal: (chunks: ReactNode) => (
                              <a
                                href="/legal"
                                className="text-primary hover:underline font-medium"
                              >
                                {chunks}
                              </a>
                            ),
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      {step > 0 && (
                        <button
                          type="button"
                          onClick={prevStep}
                          className={cn(
                            "w-full min-h-[44px] py-3 flex gap-2 items-center justify-center rounded-md font-mono text-base sm:text-lg border border-white/40 transition-colors duration-200 cursor-pointer",
                            "text-white",
                            "hover:bg-white/70 hover:text-black active:scale-[0.98]",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        >
                          {t("back")}
                        </button>
                      )}

                      {step < steps.length - 1 ? (
                        <button
                          type="button"
                          onClick={nextStep}
                          disabled={backendReady === false}
                          className={cn(
                            "w-full min-h-[44px] py-3 flex items-center justify-center gap-2 rounded-md font-mono text-base sm:text-lg border border-white/40 transition-colors duration-200 cursor-pointer",
                            "text-black bg-white",
                            "hover:bg-white/70 active:scale-[0.98]",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        >
                          {t("continue")}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      ) : (
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
                              {t("creatingAccount")}
                            </>
                          ) : (
                            <>
                              {t("createAccount")}
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>

              <div className="border-t border-border/40 bg-secondary/10 px-4 sm:px-8 py-4">
                <p className="text-center text-xl text-muted-foreground">
                  {t("alreadyHaveAccount")}{" "}
                  <a
                    href={loginHref}
                    className="text-white hover:text-white/70 font-medium transition-colors"
                  >
                    {t("signIn")}
                  </a>
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
              {t("securityNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
