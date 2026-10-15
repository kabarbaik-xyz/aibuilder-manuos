"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePortalOrderDetail } from "../hooks";
import { downloadPortalDocument } from "../api";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";

export function PortalOrderDetailView({ orderId }: { orderId: string }) {
  const { order, loading, error, refresh, acknowledge } = usePortalOrderDetail(orderId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      setDownloadingId(docId);
      await downloadPortalDocument(docId, fileName);
    } catch (err: any) {
      alert(err?.message || "Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page-stack">
        <Panel className="p-8 text-center text-xs text-muted">
          Loading order details...
        </Panel>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page-stack">
        <Panel className="p-8 text-center">
          <p className="text-sm text-red-600 font-medium mb-2">
            {error || "Order not found"}
          </p>
          <ButtonLink href="/portal/orders">
            ← Back to orders
          </ButtonLink>
        </Panel>
      </div>
    );
  }

  const showAckBanner = order.promisedDate && !order.customerAcknowledged;

  return (
    <div className="page-stack">
      <div className="mb-2">
        <Link
          href="/portal/orders"
          className="text-xs text-muted hover:text-ink flex items-center gap-1"
        >
          ← Back to all orders
        </Link>
      </div>

      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.itemName} (${order.itemCode}) · ${order.orderedQuantity} units ordered`}
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant={
                order.status === "DELIVERED"
                  ? "success"
                  : order.status === "PARTIALLY_DELIVERED"
                  ? "blue"
                  : "default"
              }
            >
              {order.status.replace(/_/g, " ")}
            </Badge>
            {order.customerAcknowledged && (
              <Badge variant="success">Plan Acknowledged</Badge>
            )}
          </div>
        }
      />

      {/* Attention banner if acknowledgement required */}
      {showAckBanner && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Icon name="truck" className="w-5 h-5" />
            </span>
            <div>
              <h4 className="font-semibold text-amber-900 text-sm">
                Delivery Schedule Update Awaiting Confirmation
              </h4>
              <p className="text-xs text-amber-700">
                Promised delivery date:{" "}
                <strong>
                  {order.promisedDate
                    ? new Date(order.promisedDate).toLocaleDateString()
                    : "Under review"}
                </strong>
                . Please review and acknowledge this fulfillment plan.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={acknowledge}
            className="shrink-0"
          >
            Acknowledge Delivery Plan
          </Button>
        </div>
      )}

      {/* Progress & Specifications Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel className="p-4 md:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Production & Verification Progress</h3>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Verified QC Passed Units</span>
              <span className="font-bold text-ink">
                {order.qcPassedQuantity} / {order.orderedQuantity} ({order.progressPct}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-surface-muted rounded-full overflow-hidden border border-line">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${order.progressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-line text-xs">
            <div>
              <span className="text-muted block text-xs">Requested Date</span>
              <strong className="text-ink font-semibold">
                {new Date(order.requestedDate).toLocaleDateString()}
              </strong>
            </div>
            <div>
              <span className="text-muted block text-xs">Promised Date</span>
              <strong className="text-ink font-semibold">
                {order.promisedDate
                  ? new Date(order.promisedDate).toLocaleDateString()
                  : "Pending Review"}
              </strong>
            </div>
            <div>
              <span className="text-muted block text-xs">Acknowledgment</span>
              <span className="text-ink font-semibold">
                {order.customerAcknowledged
                  ? `Confirmed by ${order.customerAcknowledgedBy || "Customer"}`
                  : "Not yet confirmed"}
              </span>
            </div>
          </div>
        </Panel>

        {/* Milestones Card */}
        <Panel className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Fulfillment Milestones</h3>
          <div className="space-y-2.5">
            {order.milestones.map((m) => (
              <div key={m.key} className="flex items-center justify-between text-xs">
                <span className="text-ink flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      m.status === "COMPLETED"
                        ? "bg-emerald-500"
                        : m.status === "IN_PROGRESS"
                        ? "bg-amber-500 animate-pulse"
                        : "bg-line"
                    }`}
                  />
                  {m.title}
                </span>
                <span className="text-xs text-muted capitalize">
                  {m.status.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Shipments Section */}
      <Panel className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Shipments & Deliveries</h3>
            <p className="text-xs text-muted">
              Physical dispatch records and proof of delivery evidence
            </p>
          </div>
        </div>

        {order.shipments.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl">
            No shipments dispatched yet. Goods will be dispatched upon final QC inspection.
          </div>
        ) : (
          <div className="grid gap-3">
            {order.shipments.map((shipment) => (
              <div
                key={shipment.id}
                className="p-4 border border-line rounded-xl bg-surface-muted/30 space-y-3"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-xs">
                      {shipment.shipmentNumber}
                    </span>
                    <Badge
                      variant={
                        shipment.status === "DELIVERED"
                          ? "success"
                          : shipment.status === "DISPATCHED"
                          ? "blue"
                          : "default"
                      }
                    >
                      {shipment.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {shipment.dispatchedAt && (
                      <span>
                        Dispatched:{" "}
                        {new Date(shipment.dispatchedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-line/60 pt-2">
                  <div>
                    <span className="text-muted block text-xs">Carrier</span>
                    <strong className="text-ink">
                      {shipment.carrierName || "Pending Carrier"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted block text-xs">Tracking #</span>
                    <strong className="text-ink">
                      {shipment.trackingNumber || "—"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted block text-xs">Delivery Status</span>
                    <strong className="text-ink">
                      {shipment.deliveredAt
                        ? `Delivered on ${new Date(shipment.deliveredAt).toLocaleDateString()}`
                        : "In Transit"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted block text-xs">Received By</span>
                    <strong className="text-ink">
                      {shipment.receivedBy || "—"}
                    </strong>
                  </div>
                </div>

                {shipment.lines.length > 0 && (
                  <div className="text-xs border-t border-line/60 pt-2">
                    <span className="text-muted text-xs block mb-1">
                      Shipped Contents:
                    </span>
                    <div className="flex items-center gap-3">
                      {shipment.lines.map((line, idx) => (
                        <span key={idx} className="bg-surface px-2 py-0.5 border border-line rounded">
                          {line.itemName}: <strong>{line.deliveredQuantity || line.dispatchedQuantity || line.allocatedQuantity} units</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Permitted Documents & Digital Passports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Documents */}
        <Panel className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">Order Documents</h3>
              <p className="text-xs text-muted">
                Official certificates, packing slips, and inspection evidence
              </p>
            </div>
          </div>

          {order.documents.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl">
              No customer documents released yet.
            </div>
          ) : (
            <div className="space-y-2">
              {order.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border border-line rounded-xl hover:bg-surface-muted/50 transition"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium text-ink text-xs block">
                      {doc.fileName}
                    </span>
                    <span className="text-xs text-muted">
                      {(doc.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button
                    size="small"
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    disabled={downloadingId === doc.id}
                  >
                    {downloadingId === doc.id ? "Downloading..." : "Download"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Digital Unit Passports */}
        <Panel className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">Unit Digital Passports</h3>
              <p className="text-xs text-muted">
                Cryptographically verifiable unit genealogy & inspection trail
              </p>
            </div>
          </div>

          {order.passports.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl">
              Passports are published once units successfully pass final QC inspection.
            </div>
          ) : (
            <div className="space-y-2">
              {order.passports.map((p) => (
                <div
                  key={p.serialNumber}
                  className="flex items-center justify-between p-3 border border-line rounded-xl hover:bg-surface-muted/50 transition"
                >
                  <div className="space-y-0.5">
                    <span className="font-medium text-ink text-xs block">
                      Serial: {p.serialNumber}
                    </span>
                    <span className="text-xs text-muted font-mono">
                      Digest: {p.digestSha256.substring(0, 16)}...
                    </span>
                  </div>
                  <ButtonLink
                    href={`/passports/${encodeURIComponent(p.serialNumber)}`}
                    variant="primary"
                    size="small"
                  >
                    View Passport →
                  </ButtonLink>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
