import { Principal } from '@/server/auth/principal';
import { hasPermission } from '@/server/auth/permissions';

export type CapabilityId =
  | 'AII-01'
  | 'AII-02'
  | 'AII-03'
  | 'AII-04'
  | 'AII-05'
  | 'AII-06'
  | 'AII-07'
  | 'SCH-07'
  | 'SCH-08'
  | 'SCH-09'
  | 'CST-03'
  | 'BLD-01';

export type CapabilityState =
  | 'AVAILABLE'
  | 'DETERMINISTIC_READY'
  | 'NOT_CONNECTED'
  | 'UNCONFIGURED_PROVIDER'
  | 'PILOT_GATED';

export interface CapabilityDescriptorDTO {
  id: CapabilityId;
  code: string;
  title: string;
  summary: string;
  category: 'ASSISTANT' | 'ENGINEERING' | 'PLANNING' | 'RECOVERY' | 'COSTING' | 'QUALITY';
  href: string | null;
  contextualEntryLabel: string;
  state: CapabilityState;
  availablePage: boolean;
  engineConfigured: boolean;
  statusLabel: string;
  unavailableReason: string | null;
  prerequisite: string | null;
}

export interface CoreAICapabilityRegistryDTO {
  workspaceId: string;
  evaluatedAt: string;
  capabilities: CapabilityDescriptorDTO[];
}

