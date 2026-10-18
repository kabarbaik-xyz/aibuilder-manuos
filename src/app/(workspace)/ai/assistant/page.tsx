import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { WorkspaceAssistantPage } from '@/features/intelligence/components/WorkspaceAssistantPage';
import { orderReturnHref } from '@/features/intelligence/memory-navigation';

export const metadata = { title: 'Ask AI | ManuOS' };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ orderId?: string; orderNumber?: string; itemId?: string; taskId?: string }> }) {
  const params = await searchParams;
  const context = params.orderId
    ? { type: 'ORDER' as const, id: params.orderId }
    : params.itemId ? { type: 'ITEM' as const, id: params.itemId }
      : params.taskId ? { type: 'TASK' as const, id: params.taskId } : undefined;
  const orderHref = orderReturnHref(params.orderId);
  return (
    <div className="page-stack">
      <PageHeader
        title="Ask AI"
        description="Ask about orders, inventory, and production. Answers are grounded in records you can access."
        actions={orderHref ? <Link href={orderHref} className="btn soft">Back to order</Link> : undefined}
      />
      <WorkspaceAssistantPage context={context} contextLabel={params.orderId ? params.orderNumber : undefined} />
    </div>
  );
}
