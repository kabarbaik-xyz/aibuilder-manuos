import { z } from 'zod';

export const EvaluatePromiseSchema = z.object({
  customerId: z.string().uuid().optional(),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1),
  requestedDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  allowPartialDelivery: z.boolean().default(true),
});

export type EvaluatePromiseInput = z.infer<typeof EvaluatePromiseSchema>;

export interface PromiseAlternativeDTO {
  type: 'PARTIAL_DELIVERY' | 'OVERTIME' | 'EXPEDITE_SUPPLY' | 'SUBCONTRACT';
  title: string;
  description: string;
  feasibleDate: string;
  isFeasible: boolean;
  costDeltaPct: number;
  infeasibleReason?: string;
}

export interface PromiseEvaluationDTO {
  evaluationId: string;
  inputHash: string;
  evaluatedAt: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  requestedDate: string;
  feasibleDate: string;
  isFeasibleOnRequestedDate: boolean;
  deltaDays: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  bottleneckReason: string;
  materialReadiness: {
    isFullyAvailable: boolean;
    requiredAtoms: string;
    onHandAtoms: string;
    shortageAtoms: string;
    supplyEtaDate: string | null;
  };
  capacityLoad: {
    totalWorkMinutesNeeded: number;
    shopCapacityUtilPct: number;
    bottleneckResource: string | null;
  };
  alternatives: PromiseAlternativeDTO[];
}
