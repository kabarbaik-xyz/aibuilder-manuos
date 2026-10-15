export type TaskStatus =
  | 'PENDING'
  | 'READY'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'PAUSED'
  | 'WAITING_QC'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED';

export type TaskAction =
  | 'assign'
  | 'start'
  | 'pause'
  | 'resume'
  | 'submit_qc'
  | 'complete'
  | 'block'
  | 'unblock'
  | 'cancel';

export interface PredecessorStatus {
  taskId: string;
  nodeKey: string;
  status: TaskStatus;
}

export interface TransitionDenialReason {
  code: string;
  resourceId?: string;
  message: string;
}

export interface TransitionDecision {
  allowed: boolean;
  nextStatus?: TaskStatus;
  reasons: TransitionDenialReason[];
}

export interface TransitionEvaluationInput {
  currentStatus: TaskStatus;
  action: TaskAction;
  nodeType?: 'OPERATION' | 'INSPECTION' | 'APPROVAL';
  attemptNumber?: number;
  // Predecessor guards
  predecessors?: PredecessorStatus[];
  joinPolicy?: 'AND';
  // Material coverage guards
  materialCovered?: boolean;
  materialShortageReason?: string;
  // Resource eligibility guards
  assignedTechnicianId?: string | null;
  technicianHasRequiredSkills?: boolean;
  technicianHasRequiredCerts?: boolean;
  assignedMachineId?: string | null;
  machineMatchesClass?: boolean;
  // Evidence / Quality guards
  qcChecklistRequired?: boolean;
  qcChecksCompleted?: boolean;
  qcDisposition?: 'PASSED' | 'FAILED' | 'PENDING';
  // Authority guards
  actorHasRequiredPermission?: boolean;
}

/**
 * Pure deterministic transition evaluator enforcing DAG preconditions,
 * material coverage, technician capability, machine eligibility, and quality gates.
 */
