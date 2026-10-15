"use client";

import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { ShipmentDTO } from '@/features/delivery/api';

import React, { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatQuantity } from "@/domain/quantity";
import { ShipmentCreateModal } from "./ShipmentCreateModal";

export function ShipmentListView() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: pageData, isLoading, error, refetch, pagination } = usePaginatedList<ShipmentDTO>('shipments', { status: statusFilter });
  const shipments = pageData?.data || [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Shipments & Delivery Dispatch"
        description="Allocate accepted Finished Goods inventory to customer orders, generate shipping documents, and dispatch physical stock."
        actions={
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New Shipment
          </Button>
        }
      />

      {/* Status Filter Tabs */}
      <div className="tabs">
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={`tab ${statusFilter === "" ? "active" : ""}`}
        >
          All Shipments
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("ALLOCATED")}
          className={`tab ${statusFilter === "ALLOCATED" ? "active" : ""}`}
        >
          Allocated / Ready to Dispatch
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("DISPATCHED")}
          className={`tab ${statusFilter === "DISPATCHED" ? "active" : ""}`}
        >
          In Transit / Dispatched
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("DELIVERED")}
          className={`tab ${statusFilter === "DELIVERED" ? "active" : ""}`}
        >
          Delivered
        </button>
      </div>

      <Panel>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted">
            Loading shipments ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-danger">
            Failed to load shipments: {error.message}
          </div>
        ) : !shipments || shipments.length === 0 ? (
          <EmptyState
            title="No shipments found"
            description="Create a shipment allocation to reserve finished goods from warehouse stock and ship to customers."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-muted font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Shipment #</th>
                  <th className="py-3 px-4">Order & Customer</th>
                  <th className="py-3 px-4">Item & Quantity</th>
                  <th className="py-3 px-4">Carrier & Tracking</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Timeline</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {shipments.map((s) => {
                  const totalAtoms = s.lines.reduce(
                    (acc, l) => acc + l.allocatedAtoms,
                    0n,
                  );
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-surface-muted/50 transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold">
                        <Link
                          href={`/delivery/shipments/${s.id}`}
                          className="text-primary hover:underline"
                        >
                          {s.shipmentNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-ink">
                          {s.customer?.name || "Customer"}
                        </div>
                        <div className="text-[11px] text-muted">
                          Order {s.order?.orderNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold font-mono">
                          {formatQuantity(totalAtoms)} units
                        </div>
                        <div className="text-[11px] text-muted truncate max-w-45">
                          {s.order?.item?.name}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs">{s.carrierName || "—"}</div>
                        <div className="text-[11px] font-mono text-muted">
                          {s.trackingNumber || "No tracking"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {s.status === "ALLOCATED" ? (
                          <Badge variant="warning">ALLOCATED (RESERVED)</Badge>
                        ) : s.status === "DISPATCHED" ? (
                          <Badge variant="blue">DISPATCHED (IN TRANSIT)</Badge>
                        ) : s.status === "DELIVERED" ? (
                          <Badge variant="success">DELIVERED</Badge>
                        ) : (
                          <Badge variant="default">{s.status}</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-muted">
                        <div>
                          Allocated:{" "}
                          {new Date(s.allocatedAt).toLocaleDateString()}
                        </div>
                        {s.dispatchedAt && (
                          <div>
                            Dispatched:{" "}
                            {new Date(s.dispatchedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <ButtonLink
                          href={`/delivery/shipments/${s.id}`}
                          size="small"
                        >
                          View Details
                        </ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ShipmentCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => refetch()}
      />
      <Pagination {...pagination} />
    </div>
  );
}
