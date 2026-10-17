import { PageHeader } from '@/components/ui/page-header';
import { MemoryWorkbench } from '@/features/intelligence/components/MemoryWorkbench';

export const metadata = { title: 'Factory memory | ManuOS' };

export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ itemId?: string }> }) {
  const { itemId } = await searchParams;
  return (
    <div className="page-stack">
      <PageHeader title="Factory memory" description="Compare planned duration with recorded work sessions and finalized inspection evidence." />
      <MemoryWorkbench initialItemId={itemId?.trim()} />
    </div>
  );
}
