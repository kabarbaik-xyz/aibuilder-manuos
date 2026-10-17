import { PageHeader } from '@/components/ui/page-header';
import { RiskDetailView } from '@/features/intelligence/components/RiskDetailView';

export const metadata = { title: 'Risk evidence | ManuOS' };

export default async function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-stack">
      <PageHeader title="Risk evidence" description="Resolve the current authorized source record and review why it was surfaced." />
      <RiskDetailView id={id} />
    </div>
  );
}
