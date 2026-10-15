'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useOrder } from '@/features/orders/hooks';
import { OrderDetail } from '@/features/orders/components/order-detail';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: order, isPending, error, refetch } = useOrder(id);

  if (isPending) return <LoadingState message="Loading order details…" />;
  if (error || !order) {
    return (
      <ErrorState
        title="Order not found"
        message="The order does not exist or your account lacks required read permission."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="p-6">
      <OrderDetail order={order} />
    </div>
  );
}
