import { describe, it, expect } from 'vitest';
import { rankTechniciansForTask } from './dispatch';
import { seedTechnicians } from '../data/seed';
import { Task } from '../domain/types';

describe('Skill-Aware Dispatch Engine', () => {
  it('enforces hard gate on required certification (e.g. WABO D1.1)', () => {
    const weldingTask: Task = {
      id: 'task-weld-01',
      jobsheetId: 'JS-088-01',
      orderId: 'ORD-2026-088',
      name: 'Structural MIG Welding',
      operationType: 'Welding',
      machineClass: 'WELD-01',
      department: 'Welding',
      status: 'READY',
      plannedHours: 4,
      actualHours: 0,
      assignedTechnicianId: '',
      requiredSkill: { name: 'MIG Welding', level: 3 },
      requiredCert: 'WABO D1.1',
      dependsOn: [],
    };

    const ranked = rankTechniciansForTask(weldingTask, seedTechnicians);

    // Only candidates with WABO D1.1 should be eligible
    const eligible = ranked.filter((r) => r.eligible);
    expect(eligible.length).toBeGreaterThan(0);

    for (const cand of eligible) {
      const hasWabo = cand.technician.certifications.some((c) =>
        c.name.includes('WABO')
      );
      expect(hasWabo).toBe(true);
    }

    const ineligible = ranked.filter((r) => !r.eligible);
    expect(ineligible.length).toBeGreaterThan(0);
    expect(ineligible[0].ineligibleReason).toBeDefined();
  });

  it('proposes junior pairing option when apprentice is available', () => {
    const weldingTask: Task = {
      id: 'task-weld-01',
      jobsheetId: 'JS-088-01',
      orderId: 'ORD-2026-088',
      name: 'Structural MIG Welding',
      operationType: 'Welding',
      machineClass: 'WELD-01',
      department: 'Welding',
      status: 'READY',
      plannedHours: 4,
      actualHours: 0,
      assignedTechnicianId: '',
      requiredSkill: { name: 'MIG Welding', level: 3 },
      dependsOn: [],
    };

    const ranked = rankTechniciansForTask(weldingTask, seedTechnicians);
    const top = ranked.find((r) => r.isBestFit);
    expect(top).toBeDefined();
    expect(top?.pairJuniorOption).toBeDefined();
  });
});
