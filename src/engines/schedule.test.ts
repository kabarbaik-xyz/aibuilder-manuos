import { describe, it, expect } from 'vitest';
import { scheduleFiniteCapacity, scheduleTasks, ScheduleCalendar } from './schedule';

describe('Production Scheduling Engine (O05 / acceptance A08-A10)', () => {
  const calendar8h: ScheduleCalendar = {
    id: 'CAL-8H',
    shiftStartHour: 8, // 08:00 UTC
    shiftHours: 8, // 8h shift (08:00 to 16:00)
    workDays: [1, 2, 3, 4, 5], // Mon - Fri
  };

  it('completes 10h of sequential work on Nov 25 at 10:00 under an 8h shift starting Nov 24 at 08:00', () => {
    // 2026-11-24 is a Tuesday (workDay 2)
    const horizon = '2026-11-24T08:00:00.000Z';

    const tasks = [
      {
        id: 'TASK-PREP',
        name: 'Material Preparation',
        plannedDurationMinutes: 240, // 4 hours
      },
      {
        id: 'TASK-MACHINING',
        name: 'CNC Machining',
        plannedDurationMinutes: 360, // 6 hours (total sequential = 10 hours)
        predecessorTaskIds: ['TASK-PREP'],
      },
    ];

    const result = scheduleTasks({
      tasks,
      startHorizon: horizon,
      calendar: calendar8h,
    });

    // Day 1 (Nov 24):
    // - TASK-PREP: 08:00 to 12:00 (4h)
    // - TASK-MACHINING starts 12:00, gets 4h on Nov 24 until 16:00 (shift end)
    // Day 2 (Nov 25):
    // - TASK-MACHINING resumes 08:00, needs 2 remaining hours -> finishes at 10:00!
    const prep = result.scheduledTasks.find((t) => t.taskId === 'TASK-PREP')!;
    const machining = result.scheduledTasks.find((t) => t.taskId === 'TASK-MACHINING')!;

    expect(prep.startAt).toBe('2026-11-24T08:00:00.000Z');
    expect(prep.endAt).toBe('2026-11-24T12:00:00.000Z');

    expect(machining.startAt).toBe('2026-11-24T12:00:00.000Z');
    expect(machining.endAt).toBe('2026-11-25T10:00:00.000Z');

    expect(result.projectedEndAt).toBe('2026-11-25T10:00:00.000Z');
  });

  it('material delay shifts dependent assembly/QC/pack while preparation/machining remain eligible', () => {
    const horizon = '2026-11-24T08:00:00.000Z';

    // Baseline 4-step pipeline:
    // 1. Prep (2h)
    // 2. Machining (4h)
    // 3. Assembly (3h) -> requires custom material arriving Nov 26 at 08:00
    // 4. QC Inspection (2h)
    const tasks = [
      {
        id: 'TASK-PREP',
        plannedDurationMinutes: 120, // 2h
      },
      {
        id: 'TASK-MACHINING',
        plannedDurationMinutes: 240, // 4h
        predecessorTaskIds: ['TASK-PREP'],
      },
      {
        id: 'TASK-ASSEMBLY',
        plannedDurationMinutes: 180, // 3h
        predecessorTaskIds: ['TASK-MACHINING'],
        materialAvailableAt: '2026-11-26T08:00:00.000Z', // delayed material arrives Nov 26
      },
      {
        id: 'TASK-QC',
        plannedDurationMinutes: 120, // 2h
        predecessorTaskIds: ['TASK-ASSEMBLY'],
      },
    ];

    const result = scheduleTasks({
      tasks,
      startHorizon: horizon,
      calendar: calendar8h,
    });

    const prep = result.scheduledTasks.find((t) => t.taskId === 'TASK-PREP')!;
    const machining = result.scheduledTasks.find((t) => t.taskId === 'TASK-MACHINING')!;
    const assembly = result.scheduledTasks.find((t) => t.taskId === 'TASK-ASSEMBLY')!;
    const qc = result.scheduledTasks.find((t) => t.taskId === 'TASK-QC')!;

    // Prep & Machining remain eligible on Nov 24:
    // Prep: 08:00 to 10:00 on Nov 24
    expect(prep.startAt).toBe('2026-11-24T08:00:00.000Z');
    expect(prep.endAt).toBe('2026-11-24T10:00:00.000Z');

    // Machining: 10:00 to 14:00 on Nov 24
    expect(machining.startAt).toBe('2026-11-24T10:00:00.000Z');
    expect(machining.endAt).toBe('2026-11-24T14:00:00.000Z');

    // Assembly must wait for material on Nov 26 at 08:00:
    expect(assembly.startAt).toBe('2026-11-26T08:00:00.000Z');
    expect(assembly.endAt).toBe('2026-11-26T11:00:00.000Z');
    expect(assembly.materialWaitMinutes).toBeGreaterThan(0);

    // QC follows Assembly on Nov 26:
    expect(qc.startAt).toBe('2026-11-26T11:00:00.000Z');
    expect(qc.endAt).toBe('2026-11-26T13:00:00.000Z');
  });

  it('correctly calculates slack and identifies the critical path in parallel task networks', () => {
    const horizon = '2026-11-24T08:00:00.000Z';

    // Task Network:
    // START -> TASK-A (long path: 6h) -> TASK-C (2h)
    //       -> TASK-B (short path: 2h) -> TASK-C (2h)
    const tasks = [
      { id: 'TASK-A', plannedDurationMinutes: 360 }, // 6 hours
      { id: 'TASK-B', plannedDurationMinutes: 120 }, // 2 hours (has 4h slack!)
      { id: 'TASK-C', plannedDurationMinutes: 120, predecessorTaskIds: ['TASK-A', 'TASK-B'] },
    ];

    const result = scheduleTasks({
      tasks,
      startHorizon: horizon,
      calendar: calendar8h,
    });

    const taskA = result.scheduledTasks.find((t) => t.taskId === 'TASK-A')!;
    const taskB = result.scheduledTasks.find((t) => t.taskId === 'TASK-B')!;
    const taskC = result.scheduledTasks.find((t) => t.taskId === 'TASK-C')!;

    expect(taskA.isCriticalPath).toBe(true);
    expect(taskA.slackMinutes).toBe(0);

    expect(taskB.isCriticalPath).toBe(false);
    expect(taskB.slackMinutes).toBe(240); // 4 hours = 240 min of slack

    expect(taskC.isCriticalPath).toBe(true);
    expect(result.criticalPath).toEqual(['TASK-A', 'TASK-C']);
  });

  describe('finite-capacity dry-run', () => {
    const interval = { startAt: '2026-11-24T08:00:00.000Z', endAt: '2026-11-24T16:00:00.000Z' };

    it('places concurrent tasks on separate qualified resources and keeps dependent work after its predecessor', () => {
      const result = scheduleFiniteCapacity({
        startHorizon: '2026-11-24T08:00:00.000Z',
        tasks: [
          { id: 'A', plannedDurationMinutes: 120, predecessorTaskIds: [], requiresTechnician: true, requiresMachine: true, eligibleTechnicianIds: ['T1', 'T2'], compatibleMachineIds: ['M1', 'M2'], materialReady: true },
          { id: 'B', plannedDurationMinutes: 120, predecessorTaskIds: [], requiresTechnician: true, requiresMachine: true, eligibleTechnicianIds: ['T1', 'T2'], compatibleMachineIds: ['M1', 'M2'], materialReady: true },
          { id: 'C', plannedDurationMinutes: 60, predecessorTaskIds: ['A'], requiresTechnician: true, requiresMachine: true, eligibleTechnicianIds: ['T1', 'T2'], compatibleMachineIds: ['M1', 'M2'], materialReady: true },
        ],
        technicianAvailability: { T1: [interval], T2: [interval] },
        machineAvailability: { M1: [interval], M2: [interval] },
      });

      expect(result.tasks.every(task => task.status === 'SCHEDULED')).toBe(true);
      const a = result.tasks.find(task => task.taskId === 'A')!;
      const b = result.tasks.find(task => task.taskId === 'B')!;
      const c = result.tasks.find(task => task.taskId === 'C')!;
      expect(a.technicianId).not.toBe(b.technicianId);
      expect(a.machineId).not.toBe(b.machineId);
      expect(Date.parse(c.startAt!)).toBeGreaterThanOrEqual(Date.parse(a.endAt!));
    });

    it('marks missing materials and their dependent tasks unscheduled with explicit reasons', () => {
      const result = scheduleFiniteCapacity({
        startHorizon: '2026-11-24T08:00:00.000Z',
        tasks: [
          { id: 'A', plannedDurationMinutes: 60, predecessorTaskIds: [], requiresTechnician: true, requiresMachine: false, eligibleTechnicianIds: ['T1'], materialReady: false },
          { id: 'B', plannedDurationMinutes: 60, predecessorTaskIds: ['A'], requiresTechnician: true, requiresMachine: false, eligibleTechnicianIds: ['T1'], materialReady: true },
        ],
        technicianAvailability: { T1: [interval] },
        machineAvailability: {},
      });

      expect(result.tasks[0]).toMatchObject({ status: 'UNSCHEDULED', reasons: ['Required materials are not reserved or issued'] });
      expect(result.tasks[1]).toMatchObject({ status: 'UNSCHEDULED', reasons: ['A predecessor task could not be scheduled'] });
    });

    it('does not split a task across a break or infer an unqualified resource', () => {
      const result = scheduleFiniteCapacity({
        startHorizon: '2026-11-24T08:00:00.000Z',
        tasks: [{ id: 'A', plannedDurationMinutes: 240, predecessorTaskIds: [], requiresTechnician: true, requiresMachine: false, eligibleTechnicianIds: ['T1'], materialReady: true }],
        technicianAvailability: { T1: [
          { startAt: '2026-11-24T08:00:00.000Z', endAt: '2026-11-24T10:00:00.000Z' },
          { startAt: '2026-11-24T10:30:00.000Z', endAt: '2026-11-24T12:30:00.000Z' },
        ] },
        machineAvailability: {},
      });

      expect(result.tasks[0]).toMatchObject({ status: 'UNSCHEDULED', reasons: ['No contiguous qualified resource window fits the task duration'] });
    });
  });
});
