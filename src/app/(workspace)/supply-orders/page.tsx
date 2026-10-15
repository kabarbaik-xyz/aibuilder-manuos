'use client';

import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { SupplyOrderDTO } from '@/server/modules/supply/contracts';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import React from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SupplyOrdersPage() {
  const { data: pageData, isLoading, refetch, error: queryError, pagination } = usePaginatedList<SupplyOrderDTO>('supply-orders');
  const orders = pageData?.data || [];

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'success';
      case 'PARTIALLY_RECEIVED':
        return 'warning';
      case 'RECEIVED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'default';
    }
  };

  if (queryError) return <div className="page-stack"><PageHeader title="Supply orders"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
    <div className="page-stack">
      <div className="space-y-6">
        <PageHeader title="Purchase Orders" description="Manage external procurement, vendor POs, expected lead times, and inbound shipments." actions={<><Link href="/supply-orders/new" className="btn primary ">+ New Purchase Order</Link></>} />

        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted">Loading purchase orders...</p>
          ) : !orders || orders.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-muted text-sm">No supply purchase orders created yet.</p>
              <Link href="/supply-orders/new" className="btn  ">Create First Purchase Order</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted bg-surface-muted border-b border-line">
                  <tr>
                    <th className="px-4 py-3">PO Number</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Expected Date</th>
                    <th className="px-4 py-3">Lines</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {orders.map((po) => (
                    <tr key={po.id} className="hover:bg-surface-muted transition">
                      <td className="px-4 py-3 font-mono font-medium">
                        <Link href={`/supply-orders/${po.id}`} className="text-primary hover:underline">
                          {po.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{po.supplierName}</span>
                        <span className="text-xs text-muted block">{po.supplierCode}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(po.expectedDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {po.lines.length} material(s)
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusBadgeVariant(po.status) as any}>
                          {po.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/supply-orders/${po.id}`} className="btn  ">View / Receive</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Pagination {...pagination} />
    </div>
  );
}
