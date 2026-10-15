# ManuOS Deterministic Engine Contracts (P0-04)

All engines in `src/engines/` are pure TypeScript functions. They perform all operational, numerical, scheduling, cost, and dispatch calculations. Gemini never produces or modifies these numbers.

---

## 1. Critical Path Method Engine (`cpm.ts`)

```typescript
export interface CPMTaskInput {
  id: string;
  durationHours: number;
  dependsOn: string[]; // task IDs
  fixedStartDate?: string; // ISO date
}

export interface CPMTaskOutput {
  id: string;
  durationHours: number;
  earlyStart: number; // hours from project anchor
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalSlack: number; // hours
  freeSlack: number;
  isCritical: boolean;
}

export interface CPMResult {
  tasks: Record<string, CPMTaskOutput>;
  projectDurationHours: number;
  criticalPath: string[]; // task IDs in topological sequence
  startDate: string;
  projectedFinishDate: string;
}

export function calculateCPM(
  tasks: CPMTaskInput[],
  projectAnchorDate: string,
  calendarConfig: CalendarConfig
): CPMResult;
```

---

## 2. Disruption & Ripple Engine (`ripple.ts`)

```typescript
export type DisruptionType = 'MATERIAL_DELAY' | 'MACHINE_DOWN' | 'TASK_OVERRUN';

export interface DisruptionEvent {
  id: string;
  type: DisruptionType;
  entityId: string; // materialId, machineId, or taskId
  delayHours?: number;
  delayDays?: number;
  newEtaDate?: string;
  description: string;
}

export interface RippleAnalysisResult {
  disruption: DisruptionEvent;
  affectedOrderIds: string[];
  affectedTaskIds: string[];
  blockedTaskIds: string[];
  runnableTaskIds: string[];
  orderEtaDeltas: Record<string, {
    originalEta: string;
    newEta: string;
    deltaDays: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

export function analyzeRipple(
  graphState: GraphState,
  event: DisruptionEvent,
  calendarConfig: CalendarConfig
): RippleAnalysisResult;
```

---

## 3. Capacity & Feasible Date Engine (`capacity.ts`)

```typescript
export interface PromiseRequest {
  partFamily: string;
  quantity: number;
  requestedDate: string; // ISO date
  materialInStock?: boolean;
}

export interface PromiseAlternative {
  title: string;
  description: string;
  feasibleDate: string;
  costDeltaPct: number;
  feasible: boolean;
}

export interface PromiseFeasibilityResult {
  requestedDate: string;
  feasibleDate: string;
  isFeasibleOnRequestedDate: boolean;
  deltaDays: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  bottleneckMachineClass: string;
  bottleneckReason: string;
  alternatives: PromiseAlternative[];
}

export function checkPromiseFeasibility(
  request: PromiseRequest,
  graphState: GraphState,
  calendarConfig: CalendarConfig
): PromiseFeasibilityResult;
```

---

## 4. Recovery Simulation & Cost Engine (`cost.ts`, `recovery.ts`)

```typescript
export type RecoveryOptionType =
  | 'SPLIT_BATCH'
  | 'ADD_SHIFT'
  | 'REROUTE'
  | 'REASSIGN'
  | 'SUBCONTRACT';

export interface RecoveryOptionCandidate {
  id: string;
  type: RecoveryOptionType;
  title: string;
  description: string;
  timeRecoveredDays: number;
  costImpactPct: number;
  capacityImpact: string;
  risks: string[];
  feasible: boolean;
  infeasibleReason?: string;
  isRecommended: boolean;
  allocation?: {
    tranche1Qty: number;
    tranche1Date: string;
    tranche2Qty: number;
    tranche2Date: string;
  };
}

export function simulateRecoveryOptions(
  graphState: GraphState,
  disruption: DisruptionEvent,
  calendarConfig: CalendarConfig
): RecoveryOptionCandidate[];
```

---

## 5. Skill-Aware Dispatch Engine (`dispatch.ts`)

```typescript
export interface DispatchRankingCandidate {
  technicianId: string;
  name: string;
  avatar: string;
  fitScore: number; // 0 - 100
  scoreComponents: {
    skillMatch: number;      // weight 0.35
    certification: number;   // weight 0.25
    workload: number;        // weight 0.20
    trackRecord: number;     // weight 0.20
  };
  eligible: boolean;
  ineligibleReason?: string;
  isBestFit: boolean;
  availableDate: string;
  rationaleChips: string[];
  pairJuniorOption?: {
    suggestedJuniorId: string;
    juniorName: string;
    rationale: string;
  };
}

export function rankTechniciansForTask(
  taskId: string,
  graphState: GraphState
): DispatchRankingCandidate[];
```

---

## 6. Factory Memory & Similarity Engine (`similarity.ts`, `memory.ts`)

```typescript
export interface SimilarityQuery {
  partFamily: string;
  operationType: string;
  material?: string;
  machineClass?: string;
}

export interface MemoryEvidenceResult {
  query: SimilarityQuery;
  sampleCount: number;
  meanOverrunPct: number;
  overrunRange: { min: number; max: number };
  sampleRuns: Array<{
    runNumber: number;
    plannedHours: number;
    actualHours: number;
    overrunPct: number;
  }>;
  bestRoutingVersion: string;
  recommendedPaddingPct: number; // Managerial policy (e.g. 15%)
  policyRationale: string;
}

export function queryFactoryMemory(
  query: SimilarityQuery,
  history: HistoryEntry[]
): MemoryEvidenceResult;
```

---

## 7. Factory Network Matching Engine (`network.ts`)

```typescript
export interface NetworkCapacityQuery {
  department: string;
  machineClass: string;
  requiredCert?: string;
  requiredHours: number;
  neededDate: string;
}

export interface NetworkSupplyQuery {
  partNumber: string;
  requiredQty: number;
  neededDate: string;
}

export interface MatchedPartner {
  factoryId: string;
  factoryName: string;
  roleBadge: string;
  matchScore: number; // 0 - 100
  capabilityFitPct: number;
  availableUnitsOrHours: number;
  estimatedDeliveryOrFinish: string;
  rateIndex: number;
  consentGranted: boolean;
  notes: string;
}

export function matchNetworkCapacity(
  query: NetworkCapacityQuery,
  factories: Factory[]
): MatchedPartner[];

export function matchNetworkSupply(
  query: NetworkSupplyQuery,
  factories: Factory[]
): MatchedPartner[];
```

---

## 8. Dynamic Workflow Validation & Instantiation (`workflow-validate.ts`)

```typescript
export interface WorkflowNodeSpec {
  id: string;
  name: string;
  type: string;
  department: string;
  plannedHours: number;
  requires: {
    machineClass?: string;
    skillName?: string;
    skillLevel?: number;
    certification?: string;
    materials?: string[];
  };
}

export interface WorkflowEdgeSpec {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  topologicalOrder: string[];
}

export function validateWorkflowDAG(
  nodes: WorkflowNodeSpec[],
  edges: WorkflowEdgeSpec[]
): WorkflowValidationResult;
```
