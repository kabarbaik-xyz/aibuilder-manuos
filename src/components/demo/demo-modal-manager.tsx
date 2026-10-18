 'use client';

import { useUiStore } from '@/store/ui-store';
import { Dialog } from '@/components/ui/dialog';
import { MemoryModal } from '@/features/memory/memory-modal';
import { AuditModal } from '@/features/command-center/audit-modal';
import { DemoWorkflowPreview, DemoPassport, DemoSourceEvidence } from './demo-workflow-preview';
import { DemoAskAI } from './demo-ask-ai';
import { DemoSearch } from './demo-search';

/** Public demo dialogs use session records only; private workspace APIs are not mounted. */
export function DemoModalManager() {
  const { activeModal, modalData, closeModal } = useUiStore();
  if (!activeModal) return null;
  const workflows: Record<string, { capability: string; title: string }> = {
    recovery: { capability: 'AII-06', title: 'Recovery workflow' },
    promise: { capability: 'AII-04', title: 'Delivery-date review workflow' },
    intake: { capability: 'AII-03', title: 'RFQ intake workflow' },
  };
  const workflow = workflows[activeModal];
  return <>
    {activeModal === 'brain' && <Dialog type="drawer" isOpen onClose={closeModal} title="Ask AI" subtitle="Explore sample records with source-linked, read-only summaries." className="dialog-drawer-chat"><DemoAskAI /></Dialog>}
    {activeModal === 'search' && <Dialog type="search" isOpen onClose={closeModal} title="Search demo workspace"><DemoSearch /></Dialog>}
    {activeModal === 'demo-source' && <Dialog type="drawer" isOpen onClose={closeModal} title={modalData?.label ?? 'Demo evidence'} subtitle="Source record"><DemoSourceEvidence id={modalData?.id ?? ''} screen={modalData?.screen ?? ''} /></Dialog>}
    {activeModal === 'passport' && <Dialog type="drawer" isOpen onClose={closeModal} title="Manufacturing passport" subtitle={modalData?.serial ?? 'Sample traceability evidence'}><DemoPassport serial={modalData?.serial ?? ''} /></Dialog>}
    {activeModal === 'memory' && <Dialog type="drawer" isOpen onClose={closeModal} title="Factory memory" subtitle="Sample production history"><MemoryModal /></Dialog>}
    {activeModal === 'audit' && <Dialog type="drawer" isOpen onClose={closeModal} title="Activity log" subtitle="This demo session"><AuditModal /></Dialog>}
    {workflow && <Dialog type="modal" size="md" isOpen onClose={closeModal} title={workflow.title} subtitle="Operational workspace walkthrough"><DemoWorkflowPreview capability={workflow.capability} /></Dialog>}
  </>;
}
