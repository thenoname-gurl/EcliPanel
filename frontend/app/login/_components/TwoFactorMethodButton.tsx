import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export function TwoFactorMethodButton({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: any;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left",
        selected
          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
          : "border-border/60 hover:border-muted-foreground/40 hover:bg-secondary/30",
      )}
    >
      <div
        className={cn(
          "p-2 rounded-lg",
          selected
            ? "bg-primary/20 text-primary"
            : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {label}
        </p>

        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {selected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
    </button>
  );
}
