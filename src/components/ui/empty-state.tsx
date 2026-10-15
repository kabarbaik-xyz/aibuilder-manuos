import React from 'react';
import { Icon } from '../icons';

export interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  message,
  icon = 'order',
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="w-10 h-10 rounded-full bg-surface-muted border border-line flex items-center justify-center mx-auto mb-3 text-muted">
        <Icon name={icon} />
      </div>
      {title && <strong className="block text-ink text-xs mb-1">{title}</strong>}
      <p className="text-muted text-xs max-w-sm mx-auto mb-3">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
