import { z } from 'zod';

export const SendNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  subjectType: z.string().max(50).optional(),
  subjectId: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;

export interface NotificationDTO {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  body: string | null;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  subjectType: string | null;
  subjectId: string | null;
  metadataJson: string | null;
  readAt: string | null;
  createdAt: string;
}
