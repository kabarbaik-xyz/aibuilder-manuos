'use client';

import React from 'react';
import Link from 'next/link';
import { useSupplyReceipts } from '@/features/supply/hooks';
import { AppShell } from '@/components/app-shell';
import { formatQuantity } from '@/domain/quantity';

export default function InventoryReceiptsPage() {
  const { data: receipts, isLoading } = useSupplyReceipts();

  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <span className="text-white">Inbound Receipts</span>
        </div>
      }
      activeTitle="Inbound Receipts"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inbound Receipts</h1>
            <p className="text-sm text-muted">
              Chronological log of verified incoming shipments posted into inventory balances.
            </p>
          </div>
          <Link href="/supply-orders">
            <button className="btn btn-outline text-sm">View Purchase Orders</button>
          </Link>
        </div>

        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted">Loading inbound receipts...</p>
          ) : !receipts || receipts.length === 0 ? (
            <div className="p-12 text-center text-muted text-sm space-y-2">
              <p>No inbound receipts posted yet.</p>
              <p className="text-xs">Receive shipments against approved purchase orders to post inventory entries.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {receipts.map((rec) => (
                <div key={rec.id} className="p-4 space-y-3 hover:bg-muted/5 transition">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-base text-white">{rec.receiptNumber}</span>
                      <span className="text-xs text-muted">
                        against PO{' '}
                        <Link href={`/supply-orders/${rec.supplyOrderId}`} className="text-sky-400 hover:underline">
                          {rec.orderNumber}
                        </Link>{' '}
                        ({rec.supplierName})
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(rec.receivedDate).toLocaleString()} · Receiver: {rec.receivedByName}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-muted border-b border-border bg-muted/10">
                        <tr>
                          <th className="px-3 py-1.5">Material</th>
                          <th className="px-3 py-1.5">Storage Location</th>
                          <th className="px-3 py-1.5">Assigned Lot #</th>
                          <th className="px-3 py-1.5 text-right font-bold">Received Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {rec.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="px-3 py-2 font-medium">
                              {l.itemCode} - {l.itemName}
                            </td>
                            <td className="px-3 py-2 font-mono text-muted">{l.locationCode}</td>
                            <td className="px-3 py-2 font-mono text-sky-400">{l.lotNumber || '-'}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                              +{formatQuantity(l.receivedAtoms)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rec.notes && <p className="text-xs text-muted italic px-3">Notes: {rec.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
