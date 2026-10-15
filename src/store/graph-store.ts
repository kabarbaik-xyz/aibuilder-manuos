import { create } from 'zustand';
import {
  Order,
  Task,
  Jobsheet,
  ManufacturingOrder,
  Machine,
  Material,
  Technician,
  Factory,
  HistoryEntry,
  Passport,
  AuditLogEntry,
  DisruptionState,
  RecoveryPlan,
  NetworkDeal,
} from '../domain/types';
import { PersonaType, ScreenType, PERSONA_PROFILES } from '../lib/navigation';
import {
  INITIAL_ORDERS,
  INITIAL_TASKS,
  INITIAL_JOBSHEETS,
  INITIAL_MANUFACTURING_ORDERS,
  INITIAL_MACHINES,
  INITIAL_MATERIALS,
  INITIAL_TECHNICIANS,
  INITIAL_FACTORIES,
  INITIAL_HISTORY,
  INITIAL_PASSPORTS,
} from '../data/seed';
import { analyzeRippleEffect } from '../engines/ripple';
import { generateRecoveryOptions } from '../engines/recovery';

export interface GraphStoreState {
  // Graph Entities
  orders: Order[];
  tasks: Task[];
  jobsheets: Jobsheet[];
  manufacturingOrders: ManufacturingOrder[];
  machines: Machine[];
  materials: Material[];
  technicians: Technician[];
  factories: Factory[];
  history: HistoryEntry[];
  passports: Passport[];
  audit: AuditLogEntry[];

  // Scenario & UI State
  disruption: DisruptionState;
  activeRecovery: RecoveryPlan | null;
  networkDeals: NetworkDeal[];
  currentPersona: PersonaType;
  currentScreen: ScreenType;
  isNavMenuOpen: boolean;
  toastMessage: string | null;
  activeModal: string | null; // 'recovery' | 'memory' | 'passport' | 'promise' | 'deal' | 'intake' | 'brain' | 'audit' | 'task' | 'search' | null
  modalData: any;

  // Actions
  injectDisruption: (materialId?: string, delayDays?: number) => void;
  resetScenario: () => void;
  approveRecoveryOption: (optionId: string, approvedBy?: string) => void;
  assignTechnician: (taskId: string, technicianId: string) => void;
  recordOutput: (taskId: string, additionalUnits: number) => void;
  requestInspection: (taskId: string) => void;
  recordQCInspection: (taskId: string, unitSerial: string, passed: boolean) => void;
  acknowledgePromise: (orderId: string) => void;
  acceptNetworkDeal: (dealId: string) => void;
  receiveNetworkMaterial: (dealId: string) => void;

  // UI Navigation Actions
  setPersona: (persona: PersonaType) => void;
  setScreen: (screen: ScreenType) => void;
  toggleNavMenu: () => void;
  showToast: (msg: string) => void;
  openModal: (modalName: string, data?: any) => void;
  closeModal: () => void;
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  orders: JSON.parse(JSON.stringify(INITIAL_ORDERS)),
  tasks: JSON.parse(JSON.stringify(INITIAL_TASKS)),
  jobsheets: JSON.parse(JSON.stringify(INITIAL_JOBSHEETS)),
  manufacturingOrders: JSON.parse(JSON.stringify(INITIAL_MANUFACTURING_ORDERS)),
  machines: JSON.parse(JSON.stringify(INITIAL_MACHINES)),
  materials: JSON.parse(JSON.stringify(INITIAL_MATERIALS)),
  technicians: JSON.parse(JSON.stringify(INITIAL_TECHNICIANS)),
  factories: JSON.parse(JSON.stringify(INITIAL_FACTORIES)),
  history: JSON.parse(JSON.stringify(INITIAL_HISTORY)),
  passports: JSON.parse(JSON.stringify(INITIAL_PASSPORTS)),
  audit: [
    {
      id: 'audit-0',
      title: 'Demo scenario initialized',
      detail: 'Precision Works · Shift A active · 6 orders',
      timestamp: '09:00',
      actor: 'System',
      type: 'EVENT',
    },
  ],

  disruption: {
    isDelayed: false,
    materialId: 'TB-24',
    delayDays: 2,
    newEtaDate: '2026-11-27',
    affectedOrderIds: [],
    blockedTaskIds: [],
    runnableTaskIds: [],
  },
  activeRecovery: null,
  networkDeals: [],
  currentPersona: 'Owner',
  currentScreen: 'command',
  isNavMenuOpen: false,
  toastMessage: null,
  activeModal: null,
  modalData: null,

