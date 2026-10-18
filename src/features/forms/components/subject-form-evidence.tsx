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
  if (isPending) return <p className="text-sm text-muted">Memuat formulir tahap…</p>;
  if (error) return <p className="text-sm text-danger">Form tahap gagal dimuat.</p>;
  if (!data?.data.length) return null;

  return (
    <section aria-labelledby={`subject-form-title-${subjectId}`} className="space-y-3">
      <div>
        <h2 id={`subject-form-title-${subjectId}`} className="text-sm font-semibold text-ink">{title ?? 'Formulir & bukti tahap'}</h2>
        <p className="mt-1 text-xs text-muted">{description ?? 'Form ini mengikuti versi workflow yang dipakai saat pekerjaan dibuat.'}</p>
      </div>
      {data.data.map(({ instance }) => <SubmissionPanel key={instance.id} instanceId={instance.id} />)}
    </section>
  );
}
