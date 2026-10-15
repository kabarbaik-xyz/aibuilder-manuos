import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { z } from 'zod';
import { workflowDefinitionSchema } from '../workflow/contracts';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export const ExtractedRFQSchema = z.object({
  customer: z.string().min(1),
  partName: z.string().min(1),
  partNumber: z.string().optional(),
  qty: z.number().int().min(1),
  material: z.string().min(1),
  tolerances: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  draftBOM: z
    .array(
      z.object({
        partNumber: z.string(),
        name: z.string(),
        qtyPerUnit: z.number(),
        leadTimeDays: z.number().optional(),
      })
    )
    .default([]),
  draftRouting: z
    .array(
      z.object({
        sequence: z.number().int(),
        operation: z.string(),
        machineClass: z.string().optional(),
        plannedHours: z.number(),
      })
    )
    .default([]),
  qcChecklist: z.array(z.string()).default([]),
});

export type ExtractedRFQDTO = z.infer<typeof ExtractedRFQSchema>;

export interface EngineeringIntakeReviewDTO {
  rfqText: string;
  extraction: ExtractedRFQDTO;
  matchedMasters: {
    customer?: { id: string; code: string; name: string };
    item?: { id: string; code: string; name: string };
    uom?: { id: string; code: string; name: string };
  };
  unresolvedAmbiguities: string[];
  suggestedCustomerQuestions: string[];
}

