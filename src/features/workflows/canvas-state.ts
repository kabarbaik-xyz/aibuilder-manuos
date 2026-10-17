import type { Node } from '@xyflow/react';
import type { WorkflowDefinition } from '@/domain/workflow-definition';
import type { CanvasNodeData } from './canvas-adapter';

/** Keep React Flow measurements while replacing stale domain data and membership. */
export function reconcileWorkflowNodes(projected: Node<CanvasNodeData>[], current: Node<CanvasNodeData>[], selectedKey?: string | null): Node<CanvasNodeData>[] {
  const previous = new Map(current.map(node => [node.id, node]));
  return projected.map(node => ({ ...previous.get(node.id), ...node, selected: node.id === selectedKey }));
}

/** Both canvas handles and the dependency dialog enforce the same DAG contract. */
export function connectWorkflowSteps(definition: WorkflowDefinition, from: string, to: string): { definition?: WorkflowDefinition; error?: string } {
  if (!definition.nodes.some(node => node.key === from) || !definition.nodes.some(node => node.key === to)) return { error: 'Choose two existing steps.' };
  if (from === to) return { error: 'A step cannot depend on itself.' };
  if (definition.edges.some(edge => edge.fromNodeKey === from && edge.toNodeKey === to)) return { error: 'These steps are already connected.' };
  const pending = [to];
  const visited = new Set<string>();
  while (pending.length) {
    const key = pending.pop()!;
    if (key === from) return { error: 'This connection would create a dependency cycle.' };
    if (visited.has(key)) continue;
    visited.add(key);
    for (const edge of definition.edges) if (edge.fromNodeKey === key) pending.push(edge.toNodeKey);
  }
  return { definition: { ...definition, edges: [...definition.edges, { fromNodeKey: from, toNodeKey: to, joinPolicy: 'AND' }] } };
}
