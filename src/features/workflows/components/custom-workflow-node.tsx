"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { WorkflowNodeDefinition } from "@/domain/workflow-definition";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";

export const CustomWorkflowNode = memo(function CustomWorkflowNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeDefinition }) {
  const isOp = data.type === "OPERATION";
  const isQc = data.type === "INSPECTION";
  const isApp = data.type === "APPROVAL";

  const badgeVariant = isOp ? "blue" : isQc ? "warning" : "default";

  return (
    <div
      className={`min-w-50 max-w-60 rounded-lg border bg-surface p-3 shadow-xs transition-shadow duration-150 ${
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-line hover:border-line-dark"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-3 w-3 rounded-full border-2 border-surface bg-primary"
      />

      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge
          variant={badgeVariant}
          className="text-[10px] font-bold uppercase tracking-wider"
        >
          {data.type}
        </Badge>
        <span className="text-[11px] font-mono text-muted">{data.key}</span>
      </div>

      <div
        className="font-semibold text-xs text-ink truncate mb-1"
        title={data.name}
      >
        {data.name}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-line">
        <span className="flex items-center gap-1">
          <Icon name="clock" className="h-3 w-3" />
          {data.plannedDurationMinutes}m
        </span>
        {data.formGuard && (
          <span
            className="flex items-center gap-0.5 text-primary"
            title="Form Binding Attached"
          >
            <Icon name="file" className="h-3 w-3" />
            QC
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="h-3 w-3 rounded-full border-2 border-surface bg-primary"
      />
    </div>
  );
});