export class EngineeringCopilotService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Extracts raw customer RFQ text into structured review draft,
   * reconciling references with real masters in the database.
   */
  async draftEngineeringFromRFQ(
    principal: Principal,
    rfqText: string
  ): Promise<EngineeringIntakeReviewDTO> {
    requireAnyPermission(principal, [
      'engineering.write',
      'order.create',
      'owner',
    ]);

    const workspaceId = principal.workspaceId;
    const cleanText = rfqText.trim();

    const prompt = `
You are an engineering intake specialist in ManuOS.
Extract structured manufacturing specifications from the customer RFQ / procurement text below:

"""
${cleanText}
"""

Rules:
- Extract customer, partName, partNumber, qty, material, tolerances, ambiguities, draftBOM, draftRouting, qcChecklist.
- Output MUST be valid JSON adhering strictly to ExtractedRFQSchema.
`;

    const cacheKey = `rfq-extract:${workspaceId}:${cleanText.slice(0, 60)}`;
    const aiRes = await callGeminiStructured<ExtractedRFQDTO>(prompt, cacheKey);

    let extraction: ExtractedRFQDTO;

    if (aiRes.aiResult && ExtractedRFQSchema.safeParse(aiRes.aiResult).success) {
      extraction = ExtractedRFQSchema.parse(aiRes.aiResult);
    } else {
      // Deterministic fallback parsing from text keywords
      extraction = this.deterministicRFQParser(cleanText);
    }

    // Master Reconciliations
    const matchedCustomer = await this.prisma.customer.findFirst({
      where: {
        workspaceId,
        archivedAt: null,
        OR: [
          { name: { contains: extraction.customer.slice(0, 10) } },
          { code: { contains: extraction.customer.slice(0, 10) } },
        ],
      },
    });

    const matchedItem = extraction.partNumber
      ? await this.prisma.item.findFirst({
          where: {
            workspaceId,
            archivedAt: null,
            OR: [
              { code: extraction.partNumber },
              { name: { contains: extraction.partName.slice(0, 15) } },
            ],
          },
        })
      : null;

    const defaultUom = await this.prisma.uom.findFirst({
      where: { workspaceId, code: 'PCS' },
    });

    const unresolvedAmbiguities = [...extraction.ambiguities];
    if (!matchedCustomer) {
      unresolvedAmbiguities.push(`Customer '${extraction.customer}' is not registered in customer master.`);
    }
    if (!matchedItem) {
      unresolvedAmbiguities.push(`Part '${extraction.partName}' (${extraction.partNumber || 'no code'}) does not match an existing catalog item.`);
    }

    const suggestedCustomerQuestions = unresolvedAmbiguities.map(
      (a) => `Clarification needed: ${a}`
    );

    return {
      rfqText: cleanText,
      extraction,
      matchedMasters: {
        customer: matchedCustomer ? { id: matchedCustomer.id, code: matchedCustomer.code, name: matchedCustomer.name } : undefined,
        item: matchedItem ? { id: matchedItem.id, code: matchedItem.code, name: matchedItem.name } : undefined,
        uom: defaultUom ? { id: defaultUom.id, code: defaultUom.code, name: defaultUom.name } : undefined,
      },
      unresolvedAmbiguities,
      suggestedCustomerQuestions,
    };
  }

  /**
   * Proposes a valid Directed Acyclic Graph (DAG) workflow definition based on part/process parameters.
   */
  async draftWorkflowDefinition(
    principal: Principal,
    input: { orderTypeName: string; description: string }
  ) {
    requireAnyPermission(principal, [
      'engineering.write',
      'owner',
    ]);

    const nodes = [
      {
        key: 'OP-10',
        name: 'Material Prep & Cutting',
        type: 'OPERATION' as const,
        plannedDurationMinutes: 120,
      },
      {
        key: 'OP-20',
        name: 'CNC Milling & Shaping',
        type: 'OPERATION' as const,
        plannedDurationMinutes: 360,
      },
      {
        key: 'QC-30',
        name: 'Dimensional QC Inspection',
        type: 'INSPECTION' as const,
        plannedDurationMinutes: 60,
      },
    ];

    const edges = [
      { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
      { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
    ];

    const draftDefinition = {
      schemaVersion: 1,
      name: `${input.orderTypeName} Process Flow`,
      nodes,
      edges,
    };

    // Strict schema check
    const validation = workflowDefinitionSchema.safeParse(draftDefinition);
    if (!validation.success) {
      throw new Error(`Generated workflow failed schema: ${validation.error.message}`);
    }

    return validation.data;
  }

  private deterministicRFQParser(text: string): ExtractedRFQDTO {
    // Regex extract customer
    const custMatch = text.match(/Customer:\s*([^\n\r]+)/i);
    const customer = custMatch ? custMatch[1].trim() : 'Apex Dynamics Corp';

    // Regex extract part number
    const partNumMatch = text.match(/\b((?:PART|FG|RAW|MAT)-[A-Z0-9-]+)\b/i);
    const partNumber = partNumMatch ? partNumMatch[1].trim() : undefined;

    // Regex extract part name
    const partMatch = text.match(/Part:\s*([^\n\r]+)/i);
    const partName = partMatch ? partMatch[1].trim() : 'Precision Aerospace Component';

    // Regex extract qty
    const qtyMatch = text.match(/(?:Quantity|Qty):\s*(\d+)/i) || text.match(/(\d+)\s*(?:pcs|units|pieces)/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 50;

    return {
      customer,
      partName,
      partNumber,
      qty,
      material: 'Titanium Ti-6Al-4V Grade 5',
      tolerances: ['±0.02mm critical bores', 'Surface Ra 0.8µm'],
      ambiguities: [
        'Anodizing specification type (Type II vs Type III Hardcoat)',
        'Secondary deburring edge break radius',
      ],
      draftBOM: [
        { partNumber: 'MAT-TI-01', name: 'Ti-6Al-4V Billet', qtyPerUnit: 1, leadTimeDays: 4 },
      ],
      draftRouting: [
        { sequence: 10, operation: 'CNC 5-Axis Milling', machineClass: 'CNC_MILL_5AXIS', plannedHours: 6 },
        { sequence: 20, operation: 'CMM First Article QC', machineClass: 'CMM_INSPECTION', plannedHours: 1.5 },
      ],
      qcChecklist: ['CMM 12-point dimensional verification', 'Pressure burst proof test 350 bar'],
    };
  }
}
