'use client';

import React from 'react';
import Link from 'next/link';
import { useOrders } from '@/features/orders/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/resource-state';

export default function OrdersPage() {
  const { data: orders = [], isPending, error, refetch } = useOrders();

  if (isPending) return <LoadingState message="Loading orders…" />;
  if (error) return <ErrorState title="Failed to load orders" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Hub</h1>
          <p className="text-sm text-slate-500">
            Commercial order drafts, engineering prerequisites, material demand, and production release.
          </p>
        </div>

        <Link href="/orders/new">
          <Button variant="primary">New Order Intake</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="Create your first customer order draft from RFQ specification."
          actionLabel="New Order Intake"
          onAction={() => window.location.assign('/orders/new')}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-600 font-semibold text-xs">
                <th className="p-3">Order Number</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Item</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Requested Delivery</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const qty = Number(o.orderedAtoms) / 1_000_000;
                return (
                  <tr key={o.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3 font-medium text-slate-800">{o.customer?.name}</td>
                    <td className="p-3">{o.item?.name}</td>
                    <td className="p-3">
                      {qty} {o.item?.baseUom?.code || 'pcs'}
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(o.requestedDate).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          o.status === 'RELEASED' || o.status === 'IN_PRODUCTION'
                            ? 'success'
                            : o.status === 'READY'
                            ? 'blue'
                            : 'default'
                        }
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/orders/${o.id}`}>
                        <Button variant="default" size="small">
                          View Order
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
