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
        "w-full flex items-start gap-3 p-3.5 cursor-pointer rounded-md border transition-all text-left",
        selected
          ? "border-white bg-white/8 ring-2 ring-primary/20"
          : "border-white/20 hover:border-white/15 hover:bg-white/8",
      )}
    >
      <div
        className={cn(
          "p-2 rounded-lg",
          selected ? "bg-primary/20" : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[18px] font-mono",
            selected ? "text-white" : "text-white/70",
          )}
        >
          {label}
        </p>

        <p className="text-[15px] font-mono text-white/50 mt-0.5">
          {description}
        </p>
      </div>

      {selected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
    </button>
  );
}
