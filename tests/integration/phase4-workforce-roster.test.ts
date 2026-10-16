import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { MastersService } from '@/server/modules/masters/service';
import { AvailabilityService } from '@/server/modules/planning/availability';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 4: Verified Workforce, Machine Capability & Published Availability', () => {
  let fixture: FactoryFixture;
  let mastersService: MastersService;
  let availabilityService: AvailabilityService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    mastersService = new MastersService(fixture.db);
    availabilityService = new AvailabilityService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Skill Level Semantics (0-4) and Assessment History
  // -----------------------------------------------------------------
  it('enforces 0-4 skill scale, records immutable assessment history, and rejects level > 4', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const techId = fixture.alpha.masters.technicianId;
    const skillId = fixture.alpha.masters.skillId;

    // 1. Attempt assigning level 5 (exceeds scaleMax 4) -> must throw BadRequestError
    await expect(
      mastersService.assignSkill(
        owner,
        techId,
        { skillId, level: 5 },
        'idemp-skill-level-5'
      )
    ).rejects.toThrowError(BadRequestError);

    // 2. Assign valid level 3 with VERIFIED status and evidence
    const assignRes = await mastersService.assignSkill(
      owner,
      techId,
      {
        skillId,
        level: 3,
        assessmentStatus: 'VERIFIED',
        evidence: 'DOC-SKILL-CERT-2026',
        notes: 'Demonstrated independent setup on 5-axis CNC',
      },
      'idemp-skill-level-3'
    );

    expect(assignRes.data.level).toBe(3);
    expect(assignRes.data.assessmentStatus).toBe('VERIFIED');
    expect(assignRes.data.evidence).toBe('DOC-SKILL-CERT-2026');

    // 3. Verify immutable assessment history was recorded
    const history = await fixture.db.skillAssessmentHistory.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, technicianId: techId, skillId },
      orderBy: { createdAt: 'desc' },
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].level).toBe(3);
    expect(history[0].assessmentStatus).toBe('VERIFIED');
    expect(history[0].assessedBy).toBe(owner.userId);

    // 4. Revoke skill and verify revocation audit record
    const revokeRes = await mastersService.revokeSkill(
      owner,
      techId,
      skillId,
      { notes: 'Lapsed recertification requirement' },
      'idemp-skill-revoke'
    );

    expect(revokeRes.data.assessmentStatus).toBe('REVOKED');

    const historyAfterRevoke = await fixture.db.skillAssessmentHistory.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, technicianId: techId, skillId },
      orderBy: { createdAt: 'desc' },
    });
    expect(historyAfterRevoke[0].assessmentStatus).toBe('REVOKED');
    expect(historyAfterRevoke[0].level).toBe(0);
  });

  // -----------------------------------------------------------------
  // 2. Mandatory Certifications, Exact Validity & Non-Waivable Expiry
  // -----------------------------------------------------------------
  it('manages certifications, enforces valid date order, and validates precise slot boundaries', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const techId = fixture.alpha.masters.technicianId;

    // Create a mandatory aerospace safety certificate
    const certRes = await fixture.db.certification.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        code: 'AERO-HOT-WORK-01',
        name: 'Aerospace Hot Work & Laser Safety',
        issuer: 'Civil Aviation Authority',
      },
    });

    // 1. Rejects invalid date order (validUntil before issuedDate)
    await expect(
      mastersService.assignCert(
        owner,
        techId,
        {
          certificationId: certRes.id,
          certificateNumber: 'HW-2026-99',
          issuedDate: '2026-11-01',
          validUntil: '2026-10-01', // Before issuedDate!
        },
        'idemp-cert-invalid-dates'
      )
    ).rejects.toThrowError(BadRequestError);

    // 2. Assign valid certificate active from 2026-10-01 to 2026-10-31
    const certAssignRes = await mastersService.assignCert(
      owner,
      techId,
      {
        certificationId: certRes.id,
        certificateNumber: 'HW-2026-001',
        issuedDate: '2026-10-01',
        validUntil: '2026-10-31',
        scope: 'LASER_CUTTING,HOT_WORK',
      },
      'idemp-cert-valid'
    );

    expect(certAssignRes.data.status).toBe('ACTIVE');
    expect(certAssignRes.data.validFromDate).toBeDefined();
    expect(certAssignRes.data.expiresAtDate).toBeDefined();

    // 3. Test Eligibility Service:
    // Slot entirely within valid period: 2026-10-15 08:00 to 16:00 -> ELIGIBLE
    const validSlotResult = await availabilityService.verifyTechnicianEligibility(owner, {
      technicianId: techId,
      requiredCertifications: [{ certificationId: certRes.id }],
      slotStart: new Date('2026-10-15T08:00:00.000Z'),
      slotEnd: new Date('2026-10-15T16:00:00.000Z'),
    });
    expect(validSlotResult.eligible).toBe(true);
    expect(validSlotResult.violations).toHaveLength(0);

    // Slot that extends past certificate expiration: 2026-10-31 20:00 to 2026-11-01 02:00 -> INELIGIBLE
    const expiredSlotResult = await availabilityService.verifyTechnicianEligibility(owner, {
      technicianId: techId,
      requiredCertifications: [{ certificationId: certRes.id }],
      slotStart: new Date('2026-10-31T20:00:00.000Z'),
      slotEnd: new Date('2026-11-01T02:00:00.000Z'),
    });
    expect(expiredSlotResult.eligible).toBe(false);
    expect(expiredSlotResult.violations[0]).toContain('expires on');

    // 4. Revocation renders technician ineligible even during previously valid dates
    await mastersService.revokeCert(
      owner,
      techId,
      certRes.id,
      { notes: 'Security audit failure' },
      'idemp-cert-revoke'
    );

    const revokedResult = await availabilityService.verifyTechnicianEligibility(owner, {
      technicianId: techId,
      requiredCertifications: [{ certificationId: certRes.id }],
      slotStart: new Date('2026-10-15T08:00:00.000Z'),
      slotEnd: new Date('2026-10-15T16:00:00.000Z'),
    });
    expect(revokedResult.eligible).toBe(false);
    expect(revokedResult.violations[0]).toContain('revoked or inactive');
  });

  // -----------------------------------------------------------------
  // 3. Machine Downtime & Capacity
  // -----------------------------------------------------------------
  it('schedules machine downtime and validates downtime intervals', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const machineId = fixture.alpha.masters.machineId;

    // 1. Rejects invalid interval where startAt >= endAt
    await expect(
      mastersService.createMachineDowntime(
        owner,
        {
          machineId,
          reason: 'Spindle calibration',
          startAt: '2026-11-10T12:00:00.000Z',
          endAt: '2026-11-10T10:00:00.000Z', // Before startAt!
        },
        'idemp-dt-invalid'
      )
    ).rejects.toThrowError(BadRequestError);

    // 2. Schedules valid downtime
    const dtRes = await mastersService.createMachineDowntime(
      owner,
      {
        machineId,
        reason: 'Annual Preventive Maintenance (PM)',
        startAt: '2026-11-10T08:00:00.000Z',
        endAt: '2026-11-10T16:00:00.000Z',
        notes: 'Tool changer motor rebuild',
      },
      'idemp-dt-valid'
    );

    expect(dtRes.data.status).toBe('SCHEDULED');
    expect(dtRes.data.reason).toBe('Annual Preventive Maintenance (PM)');

    const downtimes = await mastersService.listMachineDowntimes(owner, machineId);
    expect(downtimes.length).toBeGreaterThanOrEqual(1);
    expect(downtimes[0].id).toBe(dtRes.data.id);
  });

  // -----------------------------------------------------------------
  // 4. Shift Templates & Published Roster Intervals
  // -----------------------------------------------------------------
  it('creates shift templates and publishes roster intervals', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const techId = fixture.alpha.masters.technicianId;

    // 1. Create standard Morning Shift Template
    const shift = await mastersService.createShiftTemplate(
      owner,
      {
        code: 'SHIFT-MORNING',
        name: 'Morning Shift (08:00 - 16:30)',
        startTime: '08:00',
        endTime: '16:30',
        breakMinutes: 60,
      },
      'idemp-st-morning'
    );

    expect(shift.data.code).toBe('SHIFT-MORNING');
    expect(shift.data.breakMinutes).toBe(60);

    // 2. Publish Roster Interval for Technician with lunch break
    const rosterRes = await mastersService.publishRosterIntervals(
      owner,
      {
        intervals: [
          {
            technicianId: techId,
            shiftTemplateId: shift.data.id,
            intervalType: 'SHIFT',
            startAt: '2026-11-12T08:00:00.000Z',
            endAt: '2026-11-12T16:00:00.000Z',
            breakIntervals: [{ start: '12:00', end: '13:00' }],
            notes: 'Production Day Shift',
          },
        ],
      },
      'idemp-roster-publish-01'
    );

    expect(rosterRes.data).toHaveLength(1);
    expect(rosterRes.data[0].status).toBe('PUBLISHED');

    // 3. Query Roster Intervals
    const list = await mastersService.listRosterIntervals(owner, {
      technicianId: techId,
      startAt: '2026-11-12T00:00:00.000Z',
      endAt: '2026-11-12T23:59:59.000Z',
    });
    expect(list).toHaveLength(1);
  });

  // -----------------------------------------------------------------
  // 5. Authoritative Availability Interval Service
  // -----------------------------------------------------------------
  it('computes exact available intervals, fragments shifts across breaks, and obeys "unknown availability is never free"', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const techId = fixture.alpha.masters.technicianId;

    // 1. Query for date with NO published roster -> returns [] (Unknown availability never silently means free)
    const emptyAvailability = await availabilityService.getAvailableIntervals(owner, {
      resourceType: 'TECHNICIAN',
      resourceId: techId,
      startAt: new Date('2026-11-20T08:00:00.000Z'),
      endAt: new Date('2026-11-20T17:00:00.000Z'),
    });
    expect(emptyAvailability).toEqual([]);

    // 2. Query for date WITH published roster (2026-11-12: 08:00 - 16:00 with break 12:00 - 13:00)
    const shiftAvailability = await availabilityService.getAvailableIntervals(owner, {
      resourceType: 'TECHNICIAN',
      resourceId: techId,
      startAt: new Date('2026-11-12T08:00:00.000Z'),
      endAt: new Date('2026-11-12T16:00:00.000Z'),
    });

    // Should fragment into two available working segments:
    // Segment 1: 08:00 to 12:00 (4 hours = 240 mins)
    // Segment 2: 13:00 to 16:00 (3 hours = 180 mins)
    expect(shiftAvailability).toHaveLength(2);
    expect(shiftAvailability[0].durationMinutes).toBe(240);
    expect(shiftAvailability[1].durationMinutes).toBe(180);

    // 3. Publish an approved training leave for 14:00 - 16:00
    await mastersService.publishRosterIntervals(
      owner,
      {
        intervals: [
          {
            technicianId: techId,
            intervalType: 'TRAINING',
            startAt: '2026-11-12T14:00:00.000Z',
            endAt: '2026-11-12T16:00:00.000Z',
            notes: 'Fire safety training',
          },
        ],
      },
      'idemp-roster-leave-01'
    );

    // Re-query availability: afternoon segment is now truncated from [13:00, 16:00] to [13:00, 14:00]
    const updatedAvailability = await availabilityService.getAvailableIntervals(owner, {
      resourceType: 'TECHNICIAN',
      resourceId: techId,
      startAt: new Date('2026-11-12T08:00:00.000Z'),
      endAt: new Date('2026-11-12T16:00:00.000Z'),
    });

    expect(updatedAvailability).toHaveLength(2);
    expect(updatedAvailability[0].durationMinutes).toBe(240); // 08:00 - 12:00
    expect(updatedAvailability[1].durationMinutes).toBe(60);  // 13:00 - 14:00 (60 mins)
  });
});
