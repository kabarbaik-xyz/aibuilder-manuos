'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSupplyReceipts } from '@/features/supply/hooks';
import { formatQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export default function ReceiptDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: receipts, isLoading } = useSupplyReceipts();

  const receipt = (receipts || []).find((r) => r.id === id);

  return (
    <div className="page-stack">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono tracking-tight">
                {receipt?.receiptNumber || 'Inbound Receipt'}
              </h1>
              <span className="text-xs px-2.5 py-1 rounded font-mono font-semibold bg-success-soft text-success border border-success/20">
                POSTED TO LEDGER
              </span>
            </div>
            {receipt && (
              <p className="text-sm text-muted mt-1">
                Received on {new Date(receipt.receivedDate).toLocaleString()} by <span className="text-ink">{receipt.receivedByName}</span>
              </p>
            )}
          </div>

          <Link href="/inventory/receipts" className="btn  ">Back to Receipts</Link>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading receipt...</p>
        ) : !receipt ? (
          <div className="card p-8 text-center space-y-4">
            <p className="text-muted">Receipt not found.</p>
            <Link href="/inventory/receipts" className="btn  ">Return to Receipts List</Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="card p-4">
                <p className="text-xs text-muted uppercase font-semibold">Purchase Order</p>
                <Link href={`/supply-orders/${receipt.supplyOrderId}`} className="text-sm font-mono font-medium text-primary hover:underline mt-1 block">
                  {receipt.orderNumber}
                </Link>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted uppercase font-semibold">Supplier</p>
                <p className="text-sm font-medium text-ink mt-1">{receipt.supplierName}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted uppercase font-semibold">Receiver</p>
                <p className="text-sm font-medium text-ink mt-1">{receipt.receivedByName}</p>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-line bg-surface-muted">
                <h2 className="text-base font-semibold">Received Item Lines</h2>
                <p className="text-xs text-muted">Physical quantities received and allocated to destination locations.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-muted border-b border-line text-xs text-muted uppercase font-semibold">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3">Destination Location</th>
                      <th className="p-3">Lot Number</th>
                      <th className="p-3 text-right">Received Qty</th>
                      <th className="p-3">Ledger Movement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {receipt.lines.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-muted transition">
                        <td className="p-3">
                          <div className="font-medium text-ink">{l.itemCode}</div>
                          <div className="text-xs text-muted">{l.itemName}</div>
                        </td>
                        <td className="p-3 font-mono text-xs">{l.locationCode}</td>
                        <td className="p-3 font-mono text-xs">
                          {l.lotNumber || <span className="text-muted italic">—</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-success">
                          {formatQuantity(l.receivedAtoms)}
                        </td>
                        <td className="p-3 font-mono text-xs text-primary">
                          {l.movementId ? `MOV-${l.movementId.slice(0, 8)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
