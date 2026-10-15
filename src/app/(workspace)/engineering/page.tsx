'use client';

import React from 'react';
import Link from 'next/link';
import { useOrders } from '@/features/orders/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

export default function EngineeringHubPage() {
  const { data: orders = [], isPending, error, refetch } = useOrders();

  if (isPending) return <LoadingState message="Loading engineering review queue…" />;
  if (error) return <ErrorState title="Failed to load engineering orders" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 p-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Engineering Hub</h1>
        <p className="text-sm text-slate-500">
          Engineering review queue, drawing specs, BOM calculation, and process routing approvals.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-600 font-semibold text-xs">
              <th className="p-3">Order Number</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Target Item</th>
              <th className="p-3">Engineering Status</th>
              <th className="p-3">Open Questions</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  No orders in engineering review queue.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const latestEng = o.engineeringRevisions?.[0];
                const openQuestionsCount = o.questions?.filter((q) => q.status === 'OPEN').length || 0;
                return (
                  <tr key={o.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-600">{o.orderNumber}</td>
                    <td className="p-3">{o.customer?.name}</td>
                    <td className="p-3">{o.item?.name}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          latestEng?.status === 'APPROVED'
                            ? 'success'
                            : latestEng?.status === 'REVIEW'
                            ? 'blue'
                            : 'default'
                        }
                      >
                        Rev {latestEng?.revisionNumber || 1} · {latestEng?.status || 'DRAFT'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {openQuestionsCount > 0 ? (
                        <span className="text-xs font-bold text-rose-600">
                          {openQuestionsCount} blocking question(s)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/engineering/orders/${o.id}`}>
                        <Button variant="default" size="small">
                          Review Specs & BOM
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
