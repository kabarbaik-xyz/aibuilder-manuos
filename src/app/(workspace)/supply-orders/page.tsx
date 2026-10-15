'use client';

import React from 'react';
import Link from 'next/link';
import { useSupplyOrders } from '@/features/supply/hooks';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SupplyOrdersPage() {
  const { data: orders, isLoading } = useSupplyOrders();

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

  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <span className="text-white">Supply Orders</span>
        </div>
      }
      activeTitle="Supply Orders"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-sm text-muted">
              Manage external procurement, vendor POs, expected lead times, and inbound shipments.
            </p>
          </div>
          <Link href="/supply-orders/new">
            <Button variant="primary">+ New Purchase Order</Button>
          </Link>
        </div>

        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted">Loading purchase orders...</p>
          ) : !orders || orders.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-muted text-sm">No supply purchase orders created yet.</p>
              <Link href="/supply-orders/new">
                <Button variant="default" size="small">Create First Purchase Order</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted bg-muted/20 border-b border-border">
                  <tr>
                    <th className="px-4 py-3">PO Number</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Expected Date</th>
                    <th className="px-4 py-3">Lines</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((po) => (
                    <tr key={po.id} className="hover:bg-muted/10 transition">
                      <td className="px-4 py-3 font-mono font-medium">
                        <Link href={`/supply-orders/${po.id}`} className="text-sky-400 hover:underline">
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
                        <Link href={`/supply-orders/${po.id}`}>
                          <Button variant="default" size="small">View / Receive</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
