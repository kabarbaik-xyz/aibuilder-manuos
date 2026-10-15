export interface WorkflowNode {
  id: string;
  name: string;
  department: string;
  type?: string;
  requires?: {
    machineClass?: string;
    skillName?: string;
    skillLevel?: number;
    certification?: string;
  };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowValidationOutput {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  topologicalOrder: string[];
}

/**
 * Pure DAG validator for AI-generated and human-authored workflow configurations.
 */
export function validateWorkflowDAG(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowValidationOutput {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeMap = new Map<string, WorkflowNode>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  if (nodes.length === 0) {
    return {
      isValid: false,
      errors: ['Workflow must contain at least one operation node.'],
      warnings: [],
      topologicalOrder: [],
    };
  }

  // 1. Check duplicate node IDs
  for (const n of nodes) {
    if (nodeMap.has(n.id)) {
      errors.push(`Duplicate node identifier: "${n.id}"`);
    }
    nodeMap.set(n.id, n);
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }

  // 2. Validate edge endpoints
  for (const e of edges) {
    if (!nodeMap.has(e.from)) {
      errors.push(`Edge starts from non-existent node: "${e.from}"`);
    }
    if (!nodeMap.has(e.to)) {
      errors.push(`Edge points to non-existent node: "${e.to}"`);
    }
    if (e.from === e.to) {
      errors.push(`Self-referencing cycle detected on node: "${e.from}"`);
    }
    if (nodeMap.has(e.from) && nodeMap.has(e.to)) {
      adj.get(e.from)!.push(e.to);
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    }
  }

  // 3. Topological Sort to detect cycles (Kahn's Algorithm)
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const neighbor of adj.get(curr) || []) {
      const newDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (topoOrder.length < nodes.length) {
    errors.push('Dependency cycle detected in workflow. Scheduling requires an acyclic DAG.');
  }

  // 4. Orphan Node Check
  if (nodes.length > 1) {
    for (const n of nodes) {
      const incoming = edges.some((e) => e.to === n.id);
      const outgoing = edges.some((e) => e.from === n.id);
      if (!incoming && !outgoing) {
        warnings.push(`Node "${n.name}" (${n.id}) is disconnected with no dependencies.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    topologicalOrder: topoOrder,
  };
}