  injectDisruption: (materialId = 'TB-24', delayDays = 2) => {
    const { tasks, orders, materials, audit } = get();
    const newEta = '2026-11-27';

    // 1. Analyze ripple effect deterministically
    const ripple = analyzeRippleEffect(
      materialId,
      delayDays,
      newEta,
      tasks,
      orders,
      materials
    );

    // 2. Update task statuses
    const updatedTasks = tasks.map((t) => {
      if (ripple.blockedTaskIds.includes(t.id)) {
        return { ...t, status: 'BLOCKED' as const };
      }
      return t;
    });

    // 3. Update order dates & statuses
    const updatedOrders = orders.map((o) => {
      const delta = ripple.orderEtaDeltas[o.id];
      if (delta && delta.deltaDays > 0) {
        return {
          ...o,
          expectedDate: delta.newExpectedDate,
          status: o.id === '1042' ? ('AT_RISK' as const) : ('WATCH' as const),
          riskLevel: o.id === '1042' ? ('CRITICAL' as const) : ('WATCH' as const),
        };
      }
      return o;
    });

    // 4. Update material status
    const updatedMaterials = materials.map((m) =>
      m.id === materialId
        ? { ...m, status: 'DELAYED' as const, etaDate: newEta }
        : m
    );

    // 5. Generate recovery candidates deterministically
    const heroOrder = updatedOrders.find((o) => o.id === '1042')!;
    const recoveryOptions = generateRecoveryOptions({
      orderId: '1042',
      totalQty: heroOrder.orderedQty,
      readyQcPassedQty: heroOrder.qcPassedQty,
      disruptionType: 'MATERIAL_DELAY',
      materialArrivesDate: newEta,
      originalPromisedDate: heroOrder.promisedDate,
      projectedDelayedDate: heroOrder.expectedDate,
    });

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Material delay detected',
      detail: `Terminal blocks TB-24 +2 days · ${ripple.affectedOrderIds.length} orders affected · ${ripple.blockedTaskIds.length} tasks blocked`,
      timestamp: '09:06',
      actor: 'Disruption Monitor',
      type: 'EVENT',
    };

    set({
      tasks: updatedTasks,
      orders: updatedOrders,
      materials: updatedMaterials,
      disruption: {
        isDelayed: true,
        materialId,
        delayDays,
        newEtaDate: newEta,
        affectedOrderIds: ripple.affectedOrderIds,
        blockedTaskIds: ripple.blockedTaskIds,
        runnableTaskIds: ripple.runnableTaskIds,
      },
      activeRecovery: {
        id: 'rec-plan-1042',
        orderId: '1042',
        triggerEvent: 'TB-24 supplier delay (+2 days)',
        options: recoveryOptions,
        status: 'PROPOSED',
      },
      audit: [newAuditEntry, ...audit],
    });

