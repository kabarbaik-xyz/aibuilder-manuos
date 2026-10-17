import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { MemoryWorkbench } from '@/features/intelligence/components/MemoryWorkbench';
import { orderReturnHref } from '@/features/intelligence/memory-navigation';

export const metadata = { title: 'Factory memory | ManuOS' };

export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ itemId?: string; orderId?: string }> }) {
  const { itemId, orderId } = await searchParams;
  const returnHref = orderReturnHref(orderId);
  return (
    <div className="page-stack">
      <PageHeader title="Factory memory" description="Compare planned duration with recorded work sessions and finalized inspection evidence." actions={returnHref ? <Link href={returnHref} className="btn soft">Back to order</Link> : undefined} />
      <MemoryWorkbench initialItemId={itemId?.trim()} />
    </div>
  );
}
