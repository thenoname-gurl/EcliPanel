"use client"

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function RestoreEmailClient() {
  const params = useSearchParams();
  const token = params?.get("token");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing restore token.");
      return;
    }

    const apiPath = `/api/auth/restore-email?token=${encodeURIComponent(token)}`;
    window.location.assign(apiPath);
  }, [token]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Restoring your previous email</h2>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Please wait - you will be redirected shortly.</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          If you are not redirected, <a href={`/api/auth/restore-email?token=${token}`} className="text-primary underline">click here</a>.
        </p>
      </div>
    </div>
  );
}

export default function RestoreEmailPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
      <RestoreEmailClient />
    </Suspense>
  );
}
