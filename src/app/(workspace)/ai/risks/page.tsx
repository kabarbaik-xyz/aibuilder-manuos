import { PageHeader } from '@/components/ui/page-header';
import { RiskInbox } from '@/features/intelligence/components/RiskInbox';

export const metadata = { title: 'Risk inbox | ManuOS' };

export default function RisksPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Risk inbox"
        description="Review current operational exceptions and follow each one to its source record."
      />
      <RiskInbox />
    </div>
  );
}
