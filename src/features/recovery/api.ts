import { apiRequest } from '@/lib/api/client';
import type { RecoveryProposalDTO } from '@/server/modules/intelligence/recovery-contracts';

export async function proposeRecovery(input: {
  orderId: string;
  disruptionType: string;
  delayDays: number;
}): Promise<RecoveryProposalDTO> {
  const response = await apiRequest<{ data: RecoveryProposalDTO }>('/api/intelligence/recovery/propose', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}
