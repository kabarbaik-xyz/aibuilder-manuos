'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useOrder } from '@/features/orders/hooks';
import { useEngineeringRevision } from '@/features/engineering/hooks';
import { ReviewEditor } from '@/features/engineering/components/review-editor';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

export default function OrderEngineeringReviewPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const { data: order, isPending: isOrderPending, error: orderError, refetch: refetchOrder } =
    useOrder(orderId);

  const latestRevId = order?.engineeringRevisions?.[0]?.id;

  const { data: revision, isPending: isRevPending, error: revError, refetch: refetchRev } =
    useEngineeringRevision(orderId, latestRevId || '');

  if (isOrderPending || (latestRevId && isRevPending)) {
    return <LoadingState message="Loading engineering revision…" />;
  }

  if (orderError || revError || !order || !revision) {
    return (
      <ErrorState
        title="Engineering revision not found"
        message="Unable to load engineering details for this order."
        onRetry={() => {
          refetchOrder();
          refetchRev();
        }}
      />
    );
  }

  return (
    <div className="">
      <ReviewEditor orderId={orderId} revision={revision} />
    </div>
  );
}
