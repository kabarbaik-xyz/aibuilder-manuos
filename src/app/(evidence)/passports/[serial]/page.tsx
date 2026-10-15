"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { UnitPassportDTO } from "@/server/modules/quality/passport";

export default function PassportPage() {
  const params = useParams();
  const rawSerial = Array.isArray(params?.serial)
    ? params.serial[0]
    : (params?.serial as string) || "";
  const decodedSerial = decodeURIComponent(rawSerial);

  const [passport, setPassport] = useState<UnitPassportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decodedSerial) return;

    let isMounted = true;
    async function loadPassport() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/passports/${encodeURIComponent(decodedSerial)}`,
        );
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(
              `Passport for serial '${decodedSerial}' not found in records`,
            );
          }
          if (res.status === 403) {
            throw new Error(
              `Access denied: unauthorized to view passport for serial '${decodedSerial}'`,
            );
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data?.error?.message ||
              `Failed to load passport: ${res.statusText}`,
          );
        }
        const data = await res.json();
        if (isMounted) {
          setPassport(data.data || data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Error loading passport");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPassport();
    return () => {
      isMounted = false;
    };
  }, [decodedSerial]);

  const customBreadcrumb = (
    <>
      <Link href="/quality/inspections" className="hover:underline">
        Quality & Traceability
      </Link>
      <span className="breadcrumb-factory">/</span>
      <strong>Passport · {decodedSerial}</strong>
    </>
  );

  return (
    <div className="page-stack">
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1>Unit Digital Passport</h1>
              <Badge variant="blue">{decodedSerial}</Badge>
              {passport && (
                <Badge
                  variant={
                    passport.status === "RELEASED" ? "success" : "warning"
                  }
                >
                  {passport.status}
                </Badge>
              )}
            </div>
            <p className="text-muted text-xs mt-1">
              Cryptographically verified unit genealogy, shop-floor execution
              records, and inspection history.
            </p>
          </div>
          <div className="actions">
            <Link href="/" className="btn">
              <Icon name="arrow" className="rotate-180" />
              Back to Command Center
            </Link>
          </div>
        </div>

        {loading ? (
          <Panel className="p-8 text-center text-xs text-muted">
            Verifying records and loading digital passport for {decodedSerial}
            ...
          </Panel>
        ) : error || !passport ? (
          <Panel className="p-8 text-center space-y-3">
            <div className="p-3 bg-red-50 text-red-700 text-xs font-medium rounded-xl inline-block max-w-md">
              {error ||
                `No digital passport found for serial '${decodedSerial}'`}
            </div>
            <div>
              <Link href="/quality/inspections" className="btn primary">
                ← Return to Quality & Inspections
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="content-grid">
            <div className="stack space-y-4">
              {/* Verification & Traceability Panel */}
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Verification & Material Traceability</h3>
                    <p>
                      Certified unit credentials and production batch provenance
                    </p>
                  </div>
                  <Badge variant="success">Factual Verification</Badge>
                </div>

                <div className="panel-body">
                  <div className="spec-row">
                    <span>Unit Serial Number</span>
                    <strong>{passport.serialNumber}</strong>
                  </div>
                  {passport.order && (
                    <>
                      <div className="spec-row">
                        <span>Originating Order</span>
                        <strong>
                          {passport.order.orderNumber} (
                          {passport.order.customerName})
                        </strong>
                      </div>
                      <div className="spec-row">
                        <span>Finished Good Item</span>
                        <strong>
                          {passport.order.itemName} ({passport.order.itemCode})
                        </strong>
                      </div>
                    </>
                  )}
                  {passport.lot && (
                    <div className="spec-row">
                      <span>Production Lot</span>
                      <strong>
                        {passport.lot.lotNumber}{" "}
                        {passport.lot.supplierLotNumber
                          ? `(Mfr Lot: ${passport.lot.supplierLotNumber})`
                          : ""}
                      </strong>
                    </div>
                  )}
                  <div className="spec-row">
                    <span>Cryptographic Evidence Hash</span>
                    <code className="bg-(--surface-muted) px-1.5 py-0.5 rounded text-xs border border-line font-mono">
                      sha256:{passport.digestSha256}
                    </code>
                  </div>
                  <div className="spec-row">
                    <span>Publication Date</span>
                    <strong>
                      {new Date(passport.publishedAt).toLocaleDateString()}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Material Provenance */}
              {passport.materials.length > 0 && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Material Provenance & Inbound Lots</h3>
                      <p>Raw materials consumed and issued to production</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="space-y-2">
                      {passport.materials.map((mat, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-surface-muted/50 rounded-lg text-xs"
                        >
                          <div>
                            <strong className="text-ink">{mat.itemName}</strong>
                            <span className="text-muted text-[11px] ml-2">
                              ({mat.itemCode})
                            </span>
                            {mat.lotNumber && (
                              <span className="block text-[11px] text-muted font-mono">
                                Lot: {mat.lotNumber}
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-ink">
                            {mat.consumedQuantity} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Manufacturing & Inspection Timeline */}
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Manufacturing & Inspection Timeline</h3>
                    <p>Immutable event sequence recorded on the shop floor</p>
                  </div>
                </div>

                <div className="panel-body">
                  <ol className="timeline">
                    {/* Operations */}
                    {passport.operations.map((op, idx) => (
                      <li key={`op-${idx}`}>
                        <div className="between">
                          <h3>{op.title}</h3>
                          <time>
                            {op.completedAt
                              ? new Date(op.completedAt).toLocaleTimeString()
                              : op.status}
                          </time>
                        </div>
                        <p>
                          {op.operatorName
                            ? `Operator: ${op.operatorName} · `
                            : ""}
                          {op.machineName
                            ? `Workstation: ${op.machineName} · `
                            : ""}
                          Status: {op.status}
                        </p>
                      </li>
                    ))}

                    {/* QC Inspections and Rework */}
                    {passport.qcEvents.map((qc, idx) => {
                      const isRework =
                        qc.disposition === "REWORK" || Boolean(qc.rework);
                      return (
                        <li
                          key={`qc-${idx}`}
                          className={isRework ? "warning" : ""}
                        >
                          <div className="between">
                            <h3>QC Inspection · {qc.inspectionType}</h3>
                            <time>
                              {new Date(qc.inspectedAt).toLocaleTimeString()}
                            </time>
                          </div>
                          <p>
                            Inspector: {qc.inspectorName} · Disposition:{" "}
                            <strong>{qc.disposition}</strong>
                          </p>
                          {qc.checks.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {qc.checks.map((chk, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="text-xs flex items-center justify-between text-muted"
                                >
                                  <span>
                                    {chk.description}:{" "}
                                    {chk.measuredValue || "Checked"}
                                  </span>
                                  <Badge
                                    variant={
                                      chk.isPassed ? "success" : "warning"
                                    }
                                  >
                                    {chk.isPassed
                                      ? "Passed"
                                      : "Defect: " +
                                        (chk.defectReason ||
                                          "Out of tolerance")}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {qc.rework && (
                            <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
                              <strong>
                                Rework Attempt #{qc.rework.attemptNumber}:
                              </strong>{" "}
                              {qc.rework.instruction}
                              <span className="block text-[11px] text-amber-700">
                                Authorized by {qc.rework.authorizedBy} · Status:{" "}
                                {qc.rework.status}
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}

                    {/* Final Sign-off */}
                    <li>
                      <div className="between">
                        <h3>Quality Assurance Final Release</h3>
                        <time>
                          {new Date(passport.publishedAt).toLocaleDateString()}
                        </time>
                      </div>
                      <p>
                        Certified unit released for customer delivery with
                        cryptographic authenticity seal.
                      </p>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Sidebar / Digital Seal */}
            <div className="stack space-y-4">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Digital Seal</h3>
                    <p>Cryptographic proof of authenticity</p>
                  </div>
                  <Icon name="shield" className="text-primary w-5 h-5" />
                </div>
                <div className="panel-body">
                  <div className="qr-wrap">
                    <div className="qr border border-line rounded-xl p-3 bg-white flex items-center justify-center">
                      <Icon name="shield" className="w-12 h-12 text-primary" />
                    </div>
                    <div>
                      <strong className="text-ink text-xs block">
                        Verifiable Audit Anchor
                      </strong>
                      <p className="text-[11px] text-muted break-all font-mono mt-1">
                        {passport.digestSha256}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipment Details if present */}
              {passport.shipment && (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Delivery & Custody</h3>
                      <p>Dispatch tracking and proof of delivery</p>
                    </div>
                    <Icon name="truck" className="text-primary w-5 h-5" />
                  </div>
                  <div className="panel-body text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted">Shipment #</span>
                      <strong className="text-ink">
                        {passport.shipment.shipmentNumber}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Carrier</span>
                      <strong className="text-ink">
                        {passport.shipment.carrierName || "Standard"}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Tracking #</span>
                      <strong className="text-ink">
                        {passport.shipment.trackingNumber || "—"}
                      </strong>
                    </div>
                    {passport.shipment.receivedBy && (
                      <div className="flex justify-between">
                        <span className="text-muted">Received By</span>
                        <strong className="text-ink">
                          {passport.shipment.receivedBy}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Traceability Actions</h3>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="stack gap-2">
                    <Link href="/" className="btn primary full">
                      Open in Command Center
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") window.print();
                      }}
                      className="btn full"
                    >
                      <Icon name="file" />
                      Print Certified Passport
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
