'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useFormTemplate } from '@/features/forms/hooks';
import { FormDefinitionEditor } from '@/features/forms/components/definition-editor';

export default function FormVersionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const versionId = params.versionId as string;
  const { data: templateRes, isLoading, error } = useFormTemplate(id);

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted">Loading form version…</div>;
  }

  if (error || !templateRes?.data) {
    return <div className="p-8 text-center text-sm text-danger">Failed to load form version.</div>;
  }

  const template = templateRes.data;
  const version = template.versions.find((v) => v.id === versionId);

  if (!version) {
    return <div className="p-8 text-center text-sm text-muted">Requested version not found.</div>;
  }

  return (
    <div className="page-stack">
      <FormDefinitionEditor template={template} version={version} />
    </div>
  );
}
