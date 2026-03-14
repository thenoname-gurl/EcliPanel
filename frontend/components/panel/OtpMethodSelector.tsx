import React from "react";

export type OtpMethod = "totp" | "backup" | "email";

interface Props {
  selected: OtpMethod | null;
  onSelect: (method: OtpMethod) => void;
}

export function OtpMethodSelector({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 mb-2">
      <button
        type="button"
        className={`rounded border px-3 py-1 text-sm ${selected === "totp" ? "bg-primary text-primary-foreground" : "bg-card"}`}
        onClick={() => onSelect("totp")}
      >
        Authenticator App
      </button>
      <button
        type="button"
        className={`rounded border px-3 py-1 text-sm ${selected === "backup" ? "bg-primary text-primary-foreground" : "bg-card"}`}
        onClick={() => onSelect("backup")}
      >
        Backup Code
      </button>
      <button
        type="button"
        className={`rounded border px-3 py-1 text-sm ${selected === "email" ? "bg-primary text-primary-foreground" : "bg-card"}`}
        onClick={() => onSelect("email")}
      >
        Email Code
      </button>
    </div>
  );
}
