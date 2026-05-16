"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Menu } from "./landing/_components/_custom/Menu";
import GradualBlurMemo from "./landing/_components/_reacts-bits/GradualBlur";

function BinaryStrip() {
  const [binary, setBinary] = useState("");

  useEffect(() => {
    const chars = "01";
    let str = "";

    for (let i = 0; i < 200; i++) {
      str += chars[Math.floor(Math.random() * chars.length)];
    }

    setBinary(str);
  }, []);

  return (
    <div className="overflow-hidden py-3 sm:py-4 text-[8px] sm:text-[10px] font-mono text-white/20 select-none break-all leading-relaxed">
      {binary}
    </div>
  );
}

function CrashLog({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations("errorPage");

  const [timestamp] = useState(() => new Date().toISOString());

  const [pid] = useState(() => Math.floor(Math.random() * 65535));

  const [memAddr] = useState(
    () =>
      "0x" +
      Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0")
        .toUpperCase(),
  );

  return (
    <div className="space-y-2 font-mono text-sm leading-relaxed sm:text-base">
      <p className="text-red-400/40">
        ──────────────────────────────────────────────
      </p>

      <p>
        <span className="text-red-400">{t("crash.report")}</span>{" "}
        <span className="text-red-400/50">— {t("crash.runtime")}</span>
      </p>

      <p className="text-red-400/40">
        ──────────────────────────────────────────────
      </p>

      <p className="text-white/70">
        <span className="text-red-400/60">{t("crash.timestamp")}</span>{" "}
        {timestamp}
      </p>

      <p className="text-white/70">
        <span className="text-red-400/60">{t("crash.pid")}</span> {pid}
      </p>

      <p className="text-white/70">
        <span className="text-red-400/60">{t("crash.memory")}</span> {memAddr}
      </p>

      {error.digest && (
        <p className="text-white/70">
          <span className="text-red-400/60">{t("crash.digest")}</span>{" "}
          {error.digest}
        </p>
      )}

      <p className="text-white/70">
        <span className="text-red-400/60">{t("crash.signal")}</span>{" "}
        {t("crash.signalValue")}
      </p>

      <p className="text-red-400/40">
        ──────────────────────────────────────────────
      </p>

      <p>
        <span className="text-red-400/60">{t("crash.exception")}</span>{" "}
        <span className="text-red-300">
          {error.name || t("crash.defaultErrorName")}
        </span>
      </p>

      <p>
        <span className="text-red-400/60">{t("crash.message")}</span>{" "}
        <span className="text-red-300/80">
          {error.message || t("crash.defaultErrorMessage")}
        </span>
      </p>

      <p className="text-red-400/40">
        ──────────────────────────────────────────────
      </p>
    </div>
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");

  const [retryCount, setRetryCount] = useState(0);

  const [retrying, setRetrying] = useState(false);

  const [memoryInfo, setMemoryInfo] = useState<{
    used: number | null;
    total: number | null;
  }>({
    used: null,
    total: null,
  });

  useEffect(() => {
    if (typeof window !== "undefined" && (performance as any).memory) {
      const mem = (performance as any).memory;

      setMemoryInfo({
        used: mem.usedJSHeapSize,
        total: mem.jsHeapSizeLimit,
      });
    } else if (
      typeof navigator !== "undefined" &&
      (navigator as any).deviceMemory
    ) {
      const deviceMemory = (navigator as any).deviceMemory;

      setMemoryInfo({
        used: null,
        total: Number(deviceMemory) * 1024 * 1024 * 1024,
      });
    }
  }, []);

  const memoryPercent =
    memoryInfo.used && memoryInfo.total
      ? (memoryInfo.used / memoryInfo.total) * 100
      : null;

  const memoryStatus =
    memoryPercent === null
      ? "UNKNOWN"
      : memoryPercent > 90
        ? "OVERFLOW"
        : memoryPercent > 75
          ? "WARN"
          : "OK";

  const handleRetry = () => {
    setRetryCount((c) => c + 1);

    setRetrying(true);

    setTimeout(() => {
      setRetrying(false);
      reset();
    }, 1500);
  };

  return (
    <main className="relative flex w-full justify-center overflow-hidden bg-black px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />

      <Menu customCTA={{ label: "Home", href: "/" }} />

      <div className="relative z-10 mt-35 sm:mt-25 w-full max-w-6xl space-y-8 sm:space-y-10">
        <section className="text-center">
          <div>
            <p className="text-[2.8rem] leading-none font-semibold tracking-tight text-white sm:text-[4.5rem] md:text-[5.5rem] lg:text-[6.5rem]">
              ERROR
            </p>

            <p className="mt-4 text-xs text-red-400/60 sm:text-sm md:text-base">
              FATAL_RUNTIME_EXCEPTION
            </p>
          </div>

          <p className="mx-auto mt-6 max-w-3xl px-2 font-mono text-sm leading-relaxed text-white/70 sm:text-base">
            <span className="text-red-400">{t("hero.fatal")}</span>{" "}
            {t("hero.title")}
            <br className="hidden md:block" />
            {t("hero.subtitle")}
          </p>

          {retryCount > 0 && (
            <p className="mt-4 font-mono text-xs text-yellow-400/70 sm:text-sm">
              {t("hero.retryAttempts", { count: retryCount })}
            </p>
          )}
        </section>

        <section className="font-mono">
          <div className="overflow-x-auto bg-white/10 p-4 sm:p-6">
            <p className="text-xs text-gray-500 sm:text-sm">
              eclipse@systems ~ % ./runtime --exec
            </p>

            <div className="mt-3 space-y-1 text-sm sm:text-base">
              <p className="text-white/70">
                <span className="text-red-500">{t("terminal.panic")}</span>{" "}
                {t("terminal.unrecoverable")}
              </p>

              <p className="text-white/70">
                <span className="text-white">{t("terminal.error")}</span>{" "}
                <span className="text-red-300/80">
                  {error.message || t("crash.defaultErrorMessage")}
                </span>
              </p>

              {error.digest && (
                <p className="text-white/70">
                  <span className="text-white">{t("terminal.digest")}</span>{" "}
                  <span className="text-red-300/60">{error.digest}</span>
                </p>
              )}

              <p className="text-white/70">
                <span className="text-white">{t("terminal.exitCode")}</span>{" "}
                <span className="text-red-300">1</span>
              </p>

              <p className="pt-2 text-red-400">✗ {t("terminal.terminated")}</p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        <section>
          <h2 className="mb-6 text-2xl font-bold sm:text-3xl">
            {t("sections.crashReport")}
          </h2>

          <div className="bg-white/5 p-5 sm:p-8">
            <CrashLog error={error} />
          </div>
        </section>

        <BinaryStrip />

        <section>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: t("status.runtime"),
                status: t("status.fault"),
                color: "bg-white/5",
              },
              {
                label: t("status.memory"),
                status:
                  memoryPercent !== null
                    ? `${memoryStatus} (${memoryPercent.toFixed(1)}%)`
                    : t("status.unknown"),
                color: "bg-white/5",
              },
              {
                label: t("status.network"),
                status: t("status.ok"),
                color: "bg-white/5",
              },
              {
                label: t("status.recovery"),
                status: t("status.pending"),
                color: "bg-white/5",
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`p-5 text-center font-mono ${item.color}`}
              >
                <p className="mb-2 text-[16px] uppercase tracking-widest opacity-60">
                  {item.label}
                </p>

                <p className="text-2xl font-bold">{item.status}</p>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        <section>
          <div className="bg-white/5 p-5 font-mono sm:p-8">
            <div className="space-y-2 text-sm leading-relaxed sm:text-base">
              <p className="text-gray-500">
                eclipse@systems ~ % ./recover --auto
              </p>

              <p className="pt-2 text-yellow-400">
                <span className="text-yellow-400">{t("recovery.warn")}</span>{" "}
                {t("recovery.autoUnavailable")}
              </p>

              <p className="text-white/70">
                <span className="text-white">{t("recovery.scanning")}</span>{" "}
                <span className="text-red-400">{t("recovery.corrupted")}</span>
              </p>

              <p className="text-white/70">
                <span className="text-white">{t("recovery.heap")}</span>{" "}
                <span className="text-red-300/60">
                  {t("recovery.heapUnavailable")}
                </span>
              </p>

              <p className="text-white/70">
                <span className="text-white">{t("recovery.stack")}</span>{" "}
                <span className="text-red-300/60">
                  {t("recovery.stackLost")}
                </span>
              </p>

              <p className="pt-2 text-purple-400">
                <span className="text-purple-400">
                  {t("recovery.suggestion")}
                </span>{" "}
                <span className="text-purple-400/70">
                  {t("recovery.manualRequired")}
                </span>
              </p>

              <p className="text-gray-500">{t("recovery.tryReset")}</p>
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full rounded bg-white px-6 py-3 text-center font-mono text-sm font-semibold text-black transition-all hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {retrying ? "RETRYING..." : "RESET RUNTIME"}
              </button>

              <Link
                href="/"
                className="w-full rounded border border-white/20 px-6 py-3 text-center font-mono text-sm font-semibold text-white transition-all hover:bg-white/70 hover:text-black sm:w-auto"
              >
                RETURN HOME
              </Link>
            </div>
          </div>
        </section>

        <BinaryStrip />
      </div>
    </main>
  );
}
