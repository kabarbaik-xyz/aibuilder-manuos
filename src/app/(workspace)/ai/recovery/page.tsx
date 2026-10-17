import { PageHeader } from '@/components/ui/page-header';
import { RecoveryInbox } from '@/features/intelligence/components/RecoveryInbox';
import { RecoverySubcontractManager } from '@/features/intelligence/components/RecoverySubcontractManager';

export const metadata = { title: 'Recovery proposals | ManuOS' };

export default function RecoveryPage() {
  return <div className="page-stack"><PageHeader title="Recovery proposals" description="Review saved disruption simulations, alternate schedules, and subcontract recovery." /><RecoverySubcontractManager /><RecoveryInbox /></div>;
}
