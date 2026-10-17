'use client';

import React, { useState } from 'react';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { StockBalanceDTO } from '@/server/modules/inventory/contracts';
import { ErrorState } from '@/components/ui/resource-state';
import { PageHeader } from '@/components/ui/page-header';
import { ListSearch } from '@/components/ui/list-search';
import { ButtonLink } from '@/components/ui/button-link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { formatQuantity } from '@/domain/quantity';

export function StockBalancesView() {
  const { search, setSearch, query } = useListSearch();
  const [kindFilter, setKindFilter] = useState<string>('');

  const { data: pageData, isLoading, refetch, error: queryError, pagination } = usePaginatedList<StockBalanceDTO>(
    'stock-balances',
    { search: query, kind: kindFilter }
  );
  const balances = pageData?.data || [];
  const totalCount = pageData?.pagination?.total ?? balances.length;

  if (queryError) {
    return (
      <div className="page-stack">
        <PageHeader title="Material Inventory & Balances" />
        <ErrorState message={queryError.message} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Material Inventory & Balances"
        description="Review on-hand, reserved, and available stock by item, lot, and location."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/inventory/issues/new">Issue to WIP</ButtonLink>
            <ButtonLink href="/inventory/transfers/new">Transfer Stock</ButtonLink>
            <ButtonLink href="/inventory/returns/new">Return Unused</ButtonLink>
            <ButtonLink href="/inventory/counts" variant="primary">
              Physical Counts
            </ButtonLink>
          </div>
        }
      />

      <section className="od-facts" aria-label="Inventory balance summary">
        <div className="od-fact">
          <span>Stock positions</span>
          <strong>{totalCount}</strong>
          <small>{balances.length} shown on this page</small>
        </div>
        <div className="od-fact">
          <span>Available positions</span>
          <strong>{balances.filter((b) => b.availableAtoms > 0n).length}</strong>
          <small>Reserved on {balances.filter((b) => b.reservedAtoms > 0n).length} positions</small>
        </div>
        <div className="od-fact">
          <span>WIP in production</span>
          <strong>{balances.filter((b) => b.locationKind === 'WIP').length}</strong>
          <small>Active shop-floor custody</small>
        </div>
        <div className="od-fact">
          <span>Quarantine hold</span>
          <strong>{balances.filter((b) => b.locationKind === 'QUARANTINE').length}</strong>
          <small>Awaiting quality disposition</small>
        </div>
      </section>

      <Tabs
        className="inventory-filter-toolbar"
        ariaLabel="Filter by location kind"
        activeId={kindFilter}
        onChange={setKindFilter}
        items={[
          { id: '', label: 'All locations' },
          { id: 'RAW', label: 'Raw / Warehouse' },
          { id: 'WIP', label: 'WIP' },
          { id: 'QUARANTINE', label: 'Quarantine' },
          { id: 'FG', label: 'Finished Goods' },
        ]}
        rightSlot={
          <div className="inventory-filter-actions">
            <ListSearch
              value={search}
              onChange={setSearch}
              placeholder="Search item, lot, or location…"
              label="Search inventory balances"
            />
            <Button variant="default" icon="reset" onClick={() => void refetch()}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted">Loading inventory balances...</p>
        ) : balances.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm space-y-2">
            <p>No inventory balances match criteria.</p>
            <p className="text-xs">Post inbound receipts or opening records to initialize stock buckets.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-line text-xs text-muted font-semibold">
                <tr>
                  <th className="p-3.5">Item</th>
                  <th className="p-3.5">Location</th>
                  <th className="p-3.5">Lot #</th>
                  <th className="p-3.5 text-right">On-Hand</th>
                  <th className="p-3.5 text-right">Reserved</th>
                  <th className="p-3.5 text-right">Available</th>
                  <th className="p-3.5 text-center">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {balances.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-muted transition">
                    <td className="p-3.5">
                      <div className="font-semibold text-ink">{b.itemCode}</div>
                      <div className="text-xs text-muted">{b.itemName}</div>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{b.locationCode}</span>
                        <Badge
                          variant={
                            b.locationKind === 'QUARANTINE'
                              ? 'warning'
                              : b.locationKind === 'WIP'
                                ? 'blue'
                                : b.locationKind === 'FG'
                                  ? 'success'
                                  : 'default'
                          }
                        >
                          {b.locationKind}
                        </Badge>
                      </div>
                      {b.locationName && <div className="text-xs text-muted mt-0.5">{b.locationName}</div>}
                    </td>
                    <td className="p-3.5 font-mono text-xs">
                      {b.lotNumber || <span className="text-muted italic">—</span>}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-ink">
                      {formatQuantity(b.onHandAtoms)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-warning">
                      {formatQuantity(b.reservedAtoms)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-success">
                      {formatQuantity(b.availableAtoms)}
                    </td>
                    <td className="p-3.5 text-center font-mono text-xs text-muted">
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
