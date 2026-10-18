'use client';

import { useFormInstancesForSubject } from '../hooks';
import { SubmissionPanel } from './submission-panel';

export function SubjectFormEvidence({
  subjectType,
  subjectId,
  title,
  description,
}: {
  subjectType: 'ORDER' | 'TASK' | 'INSPECTION';
  subjectId: string;
  title?: string;
  description?: string;
}) {
  const { data, isPending, error } = useFormInstancesForSubject(subjectType, subjectId);
  if (isPending) return <p className="text-sm text-muted">Loading stage form…</p>;
  if (error) return <p className="text-sm text-danger">Stage form failed to load.</p>;
  if (!data?.data.length) return null;

  return (
    <section aria-labelledby={`subject-form-title-${subjectId}`} className="space-y-3">
      <div>
        <h2 id={`subject-form-title-${subjectId}`} className="text-sm font-semibold text-ink">{title ?? 'Stage form & evidence'}</h2>
        <p className="mt-1 text-xs text-muted">{description ?? 'This form follows the workflow version used when the job was created.'}</p>
      </div>
      {data.data.map(({ instance }) => <SubmissionPanel key={instance.id} instanceId={instance.id} />)}
    </section>
  );
}
