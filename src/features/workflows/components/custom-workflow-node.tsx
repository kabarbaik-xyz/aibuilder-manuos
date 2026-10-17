"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { WorkflowNodeDefinition } from "@/domain/workflow-definition";
import { Icon } from "@/components/icons";

export const CustomWorkflowNode = memo(function CustomWorkflowNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeDefinition }) {
  const isOp = data.type === "OPERATION";
  const isQc = data.type === "INSPECTION";

  return (
    <div
      className={`wf-node wf-node--${data.type.toLowerCase()} ${selected ? 'is-selected' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        title="Incoming dependencies"
        className="h-3 w-3 rounded-full border-2 border-surface bg-primary"
      />

      <div className="wf-node-heading">
        <span className={`wf-node-symbol ${isQc ? 'is-inspection' : ''}`}><Icon name={isOp ? 'work' : isQc ? 'shield' : 'check'} /></span>
        <span className="wf-node-kind">{isOp ? 'Operation' : isQc ? 'Inspection' : 'Approval'}</span>
        <span className="wf-node-key">{data.key}</span>
      </div>
      <div className="wf-node-name" title={data.name}>{data.name}</div>
      <div className="wf-node-meta">
        <div className="wf-node-duration"><Icon name="clock" /><span><small>Planned duration</small><strong>{data.plannedDurationMinutes} min</strong></span></div>
        {data.formGuard && <span className="wf-node-binding" title="QC binding attached"><Icon name="file" />QC binding</span>}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        title="Outgoing dependencies"
        className="h-3 w-3 rounded-full border-2 border-surface bg-primary"
      />
    </div>
  );
});
