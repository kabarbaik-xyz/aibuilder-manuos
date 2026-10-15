'use client';

import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { OrderDto } from '@/features/orders/api';

import React from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';

export default function EngineeringHubPage() {
  const { data: pageData, isPending, error, refetch, pagination } = usePaginatedList<OrderDto>('engineering');
  const orders = pageData?.data || [];

  if (isPending) return <LoadingState message="Loading engineering review queue…" />;
  if (error) return <ErrorState title="Failed to load engineering orders" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 border-line">
        <h1 className="text-2xl font-bold text-ink">Engineering Hub</h1>
        <p className="text-sm text-muted">
          Engineering review queue, drawing specs, BOM calculation, and process routing approvals.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-surface-muted text-muted font-semibold text-xs border-line">
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
                <td colSpan={6} className="text-center text-muted">
                  No orders in engineering review queue.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const latestEng = o.engineeringRevisions?.[0];
                const openQuestionsCount = o.questions?.filter((q) => q.status === 'OPEN').length || 0;
                return (
                  <tr key={o.id} className="border-b hover:bg-surface-muted border-line">
                    <td className="p-3 font-mono font-bold text-primary">{o.orderNumber}</td>
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
                        <span className="text-xs font-bold text-danger">
                          {openQuestionsCount} blocking question(s)
                        </span>
                      ) : (
                        <span className="text-xs text-muted">None</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/engineering/orders/${o.id}`} className="btn  ">
                          Review Specs & BOM
                        </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
    </div>
  );
}
