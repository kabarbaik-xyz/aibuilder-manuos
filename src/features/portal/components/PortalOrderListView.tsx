'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import { ListSearch } from '@/components/ui/list-search';
import type { CustomerOrderSummaryDTO } from '@/features/portal/api';

import React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export function PortalOrderListView() {
  const { search, setSearch, query } = useListSearch();
  const { data: pageData, isLoading: loading, error: queryError, refetch: refresh, pagination } = usePaginatedList<CustomerOrderSummaryDTO>('portal-orders', { search: query || undefined });
  const orders = pageData?.data || [];
  const error = queryError?.message;

  return (
    <div className="page-stack">
      <PageHeader
        title="Your Production Orders"
        description="Track verified shop-floor progress, inspected quality milestones, and active deliveries."
      />

      <ListSearch value={search} onChange={setSearch} placeholder="Search order number or item…" label="Search production orders" />

      {loading ? (
        <Panel className="p-8 text-center text-xs text-muted">
          Loading production orders...
        </Panel>
      ) : error ? (
        <Panel className="p-8 text-center">
          <p className="text-sm text-red-600 font-medium mb-2">{error}</p>
          <Button
            onClick={() => void refresh()}
          >
            Retry
          </Button>
        </Panel>
      ) : orders.length === 0 ? (
        <Panel className="p-12">
          <EmptyState />
          <p className="text-center text-xs text-muted mt-2">
            No active orders found for your customer account.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const hasPendingAck =
              order.promisedDate && !order.customerAcknowledged;

            return (
              <Panel
                key={order.id}
                className="p-5 hover:border-primary/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink text-sm">
                      {order.orderNumber}
                    </span>
                    <Badge
                      variant={
                        order.status === "DELIVERED"
                          ? "success"
                          : order.status === "PARTIALLY_DELIVERED"
                          ? "blue"
                          : order.status === "IN_PRODUCTION"
                          ? "warning"
                          : "default"
                      }
                    >
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                    {hasPendingAck && (
                      <Badge variant="warning">Delivery Review Required</Badge>
                    )}
                    {order.customerAcknowledged && (
                      <Badge variant="success">Plan Acknowledged</Badge>
                    )}
                  </div>
                  <h3 className="font-medium text-ink text-sm">
                    {order.itemName}
                    <span className="text-xs text-muted font-normal ml-2">
                      ({order.itemCode})
                    </span>
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>
                      Ordered:{" "}
                      <strong className="text-ink font-semibold">
                        {order.orderedQuantity}
                      </strong>
                    </span>
                    <span>
                      QC Passed:{" "}
                      <strong className="text-ink font-semibold">
                        {order.qcPassedQuantity}
                      </strong>
                    </span>
                    {order.promisedDate && (
                      <span>
                        Promised:{" "}
                        <strong className="text-ink font-semibold">
                          {new Date(order.promisedDate).toLocaleDateString()}
                        </strong>
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full max-w-md pt-1.5">
                    <div className="flex justify-between text-[11px] text-muted mb-1">
                      <span>Verified Progress</span>
                      <span className="font-semibold text-ink">
                        {order.progressPct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden border border-line">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${order.progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <ButtonLink
                    href={`/portal/orders/${order.id}`}
                    variant="primary"
                  >
                    View Order & Traceability →
                  </ButtonLink>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <Pagination {...pagination} />
    </div>
  );
}
