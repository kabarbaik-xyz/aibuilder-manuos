import { EmptyState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';

export default function PlanningTaskNotFound() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Planning task not found"
        description="This task may have been removed or belongs to another workspace."
      />
      <EmptyState
        title="No planning detail available"
        description="Return to the production schedule and open a task that is still available."
        icon="calendar"
        action={<ButtonLink href="/planning" variant="primary">Back to planning</ButtonLink>}
      />
    </div>
  );
}
