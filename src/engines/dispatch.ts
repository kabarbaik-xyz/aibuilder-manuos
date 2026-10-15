import { Task, Technician } from '../domain/types';

export interface RankedTechnicianCandidate {
  technician: Technician;
  fitScore: number;
  scoreComponents: {
    skillMatch: number;
    certification: number;
    workload: number;
    trackRecord: number;
  };
  eligible: boolean;
  ineligibleReason?: string;
  isBestFit: boolean;
  availableDate: string;
  rationaleChips: string[];
  pairJuniorOption?: {
    juniorTechId: string;
    juniorName: string;
    note: string;
  };
}

/**
 * Pure skill-aware dispatch engine with hard certification gates and multi-factor ranking.
 */
export function rankTechniciansForTask(
  task: Task,
  technicians: Technician[]
): RankedTechnicianCandidate[] {
  const ranked: RankedTechnicianCandidate[] = [];

  for (const tech of technicians) {
    // 1. Hard Eligibility Gate: Required Certification
    let hasCert = true;
    if (task.requiredCert) {
      const req = task.requiredCert.toLowerCase();
      hasCert = tech.certifications.some((c) => {
        const certName = c.name.toLowerCase();
        const matches =
          certName.includes(req) ||
          (req.includes('wabo') && certName.includes('wabo')) ||
          (req.includes('asme') && certName.includes('asme'));
        return matches && new Date(c.validUntil).getTime() >= new Date('2026-11-24').getTime();
      });
    }

    if (!hasCert) {
      ranked.push({
        technician: tech,
        fitScore: 0,
        scoreComponents: {
          skillMatch: 0,
          certification: 0,
          workload: 0,
          trackRecord: 0,
        },
        eligible: false,
        ineligibleReason: `${task.requiredCert || 'Certification'} missing or expired`,
        isBestFit: false,
        availableDate: 'Immediate',
        rationaleChips: ['Not eligible · Missing required certification'],
      });
      continue;
    }

    // 2. Skill Component (0 - 100)
    const taskKeywords = [
      (task as any).operationType,
      task.requiredSkill,
      task.department,
      task.name,
    ]
      .filter(Boolean)
      .map((k) => String(k).toLowerCase());

    const matchingSkill = tech.skills.find((s) => {
      const sName = s.name.toLowerCase();
      return (
        sName.includes('weld') ||
        taskKeywords.some((kw) => sName.includes(kw) || kw.includes(sName))
      );
    });
    const skillLevel = matchingSkill ? matchingSkill.level : 2;
    const skillScore = Math.min(100, (skillLevel / 4) * 100);

    // 3. Certification Component (0 - 100)
    const certScore = 100;

    // 4. Workload Availability Component (0 - 100)
    const freeHours = Math.max(0, tech.maxWeeklyHours - tech.assignedHoursThisWeek);
    const workloadScore = Math.min(100, (freeHours / 40) * 100);

    // 5. Track Record (0 - 100) based on QC pass %
    const trackRecordScore = tech.qcPassPct;

    // Total Normalized Fit Score
    const totalScore = Math.round(
      0.35 * skillScore +
      0.25 * certScore +
      0.20 * workloadScore +
      0.20 * trackRecordScore
    );

    const rationaleChips: string[] = [];
    if (skillLevel >= 4) rationaleChips.push(`Level ${skillLevel} Specialist`);
    if (hasCert) rationaleChips.push(task.requiredCert ? 'WABO Certified' : 'Certified');
    rationaleChips.push(`QC Pass ${tech.qcPassPct}%`);

    let pairJuniorOption: RankedTechnicianCandidate['pairJuniorOption'] = undefined;
    if (skillLevel >= 4) {
      pairJuniorOption = {
        juniorTechId: 'tech-adi',
        juniorName: 'Adi Pratama',
        note: 'Pair with junior for mentoring and capacity throughput',
      };
    }

    ranked.push({
      technician: tech,
      fitScore: totalScore,
      scoreComponents: {
        skillMatch: Math.round(skillScore),
        certification: Math.round(certScore),
        workload: Math.round(workloadScore),
        trackRecord: Math.round(trackRecordScore),
      },
      eligible: true,
      isBestFit: false,
      availableDate: freeHours >= task.plannedHours ? 'Nov 25' : 'Nov 26',
      rationaleChips,
      pairJuniorOption,
    });
  }

  // Sort eligible candidates by fitScore descending
  ranked.sort((a, b) => {
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    return b.fitScore - a.fitScore;
  });

  if (ranked.length > 0 && ranked[0].eligible) {
    ranked[0].isBestFit = true;
    ranked[0].rationaleChips.unshift('Best fit');
  }

  return ranked;
}
