'use client';

import React, { useEffect, useRef } from 'react';
import { Icon } from '../icons';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  type?: 'drawer' | 'modal';
  className?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  type = 'drawer',
  className = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        dialog.scrollTop = 0;
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // Only handle clicks directly originating on the <dialog> element itself (the backdrop)
    if (e.target !== dialogRef.current) return;

    // Ignore synthetic keyboard clicks (e.g. Enter key triggering synthetic click)
    if (e.detail === 0 || (e.clientX === 0 && e.clientY === 0)) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;

    if (!isInDialog) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`${type === 'drawer' ? 'detail-dialog' : 'search-dialog'} ${className}`.trim()}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close panel"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-actions">{footer}</div>}
    </dialog>
  );
}
