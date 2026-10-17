import { PageHeader } from '@/components/ui/page-header';
import { WorkspaceAssistantPage } from '@/features/intelligence/components/WorkspaceAssistantPage';

export const metadata = { title: 'Ask AI | ManuOS' };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ orderId?: string; itemId?: string; taskId?: string }> }) {
  const params = await searchParams;
  const context = params.orderId
    ? { type: 'ORDER' as const, id: params.orderId }
    : params.itemId ? { type: 'ITEM' as const, id: params.itemId }
      : params.taskId ? { type: 'TASK' as const, id: params.taskId } : undefined;
  return (
    <div className="page-stack">
      <PageHeader
        title="Ask AI"
        description="Ask about orders, inventory, and production. Answers are grounded in records you can access."
      />
      <WorkspaceAssistantPage context={context} />
    </div>
  );
}
