"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePortalOrderDetail } from "../hooks";
import {
  downloadPortalDocument,
  approveCustomerDrawing,
  submitCustomerChangeRequest,
  approveCustomerChangeRequest,
} from "../api";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/icons";

export function PortalOrderDetailView({ orderId }: { orderId: string }) {
  const { order, loading, error, refresh, acknowledge } = usePortalOrderDetail(orderId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Drawing Approval state
  const [selectedDrawing, setSelectedDrawing] = useState<{ id: string; drawingNumber: string; revisionCode: string } | null>(null);
  const [drawingNotes, setDrawingNotes] = useState("");
  const [drawingSubmitting, setDrawingSubmitting] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);

  // Change Request state
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrChangeType, setOcrChangeType] = useState<"DATE" | "QUANTITY" | "SPECIFICATION" | "CANCEL">("DATE");
  const [ocrOrderLineId, setOcrOrderLineId] = useState("");
  const [ocrRequestedDate, setOcrRequestedDate] = useState("");
  const [ocrRequestedQuantity, setOcrRequestedQuantity] = useState("");
  const [ocrReason, setOcrReason] = useState("");
  const [ocrSubmitting, setOcrSubmitting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [approvingOcrId, setApprovingOcrId] = useState<string | null>(null);

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      setDownloadingId(docId);
      await downloadPortalDocument(docId, fileName);
    } catch (err: any) {
      setActionError(err?.message || "Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleApproveDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrawing || !order) return;
    try {
      setDrawingSubmitting(true);
      setDrawingError(null);
      await approveCustomerDrawing(order.id, selectedDrawing.id, drawingNotes.trim() || undefined);
      setSelectedDrawing(null);
      setDrawingNotes("");
      await refresh();
    } catch (err: any) {
      setDrawingError(err?.message || "Failed to record customer drawing approval");
    } finally {
      setDrawingSubmitting(false);
    }
  };

  const handleSubmitOcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setOcrSubmitting(true);
      setOcrError(null);

      const requestedChanges: Record<string, unknown> = {};
      if (ocrChangeType === "DATE" && ocrRequestedDate) {
        requestedChanges.requestedDate = new Date(ocrRequestedDate).toISOString();
      } else if (ocrChangeType === "QUANTITY" && ocrRequestedQuantity) {
        if (!ocrOrderLineId) {
          setOcrError("Select the product line this quantity request applies to.");
          setOcrSubmitting(false);
          return;
        }
        requestedChanges.orderLineId = ocrOrderLineId;
        requestedChanges.orderedQuantity = ocrRequestedQuantity;
      } else if (ocrChangeType === "CANCEL") {
        requestedChanges.cancelOrder = true;
      }

      await submitCustomerChangeRequest({
        orderId: order.id,
        changeType: ocrChangeType,
        reason: ocrReason.trim(),
        requestedChanges,
      });

      setShowOcrModal(false);
      setOcrReason("");
      setOcrRequestedDate("");
      setOcrRequestedQuantity("");
      setOcrOrderLineId("");
      await refresh();
    } catch (err: any) {
      setOcrError(err?.message || "Failed to submit change request");
    } finally {
      setOcrSubmitting(false);
    }
  };

  const handleApproveOcr = async (ocrId: string) => {
    try {
      setApprovingOcrId(ocrId);
      await approveCustomerChangeRequest(ocrId);
      await refresh();
    } catch (err: any) {
      setActionError(err?.message || "Failed to approve change request");
    } finally {
      setApprovingOcrId(null);
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
        description={order.lines.length === 1
          ? `${order.lines[0].itemName} (${order.lines[0].itemCode}) · ${order.lines[0].orderedQuantity} units ordered`
          : `${order.lines.length} product lines · each line tracks its own quality and delivery quantities`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setOcrError(null);
                setOcrReason("");
                setShowOcrModal(true);
              }}
            >
              Request Order Change
            </Button>
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

      {actionError && (
        <Panel className="border border-danger/30 p-3 text-xs text-danger" role="alert">
          <div className="flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <Button type="button" onClick={() => setActionError(null)}>Dismiss</Button>
          </div>
        </Panel>
      )}

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

      {/* Product line progress stays separated because different items have distinct quantity scales. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,220px))] gap-4">
        <Panel className="p-4 space-y-3">
          <span className="text-xs font-medium text-muted block">Quality progress by product line</span>
          {order.lines.map((line) => (
            <div key={line.orderLineId} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">{line.itemCode} · {line.itemName}</span>
                <span className="text-muted">QC passed {line.qcPassedQuantity} / {line.orderedQuantity} · {line.progressPct}%</span>
              </div>
              <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden border border-line">
                <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${line.progressPct}%` }} />
              </div>
            </div>
          ))}
        </Panel>

        <Panel className="p-4">
          <span className="text-xs font-medium text-muted block mb-1">
            Customer Requested Date
          </span>
          <span className="text-base font-semibold text-ink">
            {new Date(order.requestedDate).toLocaleDateString()}
          </span>
          <span className="text-xs text-muted block mt-1">Requested delivery target</span>
        </Panel>

        <Panel className="p-4">
          <span className="text-xs font-medium text-muted block mb-1">
            Promised Delivery Date
          </span>
          <span className="text-base font-semibold text-ink">
            {order.promisedDate
              ? new Date(order.promisedDate).toLocaleDateString()
              : "Pending schedule commitment"}
          </span>
          <span className="text-xs text-muted block mt-1">
            {order.customerAcknowledged ? "Delivery plan confirmed by customer" : "Schedule estimate · awaiting customer confirmation"}
          </span>
        </Panel>

        <Panel className="p-4">
          <span className="text-xs font-medium text-muted block mb-1">
            Dispatched Shipments
          </span>
          <span className="text-2xl font-bold text-ink">
            {order.shipments.filter((shipment) => shipment.status === 'DISPATCHED' || shipment.status === 'DELIVERED').length}
          </span>
          <span className="text-xs text-muted block mt-1">Physical consignments</span>
        </Panel>
      </div>

      {/* Engineering Drawing Specifications (CUS-02) */}
      <Panel className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Engineering Drawings & Specifications</h3>
            <p className="text-xs text-muted">
              Authoritative released blueprint revisions and formal customer approval evidence
            </p>
          </div>
        </div>

        {(!order.drawings || order.drawings.length === 0) ? (
          <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl">
            No released engineering drawings registered for this item yet.
          </div>
        ) : (
          <div className="space-y-3">
            {order.drawings.map((dwg) => (
              <div
                key={dwg.id}
                className="p-4 border border-line rounded-xl bg-surface-muted/30 flex items-center justify-between flex-wrap gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-xs font-mono">
                      {dwg.drawingNumber}
                    </span>
                    <Badge variant="default">{dwg.itemCode}</Badge>
                    <Badge variant="blue">Rev {dwg.revisionCode}</Badge>
                    <Badge variant={dwg.status === "RELEASED" ? "success" : "default"}>
                      {dwg.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">
                    File: {dwg.documentFileName || "Blueprint Attachment"}
                  </div>
                  {dwg.customerApproved && (
                    <div className="text-xs text-emerald-700 flex items-center gap-1 font-medium pt-1">
                      <Icon name="check" className="w-3.5 h-3.5" />
                      Approved by {dwg.customerApprovedBy || "Customer Representative"} on{" "}
                      {dwg.customerApprovedAt ? new Date(dwg.customerApprovedAt).toLocaleDateString() : "Record"}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {dwg.documentId && (
                    <Button
                      size="small"
                      onClick={() => handleDownload(dwg.documentId, dwg.documentFileName || `${dwg.drawingNumber}-Rev${dwg.revisionCode}.pdf`)}
                      disabled={downloadingId === dwg.documentId}
                    >
                      {downloadingId === dwg.documentId ? "Downloading..." : "Download Blueprint"}
                    </Button>
                  )}
                  {dwg.customerApproved ? (
                    <Badge variant="success">Customer Approved</Badge>
                  ) : (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => {
                        setSelectedDrawing(dwg);
                        setDrawingNotes("");
                        setDrawingError(null);
                      }}
                    >
                      Approve Drawing Spec
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Customer Order Change Requests (CUS-04) */}
      <Panel className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Order Change Requests (OCR)</h3>
            <p className="text-xs text-muted">
              Customer-originated delivery date, quantity, or specification revision proposals
            </p>
          </div>
          <Button
            size="small"
            onClick={() => {
              setOcrError(null);
              setOcrReason("");
              setShowOcrModal(true);
            }}
          >
            + New Change Request
          </Button>
        </div>

        {(!order.changeRequests || order.changeRequests.length === 0) ? (
          <div className="p-6 text-center text-xs text-muted border border-dashed border-line rounded-xl">
            No change requests filed for this order. Click &quot;Request Order Change&quot; to propose modifications.
          </div>
        ) : (
          <div className="space-y-3">
            {order.changeRequests.map((ocr) => (
              <div
                key={ocr.id}
                className="p-4 border border-line rounded-xl bg-surface-muted/30 space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-xs font-mono">
                      {ocr.requestNumber}
                    </span>
                    <Badge variant="blue">{ocr.changeType}</Badge>
                    <Badge
                      variant={
                        ocr.status === "APPROVED" || ocr.status === "APPLIED"
                          ? "success"
                          : ocr.status === "REJECTED"
                          ? "danger"
                          : "warning"
                      }
                    >
                      {ocr.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted">
                    Submitted: {ocr.submittedAt ? new Date(ocr.submittedAt).toLocaleDateString() : "—"}
                  </span>
                </div>

                <div className="text-xs text-ink">
                  <strong>Reason:</strong> {ocr.reason}
                </div>

                {ocr.requestedChanges && Object.keys(ocr.requestedChanges).length > 0 && (
                  <div className="text-xs text-muted bg-surface p-2 rounded border border-line font-mono">
                    Requested: {JSON.stringify(ocr.requestedChanges)}
                  </div>
                )}

                {ocr.status === "SUBMITTED" && (
                  <div className="flex justify-end pt-2 border-t border-line/60">
                    <Button
                      size="small"
                      variant="primary"
                      onClick={() => handleApproveOcr(ocr.id)}
                      disabled={approvingOcrId === ocr.id}
                    >
                      {approvingOcrId === ocr.id ? "Recording..." : "Customer Confirm / Approve"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Production & Fulfillment Milestones */}
      <Panel className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Fulfillment Milestones</h3>
          <p className="text-xs text-muted">
            Auditable physical stage tracking derived from settled workstation output
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
          {order.milestones.map((m, idx) => {
            const isCompleted = m.status === "COMPLETED";
            const isInProgress = m.status === "IN_PROGRESS";

            return (
              <div
                key={m.key}
                className={`p-3 rounded-xl border transition ${
                  isCompleted
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-900"
                    : isInProgress
                    ? "bg-blue-50/50 border-blue-200 text-blue-900"
                    : "bg-surface-muted/50 border-line text-muted"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-semibold opacity-75">
                    0{idx + 1}
                  </span>
                  <Badge
                    variant={
                      isCompleted ? "success" : isInProgress ? "blue" : "default"
                    }
                  >
                    {m.status}
                  </Badge>
                </div>
                <h4 className="font-semibold text-xs text-ink leading-tight mb-1">
                  {m.title}
                </h4>
                {m.completedAt && (
                  <span className="text-xs opacity-75 block">
                    {new Date(m.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

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
                      {shipment.status === 'DELIVERED' && shipment.deliveredAt
                        ? `Delivered on ${new Date(shipment.deliveredAt).toLocaleDateString()}`
                        : shipment.status === 'DISPATCHED'
                          ? "In Transit"
                          : "Not dispatched"}
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
                          {line.itemName}: <strong>{line.deliveredQuantity || line.dispatchedQuantity} units</strong>
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

      {/* Customer Drawing Approval Modal (CUS-02) */}
      {selectedDrawing && (
        <Dialog
          isOpen
          onClose={() => { setSelectedDrawing(null); setDrawingError(null); }}
          title={`Approve Drawing Specification: ${selectedDrawing.drawingNumber} (Rev ${selectedDrawing.revisionCode})`}
          size="md"
          pending={drawingSubmitting}
        >
          <form onSubmit={handleApproveDrawing} className="space-y-4">
            <p className="text-xs text-muted">
              By confirming approval, you verify and authorize this released engineering blueprint as the contractual specification for order <strong>{order.orderNumber}</strong>. An immutable audit record will be logged.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Approval Notes / Reference (Optional)
              </label>
              <Input
                type="text"
                value={drawingNotes}
                onChange={(e) => setDrawingNotes(e.target.value)}
                placeholder="e.g. Approved per Engineering Review Meeting 2026-10-15"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            {drawingError && (
              <div className="p-2.5 bg-danger-soft border border-line rounded text-xs text-danger">
                {drawingError}
              </div>
            )}

            <div className="dialog-actions">
              <Button type="button" onClick={() => setSelectedDrawing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={drawingSubmitting}>
                {drawingSubmitting ? "Recording Approval..." : "Confirm & Sign Drawing"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Customer Change Request Modal (CUS-04) */}
      {showOcrModal && (
        <Dialog
          isOpen
          onClose={() => { setShowOcrModal(false); setOcrError(null); }}
          title="Submit Order Change Request (OCR)"
          size="md"
          pending={ocrSubmitting}
        >
          <form onSubmit={handleSubmitOcr} className="space-y-4">
            <p className="text-xs text-muted">
              Propose a formal change to order <strong>{order.orderNumber}</strong>. Change requests enter review status and require engineering evaluation before being applied to active production.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Change Category
              </label>
              <Select
                value={ocrChangeType}
                onChange={(e: any) => setOcrChangeType(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="DATE">Delivery Date Modification</option>
                <option value="QUANTITY">Order Quantity Adjustment</option>
                <option value="SPECIFICATION">Drawing / Technical Specification</option>
                <option value="CANCEL">Order Cancellation Request</option>
              </Select>
            </div>

            {ocrChangeType === "DATE" && (
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Proposed Delivery Date
                </label>
                <DatePicker required value={ocrRequestedDate} onChange={setOcrRequestedDate} />
              </div>
            )}

            {ocrChangeType === "QUANTITY" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1" htmlFor="ocr-order-line">
                    Product line
                  </label>
                  <Select
                    id="ocr-order-line"
                    required
                    value={ocrOrderLineId}
                    onChange={(e) => setOcrOrderLineId(e.target.value)}
                    className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                  >
                    <option value="">Select a product line</option>
                    {order.lines.map((line) => (
                      <option key={line.orderLineId} value={line.orderLineId}>
                        {line.itemCode} · {line.itemName} · current {line.orderedQuantity}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1" htmlFor="ocr-requested-quantity">
                    Proposed quantity (units)
                  </label>
                  <Input
                    id="ocr-requested-quantity"
                    type="number"
                    min="0.000001"
                    step="any"
                    required
                    value={ocrRequestedQuantity}
                    onChange={(e) => setOcrRequestedQuantity(e.target.value)}
                    placeholder="Enter the proposed quantity for this line"
                    className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Business Reason & Detailed Justification
              </label>
              <Textarea
                required
                rows={3}
                value={ocrReason}
                onChange={(e) => setOcrReason(e.target.value)}
                placeholder="Explain the reason for this proposed change (e.g. customer warehouse expansion delay, accelerated prototype build schedule)..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            {ocrError && (
              <div className="p-2.5 bg-danger-soft border border-line rounded text-xs text-danger">
                {ocrError}
              </div>
            )}

            <div className="dialog-actions">
              <Button type="button" onClick={() => setShowOcrModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={ocrSubmitting || !ocrReason.trim()}>
                {ocrSubmitting ? "Submitting Request..." : "Submit Proposal"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