    get().showToast('Material delay injected. Recovery ready for review.');
  },

  resetScenario: () => {
    set({
      orders: JSON.parse(JSON.stringify(INITIAL_ORDERS)),
      tasks: JSON.parse(JSON.stringify(INITIAL_TASKS)),
      jobsheets: JSON.parse(JSON.stringify(INITIAL_JOBSHEETS)),
      manufacturingOrders: JSON.parse(JSON.stringify(INITIAL_MANUFACTURING_ORDERS)),
      machines: JSON.parse(JSON.stringify(INITIAL_MACHINES)),
      materials: JSON.parse(JSON.stringify(INITIAL_MATERIALS)),
      technicians: JSON.parse(JSON.stringify(INITIAL_TECHNICIANS)),
      factories: JSON.parse(JSON.stringify(INITIAL_FACTORIES)),
      history: JSON.parse(JSON.stringify(INITIAL_HISTORY)),
      passports: JSON.parse(JSON.stringify(INITIAL_PASSPORTS)),
      disruption: {
        isDelayed: false,
        materialId: 'TB-24',
        delayDays: 2,
        newEtaDate: '2026-11-27',
        affectedOrderIds: [],
        blockedTaskIds: [],
        runnableTaskIds: [],
      },
      activeRecovery: null,
      networkDeals: [],
      activeModal: null,
      modalData: null,
      audit: [
        {
          id: `audit-${Date.now()}`,
          title: 'Scenario reset',
          detail: 'Clean seed restored · Ready to replay demo',
          timestamp: '09:00',
          actor: 'Demo Controller',
          type: 'EVENT',
        },
      ],
    });

    get().showToast('Scenario reset. Ready to simulate a delay.');
  },

  approveRecoveryOption: (optionId: string, approvedBy = 'Alex Rahman') => {
    const { activeRecovery, orders, audit } = get();
    if (!activeRecovery || activeRecovery.status === 'APPLIED') return;

    const option = activeRecovery.options.find((o) => o.id === optionId);
    if (!option || !option.feasible) return;

    // Apply Split Batch atomically
    const updatedOrders = orders.map((o) => {
      if (o.id === '1042' && option.allocation) {
        return {
          ...o,
          status: 'PARTIAL_DELIVERY' as const,
          riskLevel: 'WATCH' as const,
          customerAcknowledged: false, // Customer needs to acknowledge new promise
          splitDelivery: option.allocation,
        };
      }
      return o;
    });

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Split delivery approved',
      detail: `${approvedBy} · 40 units Nov 25 / 80 units Nov 28 · +0.8% cost impact`,
      timestamp: '09:12',
      actor: approvedBy,
      type: 'APPROVAL',
    };

    set({
      orders: updatedOrders,
      activeRecovery: {
        ...activeRecovery,
        chosenOptionId: optionId,
        approvedBy,
        approvedAt: new Date().toISOString(),
        status: 'APPLIED',
      },
      audit: [newAuditEntry, ...audit],
    });

    get().showToast('Plan approved. Customer promise updated.');
  },

  assignTechnician: (taskId: string, technicianId: string) => {
    const { tasks, technicians, audit } = get();
    const tech = technicians.find((t) => t.id === technicianId);
    if (!tech) return;

    const updatedTasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, assignedTechnicianId: technicianId, status: 'READY' as const }
        : t
    );

    const updatedTechnicians = technicians.map((t) =>
      t.id === technicianId
        ? { ...t, assignedHoursThisWeek: t.assignedHoursThisWeek + 6 }
        : t
    );

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: `${taskName(taskId)} assigned`,
      detail: `${tech.name} · 6 hours reserved · Nov 26`,
      timestamp: '09:15',
      actor: 'Supervisor',
      type: 'ASSIGNMENT',
    };

    set({
      tasks: updatedTasks,
      technicians: updatedTechnicians,
      audit: [newAuditEntry, ...audit],
    });

    get().showToast(`${tech.name} assigned. 6 hours reserved.`);
  },

  recordOutput: (taskId: string, additionalUnits: number) => {
    const { orders, audit } = get();
    // Physical completed quantity rises without fabricating QC passes!
    const updatedOrders = orders.map((o) => {
      if (o.id === '1042') {
        const newCompleted = Math.min(o.orderedQty, o.completedQty + additionalUnits);
        return { ...o, completedQty: newCompleted };
      }
      return o;
    });

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Machining output recorded',
      detail: `${additionalUnits} unit${additionalUnits === 1 ? '' : 's'} · Hendra Wijaya · awaiting QC`,
      timestamp: '09:18',
      actor: 'Hendra Wijaya',
      type: 'EXECUTION',
    };

    set({
      orders: updatedOrders,
      audit: [newAuditEntry, ...audit],
    });

    get().showToast(`${additionalUnits} unit${additionalUnits === 1 ? '' : 's'} recorded. Awaiting QC.`);
  },

  requestInspection: (taskId: string) => {
    const { orders, audit } = get();
    const hero = orders.find((o) => o.id === '1042')!;
    const awaitingQC = hero.completedQty - hero.qcPassedQty;

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'QC inspection requested',
      detail: `${awaitingQC} units awaiting dimensional inspection`,
      timestamp: '09:20',
      actor: 'Hendra Wijaya',
      type: 'EVENT',
    };

    set({ audit: [newAuditEntry, ...audit] });
    get().showToast('QC inspection requested.');
  },

  recordQCInspection: (taskId: string, unitSerial: string, passed: boolean) => {
    const { orders, audit, passports } = get();
    const updatedOrders = orders.map((o) => {
      if (o.id === '1042' && passed) {
        return { ...o, qcPassedQty: Math.min(o.completedQty, o.qcPassedQty + 1) };
      }
      return o;
    });

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: `QC Inspection: ${passed ? 'PASSED' : 'REWORK NEEDED'}`,
      detail: `Unit ${unitSerial} · Siti Nurhaliza`,
      timestamp: '09:22',
      actor: 'Siti Nurhaliza',
      type: 'EXECUTION',
    };

    set({
      orders: updatedOrders,
      audit: [newAuditEntry, ...audit],
    });

    get().showToast(`Unit ${unitSerial} ${passed ? 'passed QC' : 'sent for rework'}.`);
  },

  acknowledgePromise: (orderId: string) => {
    const { orders, audit } = get();
    const updatedOrders = orders.map((o) =>
      o.id === orderId ? { ...o, customerAcknowledged: true } : o
    );

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Customer acknowledged promise',
      detail: 'Sarah Chen (Meridian Energy) · Confirmed split delivery 40 / 80',
      timestamp: '09:25',
      actor: 'Sarah Chen',
      type: 'EVENT',
    };

    set({
      orders: updatedOrders,
      audit: [newAuditEntry, ...audit],
    });

    get().showToast('Delivery plan acknowledged.');
  },

  acceptNetworkDeal: (dealId: string) => {
    const { audit } = get();
    const newDeal: NetworkDeal = {
      id: dealId || 'deal-tb-24',
      dealType: 'SUPPLY',
      fromFactoryId: 'factory-nusantara',
      toFactoryId: 'factory-precision',
      targetRef: 'TB-24',
      unitsOrHours: 42,
      estFinishOrDeliveryDate: '2026-11-26',
      rateIndex: 0.95,
      costImpactPct: 0.0,
      status: 'ACCEPTED',
      notes: 'Bilateral acceptance simulated · TB-24 arrives Nov 26',
    };

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Network supply proposal accepted',
      detail: 'Both factory approvals simulated · 42 terminal blocks · ETA Nov 26',
      timestamp: '09:28',
      actor: 'Alex Rahman',
      type: 'DEAL',
    };

    set({
      networkDeals: [newDeal],
      audit: [newAuditEntry, ...audit],
    });

    get().showToast('Both sides accepted. Material receipt still required.');
  },

  receiveNetworkMaterial: (dealId: string) => {
    const { materials, tasks, orders, audit } = get();

    // 1. Mark material as IN_STOCK
    const updatedMaterials = materials.map((m) =>
      m.id === 'TB-24'
        ? {
            ...m,
            status: 'IN_STOCK' as const,
            quantityInStock: m.quantityInStock + 42,
            etaDate: '2026-11-26',
          }
        : m
    );

    // 2. Unblock dependent tasks
    const updatedTasks = tasks.map((t) => {
      if (t.id === 'T12') {
        return { ...t, status: 'READY' as const };
      }
      if (t.id === 'T13' || t.id === 'T14') {
        return { ...t, status: 'READY' as const };
      }
      return t;
    });

    // 3. Update Order #1042 expected date to restored schedule (Nov 26)
    const updatedOrders = orders.map((o) => {
      if (o.id === '1042') {
        return { ...o, expectedDate: '2026-11-26', status: 'IN_PRODUCTION' as const, riskLevel: 'HEALTHY' as const };
      }
      return o;
    });

    const newAuditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}`,
      title: 'Terminal blocks received',
      detail: '42 units · Nusantara Metalcraft · Tasks unblocked',
      timestamp: '09:32',
      actor: 'Warehouse Lead',
      type: 'EXECUTION',
    };

    set({
      materials: updatedMaterials,
      tasks: updatedTasks,
      orders: updatedOrders,
      disruption: {
        isDelayed: false,
        materialId: 'TB-24',
        delayDays: 0,
        newEtaDate: '2026-11-26',
        affectedOrderIds: [],
        blockedTaskIds: [],
        runnableTaskIds: [],
      },
      audit: [newAuditEntry, ...audit],
    });

    get().showToast('Materials received. Blocked tasks unblocked!');
  },

  setPersona: (persona: PersonaType) => {
    const profile = PERSONA_PROFILES[persona];
    set({
      currentPersona: persona,
      currentScreen: profile.defaultScreen,
      isNavMenuOpen: false,
    });
  },

  setScreen: (screen: ScreenType) => {
    set({ currentScreen: screen, isNavMenuOpen: false });
  },

  toggleNavMenu: () => {
    set((s) => ({ isNavMenuOpen: !s.isNavMenuOpen }));
  },

  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 3500);
  },

  openModal: (modalName: string, data?: any) => {
    set({ activeModal: modalName, modalData: data });
  },

  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },
}));

function taskName(id: string): string {
  const map: Record<string, string> = {
    T1: 'Cut stock',
    T2: 'Press bend',
    T3: 'CNC finish',
    T4: 'Chassis QC',
    T5: 'Drill panels',
    T6: 'Deburr',
    T7: 'Panel QC',
    T8: 'Prepare harness',
    T9: 'Structural weld',
    T10: 'Fit enclosure',
    T11: 'Mount internals',
    T12: 'Wire & terminate',
    T13: 'Electrical QC',
    T14: 'Final release',
  };
  return map[id] || id;
}
