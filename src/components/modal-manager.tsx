'use client';

import React from 'react';
import { useGraphStore } from '../store/graph-store';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { Dialog } from './ui/dialog';
import { RecoveryStudio } from '../features/recovery/recovery-studio';
import { PromiseModal } from '../features/promise/promise-modal';
import { IntakeModal } from '../features/intake/intake-modal';
import { WorkspaceBrainDrawer } from '../features/brain/workspace-brain-drawer';
import { BrainDrawer } from '../features/brain/brain-drawer';
import { MemoryModal } from '../features/memory/memory-modal';
import { PassportModal } from '../features/passport/passport-modal';
import { DealModal } from '../features/network/deal-modal';
import { EventModal } from '../features/orchestrator/event-modal';
import { AuditModal } from '../features/command-center/audit-modal';
import { SearchDialog } from './search-dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function ModalManager() {
  const { isDemo } = useWorkspaceNavigation();
  const { activeModal, modalData, closeModal, setScreen } = useGraphStore();

  if (!activeModal) return null;
  if (!isDemo && activeModal === 'brain') {
    return <Dialog isOpen onClose={closeModal} title="Ask ManuOS" subtitle="Your production workspace, explained." type="drawer" className="dialog-drawer-chat"><WorkspaceBrainDrawer /></Dialog>;
  }
  if (!isDemo) {
    return <Dialog isOpen onClose={closeModal} title={activeModal === 'search' ? 'Find a page' : 'Ask ManuOS'} type={activeModal === 'search' ? 'search' : 'drawer'}>{activeModal === 'search' ? <SearchDialog/> : <div className="page-stack"><Badge variant="default">Unavailable</Badge><h3>Production intelligence is not connected yet</h3><p className="muted">Workspace answers will appear here when intelligence is connected to your operational records.</p></div>}</Dialog>;
  }

  return (
    <>
      {activeModal === 'recovery' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Review recovery"
          subtitle="Order #CO-2026-1042 · Terminal block delay"
        >
          <RecoveryStudio />
        </Dialog>
      )}

      {activeModal === 'promise' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Can we promise this?"
          subtitle="Check a requested delivery before committing."
        >
          <PromiseModal />
        </Dialog>
      )}

      {activeModal === 'intake' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="New order intake"
          subtitle="Paste the request. Review the draft before creating an order."
        >
          <IntakeModal />
        </Dialog>
      )}

      {activeModal === 'brain' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Ask ManuOS"
          subtitle="A quick answer grounded in the active shop-floor state."
          className="dialog-drawer-chat"
        >
          <BrainDrawer />
        </Dialog>
      )}

      {activeModal === 'memory' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Factory memory"
          subtitle="Bracket family · Press bending"
        >
          <MemoryModal />
        </Dialog>
      )}

      {activeModal === 'passport' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Manufacturing passport"
          subtitle={modalData?.serial || 'Pilih nomor seri yang tercatat'}
        >
          <PassportModal serial={modalData?.serial || ''} />
        </Dialog>
      )}

      {activeModal === 'deal' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title={modalData?.capacity ? 'Review capacity match' : 'Review material proposal'}
          subtitle={
            modalData?.capacity
              ? 'Batam CNC Hub · CNC machining'
              : 'Nusantara Metalcraft · Terminal blocks'
          }
        >
          <DealModal capacity={modalData?.capacity} />
        </Dialog>
      )}

      {activeModal === 'event' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Simulate an event"
          subtitle="Explore the material-delay scenario."
        >
          <EventModal />
        </Dialog>
      )}

      {activeModal === 'audit' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Activity log"
          subtitle="This demo session"
        >
          <AuditModal />
        </Dialog>
      )}

      {activeModal === 'search' && (
        <Dialog
          type="search"
          isOpen
          onClose={closeModal}
          title="Go to a workspace"
        >
          <SearchDialog />
        </Dialog>
      )}

      {activeModal === 'factory-info' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Precision Works"
          subtitle="Demo factory profile"
        >
          <div>
            <div className="spec-row">
              <span>Order type</span>
              <strong>Custom make-to-order</strong>
            </div>
            <div className="spec-row">
              <span>Network role</span>
              <strong>Producer & buyer</strong>
            </div>
            <div className="spec-row">
              <span>Capacity sharing</span>
              <Badge variant="success">Opted in</Badge>
            </div>
            <div className="spec-row">
              <span>Supply sharing</span>
              <Badge variant="success">Opted in</Badge>
            </div>
            <p className="approval-note">
              This is a fictional workspace for the ManuOS demo.
            </p>
          </div>
        </Dialog>
      )}

      {activeModal === 'record-output' && (
        <Dialog
          type="drawer"
          isOpen
          onClose={closeModal}
          title="Record output"
          subtitle="T3 · CNC finish machining"
        >
          <div>
            <div className="field">
              <label htmlFor="record-units-input">Completed units to add</label>
              <input
                id="record-units-input"
                type="number"
                min={1}
                max={38}
                defaultValue={1}
              />
              <span className="hint">
                38 units remain uncompleted. Recorded output still requires inspection by QC.
              </span>
            </div>
            <div className="dialog-actions mt">
              <Button variant="default" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon="check"
                onClick={() => {
                  const el = document.getElementById(
                    'record-units-input'
                  ) as HTMLInputElement;
                  const qty = Number(el?.value || 1);
                  useGraphStore.getState().recordOutput('T3', qty);
                  closeModal();
                }}
              >
                Record units
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
