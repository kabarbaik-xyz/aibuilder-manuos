import { z } from 'zod';

export const NOTIFICATION_CATEGORIES = ['ASSIGNMENT', 'RELEASE', 'APPROVAL', 'BLOCKER', 'GENERAL'] as const;
export const NotificationPreferencesSchema = z.object({
  ASSIGNMENT: z.boolean().default(true),
  RELEASE: z.boolean().default(true),
  APPROVAL: z.boolean().default(true),
  BLOCKER: z.boolean().default(true),
  GENERAL: z.boolean().default(true),
}).strict();
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export const UpdateNotificationPreferencesSchema = z.object({
  preferences: NotificationPreferencesSchema,
  expectedVersion: z.number().int().positive(),
}).strict();

export const SendNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  category: z.enum(NOTIFICATION_CATEGORIES).default('GENERAL'),
  facilityId: z.string().min(1).optional(),
  body: z.string().max(2000).optional(),
  subjectType: z.string().max(50).optional(),
  subjectId: z.string().max(100).optional(),
  dedupeKey: z.string().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SendNotificationInput = z.input<typeof SendNotificationSchema>;

export interface NotificationDTO {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  body: string | null;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  category: string;
  deliveryStatus: string;
  deliveryReason: string | null;
  subjectType: string | null;
  subjectId: string | null;
  metadataJson: string | null;
  readAt: string | null;
  createdAt: string;
}
