'use client';

import { useMemo } from 'react';
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LifecycleAction, OrderLifecycleDefinition } from '@/domain/order-lifecycle-definition';
import { toLifecycleCanvas, type LifecycleCanvasNodeData } from '../lifecycle-canvas-adapter';

const actionLabels: Record<LifecycleAction, string> = {
  ORDER_CONFIRM: 'Confirm customer order',
  ENGINEERING_APPROVE: 'Approve engineering',
  PLAN_PRODUCTION: 'Plan production capacity',
  EXECUTE_PRODUCTION: 'Execute production',
  FINALIZE_QC: 'Complete final inspection',
  CONFIRM_DELIVERY: 'Confirm customer delivery',
  REVIEW_EVIDENCE: 'Review evidence',
};

function LifecycleStageNode({ data }: NodeProps & { data: LifecycleCanvasNodeData }) {
  const { stage, departmentName, stageNumber } = data;
  const assignment = stage.assignment.kind === 'MEMBER' ? 'Assigned person' : 'Department queue';
  const requiredForms = stage.forms.filter(form => form.required).length;

  return <article className="lifecycle-map-node">
    <Handle type="target" position={Position.Left} className="lifecycle-map-handle" />
    <div className="lifecycle-map-node-topline"><span>STAGE {String(stageNumber).padStart(2, '0')}</span><span>{stage.key}</span></div>
    <h3 title={stage.name}>{stage.name || 'Untitled stage'}</h3>
    <p className="lifecycle-map-action">{actionLabels[stage.action]}</p>
    <div className="lifecycle-map-meta"><span>{departmentName}</span><span>{assignment}</span></div>
    <div className="lifecycle-map-tags">
      <span>{stage.schedule.kind === 'RESOURCE_CAPACITY' ? 'Capacity scheduled' : `${stage.schedule.dueAfterMinutes} min deadline`}</span>
      <span>{stage.forms.length ? `${requiredForms} required form${requiredForms === 1 ? '' : 's'}` : 'No form'}</span>
    </div>
    <Handle type="source" position={Position.Right} className="lifecycle-map-handle" />
  </article>;
}

const nodeTypes = { lifecycleStage: LifecycleStageNode };

export function LifecycleWorkflowMap({
  definition,
  departmentNames,
  onSelectStage,
}: {
  definition: OrderLifecycleDefinition;
  departmentNames: Record<string, string>;
  onSelectStage: (stageKey: string) => void;
}) {
  const { nodes, edges } = useMemo(() => toLifecycleCanvas(definition, departmentNames), [definition, departmentNames]);

  return <section className="lifecycle-map-panel" aria-label="Workflow node map">
    <header className="lifecycle-map-header">
      <div><h2>Workflow map</h2><p className="field-help">Ikuti alur lintas departemen dan percabangannya. Pilih node untuk membuka pengaturan stage.</p></div>
      <div className="lifecycle-map-counts"><span>{nodes.length} stage</span><span>{edges.length} handoff</span></div>
    </header>
    {nodes.length ? <div className="lifecycle-map-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.3}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, node) => onSelectStage(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
        {nodes.length > 5 && <MiniMap pannable zoomable nodeStrokeWidth={3} />}
        <Background gap={22} size={1} color="#e1e7f0" />
      </ReactFlow>
    </div> : <div className="lifecycle-map-empty">Add a stage to see the workflow map.</div>}
  </section>;
}
