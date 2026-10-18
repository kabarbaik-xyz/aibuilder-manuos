import { describe, expect, it } from 'vitest';
import type { OrderLifecycleDefinition } from '@/domain/order-lifecycle-definition';
import { toLifecycleCanvas } from './lifecycle-canvas-adapter';

const definition: OrderLifecycleDefinition = {
  schemaVersion: 1,
  name: 'Order lifecycle',
  stages: [
    { key: 'SALES', name: 'Confirm order', action: 'ORDER_CONFIRM', departmentId: 'sales', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'sales', eligibleRoleCodes: ['sales'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: [], forms: [] },
    { key: 'ENGINEERING', name: 'Approve engineering', action: 'ENGINEERING_APPROVE', departmentId: 'engineering', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'engineering', eligibleRoleCodes: ['engineer'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: ['SALES'], forms: [] },
    { key: 'PRODUCTION', name: 'Plan production', action: 'PLAN_PRODUCTION', departmentId: 'ppic', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'ppic', eligibleRoleCodes: ['planner'] }, schedule: { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' }, predecessors: ['ENGINEERING'], forms: [] },
    { key: 'QC', name: 'Inspect order', action: 'FINALIZE_QC', departmentId: 'quality', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'quality', eligibleRoleCodes: ['qc'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 240 }, predecessors: ['PRODUCTION'], forms: [] },
    { key: 'DELIVERY', name: 'Deliver order', action: 'CONFIRM_DELIVERY', departmentId: 'delivery', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'delivery', eligibleRoleCodes: ['delivery'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: ['QC'], activationCondition: { kind: 'QC_OUTCOME', sourceStageKey: 'QC', operator: 'EQUALS', value: 'PASSED' }, forms: [] },
  ],
};

describe('Order lifecycle canvas adapter', () => {
  it('maps lifecycle stages and predecessor dependencies into clickable graph nodes and edges', () => {
    const canvas = toLifecycleCanvas(definition, { sales: 'Sales', engineering: 'Engineering', ppic: 'Production Planning', quality: 'Quality', delivery: 'Warehouse & Delivery' });

    expect(canvas.nodes.map(node => node.id)).toEqual(['SALES', 'ENGINEERING', 'PRODUCTION', 'QC', 'DELIVERY']);
    expect(canvas.edges.map(edge => [edge.source, edge.target])).toEqual([
      ['SALES', 'ENGINEERING'], ['ENGINEERING', 'PRODUCTION'], ['PRODUCTION', 'QC'], ['QC', 'DELIVERY'],
    ]);
    expect(canvas.nodes[2].data.departmentName).toBe('Production Planning');
    expect(canvas.nodes[2].position.x).toBeGreaterThan(canvas.nodes[1].position.x);
    expect(canvas.edges[3].label).toBe('QC: PASSED');
  });

  it('places parallel stages in the same dependency column and separates them vertically', () => {
    const branched = {
      ...definition,
      stages: [definition.stages[0],
        { ...definition.stages[1], key: 'STANDARD', predecessors: ['SALES'] },
        { ...definition.stages[1], key: 'CUSTOM', predecessors: ['SALES'] },
        { ...definition.stages[3], key: 'DONE', predecessors: ['STANDARD', 'CUSTOM'] },
      ],
    };
    const canvas = toLifecycleCanvas(branched, {});
    const standard = canvas.nodes.find(node => node.id === 'STANDARD')!;
    const custom = canvas.nodes.find(node => node.id === 'CUSTOM')!;

    expect(standard.position.x).toBe(custom.position.x);
    expect(standard.position.y).not.toBe(custom.position.y);
    expect(canvas.edges).toHaveLength(4);
  });
});
