import React from 'react';
import { Button } from './button';
import { Icon } from '../icons';

export function LoadingState({ message = 'Loading records...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-sky-400 mb-3" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

export function EmptyState({
  title = 'No records found',
  description = 'There are no records matching your current filter or workspace.',
  actionLabel,
  onAction,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 p-12 text-center bg-neutral-900/30">
      <div className="mb-3 rounded-full bg-neutral-800 p-3 text-neutral-400">
        <Icon name="search" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-neutral-400 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while contacting the server.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center text-red-200">
      <h3 className="text-base font-semibold text-red-300">{title}</h3>
      <p className="mt-1 text-sm text-red-400/80 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="soft" onClick={onRetry}>
            Retry request
          </Button>
        </div>
      )}
    </div>
  );
}

export function PermissionDeniedState({
  capability,
  message,
}: {
  capability?: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center text-amber-200">
      <h3 className="text-base font-semibold text-amber-300">Access Restricted</h3>
      <p className="mt-1 text-sm text-amber-400/80 max-w-md">
        {message ||
          (capability
            ? `Your active role bundle does not grant capability '${capability}'. Contact your workspace administrator for access.`
            : 'You do not have permission to view this resource.')}
      </p>
    </div>
  );
}
