'use client';

import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

interface TableStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function TableLoading({ message = 'Loading...', className = '' }: TableStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin mb-3" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function TableError({
  message = 'Failed to load data',
  onRetry,
  className = '',
}: TableStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <div className="flex items-center gap-2 text-destructive mb-2">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 px-3 py-1.5 rounded-md border border-border/50 hover:border-border"
        >
          <RefreshCw className="h-3 w-3" />
          Try Again
        </button>
      )}
    </div>
  );
}

export function TableEmpty({
  message = 'No items found',
  className = '',
  children,
}: TableStateProps & { children?: React.ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground ${className}`}>
      <Inbox className="h-8 w-8 mb-3 opacity-40" />
      <span className="text-sm">{message}</span>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}