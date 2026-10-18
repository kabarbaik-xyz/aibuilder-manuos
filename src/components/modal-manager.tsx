'use client';

import React from 'react';
import { useUiStore } from '../store/ui-store';
import { Dialog } from './ui/dialog';
import { WorkspaceBrainDrawer } from '../features/brain/workspace-brain-drawer';
import { SearchDialog } from './search-dialog';
import { Badge } from './ui/badge';

/**
 * Production modal manager. Handles the two workspace modals (AI brain drawer
 * and search) plus an honest fallback for unknown kinds. The demo simulation
 * registers its own modals in `demo/demo-modal-manager.tsx`.
 */
export function ModalManager() {
  const { activeModal, closeModal } = useUiStore();

  if (!activeModal) return null;

  if (activeModal === 'brain') {
    return (
      <Dialog
        isOpen
        onClose={closeModal}
        title="Ask AI"
        subtitle="Your production workspace, explained."
        type="drawer"
        className="dialog-drawer-chat"
      >
        <WorkspaceBrainDrawer />
      </Dialog>
    );
  }

  if (activeModal === 'search') {
    return (
      <Dialog isOpen onClose={closeModal} title="Find a page" type="search">
        <SearchDialog />
      </Dialog>
    );
  }

  return (
    <Dialog isOpen onClose={closeModal} title="Ask AI" type="drawer">
      <div className="page-stack">
        <Badge variant="default">Unavailable</Badge>
        <h3>Production intelligence is not connected yet</h3>
        <p className="muted">
          Workspace answers will appear here when intelligence is connected to your
          operational records.
        </p>
      </div>
    </Dialog>
  );
}
