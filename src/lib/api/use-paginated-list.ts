'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './client';
import { hydrateAtomFields } from './quantities';
import { normalizeMasterRecord } from '@/features/masters/compatibility';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import type { PaginationMeta, PaginationProps } from '@/components/ui/pagination';

const masterResources = new Set(['customers', 'suppliers', 'items', 'locations', 'uoms', 'departments', 'calendars', 'machines', 'technicians', 'skills', 'order-types', 'qc-checklists']);
const cachePrefixes: Record<string, readonly string[]> = { 'supply-orders': ['supply', 'orders'], receipts: ['supply', 'receipts'], shipments: ['delivery', 'shipments'], inspections: ['quality', 'inspections'], 'my-work': ['execution', 'my-tasks'], engineering: ['orders'], forms: ['forms', 'templates'], planning: ['planning', 'schedule'], 'portal-orders': ['portal', 'orders'] };
export function usePaginatedList<T, Summary = Record<string, unknown>>(resource: string, filters: Record<string, string | undefined> = {}, enabled = true) {
  const { principal } = useWorkspaceNavigation();
  const filterKey = JSON.stringify(filters);
  const [state, setState] = useState({ filterKey, page: 1, pageSize: 10 });
  const page = state.filterKey === filterKey ? state.page : 1;
  const query = useQuery({
    queryKey: [...(['users', 'roles', 'permissions'].includes(resource) ? ['access', principal?.workspaceId, resource] : cachePrefixes[resource] || [resource]), 'paginated', principal?.membershipId, filters, page, state.pageSize],
    enabled: Boolean(principal) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(state.pageSize) });
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await apiRequest<{ data: T[]; pagination: PaginationMeta; summary?: Summary }>(`/api/lists/${resource}?${params}`, { signal });
      return { ...response, data: masterResources.has(resource) ? normalizeMasterRecord(response.data) as T[] : hydrateAtomFields(response.data) };
    },
  });
  const pagination: PaginationProps = {
    ...(query.data?.pagination || { page, pageSize: state.pageSize, total: 0, totalPages: 1 }),
    disabled: query.isFetching,
    onPageChange: next => setState(previous => ({ ...previous, filterKey, page: next })),
    onPageSizeChange: pageSize => setState({ filterKey, page: 1, pageSize }),
  };
  return { ...query, pagination };
}
