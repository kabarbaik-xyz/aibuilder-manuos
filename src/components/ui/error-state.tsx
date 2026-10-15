import React from 'react';
import { Icon } from '../icons';

export interface ErrorStateProps {
  title?: string;
  error: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'An error occurred',
  error,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="p-4 rounded-xl border border-[#f5c2c7] bg-[#fff5f5] text-danger my-3 border-line">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="alert" className="w-4 h-4 text-danger" />
        <strong className="text-xs font-semibold">{title}</strong>
      </div>
      <p className="text-xs text-danger/90">{error}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs font-bold text-danger underline hover:text-danger/80"
        >
          Try again
        </button>
      )}
    </div>
  );
}
