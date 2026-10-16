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
                    {order.lines.length === 1 ? order.lines[0].itemName : `${order.lines.length} product lines`}
                  </h3>
                  <div className="space-y-1.5 text-xs text-muted">
                    {order.lines.map((line) => (
                      <div key={line.orderLineId} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium text-ink">{line.itemCode} · {line.itemName}</span>
                        <span>Ordered: <strong className="text-ink font-semibold">{line.orderedQuantity}</strong></span>
                        <span>QC passed: <strong className="text-ink font-semibold">{line.qcPassedQuantity}</strong></span>
                        <span>{line.progressPct}% QC</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    {order.promisedDate && (
                      <span>
                        Promised:{" "}
                        <strong className="text-ink font-semibold">
                          {new Date(order.promisedDate).toLocaleDateString()}
                        </strong>
                      </span>
                    )}
                  </div>

                  {order.lines.length > 1 && (
                    <p className="text-xs text-muted">Quality progress is shown separately for each product line.</p>
                  )}
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
