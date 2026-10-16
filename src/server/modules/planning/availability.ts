import { Prisma, PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError } from '@/domain/errors';

export interface TimeInterval {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
}

export interface AvailabilityQuery {
  resourceType: 'TECHNICIAN' | 'MACHINE';
  resourceId: string;
  startAt: Date;
  endAt: Date;
  excludeTaskId?: string;
}

export interface SkillRequirement {
  skillId: string;
  minLevel: number;
}

export interface CertificationRequirement {
  certificationId: string;
  scope?: string;
}

export interface EligibilityQuery {
  technicianId: string;
  minSkillLevels?: SkillRequirement[];
  requiredCertifications?: CertificationRequirement[];
  requiredFacilityId?: string;
  slotStart: Date;
  slotEnd: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  violations: string[];
}

export class AvailabilityService {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient = defaultDb) {}

  /**
   * Authoritative Availability Interval Service.
   *
   * Computes exact working intervals from:
   * Published roster shifts (SHIFT, OVERTIME)
   *   MINUS shift breaks
   *   MINUS exclusions (LEAVE, TRAINING, MAINTENANCE, DOWNTIME)
   *   MINUS confirmed bookings (ResourceBooking)
   *
   * Rule: Unknown/draft availability never silently means free!
   */
  async getAvailableIntervals(
    principal: Principal,
    query: AvailabilityQuery
  ): Promise<TimeInterval[]> {
    requireAnyPermission(principal, ['planning.read', 'resource.manage', 'task.assign', 'planning.write']);

    const { resourceType, resourceId, startAt, endAt } = query;

    // 1. Fetch published working shifts for this resource
    const shifts = await this.prisma.rosterInterval.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(resourceType === 'TECHNICIAN' ? { technicianId: resourceId } : { machineId: resourceId }),
        status: 'PUBLISHED',
        intervalType: { in: ['SHIFT', 'OVERTIME'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      orderBy: { startAt: 'asc' },
    });

    if (shifts.length === 0) {
      // Unknown or draft availability never silently means free
      return [];
    }

    // 2. Fetch machine capacity if resource is a MACHINE
    let machineCapacity = 1;
    if (resourceType === 'MACHINE') {
      const machine = await this.prisma.machine.findFirst({
        where: { id: resourceId, workspaceId: principal.workspaceId },
      });
      if (!machine) throw new NotFoundError(`Machine '${resourceId}' not found`);
      machineCapacity = machine.capacityUnits || 1;
    }

    // 3. Segment shifts by clipping to query window and subtracting shift breaks
    let workingSegments: Array<{ start: Date; end: Date }> = [];

    for (const shift of shifts) {
      const segStart = shift.startAt < startAt ? startAt : shift.startAt;
      const segEnd = shift.endAt > endAt ? endAt : shift.endAt;

      if (segStart >= segEnd) continue;

      let currentSegments = [{ start: segStart, end: segEnd }];

      // Parse break intervals if any
      let breaks: Array<{ start: string; end: string }> = [];
      try {
        breaks = JSON.parse(shift.breakIntervalsJson || '[]');
      } catch {
        breaks = [];
      }

      for (const brk of breaks) {
        // Break times are formatted as HH:mm
        const [bStartH, bStartM] = brk.start.split(':').map(Number);
        const [bEndH, bEndM] = brk.end.split(':').map(Number);

        const breakStart = new Date(shift.startAt);
        breakStart.setUTCHours(bStartH, bStartM, 0, 0);

        const breakEnd = new Date(shift.startAt);
        breakEnd.setUTCHours(bEndH, bEndM, 0, 0);

        if (breakEnd <= breakStart) {
          // Break spans midnight
          breakEnd.setUTCDate(breakEnd.getUTCDate() + 1);
        }

        const nextSegments: Array<{ start: Date; end: Date }> = [];
        for (const seg of currentSegments) {
          if (breakEnd <= seg.start || breakStart >= seg.end) {
            // No overlap with break
            nextSegments.push(seg);
          } else {
            // Overlaps with break -> carve out
            if (seg.start < breakStart) {
              nextSegments.push({ start: seg.start, end: breakStart });
            }
            if (seg.end > breakEnd) {
              nextSegments.push({ start: breakEnd, end: seg.end });
            }
          }
        }
        currentSegments = nextSegments;
      }

      workingSegments.push(...currentSegments);
    }

    // 4. Fetch exclusions
    const blockedRanges: Array<{ start: Date; end: Date }> = [];

    if (resourceType === 'TECHNICIAN') {
      const leaves = await this.prisma.rosterInterval.findMany({
        where: {
          workspaceId: principal.workspaceId,
          technicianId: resourceId,
          status: 'PUBLISHED',
          intervalType: { in: ['LEAVE', 'TRAINING', 'HOLIDAY'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      for (const l of leaves) {
        blockedRanges.push({ start: l.startAt, end: l.endAt });
      }
    } else {
      // Machine downtimes and maintenance
      const downtimes = await this.prisma.machineDowntime.findMany({
        where: {
          workspaceId: principal.workspaceId,
          machineId: resourceId,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      for (const dt of downtimes) {
        blockedRanges.push({ start: dt.startAt, end: dt.endAt });
      }

      const maintenance = await this.prisma.rosterInterval.findMany({
        where: {
          workspaceId: principal.workspaceId,
          machineId: resourceId,
          status: 'PUBLISHED',
          intervalType: 'MAINTENANCE',
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      for (const m of maintenance) {
        blockedRanges.push({ start: m.startAt, end: m.endAt });
      }
    }

    // 5. Fetch confirmed bookings
    const bookings = await this.prisma.resourceBooking.findMany({
      where: {
        workspaceId: principal.workspaceId,
        resourceType,
        resourceId,
        ...(query.excludeTaskId ? { taskId: { not: query.excludeTaskId } } : {}),
        status: 'CONFIRMED',
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });

    if (resourceType === 'TECHNICIAN' || machineCapacity <= 1) {
      // Exclusive resource: any booking blocks the interval
      for (const b of bookings) {
        blockedRanges.push({ start: b.startAt, end: b.endAt });
      }
    } else {
      // Machine with capacity > 1: check overlapping concurrent bookings
      for (const b of bookings) {
        const overlapping = bookings.filter(
          (other) => other.startAt < b.endAt && other.endAt > b.startAt
        );
        if (overlapping.length >= machineCapacity) {
          blockedRanges.push({ start: b.startAt, end: b.endAt });
        }
      }
    }

    // 6. Subtract all blocked ranges from working segments
    let available = workingSegments;
    for (const blocked of blockedRanges) {
      const nextAvailable: Array<{ start: Date; end: Date }> = [];
      for (const seg of available) {
        if (blocked.end <= seg.start || blocked.start >= seg.end) {
          nextAvailable.push(seg);
        } else {
          if (seg.start < blocked.start) {
            nextAvailable.push({ start: seg.start, end: blocked.start });
          }
          if (seg.end > blocked.end) {
            nextAvailable.push({ start: blocked.end, end: seg.end });
          }
        }
      }
      available = nextAvailable;
    }

    // Filter out 0 or negative duration and sort
    return available
      .filter((s) => s.end.getTime() - s.start.getTime() > 0)
      .map((s) => ({
        startAt: s.start,
        endAt: s.end,
        durationMinutes: Math.round((s.end.getTime() - s.start.getTime()) / 60000),
      }))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  /**
   * Verifies technician qualification, assessment validity, and non-waivable certificates.
   */
  async verifyTechnicianEligibility(
    principal: Principal,
    query: EligibilityQuery
  ): Promise<EligibilityResult> {
    requireAnyPermission(principal, ['planning.read', 'resource.manage']);

    const violations: string[] = [];

    const tech = await this.prisma.technician.findFirst({
      where: { id: query.technicianId, workspaceId: principal.workspaceId, isActive: true },
      include: {
        skills: { include: { skill: true } },
        certifications: { include: { certification: true } },
      },
    });

    if (!tech) {
      return { eligible: false, violations: [`Technician '${query.technicianId}' not found or inactive`] };
    }

    // Facility match check if required
    if (query.requiredFacilityId && tech.facilityId && tech.facilityId !== query.requiredFacilityId) {
      // Check if granted multi-site access via membership
      let hasGrant = false;
      if (tech.membershipId) {
        const grant = await this.prisma.membershipFacilityGrant.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            membershipId: tech.membershipId,
            facilityId: query.requiredFacilityId,
          },
        });
        hasGrant = !!grant;
      }
      if (!hasGrant) {
        violations.push(
          `Technician '${tech.name}' belongs to facility '${tech.facilityId}' and lacks access to required facility '${query.requiredFacilityId}'`
        );
      }
    }

    // Verify required skills
    for (const req of query.minSkillLevels || []) {
      const found = tech.skills.find((s) => s.skillId === req.skillId);
      if (!found) {
        violations.push(`Technician '${tech.name}' lacks required skill '${req.skillId}'`);
        continue;
      }

      if (found.level < req.minLevel) {
        violations.push(
          `Technician '${tech.name}' skill '${found.skill.name}' level ${found.level} is below required level ${req.minLevel}`
        );
      }

      // Check assessment status: only VERIFIED is qualified
      if (found.assessmentStatus !== 'VERIFIED') {
        violations.push(
          `Technician '${tech.name}' skill '${found.skill.name}' has unverified status '${found.assessmentStatus}'`
        );
      }

      // Check skill expiration if set
      if (found.expiresAt && found.expiresAt < query.slotEnd) {
        violations.push(
          `Technician '${tech.name}' skill '${found.skill.name}' expires on ${found.expiresAt.toISOString()}, before task slot end ${query.slotEnd.toISOString()}`
        );
      }
    }

    // Verify required certifications (non-waivable)
    for (const req of query.requiredCertifications || []) {
      const found = tech.certifications.find((c) => c.certificationId === req.certificationId);
      if (!found) {
        violations.push(`Technician '${tech.name}' lacks mandatory certificate '${req.certificationId}'`);
        continue;
      }

      if (found.status !== 'ACTIVE' || found.revokedAt) {
        violations.push(
          `Technician '${tech.name}' certificate '${found.certification.name}' is revoked or inactive (status: ${found.status})`
        );
      }

      // Exact valid slot check: certificate must cover entire slot [slotStart, slotEnd]
      const validFrom = found.validFromDate || new Date(`${found.issuedDate}T00:00:00.000Z`);
      const expiresAt = found.expiresAtDate || new Date(`${found.validUntil}T23:59:59.999Z`);

      if (validFrom > query.slotStart) {
        violations.push(
          `Technician '${tech.name}' certificate '${found.certification.name}' is not yet effective (effective: ${validFrom.toISOString()}, slotStart: ${query.slotStart.toISOString()})`
        );
      }

      if (expiresAt < query.slotEnd) {
        violations.push(
          `Technician '${tech.name}' certificate '${found.certification.name}' expires on ${expiresAt.toISOString()}, before task slot end ${query.slotEnd.toISOString()}`
        );
      }
    }

    return {
      eligible: violations.length === 0,
      violations,
    };
  }
}

export const availabilityService = new AvailabilityService();
