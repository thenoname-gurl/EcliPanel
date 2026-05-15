import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export function AlertBanner({
  variant = "info",
  title,
  children,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const styles = {
    info: {
      container: "border-blue-500/20 bg-blue-500/5",
      icon: "text-blue-400",
      title: "text-blue-300",
      text: "text-blue-200/70",
      IconComponent: Info,
    },
    warning: {
      container: "border-yellow-500/20 bg-yellow-500/5",
      icon: "text-yellow-400",
      title: "text-yellow-300",
      text: "text-yellow-200/70",
      IconComponent: AlertTriangle,
    },
    error: {
      container: "border-destructive/20 bg-destructive/5",
      icon: "text-destructive",
      title: "text-destructive",
      text: "text-destructive/70",
      IconComponent: AlertTriangle,
    },
    success: {
      container: "border-green-500/20 bg-green-500/5",
      icon: "text-green-400",
      title: "text-green-300",
      text: "text-green-200/70",
      IconComponent: CheckCircle2,
    },
  };

  const style = styles[variant];
  const IconComp = style.IconComponent;

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-300",
        style.container,
      )}
    >
      <div className="flex gap-3">
        <IconComp className={cn("h-5 w-5 shrink-0 mt-0.5", style.icon)} />

        <div className="flex-1 min-w-0 space-y-1">
          {title && (
            <p className={cn("text-sm font-semibold", style.title)}>{title}</p>
          )}

          <div className={cn("text-sm leading-relaxed", style.text)}>
            {children}
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className={cn(
                "mt-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                "border-current/20 hover:bg-white/5",
              )}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
