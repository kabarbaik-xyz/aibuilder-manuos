'use client';

import { ButtonLink } from '@/components/ui/button-link';
import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';

export default function PlanningTaskError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-stack">
      <PageHeader
        title="Planning detail unavailable"
        description="We couldn’t load this task’s planning information."
      />
      <ErrorState
        title="Unable to load planning task"
        message="Try again. If the problem continues, return to the production schedule."
        onRetry={reset}
      />
      <ButtonLink href="/planning">Back to planning</ButtonLink>
    </div>
  );
}
