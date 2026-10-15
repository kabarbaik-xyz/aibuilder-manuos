'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useSupplyOrder } from '@/features/supply/hooks';
import { SupplyOrderDetail } from '@/features/supply/components/supply-order-detail';

export default function SupplyOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: order, isLoading, error } = useSupplyOrder(id);

  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <Link href="/supply-orders" className="hover:text-white">Supply Orders</Link>
          <span>/</span>
          <span className="text-white font-mono">{order?.orderNumber || 'Order'}</span>
        </div>
      }
      activeTitle={order ? `PO ${order.orderNumber}` : 'Purchase Order'}
    >
      {isLoading ? (
        <div className="card p-12 text-center text-sm text-muted">
          Loading purchase order details...
        </div>
      ) : error || !order ? (
        <div className="card p-12 text-center text-sm text-red-400">
          Failed to load purchase order. It may have been archived or does not exist.
        </div>
      ) : (
        <SupplyOrderDetail order={order} />
      )}
    </AppShell>
  );
}
