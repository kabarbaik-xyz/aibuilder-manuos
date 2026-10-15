import { z } from 'zod';
import { createHash } from 'crypto';

export type WorkflowNodeType = 'OPERATION' | 'INSPECTION' | 'APPROVAL';

export interface WorkflowNodeRequirements {
  machineClassId?: string;
  requiredSkills?: Array<{
    skillId: string;
    minLevel: number;
  }>;
  requiredCertIds?: string[];
}

export interface WorkflowNodeFormGuard {
  qcChecklistId?: string;
  requireSignOff?: boolean;
}

export interface WorkflowNodeDefinition {
  key: string;
  name: string;
  type: WorkflowNodeType;
  departmentId?: string;
  requiredPermission?: string;
  plannedDurationMinutes: number;
  requirements?: WorkflowNodeRequirements;
  formGuard?: WorkflowNodeFormGuard;
}

export interface WorkflowEdgeDefinition {
  fromNodeKey: string;
  toNodeKey: string;
  joinPolicy: 'AND';
  conditionCode?: string;
  conditionParams?: Record<string, any>;
}

export interface WorkflowDefinition {
  schemaVersion: number;
  name: string;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

export interface CatalogReferenceSet {
  departmentIds: Set<string>;
  machineClassIds: Set<string>;
  skillIds: Set<string>;
  certIds: Set<string>;
  qcChecklistIds: Set<string>;
}

export interface WorkflowValidationError {
  nodeKey?: string;
  edge?: { from: string; to: string };
  field?: string;
  message: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: WorkflowValidationError[];
  topologicalOrder: string[];
}

export function computeDefinitionHash(definition: WorkflowDefinition): string {
  const canonical = JSON.stringify({
    schemaVersion: definition.schemaVersion,
    nodes: [...definition.nodes].sort((a, b) => a.key.localeCompare(b.key)),
    edges: [...definition.edges].sort((a, b) =>
      `${a.fromNodeKey}->${a.toNodeKey}`.localeCompare(`${b.fromNodeKey}->${b.toNodeKey}`)
    ),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Pure DAG & catalog validation for workflow definitions.
 */
export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
  catalog?: CatalogReferenceSet
): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const nodes = definition.nodes || [];
  const edges = definition.edges || [];

  if (nodes.length === 0) {
    return {
      isValid: false,
      errors: [{ message: 'Workflow must contain at least one node' }],
      topologicalOrder: [],
    };
  }

  // 1. Validate node keys uniqueness and basic attributes
  const nodeMap = new Map<string, WorkflowNodeDefinition>();
  for (const node of nodes) {
    if (!node.key || node.key.trim().length === 0) {
      errors.push({ message: 'Node key cannot be empty' });
      continue;
    }
    if (nodeMap.has(node.key)) {
      errors.push({ nodeKey: node.key, message: `Duplicate node key: '${node.key}'` });
    }
    if (!node.name || node.name.trim().length === 0) {
      errors.push({ nodeKey: node.key, field: 'name', message: `Node '${node.key}' must have a name` });
    }
    if (node.plannedDurationMinutes < 0) {
      errors.push({
        nodeKey: node.key,
        field: 'plannedDurationMinutes',
        message: `Node '${node.key}' cannot have negative duration`,
      });
    }

    // Catalog verification
    if (catalog) {
      if (node.departmentId && !catalog.departmentIds.has(node.departmentId)) {
        errors.push({
          nodeKey: node.key,
          field: 'departmentId',
          message: `Node '${node.key}' references non-existent department '${node.departmentId}'`,
        });
      }
      if (node.requirements?.machineClassId && !catalog.machineClassIds.has(node.requirements.machineClassId)) {
        errors.push({
          nodeKey: node.key,
          field: 'requirements.machineClassId',
          message: `Node '${node.key}' references non-existent machine class '${node.requirements.machineClassId}'`,
        });
      }
      if (node.requirements?.requiredSkills) {
        for (const reqSkill of node.requirements.requiredSkills) {
          if (!catalog.skillIds.has(reqSkill.skillId)) {
            errors.push({
              nodeKey: node.key,
              field: 'requirements.requiredSkills',
              message: `Node '${node.key}' references non-existent skill '${reqSkill.skillId}'`,
            });
          }
        }
      }
      if (node.requirements?.requiredCertIds) {
        for (const certId of node.requirements.requiredCertIds) {
          if (!catalog.certIds.has(certId)) {
            errors.push({
              nodeKey: node.key,
              field: 'requirements.requiredCertIds',
              message: `Node '${node.key}' references non-existent certification '${certId}'`,
            });
          }
        }
      }
      if (node.type === 'INSPECTION' && node.formGuard?.qcChecklistId) {
        if (!catalog.qcChecklistIds.has(node.formGuard.qcChecklistId)) {
          errors.push({
            nodeKey: node.key,
            field: 'formGuard.qcChecklistId',
            message: `Inspection node '${node.key}' references non-existent QC checklist '${node.formGuard.qcChecklistId}'`,
          });
        }
      }
    }

    nodeMap.set(node.key, node);
  }

  // 2. Validate edges
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const nodeKey of nodeMap.keys()) {
    inDegree.set(nodeKey, 0);
    outDegree.set(nodeKey, 0);
    adj.set(nodeKey, []);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.fromNodeKey)) {
      errors.push({
        edge: { from: edge.fromNodeKey, to: edge.toNodeKey },
        message: `Edge starts from non-existent node: '${edge.fromNodeKey}'`,
      });
    }
    if (!nodeMap.has(edge.toNodeKey)) {
      errors.push({
        edge: { from: edge.fromNodeKey, to: edge.toNodeKey },
        message: `Edge points to non-existent node: '${edge.toNodeKey}'`,
      });
    }
    if (edge.fromNodeKey === edge.toNodeKey) {
      errors.push({
        nodeKey: edge.fromNodeKey,
        message: `Self-referencing cycle detected on node: '${edge.fromNodeKey}'`,
      });
    }

