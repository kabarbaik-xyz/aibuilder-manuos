import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import {
  DecideShareConsentInput,
  OfferCommitmentInput,
  ProposeShareConsentInput,
} from './contracts';

/**
 * Opt-in cross-factory sharing. Every consent is bilateral: the proposing
 * workspace offers, the named partner accepts, either side revokes. A
 * commitment is an auditable offer of capacity or stock for a window — it
 * never creates inventory on the receiving side; receipt stays with the
 * existing receipt/QC/ledger paths.
 */
export class SharingService {
  constructor(private prisma: PrismaClient) {}

  async proposeConsent(
    principal: Principal,
    input: ProposeShareConsentInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workspace.manage');
    if (input.partnerWorkspaceId === principal.workspaceId) {
      throw new BadRequestError('A workspace cannot share with itself');
    }

    return executeCommand({
      principal,
      commandType: 'factory.sharing.consent.propose',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const partner = await tx.workspace.findUnique({
          where: { id: input.partnerWorkspaceId },
          select: { id: true },
        });
        if (!partner) {
          throw new NotFoundError(`Partner workspace '${input.partnerWorkspaceId}' not found`);
        }
        const existing = await tx.factoryShareConsent.findUnique({
          where: {
            workspaceId_partnerWorkspaceId_scope: {
              workspaceId: principal.workspaceId,
              partnerWorkspaceId: input.partnerWorkspaceId,
              scope: input.scope,
            },
          },
          select: { status: true },
        });
        if (existing && existing.status !== 'REVOKED') {
          throw new BadRequestError(
            `A ${existing.status.toLowerCase()} sharing consent with this partner already exists for scope ${input.scope}`
          );
        }

        const created = await tx.factoryShareConsent.create({
          data: {
            workspaceId: principal.workspaceId,
            partnerWorkspaceId: input.partnerWorkspaceId,
            scope: input.scope,
            note: input.note,
            proposedById: principal.userId,
          },
        });
        return {
          data: created,
          aggregateType: 'FACTORY_SHARE_CONSENT',
          aggregateId: created.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * ACCEPT is reserved for the named partner workspace; REVOKE is open to
   * either side. Any other workspace reads the consent as not found.
   */
  async decideConsent(
    principal: Principal,
    input: DecideShareConsentInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workspace.manage');

    return executeCommand({
      principal,
      commandType: 'factory.sharing.consent.decide',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const consent = await tx.factoryShareConsent.findFirst({
          where: {
            id: input.consentId,
            OR: [
              { workspaceId: principal.workspaceId },
              { partnerWorkspaceId: principal.workspaceId },
            ],
          },
        });
        if (!consent) {
          throw new NotFoundError(`Sharing consent '${input.consentId}' not found`);
        }
        if (consent.status === 'REVOKED') {
          throw new BadRequestError('Sharing consent has already been revoked');
        }
        if (input.action === 'ACCEPT') {
          if (consent.partnerWorkspaceId !== principal.workspaceId) {
            throw new NotFoundError(`Sharing consent '${input.consentId}' not found`);
          }
          if (consent.status === 'ACCEPTED') {
            throw new BadRequestError('Sharing consent is already accepted');
          }
          const updated = await tx.factoryShareConsent.update({
            where: { id: consent.id },
            data: {
              status: 'ACCEPTED',
              acceptedById: principal.userId,
              acceptedAt: new Date(),
            },
          });
          return {
            data: updated,
            aggregateType: 'FACTORY_SHARE_CONSENT',
            aggregateId: updated.id,
            resourceVersion: 1,
          };
        }

        const updated = await tx.factoryShareConsent.update({
          where: { id: consent.id },
          data: {
            status: 'REVOKED',
            revokedById: principal.userId,
            revokedAt: new Date(),
          },
        });
        return {
          data: updated,
          aggregateType: 'FACTORY_SHARE_CONSENT',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async getConsent(principal: Principal, consentId: string) {
    requirePermission(principal, 'workspace.manage');
    const consent = await this.prisma.factoryShareConsent.findFirst({
      where: {
        id: consentId,
        OR: [
          { workspaceId: principal.workspaceId },
          { partnerWorkspaceId: principal.workspaceId },
        ],
      },
    });
    if (!consent) {
      throw new NotFoundError(`Sharing consent '${consentId}' not found`);
    }
    return { data: consent };
  }

  async listConsents(principal: Principal) {
    requirePermission(principal, 'workspace.manage');
    const consents = await this.prisma.factoryShareConsent.findMany({
      where: {
        OR: [
          { workspaceId: principal.workspaceId },
          { partnerWorkspaceId: principal.workspaceId },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return { data: consents };
  }

  async offerCommitment(
    principal: Principal,
    input: OfferCommitmentInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'planning.write');
    const windowStart = new Date(input.windowStart);
    const windowEnd = new Date(input.windowEnd);
    if (windowEnd <= windowStart) {
      throw new BadRequestError('Commitment window must end after it starts');
    }

    return executeCommand({
      principal,
      commandType: 'factory.sharing.commitment.offer',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const consent = await tx.factoryShareConsent.findFirst({
          where: { id: input.consentId, workspaceId: principal.workspaceId },
        });
        if (!consent) {
          throw new NotFoundError(
            `Sharing consent '${input.consentId}' not found for this workspace`
          );
        }
        if (consent.status !== 'ACCEPTED') {
          throw new BadRequestError(
            `Sharing consent '${input.consentId}' is ${consent.status.toLowerCase()}; commitments require an accepted consent`
          );
        }

        const created = await tx.sharedCapacityCommitment.create({
          data: {
            workspaceId: principal.workspaceId,
            consentId: consent.id,
            kind: input.kind,
            resourceKey: input.resourceKey,
            quantityAtoms: BigInt(input.quantity) * 1_000_000n,
            windowStart,
            windowEnd,
            offeredById: principal.userId,
          },
        });
        return {
          data: created,
          aggregateType: 'SHARED_CAPACITY_COMMITMENT',
          aggregateId: created.id,
          resourceVersion: 1,
        };
      },
    });
  }
}
