'use client';

import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useOrder } from '@/features/orders/hooks';
import { useEngineeringRevision } from '@/features/engineering/hooks';
import { ReviewEditor } from '@/features/engineering/components/review-editor';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
import Link from 'next/link';
import { Panel } from '@/components/ui/panel';
import { PermissionGate } from '@/components/ui/permission-gate';
import { memoryHrefForItem } from '@/features/intelligence/memory-navigation';

export default function OrderEngineeringReviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;

  const { data: order, isPending: isOrderPending, error: orderError, refetch: refetchOrder } =
    useOrder(orderId);

  const latestRevId = order?.engineeringRevisions?.[0]?.id;
  const requestedRevisionId = searchParams.get('revisionId');
  const selectedRevisionId = order?.engineeringRevisions?.some(revision => revision.id === requestedRevisionId)
    ? requestedRevisionId
    : latestRevId;

  const { data: revision, isPending: isRevPending, error: revError, refetch: refetchRev } =
    useEngineeringRevision(orderId, selectedRevisionId || '');

  if (isOrderPending || (selectedRevisionId && isRevPending)) {
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
    <div className="page-stack">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="small muted">Compare this item with completed work using measured duration and finalized inspection evidence.</p>
        <PermissionGate permission={['planning.read', 'execution.read']}>
          <Link className="btn soft" href={memoryHrefForItem(order.itemId, order.id) ?? '/ai/memory'}>Similar jobs</Link>
        </PermissionGate>
      </Panel>
      <ReviewEditor orderId={orderId} revision={revision} />
    </div>
  );
}
