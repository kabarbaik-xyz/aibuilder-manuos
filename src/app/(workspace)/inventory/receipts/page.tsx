'use client';

import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { SupplyReceiptDTO } from '@/server/modules/supply/contracts';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import React from 'react';
import Link from 'next/link';

import { formatQuantity } from '@/domain/quantity';

export default function InventoryReceiptsPage() {
  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isLoading, refetch, error: queryError, pagination } = usePaginatedList<SupplyReceiptDTO>('receipts', { search: query || undefined });
  const receipts = pageData?.data || [];

  if (queryError) return <div className="page-stack"><PageHeader title="Inbound receipts"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
    <div className="page-stack">
      <div className="space-y-6">
        <PageHeader title="Inbound Receipts" description="Chronological log of verified incoming shipments posted into inventory balances." actions={<><Link href="/supply-orders">
            <button className="btn btn-outline text-sm">View Purchase Orders</button>
          </Link></>} />

        <ListSearch value={search} onChange={setSearch} placeholder="Search receipt, PO, supplier or item…" label="Search inbound receipts" />

        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted">Loading inbound receipts...</p>
          ) : !receipts || receipts.length === 0 ? (
            <div className="p-12 text-center text-muted text-sm space-y-2">
              <p>No inbound receipts posted yet.</p>
              <p className="text-xs">Receive shipments against approved purchase orders to post inventory entries.</p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {receipts.map((rec) => (
                <div key={rec.id} className="p-4 space-y-3 hover:bg-surface-muted transition">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-base text-ink">{rec.receiptNumber}</span>
                      <span className="text-xs text-muted">
                        against PO{' '}
                        <Link href={`/supply-orders/${rec.supplyOrderId}`} className="text-primary hover:underline">
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
                      <thead className="text-muted border-b border-line bg-surface-muted">
                        <tr>
                          <th className="px-3 py-1.5">Material</th>
                          <th className="px-3 py-1.5">Storage Location</th>
                          <th className="px-3 py-1.5">Assigned Lot #</th>
                          <th className="px-3 py-1.5 text-right font-bold">Received Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/50">
                        {rec.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="px-3 py-2 font-medium">
                              {l.itemCode} - {l.itemName}
                            </td>
                            <td className="px-3 py-2 font-mono text-muted">{l.locationCode}</td>
                            <td className="px-3 py-2 font-mono text-primary">{l.lotNumber || '-'}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-success">
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
      <Pagination {...pagination} />
    </div>
  );
}
