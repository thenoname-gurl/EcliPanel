"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
    Shield, User, Palette, Bell, Code, BadgeCheck, Activity,
    CreditCard, ClipboardList, FileText, Server, Database,
    Terminal, Rocket, ChevronLeft, ChevronRight, Minus, X,
    Check, Info, Sparkles, PartyPopper, Heart, Zap, Star,
} from "lucide-react";

const GUIDE_RU_TEXT: Record<string, string> = {
    "Welcome to Eclipse Systems!": "Добро пожаловать в Eclipse Systems!",
    "We're thrilled to have you here": "Мы рады видеть вас здесь",
    "Quick Setup Guide": "Быстрая настройка",
    "We'll walk you through setting up your account, configuring your profile, and creating your first server.": "Мы поможем вам настроить аккаунт, профиль и создать первый сервер.",
    "Takes about 5-10 minutes": "Займёт около 5-10 минут",
    "You can minimize or skip at any time.": "Вы можете свернуть или пропустить в любое время.",
    "Check the settings to revisit.": "Зайдите в настройки, чтобы вернуться.",
    "Start the Guide": "Начать настройку",
    "Skip for now": "Пропустить",
    "You're All Set!": "Всё готово!",
    "Congratulations on completing the guide": "Поздравляем с завершением настройки",
    "What you've learned:": "Чему вы научились:",
    "Minimize": "Свернуть",
    "Close": "Закрыть",
    Guide: "Гайд",
    Next: "Далее",
    Finish: "Завершить",
    "Eclipse Guide": "Eclipse Гайд",
    "Element not visible on this page": "Элемент не виден на этой странице",
};

interface GuideStep {
    title: string;
    text: string;
    helper?: string;
    route?: string;
    target?: string;
    icon: any;
}

const STEPS: GuideStep[] = [
    { title: "Setup security first", text: "Verify email and register passkeys in the security tab.", helper: "Click Security then passkeys and register a new passkey.", route: "/dashboard/settings?tab=security", target: "[data-guide-id='settings-security']", icon: Shield },
    { title: "Profile setup", text: "Set display name and avatar so your team recognizes you.", route: "/dashboard/settings?tab=profile", target: "[data-guide-id='settings-profile']", icon: User },
    { title: "Appearance", text: "Pick a theme that matches your style.", route: "/dashboard/settings?tab=appearance", target: "[data-guide-id='settings-appearance']", icon: Palette },
    { title: "Notifications", text: "Configure how you want to be notified.", route: "/dashboard/settings?tab=notifications", target: "[data-guide-id='settings-notifications']", icon: Bell },
    { title: "Editor preferences", text: "Set your preferred code editor settings.", route: "/dashboard/settings?tab=editor", target: "[data-guide-id='settings-editor']", icon: Code },
    { title: "Student verification", text: "Verify your student status for extra benefits.", route: "/dashboard/identity", target: "[data-guide-id='identity-student']", icon: BadgeCheck },
    { title: "Activity dashboard", text: "Monitor your account activity.", route: "/dashboard/activity", target: "[data-guide-id='activity-dashboard']", icon: Activity },
    { title: "Billing panel", text: "Review your billing and subscription.", route: "/dashboard/billing", target: "[data-guide-id='billing-panel']", icon: CreditCard },
    { title: "ELO Projects", text: "Submit your server to ELO rankings and vote on community projects.", route: "/dashboard/elo", target: "[data-guide-id='elo-dashboard']", icon: Star },
    { title: "Dashboard activity", text: "Check recent actions on your dashboard.", route: "/dashboard/activity", target: "[data-guide-id='dashboard-activity']", icon: ClipboardList },
    { title: "Create a server", text: "Create your first server from the servers page.", route: "/dashboard/servers", target: "[data-guide-id='servers-new']", icon: Server },
    { title: "Pick a template", text: "Choose a game or app template for your server.", route: "/dashboard/servers", target: "[data-guide-id='new-server-template']", icon: FileText },
    { title: "Select a node", text: "Choose where your server will run.", route: "/dashboard/servers", target: "[data-guide-id='new-server-node']", icon: Database },
    { title: "Name your server", text: "Give your server a unique name.", route: "/dashboard/servers", target: "[data-guide-id='new-server-name']", icon: Terminal },
    { title: "Configure resources", text: "Set CPU, RAM, and disk for your server.", route: "/dashboard/servers", target: "[data-guide-id='new-server-resources']", icon: Zap },
    { title: "Deploy!", text: "Launch your server and start using it.", route: "/dashboard/servers", target: "[data-guide-id='new-server-deploy']", icon: Rocket },
];

type GuidePhase = "welcome" | "guide" | "complete";

function localizeGuide(locale: string, text: string): string {
    if (locale === "ru" && GUIDE_RU_TEXT[text]) return GUIDE_RU_TEXT[text];
    return text;
}

interface Rect { top: number; left: number; width: number; height: number; }

function findTarget(selector: string): { el: HTMLElement; rect: Rect } | null {
    try {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { el, rect: { top: r.top, left: r.left, width: r.width, height: r.height } };
    } catch { return null; }
}

