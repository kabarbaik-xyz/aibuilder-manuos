'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PERSONA_PROFILES, PersonaType } from '../lib/navigation';
import { useGraphStore } from '../store/graph-store';
import { Icon } from './icons';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

export function AccountMenu() {
  const { currentPersona, setPersona, closeNavMenu, closeModal } = useGraphStore();
  const profile = PERSONA_PROFILES[currentPersona];
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [panel, setPanel] = useState<'profile' | 'settings' | 'logout' | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

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

  return (
    <>
      <details className="account-menu" ref={menuRef}>
        <summary className="account-trigger" aria-label={`Account menu for ${profile.name}`}>
          <span className="avatar">{profile.avatar}</span>
          <span className="account-trigger-name">{profile.name}</span>
          <Icon name="down" />
        </summary>
        <div className="account-popover">
          <div className="account-identity">
            <strong>{profile.name}</strong>
            <span>{currentPersona} · Precision Works</span>
          </div>
          <nav aria-label="Account">
            <button type="button" onClick={() => openPanel('profile')}><Icon name="user" />Profile</button>
            <button type="button" onClick={() => openPanel('settings')}><Icon name="settings" />Settings</button>
            <button type="button" className="account-logout" onClick={() => openPanel('logout')}><Icon name="logout" />Logout</button>
          </nav>
        </div>
      </details>

      {panel === 'profile' && (
        <Dialog isOpen onClose={() => setPanel(null)} title="Profile" type="modal">
          <div className="account-profile-heading">
            <span className="avatar">{profile.avatar}</span>
            <div><strong>{profile.name}</strong><p>{profile.role}</p></div>
          </div>
          <div className="spec-row"><span>Workspace</span><strong>Precision Works</strong></div>
          <div className="spec-row"><span>Persona</span><strong>{currentPersona}</strong></div>
        </Dialog>
      )}

      {panel === 'settings' && (
        <Dialog isOpen onClose={() => setPanel(null)} title="Settings" type="modal">
          <div className="account-settings">
            <label htmlFor="account-persona">Demo persona</label>
            <p>Switch the role used to explore this workspace.</p>
            <select id="account-persona" value={currentPersona} onChange={(event) => setPersona(event.target.value as PersonaType)}>
              {Object.keys(PERSONA_PROFILES).map((persona) => <option key={persona} value={persona}>{persona}</option>)}
            </select>
          </div>
        </Dialog>
      )}

      {panel === 'logout' && (
        <Dialog isOpen onClose={() => setPanel(null)} title="End demo session?" type="modal"
          footer={<><Button onClick={() => setPanel(null)}>Cancel</Button><Button variant="primary" onClick={() => {
            closeNavMenu();
            closeModal();
            setPanel(null);
            setSessionEnded(true);
          }}>End demo session</Button></>}>
          <p>This workspace uses a demo session. You can return to the demo at any time.</p>
        </Dialog>
      )}

      {sessionEnded && (
        <Dialog isOpen onClose={() => setSessionEnded(false)} title="Demo session ended" type="modal"
          footer={<Button variant="primary" onClick={() => setSessionEnded(false)}>Return to demo</Button>}>
          <p>Your demo workspace is ready whenever you want to continue.</p>
        </Dialog>
      )}
    </>
  );
}
