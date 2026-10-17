import { PageHeader } from '@/components/ui/page-header';
import { RecoveryInbox } from '@/features/intelligence/components/RecoveryInbox';

export const metadata = { title: 'Recovery proposals | ManuOS' };

export default function RecoveryPage() {
  return <div className="page-stack"><PageHeader title="Recovery proposals" description="Review saved disruption simulations and their current decision status." /><RecoveryInbox /></div>;
}