export default function Guide() {
    const router = useRouter();
    const locale = useLocale();
    const highlightRef = useRef<HTMLElement | null>(null);
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startedRef = useRef(false);

    const [show, setShow] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [phase, setPhase] = useState<GuidePhase>("welcome");
    const [step, setStep] = useState(0);
    const [minimized, setMinimized] = useState(false);
    const [targetRect, setTargetRect] = useState<Rect | null>(null);
    const [searching, setSearching] = useState(false);
    const [showHighlight, setShowHighlight] = useState(false);

    useEffect(() => {
        setHydrated(true);
    }, []);

    useEffect(() => {
        try {
            if (new URLSearchParams(window.location.search).get("guide") === "true") {
                setShow(true);
                setPhase("welcome");
                startedRef.current = true;
            }
        } catch {}
    }, []);

    // Open when URL changes to ?guide=true (e.g. from settings)
    useEffect(() => {
        if (startedRef.current) return;
        const onPop = () => {
            try {
                if (new URLSearchParams(window.location.search).get("guide") === "true") {
                    setShow(true);
                    setPhase("welcome");
                    startedRef.current = true;
                }
            } catch {}
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    // Clear highlight on unmount
    useEffect(() => {
        return () => {
            if (highlightRef.current) {
                highlightRef.current.classList.remove("guide-highlight");
                highlightRef.current = null;
            }
        };
    }, []);

    // Find target element for current step
    useEffect(() => {
        if (!show || phase !== "guide" || minimized) return;

        // Clean up previous highlight
        if (highlightRef.current) {
            highlightRef.current.classList.remove("guide-highlight");
            highlightRef.current = null;
        }
        setTargetRect(null);
        setShowHighlight(false);
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }

        const s = STEPS[step];
        if (!s.target) { setSearching(false); return; }

        setSearching(true);

        // Try immediately
        const found = findTarget(s.target);
        if (found) {
            highlightRef.current = found.el;
            found.el.classList.add("guide-highlight");
            found.el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTargetRect(found.rect);
            setShowHighlight(true);
            setSearching(false);
            return;
        }

        // Navigate if needed
        if (s.route) {
            const routeUrl = new URL(s.route, window.location.origin);
            if (window.location.pathname !== routeUrl.pathname) {
                router.push(s.route);
            }
        }

        // Retry a few times with increasing delays
        const delays = [200, 500, 1000, 2000];
        let attempts = 0;
        const tryFind = () => {
            if (attempts >= delays.length) {
                setSearching(false);
                return;
            }
            const f = findTarget(s.target!);
            if (f) {
                highlightRef.current = f.el;
                f.el.classList.add("guide-highlight");
                f.el.scrollIntoView({ behavior: "smooth", block: "center" });
                setTargetRect(f.rect);
                setShowHighlight(true);
                setSearching(false);
            } else {
                attempts++;
                retryRef.current = setTimeout(tryFind, delays[attempts - 1]);
            }
        };
        retryRef.current = setTimeout(tryFind, delays[0]);

        return () => {
            if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
        };
    }, [show, phase, step, minimized, router]);

    const close = useCallback(() => {
        if (highlightRef.current) {
            highlightRef.current.classList.remove("guide-highlight");
            highlightRef.current = null;
        }
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
        setShow(false);
        setShowHighlight(false);
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has("guide")) {
                url.searchParams.delete("guide");
                window.history.replaceState({}, "", url.toString());
            }
        } catch {}
    }, []);

    const start = useCallback(() => {
        setPhase("guide");
        setStep(0);
    }, []);

    const next = useCallback(() => {
        setStep(s => {
            if (s >= STEPS.length - 1) { setPhase("complete"); return s; }
            return s + 1;
        });
    }, []);

    const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);

    if (!show || !hydrated) return null;

    // ===== WELCOME =====
    if (phase === "welcome") {
        return createPortal(
            <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-card border border-border shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-6">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{localizeGuide(locale, "Eclipse Guide")}</span>
                    </div>
                    <div className="text-center mb-8">
                        <Rocket className="w-10 h-10 text-primary mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-foreground mb-2">{localizeGuide(locale, "Welcome to Eclipse Systems!")}</h2>
                        <p className="text-sm text-muted-foreground">{localizeGuide(locale, "We're thrilled to have you here")}</p>
                    </div>
                    <div className="bg-muted/30 border border-border/50 p-4 mb-6">
                        <h3 className="text-sm font-semibold text-foreground mb-2">{localizeGuide(locale, "Quick Setup Guide")}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{localizeGuide(locale, "We'll walk you through setting up your account, configuring your profile, and creating your first server.")}</p>
                        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                            <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" />{localizeGuide(locale, "Takes about 5-10 minutes")}</li>
                            <li className="flex items-center gap-1.5"><Info className="w-3 h-3 text-blue-500" />{localizeGuide(locale, "You can minimize or skip at any time.")}</li>
                            <li className="flex items-center gap-1.5"><Info className="w-3 h-3 text-blue-500" />{localizeGuide(locale, "Check the settings to revisit.")}</li>
                        </ul>
                    </div>
                    <div className="flex flex-col gap-2">
                        <button onClick={start} className="w-full h-11 bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <Rocket className="w-4 h-4" />{localizeGuide(locale, "Start the Guide")}
                        </button>
                        <button onClick={close} className="w-full h-9 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                            {localizeGuide(locale, "Skip for now")}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // ===== COMPLETE =====
    if (phase === "complete") {
        return createPortal(
            <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-card border border-border shadow-2xl w-full max-w-md p-6 text-center">
                    <PartyPopper className="w-10 h-10 text-primary mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-foreground mb-2">{localizeGuide(locale, "You're All Set!")}</h2>
                    <p className="text-sm text-muted-foreground mb-6">{localizeGuide(locale, "Congratulations on completing the guide")}</p>
                    <div className="bg-muted/30 border border-border/50 p-4 mb-6 text-left">
                        <p className="text-xs font-semibold text-foreground mb-2">{localizeGuide(locale, "What you've learned:")}</p>
                        <ul className="space-y-1">
                            {STEPS.map((s, i) => (
                                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="w-3 h-3 text-green-500" />{s.title}</li>
                            ))}
                        </ul>
                    </div>
                    <button onClick={close} className="w-full h-10 bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" />{localizeGuide(locale, "Finish")}
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    // ===== MINIMIZED =====
    if (minimized) {
        const s = STEPS[step];
        return createPortal(
            <button onClick={() => setMinimized(false)} className="fixed bottom-4 right-4 z-[200000] flex items-center gap-2.5 bg-card border border-border shadow-lg pl-2 pr-3.5 py-1.5 hover:shadow-xl transition-all">
                <span className="w-7 h-7 bg-primary/10 flex items-center justify-center"><s.icon className="w-3.5 h-3.5 text-primary" /></span>
                <span className="text-xs font-semibold text-foreground">{localizeGuide(locale, "Guide")}</span>
            </button>,
            document.body
        );
    }

    // ===== ACTIVE STEP =====
    const s = STEPS[step];
    const isFirst = step === 0;
    const isLast = step === STEPS.length - 1;
    const progress = ((step + 1) / STEPS.length) * 100;

    // Position tooltip relative to target element, or default to bottom-right
    let tooltipStyle: React.CSSProperties = {};
    let arrowStyle: React.CSSProperties = {};
    let arrowClass = "";

    if (targetRect && showHighlight) {
        // Position below the target, centered
        const gap = 12;
        tooltipStyle = {
            position: "fixed",
            top: targetRect.top + targetRect.height + gap,
            left: Math.max(8, targetRect.left + targetRect.width / 2 - 160),
            zIndex: 200001,
        };
        arrowStyle = {
            position: "fixed",
            top: targetRect.top + targetRect.height + 4,
            left: targetRect.left + targetRect.width / 2 - 6,
            zIndex: 200002,
        };
        arrowClass = "w-3 h-3 rotate-45 bg-card border-l border-t border-border";
    }

    const card = (
        <div style={tooltipStyle} className={targetRect && showHighlight ? "" : "fixed bottom-4 right-4 z-[200000]"}>
            {/* Arrow pointing up to target */}
            {targetRect && showHighlight && (
                <div style={arrowStyle} className={arrowClass} />
            )}
            <div className="w-80 bg-card border border-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                        <s.icon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">{localizeGuide(locale, s.title)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setMinimized(true)} className="p-1 text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                        <button onClick={close} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                    </div>
                </div>

                {/* Progress */}
                <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div>

                {/* Body */}
                <div className="p-3">
                    <p className="text-xs text-foreground/80 leading-relaxed">{localizeGuide(locale, s.text)}</p>
                    {s.helper && <p className="text-[10px] text-muted-foreground mt-1.5">{localizeGuide(locale, s.helper)}</p>}
                    {searching && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 animate-pulse">
                            {localizeGuide(locale, "Looking for element...")}
                        </p>
                    )}
                    {!searching && s.target && !targetRect && (
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            {localizeGuide(locale, "Element not visible on this page")}
                        </p>
                    )}
                    {s.route && (
                        <button
                            className="text-[10px] text-primary hover:underline mt-1.5 block"
                            onClick={() => router.push(s.route)}
                        >
                            {s.route}
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border/50">
                    <button onClick={prev} disabled={isFirst}
                        className="h-8 w-8 flex items-center justify-center border border-border bg-background hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1 flex items-center gap-[3px] px-1">
                        {STEPS.map((_, i) => (
                            <button key={i} onClick={() => setStep(i)}
                                className={`h-1.5 transition-all duration-300 ${
                                    i === step ? "flex-[3] bg-primary" : i < step ? "flex-1 bg-primary/30 hover:bg-primary/50" : "flex-1 bg-muted hover:bg-muted-foreground/30"
                                }`} />
                        ))}
                    </div>
                    {isLast ? (
                        <button onClick={() => setPhase("complete")}
                            className="h-8 px-3 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.97] transition-all flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />{localizeGuide(locale, "Finish")}
                        </button>
                    ) : (
                        <button onClick={next}
                            className="h-8 px-3 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all flex items-center gap-1">
                            {localizeGuide(locale, "Next")}<ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(card, document.body);
}