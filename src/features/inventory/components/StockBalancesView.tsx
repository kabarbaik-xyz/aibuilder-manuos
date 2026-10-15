'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useStockBalances } from '../hooks';
import { formatQuantity } from '@/domain/quantity';
import { Button } from '@/components/ui/button';

export function StockBalancesView() {
  const [itemFilter, setItemFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const { data: balances, isLoading, refetch } = useStockBalances();

  const filteredBalances = (balances || []).filter((b) => {
    if (itemFilter && !b.itemCode.toLowerCase().includes(itemFilter.toLowerCase()) && !b.itemName.toLowerCase().includes(itemFilter.toLowerCase())) {
      return false;
    }
    if (locationFilter && !b.locationCode.toLowerCase().includes(locationFilter.toLowerCase()) && !b.locationName.toLowerCase().includes(locationFilter.toLowerCase())) {
      return false;
    }
    return true;
  });

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

  return (
    <div className="space-y-6">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Material Inventory & Balances</h1>
          <p className="text-sm text-muted">
            Derived stock ledger balances with exact integer atom precision and reservation tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory/issues/new">
            <Button variant="default" size="small">Issue to WIP</Button>
          </Link>
          <Link href="/inventory/transfers/new">
            <Button variant="default" size="small">Transfer Stock</Button>
          </Link>
          <Link href="/inventory/returns/new">
            <Button variant="default" size="small">Return Unused</Button>
          </Link>
          <Link href="/inventory/counts">
            <Button variant="primary" size="small">Physical Counts</Button>
          </Link>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Total On-Hand</p>
          <p className="text-xl font-bold font-mono text-white mt-1">
            {formatQuantity(totalOnHandAtoms)}
          </p>
          <p className="text-xs text-muted mt-1">Physical in facility</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Hard Reserved</p>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1">
            {formatQuantity(totalReservedAtoms)}
          </p>
          <p className="text-xs text-muted mt-1">Committed to released orders</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Net Available</p>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {formatQuantity(totalAvailableAtoms)}
          </p>
          <p className="text-xs text-muted mt-1">Eligible for allocation</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">WIP Active</p>
          <p className="text-xl font-bold font-mono text-sky-400 mt-1">
            {formatQuantity(wipAtoms)}
          </p>
          <p className="text-xs text-muted mt-1">Issued to workstations</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted uppercase font-semibold">Quarantine</p>
          <p className="text-xl font-bold font-mono text-rose-400 mt-1">
            {formatQuantity(quarantineAtoms)}
          </p>
          <p className="text-xs text-muted mt-1">Awaiting inspection</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Filter by item code or name..."
          className="input flex-1"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
        />
        <input
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
              <thead className="bg-muted/10 border-b border-border text-xs text-muted uppercase font-semibold">
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
              <tbody className="divide-y divide-border">
                {filteredBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/5 transition">
                    <td className="p-3">
                      <div className="font-medium text-white">{b.itemCode}</div>
                      <div className="text-xs text-muted">{b.itemName}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-white">{b.locationCode}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-muted/20 text-muted">
                        {b.locationKind}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {b.lotNumber || <span className="text-muted italic">—</span>}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-white">
                      {formatQuantity(b.onHandAtoms)}
                    </td>
                    <td className="p-3 text-right font-mono text-amber-400">
                      {formatQuantity(b.reservedAtoms)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
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
    </div>
  );
}
