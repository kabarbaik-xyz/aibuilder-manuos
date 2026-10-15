import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';

describe('F06: Organization, Calendars & Resource Masters', () => {
  let testDb: TestDatabase;
  let service: MastersService;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    service = new MastersService(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('creates department, work calendar, and calendar exception', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    const dept = await service.createDepartment(
      access.principal,
      { code: 'CNC-DEPT', name: 'Precision CNC Machining' },
      'cmd-dept-1'
    );
    expect(dept.data.code).toBe('CNC-DEPT');

    const cal = await service.createCalendar(
      access.principal,
      {
        code: 'SHIFT-STANDARD',
        name: 'Standard Mon-Sat Shift (07:00-15:30)',
        timezone: 'Asia/Jakarta',
        weeklyShiftsJson: JSON.stringify([
          { dayOfWeek: 1, start: '07:00', end: '15:30' },
          { dayOfWeek: 2, start: '07:00', end: '15:30' },
          { dayOfWeek: 3, start: '07:00', end: '15:30' },
          { dayOfWeek: 4, start: '07:00', end: '15:30' },
          { dayOfWeek: 5, start: '07:00', end: '15:30' },
          { dayOfWeek: 6, start: '07:00', end: '15:30' },
        ]),
      },
      'cmd-cal-1'
    );
    expect(cal.data.code).toBe('SHIFT-STANDARD');

    // Add exception
    const ex = await service.addCalendarException(
      access.principal,
      cal.data.id,
      {
        date: '2026-11-25',
        workingIntervalsJson: JSON.stringify([]),
        reason: 'National Holiday (Non-working)',
      },
      'cmd-ex-1'
    );
    expect(ex.data.date).toBe('2026-11-25');
  });

  it('creates machine classes, machines, and queries dynamic resource context', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    const mc = await service.createMachineClass(
      access.principal,
      {
        code: 'CNC-MILL-5AXIS',
        name: '5-Axis Milling Machine',
        capabilitiesJson: JSON.stringify(['MILLING', 'DRILLING']),
      },
      'cmd-mc-1'
    );

    const cal = await service.createCalendar(
      access.principal,
      {
        code: 'CAL-CNC',
        name: 'CNC Operating Calendar',
        timezone: 'Asia/Jakarta',
      },
      'cmd-cal-cnc'
    );

    const machine = await service.createMachine(
      access.principal,
      {
        code: 'CNC-01',
        name: 'Haas UMC-750 #1',
        machineClassId: mc.data.id,
        calendarId: cal.data.id,
        status: 'AVAILABLE',
      },
      'cmd-m-1'
    );

    // Initial context: machine is available
    const ctx1 = await service.getResourceContext(
      access.principal,
      { machineIds: [machine.data.id] },
      '2026-11-24'
    );
    expect(ctx1.machines[0].isAvailable).toBe(true);

    // Update machine status to MAINTENANCE in database
    await testDb.db.machine.update({
      where: { id: machine.data.id },
      data: { status: 'MAINTENANCE' },
    });

    // Query context again: availability dynamically changes to false (not a code constant!)
    const ctx2 = await service.getResourceContext(
      access.principal,
      { machineIds: [machine.data.id] },
      '2026-11-24'
    );
    expect(ctx2.machines[0].isAvailable).toBe(false);
  });

  it('assigns skills and certificates to technicians with scale constraints and expiration detection', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    const skill = await service.createSkill(
      access.principal,
      { code: 'WELDING', name: 'Structural TIG Welding', scaleMax: 5 },
      'cmd-sk-1'
    );

    const cert = await service.createCertification(
      access.principal,
      { code: 'WABO-WELD', name: 'WABO Certified Structural Welder', issuer: 'WABO' },
      'cmd-cert-1'
    );

    const tech = await service.createTechnician(
      access.principal,
      {
        code: 'TECH-HW',
        name: 'Hendra Wijaya',
        maxWeeklyMinutes: 2400,
      },
      'cmd-tech-1'
    );

    // Assign skill level 4
    const ts = await service.assignSkill(
      access.principal,
      tech.data.id,
      { skillId: skill.data.id, level: 4 },
      'cmd-ts-1'
    );
    expect(ts.data.level).toBe(4);

    // Reject level exceeding scaleMax
    await expect(
      service.assignSkill(
        access.principal,
        tech.data.id,
        { skillId: skill.data.id, level: 6 },
        'cmd-ts-invalid'
      )
    ).rejects.toThrow(/cannot exceed scale max/i);

    // Assign cert expiring on 2026-11-01
    await service.assignCert(
      access.principal,
      tech.data.id,
      {
        certificationId: cert.data.id,
        certificateNumber: 'CERT-99812',
        issuedDate: '2025-11-01',
        validUntil: '2026-11-01',
      },
      'cmd-tc-1'
    );

    // Query resource context at 2026-11-24: cert must be detected as expired!
    const ctx = await service.getResourceContext(
      access.principal,
      { technicianIds: [tech.data.id] },
      '2026-11-24'
    );
    expect(ctx.technicians[0].certifications[0].isExpired).toBe(true);
  });

  it('creates order types and versioned QC checklists with typed checks', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER', 'ENGINEER', 'QC'] });

    const orderType = await service.createOrderType(
      access.principal,
      {
        code: 'CUSTOM-CHASSIS',
        name: 'Custom Fabricated Chassis',
        description: 'Standard 19-inch rack enclosures',
      },
      'cmd-ot-1'
    );
    expect(orderType.data.code).toBe('CUSTOM-CHASSIS');

    const checklist = await service.createQcChecklist(
      access.principal,
      {
        code: 'QC-ENCLOSURE',
        name: 'Enclosure Dimensional & Finish Inspection',
        revision: 1,
        checks: [
          {
            code: 'DIM-01',
            description: 'Flange width measurement',
            method: 'MEASUREMENT',
            unit: 'mm',
            limitsJson: JSON.stringify({ min: 480.0, max: 485.0 }),
            isRequired: true,
          },
          {
            code: 'VIS-01',
            description: 'Powder coat surface defects and scratches',
            method: 'VISUAL',
            limitsJson: JSON.stringify({ allowedDefects: 0 }),
            isRequired: true,
          },
        ],
      },
      'cmd-qc-1'
    );
    expect(checklist.data.checks).toHaveLength(2);
    expect(checklist.data.checks[0].method).toBe('MEASUREMENT');
  });
});
