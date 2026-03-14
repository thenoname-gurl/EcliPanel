"use client"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelHeader } from "@/components/panel/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";

export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  const accept = async () => {
    try {
      await apiFetch(API_ENDPOINTS.organisationAcceptInvite, {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setStatus("success");
      setMessage("Invitation accepted. Redirecting...");
      setTimeout(() => router.push("/dashboard/organisations"), 1500);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to accept invite");
    }
  };

  return (
    <>
      <PanelHeader title="Accept Organisation Invite" />
      <ScrollArea className="flex-1">
        <div className="flex h-full items-center justify-center p-6">
          {status === "idle" && (
            <button
              onClick={accept}
              className="rounded bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Accept Invite
            </button>
          )}
          {status !== "idle" && (
            <p className="text-sm text-foreground">{message}</p>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
