'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/api/query-keys';
import { apiRequest } from '@/lib/api/client';
import { Icon } from './icons';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { useGraphStore } from '../store/graph-store';

interface PrincipalData {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName?: string;
  membershipId: string;
  permissions: string[];
  roles: string[];
  customerId: string | null;
  technicianId: string | null;
}

export function AccountMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { closeNavMenu, closeModal } = useGraphStore();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [panel, setPanel] = useState<'profile' | 'settings' | 'logout' | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data: meResponse } = useQuery<{ data: PrincipalData }>({
    queryKey: queryKeys.me(),
    queryFn: () => apiRequest<{ data: PrincipalData }>('/api/me'),
    retry: false,
  });

  const principal = meResponse?.data;
  const name = principal?.name || 'Operator';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const rolesLabel = principal?.roles?.join(', ') || 'Staff';

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const openPanel = (next: 'profile' | 'settings' | 'logout') => {
    if (menuRef.current) menuRef.current.open = false;
    closeNavMenu();
    setPanel(next);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
      });
      queryClient.clear();
      closeNavMenu();
      closeModal();
      setPanel(null);
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <details className="account-menu" ref={menuRef}>
        <summary className="account-trigger" aria-label={`Account menu for ${name}`}>
          <span className="avatar">{initials}</span>
          <span className="account-trigger-name">{name}</span>
          <Icon name="down" />
        </summary>
        <div className="account-popover">
          <div className="account-identity">
            <strong>{name}</strong>
            <span>{rolesLabel} · {principal?.email || 'Active session'}</span>
          </div>
          <nav aria-label="Account">
            <button type="button" onClick={() => openPanel('profile')}>
              <Icon name="user" />
              Profile
            </button>
            <button type="button" onClick={() => openPanel('settings')}>
              <Icon name="settings" />
              Settings
            </button>
            <button type="button" className="account-logout" onClick={() => openPanel('logout')}>
              <Icon name="logout" />
              Sign out
            </button>
          </nav>
        </div>
      </details>

      {panel === 'profile' && (
        <Dialog isOpen onClose={() => setPanel(null)} title="Account Profile" type="modal">
          <div className="account-profile-heading mb-4 flex items-center gap-3">
            <span className="avatar text-base font-bold">{initials}</span>
            <div>
              <strong className="text-base font-semibold">{name}</strong>
              <p className="text-xs text-muted">{principal?.email}</p>
            </div>
          </div>
          <div className="spec-row">
            <span>Workspace</span>
            <strong>{principal?.workspaceName || 'Workspace'}</strong>
          </div>
          <div className="spec-row">
            <span>Roles</span>
            <strong>{rolesLabel}</strong>
          </div>
          {principal?.customerId && (
            <div className="spec-row">
              <span>Customer Scope</span>
              <strong>{principal.customerId}</strong>
            </div>
          )}
          {principal?.technicianId && (
            <div className="spec-row">
              <span>Technician Scope</span>
              <strong>{principal.technicianId}</strong>
            </div>
          )}
        </Dialog>
      )}

      {panel === 'settings' && (
        <Dialog isOpen onClose={() => setPanel(null)} title="Workspace Settings" type="modal">
          <div className="account-settings space-y-3">
            <p className="text-sm text-ink">
              Your workspace administrator manages your roles and access.
            </p>
            <div className="spec-row">
              <span>Email</span>
              <code className="text-xs font-mono">{principal?.email}</code>
            </div>
            <div className="spec-row">
              <span>Roles</span>
              <code className="text-xs font-mono">{rolesLabel}</code>
            </div>
          </div>
        </Dialog>
      )}

      {panel === 'logout' && (
        <Dialog
          isOpen
          onClose={() => setPanel(null)}
          title="Sign out of ManuOS?"
          type="modal"
          footer={
            <>
              <Button onClick={() => setPanel(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleLogout} disabled={isLoggingOut}>
                {isLoggingOut ? 'Signing out...' : 'Sign out'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink">
            You will be signed out of this session. You can sign in again using your email and password.
          </p>
        </Dialog>
      )}
    </>
  );
}
