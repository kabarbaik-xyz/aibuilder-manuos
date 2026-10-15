import { describe, it, expect } from 'vitest';
import { evaluateTransition, TransitionEvaluationInput } from './workflow-runtime';

describe('W04: Bounded Workflow Runtime Transition Engine', () => {
  it('denies starting a task when only one of two AND join predecessors is completed', () => {
    const input: TransitionEvaluationInput = {
      currentStatus: 'ASSIGNED',
      action: 'start',
      assignedTechnicianId: 'tech-1',
      materialCovered: true,
      predecessors: [
        { taskId: 'task-1', nodeKey: 'OP-10A', status: 'COMPLETED' },
        { taskId: 'task-2', nodeKey: 'OP-10B', status: 'RUNNING' }, // Incomplete
      ],
      joinPolicy: 'AND',
    };

    const decision = evaluateTransition(input);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'PREDECESSORS_INCOMPLETE')).toBe(true);
    expect(decision.reasons[0].message).toContain('OP-10B');
  });

  it('allows starting a task when all AND join predecessors are COMPLETED', () => {
    const input: TransitionEvaluationInput = {
      currentStatus: 'ASSIGNED',
      action: 'start',
      assignedTechnicianId: 'tech-1',
      materialCovered: true,
      predecessors: [
        { taskId: 'task-1', nodeKey: 'OP-10A', status: 'COMPLETED' },
        { taskId: 'task-2', nodeKey: 'OP-10B', status: 'COMPLETED' },
      ],
      joinPolicy: 'AND',
    };

    const decision = evaluateTransition(input);
    expect(decision.allowed).toBe(true);
    expect(decision.nextStatus).toBe('RUNNING');
    expect(decision.reasons.length).toBe(0);
  });

  it('denies starting a task if material is not covered (material shortage gate)', () => {
    const input: TransitionEvaluationInput = {
      currentStatus: 'ASSIGNED',
      action: 'start',
      assignedTechnicianId: 'tech-1',
      materialCovered: false,
      materialShortageReason: 'Insufficient stock: Raw Titanium Bar (shortage: 12.5 kg)',
      predecessors: [],
    };

    const decision = evaluateTransition(input);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'MATERIAL_SHORTAGE')).toBe(true);
    expect(decision.reasons[0].message).toContain('Insufficient stock');
  });

  it('denies starting a task if operator is unassigned', () => {
    const input: TransitionEvaluationInput = {
      currentStatus: 'READY',
      action: 'start',
      assignedTechnicianId: null, // Unassigned
      materialCovered: true,
      predecessors: [],
    };

    const decision = evaluateTransition(input);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'OPERATOR_UNASSIGNED')).toBe(true);
  });

  it('denies assignment if technician lacks required skill or has expired certification', () => {
    // Missing skill
    const skillFail: TransitionEvaluationInput = {
      currentStatus: 'READY',
      action: 'assign',
      assignedTechnicianId: 'tech-novice',
      technicianHasRequiredSkills: false,
    };
    const dec1 = evaluateTransition(skillFail);
    expect(dec1.allowed).toBe(false);
    expect(dec1.reasons.some((r) => r.code === 'SKILL_MISMATCH')).toBe(true);

    // Expired cert
    const certFail: TransitionEvaluationInput = {
      currentStatus: 'READY',
      action: 'assign',
      assignedTechnicianId: 'tech-experienced',
      technicianHasRequiredSkills: true,
      technicianHasRequiredCerts: false,
    };
    const dec2 = evaluateTransition(certFail);
    expect(dec2.allowed).toBe(false);
    expect(dec2.reasons.some((r) => r.code === 'CERTIFICATION_EXPIRED_OR_MISSING')).toBe(true);
  });

  it('enforces inspection completion gate: denies completing without passing QC disposition', () => {
    // Incomplete checklist
    const incompleteQC: TransitionEvaluationInput = {
      currentStatus: 'WAITING_QC',
      action: 'complete',
      nodeType: 'INSPECTION',
      qcChecklistRequired: true,
      qcChecksCompleted: false,
      qcDisposition: 'PENDING',
    };
    const dec1 = evaluateTransition(incompleteQC);
    expect(dec1.allowed).toBe(false);
    expect(dec1.reasons.some((r) => r.code === 'QC_CHECKS_INCOMPLETE')).toBe(true);

    // Completed checks but FAILED disposition
    const failedQC: TransitionEvaluationInput = {
      currentStatus: 'WAITING_QC',
      action: 'complete',
      nodeType: 'INSPECTION',
      qcChecklistRequired: true,
      qcChecksCompleted: true,
      qcDisposition: 'FAILED',
    };
    const dec2 = evaluateTransition(failedQC);
    expect(dec2.allowed).toBe(false);
    expect(dec2.reasons.some((r) => r.code === 'QC_DISPOSITION_NOT_PASSED')).toBe(true);

    // PASSED disposition allows completion
    const passedQC: TransitionEvaluationInput = {
      currentStatus: 'WAITING_QC',
      action: 'complete',
      nodeType: 'INSPECTION',
      qcChecklistRequired: true,
      qcChecksCompleted: true,
      qcDisposition: 'PASSED',
    };
    const dec3 = evaluateTransition(passedQC);
    expect(dec3.allowed).toBe(true);
    expect(dec3.nextStatus).toBe('COMPLETED');
  });

  it('enforces approval gate authority', () => {
    const unauthorized: TransitionEvaluationInput = {
      currentStatus: 'RUNNING',
      action: 'complete',
      nodeType: 'APPROVAL',
      actorHasRequiredPermission: false,
    };
    const dec = evaluateTransition(unauthorized);
    expect(dec.allowed).toBe(false);
    expect(dec.reasons.some((r) => r.code === 'INSUFFICIENT_APPROVAL_AUTHORITY')).toBe(true);

    const authorized: TransitionEvaluationInput = {
      currentStatus: 'RUNNING',
      action: 'complete',
      nodeType: 'APPROVAL',
      actorHasRequiredPermission: true,
    };
    const decAuth = evaluateTransition(authorized);
    expect(decAuth.allowed).toBe(true);
    expect(decAuth.nextStatus).toBe('COMPLETED');
  });

  it('handles pause, resume, block, and unblock lifecycle states correctly', () => {
    // RUNNING -> pause -> PAUSED
    const pauseDec = evaluateTransition({ currentStatus: 'RUNNING', action: 'pause' });
    expect(pauseDec.allowed).toBe(true);
    expect(pauseDec.nextStatus).toBe('PAUSED');

    // PAUSED -> resume -> RUNNING
    const resumeDec = evaluateTransition({ currentStatus: 'PAUSED', action: 'resume' });
    expect(resumeDec.allowed).toBe(true);
    expect(resumeDec.nextStatus).toBe('RUNNING');

    // RUNNING -> block -> BLOCKED
    const blockDec = evaluateTransition({ currentStatus: 'RUNNING', action: 'block' });
    expect(blockDec.allowed).toBe(true);
    expect(blockDec.nextStatus).toBe('BLOCKED');

    // BLOCKED cannot transition to other actions
    const deniedStart = evaluateTransition({ currentStatus: 'BLOCKED', action: 'start' });
    expect(deniedStart.allowed).toBe(false);
    expect(deniedStart.reasons.some((r) => r.code === 'TASK_BLOCKED')).toBe(true);

    // BLOCKED -> unblock -> ASSIGNED (with completed predecessors and assigned technician)
    const unblockDec = evaluateTransition({
      currentStatus: 'BLOCKED',
      action: 'unblock',
      assignedTechnicianId: 'tech-1',
      predecessors: [{ taskId: '1', nodeKey: 'OP-1', status: 'COMPLETED' }],
    });
    expect(unblockDec.allowed).toBe(true);
    expect(unblockDec.nextStatus).toBe('ASSIGNED');
  });
});
