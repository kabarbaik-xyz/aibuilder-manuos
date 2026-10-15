"use client";

import React from 'react';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { WorkflowNodeDefinition, WorkflowNodeType } from '@/domain/workflow-definition';

interface NodeInspectorProps {
  node: WorkflowNodeDefinition | null;
  onChange: (updated: WorkflowNodeDefinition) => void;
  onDelete: (key: string) => void;
  catalog?: {
    departments?: Array<{ id: string; name: string }>;
    qcChecklists?: Array<{ id: string; name: string }>;
  };
  readOnly?: boolean;
}

export function NodeInspector({
  node,
  onChange,
  onDelete,
  catalog,
  readOnly,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <Panel className="p-4 text-center">
        <p className="text-xs text-muted">Select a node on the canvas to configure properties.</p>
      </Panel>
    );
  }

  return (
    <Panel className="p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <span className="font-semibold text-xs uppercase tracking-wider text-ink">
          Node Properties
        </span>
        {!readOnly && (
          <Button
            variant="soft"
            size="small"
            onClick={() => onDelete(node.key)}
            className="text-danger hover:bg-danger-soft"
          >
            Delete
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-ink block mb-1">Node Key</label>
          <Input value={node.key} disabled />
        </div>

        <div>
          <label className="text-xs font-medium text-ink block mb-1">Node Name</label>
          <Input
            value={node.name}
            onChange={(e) => onChange({ ...node, name: e.target.value })}
            disabled={readOnly}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink block mb-1">Step Type</label>
          <Select
            value={node.type}
            onChange={(e) => onChange({ ...node, type: e.target.value as WorkflowNodeType })}
            disabled={readOnly}
          >
            <option value="OPERATION">OPERATION</option>
            <option value="INSPECTION">INSPECTION</option>
            <option value="APPROVAL">APPROVAL</option>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-ink block mb-1">Planned Duration (min)</label>
          <Input
            type="number"
            min={1}
            value={node.plannedDurationMinutes}
            onChange={(e) =>
              onChange({ ...node, plannedDurationMinutes: parseInt(e.target.value, 10) || 1 })
            }
            disabled={readOnly}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink block mb-1">Department</label>
          <Select
            value={node.departmentId || ''}
            onChange={(e) => onChange({ ...node, departmentId: e.target.value || undefined })}
            disabled={readOnly}
          >
            <option value="">No Department Assigned</option>
            {catalog?.departments?.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        </div>

        {node.type === 'INSPECTION' && (
          <div>
            <label className="text-xs font-medium text-ink block mb-1">QC Checklist</label>
            <Select
              value={node.formGuard?.qcChecklistId || ''}
              onChange={(e) =>
                onChange({
                  ...node,
                  formGuard: e.target.value ? { qcChecklistId: e.target.value } : undefined,
                })
              }
              disabled={readOnly}
            >
              <option value="">No Checklist Binding</option>
              {catalog?.qcChecklists?.map((chk) => (
                <option key={chk.id} value={chk.id}>
                  {chk.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </Panel>
  );
}