    if (nodeMap.has(edge.fromNodeKey) && nodeMap.has(edge.toNodeKey)) {
      adj.get(edge.fromNodeKey)!.push(edge.toNodeKey);
      inDegree.set(edge.toNodeKey, (inDegree.get(edge.toNodeKey) || 0) + 1);
      outDegree.set(edge.fromNodeKey, (outDegree.get(edge.fromNodeKey) || 0) + 1);
    }
  }

  // Check orphan nodes (inDegree === 0 AND outDegree === 0)
  if (nodeMap.size > 1 && edges.length > 0) {
    for (const key of nodeMap.keys()) {
      const isInitial = (inDegree.get(key) || 0) === 0;
      const isTerminal = (outDegree.get(key) || 0) === 0;
      if (isInitial && isTerminal) {
        errors.push({
          nodeKey: key,
          message: `Node '${key}' is orphan/disconnected from workflow path.`,
        });
      }
    }
  }

  // 3. Topological Sort (Kahn's Algorithm) for acyclicity
  const inDegreeCopy = new Map<string, number>(inDegree);
  const queue: string[] = [];
  for (const [key, deg] of inDegreeCopy.entries()) {
    if (deg === 0) queue.push(key);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topologicalOrder.push(curr);
    for (const next of adj.get(curr) || []) {
      const nextDeg = inDegreeCopy.get(next)! - 1;
      inDegreeCopy.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }

  if (topologicalOrder.length < nodeMap.size) {
    errors.push({ message: 'Dependency cycle detected in workflow. Process must be an acyclic DAG.' });
  }

  // Sinks: nodes with out-degree 0
  if (nodeMap.size > 1 && edges.length > 0) {
    const terminalSinks = Array.from(outDegree.entries())
      .filter(([_, deg]) => deg === 0)
      .map(([k]) => k);

    if (terminalSinks.length === 0 && errors.length === 0) {
      errors.push({ message: 'Workflow has no terminal completion node.' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    topologicalOrder,
  };
}
