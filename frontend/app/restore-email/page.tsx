"use client"

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function RestoreEmailClient() {
  const t = useTranslations("restoreEmailPage");
  const params = useSearchParams();
  const token = params?.get("token");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError(t("errors.missingToken"));
      return;
    }

    const apiPath = `/api/auth/restore-email?token=${encodeURIComponent(token)}`;
    window.location.assign(apiPath);
  }, [token, t]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{t("title")}</h2>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("redirecting")}</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {t("notRedirectedPrefix")} <a href={`/api/auth/restore-email?token=${token}`} className="text-primary underline">{t("clickHere")}</a>.
        </p>
      </div>
    </div>
  );
}

export default function RestoreEmailPage() {
  const t = useTranslations("restoreEmailPage");

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">{t("loading")}</div>}>
      <RestoreEmailClient />
    </Suspense>
  );
}
