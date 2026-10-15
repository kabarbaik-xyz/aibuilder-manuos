import { describe, it, expect } from 'vitest';
import { toCanvas, fromCanvas } from './canvas-adapter';
import { WorkflowDefinition } from '@/domain/workflow-definition';

describe('WB01: Workflow Canvas Adapter Round-Trip & Layout Preservation', () => {
  const sampleDef: WorkflowDefinition = {
    schemaVersion: 1,
    name: 'Precision CNC & QC Flow',
    nodes: [
      {
        key: 'OP10_MILL',
        name: 'Rough Milling',
        type: 'OPERATION',
        plannedDurationMinutes: 45,
      },
      {
        key: 'QC20_DIM',
        name: 'Dimensional Inspection',
        type: 'INSPECTION',
        plannedDurationMinutes: 15,
      },
      {
        key: 'AP30_SIGN',
        name: 'Quality Lead Sign-off',
        type: 'APPROVAL',
        plannedDurationMinutes: 10,
      },
    ],
    edges: [
      {
        fromNodeKey: 'OP10_MILL',
        toNodeKey: 'QC20_DIM',
        joinPolicy: 'AND',
      },
      {
        fromNodeKey: 'QC20_DIM',
        toNodeKey: 'AP30_SIGN',
        joinPolicy: 'AND',
      },
    ],
  };

  it('transforms domain definition to canvas nodes and edges with default layout', () => {
    const canvas = toCanvas(sampleDef);
    expect(canvas.nodes).toHaveLength(3);
    expect(canvas.edges).toHaveLength(2);

    expect(canvas.nodes[0].id).toBe('OP10_MILL');
    expect(canvas.nodes[0].data.name).toBe('Rough Milling');
    expect(canvas.nodes[0].position.x).toBe(50);
    expect(canvas.nodes[0].position.y).toBe(50);

    expect(canvas.edges[0].id).toBe('OP10_MILL->QC20_DIM');
    expect(canvas.edges[0].source).toBe('OP10_MILL');
    expect(canvas.edges[0].target).toBe('QC20_DIM');
  });

  it('preserves saved layout positions when provided', () => {
    const customLayout = {
      positions: {
        OP10_MILL: { x: 100, y: 200 },
        QC20_DIM: { x: 400, y: 200 },
        AP30_SIGN: { x: 700, y: 200 },
      },
    };

    const canvas = toCanvas(sampleDef, customLayout);
    expect(canvas.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(canvas.nodes[1].position).toEqual({ x: 400, y: 200 });
    expect(canvas.nodes[2].position).toEqual({ x: 700, y: 200 });
  });

  it('preserves domain semantics when transforming back from canvas', () => {
    const canvas = toCanvas(sampleDef);
    // Simulate user moving a node
    canvas.nodes[0].position = { x: 120.4, y: 80.6 };

    const { definition, layout } = fromCanvas(canvas.nodes, canvas.edges, sampleDef.name);

    expect(definition.nodes).toEqual(sampleDef.nodes);
    expect(definition.edges).toEqual(sampleDef.edges);
    expect(layout.positions['OP10_MILL']).toEqual({ x: 120, y: 81 });
  });
});
