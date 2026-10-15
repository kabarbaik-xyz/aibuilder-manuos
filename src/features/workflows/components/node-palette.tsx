"use client";

import React from 'react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { WorkflowNodeType } from '@/domain/workflow-definition';

interface NodePaletteProps {
  onAddNode: (type: WorkflowNodeType) => void;
  disabled?: boolean;
}

export function NodePalette({ onAddNode, disabled }: NodePaletteProps) {
  return (
    <Panel className="p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
        Add Workflow Node
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="soft"
          size="small"
          onClick={() => onAddNode('OPERATION')}
          disabled={disabled}
          className="justify-start gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-primary" />
          + Operation Step
        </Button>
        <Button
          variant="soft"
          size="small"
          onClick={() => onAddNode('INSPECTION')}
          disabled={disabled}
          className="justify-start gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          + QC Inspection
        </Button>
        <Button
          variant="soft"
          size="small"
          onClick={() => onAddNode('APPROVAL')}
          disabled={disabled}
          className="justify-start gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          + Sign-off Approval
        </Button>
      </div>
    </Panel>
  );
}
