import { z } from 'zod';

export const SHARE_SCOPES = ['CAPABILITY', 'CAPACITY', 'SUPPLY'] as const;

export const ProposeShareConsentSchema = z.object({
  partnerWorkspaceId: z.string().uuid(),
  scope: z.enum(SHARE_SCOPES),
  note: z.string().max(1000).optional(),
});

export const DecideShareConsentSchema = z.object({
  consentId: z.string().uuid(),
  action: z.enum(['ACCEPT', 'REVOKE']),
});

export const OfferCommitmentSchema = z.object({
  consentId: z.string().uuid(),
  kind: z.enum(['CAPACITY', 'STOCK']),
  resourceKey: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
});

export type ProposeShareConsentInput = z.infer<typeof ProposeShareConsentSchema>;
export type DecideShareConsentInput = z.infer<typeof DecideShareConsentSchema>;
export type OfferCommitmentInput = z.infer<typeof OfferCommitmentSchema>;
