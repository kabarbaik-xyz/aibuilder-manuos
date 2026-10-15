import React from 'react';
import { Icon } from '../icons';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'blue' | 'ai';
  icon?: string;
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
      {children}
    </span>
  );
}
