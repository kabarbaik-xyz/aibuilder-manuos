import { describe, expect, it } from 'vitest';
import { getNotificationHref } from '@/features/notifications/notification-links';

describe('notification entity links', () => {
  it('links known workspace entity types to their server-authorized detail routes', () => {
    expect(getNotificationHref({ subjectType: 'ORDER', subjectId: 'order/1' })).toBe('/orders/order%2F1');
    expect(getNotificationHref({ subjectType: 'TASK', subjectId: 'task-1' })).toBe('/shop-floor/tasks/task-1');
    expect(getNotificationHref({ subjectType: 'INSPECTION', subjectId: 'inspection-1' })).toBe('/quality/inspections/inspection-1');
  });

  it('links assigned issues through the owning task and leaves unknown or incomplete links absent', () => {
    expect(getNotificationHref({
      subjectType: 'TASK_ISSUE',
      subjectId: 'issue-1',
      metadataJson: JSON.stringify({ taskId: 'task-1' }),
    })).toBe('/shop-floor/tasks/task-1');
    expect(getNotificationHref({ subjectType: 'TASK_ISSUE', subjectId: 'issue-1' })).toBeNull();
    expect(getNotificationHref({ subjectType: 'UNKNOWN', subjectId: 'id' })).toBeNull();
  });
});
