import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError } from '@/domain/errors';
import { AvailabilityService, SkillRequirement, CertificationRequirement } from './availability';

export interface RecommendTechniciansInput {
  taskId?: string;
  departmentId?: string;
  slotStart: Date;
  slotEnd: Date;
  minSkillLevels?: SkillRequirement[];
  requiredCertifications?: CertificationRequirement[];
  requiredFacilityId?: string;
}

export interface TechnicianCandidateDTO {
  technicianId: string;
  code: string;
  name: string;
  score: number;
  activeTasksCount: number;
  scheduledMinutes: number;
  isEligible: boolean;
  violations: string[];
  rationale: string;
}

export interface TechnicianRecommendationReportDTO {
  workspaceId: string;
  taskId?: string;
  slotStart: string;
  slotEnd: string;
  eligibleCount: number;
  candidates: TechnicianCandidateDTO[];
  qualifiedCapacityGap: string | null;
  recommendedTechnicianId: string | null;
}

export class TechnicianRecommendationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly availabilityService: AvailabilityService = new AvailabilityService(prisma)
  ) {}

  /**
   * Ranks only strictly qualified technicians based on verified skills, non-expired certifications,
   * actual current active workload, and transparent slack metrics.
   * Zero fabricated credentials or unqualified recommendations.
   */
  async recommendTechnicians(
    principal: Principal,
    input: RecommendTechniciansInput
  ): Promise<TechnicianRecommendationReportDTO> {
    requireAnyPermission(principal, ['planning.read', 'task.assign', 'order.release', 'access.manage']);

    const workspaceId = principal.workspaceId;

    let targetDepartmentId = input.departmentId;
    let minSkills = input.minSkillLevels || [];
    let requiredCerts = input.requiredCertifications || [];

    // If taskId is provided, fetch task node requirements
    if (input.taskId) {
      const task = await this.prisma.task.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.taskId,
          },
        },
        include: {
          instance: {
            include: {
              workflowVersion: {
                include: { nodes: true },
              },
            },
          },
        },
      });

      if (!task) {
        throw new NotFoundError(`Task '${input.taskId}' not found.`);
      }

      const node = task.instance.workflowVersion.nodes.find((n) => n.key === task.nodeKey);
      if (node?.departmentId && !targetDepartmentId) {
        targetDepartmentId = node.departmentId;
      }

      if (node?.requirementsJson) {
        try {
          const reqs = JSON.parse(node.requirementsJson);
          if (reqs.requiredSkills && minSkills.length === 0) {
            minSkills = reqs.requiredSkills.map((s: any) => ({
              skillId: s.skillId,
              minLevel: s.minLevel || 1,
            }));
          }
          if (reqs.requiredCertIds && requiredCerts.length === 0) {
            requiredCerts = reqs.requiredCertIds.map((cId: string) => ({
              certificationId: cId,
            }));
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    // Fetch technicians in workspace (filter by department if specified)
    const technicians = await this.prisma.technician.findMany({
      where: {
        workspaceId,
        isActive: true,
        ...(targetDepartmentId ? { departmentId: targetDepartmentId } : {}),
      },
      include: {
        skills: { include: { skill: true } },
        certifications: { include: { certification: true } },
      },
    });

    const candidates: TechnicianCandidateDTO[] = [];

    for (const tech of technicians) {
      const eligibility = await this.availabilityService.verifyTechnicianEligibility(principal, {
        technicianId: tech.id,
        minSkillLevels: minSkills,
        requiredCertifications: requiredCerts,
        requiredFacilityId: input.requiredFacilityId,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
      });

      // Compute current active tasks count and bookings
      const [activeTasksCount, bookings] = await Promise.all([
        this.prisma.task.count({
          where: {
            workspaceId,
            assignedTechnicianId: tech.id,
            status: { in: ['ASSIGNED', 'RUNNING', 'PAUSED'] },
          },
        }),
        this.prisma.resourceBooking.findMany({
          where: {
            workspaceId,
            resourceType: 'TECHNICIAN',
            resourceId: tech.id,
            startAt: { lt: input.slotEnd },
            endAt: { gt: input.slotStart },
          },
        }),
      ]);

      let scheduledMinutes = 0;
      for (const b of bookings) {
        scheduledMinutes += Math.max(
          0,
          Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60000)
        );
      }

      // Base score 100 minus active tasks penalty (10 pts) minus booked minutes penalty
      let score = eligibility.eligible ? 100 - activeTasksCount * 15 - Math.min(50, Math.round(scheduledMinutes / 10)) : 0;
      if (score < 0) score = 0;

      let rationale = '';
      if (!eligibility.eligible) {
        rationale = `Disqualified: ${eligibility.violations.join('; ')}`;
      } else {
        rationale = `Fully qualified with ${activeTasksCount} active task(s) and ${scheduledMinutes} mins existing bookings.`;
      }

      candidates.push({
        technicianId: tech.id,
        code: tech.code,
        name: tech.name,
        score,
        activeTasksCount,
        scheduledMinutes,
        isEligible: eligibility.eligible,
        violations: eligibility.violations,
        rationale,
      });
    }

    // Sort: eligible first, then highest score
    candidates.sort((a, b) => {
      if (a.isEligible && !b.isEligible) return -1;
      if (!a.isEligible && b.isEligible) return 1;
      return b.score - a.score;
    });

    const eligibleList = candidates.filter((c) => c.isEligible);
    const qualifiedCapacityGap =
      eligibleList.length === 0
        ? 'No technician has verified qualifications and active status for the requested requirements.'
        : null;

    return {
      workspaceId,
      taskId: input.taskId,
      slotStart: input.slotStart.toISOString(),
      slotEnd: input.slotEnd.toISOString(),
      eligibleCount: eligibleList.length,
      candidates,
      qualifiedCapacityGap,
      recommendedTechnicianId: eligibleList.length > 0 ? eligibleList[0].technicianId : null,
    };
  }
}
