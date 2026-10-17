import { describe, expect, it } from 'vitest';
import type { WorkflowDefinition } from '@/domain/workflow-definition';
import { toCanvas } from './canvas-adapter';
import { connectWorkflowSteps, reconcileWorkflowNodes } from './canvas-state';

const definition: WorkflowDefinition = {
  schemaVersion: 1, name: 'Routing',
  nodes: ['OP-10', 'QC-20', 'AP-30'].map((key) => ({ key, name: key, type: 'OPERATION', plannedDurationMinutes: 60 })),
  edges: [{ fromNodeKey: 'OP-10', toNodeKey: 'QC-20', joinPolicy: 'AND', conditionCode: 'READY' }],
};

describe('Workflow builder domain-to-canvas synchronization', () => {
  it('shows additions and inspector edits without losing measurements or saved positions', () => {
    const current = toCanvas(definition).nodes;
    current[0].measured = { width: 260, height: 200 };
    const updated = { ...definition, nodes: [...definition.nodes.map(node => node.key === 'OP-10' ? { ...node, name: 'Updated milling', plannedDurationMinutes: 90 } : node), { key: 'OP-40', name: 'New step', type: 'OPERATION' as const, plannedDurationMinutes: 30 }] };
    const projected = toCanvas(updated, { positions: { 'OP-10': { x: 200, y: 300 } } });
    const nodes = reconcileWorkflowNodes(projected.nodes, current, 'OP-40');
    expect(nodes).toHaveLength(4);
    expect(nodes[0].data.name).toBe('Updated milling');
    expect(nodes[0].data.plannedDurationMinutes).toBe(90);
    expect(nodes[0].position).toEqual({ x: 200, y: 300 });
    expect(nodes[0].measured).toEqual({ width: 260, height: 200 });
    expect(nodes[3].selected).toBe(true);
    expect(nodes[3].position.y - nodes[1].position.y).toBeGreaterThan(200);
  });
  it('removes deleted steps instead of retaining stale local canvas nodes', () => {
    const updated = { ...definition, nodes: definition.nodes.slice(1), edges: [] };
    expect(reconcileWorkflowNodes(toCanvas(updated).nodes, toCanvas(definition).nodes).map(node => node.id)).toEqual(['QC-20', 'AP-30']);
  });
  it('preserves existing node requirements and conditional edges when connecting', () => {
    const guarded = { ...definition, nodes: definition.nodes.map(node => ({ ...node, requirements: { machineClassId: 'cnc' } })) };
    const result = connectWorkflowSteps(guarded, 'QC-20', 'AP-30');
    expect(result.definition?.edges).toHaveLength(2);
    expect(result.definition?.edges[0].conditionCode).toBe('READY');
    expect(result.definition?.nodes).toEqual(guarded.nodes);
    expect(guarded.edges).toHaveLength(1);
  });
  it('rejects self links, duplicate links, missing endpoints and indirect cycles', () => {
    expect(connectWorkflowSteps(definition, 'OP-10', 'OP-10').error).toMatch(/itself/);
    expect(connectWorkflowSteps(definition, 'OP-10', 'QC-20').error).toMatch(/already/);
    expect(connectWorkflowSteps(definition, 'missing', 'QC-20').error).toMatch(/existing/);
    const linked = connectWorkflowSteps(definition, 'QC-20', 'AP-30').definition!;
    expect(connectWorkflowSteps(linked, 'AP-30', 'OP-10').error).toMatch(/cycle/);
  });
});
