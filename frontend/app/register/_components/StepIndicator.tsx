import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/* ─── Step Indicator ─── */
export function StepIndicator({
  steps,
  current,
  onStepClick,
}: {
  steps: string[];
  current: number;
  onStepClick: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0 w-full px-2">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <button
            type="button"
            onClick={() => onStepClick(i)}
            className={cn(
              "flex items-center gap-2 transition-all duration-200 group",
              i <= current ? "cursor-pointer" : "cursor-default",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-all duration-200 shrink-0",
                i < current
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === current
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:block transition-colors",
                i === current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div className="flex-1 mx-2 sm:mx-3">
              <div
                className={cn(
                  "h-0.5 rounded-full transition-colors duration-300",
                  i < current ? "bg-primary" : "bg-border/50",
                )}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
