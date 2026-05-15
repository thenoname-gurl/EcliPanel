"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export function InputField({
  icon: Icon,
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  className,
  rightElement,
  autoComplete,
}: {
  icon?: any;
  label?: string;
  name: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
  autoComplete?: string;
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
              "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
              focused ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}

        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          autoComplete={autoComplete}
          aria-required={required}
          className={cn(
            "w-full border bg-black md:transparent py-3 text-[18px] text-white placeholder:text-muted-foreground/80 font-mono outline-none transition-all duration-150",
            "border-white/20",
            "focus:ring-2 focus:ring-white/50",
            Icon ? "pl-10 pr-3" : "px-3.5",
            rightElement && "pr-11",
          )}
        />

        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
}
