'use client';

import React from 'react';
import { Icon } from '../icons';

export interface ToastProps {
  message: string | null;
  iconName?: string;
}

export function Toast({ message, iconName = 'check' }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast show" role="status" aria-live="polite">
      <Icon name={iconName} />
      <span>{message}</span>
    </div>
  );
}
