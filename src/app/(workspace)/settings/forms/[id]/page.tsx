'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useFormTemplate } from '@/features/forms/hooks';
import { FormDefinitionEditor } from '@/features/forms/components/definition-editor';

export default function TemplateEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: templateRes, isLoading, error } = useFormTemplate(id);

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted">Loading form template…</div>;
  }

  if (error || !templateRes?.data) {
    return <div className="p-8 text-center text-sm text-danger">Failed to load form template.</div>;
  }

  const template = templateRes.data;
  const latestVersion = template.versions[0];

  if (!latestVersion) {
    return <div className="p-8 text-center text-sm text-muted">No version found for this template.</div>;
  }

  return (
    <div className="page-stack">
      <FormDefinitionEditor template={template} version={latestVersion} />
    </div>
  );
}
