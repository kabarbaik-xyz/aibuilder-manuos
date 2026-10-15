import React from 'react';
import { Icon, type IconName } from '../icons';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'blue' | 'ai';
  icon?: IconName;
  className?: string;
  title?: string;
}

export function Badge({
  children,
  variant = 'default',
  icon,
  className = '',
  title,
}: BadgeProps) {
  const variantClass = variant !== 'default' ? variant : '';
  return (
    <span className={`badge ${variantClass} ${className}`.trim()} title={title}>
      {icon && <Icon name={icon} className="mr-1" />}
      {typeof children === 'string' && /^[A-Z][A-Z_ ]+$/.test(children) ? children.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : children || '—'}
    </span>
  );
}
