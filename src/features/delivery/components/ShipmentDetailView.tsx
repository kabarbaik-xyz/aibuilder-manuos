"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  MapPin,
  Building2,
  Printer,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { useShipment, useDispatchShipment, useConfirmDelivery } from "../hooks";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatQuantity } from "@/domain/quantity";

export interface ShipmentDetailViewProps {
  shipmentId: string;
}

export function ShipmentDetailView({ shipmentId }: ShipmentDetailViewProps) {
  const { data: shipment, isLoading, error, refetch } = useShipment(shipmentId);

  const dispatchMutation = useDispatchShipment();
  const confirmMutation = useConfirmDelivery();

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [carrierName, setCarrierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [proofOfDelivery, setProofOfDelivery] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
        <Clock className="w-5 h-5 animate-spin text-primary" />
        <span>Loading shipment details...</span>
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6 max-w-lg mx-auto">
        <p className="text-danger font-semibold mb-2">Shipment Not Found</p>
        <p className="text-xs text-muted mb-4">
          The requested shipment record could not be loaded or may have been
          archived.
        </p>
        <ButtonLink href="/delivery/shipments">Back to Shipments</ButtonLink>
      </div>
    );
  }

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await dispatchMutation.mutateAsync({
        shipmentId: shipment.id,
        carrierName: carrierName.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: dispatchNotes.trim() || undefined,
      });
      setShowDispatchModal(false);
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Failed to dispatch shipment");
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await confirmMutation.mutateAsync({
        shipmentId: shipment.id,
        receivedBy: receivedBy.trim() || undefined,
        proofOfDelivery: proofOfDelivery.trim() || undefined,
        notes: confirmNotes.trim() || undefined,
      });
      setShowConfirmModal(false);
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Failed to confirm delivery");
    }
  };

  const totalAllocatedAtoms = shipment.lines.reduce(
    (acc, l) => acc + l.allocatedAtoms,
    0n,
  );
  const totalDispatchedAtoms = shipment.lines.reduce(
    (acc, l) => acc + l.dispatchedAtoms,
    0n,
  );
  const totalDeliveredAtoms = shipment.lines.reduce(
    (acc, l) => acc + l.deliveredAtoms,
    0n,
  );

  const orderTotalAtoms = shipment.order?.orderedAtoms || 0n;
  const fulfillmentPct =
    orderTotalAtoms > 0n
      ? Number((totalAllocatedAtoms * 100n) / orderTotalAtoms)
      : 100;

  // Determine current lifecycle step index (0: Allocated, 1: Dispatched, 2: Delivered)
  const isDelivered = shipment.status === "DELIVERED";
  const isDispatched = shipment.status === "DISPATCHED" || isDelivered;
  const isAllocated = true; // All existing shipments are at least allocated

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="page-stack">
      {/* Page Header */}
      <PageHeader
        title={`Shipment ${shipment.shipmentNumber}`}
        description={
          <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
            <span>Originating Order #{shipment.order?.orderNumber || "—"}</span>
            <span className="text-line">•</span>
            <span>
              Customer:{" "}
              <strong className="text-ink font-semibold">
                {shipment.customer?.name || "—"}
              </strong>
            </span>
            <span className="text-line">•</span>
            {shipment.status === "ALLOCATED" && (
              <Badge variant="warning">Allocated (Reserved)</Badge>
            )}
            {shipment.status === "DISPATCHED" && (
              <Badge variant="blue">Dispatched (In Transit)</Badge>
            )}
            {shipment.status === "DELIVERED" && (
              <Badge variant="success">Delivered</Badge>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/delivery/shipments">
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Shipments
              </span>
            </ButtonLink>

            <Button
              type="button"
              onClick={() => window.print()}
              title="Print Delivery Order / Packing Slip"
            >
              <span className="inline-flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" />
                Print Slip
              </span>
            </Button>

            {shipment.status === "ALLOCATED" && (
              <Button
                variant="primary"
                onClick={() => {
                  setCarrierName(shipment.carrierName || "");
                  setTrackingNumber(shipment.trackingNumber || "");
                  setDispatchNotes(shipment.notes || "");
                  setShowDispatchModal(true);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="w-4 h-4" />
                  Dispatch Stock
                </span>
              </Button>
            )}

            {shipment.status === "DISPATCHED" && (
              <Button
                variant="primary"
                onClick={() => {
                  setReceivedBy(shipment.receivedBy || "");
                  setProofOfDelivery(shipment.proofOfDelivery || "");
                  setConfirmNotes(shipment.notes || "");
                  setShowConfirmModal(true);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Customer Delivery
                </span>
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="p-3 bg-danger-soft border border-line rounded-lg text-xs text-danger flex items-center justify-between">
          <div>
            <strong>Action Blocked:</strong> {actionError}
          </div>
          <button
            type="button"
            className="text-xs text-danger hover:underline ml-2"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unified Executive Shipment Overview Panel */}
      <Panel className="p-0 overflow-hidden shadow-xs border-line">
        {/* Contextual Custody / Lifecycle Bar */}
        {shipment.status === 'DELIVERED' && (
          <div className="px-6 py-3.5 bg-emerald-50/70 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-success shrink-0">
                <Check className="w-3.5 h-3.5 text-success stroke-[2.5]" />
              </div>
              <span className="text-xs font-bold text-ink">
                Delivery Complete & Chain of Custody Verified
              </span>
              <span className="text-line">•</span>
              <span className="text-xs text-muted truncate">
                Received by <strong className="text-ink font-semibold">{shipment.receivedBy || 'Customer Receiving Team'}</strong>
                {shipment.deliveredAt && ` on ${formatTimestamp(shipment.deliveredAt)}`}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {shipment.proofOfDelivery && (
                <span className="text-xs font-mono text-ink bg-white px-2 py-0.5 rounded border border-emerald-200/80 shadow-2xs">
                  POD: {shipment.proofOfDelivery}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-white border border-emerald-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5" /> Ledger Settled
              </span>
            </div>
          </div>
        )}

        {shipment.status === 'DISPATCHED' && (
          <div className="px-6 py-3.5 bg-amber-50/70 border-b border-amber-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning"></span>
              </span>
              <span className="text-xs font-bold text-ink">
                Consignment In Transit to Customer
              </span>
              <span className="text-line">•</span>
              <span className="text-xs text-muted truncate">
                Carrier: <strong className="text-ink font-semibold">{shipment.carrierName || 'Direct Logistics'}</strong>
                {shipment.trackingNumber && ` (Waybill: ${shipment.trackingNumber})`}
              </span>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setReceivedBy(shipment.receivedBy || '');
                setProofOfDelivery(shipment.proofOfDelivery || '');
                setConfirmNotes(shipment.notes || '');
                setShowConfirmModal(true);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Record Delivery Receipt
              </span>
            </Button>
          </div>
        )}

        {shipment.status === 'ALLOCATED' && (
          <div className="px-6 py-3.5 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-primary shrink-0">
                <Clock className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs font-bold text-ink">
                Stock Reserved · Ready for Physical Dispatch
              </span>
              <span className="text-line">•</span>
              <span className="text-xs text-muted">
                Finished goods hard-reserved in warehouse location
              </span>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setCarrierName(shipment.carrierName || '');
                setTrackingNumber(shipment.trackingNumber || '');
                setDispatchNotes(shipment.notes || '');
                setShowDispatchModal(true);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Truck className="w-4 h-4" />
                Dispatch Consignment
              </span>
            </Button>
          </div>
        )}

        {/* 4 Harmonized Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line bg-surface">
          {/* Tile 1: Status */}
          <div className="p-6 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Package className="w-3.5 h-3.5 text-muted" />
              Shipment Status
            </div>
            <div className="my-1">
              {isDelivered && (
                <div className="text-2xl font-bold text-ink flex items-center gap-2 tracking-tight">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  Delivered
                </div>
              )}
              {isDispatched && !isDelivered && (
                <div className="text-2xl font-bold text-ink flex items-center gap-2 tracking-tight">
                  <Truck className="w-5 h-5 text-primary" />
                  In Transit
                </div>
              )}
              {!isDispatched && (
                <div className="text-2xl font-bold text-ink flex items-center gap-2 tracking-tight">
                  <Clock className="w-5 h-5 text-warning" />
                  Allocated
                </div>
              )}
            </div>
            <p className="text-xs text-muted mt-2">
              {isDelivered
                ? 'Custody transferred & balances closed'
                : isDispatched
                ? 'Awaiting customer sign-off'
                : 'Warehouse stock allocated'}
            </p>
          </div>

          {/* Tile 2: Quantity */}
          <div className="p-6 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Boxes className="w-3.5 h-3.5 text-muted" />
              Quantity Shipped
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-ink font-mono tracking-tight flex items-baseline gap-1.5">
                <span>{formatQuantity(totalAllocatedAtoms)}</span>
                <span className="text-xs font-normal text-muted font-sans">units</span>
              </div>
            </div>
            <p className="text-xs text-muted mt-2">
              Order Total: {orderTotalAtoms > 0n ? formatQuantity(orderTotalAtoms) : '—'} units ({fulfillmentPct}% fulfilled)
            </p>
          </div>

          {/* Tile 3: Carrier */}
          <div className="p-6 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Truck className="w-3.5 h-3.5 text-muted" />
              Carrier & Waybill
            </div>
            <div className="my-1">
              <div
                className="text-2xl font-bold text-ink truncate tracking-tight"
                title={shipment.carrierName || 'Direct Delivery'}
              >
                {shipment.carrierName || 'Direct Delivery'}
              </div>
            </div>
            <div className="text-xs text-muted mt-2 flex items-center gap-1.5">
              <span className="font-mono text-ink bg-surface-muted px-1.5 py-0.5 rounded border border-line text-xs">
                {shipment.trackingNumber || 'No tracking #'}
              </span>
              {shipment.trackingNumber && (
                <button
                  type="button"
                  onClick={() => handleCopy(shipment.trackingNumber!, 'tracking')}
                  className="text-muted hover:text-ink transition-colors p-0.5 rounded hover:bg-surface-muted"
                  title="Copy tracking number"
                >
                  {copiedKey === 'tracking' ? (
                    <Check className="w-3 h-3 text-success" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Tile 4: Destination */}
          <div className="p-6 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <MapPin className="w-3.5 h-3.5 text-muted" />
              Destination Facility
            </div>
            <div className="my-1">
              <div
                className="text-2xl font-bold text-ink truncate tracking-tight"
                title={shipment.customer?.name || 'Customer Facility'}
              >
                {shipment.customer?.name || 'Customer Facility'}
              </div>
            </div>
            <p
              className="text-xs text-muted mt-2 truncate"
              title={shipment.destinationAddress || 'Customer Facility'}
            >
              {shipment.destinationAddress || 'Customer Facility'}
            </p>
          </div>
        </div>
      </Panel>

      {/* Shipment Lifecycle Stepper */}
      <Panel className="p-4 bg-surface-muted/60">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Shipment Lifecycle & Custody Trail
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {/* Step 1: Allocated */}
          <div
            className={`p-3 rounded-lg border transition-all ${
              isAllocated
                ? "bg-surface border-line shadow-xs"
                : "bg-surface-muted/30 border-transparent text-muted"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold flex items-center gap-1.5 text-ink">
                <span className="w-5 h-5 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-bold">
                  1
                </span>
                Stock Allocated
              </span>
              <Badge variant={isAllocated ? "success" : "default"}>
                {isAllocated ? "Complete" : "Pending"}
              </Badge>
            </div>
            <p className="text-xs text-muted">
              {formatTimestamp(shipment.allocatedAt) || "Initial allocation"}
            </p>
            <p className="text-xs text-muted mt-1">
              Hard reservation placed on Finished Goods stock.
            </p>
          </div>

          {/* Step 2: Dispatched */}
          <div
            className={`p-3 rounded-lg border transition-all ${
              isDispatched
                ? "bg-surface border-line shadow-xs"
                : "bg-surface-muted/30 border-dashed border-line text-muted"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={`text-xs font-bold flex items-center gap-1.5 ${
                  isDispatched ? "text-ink" : "text-muted"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isDispatched
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  2
                </span>
                Carrier Dispatch
              </span>
              <Badge variant={isDispatched ? "success" : "default"}>
                {isDispatched ? "Dispatched" : "Awaiting"}
              </Badge>
            </div>
            <p className="text-xs text-muted">
              {formatTimestamp(shipment.dispatchedAt) ||
                "Pending dispatch execution"}
            </p>
            <p className="text-xs text-muted mt-1">
              {shipment.carrierName
                ? `Picked up by ${shipment.carrierName}`
                : "Transferred to carrier logistics"}
            </p>
          </div>

          {/* Step 3: Delivered */}
          <div
            className={`p-3 rounded-lg border transition-all ${
              isDelivered
                ? "bg-surface border-line shadow-xs"
                : "bg-surface-muted/30 border-dashed border-line text-muted"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={`text-xs font-bold flex items-center gap-1.5 ${
                  isDelivered ? "text-ink" : "text-muted"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isDelivered
                      ? "bg-success-soft text-success"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  3
                </span>
                Customer Acceptance
              </span>
              <Badge variant={isDelivered ? "success" : "default"}>
                {isDelivered ? "Delivered" : "In Transit"}
              </Badge>
            </div>
            <p className="text-xs text-muted">
              {formatTimestamp(shipment.deliveredAt) ||
                "Awaiting receiving confirmation"}
            </p>
            <p className="text-xs text-muted mt-1">
              {shipment.receivedBy
                ? `Signed by ${shipment.receivedBy}`
                : "Proof of Delivery required"}
            </p>
          </div>
        </div>
      </Panel>

      {/* Main Content Grid (Two Columns: 65% Main, 35% Context Sidebar) */}
      <div className="content-grid">
        {/* Left Column: Lines Table and POD details */}
        <div className="space-y-6">
          {/* Allocated Line Items Panel */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Allocated Line Items
                </h3>
                <p className="text-xs text-muted">
                  Physical stock lines reserved and released from finished goods
                  inventory
                </p>
              </div>
              <Badge variant="default">
                {shipment.lines.length} Line Item
                {shipment.lines.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-y border-line text-muted font-semibold uppercase tracking-wider bg-surface-muted/40">
                    <th className="py-2.5 px-4">Item & Code</th>
                    <th className="py-2.5 px-4">Lot / Batch</th>
                    <th className="py-2.5 px-4">Source Location</th>
                    <th className="py-2.5 px-4 text-right">Allocated</th>
                    <th className="py-2.5 px-4 text-right">Dispatched</th>
                    <th className="py-2.5 px-4 text-right">Delivered</th>
                    <th className="py-2.5 px-4 text-center">Fulfillment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {shipment.lines.map((line) => {
                    const isFullyDelivered =
                      line.deliveredAtoms > 0n &&
                      line.deliveredAtoms >= line.allocatedAtoms;
                    return (
                      <tr
                        key={line.id}
                        className="hover:bg-surface-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-ink">
                            {line.item?.name || "Manufactured Item"}
                          </div>
                          <div className="text-xs font-mono text-muted mt-0.5">
                            {line.item?.code || "—"}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-surface-muted border border-line text-ink">
                            {line.lot?.lotNumber || "NO-LOT"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5 text-xs text-ink">
                            <MapPin className="w-3.5 h-3.5 text-muted" />
                            <span>
                              {line.sourceLocation?.name ||
                                "Finished Goods Area"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium numeric">
                          {formatQuantity(line.allocatedAtoms)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-ink numeric">
                          {formatQuantity(line.dispatchedAtoms)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-ink numeric">
                          {formatQuantity(line.deliveredAtoms)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isFullyDelivered ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3" /> 100%
                            </span>
                          ) : line.dispatchedAtoms > 0n ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-full">
                              In Transit
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-muted bg-surface-muted px-2 py-0.5 rounded-full border border-line">
                              Reserved
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="panel-footer bg-surface-muted/20">
              <span className="font-medium">Total Consignment Summary</span>
              <div className="flex items-center gap-6 font-semibold numeric">
                <span>Allocated: {formatQuantity(totalAllocatedAtoms)}</span>
                <span>
                  Dispatched: {formatQuantity(totalDispatchedAtoms)}
                </span>
                <span>
                  Delivered: {formatQuantity(totalDeliveredAtoms)}
                </span>
              </div>
            </div>
          </div>

          {/* Proof of Delivery (POD) Panel */}
          {shipment.status === "DELIVERED" ? (
            <div className="panel">
              <div className="panel-head">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-success-soft text-success flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      Proof of Delivery (POD) & Verification
                    </h3>
                    <p className="text-xs text-muted">
                      Certified customer receiving record and legal
                      chain-of-custody acceptance
                    </p>
                  </div>
                </div>
                <Badge variant="success">Factual Acceptance</Badge>
              </div>

              <div className="panel-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-success-soft/30 border border-[#cde6d9] mb-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                      Authorized Receiving Party
                    </div>
                    <div className="text-sm font-bold text-ink">
                      {shipment.receivedBy ||
                        "Authorized Customer Representative"}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      Destination Facility:{" "}
                      {shipment.destinationAddress || "Customer Receiving Dock"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                      Delivery Timestamp
                    </div>
                    <div className="text-sm font-bold text-ink">
                      {formatTimestamp(shipment.deliveredAt) || "—"}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      Synchronized to double-entry ledger
                    </div>
                  </div>
                </div>

                <div className="spec-row">
                  <span>Evidence Document / DO #</span>
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-xs">
                      {shipment.proofOfDelivery || "POD-DEFAULT-RECORD"}
                    </strong>
                    {shipment.proofOfDelivery && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(shipment.proofOfDelivery!, "pod")
                        }
                        className="text-muted hover:text-ink transition-colors"
                        title="Copy DO reference"
                      >
                        {copiedKey === "pod" ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="spec-row">
                  <span>Receiving Remarks / Notes</span>
                  <span>
                    {shipment.notes ||
                      "Package intact, passed visual inspection."}
                  </span>
                </div>

                <div className="spec-row">
                  <span>Ledger Impact</span>
                  <span className="text-success font-medium">
                    Inventory movement finalized · Reservation cleared
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel p-6 bg-surface-muted/30 border-dashed text-center">
              <FileText className="w-8 h-8 text-muted mx-auto mb-2 opacity-60" />
              <h4 className="text-xs font-bold text-ink">
                Proof of Delivery Pending
              </h4>
              <p className="text-xs text-muted max-w-md mx-auto mt-1">
                {shipment.status === "DISPATCHED"
                  ? "Once physical delivery is confirmed with the customer, record the receiving officer name and signed Delivery Order number."
                  : "Dispatch the shipment first to generate carrier transit paperwork and initiate customer delivery tracking."}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Context & Metadata */}
        <div className="space-y-6">
          {/* Order & Customer Context */}
          <div className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted" />
                <h3 className="text-sm font-semibold text-ink">
                  Order & Customer
                </h3>
              </div>
            </div>

            <div className="panel-body">
              <div className="spec-row">
                <span>Customer</span>
                <div>
                  <strong>{shipment.customer?.name || "—"}</strong>
                  {shipment.customer?.code && (
                    <span className="block text-xs text-muted font-mono">
                      {shipment.customer.code}
                    </span>
                  )}
                </div>
              </div>

              <div className="spec-row">
                <span>Sales Order</span>
                <Link
                  href="/orders"
                  className="font-bold inline-flex items-center gap-1 text-primary hover:underline"
                >
                  #{shipment.order?.orderNumber || "—"}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="spec-row">
                <span>Order Status</span>
                <Badge variant="default">
                  {shipment.order?.status || "ACTIVE"}
                </Badge>
              </div>

              <div className="spec-row">
                <span>Delivery Address</span>
                <span className="text-right">
                  {shipment.destinationAddress || "Customer Warehouse"}
                </span>
              </div>
            </div>
          </div>

          {/* Carrier & Logistics Details */}
          <div className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted" />
                <h3 className="text-sm font-semibold text-ink">
                  Transport & Logistics
                </h3>
              </div>
            </div>

            <div className="panel-body">
              <div className="spec-row">
                <span>Carrier Service</span>
                <strong>{shipment.carrierName || "Internal Transport"}</strong>
              </div>

              <div className="spec-row">
                <span>Waybill / Tracking</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs">
                    {shipment.trackingNumber || "DIRECT-ROAD"}
                  </span>
                  {shipment.trackingNumber && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(shipment.trackingNumber!, "tracking-side")
                      }
                      className="text-muted hover:text-ink transition-colors"
                      title="Copy tracking"
                    >
                      {copiedKey === "tracking-side" ? (
                        <Check className="w-3 h-3 text-success" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="spec-row">
                <span>Dispatch Timestamp</span>
                <span>
                  {formatTimestamp(shipment.dispatchedAt) || "Pending"}
                </span>
              </div>

              {shipment.notes && (
                <div className="spec-row">
                  <span>Logistics Notes</span>
                  <span>{shipment.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="panel">
            <div className="panel-head">
              <h3 className="text-sm font-semibold text-ink">
                Operational Shortcuts
              </h3>
            </div>
            <div className="panel-body space-y-2">
              <Button
                variant="default"
                className="w-full justify-start text-xs"
                onClick={() => window.print()}
              >
                <Printer className="w-3.5 h-3.5 mr-2 text-muted" />
                Print Delivery Order / Packing Note
              </Button>

              <ButtonLink
                href="/orders"
                variant="default"
                className="w-full justify-start text-xs"
              >
                <Package className="w-3.5 h-3.5 mr-2 text-muted" />
                Inspect Sales Order Record
              </ButtonLink>

              <ButtonLink
                href="/inventory/items"
                variant="default"
                className="w-full justify-start text-xs"
              >
                <Boxes className="w-3.5 h-3.5 mr-2 text-muted" />
                Check Warehouse Finished Goods Stock
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <Dialog
          isOpen
          onClose={() => setShowDispatchModal(false)}
          title="Dispatch Physical Stock"
          subtitle="Record carrier handover and post inventory movement"
          size="md"
          pending={dispatchMutation.isPending}
        >
          <form onSubmit={handleDispatch} className="space-y-4">
            <p className="text-xs text-muted">
              Dispatching will immediately post authoritative inventory
              movements (decrementing Finished Goods warehouse stock) and update
              carrier tracking records.
            </p>

            <FormField id="carrierName" label="Carrier / Logistics Provider">
              <Input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. Precision Transport, DHL Express, Internal Fleet"
              />
            </FormField>

            <FormField id="trackingNumber" label="Waybill / Tracking Number">
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. TRK-2026-9901"
              />
            </FormField>

            <FormField
              id="dispatchNotes"
              label="Dispatch Notes / Vehicle Reference"
            >
              <Textarea
                rows={2}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="Driver identity, container number, or bill of lading notes..."
              />
            </FormField>

            <div className="dialog-actions">
              <Button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                disabled={dispatchMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={dispatchMutation.isPending}
              >
                {dispatchMutation.isPending
                  ? "Posting Movements..."
                  : "Confirm Dispatch"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Confirm Delivery Modal */}
      {showConfirmModal && (
        <Dialog
          isOpen
          onClose={() => setShowConfirmModal(false)}
          title="Confirm Delivery Receipt"
          subtitle="Record customer physical acceptance and close shipment tranche"
          size="md"
          pending={confirmMutation.isPending}
        >
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-xs text-muted">
              Record customer sign-off to verify delivery completion and close
              all remaining hard reservations on this order.
            </p>

            <FormField
              id="receivedBy"
              label="Received By (Full Name / Title)"
              required
            >
              <Input
                required
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="e.g. John Doe (Inbound Receiving Manager)"
              />
            </FormField>

            <FormField
              id="proofOfDelivery"
              label="Proof of Delivery / Signed DO #"
            >
              <Input
                value={proofOfDelivery}
                onChange={(e) => setProofOfDelivery(e.target.value)}
                placeholder="e.g. POD-2026-0042, DO-VERTEX-998"
              />
            </FormField>

            <FormField id="confirmNotes" label="Receiving Remarks / Condition">
              <Textarea
                rows={2}
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="Packaging condition, dock inspection notes, receiving acceptance..."
              />
            </FormField>

            <div className="dialog-actions">
              <Button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending
                  ? "Confirming..."
                  : "Record Verified Delivery"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
