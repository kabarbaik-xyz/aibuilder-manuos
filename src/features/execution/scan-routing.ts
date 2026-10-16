import type { ScanResultDTO } from '@/server/modules/execution/contracts';

export function getScanOpenPath(result: ScanResultDTO, canReadOrder = false): string | null {
  if (result.type === 'TASK' && result.taskId) {
    return `/shop-floor/tasks/${encodeURIComponent(result.taskId)}`;
  }

  if (result.type === 'ORDER' && canReadOrder) {
    return `/orders/${encodeURIComponent(result.entityId)}`;
  }

  if (result.type === 'JOB' && result.taskId) {
    return `/shop-floor/tasks/${encodeURIComponent(result.taskId)}`;
  }

  return null;
}
