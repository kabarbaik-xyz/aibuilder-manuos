'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupplyOrders } from '@/features/supply/hooks';
import { SupplyReceiptModal } from '@/features/supply/components/supply-receipt-modal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NewReceiptPage() {
  const router = useRouter();
  const { data: orders, isLoading } = useSupplyOrders({ status: 'APPROVED' });
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const eligibleOrders = (orders || []).filter(
    (o) => o.status === 'APPROVED' || o.status === 'PARTIALLY_RECEIVED'
  );

  return (
    <div className="page-stack">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receive Inbound Goods</h1>
          <p className="text-sm text-muted">
            Select an approved purchase order to verify shipments and post verified lots into inventory.
          </p>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-line bg-surface-muted">
            <h2 className="text-sm font-semibold uppercase text-ink">Approved Purchase Orders Awaiting Delivery</h2>
          </div>

          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted">Loading purchase orders...</p>
          ) : eligibleOrders.length === 0 ? (
            <div className="p-12 text-center text-muted text-sm space-y-2">
              <p>No approved purchase orders currently pending receipt.</p>
              <Link href="/supply-orders" className="btn  mt-2">
                  View All Purchase Orders
                </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {eligibleOrders.map((order) => (
                <div key={order.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-surface-muted transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-base text-ink">{order.orderNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-success-soft text-success">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Supplier: <span className="text-ink font-medium">{order.supplierName}</span> · Lines: {order.lines.length} · Expected Date: {new Date(order.expectedDate).toLocaleDateString()}
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => setSelectedOrder(order)}
                  >
                    Receive Shipment
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedOrder && (
          <SupplyReceiptModal
            order={selectedOrder}
            isOpen={Boolean(selectedOrder)}
            onClose={() => {
              setSelectedOrder(null);
              router.push('/inventory/receipts');
            }}
          />
        )}
      </div>
    </div>
  );
}
