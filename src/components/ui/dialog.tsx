'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { Icon } from '../icons';
export interface DialogProps {
 isOpen: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
 type?: 'drawer' | 'modal' | 'search'; size?: 'sm' | 'md' | 'lg'; pending?: boolean; dirty?: boolean; className?: string;
}
export function Dialog({ isOpen, onClose, title, subtitle, children, footer, type = 'modal', size = 'md', pending = false, dirty = false, className = '' }: DialogProps) {
 const ref = useRef<HTMLDialogElement>(null);
 const titleId = useId(); const descriptionId = useId();
 const [confirmClose, setConfirmClose] = useState(false);
 const requestClose = () => { if (!pending) { if (dirty) setConfirmClose(true); else onClose(); } };
 useEffect(() => {
  const dialog = ref.current; if (!dialog || !isOpen) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const releaseScroll = lockBodyScroll();
  dialog.showModal(); setConfirmClose(false);
  return () => { dialog.close(); releaseScroll(); if (opener?.isConnected) opener.focus(); };
 }, [isOpen]);
 if (!isOpen) return null;
 return <dialog ref={ref} className={`${type === 'drawer' ? 'detail-dialog' : type === 'search' ? 'search-dialog' : 'modal-dialog'} dialog-${size} ${className}`} aria-labelledby={titleId} aria-describedby={subtitle ? descriptionId : undefined}
 onClickCapture={(event) => { if ((event.target as HTMLElement).closest('[data-dialog-dismiss]')) { event.preventDefault(); event.stopPropagation(); requestClose(); } }}
 onCancel={(event) => { event.preventDefault(); requestClose(); }}
 onClick={(event) => { if (event.target !== event.currentTarget || event.detail === 0) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose(); }}>
 <div className="dialog-head"><div><h2 id={titleId}>{title}</h2>{subtitle && <p id={descriptionId}>{subtitle}</p>}</div><button type="button" className="icon-btn" onClick={requestClose} disabled={pending} aria-label="Close dialog"><Icon name="close" /></button></div>
 <div className="dialog-body">{confirmClose ? <div className="page-stack"><h3>Discard unsaved changes?</h3><p>Your changes have not been saved.</p><div className="page-header-actions"><button type="button" className="btn" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" className="btn primary" onClick={onClose}>Discard changes</button></div></div> : children}</div>
 {!confirmClose && footer && <div className="dialog-actions">{footer}</div>}
 </dialog>;
}
