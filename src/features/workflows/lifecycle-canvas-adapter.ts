import type { Edge, Node } from '@xyflow/react';
import type { LifecycleStageDefinition, OrderLifecycleDefinition } from '@/domain/order-lifecycle-definition';

export interface LifecycleCanvasNodeData extends Record<string, unknown> {
  stage: LifecycleStageDefinition;
  departmentName: string;
  stageNumber: number;
}

export interface LifecycleCanvasModel {
  nodes: Node<LifecycleCanvasNodeData>[];
  edges: Edge[];
}

function branchLabel(stage: LifecycleStageDefinition, sourceKey: string): string | undefined {
  const condition = stage.activationCondition;
  if (!condition || condition.sourceStageKey !== sourceKey) return undefined;
  if (condition.kind === 'QC_OUTCOME') {
    const outcomes = Array.isArray(condition.value) ? condition.value : [condition.value];
    return `QC: ${outcomes.map(outcome => outcome.replaceAll('_', ' ')).join(' / ')}`;
  }
  const value = Array.isArray(condition.value) ? condition.value.join(' / ') : condition.value;
  return `Form: ${condition.fieldKey} ${condition.operator === 'EQUALS' ? '=' : condition.operator === 'NOT_EQUALS' ? '≠' : 'in'} ${value}`;
}

/** Projects the saved lifecycle graph into a stable, read-only React Flow map. */
export function toLifecycleCanvas(
  definition: OrderLifecycleDefinition,
  departmentNames: Record<string, string>,
): LifecycleCanvasModel {
  const byKey = new Map(definition.stages.map(stage => [stage.key, stage]));
  const depthByKey = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (key: string): number => {
    const cached = depthByKey.get(key);
    if (cached !== undefined) return cached;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const stage = byKey.get(key);
    const depth = stage ? Math.max(-1, ...stage.predecessors.map(predecessor =>
      byKey.has(predecessor) ? depthOf(predecessor) : -1,
    )) + 1 : 0;
    visiting.delete(key);
    depthByKey.set(key, depth);
    return depth;
  };

  const stagesByDepth = new Map<number, LifecycleStageDefinition[]>();
  for (const stage of definition.stages) {
    const depth = depthOf(stage.key);
    stagesByDepth.set(depth, [...(stagesByDepth.get(depth) ?? []), stage]);
  }
  const stageNumbers = new Map(definition.stages.map((stage, index) => [stage.key, index + 1]));
  const nodes: Node<LifecycleCanvasNodeData>[] = definition.stages.map(stage => {
    const depth = depthByKey.get(stage.key) ?? 0;
    const peers = stagesByDepth.get(depth) ?? [];
    return {
      id: stage.key,
      type: 'lifecycleStage',
      position: { x: 48 + depth * 340, y: 48 + peers.findIndex(peer => peer.key === stage.key) * 190 },
      data: { stage, departmentName: departmentNames[stage.departmentId] ?? 'Department not set', stageNumber: stageNumbers.get(stage.key) ?? 0 },
    };
  });
  const edges: Edge[] = definition.stages.flatMap(stage => stage.predecessors
    .filter(predecessor => byKey.has(predecessor))
    .map(predecessor => ({
      id: `${predecessor}->${stage.key}`,
      source: predecessor,
      target: stage.key,
      type: 'smoothstep',
      label: branchLabel(stage, predecessor),
      labelStyle: { fill: '#52627b', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.96 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 6,
      style: { stroke: '#93a3bb', strokeWidth: 1.8 },
    })));

  return { nodes, edges };
}