export function evaluateTransition(input: TransitionEvaluationInput): TransitionDecision {
  const { currentStatus, action } = input;
  const reasons: TransitionDenialReason[] = [];

  // Terminal states cannot transition
  if (currentStatus === 'COMPLETED') {
    return {
      allowed: false,
      reasons: [{ code: 'TASK_ALREADY_COMPLETED', message: 'Task is already COMPLETED and cannot transition further.' }],
    };
  }
  if (currentStatus === 'CANCELLED') {
    return {
      allowed: false,
      reasons: [{ code: 'TASK_ALREADY_CANCELLED', message: 'Task is CANCELLED and cannot transition.' }],
    };
  }

  // Common cancellations & blocking
  if (action === 'cancel') {
    if (input.actorHasRequiredPermission === false) {
      return {
        allowed: false,
        reasons: [{ code: 'INSUFFICIENT_AUTHORITY', message: 'Actor lacks authority to cancel task.' }],
      };
    }
    return { allowed: true, nextStatus: 'CANCELLED', reasons: [] };
  }

  if (action === 'block') {
    return { allowed: true, nextStatus: 'BLOCKED', reasons: [] };
  }

  if (action === 'unblock') {
    if (currentStatus !== 'BLOCKED') {
      return {
        allowed: false,
        reasons: [{ code: 'INVALID_STATUS', message: 'Only BLOCKED tasks can be unblocked.' }],
      };
    }
    // Check if predecessors are completed
    const allPredecessorsDone =
      !input.predecessors ||
      input.predecessors.length === 0 ||
      input.predecessors.every((p) => p.status === 'COMPLETED');

    const next = allPredecessorsDone
      ? input.assignedTechnicianId
        ? 'ASSIGNED'
        : 'READY'
      : 'PENDING';

    return { allowed: true, nextStatus: next, reasons: [] };
  }

  if (currentStatus === 'BLOCKED') {
    return {
      allowed: false,
      reasons: [{ code: 'TASK_BLOCKED', message: 'Task is currently BLOCKED. Unblock before attempting transitions.' }],
    };
  }

  // Specific Action Evaluations
  switch (action) {
    case 'assign': {
      if (currentStatus !== 'PENDING' && currentStatus !== 'READY') {
        reasons.push({
          code: 'INVALID_STATE_FOR_ASSIGNMENT',
          message: `Cannot assign task in '${currentStatus}' status. Must be PENDING or READY.`,
        });
      }
      if (!input.assignedTechnicianId) {
        reasons.push({
          code: 'MISSING_TECHNICIAN',
          message: 'Assignment requires a valid technician ID.',
        });
      }
      if (input.technicianHasRequiredSkills === false) {
        reasons.push({
          code: 'SKILL_MISMATCH',
          message: 'Assigned technician does not possess required skills or level.',
        });
      }
      if (input.technicianHasRequiredCerts === false) {
        reasons.push({
          code: 'CERTIFICATION_EXPIRED_OR_MISSING',
          message: 'Assigned technician lacks required active certification.',
        });
      }
      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'ASSIGNED' : undefined,
        reasons,
      };
    }

    case 'start': {
      if (currentStatus !== 'ASSIGNED' && currentStatus !== 'READY') {
        reasons.push({
          code: 'INVALID_STATE_FOR_START',
          message: `Cannot start task from status '${currentStatus}'. Must be ASSIGNED or READY.`,
        });
      }

      // Predecessors guard: for AND joins, all predecessors must be COMPLETED
      if (input.predecessors && input.predecessors.length > 0) {
        const incomplete = input.predecessors.filter((p) => p.status !== 'COMPLETED');
        if (incomplete.length > 0) {
          reasons.push({
            code: 'PREDECESSORS_INCOMPLETE',
            message: `Cannot start task: waiting for predecessor tasks [${incomplete.map((p) => p.nodeKey).join(', ')}] to complete.`,
          });
        }
      }

      // Material availability guard: material shortage is visible demand, cannot be bypassed
      if (input.materialCovered === false) {
        reasons.push({
          code: 'MATERIAL_SHORTAGE',
          message: input.materialShortageReason || 'Cannot start task: required materials are not fully allocated/covered.',
        });
      }

      // Technician execution guard
      if (!input.assignedTechnicianId) {
        reasons.push({
          code: 'OPERATOR_UNASSIGNED',
          message: 'Task must have an assigned technician before execution can begin.',
        });
      }

      // Machine compatibility guard
      if (input.machineMatchesClass === false) {
        reasons.push({
          code: 'MACHINE_CLASS_MISMATCH',
          message: 'Assigned machine does not match the required machine class for this operation.',
        });
      }

      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'RUNNING' : undefined,
        reasons,
      };
    }

    case 'pause': {
      if (currentStatus !== 'RUNNING') {
        reasons.push({
          code: 'INVALID_STATE_FOR_PAUSE',
          message: `Cannot pause task in status '${currentStatus}'. Must be RUNNING.`,
        });
      }
      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'PAUSED' : undefined,
        reasons,
      };
    }

    case 'resume': {
      if (currentStatus !== 'PAUSED') {
        reasons.push({
          code: 'INVALID_STATE_FOR_RESUME',
          message: `Cannot resume task in status '${currentStatus}'. Must be PAUSED.`,
        });
      }
      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'RUNNING' : undefined,
        reasons,
      };
    }

    case 'submit_qc': {
      if (currentStatus !== 'RUNNING') {
        reasons.push({
          code: 'INVALID_STATE_FOR_QC',
          message: `Cannot submit for QC from status '${currentStatus}'. Must be RUNNING.`,
        });
      }
      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'WAITING_QC' : undefined,
        reasons,
      };
    }

    case 'complete': {
      if (currentStatus !== 'RUNNING' && currentStatus !== 'WAITING_QC') {
        reasons.push({
          code: 'INVALID_STATE_FOR_COMPLETE',
          message: `Cannot complete task in status '${currentStatus}'. Must be RUNNING or WAITING_QC.`,
        });
      }

      // Inspection node quality checks
      if (input.nodeType === 'INSPECTION' || input.qcChecklistRequired) {
        if (input.qcChecksCompleted === false) {
          reasons.push({
            code: 'QC_CHECKS_INCOMPLETE',
            message: 'All mandatory quality checklist items must be executed.',
          });
        }
        if (input.qcDisposition !== 'PASSED') {
          reasons.push({
            code: 'QC_DISPOSITION_NOT_PASSED',
            message: `Quality disposition is '${input.qcDisposition || 'PENDING'}'. Only PASSED inspection allows completion.`,
          });
        }
      }

      // Approval node permission guard
      if (input.nodeType === 'APPROVAL') {
        if (input.actorHasRequiredPermission === false) {
          reasons.push({
            code: 'INSUFFICIENT_APPROVAL_AUTHORITY',
            message: 'Actor does not possess required approval authority for this gate.',
          });
        }
      }

      return {
        allowed: reasons.length === 0,
        nextStatus: reasons.length === 0 ? 'COMPLETED' : undefined,
        reasons,
      };
    }

    default:
      return {
        allowed: false,
        reasons: [{ code: 'UNKNOWN_ACTION', message: `Unknown task action: '${action}'.` }],
      };
  }
}
