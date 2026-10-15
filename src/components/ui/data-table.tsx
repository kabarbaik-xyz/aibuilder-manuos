import React from 'react';
import Link from 'next/link';
import { EmptyState, LoadingState } from './resource-state';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data?: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  getRowHref?: (row: T) => string;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  isLoading,
  emptyTitle,
  emptyDescription,
  onRowClick,
  getRowHref,
}: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="data-table">
      <table className="w-full text-left text-sm text-ink">
        <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wider text-muted">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}

              className={`transition hover:bg-surface ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col, columnIndex) => (
                <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                  {columnIndex === 0 && getRowHref ? <Link className="record-link" href={getRowHref(row)}>{col.render ? col.render(row) : (row as any)[col.key]}</Link> : columnIndex === 0 && onRowClick ? <button type="button" className="record-link" onClick={() => onRowClick(row)}>{col.render ? col.render(row) : (row as any)[col.key]}</button> : col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
