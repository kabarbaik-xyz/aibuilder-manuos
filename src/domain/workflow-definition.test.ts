import { describe, it, expect } from 'vitest';
import {
  validateWorkflowDefinition,
  computeDefinitionHash,
  WorkflowDefinition,
  CatalogReferenceSet,
} from './workflow-definition';

describe('Workflow Definition Domain Validation', () => {
  const mockCatalog: CatalogReferenceSet = {
    departmentIds: new Set(['dept-cnc', 'dept-qa']),
    machineClassIds: new Set(['class-5ax']),
    skillIds: new Set(['skill-mill']),
    certIds: new Set(['cert-as9100']),
    qcChecklistIds: new Set(['qc-aero-01']),
  };

  it('validates a valid multi-step manufacturing DAG with parallel branches and inspection', () => {
    const def: WorkflowDefinition = {
      schemaVersion: 1,
      name: 'Aerospace Bracket Machining',
      nodes: [
        {
          key: 'OP-10',
          name: 'Material Cut & Prep',
          type: 'OPERATION',
          departmentId: 'dept-cnc',
          plannedDurationMinutes: 45,
        },
        {
          key: 'OP-20',
          name: '5-Axis CNC Milling',
          type: 'OPERATION',
          departmentId: 'dept-cnc',
          plannedDurationMinutes: 120,
          requirements: {
            machineClassId: 'class-5ax',
            requiredSkills: [{ skillId: 'skill-mill', minLevel: 3 }],
          },
        },
        {
          key: 'QC-30',
          name: 'CMM Dimensional Inspection',
          type: 'INSPECTION',
          departmentId: 'dept-qa',
          plannedDurationMinutes: 30,
          formGuard: {
            qcChecklistId: 'qc-aero-01',
          },
        },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' },
      ],
    };

    const result = validateWorkflowDefinition(def, mockCatalog);
    if (!result.isValid) console.log('VALIDATION ERRORS:', JSON.stringify(result.errors));
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.topologicalOrder).toEqual(['OP-10', 'OP-20', 'QC-30']);

    const hash = computeDefinitionHash(def);
    expect(hash).toHaveLength(64);
  });

  it('detects and rejects dependency cycles', () => {
    const cyclicDef: WorkflowDefinition = {
      schemaVersion: 1,
      name: 'Cyclic Workflow',
      nodes: [
        { key: 'A', name: 'Step A', type: 'OPERATION', plannedDurationMinutes: 10 },
        { key: 'B', name: 'Step B', type: 'OPERATION', plannedDurationMinutes: 10 },
      ],
      edges: [
        { fromNodeKey: 'A', toNodeKey: 'B', joinPolicy: 'AND' },
        { fromNodeKey: 'B', toNodeKey: 'A', joinPolicy: 'AND' },
      ],
    };

    const result = validateWorkflowDefinition(cyclicDef);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true);
  });

  it('rejects edges starting or ending at non-existent nodes', () => {
    const badEdgesDef: WorkflowDefinition = {
      schemaVersion: 1,
      name: 'Bad Edge Workflow',
      nodes: [
        { key: 'A', name: 'Step A', type: 'OPERATION', plannedDurationMinutes: 10 },
      ],
      edges: [
        { fromNodeKey: 'A', toNodeKey: 'NON_EXISTENT', joinPolicy: 'AND' },
      ],
    };

    const result = validateWorkflowDefinition(badEdgesDef);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('NON_EXISTENT'))).toBe(true);
  });

  it('detects orphan / disconnected nodes', () => {
    const orphanDef: WorkflowDefinition = {
      schemaVersion: 1,
      name: 'Orphan Node Workflow',
      nodes: [
        { key: 'A', name: 'Step A', type: 'OPERATION', plannedDurationMinutes: 10 },
        { key: 'B', name: 'Step B', type: 'OPERATION', plannedDurationMinutes: 10 },
        { key: 'ORPHAN', name: 'Forgotten Node', type: 'OPERATION', plannedDurationMinutes: 10 },
      ],
      edges: [
        { fromNodeKey: 'A', toNodeKey: 'B', joinPolicy: 'AND' },
      ],
    };

    const result = validateWorkflowDefinition(orphanDef);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.nodeKey === 'ORPHAN')).toBe(true);
  });

  it('validates catalog references and flags unknown departments and checklists', () => {
    const invalidRefsDef: WorkflowDefinition = {
      schemaVersion: 1,
      name: 'Invalid Refs',
      nodes: [
        {
          key: 'QC-1',
          name: 'QC Step',
          type: 'INSPECTION',
          departmentId: 'dept-unknown',
          plannedDurationMinutes: 15,
          formGuard: {
            qcChecklistId: 'qc-non-existent',
          },
        },
      ],
      edges: [],
    };

    const result = validateWorkflowDefinition(invalidRefsDef, mockCatalog);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'departmentId')).toBe(true);
    expect(result.errors.some((e) => e.field === 'formGuard.qcChecklistId')).toBe(true);
  });
});
