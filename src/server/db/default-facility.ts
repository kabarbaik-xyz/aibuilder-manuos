import type { Prisma } from '@prisma/client';

/**
 * Ensures the workspace default operating site (`FAC-DEFAULT`) exists and returns it.
 *
 * The `facility_scope_notifications` migration backfills a default facility for
 * every workspace that existed when it ran, and scopes memberships, technicians,
 * machines and orders to it. Workspaces and memberships created afterwards
 * (seeding, bootstrap, access administration) must uphold the same invariant:
 * facility-scoped reads in planning and execution resolve as
 * `{ facilityId: { in: authorizedFacilityIds(principal) } }`, so a member with no
 * facility scope is denied every task rather than treated as unrestricted.
 *
 * Idempotent: repeat calls match the existing `(workspaceId, code)` row.
 */
export async function ensureDefaultFacility(
  client: Prisma.TransactionClient,
  workspaceId: string
) {
  return client.facility.upsert({
    where: { workspaceId_code: { workspaceId, code: 'FAC-DEFAULT' } },
    update: {},
    create: {
      workspaceId,
      code: 'FAC-DEFAULT',
      name: 'Default Operating Site',
      isDefault: true,
    },
  });
}
