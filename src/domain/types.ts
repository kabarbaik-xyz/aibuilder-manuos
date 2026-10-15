export type TaskStatus =
  | 'PENDING'
  | 'READY'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'PAUSED'
  | 'BLOCKED'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderStatus =
  | 'PLANNED'
  | 'IN_PRODUCTION'
  | 'AT_RISK'
  | 'WATCH'
  | 'PARTIAL_DELIVERY'
  | 'READY'
  | 'DELIVERED';

export type RiskLevel = 'HEALTHY' | 'WATCH' | 'CRITICAL';

export interface Task {
  id: string; // e.g. 'T1', 'T2'
  jobsheetId: string;
  orderId: string;
  name: string;
  operationType: string;
  machineClass: string;
  department: string;
  assignedTechnicianId?: string;
  plannedHours: number;
  actualHours?: number;
  status: TaskStatus;
  dependsOn: string[]; // task IDs
  requiresMaterialIds?: string[];
  requiredCert?: string;
  requiredSkill?: {
    name: string;
    level: number;
  };
  totalSlack?: number;
  freeSlack?: number;
  isCritical?: boolean;
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
}

export interface Jobsheet {
  id: string; // e.g. 'JS-1'
  orderId: string;
  moId: string;
  name: string;
  partFamily: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  taskIds: string[];
}

export interface ManufacturingOrder {
  id: string; // e.g. 'MO-01'
  orderId: string;
  name: string;
  department: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  jobsheetIds: string[];
}

export interface Order {
  id: string; // e.g. '1042'
  number: string; // e.g. '#CO-2026-1042'
  customerName: string;
  partName: string;
  orderedQty: number;
  completedQty: number;
  qcPassedQty: number;
  promisedDate: string; // ISO date '2026-11-25'
  expectedDate: string; // ISO date '2026-11-25' or '2026-11-28'
  status: OrderStatus;
  riskLevel: RiskLevel;
  moIds: string[];
  customerAcknowledged?: boolean;
  splitDelivery?: {
    tranche1Qty: number;
    tranche1Date: string;
    tranche2Qty: number;
    tranche2Date: string;
  };
}

export interface Machine {
  id: string; // e.g. 'CNC-02'
  name: string;
  machineClass: string;
  department: string;
  capacityHoursPerDay: number;
  assignedHoursThisWeek: number;
  status: 'AVAILABLE' | 'RUNNING' | 'MAINTENANCE' | 'OFFLINE';
}

export interface Material {
  id: string; // e.g. 'TB-24'
  partNumber: string;
  description: string;
  supplier: string;
  quantityInStock: number;
  quantityReserved: number;
  status: 'IN_STOCK' | 'DELAYED' | 'ON_ORDER';
  etaDate: string; // ISO date
  baselineEtaDate: string;
}

export interface Technician {
  id: string; // e.g. 'tech-budi'
  name: string;
  avatar: string;
  role: string;
  skills: Array<{ name: string; level: number }>;
  certifications: Array<{ name: string; validUntil: string }>;
  assignedHoursThisWeek: number;
  maxWeeklyHours: number;
  onTimePct: number;
  qcPassPct: number;
  currentTaskId?: string;
}

export interface QCRecord {
  id: string;
  taskId: string;
  orderId: string;
  unitSerial: string;
  inspectedAt: string;
  inspectorId: string;
  passed: boolean;
  defects?: string[];
  reworkRequired?: boolean;
  reworkNotes?: string;
}

export interface HistoryEntry {
  id: string;
  runNumber: number;
  partFamily: string;
  operationType: string;
  material: string;
  machineClass: string;
  plannedHours: number;
  actualHours: number;
  reworkCount: number;
  routingVersion: string;
  onTime: boolean;
  topDefectCause?: string;
}

export interface RecoveryOption {
  id: string;
  type: 'SPLIT_BATCH' | 'ADD_SHIFT' | 'REROUTE' | 'REASSIGN' | 'SUBCONTRACT';
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

export interface RecoveryPlan {
  id: string;
  orderId: string;
  triggerEvent: string;
  options: RecoveryOption[];
  chosenOptionId?: string;
  approvedBy?: string;
  approvedAt?: string;
  status: 'PROPOSED' | 'APPROVED' | 'APPLIED' | 'REJECTED';
}

export interface NetworkDeal {
  id: string;
  dealType: 'CAPACITY' | 'SUPPLY';
  fromFactoryId: string;
  toFactoryId: string;
  targetRef: string; // jobsheetId or material partNumber
  unitsOrHours: number;
  estFinishOrDeliveryDate: string;
  rateIndex: number;
  costImpactPct: number;
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'IN_PROGRESS' | 'COMPLETED';
  notes?: string;
}

export interface Factory {
  id: string;
  name: string;
  initials: string;
  roleBadge: string;
  description: string;
  capabilities: string[];
  certifications: string[];
  availableHoursPerWeek: number;
  rateIndex: number;
  consentShareCapacity: boolean;
  consentShareSupply: boolean;
  supplyOffers: Array<{
    partNumber: string;
    description: string;
    leadTimeDays: number;
    availableQty: number;
  }>;
}

export interface PassportStep {
  title: string;
  detail: string;
  date: string;
  isWarning?: boolean;
  operator?: string;
  machine?: string;
}

export interface Passport {
  unitSerial: string; // e.g. 'SN-1042-078'
  orderId: string;
  partName: string;
  materialLot: string;
  materialSpec: string;
  qcStatus: 'PASSED' | 'REWORKED_PASSED' | 'FAILED';
  steps: PassportStep[];
  finalSignOffBy: string;
  finalSignOffDate: string;
}

export interface AuditLogEntry {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  actor: string;
  type: 'EVENT' | 'APPROVAL' | 'EXECUTION' | 'DEAL' | 'ASSIGNMENT';
}

export interface DisruptionState {
  isDelayed: boolean;
  materialId: string;
  delayDays: number;
  newEtaDate: string;
  affectedOrderIds: string[];
  blockedTaskIds: string[];
  runnableTaskIds: string[];
}
