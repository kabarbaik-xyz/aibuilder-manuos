import React from 'react';
import { Badge } from './badge';
import { Icon } from '../icons';

export interface AIContentProps {
  badgeLabel?: string;
  sourceContextTitle?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  children: React.ReactNode;
  className?: string;
}

export function AIContent({
  badgeLabel = 'AI Analyst',
  sourceContextTitle,
  isFallback = false,
  fallbackReason,
  children,
  className = '',
}: AIContentProps) {
  if (isFallback) {
    return (
      <div className={`p-4 rounded-xl border border-line bg-surface-muted ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <Badge variant="default" icon="info">
            Deterministic Engine Fallback
          </Badge>
          {fallbackReason && (
            <span className="small muted">Reason: {fallbackReason}</span>
          )}
        </div>
        <div className="text-xs text-ink/80 leading-relaxed">{children}</div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border border-[#d8d3f7] bg-[#fbfaff] ${className}`} border-line>
      <div className="flex items-center justify-between mb-2">
        <Badge variant="ai" icon="spark">
          {badgeLabel}
        </Badge>
        {sourceContextTitle && (
          <span className="small text-muted flex items-center gap-1">
            <Icon name="shield" className="w-3 h-3 text-[#776ebc]" />
            Grounded in: {sourceContextTitle}
          </span>
        )}
      </div>
      <div className="text-xs text-[#2b274c] leading-relaxed">{children}</div>
    </div>
  );
}
