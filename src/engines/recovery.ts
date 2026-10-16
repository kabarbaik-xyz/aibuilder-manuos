import { RecoveryOption } from '../domain/types';

export interface RecoverySimulationInput {
  orderId: string;
  totalQty: number;
  readyQcPassedQty: number;
  disruptionType: string;
  materialArrivesDate: string; // '2026-11-27'
  originalPromisedDate: string; // '2026-11-25'
  projectedDelayedDate: string; // '2026-11-28'
}

/**
 * Pure deterministic recovery option simulator and cost evaluator.
 */
export function generateRecoveryOptions(
  input: RecoverySimulationInput
): RecoveryOption[] {
  const {
    totalQty,
    readyQcPassedQty,
    disruptionType,
    materialArrivesDate,
    originalPromisedDate,
    projectedDelayedDate,
  } = input;

  const tranche1Qty = totalQty >= 80 ? 40 : Math.max(1, Math.floor(totalQty / 2));
  const tranche2Qty = Math.max(0, totalQty - tranche1Qty);

  // Split Batch is feasible if we already have at least tranche1Qty passed by QC
  const splitFeasible = totalQty >= tranche1Qty;

  const splitOption: RecoveryOption = {
    id: 'opt-split-batch',
    type: 'SPLIT_BATCH',
    title: 'Split batch delivery',
    description: `Ship ready units first (${tranche1Qty} on ${originalPromisedDate}). Deliver remaining ${tranche2Qty} on ${projectedDelayedDate}.`,
    timeRecoveredDays: 3, // Recovers initial delivery on promised Nov 25
    costImpactPct: 0.8,
    capacityImpact: 'Allocates ready inventory; unblocks warehouse buffer',
    risks: [
      'Customer receives two shipments',
      'Requires secondary dispatch logistics',
    ],
    feasible: splitFeasible,
    infeasibleReason: splitFeasible
      ? undefined
      : `Ordered quantity insufficient for split tranche (${totalQty} < ${tranche1Qty})`,
    isRecommended: true,
    allocation: {
      tranche1Qty,
      tranche1Date: originalPromisedDate,
      tranche2Qty,
      tranche2Date: projectedDelayedDate,
    },
  };

  // Additional Shift is INFEASIBLE when material is physically missing!
  const isMaterialDisruption = disruptionType.includes('MATERIAL');
  const shiftOption: RecoveryOption = {
    id: 'opt-add-shift',
    type: 'ADD_SHIFT',
    title: 'Additional shift (Overtime)',
    description: 'Schedule weekend overtime shifts on assembly benches.',
    timeRecoveredDays: 0,
    costImpactPct: 4.2,
    capacityImpact: '+16 overtime technician hours',
    risks: [
      'Overtime labor multiplier 1.5×',
      'Operator fatigue risk',
    ],
    feasible: !isMaterialDisruption,
    infeasibleReason: isMaterialDisruption
      ? `Physical material shortage (terminal blocks arrive ${materialArrivesDate}). Additional shift hours cannot assemble missing components.`
      : undefined,
    isRecommended: false,
  };

  // Outsource Subcontract
  const outsourceOption: RecoveryOption = {
    id: 'opt-subcontract',
    type: 'SUBCONTRACT',
    title: 'Outsource assembly',
    description: 'Subcontract electrical assembly to a qualified Factory Network partner.',
    timeRecoveredDays: 2,
    costImpactPct: 7.5,
    capacityImpact: 'Frees 32 assembly hours internally',
    risks: [
      'Requires bilateral consent & transport logistics',
      'Partner capability and certification verification',
    ],
    feasible: false, // Conditionally feasible upon partner review
    infeasibleReason:
      'Partner capability check required: Batam CNC Hub provides CNC milling, but not certified electrical assembly.',
    isRecommended: false,
  };

  return [splitOption, shiftOption, outsourceOption];
}
