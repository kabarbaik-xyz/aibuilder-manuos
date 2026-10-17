import { apiRequest } from '@/lib/api/client';
import type { ScheduleRecoveryReviewResult } from '@/server/modules/intelligence/recovery-contracts';

export async function proposeRecovery(input: {
  orderId: string;
  instanceId: string;
}): Promise<ScheduleRecoveryReviewResult> {
  const response = await apiRequest<{ data: ScheduleRecoveryReviewResult }>('/api/intelligence/recovery/propose', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}
