export interface NotificationLinkInput {
  subjectType?: string | null;
  subjectId?: string | null;
  metadataJson?: string | null;
}

export function getNotificationHref(notification: NotificationLinkInput): string | null {
  const id = notification.subjectId;
  if (id && notification.subjectType === 'ORDER') return `/orders/${encodeURIComponent(id)}`;
  if (id && notification.subjectType === 'TASK') return `/shop-floor/tasks/${encodeURIComponent(id)}`;
  if (id && notification.subjectType === 'INSPECTION') return `/quality/inspections/${encodeURIComponent(id)}`;

  if (notification.subjectType === 'TASK_ISSUE' && notification.metadataJson) {
    try {
      const metadata: unknown = JSON.parse(notification.metadataJson);
      if (metadata && typeof metadata === 'object' && 'taskId' in metadata) {
        const taskId = (metadata as { taskId?: unknown }).taskId;
        if (typeof taskId === 'string' && taskId.length > 0) {
          return `/shop-floor/tasks/${encodeURIComponent(taskId)}`;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}
