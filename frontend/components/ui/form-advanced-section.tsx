'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';

interface FormAdvancedSectionProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  label?: string;
}

export function FormAdvancedSection({
  children,
  defaultOpen = false,
  label = 'Advanced',
}: FormAdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-t-lg transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5 text-amber-500" />
        <span>{label}</span>
        <span className="ml-auto">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}