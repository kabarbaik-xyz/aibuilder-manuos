import { describe, it, expect } from 'vitest';
import { validateWorkflowDAG } from './workflow-validate';

describe('Workflow DAG Validator', () => {
  it('validates a correct sequential workflow', () => {
    const nodes = [
      { id: '1', name: 'Cut stock', department: 'Machining' },
      { id: '2', name: 'Bend', department: 'Machining' },
      { id: '3', name: 'Assembly', department: 'Assembly' },
    ];
    const edges = [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
    ];

    const result = validateWorkflowDAG(nodes, edges);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.topologicalOrder).toEqual(['1', '2', '3']);
  });

  it('rejects cyclic dependencies with explicit diagnostic error', () => {
    const nodes = [
      { id: '1', name: 'Step A', department: 'Machining' },
      { id: '2', name: 'Step B', department: 'Assembly' },
    ];
    const edges = [
      { from: '1', to: '2' },
      { from: '2', to: '1' }, // Cycle
    ];

    const result = validateWorkflowDAG(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('cycle'))).toBe(true);
  });
});
