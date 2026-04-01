"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
    Shield,
    User,
    Palette,
    Bell,
    Code,
    BadgeCheck,
    Activity,
    CreditCard,
    ClipboardList,
    FileText,
    Server,
    Database,
    Terminal,
    Rocket,
    ChevronLeft,
    ChevronRight,
    Minus,
    X,
    ArrowRight,
    Check,
    Info,
    ExternalLink,
    Loader2,
    Sparkles,
    PartyPopper,
    Heart,
    Zap,
} from "lucide-react";

const steps = [
    {
        title: "Setup security first",
        text: "Verify email and register passkeys in the security tab.",
        route: "/dashboard/settings?tab=security",
        target: "[data-guide-id='settings-security']",
        helper: "Click Security then passkeys and register a new passkey.",
        icon: Shield,
    },
    {
        title: "Profile setup",
        text: "Set display name and avatar so your team recognizes you.",
        route: "/dashboard/settings?tab=profile",
        target: "[data-guide-id='settings-profile']",
        helper:
            "On Profile, set your display name, email, profile picture and some other information.",
        icon: User,
    },
    {
        title: "Themes and appearance",
        text: "Choose your UI theme and editor font settings.",
        route: "/dashboard/settings?tab=appearance",
        target: "[data-guide-id='settings-appearance']",
        helper: "Select theme and customization options in Appearance tab.",
        icon: Palette,
    },
    {
        title: "Notifications",
        text: "Configure notification preferences for server events.",
        route: "/dashboard/settings?tab=notifications",
        target: "[data-guide-id='settings-notifications']",
        helper: "Enable or disable notifications according to your workflow.",
        icon: Bell,
    },
    {
        title: "Editor settings",
        text: "Adjust editor and terminal settings to your taste.",
        route: "/dashboard/settings?tab=editor",
        target: "[data-guide-id='settings-editor']",
        helper: "Set themes, tab size, and editor preferences.",
        icon: Code,
    },
    {
        title: "Identity verification",
        text: "Connect student identity and optionally upload documents.",
        route: "/dashboard/identity",
        target: "[data-guide-id='identity-student']",
        helper:
            "In Identity, click Connect Hack Club or GitHub for student plan.",
        icon: BadgeCheck,
    },
    {
        title: "Account Activity",
        text: "Check your account activity and recent actions.",
        route: "/dashboard/activity",
        target: "[data-guide-id='activity-dashboard']",
        helper: "Review your account activity and recent actions.",
        icon: Activity,
    },
    {
        title: "Billing",
        text: "Manage plan and billing details.",
        route: "/dashboard/billing",
        target: "[data-guide-id='billing-panel']",
        helper: "Review active plan and charges here.",
        icon: CreditCard,
    },
    {
        title: "Account activity",
        text: "View recent account actions and audit logs.",
        route: "/dashboard",
        target: "[data-guide-id='dashboard-activity']",
        helper: "Check recent activity feed on dashboard.",
        icon: ClipboardList,
    },
    {
        title: "Create your first server",
        text: "Create a server from the Servers page.",
        route: "/dashboard/servers",
        target: "[data-guide-id='servers-new']",
        helper: "Click New Server and follow the wizard.",
        icon: Server,
    },
    {
        title: "Choose a template",
        text: "Select a server template (game/runtime) in the New Server modal.",
        route: "/dashboard/servers",
        target: "[data-guide-id='new-server-template']",
        helper: "Pick the template that matches the server you want to run.",
        icon: FileText,
    },
    {
        title: "Select a node",
        text: "Choose the node where your server will be deployed.",
        route: "/dashboard/servers",
        target: "[data-guide-id='new-server-node']",
        helper: "Pick an available node (location/plan) to host your server.",
        icon: Server,
    },
    {
        title: "Server name",
        text: "Give your server a short, recognizable name.",
        route: "/dashboard/servers",
        target: "[data-guide-id='new-server-name']",
        helper: "Enter a name such as 'My Minecraft Server'.",
        icon: User,
    },
    {
        title: "Resources",
        text: "Set memory, disk and CPU for your server.",
        route: "/dashboard/servers",
        target: "[data-guide-id='new-server-resources']",
        helper: "Adjust resources according to your plan and node.",
        icon: Activity,
    },
    {
        title: "Deploy the server",
        text: "Finalize by deploying the server.",
        route: "/dashboard/servers",
        target: "[data-guide-id='new-server-deploy']",
        helper: "Press Deploy Server to create and start your server.",
        icon: Rocket,
    },
    {
        title: "Choose your server",
        text: "Select a server from the list to view details.",
        route: "/dashboard/servers",
        target: "[data-guide-id='server-card']",
        helper: "Click any server card to open its details page.",
        icon: ClipboardList,
    },
    {
        title: "Your server header",
        text: "This shows your server name and id.",
        target: "[data-guide-id='server-header']",
        helper: "The server name and quick info appear here.",
        icon: Server,
    },
    {
        title: "Resource overview",
        text: "Monitor CPU, RAM, Disk and Network usage.",
        target: "[data-guide-id='server-resources']",
        helper: "These stats show current resource usage for the server.",
        icon: Activity,
    },
    {
        title: "Files tab",
        text: "Manage your server files and uploads.",
        target: "[data-tab='files']",
        helper: "Open Files to browse or upload files to your server.",
        icon: ClipboardList,
    },
    {
        title: "Configure startup",
        text: "Open Startup tab in a server and select docker image.",
        target: "[data-tab='startup']",
        helper: "Select startup tab and adjust image/settings as needed.",
        icon: Rocket,
    },
    {
        title: "Databases",
        text: "Manage databases attached to this server.",
        target: "[data-tab='databases']",
        helper: "Create, view and delete server databases here.",
        icon: Database,
    },
    {
        title: "Settings",
        text: "Server-level settings and configuration.",
        target: "[data-tab='settings']",
        helper: "Adjust server settings, mounts and subusers.",
        icon: Code,
    },
    {
        title: "Console",
        text: "Open the console to view live output and type commands.",
        target: "[data-tab='console']",
        helper: "Use the Console tab to interact with your server in real time.",
        icon: Terminal,
    },
];

