'use client';

import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { StockBalanceDTO } from '@/server/modules/inventory/contracts';

import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import Link from 'next/link';

import { formatQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function StockBalancesView() {
  const [itemFilter, setItemFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const { data: pageData, isLoading, refetch, error: queryError, pagination } = usePaginatedList<StockBalanceDTO>('stock-balances', { search: itemFilter, locationSearch: locationFilter });
  const balances = pageData?.data || [];

  const filteredBalances = balances;

  // Calculate totals
  let totalOnHandAtoms = 0n;
  let totalReservedAtoms = 0n;
  let totalAvailableAtoms = 0n;
  let wipAtoms = 0n;
  let quarantineAtoms = 0n;

  for (const b of filteredBalances) {
    totalOnHandAtoms += b.onHandAtoms;
    totalReservedAtoms += b.reservedAtoms;
    totalAvailableAtoms += b.availableAtoms;
    if (b.locationKind === 'WIP') {
      wipAtoms += b.onHandAtoms;
    } else if (b.locationKind === 'QUARANTINE') {
      quarantineAtoms += b.onHandAtoms;
    }
  }

  if (queryError) return <div className="page-stack"><PageHeader title="Inventory"/><ErrorState message={queryError.message} onRetry={()=>refetch()}/></div>;

  return (
    <div className="space-y-6">
      {/* Header and Action Buttons */}
      <PageHeader title="Material Inventory & Balances" description="Review on-hand, reserved and available stock by item, lot and location." actions={<><div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory/issues/new" className="btn  ">Issue to WIP</Link>
          <Link href="/inventory/transfers/new" className="btn  ">Transfer Stock</Link>
          <Link href="/inventory/returns/new" className="btn  ">Return Unused</Link>
          <Link href="/inventory/counts" className="btn primary ">Physical Counts</Link>
        </div></>} />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Stock positions on this page</p>
          <p className="text-xl font-bold font-mono text-ink mt-1">
            {filteredBalances.length}
          </p>
          <p className="text-xs text-muted mt-1">Item, lot and location combinations</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Reserved on this page</p>
          <p className="text-xl font-bold font-mono text-ink mt-1">
            {filteredBalances.filter(b => b.reservedAtoms > 0n).length}
          </p>
          <p className="text-xs text-muted mt-1">Positions with reserved stock</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Available on this page</p>
          <p className="text-xl font-bold font-mono text-ink mt-1">
            {filteredBalances.filter(b => b.availableAtoms > 0n).length}
          </p>
          <p className="text-xs text-muted mt-1">Positions with available stock</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">WIP on this page</p>
          <p className="text-xl font-bold font-mono text-ink mt-1">
            {filteredBalances.filter(b => b.locationKind === 'WIP').length}
          </p>
          <p className="text-xs text-muted mt-1">Positions in production</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Quarantine on this page</p>
          <p className="text-xl font-bold font-mono text-ink mt-1">
            {filteredBalances.filter(b => b.locationKind === 'QUARANTINE').length}
          </p>
          <p className="text-xs text-muted mt-1">Awaiting inspection</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="text"
          placeholder="Filter by item code or name..."
          className="input flex-1"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Filter by location code or name..."
          className="input sm:w-64"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        />
        <Button variant="default" size="small" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Balances Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading inventory balances...</p>
        ) : filteredBalances.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm space-y-2">
            <p>No inventory balances match criteria.</p>
            <p className="text-xs">Post inbound receipts or opening records to initialize stock buckets.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-line text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Lot #</th>
                  <th className="p-3 text-right">On-Hand</th>
                  <th className="p-3 text-right">Reserved</th>
                  <th className="p-3 text-right">Available</th>
                  <th className="p-3 text-center">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-muted transition">
                    <td className="p-3">
                      <div className="font-medium text-ink">{b.itemCode}</div>
                      <div className="text-xs text-muted">{b.itemName}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-ink">{b.locationCode}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-surface-muted text-muted">
                        {b.locationKind}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {b.lotNumber || <span className="text-muted italic">—</span>}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-ink">
                      {formatQuantity(b.onHandAtoms)}
                    </td>
                    <td className="p-3 text-right font-mono text-warning">
                      {formatQuantity(b.reservedAtoms)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-success">
                      {formatQuantity(b.availableAtoms)}
                    </td>
                    <td className="p-3 text-center font-mono text-xs text-muted">
                      v{b.version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination {...pagination} />
    </div>
  );
}
