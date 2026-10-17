"use client";

import React from 'react';
import { Panel } from '@/components/ui/panel';
import { Icon } from '@/components/icons';
import { WorkflowNodeType } from '@/domain/workflow-definition';

interface NodePaletteProps {
  onAddNode: (type: WorkflowNodeType) => void;
  disabled?: boolean;
}

export function NodePalette({ onAddNode, disabled }: NodePaletteProps) {
  return (
    <Panel className="wf-palette">
      <div className="wf-sidebar-heading"><h2>Add a step</h2><Icon name="plus" /></div>
      <div className="wf-palette-options">
        {([
          { type: 'OPERATION', name: 'Operation', detail: 'Production task', icon: 'work' },
          { type: 'INSPECTION', name: 'Inspection', detail: 'Quality checkpoint', icon: 'shield' },
          { type: 'APPROVAL', name: 'Approval', detail: 'Review and sign-off', icon: 'check' },
        ] as const).map((item) => <button type="button" key={item.type} onClick={() => onAddNode(item.type)} disabled={disabled}><span className="wf-palette-icon"><Icon name={item.icon} /></span><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name="plus" /></button>)}
      </div>
    </Panel>
  );
}
