'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useWorkflowTemplate, useWorkflowVersion } from '@/features/workflows/hooks';
import { useDepartments, useQcChecklists } from '@/features/masters/hooks';
import { DefinitionEditor } from '@/features/workflows/components/definition-editor';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

export default function WorkflowVersionPage() {
  const params = useParams();
  const templateId = params.id as string;
  const versionId = params.versionId as string;

  const { data: template, isPending: isTplPending, error: tplError, refetch: refetchTpl } =
    useWorkflowTemplate(templateId);

  const { data: version, isPending: isVerPending, error: verError, refetch: refetchVer } =
    useWorkflowVersion(templateId, versionId);

  const { data: deptsRes } = useDepartments();
  const departments = deptsRes?.data || [];
  const { data: qcRes } = useQcChecklists();
  const qcChecklists = qcRes?.data || [];

  if (isTplPending || isVerPending) {
    return <LoadingState message="Loading workflow routing…" />;
  }

  if (tplError || verError || !template || !version) {
    return (
      <ErrorState
        title="Failed to load workflow version"
        message="The requested template or version could not be found or access was denied."
        onRetry={() => {
          refetchTpl();
          refetchVer();
        }}
      />
    );
  }

  return (
    <div className="">
      <DefinitionEditor
        template={template}
        version={version}
        catalog={{
          departments,
          qcChecklists,
        }}
      />
    </div>
  );
}
