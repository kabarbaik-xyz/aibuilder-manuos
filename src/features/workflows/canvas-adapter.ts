import { WorkflowDefinition, WorkflowNodeDefinition, WorkflowEdgeDefinition } from '@/domain/workflow-definition';
import type { Node, Edge } from '@xyflow/react';

export type CanvasNodeData = WorkflowNodeDefinition & Record<string, unknown>;

export interface WorkflowCanvasLayout {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface CanvasModel {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  layout: WorkflowCanvasLayout;
}

/**
 * Transforms a domain WorkflowDefinition + layout into React Flow nodes and edges.
 * If layout positions are not provided for a node, an automatic grid placement is assigned.
 */
export function toCanvas(
  definition: WorkflowDefinition,
  layout?: WorkflowCanvasLayout
): CanvasModel {
  const positions = layout?.positions || {};
  const nodes: Node<CanvasNodeData>[] = definition.nodes.map((node, index) => {
    const defaultX = (index % 3) * 280 + 50;
    const defaultY = Math.floor(index / 3) * 160 + 50;
    const pos = positions[node.key] || { x: defaultX, y: defaultY };

    return {
      id: node.key,
      type: 'customWorkflowNode',
      position: pos,
      data: { ...node } as CanvasNodeData,
    };
  });

  const edges: Edge[] = definition.edges.map((edge) => ({
    id: `${edge.fromNodeKey}->${edge.toNodeKey}`,
    source: edge.fromNodeKey,
    target: edge.toNodeKey,
    animated: false,
    data: {
      joinPolicy: edge.joinPolicy,
      conditionCode: edge.conditionCode,
      conditionParams: edge.conditionParams,
    },
  }));

  return {
    nodes,
    edges,
    layout: {
      positions: nodes.reduce((acc, n) => {
        acc[n.id] = { x: n.position.x, y: n.position.y };
        return acc;
      }, {} as Record<string, { x: number; y: number }>),
      viewport: layout?.viewport,
    },
  };
}

/**
 * Transforms React Flow nodes and edges back into an authoritative domain WorkflowDefinition.
 * Strips out React-specific state, callbacks, and selections.
 */
export function fromCanvas(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  existingName: string = 'Workflow Definition'
): { definition: WorkflowDefinition; layout: WorkflowCanvasLayout } {
  const domainNodes: WorkflowNodeDefinition[] = nodes.map((n) => ({
    key: n.data.key || n.id,
    name: n.data.name || n.id,
    type: n.data.type || 'OPERATION',
    plannedDurationMinutes: n.data.plannedDurationMinutes ?? 60,
    departmentId: n.data.departmentId,
    requiredPermission: n.data.requiredPermission,
    requirements: n.data.requirements,
    formGuard: n.data.formGuard,
  }));

  const domainEdges: WorkflowEdgeDefinition[] = edges.map((e) => ({
    fromNodeKey: e.source,
    toNodeKey: e.target,
    joinPolicy: (e.data?.joinPolicy as 'AND') || 'AND',
    conditionCode: e.data?.conditionCode as string | undefined,
    conditionParams: e.data?.conditionParams as Record<string, any> | undefined,
  }));

  const layout: WorkflowCanvasLayout = {
    positions: nodes.reduce((acc, n) => {
      acc[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      return acc;
    }, {} as Record<string, { x: number; y: number }>),
  };

  return {
    definition: {
      schemaVersion: 1,
      name: existingName,
      nodes: domainNodes,
      edges: domainEdges,
    },
    layout,
  };
}