type GuidePhase = "welcome" | "guide" | "complete";

function useUrlChange() {
    const [url, setUrl] = useState("");

    useEffect(() => {
        setUrl(window.location.pathname + window.location.search);

        const handlePopState = () => {
            setUrl(window.location.pathname + window.location.search);
        };

        const originalPushState = history.pushState.bind(history);
        const originalReplaceState = history.replaceState.bind(history);

        history.pushState = (...args) => {
            originalPushState(...args);
            setUrl(window.location.pathname + window.location.search);
        };

        history.replaceState = (...args) => {
            originalReplaceState(...args);
            setUrl(window.location.pathname + window.location.search);
        };

        window.addEventListener("popstate", handlePopState);

        const pollInterval = setInterval(() => {
            const currentUrl =
                window.location.pathname + window.location.search;
            setUrl((prev) => (prev !== currentUrl ? currentUrl : prev));
        }, 100);

        return () => {
            window.removeEventListener("popstate", handlePopState);
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
            clearInterval(pollInterval);
        };
    }, []);

    return url;
}

function WelcomeScreen({
    onStart,
    onSkip,
}: {
    onStart: () => void;
    onSkip: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[200001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
                <div className="relative h-32 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent overflow-hidden">
                    <div
                        className="absolute inset-0 bg-[url('/assets/icons/logo.png')] bg-center bg-no-repeat opacity-10"
                        style={{ backgroundSize: "120px" }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent" />
                </div>

                <div className="px-6 pb-6 -mt-8 relative">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-card border-2 border-border shadow-lg flex items-center justify-center">
                            <img
                                src="/assets/icons/logo.png"
                                alt="Eclipse Systems"
                                className="w-12 h-12 rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <h1 className="text-xl font-bold text-foreground mb-1">
                            Welcome to Eclipse Systems!
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            We&apos;re thrilled to have you here
                        </p>
                    </div>

                    <div className="space-y-3 mb-6">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Quick Setup Guide
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    We&apos;ll walk you through setting up your
                                    account, configuring your profile, and
                                    creating your first server.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Takes about 5-10 minutes
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    You can minimize or skip at any time.
                                    <br />
                                    Check the settings to revisit.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onStart}
                            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <Rocket className="w-4 h-4" />
                            Start the Guide
                        </button>
                        <button
                            onClick={onSkip}
                            className="w-full h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                            Skip for now
                        </button>
                    </div>

                    <p className="text-center text-[10px] text-muted-foreground/60 mt-4">
                        Made with{" "}
                        <Heart className="w-3 h-3 inline text-red-500" /> by
                        EclipseSystems Team
                    </p>
                </div>
            </div>
        </div>
    );
}

function CompletionScreen({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[200001] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
                <div className="relative h-36 bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <PartyPopper className="w-16 h-16 text-green-500/30" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent" />
                </div>

                <div className="px-6 pb-6 -mt-8 relative">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 shadow-lg flex items-center justify-center">
                            <Check className="w-8 h-8 text-green-500" />
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <h1 className="text-xl font-bold text-foreground mb-1">
                            You&apos;re All Set!
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Congratulations on completing the guide
                        </p>
                    </div>

                    <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/5 to-emerald-500/5 border border-green-500/10 mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-green-500" />
                            </div>
                            <span className="font-semibold text-sm text-foreground">
                                What you&apos;ve learned:
                            </span>
                        </div>
                        <ul className="space-y-2 text-xs text-muted-foreground">
                            <li className="flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                <span>
                                    Setting up account security & passkeys
                                </span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                <span>
                                    Customizing your profile & preferences
                                </span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                <span>Creating and managing servers</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                <span>
                                    Using the console, files & databases
                                </span>
                            </li>
                        </ul>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 mb-6">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                Need help?
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Check out our documentation or open a support
                                ticket anytime. We&apos;re here to help!
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Sparkles className="w-4 h-4" />
                        Start Exploring
                    </button>

                    <p className="text-center text-[10px] text-muted-foreground/60 mt-4">
                        Good luck & happy hosting!{" "}
                        <Heart className="w-3 h-3 inline text-red-500" />
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function Guide() {
    const router = useRouter();
    const pathname = usePathname();
    const currentUrl = useUrlChange();

    const [show, setShow] = useState(false);
    const [phase, setPhase] = useState<GuidePhase>("welcome");
    const [step, setStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [minimized, setMinimized] = useState(false);
    const [searching, setSearching] = useState(false);
    const [navigating, setNavigating] = useState(false);
    const activeTargetRef = useRef<HTMLElement | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    const retryTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

    const navigatedForStepRef = useRef<number | null>(null);

    const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const el = document.createElement("div");
        el.id = "pixelcat-guide-root";
        document.body.appendChild(el);
        setPortalEl(el);
        return () => {
            if (el.parentNode) el.parentNode.removeChild(el);
            setPortalEl(null);
        };
    }, []);

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get("guide") === "true") {
                setShow(true);
                setPhase("welcome");
            }
        } catch {
            /* skip */
        }
    }, []);

    useEffect(() => {
        try {
            const search = currentUrl.includes("?") ? currentUrl.split("?")[1] : "";
            const params = new URLSearchParams(search);
            if (params.get("guide") === "true") {
                setShow(true);
                setPhase("welcome");
            }
        } catch {
            /* skip */
        }
    }, [currentUrl]);

    useEffect(() => {
        if (!show || minimized || phase !== "guide") return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                setStep((s) => {
                    const newStep = Math.min(s + 1, steps.length - 1);
                    if (
                        newStep === steps.length - 1 &&
                        s === steps.length - 1
                    ) {
                        setPhase("complete");
                    }
                    return newStep;
                });
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                setStep((s) => Math.max(s - 1, 0));
            } else if (e.key === "Escape") {
                setMinimized(true);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [show, minimized, phase]);

    const clearRetryTimeouts = useCallback(() => {
        retryTimeoutsRef.current.forEach(clearTimeout);
        retryTimeoutsRef.current = [];
    }, []);

    const teardown = useCallback(() => {
        if (activeTargetRef.current) {
            activeTargetRef.current.classList.remove("guide-highlight");
            activeTargetRef.current = null;
        }
        document
            .querySelectorAll(".guide-highlight")
            .forEach((el) => el.classList.remove("guide-highlight"));

        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        clearRetryTimeouts();
        navigatedForStepRef.current = null;

        setTargetRect(null);
        setSearching(false);
        setNavigating(false);
        setMinimized(false);

        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has("guide")) {
                url.searchParams.delete("guide");
                window.history.replaceState(
                    {},
                    "",
                    url.pathname + (url.search || "")
                );
            }
        } catch {
            /* skip */
        }
    }, [clearRetryTimeouts]);

    const findAndHighlightTarget = useCallback(
        (selector: string, stepIndex: number): boolean => {
            const target = document.querySelector(
                selector
            ) as HTMLElement | null;

            if (target) {
                const rect = target.getBoundingClientRect();

                if (rect.width === 0 || rect.height === 0) {
                    return false;
                }

                if (
                    activeTargetRef.current &&
                    activeTargetRef.current !== target
                ) {
                    activeTargetRef.current.classList.remove("guide-highlight");
                }

                target.classList.add("guide-highlight");
                activeTargetRef.current = target;

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "center",
                });

                const updateRect = () => {
                    const newRect = target.getBoundingClientRect();
                    if (newRect.width > 0 && newRect.height > 0) {
                        setTargetRect(newRect);
                    }
                };

                const t1 = setTimeout(updateRect, 50);
                const t2 = setTimeout(updateRect, 200);
                const t3 = setTimeout(updateRect, 500);
                retryTimeoutsRef.current.push(t1, t2, t3);

                setSearching(false);
                setNavigating(false);

                try {
                    const attachAutoAdvance = () => {
                        const el = target as HTMLElement;
                        if (!el) return;

                        if (el.tagName.toLowerCase() === "select") {
                            const onChange = () =>
                                setStep((s) =>
                                    s === stepIndex
                                        ? Math.min(s + 1, steps.length - 1)
                                        : s
                                );
                            el.addEventListener("change", onChange, {
                                once: true,
                            });
                            return;
                        }

                        if (
                            el.tagName.toLowerCase() === "button" ||
                            el.getAttribute("role") === "button"
                        ) {
                            const onClick = () =>
                                setStep((s) =>
                                    s === stepIndex
                                        ? Math.min(s + 1, steps.length - 1)
                                        : s
                                );
                            el.addEventListener("click", onClick, {
                                once: true,
                            });
                            return;
                        }

                        if (el.tagName.toLowerCase() === "input") {
                            const inputType = (el as HTMLInputElement).type;
                            if (
                                inputType === "text" ||
                                inputType === "search" ||
                                inputType === "email"
                            ) {
                                let settled = false;
                                const onInput = () => {
                                    const val =
                                        (el as HTMLInputElement).value || "";
                                    if (val.trim().length > 0 && !settled) {
                                        settled = true;
                                        setStep((s) =>
                                            s === stepIndex
                                                ? Math.min(
                                                    s + 1,
                                                    steps.length - 1
                                                )
                                                : s
                                        );
                                    }
                                };
                                el.addEventListener("input", onInput, {
                                    passive: true,
                                });
                                return;
                            }
                        }

                        const ranges = el.querySelectorAll("input[type=range]");
                        if (ranges && ranges.length > 0) {
                            ranges.forEach((r) => {
                                const fn = () =>
                                    setStep((s) =>
                                        s === stepIndex
                                            ? Math.min(
                                                s + 1,
                                                steps.length - 1
                                            )
                                            : s
                                    );
                                r.addEventListener("input", fn, {
                                    once: true,
                                });
                            });
                            return;
                        }

                        if (
                            el.dataset &&
                            el.dataset.guideId === "server-card"
                        ) {
                            const onDocClick = (ev: MouseEvent) => {
                                const targetNode = ev.target as Node | null;
                                if (!targetNode) return;
                                if (el.contains(targetNode)) {
                                    setStep((s) =>
                                        s === stepIndex
                                            ? Math.min(
                                                s + 1,
                                                steps.length - 1
                                            )
                                            : s
                                    );
                                    document.removeEventListener(
                                        "click",
                                        onDocClick,
                                        true
                                    );
                                }
                            };
                            document.addEventListener(
                                "click",
                                onDocClick,
                                true
                            );
                        }
                    };

                    attachAutoAdvance();
                } catch {
                    // skip
                }

                return true;
            }
            return false;
        },
        []
    );

    const isOnCorrectRoute = useCallback((route: string): boolean => {
        try {
            const routeUrl = new URL(route, window.location.origin);
            const currentPathname = window.location.pathname;
            const currentParams = new URLSearchParams(window.location.search);

            const samePath = currentPathname === routeUrl.pathname;

            let sameParams = true;
            routeUrl.searchParams.forEach((value, key) => {
                if (currentParams.get(key) !== value) {
                    sameParams = false;
                }
            });

            return samePath && sameParams;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        if (!show || phase !== "guide") return;

        const stepConfig = steps[step];

        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        clearRetryTimeouts();

        if (activeTargetRef.current) {
            activeTargetRef.current.classList.remove("guide-highlight");
            activeTargetRef.current = null;
        }
        setTargetRect(null);
        setSearching(false);

        const onCorrectRoute = stepConfig?.route
            ? isOnCorrectRoute(stepConfig.route)
            : true;

        if (stepConfig?.route && !onCorrectRoute) {
            if (navigatedForStepRef.current !== step) {
                navigatedForStepRef.current = step;
                setNavigating(true);
                router.push(stepConfig.route);
            }
            return;
        }

        setNavigating(false);

        if (!stepConfig?.target) {
            return;
        }

        const selector = stepConfig.target;
        setSearching(true);

        if (findAndHighlightTarget(selector, step)) {
            return;
        }

        const observer = new MutationObserver((mutations) => {
            const shouldCheck = mutations.some(
                (mutation) =>
                    (mutation.type === "childList" &&
                        mutation.addedNodes.length > 0) ||
                    mutation.type === "attributes"
            );

            if (shouldCheck && findAndHighlightTarget(selector, step)) {
                observer.disconnect();
                observerRef.current = null;
                clearRetryTimeouts();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "data-guide-id",
                "data-tab",
                "class",
                "style",
                "hidden",
            ],
        });

        observerRef.current = observer;

        const retryDelays = [50, 150, 300, 600, 1000, 1500, 2500, 4000];

        retryDelays.forEach((delay, index) => {
            const timeout = setTimeout(() => {
                if (findAndHighlightTarget(selector, step)) {
                    if (observerRef.current) {
                        observerRef.current.disconnect();
                        observerRef.current = null;
                    }
                    clearRetryTimeouts();
                } else if (index === retryDelays.length - 1) {
                    setSearching(false);
                }
            }, delay);
            retryTimeoutsRef.current.push(timeout);
        });

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            clearRetryTimeouts();
            if (activeTargetRef.current) {
                activeTargetRef.current.classList.remove("guide-highlight");
                activeTargetRef.current = null;
            }
        };
    }, [
        step,
        show,
        phase,
        currentUrl,
        router,
        findAndHighlightTarget,
        isOnCorrectRoute,
        clearRetryTimeouts,
    ]);

    useEffect(() => {
        navigatedForStepRef.current = null;
    }, [step]);

    useEffect(() => {
        const updateRect = () => {
            if (activeTargetRef.current) {
                const rect = activeTargetRef.current.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    setTargetRect(rect);
                } else {
                    setTargetRect(null);
                }
            }
        };

        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);

        const pollInterval = setInterval(updateRect, 500);

        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
            clearInterval(pollInterval);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (activeTargetRef.current) {
                activeTargetRef.current.classList.remove("guide-highlight");
                activeTargetRef.current = null;
            }
            document
                .querySelectorAll(".guide-highlight")
                .forEach((el) => el.classList.remove("guide-highlight"));
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
            clearRetryTimeouts();
        };
    }, [clearRetryTimeouts]);

    const next = useCallback(() => {
        setStep((s) => {
            const newStep = Math.min(s + 1, steps.length - 1);
            if (s === steps.length - 1) {
                setPhase("complete");
            }
            return newStep;
        });
    }, []);

    const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

    const handleStartGuide = useCallback(() => {
        setPhase("guide");
        setStep(0);
    }, []);

    const handleCloseGuide = useCallback(() => {
        teardown();
        setShow(false);
        setPhase("welcome");
        setStep(0);
    }, [teardown]);

    if (!show) return null;

    if (phase === "welcome") {
        const welcomeJsx = (
            <WelcomeScreen
                onStart={handleStartGuide}
                onSkip={handleCloseGuide}
            />
        );
        return portalEl ? createPortal(welcomeJsx, portalEl) : welcomeJsx;
    }

    if (phase === "complete") {
        const completeJsx = <CompletionScreen onClose={handleCloseGuide} />;
        return portalEl ? createPortal(completeJsx, portalEl) : completeJsx;
    }

    const progress = ((step + 1) / steps.length) * 100;
    const currentStep = steps[step];
    const StepIcon = currentStep.icon;
    const isLast = step === steps.length - 1;
    const isFirst = step === 0;

    const offRoute =
        !!currentStep.route && !isOnCorrectRoute(currentStep.route);

    if (minimized) {
        const minimizedJsx = (
            <button
                onClick={() => setMinimized(false)}
                className="fixed bottom-4 right-4 z-[200000] flex items-center gap-2.5 rounded-full bg-card border border-border shadow-lg pl-2 pr-3.5 py-1.5 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
                <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <StepIcon className="w-3.5 h-3.5 text-primary" />
                </span>
                <div className="flex flex-col items-start">
                    <span className="text-[11px] font-semibold text-foreground leading-tight">
                        Guide
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                        Step {step + 1} of {steps.length}
                    </span>
                </div>
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <ExternalLink className="w-2.5 h-2.5 text-primary" />
                </div>
            </button>
        );

        return portalEl ? createPortal(minimizedJsx, portalEl) : minimizedJsx;
    }

    const guideJsx = (
        <>
            {targetRect && (
                <div className="fixed inset-0 z-[199999] pointer-events-none">
                    <div
                        className="absolute border-2 border-primary rounded-lg transition-all duration-300 ease-out"
                        style={{
                            left: targetRect.left - 6,
                            top: targetRect.top - 6,
                            width: targetRect.width + 12,
                            height: targetRect.height + 12,
                        }}
                    >
                        <div className="absolute inset-0 border-2 border-primary/40 rounded-lg animate-ping" />
                    </div>

                    <svg
                        className="absolute inset-0 w-full h-full"
                        style={{ overflow: "visible" }}
                    >
                        <defs>
                            <linearGradient
                                id="guide-line-grad"
                                x1="0%"
                                y1="0%"
                                x2="100%"
                                y2="100%"
                            >
                                <stop
                                    offset="0%"
                                    stopColor="hsl(var(--primary))"
                                    stopOpacity="0.6"
                                />
                                <stop
                                    offset="100%"
                                    stopColor="hsl(var(--primary))"
                                    stopOpacity="0"
                                />
                            </linearGradient>
                        </defs>
                        <line
                            x1={targetRect.left + targetRect.width / 2}
                            y1={targetRect.bottom + 6}
                            x2={Math.min(
                                window.innerWidth - 200,
                                targetRect.left + targetRect.width / 2
                            )}
                            y2={window.innerHeight - 240}
                            stroke="url(#guide-line-grad)"
                            strokeWidth="1.5"
                            strokeDasharray="6 4"
                            className="animate-pulse"
                        />
                    </svg>
                </div>
            )}

            <div className="fixed bottom-4 right-4 z-[200000] w-[calc(100vw-2rem)] max-w-[380px]">
                <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="h-1 w-full bg-muted">
                        <div
                            className="h-full bg-primary rounded-r-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-border/50">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <img
                                src="/assets/icons/logo.png"
                                alt="logo"
                                className="w-6 h-6 rounded-md shrink-0"
                            />
                            <span className="text-xs font-semibold text-foreground truncate">
                                Eclipse Guide
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {step + 1}/{steps.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                onClick={() => setMinimized(true)}
                                title="Minimize (Esc)"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                onClick={handleCloseGuide}
                                title="Close guide"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="p-3">
                        <div className="flex gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <StepIcon className="w-4 h-4 text-primary" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-foreground leading-tight">
                                    {currentStep.title}
                                </h3>
                                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                                    {currentStep.text}
                                </p>
                            </div>
                        </div>

                        {currentStep.helper && (
                            <div className="mt-2.5 flex gap-2 items-start rounded-lg bg-primary/5 border border-primary/10 px-2.5 py-2">
                                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-px" />
                                <span className="text-[11px] text-foreground/80 leading-snug">
                                    {currentStep.helper}
                                </span>
                            </div>
                        )}

                        {navigating && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Navigating...</span>
                            </div>
                        )}

                        {!navigating &&
                            searching &&
                            currentStep.target &&
                            !offRoute && (
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Looking for element...</span>
                                </div>
                            )}

                        {!navigating && offRoute && (
                            <button
                                className="mt-2 w-full h-7 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
                                onClick={() => {
                                    if (currentStep.route) {
                                        navigatedForStepRef.current = null;
                                        router.push(currentStep.route);
                                    }
                                }}
                            >
                                <ArrowRight className="w-3 h-3" />
                                Go to this page
                            </button>
                        )}

                        {!navigating &&
                            !searching &&
                            !targetRect &&
                            currentStep.target &&
                            !offRoute && (
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-500">
                                    <Info className="w-3 h-3" />
                                    <span>
                                        Element not visible on this page
                                    </span>
                                </div>
                            )}

                        <div className="mt-3 flex items-center gap-1.5">
                            <button
                                className="h-8 w-8 rounded-lg flex items-center justify-center border border-border bg-background hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                                onClick={prev}
                                disabled={isFirst}
                                title="Previous (←)"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex-1 flex items-center gap-[3px] px-1">
                                {steps.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setStep(i)}
                                        title={s.title}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${i === step
                                                ? "flex-[3] bg-primary"
                                                : i < step
                                                    ? "flex-1 bg-primary/30 hover:bg-primary/50"
                                                    : "flex-1 bg-muted hover:bg-muted-foreground/30"
                                            }`}
                                    />
                                ))}
                            </div>

                            {isLast ? (
                                <button
                                    className="h-8 rounded-lg px-3 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.97] transition-all flex items-center gap-1.5 shrink-0"
                                    onClick={() => setPhase("complete")}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    Finish
                                </button>
                            ) : (
                                <button
                                    className="h-8 rounded-lg px-3 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all flex items-center gap-1 shrink-0"
                                    onClick={next}
                                    title="Next (→)"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground/60">
                            <span className="flex items-center gap-0.5">
                                <kbd className="px-1 py-px rounded bg-muted text-[9px] font-mono">
                                    ←
                                </kbd>
                                <kbd className="px-1 py-px rounded bg-muted text-[9px] font-mono">
                                    →
                                </kbd>
                                navigate
                            </span>
                            <span className="flex items-center gap-0.5">
                                <kbd className="px-1 py-px rounded bg-muted text-[9px] font-mono">
                                    esc
                                </kbd>
                                minimize
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    return portalEl ? createPortal(guideJsx, portalEl) : guideJsx;
}