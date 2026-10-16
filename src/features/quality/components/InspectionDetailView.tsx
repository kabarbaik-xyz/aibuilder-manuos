"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  useInspection,
  useFinalizeInspection,
  useAuthorizeRework,
  useRecordReinspection,
} from "../hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatQuantity, parseQuantity } from "@/domain/quantity";
import { uploadInspectionEvidence } from "../api";
import { PassportPublicationActions } from '@/features/passport/passport-publication-actions';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  User,
  MapPin,
  Tag,
  Boxes,
  FileCheck2,
} from "lucide-react";

export interface InspectionDetailViewProps {
  inspectionId: string;
}

export function InspectionDetailView({
  inspectionId,
}: InspectionDetailViewProps) {
  const {
    data: inspection,
    isLoading,
    error,
    refetch,
  } = useInspection(inspectionId);

  const finalizeMutation = useFinalizeInspection();
  const authorizeReworkMutation = useAuthorizeRework();
  const recordReinspectionMutation = useRecordReinspection();

  // Form states for finalization
  const [passedQty, setPassedQty] = useState("");
  const [reworkQty, setReworkQty] = useState("0");
  const [scrappedQty, setScrappedQty] = useState("0");
  const [checkResults, setCheckResults] = useState<
    Record<
      string,
      { isPassed: boolean; measuredValue?: string; defectReason?: string; evidenceDocumentId?: string; evidenceFileName?: string }
    >
  >({});
  const [finalizeNotes, setFinalizeNotes] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Rework dialog state
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [reworkTargetQty, setReworkTargetQty] = useState("");
  const [reworkInstruction, setReworkInstruction] = useState("");

  // Reinspection dialog state
  const [showReinspectModal, setShowReinspectModal] = useState(false);
  const [reinspectPassedQty, setReinspectPassedQty] = useState("");
  const [reinspectScrappedQty, setReinspectScrappedQty] = useState("0");

  useEffect(() => {
    if (inspection) {
      if (inspection.status === "DRAFT") {
        const fullQty = formatQuantity(inspection.inspectedAtoms);
        setPassedQty(fullQty);
        setReworkQty("0");
        setScrappedQty("0");
      }
      if (inspection.qcChecklist?.checks) {
        const initialChecks: Record<
          string,
          { isPassed: boolean; measuredValue?: string; defectReason?: string }
        > = {};
        for (const check of inspection.qcChecklist.checks) {
          initialChecks[check.code] = { isPassed: true, measuredValue: "" };
        }
        setCheckResults(initialChecks);
      }
    }
  }, [inspection]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-muted">
        Loading inspection record...
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="p-8 text-center bg-danger-soft border border-line rounded-xl my-6">
        <p className="text-danger font-medium mb-2">Inspection not found</p>
        <Link
          href="/quality/inspections"
          className="text-xs text-primary underline"
        >
          Back to Inspections
        </Link>
      </div>
    );
  }

  const isDraft = inspection.status === "DRAFT";

  // Compute live conservation of quantity
  let totalAllocatedAtoms = 0n;
  let matchesInspected = false;
  try {
    const pAtoms = parseQuantity(passedQty || "0", 0);
    const rAtoms = parseQuantity(reworkQty || "0", 0);
    const sAtoms = parseQuantity(scrappedQty || "0", 0);
    totalAllocatedAtoms = pAtoms + rAtoms + sAtoms;
    matchesInspected = totalAllocatedAtoms === inspection.inspectedAtoms;
  } catch {
    matchesInspected = false;
  }

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      const pAtoms = parseQuantity(passedQty || "0", 0);
      const rAtoms = parseQuantity(reworkQty || "0", 0);
      const sAtoms = parseQuantity(scrappedQty || "0", 0);

      const results = Object.entries(checkResults).map(([code, val]) => {
        const checkDef = inspection.qcChecklist?.checks.find(
          (c) => c.code === code,
        );
        return {
          checkCode: code,
          checkDescription: checkDef?.description || code,
          checkMethod: checkDef?.method || "VISUAL",
          measuredValue: val.measuredValue,
          isPassed: val.isPassed,
          defectReason: val.defectReason,
          evidenceDocumentId: val.evidenceDocumentId,
        };
      });

      await finalizeMutation.mutateAsync({
        inspectionId: inspection.id,
        passedAtoms: pAtoms,
        reworkAtoms: rAtoms,
        scrappedAtoms: sAtoms,
        results,
        notes: finalizeNotes.trim() || undefined,
      });

      refetch();
    } catch (err: any) {
      setFormError(err.message || "Failed to finalize inspection");
    }
  };

  const handleAuthorizeRework = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await authorizeReworkMutation.mutateAsync({
        inspectionId: inspection.id,
        targetAtoms: parseQuantity(reworkTargetQty, 0),
        instruction: reworkInstruction,
      });
      setShowReworkModal(false);
      setReworkInstruction("");
      refetch();
    } catch (err: any) {
      setFormError(err.message || "Failed to authorize rework");
    }
  };

  const handleRecordReinspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await recordReinspectionMutation.mutateAsync({
        originalInspectionId: inspection.id,
        passedAtoms: parseQuantity(reinspectPassedQty, 0),
        scrappedAtoms: parseQuantity(reinspectScrappedQty || "0", 0),
        results: Object.entries(checkResults).map(([code, value]) => {
          const check = inspection.qcChecklist?.checks.find((candidate) => candidate.code === code);
          return {
            checkCode: code,
            checkDescription: check?.description || code,
            checkMethod: check?.method || "VISUAL",
            measuredValue: value.measuredValue,
            isPassed: value.isPassed,
            evidenceDocumentId: value.evidenceDocumentId,
            defectReason: value.defectReason,
          };
        }),
      });
      setShowReinspectModal(false);
      refetch();
    } catch (err: any) {
      setFormError(err.message || "Failed to record reinspection");
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title={`Inspection #${inspection.id.slice(0, 8)}`}
        description={`Quality disposition for ${inspection.productionOutput?.item?.name || "produced batch"}`}
        actions={
          <ButtonLink href="/quality/inspections">
            Back to Inspections
          </ButtonLink>
        }
      />

      {inspection.serialNumber && inspection.status === 'FINALIZED' && inspection.passedAtoms > 0n && inspection.productionOutput?.item && <PassportPublicationActions
        serialNumber={inspection.serialNumber} itemId={inspection.productionOutput.item.id}
        orderId={inspection.productionOutput.task?.instance?.order?.id}
        published={inspection.passport?.published ?? false} shared={inspection.passport?.shared ?? false}
        onChanged={() => { void refetch(); }}
      />}

      {formError && (
        <div className="p-4 bg-danger-soft border border-line rounded-xl text-xs text-danger">
          <strong>Validation Error:</strong> {formError}
        </div>
      )}

      {/* Harmonized Quality Metric Strip */}
      <div className="metric-strip my-0">
        <div className="metric">
          <div className="metric-label">
            <ShieldCheck className="w-3.5 h-3.5 text-muted" />
            Status & Disposition
          </div>
          <div className="h-9 flex items-center">
            {isDraft ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-warning border border-amber-200">
                <Clock className="w-3.5 h-3.5" /> Draft / Pending
              </span>
            ) : inspection.disposition === "PASSED" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-success border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Passed & Released
              </span>
            ) : inspection.disposition === "REWORK" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-warning border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Rework Held
              </span>
            ) : inspection.disposition === "SCRAPPED" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-danger border border-rose-200">
                <XCircle className="w-3.5 h-3.5" /> Scrapped
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-primary border border-blue-200">
                Partial Disposition
              </span>
            )}
          </div>
          <div className="metric-caption">
            {isDraft
              ? "Awaiting sign-off disposition"
              : "Quality disposition finalized"}
          </div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Boxes className="w-3.5 h-3.5 text-muted" />
            Inspected Quantity
          </div>
          <div className="h-9 flex items-baseline">
            <span className="text-2xl font-bold tracking-tight text-ink font-mono">
              {formatQuantity(inspection.inspectedAtoms)}
            </span>
            <span className="text-xs font-semibold text-muted ml-1.5">
              units
            </span>
          </div>
          <div className="metric-caption">100% of production batch sampled</div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Tag className="w-3.5 h-3.5 text-muted" />
            Lot & Custody
          </div>
          <div className="h-9 flex items-center">
            <span className="font-mono text-sm font-bold text-ink bg-surface-muted px-2 py-0.5 rounded border border-line">
              {inspection.productionOutput?.lot?.lotNumber || "NO-LOT"}
            </span>
          </div>
          <div
            className="metric-caption flex items-center gap-1 truncate"
            title={
              inspection.productionOutput?.destinationLocation?.name ||
              "Quarantine Area"
            }
          >
            <MapPin className="w-3 h-3 text-muted shrink-0" />
            <span className="truncate">
              {inspection.productionOutput?.destinationLocation?.name ||
                "Quarantine Area"}
            </span>
          </div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <User className="w-3.5 h-3.5 text-muted" />
            Inspector & Sign-Off
          </div>
          <div className="h-9 flex items-center">
            <span
              className="text-base font-bold text-ink truncate"
              title={inspection.inspectorUser?.name || "Quality Inspector"}
            >
              {inspection.inspectorUser?.name || "Quality Inspector"}
            </span>
          </div>
          <div className="metric-caption flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted" />
            <span>
              {new Date(inspection.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>

      {isDraft ? (
        /* Conduct Inspection Form */
        <form onSubmit={handleFinalize} className="space-y-6">
          <Panel>
            <h3 className="text-sm font-semibold text-ink mb-1">
              Quantity Allocation & Conservation
            </h3>
            <p className="text-xs text-muted mb-4">
              Allocate the inspected population into Accepted (FG), Rework
              (Held), or Scrapped. Sum must exactly equal{" "}
              {formatQuantity(inspection.inspectedAtoms)} units.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Passed / Accepted (Units)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={passedQty}
                  onChange={(e) => setPassedQty(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                />
                <span className="text-xs text-success block mt-1">
                  Reclassified from Quarantine → Finished Goods (FG)
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Rework / Held (Units)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={reworkQty}
                  onChange={(e) => setReworkQty(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning"
                />
                <span className="text-xs text-warning block mt-1">
                  Held in Quarantine until authorized rework
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Scrapped (Units)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={scrappedQty}
                  onChange={(e) => setScrappedQty(e.target.value)}
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-danger"
                />
                <span className="text-xs text-danger block mt-1">
                  Reclassified from Quarantine → Scrap Location
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-surface-muted border border-line rounded-lg flex items-center justify-between text-xs">
              <div>
                Total Allocated:{" "}
                <strong className="font-mono">
                  {formatQuantity(totalAllocatedAtoms)}
                </strong>{" "}
                /{" "}
                <span className="font-mono">
                  {formatQuantity(inspection.inspectedAtoms)}
                </span>
              </div>
              {matchesInspected ? (
                <Badge variant="success">✓ Mass Balanced (Conserved)</Badge>
              ) : (
                <Badge variant="danger">
                  Mismatch:{" "}
                  {totalAllocatedAtoms > inspection.inspectedAtoms
                    ? "Over-allocated"
                    : "Under-allocated"}
                </Badge>
              )}
            </div>
          </Panel>

          {/* Checklist Checks if present */}
          {inspection.qcChecklist &&
            inspection.qcChecklist.checks.length > 0 && (
              <Panel>
                <h3 className="text-sm font-semibold text-ink mb-1">
                  Engineering QC Checklist: {inspection.qcChecklist.name} (Rev v
                  {inspection.checklistRevision})
                </h3>
                <p className="text-xs text-muted mb-4">
                  Verify each mandatory inspection parameter before submitting
                  release disposition.
                </p>

                <div className="space-y-4">
                  {inspection.qcChecklist.checks.map((check) => {
                    const state = checkResults[check.code] || {
                      isPassed: true,
                    };
                    return (
                      <div
                        key={check.id}
                        className="p-3 border border-line rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs">
                              {check.code}
                            </span>
                            <span className="text-xs font-medium text-ink">
                              {check.description}
                            </span>
                            {check.isRequired && (
                              <span className="text-xs text-danger uppercase font-bold">
                                Required
                              </span>
                            )}
                            {check.requiresEvidence && (
                              <span className="text-xs text-primary uppercase font-bold">Evidence required</span>
                            )}
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            Method: {check.method}{" "}
                            {check.unit ? `(${check.unit})` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            placeholder="Measured value..."
                            value={state.measuredValue || ""}
                            onChange={(e) =>
                              setCheckResults({
                                ...checkResults,
                                [check.code]: {
                                  ...state,
                                  measuredValue: e.target.value,
                                },
                              })
                            }
                            className="bg-surface border border-line rounded px-2.5 py-1 text-xs text-ink w-36"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCheckResults({
                                ...checkResults,
                                [check.code]: {
                                  ...state,
                                  isPassed: !state.isPassed,
                                },
                              })
                            }
                            className={`px-3 py-1 rounded text-xs font-semibold transition ${
                              state.isPassed
                                ? "bg-success-soft text-ink border border-line"
                                : "bg-danger text-white"
                            }`}
                          >
                            {state.isPassed ? "✓ PASS" : "✗ FAIL"}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            aria-label={`Attach evidence for ${check.code}`}
                            disabled={uploadingEvidence[check.code]}
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              setUploadingEvidence((current) => ({ ...current, [check.code]: true }));
                              setFormError(null);
                              try {
                                const document = await uploadInspectionEvidence(inspection.id, file);
                                setCheckResults((current) => ({
                                  ...current,
                                  [check.code]: { ...current[check.code], evidenceDocumentId: document.id, evidenceFileName: document.fileName },
                                }));
                              } catch (err: any) {
                                setFormError(err.message || `Failed to upload evidence for ${check.code}`);
                              } finally {
                                setUploadingEvidence((current) => ({ ...current, [check.code]: false }));
                                event.target.value = "";
                              }
                            }}
                          />
                          {uploadingEvidence[check.code] ? <span className="text-muted">Uploading…</span> : state.evidenceFileName ? <span className="text-success">{state.evidenceFileName}</span> : check.requiresEvidence ? <span className="text-danger">Required</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

          <Panel>
            <label className="block text-xs font-medium text-ink mb-1">
              Final Disposition Remarks & Sign-off Notes
            </label>
            <textarea
              rows={2}
              value={finalizeNotes}
              onChange={(e) => setFinalizeNotes(e.target.value)}
              placeholder="Certificate of inspection notes, calibration references, or non-conformance details..."
              className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
            />

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-line">
              <Button
                type="submit"
                variant="primary"
                disabled={!matchesInspected || finalizeMutation.isPending}
              >
                {finalizeMutation.isPending
                  ? "Finalizing..."
                  : "Submit & Finalize Disposition"}
              </Button>
            </div>
          </Panel>
        </form>
      ) : (
        /* Finalized View & Rework History */
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Quality Disposition Breakdown
                </h3>
                <p className="text-xs text-muted">
                  Physical mass conservation: Passed + Rework + Scrapped =
                  Inspected ({formatQuantity(inspection.inspectedAtoms)} units)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-muted border border-line">
                  <FileCheck2 className="w-3 h-3 text-success" /> Physical Mass
                  Conserved
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-linear-to-b from-emerald-50/50 to-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-success flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      Passed & Released to FG
                    </span>
                    <span className="text-xs font-bold text-success bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      {inspection.inspectedAtoms > 0n
                        ? Number(
                            (inspection.passedAtoms * 100n) /
                              inspection.inspectedAtoms,
                          )
                        : 100}
                      %
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-ink mt-1">
                    {formatQuantity(inspection.passedAtoms)}
                    <span className="text-xs font-normal text-muted ml-1.5">
                      units
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted mt-3 pt-2 border-t border-emerald-100">
                  Reclassified from Quarantine → Finished Goods
                </p>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  inspection.reworkAtoms > 0n
                    ? "border-amber-200/80 bg-linear-to-b from-amber-50/50 to-surface"
                    : "border-line bg-surface-muted/30"
                } flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        inspection.reworkAtoms > 0n
                          ? "text-warning"
                          : "text-muted"
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      Rework Held in Quarantine
                    </span>
                    {inspection.reworkAtoms > 0n && (
                      <span className="text-xs font-bold text-warning bg-amber-100/70 px-2 py-0.5 rounded-full">
                        Held
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-mono font-bold text-ink mt-1">
                    {formatQuantity(inspection.reworkAtoms)}
                    <span className="text-xs font-normal text-muted ml-1.5">
                      units
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted mt-3 pt-2 border-t border-line/60">
                  {inspection.reworkAtoms > 0n
                    ? "Stock held awaiting rework authorization"
                    : "Zero units held for rework"}
                </p>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  inspection.scrappedAtoms > 0n
                    ? "border-rose-200/80 bg-linear-to-b from-rose-50/50 to-surface"
                    : "border-line bg-surface-muted/30"
                } flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        inspection.scrappedAtoms > 0n
                          ? "text-danger"
                          : "text-muted"
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      Scrapped Units
                    </span>
                    {inspection.scrappedAtoms > 0n && (
                      <span className="text-xs font-bold text-danger bg-rose-100/70 px-2 py-0.5 rounded-full">
                        Scrap
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-mono font-bold text-ink mt-1">
                    {formatQuantity(inspection.scrappedAtoms)}
                    <span className="text-xs font-normal text-muted ml-1.5">
                      units
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted mt-3 pt-2 border-t border-line/60">
                  {inspection.scrappedAtoms > 0n
                    ? "Reclassified to scrap loss ledger"
                    : "Zero material scrap generated"}
                </p>
              </div>
            </div>

            {/* If there are rework atoms, provide actions */}
            {inspection.reworkAtoms > 0n && (
              <div className="mt-6 p-4 bg-surface-muted border border-line rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink">
                    Rework Actions Available
                  </h4>
                  <p className="text-xs text-muted">
                    {formatQuantity(inspection.reworkAtoms)} units are
                    quarantined pending authorized rework or reinspection.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setReworkTargetQty(
                        formatQuantity(inspection.reworkAtoms),
                      );
                      setShowReworkModal(true);
                    }}
                  >
                    Authorize Rework
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setReinspectPassedQty(
                        formatQuantity(inspection.reworkAtoms),
                      );
                      setShowReinspectModal(true);
                    }}
                  >
                    Conduct Reinspection
                  </Button>
                </div>
              </div>
            )}
          </Panel>

          {/* Check Results History */}
          {inspection.results && inspection.results.length > 0 && (
            <Panel>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Recorded Check Results
                  </h3>
                  <p className="text-xs text-muted">
                    Dimensional, mechanical, and visual verification against
                    engineering tolerances
                  </p>
                </div>
                <Badge variant="success">
                  {inspection.results.filter((r) => r.isPassed).length} of{" "}
                  {inspection.results.length} Passed
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-y border-line bg-surface-muted/50 text-muted uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-3">Check Code</th>
                      <th className="py-2.5 px-3">Description & Tolerance</th>
                      <th className="py-2.5 px-3">Measured Value</th>
                      <th className="py-2.5 px-3 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink">
                    {inspection.results.map((res) => (
                      <tr
                        key={res.id}
                        className="hover:bg-surface-muted/30 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-ink bg-surface-muted px-2 py-0.5 rounded border border-line text-xs">
                            {res.checkCode}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-ink font-medium">
                          {res.checkDescription}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs">
                          {res.measuredValue ? (
                            <span className="px-2 py-0.5 rounded bg-surface border border-line font-semibold">
                              {res.measuredValue}
                            </span>
                          ) : (
                            <span className="text-muted italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {res.isPassed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-success border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-success" />{" "}
                              Pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-danger border border-rose-200">
                              <XCircle className="w-3 h-3 text-danger" /> Fail
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Rework Attempts History */}
          {inspection.reworkAttempts &&
            inspection.reworkAttempts.length > 0 && (
              <Panel>
                <h3 className="text-sm font-semibold text-ink mb-3">
                  Authorized Rework Attempts
                </h3>
                <div className="space-y-2">
                  {inspection.reworkAttempts.map((att) => (
                    <div
                      key={att.id}
                      className="p-3 border border-line rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-ink">
                          Target: {formatQuantity(att.targetAtoms)} units ·
                          Status: <Badge variant="default">{att.status}</Badge>
                        </div>
                        <div className="text-muted mt-0.5">
                          {att.instruction}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted">
                        Authorized by {att.authorizedBy?.name || "Staff"}
                        <br />
                        {new Date(att.authorizedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
        </div>
      )}

      {/* Authorize Rework Modal */}
      {showReworkModal && (
        <Dialog
          isOpen
          onClose={() => setShowReworkModal(false)}
          title="Authorize Rework Attempt"
          size="md"
          pending={authorizeReworkMutation.isPending}
        >
          <form onSubmit={handleAuthorizeRework} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Target Rework Quantity (units)
              </label>
              <input
                type="number"
                step="any"
                required
                min="0.000001"
                value={reworkTargetQty}
                onChange={(e) => setReworkTargetQty(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Rework Instruction / Technical Correction
              </label>
              <textarea
                required
                rows={3}
                value={reworkInstruction}
                onChange={(e) => setReworkInstruction(e.target.value)}
                placeholder="Specific machining / rework instructions to correct non-conformance..."
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            <div className="dialog-actions">
              <Button onClick={() => setShowReworkModal(false)}>Cancel</Button>
              <Button
                type="submit"
                variant="primary"
                disabled={authorizeReworkMutation.isPending}
              >
                {authorizeReworkMutation.isPending
                  ? "Authorizing..."
                  : "Confirm Rework"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Reinspection Modal */}
      {showReinspectModal && (
        <Dialog
          isOpen
          onClose={() => setShowReinspectModal(false)}
          title="Record Reinspection of Rework Stock"
          size="md"
          pending={recordReinspectionMutation.isPending}
        >
          <form onSubmit={handleRecordReinspection} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Reinspected Units Passed (to Finished Goods)
              </label>
              <input
                type="number"
                step="any"
                required
                min="0.000001"
                value={reinspectPassedQty}
                onChange={(e) => setReinspectPassedQty(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Reinspected Units Scrapped
              </label>
              <input
                type="number"
                step="any"
                required
                min="0"
                value={reinspectScrappedQty}
                onChange={(e) => setReinspectScrappedQty(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>
            {inspection.qcChecklist?.checks.map((check) => {
              const state = checkResults[check.code] || { isPassed: true };
              return (
                <div key={check.id} className="rounded-lg border border-line p-3 space-y-2">
                  <div className="text-xs font-medium text-ink">{check.code}: {check.description}{check.requiresEvidence ? ' · Evidence required' : ''}</div>
                  {(check.method === 'MEASUREMENT' || check.method === 'GAUGE') && (
                    <Input
                      aria-label={`Reinspection reading for ${check.code}`}
                      value={state.measuredValue || ''}
                      onChange={(event) => setCheckResults((current) => ({ ...current, [check.code]: { ...current[check.code], isPassed: true, measuredValue: event.target.value } }))}
                      placeholder={check.unit ? `Reading (${check.unit})` : 'Reading'}
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    aria-label={`Attach reinspection evidence for ${check.code}`}
                    disabled={uploadingEvidence[check.code]}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setUploadingEvidence((current) => ({ ...current, [check.code]: true }));
                      setFormError(null);
                      try {
                        const document = await uploadInspectionEvidence(inspection.id, file);
                        setCheckResults((current) => ({ ...current, [check.code]: { ...current[check.code], isPassed: true, evidenceDocumentId: document.id, evidenceFileName: document.fileName } }));
                      } catch (err: any) {
                        setFormError(err.message || `Failed to upload evidence for ${check.code}`);
                      } finally {
                        setUploadingEvidence((current) => ({ ...current, [check.code]: false }));
                        event.target.value = '';
                      }
                    }}
                  />
                  {state.evidenceFileName && <span className="text-xs text-success">{state.evidenceFileName}</span>}
                </div>
              );
            })}
            <div className="dialog-actions">
              <Button onClick={() => setShowReinspectModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={recordReinspectionMutation.isPending}
              >
                {recordReinspectionMutation.isPending
                  ? "Recording..."
                  : "Accept to Finished Goods"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
