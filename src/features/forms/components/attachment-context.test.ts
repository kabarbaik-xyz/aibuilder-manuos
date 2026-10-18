import { describe, expect, it } from 'vitest';
import { getFormAttachmentUploadLink } from './attachment-context';

describe('form attachment upload context', () => {
  it('scopes operator evidence uploads to the task required by the document API', () => {
    expect(getFormAttachmentUploadLink('TASK', 'task-123')).toEqual({ parentType: 'TASK', parentId: 'task-123' });
  });

  it('links order evidence to its order and does not invent an inspection authorization path', () => {
    expect(getFormAttachmentUploadLink('ORDER', 'order-123')).toEqual({ parentType: 'ORDER', parentId: 'order-123' });
    expect(getFormAttachmentUploadLink('INSPECTION', 'inspection-123')).toBeUndefined();
  });
});