interface CapabilityDefinition {
  id: CapabilityId;
  code: string;
  title: string;
  summary: string;
  category: CapabilityDescriptorDTO['category'];
  href: string | null;
  contextualEntryLabel: string;
  permissions: string[];
  allowCustomer?: boolean;
  evaluateReadiness: () => {
    state: CapabilityState;
    availablePage: boolean;
    engineConfigured: boolean;
    statusLabel: string;
    unavailableReason: string | null;
    prerequisite: string | null;
  };
}

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0 && key !== 'undefined');
}

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    id: 'AII-01',
    code: 'AII-01',
    title: 'Operational Assistant',
    summary:
      'Ask grounded questions about authorized orders, inventory, and shop-floor resources with cited record evidence.',
    category: 'ASSISTANT',
    href: '/ai/assistant',
    contextualEntryLabel: 'Ask AI (⌘J) or order detail',
    permissions: [
      'brain.query',
      'order.read',
      'planning.read',
      'inventory.read',
      'resource.manage',
    ],
    allowCustomer: false,
    evaluateReadiness: () => {
      const configured = isGeminiConfigured();
      return {
        state: configured ? 'AVAILABLE' : 'DETERMINISTIC_READY',
        availablePage: true,
        engineConfigured: configured,
        statusLabel: configured ? 'AI answer ready' : 'Record summary mode',
        unavailableReason: configured
          ? null
          : 'AI language provider is not configured in this environment. Queries return deterministic workspace record summaries.',
        prerequisite: null,
      };
    },
  },
  {
    id: 'AII-02',
    code: 'AII-02',
    title: 'Risk Inbox & Exception Drilldown',
    summary:
      'Review overdue commitments, open material shortages, and pending engineering approvals surfaced by the workspace dashboard.',
    category: 'ASSISTANT',
    href: '/ai/risks',
    contextualEntryLabel: 'Dashboard exceptions & order risk actions',
    permissions: ['order.read', 'planning.read', 'execution.read', 'customer_order.read_own'],
    evaluateReadiness: () => ({
      state: 'AVAILABLE',
      availablePage: true,
      engineConfigured: true,
      statusLabel: 'Available',
      unavailableReason: null,
      prerequisite: null,
    }),
  },
  {
    id: 'AII-03',
    code: 'AII-03',
    title: 'RFQ & Document Intake',
    summary:
      'Extract structured part specifications, quantities, BOM suggestions, and open questions from RFQ text or uploaded documents.',
    category: 'ENGINEERING',
    href: '/orders/intake',
    contextualEntryLabel: 'Order Hub → Import RFQ',
    permissions: ['order.create', 'engineering.write'],
    evaluateReadiness: () => {
      const configured = isGeminiConfigured();
      return {
        state: configured ? 'AVAILABLE' : 'UNCONFIGURED_PROVIDER',
        availablePage: true,
        engineConfigured: configured,
        statusLabel: configured ? 'Text review and order-draft handoff available' : 'Provider not configured',
        unavailableReason: configured ? null : 'RFQ extraction needs the configured language provider; the workspace source record is not created when extraction is unavailable.',
        prerequisite: 'Text review is available. Uploaded document ingestion and line-level citation remain future work.',
      };
    },
  },
  {
    id: 'AII-04',
    code: 'AII-04',
    title: 'Delivery Promise Evaluation',
    summary:
      'Compare a requested date with the same finite-capacity dry-run used in Planning for one selected released order job.',
    category: 'PLANNING',
    href: '/planning',
    contextualEntryLabel: 'Planning → Check requested delivery date',
    permissions: ['planning.read', 'task.assign'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: true,
      statusLabel: 'Existing-job date evaluation available',
      unavailableReason: 'A date is returned only when every open task has a complete finite-capacity proposal; partial and missing evidence remains NOT_CONNECTED.',
      prerequisite: 'Only evaluates an existing released job; it does not commit a customer promise or model partial-shipment allocation.',
    }),
  },
  {
    id: 'AII-05',
    code: 'AII-05',
    title: 'Factory Memory & Measured Benchmarks',
    summary:
      'Compare planned versus measured work-session durations and first-pass inspection yields across comparable product and process cohorts.',
    category: 'ENGINEERING',
    href: '/ai/memory',
    contextualEntryLabel: 'Engineering & Order detail → Similar jobs',
    permissions: ['planning.read', 'execution.read'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: false,
      statusLabel: 'Measured evidence view ready',
      unavailableReason: 'Planning buffer recommendations remain disabled until the cohort rule is validated.',
      prerequisite: 'Review cohort size and missing-duration counts; no buffer percentage is inferred.',
    }),
  },
  {
    id: 'AII-06',
    code: 'AII-06',
    title: 'Disruption Recovery Proposals',
    summary:
      'Save and review a finite-capacity schedule snapshot for one released job. Alternative recovery strategies and application remain disabled.',
    category: 'RECOVERY',
    href: '/ai/recovery',
    contextualEntryLabel: 'Recovery → Generate schedule review',
    permissions: ['planning.write', 'task.assign'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: true,
      statusLabel: 'Schedule review available; recovery alternatives and Apply disabled',
      unavailableReason: 'Only complete finite-capacity schedule snapshots can be saved. Overtime, alternate routing, split shipment, subcontracting and cost impacts are not modeled.',
      prerequisite: 'Revalidate current bookings and versions, then implement an audited schedule or shipment command before enabling Apply.',
    }),
  },
  {
    id: 'SCH-07',
    code: 'SCH-07',
    title: 'Qualified Technician Recommendations',
    summary:
      'Rank eligible technicians for a task time window using verified skill levels, full-slot certificate validity, and current booking load.',
    category: 'PLANNING',
    href: '/planning',
    contextualEntryLabel: 'Planning → Assign resources modal',
    permissions: ['planning.read', 'task.assign', 'order.release', 'access.manage'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: false,
      statusLabel: 'Suggestions available in Planning',
      unavailableReason: null,
      prerequisite: 'Suggestions are advisory; assignment rechecks qualifications and current bookings.',
    }),
  },
  {
    id: 'SCH-08',
    code: 'SCH-08',
    title: 'Finite-Capacity Schedule Proposals',
    summary:
      'Generate a dry-run for one released job using its requirements, BOM material reservations, verified resources, published availability and current bookings.',
    category: 'PLANNING',
    href: '/planning',
    contextualEntryLabel: 'Planning → Generate schedule proposal',
    permissions: ['planning.read', 'task.assign', 'planning.write'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: true,
      statusLabel: 'Dry-run proposal available in Planning',
      unavailableReason: 'Unknown requirements, unreserved materials, missing roster coverage and unavailable resources leave tasks unscheduled. Machine use is exclusive and work is not split across shifts.',
      prerequisite: 'Validate conservative scheduling assumptions with planners before using proposals as commitments.',
    }),
  },
  {
    id: 'CST-03',
    code: 'CST-03',
    title: 'Cost Variance Explanation',
    summary:
      'Review standard versus actual cost variance by category with linked source entries. Revenue or margin is not inferred.',
    category: 'COSTING',
    href: '/orders',
    contextualEntryLabel: 'Order Hub → select an order → Costing tab',
    permissions: ['cost.read'],
    evaluateReadiness: () => ({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      engineConfigured: false,
      statusLabel: 'Cost variance and source entries available',
      unavailableReason: 'Revenue and margin evidence are not modeled; this view explains cost variance only.',
      prerequisite: 'Standard and actual entries are required before a variance can be assessed.',
    }),
  },
  {
    id: 'BLD-01',
    code: 'BLD-01',
    title: 'Workflow & Form AI Drafting',
    summary:
      'Generate reviewable workflow DAGs and operation form definitions with validation findings and explicit human approval.',
    category: 'ENGINEERING',
    href: '/workflows',
    contextualEntryLabel: 'Workflow Studio & Form Templates → Draft with AI',
    permissions: ['engineering.write', 'forms.create', 'forms.edit_draft'],
    evaluateReadiness: () => ({
      state: 'AVAILABLE',
      availablePage: true,
      engineConfigured: true,
      statusLabel: 'Available in Studio',
      unavailableReason: null,
      prerequisite: null,
    }),
  },
  {
    id: 'SCH-09',
    code: 'SCH-09',
    title: 'What-if Recovery Scenarios',
    summary: 'Compare recovery options against current capacity and evidence before a planner approves any change.',
    category: 'RECOVERY',
    href: null,
    contextualEntryLabel: 'Planning → scenario comparison',
    permissions: ['planning.read', 'planning.write', 'recovery.propose'],
    evaluateReadiness: () => ({
      state: 'NOT_CONNECTED',
      availablePage: false,
      engineConfigured: false,
      statusLabel: 'Scenario comparison not connected',
      unavailableReason: 'Recovery options are not yet connected to a full constraint-safe scenario workflow.',
      prerequisite: 'Implement saved, non-mutating comparisons and stale-version checks before approval.',
    }),
  },
  {
    id: 'AII-07',
    code: 'AII-07',
    title: 'Assisted Visual QC Analysis',
    summary:
      'Run assisted defect observation on stored inspection photos with mandatory human inspector accept/reject adjudication.',
    category: 'QUALITY',
    href: null,
    contextualEntryLabel: 'Inspection detail → Analyze attachment',
    permissions: ['quality.read', 'quality.inspect'],
    evaluateReadiness: () => {
      return {
        state: 'PILOT_GATED',
        availablePage: false,
        engineConfigured: false,
        statusLabel: 'Pilot and inference adapter required',
        unavailableReason: 'No visual QC inference adapter is connected. Manual inspection remains available.',
        prerequisite:
          'Requires approved defect taxonomy, camera capture standards, labeled holdout validation set, and human QC reviewer signoff.',
      };
    },
  },
];

