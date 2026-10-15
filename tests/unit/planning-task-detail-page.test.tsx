import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/domain/errors';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  requirePrincipal: vi.fn(),
  getTaskExecutionDetail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/server/auth/auth', () => ({ requirePrincipal: mocks.requirePrincipal }));
vi.mock('@/server/modules/execution/service', () => ({
  executionService: { getTaskExecutionDetail: mocks.getTaskExecutionDetail },
}));

import PlanningTaskDetailPage from '@/app/(workspace)/planning/tasks/[id]/page';

describe('PlanningTaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.requirePrincipal.mockResolvedValue({ workspaceId: 'workspace-1' });
  });

  it('keeps unexpected loading failures out of the not-found path', async () => {
    const failure = new Error('database unavailable');
    mocks.getTaskExecutionDetail.mockRejectedValue(failure);

    await expect(
      PlanningTaskDetailPage({ params: Promise.resolve({ id: 'task-1' }) }),
    ).rejects.toBe(failure);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('uses the not-found path for a task that does not exist', async () => {
    mocks.getTaskExecutionDetail.mockRejectedValue(new NotFoundError('Task missing'));

    await expect(
      PlanningTaskDetailPage({ params: Promise.resolve({ id: 'missing-task' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it('preserves authentication failures instead of presenting them as missing tasks', async () => {
    const failure = new Error('authentication lookup failed');
    mocks.requirePrincipal.mockRejectedValue(failure);

    await expect(
      PlanningTaskDetailPage({ params: Promise.resolve({ id: 'task-1' }) }),
    ).rejects.toBe(failure);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
