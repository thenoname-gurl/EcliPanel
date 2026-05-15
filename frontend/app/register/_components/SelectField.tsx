import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/* ─── Reusable Select ─── */
export function SelectField({
  icon: Icon,
  label,
  name,
  value,
  onChange,
  required,
  children,
  className,
}: {
  icon?: any;
  label?: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={name}
          className="block text-xl font-medium text-foreground/80"
        >
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <div className="relative group">
        {Icon && (
          <div
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors duration-150",
              focused ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          className={cn(
            "w-full rounded-md border py-3 text-[18px] font-mono outline-none transition-all duration-150 appearance-none cursor-pointer",
            "border-white/20 bg-black md:transparent text-white",
            "focus:ring-2 focus:ring-white/50",
            "hover:border-muted-foreground/40",
            Icon ? "pl-10 pr-10" : "pl-3.5 pr-10",
            !value && "text-muted-foreground/50",
          )}
          style={{ colorScheme: "dark" }}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