export class CapabilityRegistryService {
  /**
   * Returns only capabilities that the authenticated principal is authorized to see.
   * Never leaks internal configuration details or secrets to unauthorized roles.
   */
  getCapabilities(principal: Principal): CoreAICapabilityRegistryDTO {
    const isCustomer = Boolean(principal.customerId);

    const visible = CAPABILITY_DEFINITIONS.filter((def) => {
      if (isCustomer && !def.allowCustomer) {
        return false;
      }
      return def.permissions.some((code) => hasPermission(principal, code));
    });

    const capabilities: CapabilityDescriptorDTO[] = visible.map((def) => {
      const readiness = def.evaluateReadiness();
      return {
        id: def.id,
        code: def.code,
        title: def.title,
        summary: def.summary,
        category: def.category,
        href: def.href,
        contextualEntryLabel: def.contextualEntryLabel,
        state: readiness.state,
        availablePage: readiness.availablePage,
        engineConfigured: readiness.engineConfigured,
        statusLabel: readiness.statusLabel,
        unavailableReason: readiness.unavailableReason,
        prerequisite: readiness.prerequisite,
      };
    });

    return {
      workspaceId: principal.workspaceId,
      evaluatedAt: new Date().toISOString(),
      capabilities,
    };
  }
}

export const capabilityRegistryService = new CapabilityRegistryService();
