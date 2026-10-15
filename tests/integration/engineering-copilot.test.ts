import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { EngineeringCopilotService } from '@/server/modules/engineering/copilot';

describe('I05: AI Engineering Copilot Connected to Real Reviewed Creation', () => {
  let fixture: FactoryFixture;
  let copilotService: EngineeringCopilotService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    copilotService = new EngineeringCopilotService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('extracts RFQ into structured specifications and maps to registered masters', async () => {
    const { alpha } = fixture;

    const fgItem = await fixture.db.item.findUnique({
      where: { id: alpha.masters.fgItemId },
    });
    expect(fgItem).toBeDefined();

    const rfqText = `
Request for Quotation:
Customer: Apex Dynamics Corp
Part: Precision Mounting Bracket ${fgItem!.code}
Quantity: 80 pcs
Material: Titanium Ti-6Al-4V Grade 5
Tolerances: Bore diameter ±0.012 mm, Flatness 0.025 mm
Required Delivery: 2026-12-15
Note: Anodize specification not yet finalized by customer.
    `;

    const review = await copilotService.draftEngineeringFromRFQ(
      alpha.users.owner.principal,
      rfqText
    );

    expect(review).toBeDefined();
    expect(review.extraction.qty).toBe(80);
    expect(review.extraction.customer).toBeDefined();
    expect(review.extraction.tolerances.length).toBeGreaterThan(0);

    // Matched masters in database
    expect(review.matchedMasters.customer).toBeDefined();
    expect(review.matchedMasters.customer?.id).toBe(alpha.masters.customerId);
    expect(review.matchedMasters.item?.id).toBe(alpha.masters.fgItemId);
    expect(review.matchedMasters.uom?.code).toBe('PCS');

    // Unresolved ambiguities
    expect(review.suggestedCustomerQuestions.length).toBeGreaterThan(0);
  });

  it('flags unmapped customers and catalog items as explicit ambiguities', async () => {
    const { alpha } = fixture;

    const rfqText = `
RFQ from Unknown Aircraft Co for Custom Titanium Bracket BRK-9999
Quantity: 40 pcs
Surface finish Ra 0.4µm
    `;

    const review = await copilotService.draftEngineeringFromRFQ(
      alpha.users.owner.principal,
      rfqText
    );

    // Masters should flag unmapped
    expect(review.unresolvedAmbiguities.some((a) => a.includes('not registered') || a.includes('does not match'))).toBe(true);
    expect(review.suggestedCustomerQuestions.length).toBeGreaterThan(0);
  });

  it('drafts valid DAG workflow definition conforming to workflowDefinitionSchema', async () => {
    const { alpha } = fixture;

    const workflowDraft = await copilotService.draftWorkflowDefinition(
      alpha.users.owner.principal,
      {
        orderTypeName: 'Aerospace Structural Bracket',
        description: 'CNC milling with CMM inspection',
      }
    );

    expect(workflowDraft).toBeDefined();
    expect(workflowDraft.schemaVersion).toBe(1);
    expect(workflowDraft.nodes.length).toBeGreaterThanOrEqual(3);
    expect(workflowDraft.edges.length).toBeGreaterThanOrEqual(2);

    // Precedence: OP-10 -> OP-20 -> QC-30
    const edge1 = workflowDraft.edges.find((e) => e.fromNodeKey === 'OP-10' && e.toNodeKey === 'OP-20');
    expect(edge1).toBeDefined();
    expect(edge1?.joinPolicy).toBe('AND');
  });
});
