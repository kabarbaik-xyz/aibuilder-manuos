'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { OrderType } from '@/features/masters/api';

export function OrderTypeEditDialog({
  orderType,
  onClose,
}: {
  orderType: OrderType | null;
  onClose: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    setName(orderType?.name || '');
    setError(null);
  }, [orderType]);

  const save = useMutation({
    mutationFn: () => apiRequest(`/api/resources/order-types/${orderType?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion: orderType?.version, name: name.trim() }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order-types'] });
      onClose();
    },
    onError: (reason) => setError(reason as ApiError),
  });

  return (
    <Dialog
      isOpen={!!orderType}
      onClose={onClose}
      title="Edit order type"
      subtitle={orderType ? `${orderType.code} · Update its display name` : undefined}
      type="modal"
      size="md"
      pending={save.isPending}
      dirty={name !== (orderType?.name || '')}
      footer={<>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" form={id} variant="primary" disabled={save.isPending || !name.trim()}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </>}
    >
      <form id={id} className="page-stack" onSubmit={(event) => { event.preventDefault(); setError(null); save.mutate(); }}>
        <FormErrorSummary error={error} />
        <FormField id={`${id}-name`} label="Order type name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} disabled={save.isPending} />
        </FormField>
      </form>
    </Dialog>
  );
}
