'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSupplyOrder } from '@/features/supply/hooks';
import { SupplyOrderDetail } from '@/features/supply/components/supply-order-detail';

export default function SupplyOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: order, isLoading, error } = useSupplyOrder(id);

  return (
    <div className="page-stack">
      {isLoading ? (
        <div className="card p-12 text-center text-sm text-muted">
          Loading purchase order details...
        </div>
      ) : error || !order ? (
        <div className="card p-12 text-center text-sm text-danger">
          Failed to load purchase order. It may have been archived or does not exist.
        </div>
      ) : (
        <SupplyOrderDetail order={order} />
      )}
    </div>
  );
}
